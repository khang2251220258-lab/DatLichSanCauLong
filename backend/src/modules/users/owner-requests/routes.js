import { Router } from 'express';
import { AuthError } from '../../auth/errors.js';
import { authenticate, requireOrigin, requireCsrf } from '../../auth/middleware.js';
import { emptyBody, requestId, rejection, pagination } from './validation.js';
export function ownerRequestRoutes(service, auth, config, admin = false) {
  const router = Router();
  router.use(authenticate(auth), (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.auth.user.capabilities.includes(admin ? 'ADMIN' : 'CUSTOMER')) throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    next();
  });
  const send = (res, status, data, meta = {}) => res.status(status).json({ data, meta: { server_time: new Date().toISOString(), ...meta } });
  router.get('/', async (req, res) => {
    const query = pagination(req.query, admin), result = await service.list(req.auth, query, admin);
    send(res, 200, result.items, { page: query.page, page_size: query.page_size, total: result.total });
  });
  router.get('/:id', async (req, res) => send(res, 200, await service.detail(req.auth, requestId(req.params.id), admin)));
  if (!admin) router.post('/', requireOrigin(config.frontendUrl), requireCsrf, async (req, res) => {
    emptyBody(req.body); send(res, 201, await service.create(req.auth));
  });
  else {
    router.post('/:id/approve', requireOrigin(config.frontendUrl), requireCsrf, async (req, res) => {
      emptyBody(req.body); send(res, 200, await service.decide(req.auth, requestId(req.params.id), true));
    });
    router.post('/:id/reject', requireOrigin(config.frontendUrl), requireCsrf, async (req, res) => {
      const reason = rejection(req.body); send(res, 200, await service.decide(req.auth, requestId(req.params.id), false, reason));
    });
  }
  return router;
}
