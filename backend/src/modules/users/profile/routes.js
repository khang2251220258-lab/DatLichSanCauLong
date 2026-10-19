import { Router } from 'express';
import { authenticate, requireCsrf, requireOrigin } from '../../auth/middleware.js';
import { profileUpdate } from './validation.js';

export function profileRoutes(service, auth, config) {
  const router = Router();
  const send = (res, data) => res.status(200).json({ data, meta: { server_time: new Date().toISOString() } });
  router.use(authenticate(auth), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', async (req, res) => send(res, await service.get(req.auth)));
  router.patch('/', requireOrigin(config.frontendUrl), requireCsrf, async (req, res) => send(res, await service.update(req.auth, profileUpdate(req.body))));
  return router;
}
