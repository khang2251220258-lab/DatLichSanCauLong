import { AuthError } from '../auth/errors.js';
import { Prisma } from '@prisma/client';
import { options, clock, missing } from '../bookings/transaction.js';

const forbidden = () => new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
const expired = () => new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
const conflict = code => new AuthError(409, code, code === 'INVALID_PROOF_STATE'
  ? 'Trạng thái minh chứng không cho phép thao tác này.' : 'Trạng thái booking không cho phép thao tác này.');

const ownerWhere = actor => ({ court: { facility: { owner_id: BigInt(actor.user.id) } } });
const bookingInclude = {
  customer: { select: { id: true, full_name: true, phone: true } },
  court: { select: { id: true, name: true, facility: { select: { id: true, name: true, owner_id: true } } } },
  slots: { select: { start_at: true, end_at: true, hourly_rate_snapshot: true, slot_amount: true }, orderBy: { start_at: 'asc' } },
  paymentProof: { select: { id: true, status: true, submitted_at: true, reviewed_at: true, rejection_reason: true } },
  refund: { select: { id: true, booking_id: true, amount: true, status: true, reason: true, requested_at: true,
    proof_submitted_at: true, confirmed_at: true, refunded_at: true } },
};
const proofInclude = {
  booking: { include: { customer: { select: { id: true, full_name: true, phone: true } },
    court: { select: { id: true, name: true, facility: { select: { id: true, name: true, owner_id: true } } } } } },
};
const id = value => String(value);
const money = value => value.toString();
const customerDto = row => ({ id: id(row.id), full_name: row.full_name, phone: row.phone });
const proofSummary = row => row ? ({ id: id(row.id), status: row.status, submitted_at: row.submitted_at,
  reviewed_at: row.reviewed_at, rejection_reason: row.rejection_reason }) : null;
const instant = value => value == null ? null : new Date(value);
const rawBookingDto = row => ({ ...row, start_at: instant(row.start_at), end_at: instant(row.end_at),
  created_at: instant(row.created_at), payment_proof: row.payment_proof ? {
    ...row.payment_proof, submitted_at: instant(row.payment_proof.submitted_at), reviewed_at: instant(row.payment_proof.reviewed_at),
  } : null });
function bookingDto(row, detail = false) {
  const value = {
    id: id(row.id), status: row.status, start_at: row.start_at, end_at: row.end_at,
    total_amount: money(row.total_amount), deposit_amount: money(row.deposit_amount), created_at: row.created_at,
    customer: customerDto(row.customer),
    facility: { id: id(row.court.facility.id), name: row.facility_name_snapshot },
    court: { id: id(row.court.id), name: row.court_name_snapshot },
    payment_proof: proofSummary(row.paymentProof),
    refund: row.refund ? { ...row.refund, id: id(row.refund.id), booking_id: id(row.refund.booking_id), amount: money(row.refund.amount) } : null,
  };
  if (detail) Object.assign(value, {
    remaining_amount: money(row.remaining_amount), confirmed_at: row.confirmed_at, rejected_at: row.rejected_at,
    rejection_reason: row.rejection_reason, cancelled_at: row.cancelled_at, cancelled_by: row.cancelled_by, cancellation_reason: row.cancellation_reason,
    slots: row.slots.map(slot => ({ start_at: slot.start_at, end_at: slot.end_at,
      hourly_rate_snapshot: money(slot.hourly_rate_snapshot), slot_amount: money(slot.slot_amount) })),
  });
  return value;
}
function proofDto(row, image) {
  return {
    id: id(row.id), status: row.status, submitted_at: row.submitted_at, reviewed_at: row.reviewed_at,
    rejection_reason: row.rejection_reason,
    ...(image || {}),
    booking: {
      id: id(row.booking.id), status: row.booking.status, start_at: row.booking.start_at, end_at: row.booking.end_at,
      total_amount: money(row.booking.total_amount), deposit_amount: money(row.booking.deposit_amount),
      remaining_amount: money(row.booking.remaining_amount),
    },
    customer: customerDto(row.booking.customer),
    facility: { id: id(row.booking.court.facility.id), name: row.booking.facility_name_snapshot },
    court: { id: id(row.booking.court.id), name: row.booking.court_name_snapshot },
  };
}
async function checkOwner(db, actor, now) {
  const session = await db.authSession.findUnique({ where: { id: actor.id }, include: { user: { include: { ownerProfile: true } } } });
  if (!session || session.user_id !== BigInt(actor.user.id) || session.revoked_at || session.expires_at <= now || session.user.status !== 'ACTIVE') throw expired();
  if (session.user.role !== 'CUSTOMER' || !session.user.ownerProfile) throw forbidden();
}

export function createOwnerPaymentService(db, storage) {
  async function initialProof(actor, proofId) {
    const row = await db.paymentProof.findFirst({ where: { id: proofId, booking: ownerWhere(actor) }, include: proofInclude });
    if (!row) throw missing();
    return row;
  }
  async function lockContext(tx, actor, initial) {
    const userIds = [...new Set([BigInt(actor.user.id), initial.booking.customer_id])].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    for (const userId of userIds) await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${initial.booking.court.facility.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM courts WHERE id = ${initial.booking.court_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${initial.booking_id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM payment_proofs WHERE id = ${initial.id} FOR UPDATE`;
    const now = await clock(tx);
    await checkOwner(tx, actor, now);
    const proof = await tx.paymentProof.findFirst({ where: { id: initial.id, booking_id: initial.booking_id, booking: ownerWhere(actor) }, include: proofInclude });
    if (!proof || proof.booking.court_id !== initial.booking.court_id || proof.booking.court.facility.id !== initial.booking.court.facility.id) throw missing();
    return { proof, now };
  }
  async function review(actor, proofId, action, reason) {
    const initial = await initialProof(actor, proofId);
    return db.$transaction(async tx => {
      const { proof, now } = await lockContext(tx, actor, initial);
      if (proof.booking.status !== 'PENDING_CONFIRMATION') throw conflict('INVALID_BOOKING_STATE');
      if (proof.status !== 'SUBMITTED') throw conflict('INVALID_PROOF_STATE');
      const status = action === 'confirm' ? 'APPROVED' : 'REJECTED';
      const updatedProof = await tx.paymentProof.update({ where: { id: proof.id }, data: {
        status, reviewed_by: BigInt(actor.user.id), reviewed_at: now,
        rejection_reason: action === 'reject' ? reason : null, updated_at: now,
      } });
      const updatedBooking = await tx.booking.update({ where: { id: proof.booking_id }, data: action === 'confirm'
        ? { status: 'CONFIRMED', confirmed_at: now, updated_at: now }
        : { status: 'REJECTED', rejected_at: now, rejection_reason: reason, updated_at: now } });
      if (action === 'reject') await tx.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: proof.booking_id } } });
      return { data: {
        proof: { id: id(updatedProof.id), status: updatedProof.status, reviewed_at: updatedProof.reviewed_at, rejection_reason: updatedProof.rejection_reason },
        booking: { id: id(updatedBooking.id), status: updatedBooking.status, confirmed_at: updatedBooking.confirmed_at,
          rejected_at: updatedBooking.rejected_at, rejection_reason: updatedBooking.rejection_reason },
      }, meta: { server_time: now.toISOString() } };
    }, options);
  }
  return {
    async list(actor, query) {
      const now = await clock(db); await checkOwner(db, actor, now);
      const status = query.status ? Prisma.sql`AND b.status = ${query.status}` : Prisma.empty;
      const offset = (query.page - 1) * query.page_size;
      const [result] = await db.$transaction(async tx => {
        const rows = await tx.$queryRaw`
          WITH owned AS MATERIALIZED (
            SELECT b.id, b.status, b.start_at, b.end_at, b.total_amount, b.deposit_amount, b.created_at,
              b.facility_name_snapshot, b.court_name_snapshot, b.customer_id, b.court_id, c.facility_id
            FROM bookings b JOIN courts c ON c.id = b.court_id JOIN facilities f ON f.id = c.facility_id
            WHERE f.owner_id = ${BigInt(actor.user.id)} ${status}
          ), page AS MATERIALIZED (
            SELECT * FROM owned ORDER BY created_at DESC, id DESC OFFSET ${offset} LIMIT ${query.page_size}
          )
          SELECT (SELECT count(*)::int FROM owned) AS total,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', p.id::text, 'status', p.status, 'start_at', p.start_at, 'end_at', p.end_at,
              'total_amount', p.total_amount::text, 'deposit_amount', p.deposit_amount::text, 'created_at', p.created_at,
              'customer', jsonb_build_object('id', customer.id::text, 'full_name', customer.full_name, 'phone', customer.phone),
              'facility', jsonb_build_object('id', p.facility_id::text, 'name', p.facility_name_snapshot),
              'court', jsonb_build_object('id', p.court_id::text, 'name', p.court_name_snapshot),
              'payment_proof', CASE WHEN proof.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', proof.id::text, 'status', proof.status, 'submitted_at', proof.submitted_at,
                'reviewed_at', proof.reviewed_at, 'rejection_reason', proof.rejection_reason) END
            ) ORDER BY p.created_at DESC, p.id DESC) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS items
          FROM (SELECT 1) seed LEFT JOIN page p ON true
          LEFT JOIN users customer ON customer.id = p.customer_id
          LEFT JOIN payment_proofs proof ON proof.booking_id = p.id`;
        return rows;
      }, options);
      return { data: result.items.map(rawBookingDto), meta: { server_time: now.toISOString(), page: query.page, page_size: query.page_size, total: result.total } };
    },
    async bookingDetail(actor, bookingId) {
      const now = await clock(db); await checkOwner(db, actor, now);
      const row = await db.booking.findFirst({ where: { id: bookingId, ...ownerWhere(actor) }, include: bookingInclude });
      if (!row) throw missing();
      return { data: bookingDto(row, true), meta: { server_time: now.toISOString() } };
    },
    async proofDetail(actor, proofId) {
      const now = await clock(db); await checkOwner(db, actor, now);
      const row = await initialProof(actor, proofId);
      storage.ready();
      const expiresAt = new Date(now.getTime() + 300000);
      const proof_image_url = storage.privateUrl(row.image_path, row.mime_type, Math.floor(expiresAt.getTime() / 1000));
      return { data: proofDto(row, { proof_image_url, proof_image_expires_at: expiresAt.toISOString() }), meta: { server_time: now.toISOString() } };
    },
    confirm: (actor, proofId) => review(actor, proofId, 'confirm'),
    reject: (actor, proofId, reason) => review(actor, proofId, 'reject', reason),
  };
}
