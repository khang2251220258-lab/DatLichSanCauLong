import { invalid } from '../auth/errors.js';
import { pagination } from '../users/owner-requests/validation.js';
export { requestId } from '../users/owner-requests/validation.js';

export const statuses = Object.freeze(['ACTIVE', 'INACTIVE']);
export function bodyInput(body, patch = false) {
  const allowed = patch ? ['name', 'description', 'status'] : ['name', 'description'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length ||
      Object.keys(body).some(key => !allowed.includes(key)) || (!patch && !Object.hasOwn(body, 'name'))) throw invalid();
  const result = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== 'string') throw invalid();
    if (key === 'status') {
      if (!statuses.includes(value)) throw invalid();
      result.status = value;
    } else {
      const text = key === 'name' ? value.trim().normalize('NFC') : value.trim();
      if ((key === 'name' && !text) || [...text].length > (key === 'name' ? 100 : 2000)) throw invalid();
      result[key] = key === 'description' && !text ? null : text;
    }
  }
  return result;
}
export function listQuery(query) {
  const { status, ...rest } = query;
  if (status !== undefined && !statuses.includes(status)) throw invalid();
  return { ...pagination(rest), ...(status !== undefined ? { status } : {}) };
}
