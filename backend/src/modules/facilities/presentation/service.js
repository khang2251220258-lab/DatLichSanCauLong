import { randomUUID } from 'node:crypto';
import { AuthError, invalid } from '../../auth/errors.js';
import { MAX_IMAGES } from './validation.js';
import { storageErrorCode } from './storage.js';

const options = { maxWait: 20000, timeout: 20000 };
const now = async tx => (await tx.$queryRaw`SELECT clock_timestamp() AS now`)[0].now;
const missing = () => new AuthError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy tài nguyên.');
const forbidden = () => new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
const presentAmenity = r => ({ ...r, id: String(r.id) });
async function actorCheck(tx, actor, admin = false) {
  const session = await tx.authSession.findUnique({ where: { id: actor.id }, include: { user: { include: { ownerProfile: true } } } });
  if (!session || session.user_id !== BigInt(actor.user.id) || session.revoked_at || session.expires_at <= await now(tx) || session.user.status !== 'ACTIVE')
    throw new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  if (admin ? session.user.role !== 'ADMIN' : session.user.role !== 'CUSTOMER' || !session.user.ownerProfile) throw forbidden();
}
export function createPresentationService(db, storage, logger = console) {
  const image = r => ({ id: String(r.id), facility_id: String(r.facility_id), url: storage.url(r.image_path), sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at });
  const rows = (tx, id) => tx.facilityImage.findMany({ where: { facility_id: id }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
  async function owned(tx, actor, id) {
    const row = await tx.facility.findFirst({ where: { id, owner_id: BigInt(actor.user.id) } });
    if (!row) throw missing();
    return row;
  }
  async function mutate(actor, id, operation) {
    await owned(db, actor, id);
    return db.$transaction(async tx => {
      const userId = BigInt(actor.user.id);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${id} FOR UPDATE`;
      await actorCheck(tx, actor);
      const facility = await owned(tx, actor, id);
      if (facility.status === 'PENDING') throw new AuthError(409, 'FACILITY_STATE_NOT_EDITABLE', 'Không được sửa khi cơ sở đang chờ duyệt.');
      return operation(tx);
    }, options);
  }
  async function cleanup(publicId) {
    try { await storage.destroy(publicId); }
    catch (error) {
      // Cleanup must never replace the original DB error, even if the logger fails.
      try { logger.error({ code: storageErrorCode(error), public_id: publicId }); } catch { /* Best effort. */ }
    }
  }
  async function cleanupAfterDatabaseError(publicId) {
    // A connection loss during COMMIT may have an ambiguous outcome. Never destroy
    // an asset whose committed reference exists, or whose reference cannot be checked.
    try {
      if (!await db.facilityImage.count({ where: { image_path: publicId } })) await cleanup(publicId);
    } catch {
      try { logger.error({ code: 'DB_COMMIT_OUTCOME_UNKNOWN', public_id: publicId }); } catch { /* Preserve original error. */ }
    }
  }
  async function assigned(tx, id) {
    const links = await tx.facilityAmenity.findMany({ where: { facility_id: id }, include: { amenity: true }, orderBy: { amenity_id: 'asc' } });
    return links.map(r => presentAmenity(r.amenity));
  }
  return {
    async listImages(actor, id) { await owned(db, actor, id); return (await rows(db, id)).map(image); },
    async upload(actor, id, buffer) {
      // Preflight and final checks both serialize with submit/other mutations; network is between transactions.
      const check = async tx => { if (await tx.facilityImage.count({ where: { facility_id: id } }) >= MAX_IMAGES) throw new AuthError(422, 'IMAGE_LIMIT_REACHED', 'Tối đa 10 ảnh cho một cơ sở.'); };
      await mutate(actor, id, check);
      storage.ready();
      const publicId = `facility-images/${id}/${randomUUID()}`;
      try { await storage.upload(buffer, publicId); }
      catch (error) { await cleanup(publicId); throw error; } // Also best effort for uncertain provider timeout.
      let record;
      try {
        record = await mutate(actor, id, async tx => {
          await check(tx);
          return tx.facilityImage.create({ data: { facility_id: id, image_path: publicId, sort_order: await tx.facilityImage.count({ where: { facility_id: id } }), created_at: await now(tx) } });
        });
      } catch (error) { await cleanupAfterDatabaseError(publicId); throw error; }
      // Do not destroy a committed asset if response formatting fails.
      return image(record);
    },
    async deleteImage(actor, id, imageId) {
      const publicId = await mutate(actor, id, async tx => {
        const record = await tx.facilityImage.findFirst({ where: { id: imageId, facility_id: id } });
        if (!record) throw missing();
        storage.ready(); // Missing configuration must not silently delete the last pointer.
        await tx.facilityImage.delete({ where: { id: imageId } });
        const remaining = await rows(tx, id);
        for (let i = 0; i < remaining.length; i++) await tx.facilityImage.update({ where: { id: remaining[i].id }, data: { sort_order: i } });
        return record.image_path;
      });
      await cleanup(publicId);
    },
    async reorder(actor, id, ids) {
      const result = await mutate(actor, id, async tx => {
        const current = await rows(tx, id), ownIds = new Set(current.map(r => String(r.id)));
        for (const imageId of ids) if (!ownIds.has(String(imageId))) throw missing();
        if (ids.length !== current.length || new Set(ids.map(String)).size !== ids.length) throw invalid();
        for (let i = 0; i < ids.length; i++) await tx.facilityImage.update({ where: { id: ids[i] }, data: { sort_order: i } });
        return rows(tx, id);
      });
      return result.map(image);
    },
    async readAmenities(actor, id) { await owned(db, actor, id); return assigned(db, id); },
    replaceAmenities(actor, id, ids) {
      return mutate(actor, id, async tx => {
        if (new Set(ids.map(String)).size !== ids.length) throw invalid();
        for (const amenityId of [...ids].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)) {
          await tx.$queryRaw`SELECT id FROM amenities WHERE id = ${amenityId} FOR UPDATE`;
          const row = await tx.amenity.findUnique({ where: { id: amenityId } });
          if (!row?.is_active) throw invalid();
        }
        await tx.facilityAmenity.deleteMany({ where: { facility_id: id } });
        if (ids.length) await tx.facilityAmenity.createMany({ data: ids.map(amenity_id => ({ amenity_id, facility_id: id, created_at: new Date() })) });
        return assigned(tx, id);
      });
    },
    async ownerCatalog() { return (await db.amenity.findMany({ where: { is_active: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] })).map(presentAmenity); },
    async adminCatalog(query) {
      return db.$transaction(async tx => ({ items: (await tx.amenity.findMany({ orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.page_size, take: query.page_size })).map(presentAmenity), total: await tx.amenity.count() }), { ...options, isolationLevel: 'RepeatableRead' });
    },
    async saveAmenity(actor, id, input) {
      try {
        return await db.$transaction(async tx => {
          const userId = BigInt(actor.user.id);
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
          await actorCheck(tx, actor, true);
          if (id) {
            await tx.$queryRaw`SELECT id FROM amenities WHERE id = ${id} FOR UPDATE`;
            if (!await tx.amenity.findUnique({ where: { id } })) throw missing();
          }
          return presentAmenity(id ? await tx.amenity.update({ where: { id }, data: input }) : await tx.amenity.create({ data: { ...input, is_active: true, created_at: await now(tx) } }));
        }, options);
      } catch (error) {
        if (error.code === 'P2002') throw new AuthError(409, 'AMENITY_NAME_EXISTS', 'Tên tiện ích đã tồn tại.');
        throw error;
      }
    },
  };
}
