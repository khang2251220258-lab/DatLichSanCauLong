import { Router } from 'express';

export function createHealthRoutes(db, { readinessTimeoutMs = 3000 } = {}) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ success: true, message: 'API is running' });
  });

  router.get('/ready', async (_req, res) => {
    let timeout;
    try {
      await Promise.race([
        db.$queryRaw`SELECT 1`,
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('READINESS_TIMEOUT')), readinessTimeoutMs); }),
      ]);
      res.json({ success: true, message: 'API is ready' });
    } catch {
      res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' } });
    } finally {
      clearTimeout(timeout);
    }
  });

  return router;
}
