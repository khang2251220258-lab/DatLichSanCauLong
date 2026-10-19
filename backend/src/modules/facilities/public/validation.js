import { AuthError, invalid } from '../../auth/errors.js';
import { supportedDistricts } from '../districts.js';
import { pagination } from '../../users/owner-requests/validation.js';
export { requestId } from '../../users/owner-requests/validation.js';

const deferred = ['amenity_ids', 'min_price', 'max_price', 'min_rating', 'sort'];
const allowed = ['q', 'district', 'page', 'page_size', 'date', 'start_time', 'end_time'];
const invalidDate = () => new AuthError(422, 'INVALID_DATE', 'Ngày tìm kiếm không hợp lệ.');
const invalidRange = () => new AuthError(422, 'INVALID_SEARCH_RANGE', 'Khoảng thời gian tìm kiếm không hợp lệ.');

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) throw invalidDate();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw invalidDate();
  return value;
}

function timeMinutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):(00|30)$/.test(value)) throw invalidRange();
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function listQuery(query) {
  for (const key of Object.keys(query)) {
    if (deferred.includes(key)) throw new AuthError(422, 'FILTER_NOT_CONFIGURED', 'Bộ lọc hoặc sắp xếp chưa được hỗ trợ.');
    if (!allowed.includes(key) || typeof query[key] !== 'string') throw invalid();
  }
  const result = pagination(Object.fromEntries(Object.entries(query).filter(([key]) => ['page', 'page_size'].includes(key))));
  if (query.q !== undefined) result.q = query.q.trim().normalize('NFC');
  if (query.district !== undefined) {
    result.district = query.district.trim().normalize('NFC');
    if (!supportedDistricts.includes(result.district)) throw new AuthError(422, 'INVALID_DISTRICT', 'Khu vực không được hỗ trợ.');
  }
  const intervalKeys = ['date', 'start_time', 'end_time'];
  const supplied = intervalKeys.filter(key => query[key] !== undefined);
  if (supplied.length && supplied.length !== intervalKeys.length) throw invalidRange();
  if (supplied.length) {
    const date = calendarDate(query.date);
    const start = timeMinutes(query.start_time), end = timeMinutes(query.end_time);
    const duration = end - start;
    if (duration < 30 || duration > 180 || duration % 30 !== 0) throw invalidRange();
    result.interval = { date, start_time: query.start_time, end_time: query.end_time };
  }
  return result;
}

export function noQuery(query) { if (Object.keys(query).length) throw invalid(); }
