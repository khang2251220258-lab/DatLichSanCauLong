import { Router } from 'express';
import multer from 'multer';
import { AuthError, invalid } from '../../auth/errors.js';
import { authenticate, requireOrigin, requireCsrf } from '../../auth/middleware.js';
import { noQuery } from '../booking-configuration/validation.js';
import { requestId, idsInput, amenityInput, catalogQuery, imageInput, MAX_IMAGE_BYTES } from './validation.js';

const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 } }).single('image');
function upload(req, res, next) {
  parser(req, res, error => {
    if (error) return next(error.code === 'LIMIT_FILE_SIZE' ? new AuthError(413, 'PAYLOAD_TOO_LARGE', 'Ảnh vượt quá 5 MB.') : invalid());
    next();
  });
}
export function presentationRoutes(service, auth, config, admin = false) {
  const router = Router();
  const guard = [authenticate(auth), (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.auth.user.capabilities.includes(admin ? 'ADMIN' : 'OWNER')) throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    next();
  }];
  const noQueries = (req, _res, next) => { noQuery(req.query); next(); };
  const write = [...guard, noQueries, requireOrigin(config.frontendUrl), requireCsrf];
  const send = (res, status, data, meta = {}) => res.status(status).json({ data, meta: { server_time: new Date().toISOString(), ...meta } });
  if (admin) {
    router.get('/amenities', ...guard, async (req, res) => {
      const query = catalogQuery(req.query), result = await service.adminCatalog(query);
      send(res, 200, result.items, { ...query, total: result.total });
    });
    router.post('/amenities', ...write, async (req, res) => send(res, 201, await service.saveAmenity(req.auth, null, amenityInput(req.body))));
    router.patch('/amenities/:id', ...write, async (req, res) => send(res, 200, await service.saveAmenity(req.auth, requestId(req.params.id), amenityInput(req.body, true))));
    return router;
  }
  router.get('/amenities', ...guard, noQueries, async (_req, res) => send(res, 200, await service.ownerCatalog()));
  const base = '/facilities/:facility_id';
  router.get(`${base}/images`, ...guard, noQueries, async (req, res) => send(res, 200, await service.listImages(req.auth, requestId(req.params.facility_id))));
  router.post(`${base}/images`, ...write, upload, async (req, res) => send(res, 201, await service.upload(req.auth, requestId(req.params.facility_id), await imageInput(req.file, req.body))));
  router.put(`${base}/images/order`, ...write, async (req, res) => send(res, 200, await service.reorder(req.auth, requestId(req.params.facility_id), idsInput(req.body, 'image_ids'))));
  router.delete(`${base}/images/:image_id`, ...write, async (req, res) => {
    if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) throw invalid();
    await service.deleteImage(req.auth, requestId(req.params.facility_id), requestId(req.params.image_id)); res.status(204).end();
  });
  router.get(`${base}/amenities`, ...guard, noQueries, async (req, res) => send(res, 200, await service.readAmenities(req.auth, requestId(req.params.facility_id))));
  router.put(`${base}/amenities`, ...write, async (req, res) => send(res, 200, await service.replaceAmenities(req.auth, requestId(req.params.facility_id), idsInput(req.body, 'amenity_ids'))));
  return router;
}
