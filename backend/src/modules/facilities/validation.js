import { AuthError, invalid } from '../auth/errors.js';
import { supportedDistricts } from './districts.js';
export { emptyBody, requestId } from '../users/owner-requests/validation.js';
import { requestId } from '../users/owner-requests/validation.js';

export const statuses = Object.freeze(['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']);
const required = ['name', 'address', 'district', 'phone', 'opening_time', 'closing_time'];
const allowed = [...required, 'description'];
function object(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
}
function text(value, min, max) {
  if (typeof value !== 'string') throw invalid();
  const result = value.trim(), length = [...result].length;
  if (length < min || length > max) throw invalid();
  return result;
}
export function time(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value)) throw invalid();
  return value;
}
export function bodyInput(body, patch = false) {
  object(body);
  if (!Object.keys(body).length || Object.keys(body).some(k => !allowed.includes(k))) throw invalid();
  if (!patch && required.some(k => !(k in body))) throw invalid();
  const result = {};
  for (const [key, value] of Object.entries(body)) {
    if (key.endsWith('_time')) result[key] = time(value);
    else result[key] = text(value, key === 'description' ? 0 : 1, ({name:200,address:500,district:100,phone:30,description:2000})[key]);
  }
  if (result.phone !== undefined && (!/^\+?[0-9 ().-]+$/.test(result.phone) || !/[0-9]/.test(result.phone))) throw invalid();
  if (result.description === '') result.description = null;
  if (result.opening_time && result.closing_time && result.closing_time <= result.opening_time) throw invalid();
  return result;
}
export function validateCore(core, districts = supportedDistricts) {
  const input = bodyInput(Object.fromEntries(allowed.filter(k => core[k] !== undefined && !(k === 'description' && core[k] === null)).map(k => [k, core[k]])));
  if (!districts.length) throw new AuthError(503, 'DISTRICT_NOT_CONFIGURED', 'Danh sách khu vực hỗ trợ chưa được phê duyệt.');
  if (!districts.includes(input.district)) throw new AuthError(422, 'INVALID_DISTRICT', 'Khu vực không được hỗ trợ.');
  return {...input,...(core.description === null ? {description:null} : {})};
}
export function reasonInput(body) {
  object(body);
  if (Object.keys(body).some(k => k !== 'reason')) throw invalid();
  return text(body.reason, 1, 500);
}
export function listQuery(query, admin = false) {
  if (Object.keys(query).some(k => !['page','page_size','status',...(admin ? ['owner_id'] : [])].includes(k))) throw invalid();
  const number = (value, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw invalid();
    return Number(value);
  };
  const page = number(query.page,1), page_size = number(query.page_size,20);
  if (page_size > 100 || !Number.isSafeInteger((page-1)*page_size)) throw invalid();
  if (query.status !== undefined && !statuses.includes(query.status)) throw invalid();
  return {page,page_size,...(query.status ? {status:query.status} : {}),...(query.owner_id !== undefined ? {owner_id:requestId(query.owner_id)} : {})};
}
