import { AuthError } from '../auth/errors.js';

export const options = { isolationLevel: 'ReadCommitted', maxWait: 20000, timeout: 20000 };
export const clock = async tx => (await tx.$queryRaw`SELECT clock_timestamp() AS now`)[0].now;
export const missing = () => new AuthError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy tài nguyên.');
const denied = () => new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
export const courtInclude = { facility: { include: { owner: { include: { user: true } } } } };
export async function actorCheck(tx, actor, now) {
  const session = await tx.authSession.findUnique({ where: { id: actor.id }, include: { user: true } });
  if (!session || session.user_id !== BigInt(actor.user.id) || session.revoked_at || session.expires_at <= now || session.user.status !== 'ACTIVE') throw denied();
  if (session.user.role !== 'CUSTOMER') throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
}
export async function lockCourt(tx, actor, initial) {
  const ids = [...new Set([BigInt(actor.user.id), initial.facility.owner_id])].sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
  for (const id of ids) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${initial.facility_id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM courts WHERE id = ${initial.id} FOR UPDATE`;
  const court = await tx.court.findUnique({ where: { id: initial.id }, include: courtInclude });
  if (!court || court.facility_id !== initial.facility_id || court.facility.owner_id !== initial.facility.owner_id) throw missing();
  return court;
}
export async function expire(tx, bookings, now) {
  const ids = bookings.filter(b => b.status === 'PENDING_PAYMENT' && b.expires_at <= now).map(b => b.id);
  if (!ids.length) return;
  await tx.booking.updateMany({ where: { id: { in: ids }, status: 'PENDING_PAYMENT', expires_at: { lte: now } }, data: { status: 'EXPIRED', expired_at: now } });
  await tx.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: { in: ids } } } });
}
