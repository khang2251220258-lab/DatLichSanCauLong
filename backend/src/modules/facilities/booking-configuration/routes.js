import { Router } from 'express';
import { AuthError } from '../../auth/errors.js';
import { authenticate, requireOrigin, requireCsrf } from '../../auth/middleware.js';
import { requestId, noQuery } from './validation.js';
import { qrInput, MAX_QR_BYTES } from './qr-validation.js';
import multer from 'multer';

const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_QR_BYTES + 1, files: 1, fields: 0, parts: 2 } }).single('image');
function upload(req, res, next) {
  parser(req, res, error => next(error ? (error.code === 'LIMIT_FILE_SIZE'
    ? new AuthError(413, 'PROOF_TOO_LARGE', 'Ảnh vượt quá 5 MB.') : new AuthError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.')) : undefined));
}

export function bookingConfigurationRoutes(service, auth, config) {
  const router = Router();
  const guard = [authenticate(auth), (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.auth.user.capabilities.includes('OWNER')) throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    noQuery(req.query); next();
  }];
  const send = (res, data) => {
    const serverTime = data?.qr_image_expires_at
      ? new Date(Date.parse(data.qr_image_expires_at) - 300000).toISOString()
      : new Date().toISOString();
    return res.status(200).json({ data, meta: { server_time: serverTime } });
  };
  for (const kind of ['price-rules', 'cancellation-policy', 'bank-account']) {
    router.get(`/:facility_id/${kind}`, ...guard, async (req, res) => send(res, await service.get(req.auth, requestId(req.params.facility_id), kind)));
    router.put(`/:facility_id/${kind}`, ...guard, requireOrigin(config.frontendUrl), requireCsrf, async (req, res) => send(res, await service.put(req.auth, requestId(req.params.facility_id), kind, req.body)));
  }
  router.post('/:facility_id/bank-account/qr', ...guard, requireOrigin(config.frontendUrl), requireCsrf, async (req, _res, next) => {
    if (!req.is('multipart/form-data')) throw new AuthError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
    req.facilityId = requestId(req.params.facility_id);
    await service.precheckQr(req.auth, req.facilityId);
    next();
  }, upload, async (req, res) => send(res, await service.uploadQr(req.auth, req.facilityId, await qrInput(req.file, req.body))));
  router.delete('/:facility_id/bank-account/qr', ...guard, requireOrigin(config.frontendUrl), requireCsrf, async (req, res) => send(res, await service.deleteQr(req.auth, requestId(req.params.facility_id))));
  return router;
}
