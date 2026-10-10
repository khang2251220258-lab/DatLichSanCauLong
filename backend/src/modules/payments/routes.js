import { Router } from 'express';
import multer from 'multer';
import { AuthError, invalid } from '../auth/errors.js';
import { authenticate, requireOrigin, requireCsrf } from '../auth/middleware.js';
import { requestId } from '../bookings/rules.js';
import { proofInput, MAX_PROOF_BYTES } from './validation.js';

// Busboy signals the limit at equality. Permit one sentinel byte, then enforce <= in validation.
const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PROOF_BYTES + 1, files: 1, fields: 0, parts: 2 } }).single('image');
function upload(req, res, next) {
  parser(req, res, error => next(error ? (error.code === 'LIMIT_FILE_SIZE'
    ? new AuthError(413, 'PROOF_TOO_LARGE', 'Ảnh vượt quá 5 MB.') : invalid()) : undefined));
}
export function paymentRoutes(service, auth, config) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const customer = [authenticate(auth), (req, _res, next) => {
    if (!req.auth.user.capabilities.includes('CUSTOMER')) throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    next();
  }];
  router.get('/bookings/:booking_id/proof', ...customer, async (req, res) => {
    if (Object.keys(req.query).length) throw invalid();
    res.json(await service.detail(req.auth, requestId(req.params.booking_id)));
  });
  router.post('/bookings/:booking_id/proof', ...customer, requireOrigin(config.frontendUrl), requireCsrf, async (req, _res, next) => {
    if (Object.keys(req.query).length || !req.is('multipart/form-data')) throw invalid();
    req.bookingId = requestId(req.params.booking_id);
    await service.precheck(req.auth, req.bookingId);
    next();
  }, upload, async (req, res) => {
    const file = await proofInput(req.file, req.body);
    res.status(201).json(await service.submit(req.auth, req.bookingId, file));
  });
  return router;
}
