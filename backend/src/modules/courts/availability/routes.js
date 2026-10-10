import { Router } from 'express';
import { dateQuery, requestId } from './slots.js';
export function availabilityRoutes(service) {
  const router = Router();
  router.get('/:court_id/availability', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = requestId(req.params.court_id), date = dateQuery(req.query);
    res.json(await service.read(id, date));
  });
  return router;
}
