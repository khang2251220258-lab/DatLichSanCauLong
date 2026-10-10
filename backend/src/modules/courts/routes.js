import { Router } from 'express';
import { AuthError } from '../auth/errors.js';
import { authenticate, requireOrigin, requireCsrf } from '../auth/middleware.js';
import { bodyInput, listQuery, requestId } from './validation.js';

export function courtRoutes(service, auth, config) {
  const router = Router();
  const guard = [authenticate(auth), (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.auth.user.capabilities.includes('OWNER')) throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    next();
  }];
  const write = [requireOrigin(config.frontendUrl), requireCsrf];
  const send = (res, status, data, meta = {}) => res.status(status).json({ data, meta: { server_time: new Date().toISOString(), ...meta } });
  router.get('/facilities/:facility_id/courts', ...guard, async (req, res) => {
    const query = listQuery(req.query), result = await service.list(req.auth, requestId(req.params.facility_id), query);
    send(res, 200, result.items, { page: query.page, page_size: query.page_size, total: result.total });
  });
  router.post('/facilities/:facility_id/courts', ...guard, ...write, async (req, res) =>
    send(res, 201, await service.create(req.auth, requestId(req.params.facility_id), bodyInput(req.body))));
  router.get('/courts/:court_id', ...guard, async (req, res) =>
    send(res, 200, await service.detail(req.auth, requestId(req.params.court_id))));
  router.patch('/courts/:court_id', ...guard, ...write, async (req, res) =>
    send(res, 200, await service.patch(req.auth, requestId(req.params.court_id), bodyInput(req.body, true))));
  return router;
}
