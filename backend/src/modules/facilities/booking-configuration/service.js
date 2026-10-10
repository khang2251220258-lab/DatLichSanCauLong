import { AuthError } from '../../auth/errors.js';
import { bankInput, policyInput } from './validation.js';
import { listRules, replaceRules } from '../../pricing/rules.js';
import { randomUUID } from 'node:crypto';

const options = { maxWait: 20000, timeout: 20000 };
const base = { id: true, facility_id: true, created_at: true, updated_at: true };
const policyFields = { ...base, cutoff_hours: true };
const bankFields = { ...base, bank_name: true, account_number: true, account_holder: true, qr_image_path: true };
const present = row => row ? { ...row, id: String(row.id), facility_id: String(row.facility_id) } : null;
const now = async tx => (await tx.$queryRaw`SELECT clock_timestamp() AS now`)[0].now;
const missing = () => new AuthError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy cơ sở.');
async function owned(db, actor, id) {
  const facility = await db.facility.findFirst({ where: { id, owner_id: BigInt(actor.user.id) } });
  if (!facility) throw missing();
  return facility;
}
async function checkActor(tx, actor) {
  const session = await tx.authSession.findUnique({ where: { id: actor.id }, include: { user: { include: { ownerProfile: true } } } });
  if (!session || session.user_id !== BigInt(actor.user.id) || session.revoked_at || session.expires_at <= await now(tx) || session.user.status !== 'ACTIVE')
    throw new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  if (session.user.role !== 'CUSTOMER' || !session.user.ownerProfile) throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
}
export function createBookingConfigurationService(db, qrStorage, logger = console) {
  function safeBank(row, time) {
    if (!row) return null;
    const expiresAt = row.qr_image_path ? new Date(time.getTime() + 300000) : null;
    return {
      bank_name: row.bank_name, account_number: row.account_number, account_holder: row.account_holder,
      has_qr_image: Boolean(row.qr_image_path),
      qr_image_url: row.qr_image_path ? qrStorage.privateUrl(row.qr_image_path, 'image/png', Math.floor(expiresAt.getTime() / 1000)) : null,
      qr_image_expires_at: expiresAt?.toISOString() ?? null,
      created_at: row.created_at, updated_at: row.updated_at,
    };
  }
  async function read(tx, id, kind) {
    if (kind === 'price-rules') return listRules(tx, id);
    return kind === 'cancellation-policy'
      ? present(await tx.cancellationPolicy.findUnique({ where: { facility_id: id }, select: policyFields }))
      : await tx.bankAccount.findUnique({ where: { facility_id: id }, select: bankFields });
  }
  async function lockedBank(actor, id, update) {
    return db.$transaction(async tx => {
      const ownerId = BigInt(actor.user.id);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${id} FOR UPDATE`;
      await checkActor(tx, actor);
      const facility = await owned(tx, actor, id);
      if (facility.status === 'PENDING') throw new AuthError(409, 'FACILITY_STATE_NOT_EDITABLE', 'Không được thay đổi cấu hình khi cơ sở đang chờ duyệt.');
      const bank = await tx.bankAccount.findUnique({ where: { facility_id: id }, select: bankFields });
      if (!bank) throw new AuthError(409, 'BANK_ACCOUNT_NOT_CONFIGURED', 'Vui lòng lưu thông tin ngân hàng trước khi cấu hình mã QR.');
      if (!update) return { bank, time: await now(tx) };
      const time = await now(tx);
      return { bank: await tx.bankAccount.update({ where: { facility_id: id }, data: { qr_image_path: update, updated_at: time }, select: bankFields }), time };
    }, options);
  }
  async function cleanupNew(publicId) {
    try {
      const [bankRefs, bookingRefs] = await Promise.all([
        db.bankAccount.count({ where: { qr_image_path: publicId } }),
        db.booking.count({ where: { qr_image_path_snapshot: publicId } }),
      ]);
      if (bankRefs || bookingRefs) return;
    } catch { try { logger.error({ event: 'BANK_QR_CLEANUP_REQUIRED', code: 'DB_REFERENCE_CHECK_FAILED', public_id: publicId }); } catch {} return; }
    try { await qrStorage.destroy(publicId); }
    catch (error) { try { logger.error({ event: 'BANK_QR_CLEANUP_REQUIRED', code: error?.code || 'STORAGE_ERROR', public_id: publicId }); } catch {} }
  }
  return {
    async get(actor, id, kind) {
      const result = await db.$transaction(async tx => {
        await owned(tx, actor, id); const time = await now(tx); return { row: await read(tx, id, kind), time };
      }, { ...options, isolationLevel: 'RepeatableRead' });
      return kind === 'bank-account' ? safeBank(result.row, result.time) : result.row;
    },
    async put(actor, id, kind, body) {
      await owned(db, actor, id);
      return db.$transaction(async tx => {
        const ownerId = BigInt(actor.user.id);
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${id} FOR UPDATE`;
        await checkActor(tx, actor);
        const facility = await owned(tx, actor, id);
        if (facility.status === 'PENDING') throw new AuthError(409, 'FACILITY_STATE_NOT_EDITABLE', 'Không được thay đổi cấu hình khi cơ sở đang chờ duyệt.');
        const createdAt = await now(tx);
        if (kind === 'price-rules') return replaceRules(tx, facility, body, createdAt);
        if (kind === 'cancellation-policy') {
          const input = policyInput(body);
          return present(await tx.cancellationPolicy.upsert({ where: { facility_id: id }, create: { ...input, facility_id: id, created_at: createdAt }, update: input, select: policyFields }));
        }
        const input = bankInput(body);
        return safeBank(await tx.bankAccount.upsert({ where: { facility_id: id }, create: { ...input, facility_id: id, created_at: createdAt }, update: input, select: bankFields }), createdAt);
      }, options);
    },
    async precheckQr(actor, id) { await lockedBank(actor, id); },
    async uploadQr(actor, id, image) {
      qrStorage.ready();
      const publicId = `bank-qr/${randomUUID()}`;
      try {
        await qrStorage.upload(image.buffer, publicId);
        const result = await lockedBank(actor, id, publicId);
        return safeBank(result.bank, result.time);
      } catch (error) { await cleanupNew(publicId); throw error; }
    },
    async deleteQr(actor, id) {
      const result = await db.$transaction(async tx => {
        const ownerId = BigInt(actor.user.id);
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${id} FOR UPDATE`;
        await checkActor(tx, actor);
        const facility = await owned(tx, actor, id);
        if (facility.status === 'PENDING') throw new AuthError(409, 'FACILITY_STATE_NOT_EDITABLE', 'Không được thay đổi cấu hình khi cơ sở đang chờ duyệt.');
        const bank = await tx.bankAccount.findUnique({ where: { facility_id: id }, select: bankFields });
        if (!bank) throw new AuthError(409, 'BANK_ACCOUNT_NOT_CONFIGURED', 'Chưa cấu hình tài khoản ngân hàng.');
        const time = await now(tx);
        return { bank: await tx.bankAccount.update({ where: { facility_id: id }, data: { qr_image_path: null, updated_at: time }, select: bankFields }), time };
      }, options);
      return safeBank(result.bank, result.time);
    },
  };
}
