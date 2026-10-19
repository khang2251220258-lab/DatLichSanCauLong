import { AuthError, invalid } from '../../auth/errors.js';
import { supportedDistricts } from '../districts.js';
import { pagination } from '../../users/owner-requests/validation.js';
import { expandRecurrence } from './recurrence.js';

const allowed = new Set(['q', 'district', 'weekday', 'start_date', 'end_date', 'start_time', 'end_time', 'page', 'page_size']);
const required = ['weekday', 'start_date', 'end_date', 'start_time', 'end_time'];

export function recurringQuery(query) {
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.has(key) || typeof value !== 'string') throw invalid();
  }
  if (required.some(key => query[key] === undefined || query[key] === '')) throw new AuthError(422, 'INVALID_RECURRENCE', 'Thiếu thông tin lịch cố định.');
  if (!/^[1-7]$/.test(query.weekday)) throw new AuthError(422, 'INVALID_RECURRENCE', 'Lịch cố định không hợp lệ.');
  const result = pagination(Object.fromEntries(Object.entries(query).filter(([key]) => key === 'page' || key === 'page_size')));
  result.weekday = Number(query.weekday);
  result.start_date = query.start_date;
  result.end_date = query.end_date;
  result.start_time = query.start_time;
  result.end_time = query.end_time;
  result.occurrences = expandRecurrence(result);
  if (query.q !== undefined) result.q = query.q.trim().normalize('NFC');
  if (query.district !== undefined) {
    result.district = query.district.trim().normalize('NFC');
    if (!supportedDistricts.includes(result.district)) throw new AuthError(422, 'INVALID_DISTRICT', 'Khu vực không được hỗ trợ.');
  }
  return result;
}
