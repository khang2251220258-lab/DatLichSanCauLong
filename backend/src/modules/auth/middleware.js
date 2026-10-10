import { timingSafeEqual } from 'node:crypto';
import { authConfig } from './config.js';
import { AuthError } from './errors.js';
export function cookieToken(req) {
  const matches = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${authConfig.cookieName}=`));
  return matches.length === 1 ? matches[0].slice(authConfig.cookieName.length + 1) : null;
}
export function authenticate(service, optional = false) {
  return async (req, _res, next) => {
    req.auth = await service.session(cookieToken(req));
    if (!req.auth && !optional) throw new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    next();
  };
}
export function requireOrigin(origin) {
  return (req, _res, next) => {
    if (req.headers.origin !== origin) throw new AuthError(403, 'FORBIDDEN', 'Nguồn yêu cầu không được phép.');
    next();
  };
}
export function requireCsrf(req, _res, next) {
  if (req.auth) {
    const supplied = req.get('X-CSRF-Token') || '';
    if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(req.auth.csrf_token))) throw new AuthError(403, 'FORBIDDEN', 'CSRF token không hợp lệ.');
  }
  next();
}
