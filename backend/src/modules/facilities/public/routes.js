import { Router } from 'express';
import { listQuery, noQuery, requestId } from './validation.js';

export function publicFacilityRoutes(service) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const send = (res, data, meta = {}) => res.json({ data, meta: { server_time: new Date().toISOString(), ...meta } });
  router.get('/', async (req, res) => {
    const query = listQuery(req.query), result = await service.list(query);
    send(res, result.items, { page: query.page, page_size: query.page_size, total: result.total });
  });
  router.get('/:facility_id', async (req, res) => {
    noQuery(req.query);
    send(res, await service.detail(requestId(req.params.facility_id)));
  });
  return router;
}
