import { AuthError, invalid } from '../../auth/errors.js';
import { supportedDistricts } from '../districts.js';
import { pagination } from '../../users/owner-requests/validation.js';
export { requestId } from '../../users/owner-requests/validation.js';

const deferred = ['amenity_ids', 'min_price', 'max_price', 'min_rating', 'date', 'start_time', 'end_time', 'sort'];
export function listQuery(query) {
  for (const key of Object.keys(query)) {
    if (deferred.includes(key)) throw new AuthError(422, 'FILTER_NOT_CONFIGURED', 'Bộ lọc hoặc sắp xếp chưa được hỗ trợ.');
    if (!['q', 'district', 'page', 'page_size'].includes(key) || typeof query[key] !== 'string') throw invalid();
  }
  const result = pagination(Object.fromEntries(Object.entries(query).filter(([k]) => ['page', 'page_size'].includes(k))));
  if (query.q !== undefined) result.q = query.q.trim().normalize('NFC');
  if (query.district !== undefined) {
    result.district = query.district.trim().normalize('NFC');
    if (!supportedDistricts.includes(result.district)) throw new AuthError(422, 'INVALID_DISTRICT', 'Khu vực không được hỗ trợ.');
  }
  return result;
}
export function noQuery(query) { if (Object.keys(query).length) throw invalid(); }
