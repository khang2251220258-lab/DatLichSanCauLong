import { AuthError } from '../auth/errors.js';

const options = { maxWait: 20000, timeout: 20000 };
const fields = { id: true, facility_id: true, name: true, description: true, status: true, created_at: true, updated_at: true };
const missing = () => new AuthError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy sân hoặc cơ sở.');
const present = row => ({ ...row, id: String(row.id), facility_id: String(row.facility_id) });
const now = async tx => (await tx.$queryRaw`SELECT clock_timestamp() AS now`)[0].now;

// Only the reviewed Court name constraint may become COURT_NAME_EXISTS.
export function isCourtNameConflict(error) {
  if (error.code !== 'P2002') return false;
  const target = error.meta?.target;
  if (error.meta?.modelName && error.meta.modelName !== 'Court') return false;
  const cause = error.meta?.driverAdapterError?.cause;
  if (cause?.kind === 'UniqueConstraintViolation' && cause.constraint?.index === 'courts_facility_id_name_key' &&
      (cause.table === undefined || cause.table === 'courts')) return true;
  return target === 'courts_facility_id_name_key' ||
    (Array.isArray(target) && target.length === 2 && target.includes('facility_id') && target.includes('name'));
}
async function checkActor(tx, actor) {
  const session = await tx.authSession.findUnique({ where: { id: actor.id }, include: { user: { include: { ownerProfile: true } } } });
  if (!session || session.user_id !== BigInt(actor.user.id) || session.revoked_at || session.expires_at <= await now(tx) || session.user.status !== 'ACTIVE')
    throw new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  if (session.user.role !== 'CUSTOMER' || !session.user.ownerProfile)
    throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
}
export function createCourtService(db) {
  async function mutate(actor, facilityId, courtId, input) {
    try {
      return await db.$transaction(async tx => {
        const ownerId = BigInt(actor.user.id);
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${facilityId} FOR UPDATE`;
        if (courtId !== undefined) await tx.$queryRaw`SELECT id FROM courts WHERE id = ${courtId} FOR UPDATE`;
        await checkActor(tx, actor);
        const facility = await tx.facility.findFirst({ where: { id: facilityId, owner_id: ownerId } });
        if (!facility) throw missing();
        if (courtId !== undefined && !await tx.court.findFirst({ where: { id: courtId, facility_id: facilityId } })) throw missing();
        if (facility.status === 'PENDING') throw new AuthError(409, 'FACILITY_STATE_NOT_EDITABLE', 'Không được thay đổi sân khi cơ sở đang chờ duyệt.');
        const row = courtId === undefined
          ? await tx.court.create({ data: { ...input, description: input.description ?? null, facility_id: facilityId, status: 'ACTIVE', created_at: await now(tx) }, select: fields })
          : await tx.court.update({ where: { id: courtId }, data: input, select: fields });
        return present(row);
      }, options);
    } catch (error) {
      if (isCourtNameConflict(error)) throw new AuthError(409, 'COURT_NAME_EXISTS', 'Tên sân đã tồn tại trong cơ sở.');
      throw error;
    }
  }
  return {
    async create(actor, facilityId, input) {
      if (!await db.facility.findFirst({ where: { id: facilityId, owner_id: BigInt(actor.user.id) }, select: { id: true } })) throw missing();
      return mutate(actor, facilityId, undefined, input);
    },
    async patch(actor, id, input) {
      const court = await db.court.findFirst({ where: { id, facility: { owner_id: BigInt(actor.user.id) } }, select: { facility_id: true } });
      if (!court) throw missing();
      return mutate(actor, court.facility_id, id, input);
    },
    async detail(actor, id) {
      const row = await db.court.findFirst({ where: { id, facility: { owner_id: BigInt(actor.user.id) } }, select: fields });
      if (!row) throw missing();
      return present(row);
    },
    async list(actor, facilityId, query) {
      return db.$transaction(async tx => {
        if (!await tx.facility.findFirst({ where: { id: facilityId, owner_id: BigInt(actor.user.id) }, select: { id: true } })) throw missing();
        const where = { facility_id: facilityId, ...(query.status ? { status: query.status } : {}) };
        const [rows, total] = await Promise.all([
          tx.court.findMany({ where, select: fields, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.page_size, take: query.page_size }),
          tx.court.count({ where }),
        ]);
        return { items: rows.map(present), total };
      }, { ...options, isolationLevel: 'RepeatableRead' });
    },
  };
}
