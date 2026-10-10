import { Router } from 'express';
import multer from 'multer';
import { AuthError, invalid } from '../auth/errors.js';
import { authenticate, requireOrigin, requireCsrf } from '../auth/middleware.js';
import { requestId } from '../bookings/rules.js';
import { emptyBody } from '../payments/owner-validation.js';
import { MAX_PROOF_BYTES, proofInput } from '../payments/validation.js';

const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PROOF_BYTES + 1, files: 1, fields: 0, parts: 2 } }).single('image');
const upload = (req,res,next) => parser(req,res,error => next(error ? (error.code === 'LIMIT_FILE_SIZE'
  ? new AuthError(413,'PROOF_TOO_LARGE','Ảnh vượt quá 5 MB.') : invalid()) : undefined));
const noQuery = (req,_res,next) => { if (Object.keys(req.query).length) throw invalid(); next(); };

export function refundRoutes(service, auth, config, owner = false) {
  const router = Router();
  const guard = [authenticate(auth), (req,res,next) => {
    res.set('Cache-Control','no-store');
    const capability = owner ? 'OWNER' : 'CUSTOMER';
    if (!req.auth.user.capabilities.includes(capability)) throw new AuthError(403,'FORBIDDEN','Bạn không có quyền thực hiện thao tác này.');
    next();
  }];
  router.get('/:refund_id', ...guard, noQuery, async (req,res) => res.json(await (owner ? service.ownerDetail : service.customerDetail)(req.auth, requestId(req.params.refund_id))));
  if (owner) router.post('/:refund_id/proof', ...guard, noQuery, requireOrigin(config.frontendUrl), requireCsrf, async (req,_res,next) => {
    if (!req.is('multipart/form-data')) throw invalid();
    req.refundId=requestId(req.params.refund_id); await service.precheckOwner(req.auth,req.refundId); next();
  }, upload, async (req,res) => res.status(201).json(await service.submit(req.auth,req.refundId,await proofInput(req.file,req.body))));
  else router.post('/:refund_id/confirm', ...guard, noQuery, requireOrigin(config.frontendUrl), requireCsrf, async (req,res) => {
    emptyBody(req.body); res.json(await service.confirm(req.auth,requestId(req.params.refund_id)));
  });
  return router;
}
