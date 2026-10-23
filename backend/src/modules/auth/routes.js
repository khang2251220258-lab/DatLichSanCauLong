import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { authConfig } from './config.js';
import { AuthError, invalid } from './errors.js';
import { validate, validatePasswordAction } from './validation.js';
import { authenticate, requireOrigin, requireCsrf } from './middleware.js';
import { createRateLimits } from './rate-limit.js';
import { createGoogleOAuth, googleStateCookie, readCookie, verifyOAuthState } from './google.js';
export function authRoutes(service, config, limits = createRateLimits(), googleOAuth = createGoogleOAuth(config), logger = console) {
  const router = Router();
  const passwordTasks = new Set();
  const pendingGoogleStates = new Map();
  // In-process work only, no token persistence. Exposed internally for deterministic tests/shutdown.
  router.passwordTasks = passwordTasks;
  const cookie = { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', path: '/' };
  const oauthCookie = { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', path: '/api/v1/auth/google', maxAge: googleStateCookie.lifetimeMs };
  const response = (res, status, data) => res.status(status).json({ data, meta: { server_time: new Date().toISOString() } });
  const loginRedirect = (res, code) => {
    const target = new URL('/login', config.frontendUrl);
    target.searchParams.set('google', code);
    res.redirect(302, target.toString());
  };
  const clearOAuthState = res => res.clearCookie(googleStateCookie.name, oauthCookie);
  const stateKey = state => createHash('sha256').update(state).digest('base64url');
  const consumeGoogleState = state => {
    const key = stateKey(state);
    const expiresAt = pendingGoogleStates.get(key);
    pendingGoogleStates.delete(key);
    return typeof expiresAt === 'number' && expiresAt > Date.now();
  };
  const googleDiagnostic = (category, stage, details) => {
    // Deliberately bounded: never include provider parameters, cookies, identity, or exception details.
    const exception_type = ['GaxiosError', 'Error', 'FetchError', 'GoogleAuthError', 'GoogleCallbackDiagnosticError', 'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'PrismaClientInitializationError', 'PrismaClientRustPanicError', 'UnknownError'].includes(details?.exception_type) ? details.exception_type : undefined;
    const http_status = Number.isInteger(details?.http_status) && details.http_status >= 400 && details.http_status <= 599 ? details.http_status : undefined;
    const provider_error = ['invalid_grant', 'invalid_client', 'redirect_uri_mismatch', 'unauthorized_client', 'invalid_request', 'access_denied', 'temporarily_unavailable'].includes(details?.provider_error) ? details.provider_error : undefined;
    const prisma_error = typeof details?.prisma_error === 'string' && /^P\d{4}$/.test(details.prisma_error) ? details.prisma_error : undefined;
    const operation = ['transaction_open', 'subject_lookup', 'user_lock', 'locked_user_lookup', 'email_lookup', 'user_clock', 'user_insert', 'session_clock', 'session_insert', 'transaction_commit'].includes(details?.operation) ? details.operation : undefined;
    const operation_elapsed_ms = Number.isInteger(details?.operation_elapsed_ms) && details.operation_elapsed_ms >= 0 && details.operation_elapsed_ms <= 300000 ? details.operation_elapsed_ms : undefined;
    const transaction_elapsed_ms = Number.isInteger(details?.transaction_elapsed_ms) && details.transaction_elapsed_ms >= 0 && details.transaction_elapsed_ms <= 300000 ? details.transaction_elapsed_ms : undefined;
    logger?.warn?.({ event: 'GOOGLE_OAUTH_CALLBACK_FAILED', category, stage, ...(exception_type ? { exception_type } : {}), ...(http_status ? { http_status } : {}), ...(provider_error ? { provider_error } : {}), ...(prisma_error ? { prisma_error } : {}), ...(operation ? { operation } : {}), ...(operation_elapsed_ms !== undefined ? { operation_elapsed_ms } : {}), ...(transaction_elapsed_ms !== undefined ? { transaction_elapsed_ms } : {}) });
  };
  const googleFailure = (error, fallbackStage) => {
    const category = error?.code;
    const stages = {
      GOOGLE_CODE_EXCHANGE_FAILED: 'code_exchange',
      GOOGLE_ID_TOKEN_MISSING: 'id_token',
      GOOGLE_ID_TOKEN_VERIFICATION_FAILED: 'id_token',
      GOOGLE_IDENTITY_INVALID: 'identity',
      GOOGLE_EMAIL_NOT_VERIFIED: 'identity',
      GOOGLE_USER_RESOLUTION_FAILED: 'user_resolution',
      GOOGLE_USER_CREATION_FAILED: 'user_creation',
      GOOGLE_SESSION_CREATION_FAILED: 'session_creation',
      GOOGLE_USER_TRANSACTION_FAILED: 'user_transaction',
      GOOGLE_EMAIL_COLLISION: 'user_resolution',
      ACCOUNT_LOCKED: 'user_resolution',
    };
    if (!stages[category]) return { category: 'GOOGLE_CALLBACK_UNKNOWN_FAILED', stage: fallbackStage, details: error?.diagnostic };
    if (category === 'GOOGLE_EMAIL_COLLISION') return { category: 'GOOGLE_ACCOUNT_COLLISION', stage: stages[category] };
    if (category === 'ACCOUNT_LOCKED') return { category: 'GOOGLE_ACCOUNT_LOCKED', stage: stages[category] };
    return { category, stage: stages[category], details: error?.diagnostic };
  };
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
  router.get('/google', (req, res) => {
    if (!googleOAuth.enabled) throw new AuthError(503, 'GOOGLE_AUTH_NOT_CONFIGURED', 'Đăng nhập Google chưa được cấu hình.');
    limits.check('google-initiate', req.ip, authConfig.loginLimit);
    const state = googleOAuth.createState();
    const timestamp = Date.now();
    for (const [key, expiresAt] of pendingGoogleStates) if (expiresAt <= timestamp) pendingGoogleStates.delete(key);
    pendingGoogleStates.set(stateKey(state), timestamp + googleStateCookie.lifetimeMs);
    res.cookie(googleStateCookie.name, state, oauthCookie).redirect(302, googleOAuth.authorizationUrl(state));
  });
  router.get('/google/callback', async (req, res) => {
    if (!googleOAuth.enabled) return loginRedirect(clearOAuthState(res), 'google_failed');
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookieState = readCookie(req, googleStateCookie.name);
    if (!state) { googleDiagnostic('GOOGLE_STATE_MISSING', 'state'); return loginRedirect(clearOAuthState(res), 'google_failed'); }
    if (!cookieState) { googleDiagnostic('GOOGLE_STATE_COOKIE_MISSING', 'state'); return loginRedirect(clearOAuthState(res), 'google_failed'); }
    if (!verifyOAuthState(state, cookieState, config.googleOAuth.stateSecret)) { googleDiagnostic('GOOGLE_STATE_INVALID', 'state'); return loginRedirect(clearOAuthState(res), 'google_failed'); }
    if (!consumeGoogleState(state)) { googleDiagnostic('GOOGLE_STATE_REPLAY_OR_EXPIRED', 'state'); return loginRedirect(clearOAuthState(res), 'google_failed'); }
    clearOAuthState(res);
    if (typeof req.query.error === 'string') return loginRedirect(res, req.query.error === 'access_denied' ? 'google_cancelled' : 'google_failed');
    if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096) { googleDiagnostic('GOOGLE_CODE_MISSING', 'code'); return loginRedirect(res, 'google_failed'); }
    let callbackStage = 'code_exchange';
    try {
      const identity = await googleOAuth.exchangeAndVerify(req.query.code);
      callbackStage = 'user_resolution';
      const result = await service.googleLogin(identity);
      callbackStage = 'session_cookie';
      res.cookie(authConfig.cookieName, result.token, { ...cookie, expires: result.expires_at });
      callbackStage = 'final_redirect';
      return loginRedirect(res, 'success');
    } catch (error) {
      const diagnostic = googleFailure(error, callbackStage);
      googleDiagnostic(diagnostic.category, diagnostic.stage, diagnostic.details);
      const code = error?.code === 'GOOGLE_EMAIL_COLLISION' ? 'account_exists' : error?.code === 'ACCOUNT_LOCKED' ? 'account_inactive' : 'google_failed';
      return loginRedirect(res, code);
    }
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
