import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { authConfig } from './config.js';
import { AuthError, invalid } from './errors.js';
import { validate, validatePasswordAction } from './validation.js';
import { authenticate, requireOrigin, requireCsrf } from './middleware.js';
import { createRateLimits } from './rate-limit.js';
export function authRoutes(service, config, limits = createRateLimits()) {
  const router = Router();
  const passwordTasks = new Set();
  // In-process work only, no token persistence. Exposed internally for deterministic tests/shutdown.
  router.passwordTasks = passwordTasks;
  const cookie = { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', path: '/' };
  const response = (res, status, data) => res.status(status).json({ data, meta: { server_time: new Date().toISOString() } });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/forgot-password', requireOrigin(config.frontendUrl), async (req, res) => {
    limits.check('forgot-ip', req.ip, authConfig.forgotIpLimit);
    const input = validatePasswordAction(req.body, 'forgot');
    limits.check('forgot-email', input.email, authConfig.forgotEmailLimit);
    service.assertEmailConfigured();
    res.once('finish', () => {
      const task = Promise.resolve().then(() => service.forgot(input))
        .then(deliver => deliver?.())
        .catch(() => console.error('AUTH_PASSWORD_RESET_REQUEST_FAILED'))
        .finally(() => passwordTasks.delete(task));
      passwordTasks.add(task);
    });
    response(res, 202, { message: 'Nếu tài khoản đủ điều kiện, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email của bạn.' });
  });
  router.post('/reset-password', requireOrigin(config.frontendUrl), async (req, res) => {
    limits.check('reset-ip', req.ip, authConfig.resetIpLimit);
    await service.reset(validatePasswordAction(req.body, 'reset'));
    res.clearCookie(authConfig.cookieName, cookie);
    response(res, 200, { message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.' });
  });
  router.post('/change-password', requireOrigin(config.frontendUrl), authenticate(service), requireCsrf, async (req, res) => {
    await service.change(req.auth, validatePasswordAction(req.body, 'change'));
    res.clearCookie(authConfig.cookieName, cookie);
    response(res, 200, { message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' });
  });
  router.post('/register', requireOrigin(config.frontendUrl), async (req, res) => {
    limits.check('register', req.ip, authConfig.registerLimit);
    response(res, 201, { user: await service.register(validate(req.body, true)) });
  });
  router.post('/login', requireOrigin(config.frontendUrl), async (req, res) => {
    limits.check('login', req.ip, authConfig.loginLimit);
    const input = validate(req.body);
    const result = await limits.login(input.email, async () => {
      limits.check('failed', input.email, authConfig.failedLimit, false);
      try { return await service.login(input); }
      catch (error) { if (error.code === 'INVALID_CREDENTIALS' || error.code === 'ACCOUNT_LOCKED') limits.fail(input.email); throw error; }
    });
    res.cookie(authConfig.cookieName, result.token, { ...cookie, expires: result.expires_at });
    response(res, 200, { user: result.user, csrf_token: result.csrf_token });
  });
  router.get('/session', authenticate(service), (req, res) => response(res, 200, { user: req.auth.user, csrf_token: req.auth.csrf_token }));
  router.post('/logout', requireOrigin(config.frontendUrl), authenticate(service, true), requireCsrf, async (req, res) => {
    if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) throw invalid();
    await service.logout(req.auth);
    res.clearCookie(authConfig.cookieName, cookie).status(204).end();
  });
  return router;
}
export function apiError(error, _req, res, _next) {
  const known = error instanceof AuthError;
  const malformed = error.type === 'entity.parse.failed';
  const tooLarge = error.type === 'entity.too.large';
  const unavailable = ['P1001', 'P1002', 'P1017', 'P2024'].includes(error.code);
  const status = known ? error.status : malformed ? 422 : tooLarge ? 413 : unavailable ? 503 : 500;
  if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
  res.status(status).json({ error: { code: known ? error.code : malformed ? 'VALIDATION_ERROR' : tooLarge ? 'PAYLOAD_TOO_LARGE' : unavailable ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR', message: known ? error.message : 'Không thể xử lý yêu cầu.', details: {} }, meta: { server_time: new Date().toISOString(), request_id: randomUUID() } });
}
