import { AuthError, invalid } from '../../auth/errors.js';
export function emptyBody(body) {
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) throw invalid();
}
export function requestId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw invalid();
  return BigInt(value);
}
export function rejection(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'rejection_reason')) throw invalid();
  if (typeof body.rejection_reason !== 'string' || !body.rejection_reason.trim()) throw new AuthError(422, 'REJECTION_REASON_REQUIRED', 'Vui lòng nhập lý do từ chối.');
  const reason = body.rejection_reason.trim();
  if ([...reason].length > 500) throw invalid();
  return reason;
}
export function pagination(query, admin = false) {
  const allowed = admin ? ['page', 'page_size', 'status'] : ['page', 'page_size'];
  if (Object.keys(query).some(k => !allowed.includes(k))) throw invalid();
  function number(value, fallback) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw invalid();
    return Number(value);
  }
  const page = number(query.page, 1), page_size = number(query.page_size, 20);
  if (page_size > 100 || !Number.isSafeInteger((page - 1) * page_size)) throw invalid();
  if (query.status !== undefined && !['PENDING', 'APPROVED', 'REJECTED'].includes(query.status)) throw invalid();
  return { page, page_size, ...(query.status ? { status: query.status } : {}) };
}
