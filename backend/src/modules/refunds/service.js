import { randomUUID } from 'node:crypto';
import { AuthError } from '../auth/errors.js';
import { actorCheck, clock, missing, options } from '../bookings/transaction.js';
import { storageErrorCode } from '../facilities/presentation/storage.js';

const conflict = () => new AuthError(409, 'INVALID_REFUND_STATE', 'Trạng thái hoàn cọc không cho phép thao tác này.');
const forbidden = () => new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
const expired = () => new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
const refundInclude = { booking: { include: {
  customer: { select: { id: true, full_name: true, phone: true } },
  paymentProof: { select: { id: true, status: true } },
  court: { select: { id: true, name: true, facility: { select: { id: true, name: true, owner_id: true } } } },
} } };

async function checkOwner(tx, actor, now) {
  const session = await tx.authSession.findUnique({ where: { id: actor.id }, include: { user: { include: { ownerProfile: true } } } });
  if (!session || session.user_id !== BigInt(actor.user.id) || session.revoked_at || session.expires_at <= now || session.user.status !== 'ACTIVE') throw expired();
  if (session.user.role !== 'CUSTOMER' || !session.user.ownerProfile) throw forbidden();
}
const ownerWhere = actor => ({ booking: { court: { facility: { owner_id: BigInt(actor.user.id) } } } });
const customerWhere = actor => ({ booking: { customer_id: BigInt(actor.user.id) } });
const summary = row => ({ id: String(row.id), booking_id: String(row.booking_id), amount: row.amount.toString(), status: row.status,
  reason: row.reason, requested_at: row.requested_at, proof_submitted_at: row.proof_submitted_at,
  confirmed_at: row.confirmed_at, refunded_at: row.refunded_at });
function assertInvariant(row) {
  const base = row.booking.status === 'CANCELLED' && row.booking.paymentProof?.status === 'APPROVED'
    && row.amount.toString() === row.booking.deposit_amount.toString();
  const noProof = !row.proof_image_path && !row.proof_mime_type && row.proof_size_bytes == null && !row.proof_submitted_at;
  const hasProof = Boolean(row.proof_image_path && row.proof_mime_type && row.proof_size_bytes != null && row.proof_submitted_at);
  const state = row.status === 'PENDING' ? noProof && !row.confirmed_at && !row.refunded_at
    : row.status === 'PROOF_SUBMITTED' ? hasProof && !row.confirmed_at && !row.refunded_at
      : row.status === 'REFUNDED' && hasProof && row.confirmed_at && row.refunded_at
        && row.confirmed_at.getTime() === row.refunded_at.getTime();
  if (!base || !state) throw new AuthError(409, 'INCONSISTENT_PAYMENT_STATE', 'Dữ liệu hoàn cọc không nhất quán.');
}

export const refundSummarySelect = { id: true, booking_id: true, amount: true, status: true, reason: true,
  requested_at: true, proof_submitted_at: true, confirmed_at: true, refunded_at: true };
export const refundSummary = summary;

export function createRefundService(db, storage, logger = console) {
  function log(code, publicId) { try { logger.error({ event: 'REFUND_PROOF_CLEANUP_REQUIRED', code, public_id: publicId }); } catch { /* keep original */ } }
  async function initial(actor, refundId, owner) {
    const row = await db.refund.findFirst({ where: { id: refundId, ...(owner ? ownerWhere(actor) : customerWhere(actor)) }, include: refundInclude });
    if (!row) throw missing();
    return row;
  }
  async function lock(tx, actor, initialRow, owner) {
    const ids = [...new Set([BigInt(actor.user.id), initialRow.booking.customer_id, initialRow.booking.court.facility.owner_id])].sort((a,b)=>a<b?-1:a>b?1:0);
    for (const id of ids) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${initialRow.booking.court.facility.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM courts WHERE id = ${initialRow.booking.court_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${initialRow.booking_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM payment_proofs WHERE booking_id = ${initialRow.booking_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${initialRow.id} FOR UPDATE`;
    const now = await clock(tx);
    if (owner) await checkOwner(tx, actor, now); else await actorCheck(tx, actor, now);
    const row = await tx.refund.findFirst({ where: { id: initialRow.id, ...(owner ? ownerWhere(actor) : customerWhere(actor)) }, include: refundInclude });
    if (!row || row.booking_id !== initialRow.booking_id || row.booking.court_id !== initialRow.booking.court_id) throw missing();
    assertInvariant(row);
    return { row, now };
  }
  async function detail(actor, refundId, owner) {
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const now = await clock(tx);
      if (owner) await checkOwner(tx, actor, now); else await actorCheck(tx, actor, now);
      const row = await tx.refund.findFirst({ where: { id: refundId, ...(owner ? ownerWhere(actor) : customerWhere(actor)) }, include: refundInclude });
      if (!row) throw missing();
      assertInvariant(row);
      return { row, now };
    }, { ...options, isolationLevel: 'RepeatableRead' });
    const data = summary(result.row);
    if (result.row.status === 'PENDING') return { data: { ...data, proof_image_url: null, proof_image_expires_at: null }, meta: { server_time: result.now.toISOString() } };
    storage.ready();
    const expires = new Date(result.now.getTime() + 300000);
    return { data: { ...data,
      proof_image_url: storage.privateUrl(result.row.proof_image_path, result.row.proof_mime_type, Math.floor(expires.getTime()/1000)),
      proof_image_expires_at: expires.toISOString(),
    }, meta: { server_time: result.now.toISOString() } };
  }
  async function cleanup(publicId, actor, initialRow) {
    try {
      const referenced = await db.$transaction(async tx => {
        const ids = [...new Set([BigInt(actor.user.id), initialRow.booking.customer_id, initialRow.booking.court.facility.owner_id])].sort((a,b)=>a<b?-1:a>b?1:0);
        for (const id of ids) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${initialRow.booking.court.facility.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM courts WHERE id = ${initialRow.booking.court_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${initialRow.booking_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM payment_proofs WHERE booking_id = ${initialRow.booking_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${initialRow.id} FOR UPDATE`;
        return tx.refund.count({ where: { proof_image_path: publicId } });
      }, options);
      if (referenced) return;
    } catch { log('DB_COMMIT_OUTCOME_UNKNOWN', publicId); return; }
    try { await storage.destroy(publicId); } catch (error) { log(storageErrorCode(error), publicId); }
  }
  async function precheckOwner(actor, refundId) {
    const row = await initial(actor, refundId, true);
    const checked = await db.$transaction(async tx => {
      const value = await lock(tx, actor, row, true);
      if (value.row.status !== 'PENDING' || value.row.proof_image_path) throw conflict();
      return value.row;
    }, options);
    return checked;
  }
  return {
    ownerDetail: (actor,id) => detail(actor,id,true),
    customerDetail: (actor,id) => detail(actor,id,false),
    precheckOwner,
    async submit(actor, refundId, file) {
      const preflight = await precheckOwner(actor, refundId);
      storage.ready();
      const publicId = `refund-proofs/${randomUUID()}`;
      try {
        await storage.upload(file.buffer, publicId);
        return await db.$transaction(async tx => {
          const { row, now } = await lock(tx, actor, preflight, true);
          if (row.status !== 'PENDING' || row.proof_image_path) throw conflict();
          const updated = await tx.refund.update({ where: { id: row.id }, data: { status: 'PROOF_SUBMITTED', proof_image_path: publicId,
            proof_mime_type: file.mime_type, proof_size_bytes: file.size_bytes, proof_submitted_at: now, updated_at: now } });
          return { data: summary(updated), meta: { server_time: now.toISOString() } };
        }, options);
      } catch (error) { await cleanup(publicId, actor, preflight); throw error; }
    },
    async confirm(actor, refundId) {
      const row = await initial(actor, refundId, false);
      return db.$transaction(async tx => {
        const { row: current, now } = await lock(tx, actor, row, false);
        if (current.status !== 'PROOF_SUBMITTED' || !current.proof_image_path || !current.proof_submitted_at) throw conflict();
        const updated = await tx.refund.update({ where: { id: current.id }, data: { status: 'REFUNDED', confirmed_at: now, refunded_at: now, updated_at: now } });
        return { data: summary(updated), meta: { server_time: now.toISOString() } };
      }, options);
    },
  };
}
