import { invalid } from '../auth/errors.js';
import { AuthError } from '../auth/errors.js';
import { requestId } from './rules.js';
import { expandRecurrence } from '../facilities/recurring/recurrence.js';
import { pagination } from '../users/owner-requests/validation.js';

export function recurringBookingInput(body) {
  const keys = ['court_id', 'weekday', 'start_date', 'end_date', 'start_time', 'end_time'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== keys.length || Object.keys(body).some(key => !keys.includes(key))) throw invalid();
  if (!Number.isInteger(body.weekday)) throw invalid();
  const value = { court_id: requestId(body.court_id), weekday: body.weekday, start_date: body.start_date,
    end_date: body.end_date, start_time: body.start_time, end_time: body.end_time };
  return { ...value, occurrences: expandRecurrence(value) };
}
export function seriesListQuery(query) {
  if (Object.keys(query).some(key => !['page', 'page_size', 'status'].includes(key))) throw invalid();
  const result = pagination(Object.fromEntries(Object.entries(query).filter(([key]) => key !== 'status')));
  if (query.status !== undefined) {
    if (!['PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'EXPIRED'].includes(query.status)) throw invalid();
    result.status = query.status;
  }
  return result;
}
export const seriesReference = id => `CLDNS ${String(id)}`;

export function seriesRejectInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'rejection_reason')) throw invalid();
  if (typeof body.rejection_reason !== 'string' || !body.rejection_reason.trim()) {
    throw new AuthError(422, 'REJECTION_REASON_REQUIRED', 'Vui lòng nhập lý do từ chối.');
  }
  const reason = body.rejection_reason.trim();
  if ([...reason].length > 500) throw invalid();
  return reason;
}
