import { Router } from 'express';
import { AuthError, invalid } from '../auth/errors.js';
import { authenticate, requireOrigin, requireCsrf } from '../auth/middleware.js';
import { input, requestId, pagination, cancellationInput } from './rules.js';

export function bookingRoutes(service, auth, config) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(auth), (req, _res, next) => {
    if (!req.auth.user.capabilities.includes('CUSTOMER')) throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    next();
  });
  router.post('/', requireOrigin(config.frontendUrl), requireCsrf, async (req, res) => {
    if (Object.keys(req.query).length) throw invalid();
    res.status(201).json(await service.create(req.auth, input(req.body)));
  });
  router.get('/', async (req, res) => res.json(await service.list(req.auth, pagination(req.query))));
  router.post('/:id/cancel', requireOrigin(config.frontendUrl), requireCsrf, async (req, res) => {
    if (Object.keys(req.query).length) throw invalid();
    res.json(await service.cancel(req.auth, requestId(req.params.id), cancellationInput(req.body)));
  });
  router.get('/:id', async (req, res) => {
    if (Object.keys(req.query).length) throw invalid();
    res.json(await service.detail(req.auth, requestId(req.params.id)));
  });
  return router;
}
