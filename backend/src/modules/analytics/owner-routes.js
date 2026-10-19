import { Router } from 'express';
import { AuthError } from '../auth/errors.js';
import { authenticate } from '../auth/middleware.js';
import { courtsQuery, overviewQuery } from './owner-validation.js';

export function ownerAnalyticsRoutes(service, auth) {
  const router = Router();
  const guard = [authenticate(auth), (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.auth.user.capabilities.includes('OWNER')) {
      throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    }
    next();
  }];

  router.get('/overview', ...guard, async (req, res) => {
    res.json(await service.overview(req.auth, overviewQuery(req.query)));
  });
  router.get('/courts', ...guard, async (req, res) => {
    res.json(await service.courts(req.auth, courtsQuery(req.query)));
  });
  return router;
}
