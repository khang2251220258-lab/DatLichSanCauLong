import { AuthError } from '../../auth/errors.js';
const fail = (status, code, message) => new AuthError(status, code, message);
const missing = () => fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy yêu cầu.');
const options = { maxWait: 20000, timeout: 20000 };
const fields = { id: true, user_id: true, status: true, applicant_name_snapshot: true, applicant_email_snapshot: true, applicant_phone_snapshot: true, reviewed_by: true, reviewed_at: true, rejection_reason: true, created_at: true, updated_at: true };
const present = row => ({ ...row, id: String(row.id), user_id: String(row.user_id), reviewed_by: row.reviewed_by === null ? null : String(row.reviewed_by) });
async function time(db) { return (await db.$queryRaw`SELECT clock_timestamp() AS now`)[0].now; }
async function verifyActor(db, actor, role) {
  const session = await db.authSession.findUnique({ where: { id: actor.id }, include: { user: true } });
  if (!session || session.user_id !== BigInt(actor.user.id) || session.revoked_at || session.expires_at <= await time(db) || session.user.status !== 'ACTIVE') throw fail(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  if (session.user.role !== role) throw fail(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
}
export function createOwnerRequestService(db) {
  return {
    async create(actor) {
      const userId = BigInt(actor.user.id);
      try {
        return await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
          await verifyActor(tx, actor, 'CUSTOMER');
          const user = await tx.user.findUnique({ where: { id: userId }, include: { ownerProfile: true } });
          if (user.ownerProfile) throw fail(409, 'ALREADY_OWNER', 'Bạn đã là chủ sân.');
          if (await tx.ownerRequest.findFirst({ where: { user_id: userId, status: 'PENDING' } })) throw fail(409, 'REQUEST_ALREADY_PENDING', 'Bạn đã có yêu cầu đang chờ duyệt.');
          return present(await tx.ownerRequest.create({ data: { user_id: userId, status: 'PENDING', applicant_name_snapshot: user.full_name, applicant_email_snapshot: user.email, applicant_phone_snapshot: user.phone, created_at: await time(tx) }, select: fields }));
        }, options);
      } catch (error) { if (error.code === 'P2002') throw fail(409, 'REQUEST_ALREADY_PENDING', 'Bạn đã có yêu cầu đang chờ duyệt.'); throw error; }
    },
    async list(actor, query, admin) {
      const where = { ...(admin ? {} : { user_id: BigInt(actor.user.id) }), ...(query.status ? { status: query.status } : {}) };
      const [items, total] = await db.$transaction(async tx => Promise.all([
        tx.ownerRequest.findMany({ where, select: fields, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.page_size, take: query.page_size }),
        tx.ownerRequest.count({ where }),
      ]), { ...options, isolationLevel: 'RepeatableRead' });
      return { items: items.map(present), total };
    },
    async detail(actor, id, admin) {
      const row = await db.ownerRequest.findFirst({ where: { id, ...(admin ? {} : { user_id: BigInt(actor.user.id) }) }, select: fields });
      if (!row) throw missing(); return present(row);
    },
    async decide(actor, id, approve, reason) {
      const target = await db.ownerRequest.findUnique({ where: { id }, select: { user_id: true } });
      if (!target) throw missing();
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${target.user_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM owner_requests WHERE id = ${id} FOR UPDATE`;
        await verifyActor(tx, actor, 'ADMIN');
        const request = await tx.ownerRequest.findUnique({ where: { id } });
        if (!request) throw missing();
        if (request.status !== 'PENDING') throw fail(409, 'INVALID_REQUEST_STATE', 'Yêu cầu đã được xử lý.');
        if (approve) {
          const applicant = await tx.user.findUnique({ where: { id: target.user_id }, include: { ownerProfile: true } });
          if (applicant.status !== 'ACTIVE') throw fail(403, 'ACCOUNT_LOCKED', 'Tài khoản người gửi đã bị khóa.');
          if (applicant.role !== 'CUSTOMER') throw fail(409, 'INVALID_REQUEST_STATE', 'Người gửi không còn đủ điều kiện.');
          if (applicant.ownerProfile) throw fail(409, 'ALREADY_OWNER', 'Người gửi đã là chủ sân.');
        }
        const reviewed_at = await time(tx);
        const updated = await tx.ownerRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', reviewed_by: BigInt(actor.user.id), reviewed_at, rejection_reason: approve ? null : reason }, select: fields });
        if (approve) {
          await tx.ownerProfile.create({ data: { user_id: target.user_id, approved_request_id: id, created_at: reviewed_at } });
          await tx.authSession.updateMany({ where: { user_id: target.user_id, revoked_at: null }, data: { revoked_at: reviewed_at } });
        }
        return { request: present(updated), ...(approve ? { user: { id: String(target.user_id), role: 'CUSTOMER', capabilities: ['CUSTOMER', 'OWNER'] } } : {}) };
      }, options);
    },
  };
}
