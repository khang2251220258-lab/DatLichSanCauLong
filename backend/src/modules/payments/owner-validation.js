import { AuthError, invalid } from '../auth/errors.js';
import { requestId } from '../bookings/rules.js';

export { requestId };

export const BOOKING_STATUSES = new Set([
  'PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'COMPLETED',
  'CANCELLED', 'REJECTED', 'EXPIRED',
]);

export function ownerListQuery(query) {
  if (Object.keys(query).some(key => !['page', 'page_size', 'status'].includes(key))) throw invalid();
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(value)) throw invalid();
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > max) throw invalid();
    return parsed;
  };
  const page = integer(query.page, 1, Number.MAX_SAFE_INTEGER);
  const page_size = integer(query.page_size, 20, 100);
  if (query.status !== undefined && !BOOKING_STATUSES.has(query.status)) throw invalid();
  return { page, page_size, ...(query.status ? { status: query.status } : {}) };
}

export function rejectInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'reason')) throw invalid();
  if (typeof body.reason !== 'string' || !body.reason.trim()) {
    throw new AuthError(422, 'REJECTION_REASON_REQUIRED', 'Vui lòng nhập lý do từ chối.');
  }
  const reason = body.reason.trim();
  if ([...reason].length > 500) throw invalid();
  return reason;
}

export function cancellationReasonInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'reason')) throw invalid();
  if (typeof body.reason !== 'string' || !body.reason.trim()) {
    throw new AuthError(422, 'CANCELLATION_REASON_REQUIRED', 'Vui lòng nhập lý do hủy đặt sân.');
  }
  const reason = body.reason.trim();
  if ([...reason].length > 500) throw invalid();
  return reason;
}

export function emptyBody(body) {
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) throw invalid();
}
