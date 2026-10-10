import { Router } from 'express';
import { AuthError, invalid } from '../auth/errors.js';
import { authenticate, requireOrigin, requireCsrf } from '../auth/middleware.js';
import { emptyBody, ownerListQuery, rejectInput, requestId } from './owner-validation.js';

export function ownerPaymentRoutes(service, auth, config) {
  const router = Router();
  const guard = [authenticate(auth), (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.auth.user.capabilities.includes('OWNER')) throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    next();
  }];
  const noQuery = (req, _res, next) => { if (Object.keys(req.query).length) throw invalid(); next(); };
  const mutation = [...guard, noQuery, requireOrigin(config.frontendUrl), requireCsrf];

  router.get('/bookings', ...guard, async (req, res) => res.json(await service.list(req.auth, ownerListQuery(req.query))));
  router.get('/bookings/:booking_id', ...guard, noQuery, async (req, res) => res.json(await service.bookingDetail(req.auth, requestId(req.params.booking_id))));
  router.get('/payments/:proof_id', ...guard, noQuery, async (req, res) => res.json(await service.proofDetail(req.auth, requestId(req.params.proof_id))));
  router.post('/payments/:proof_id/confirm', ...mutation, async (req, res) => {
    emptyBody(req.body); res.json(await service.confirm(req.auth, requestId(req.params.proof_id)));
  });
  router.post('/payments/:proof_id/reject', ...mutation, async (req, res) => {
    res.json(await service.reject(req.auth, requestId(req.params.proof_id), rejectInput(req.body)));
  });
  return router;
}
