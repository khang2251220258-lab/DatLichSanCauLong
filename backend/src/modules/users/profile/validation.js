import { invalid } from '../../auth/errors.js';

const allowed = new Set(['full_name', 'phone']);
const length = value => [...value].length;

export function profileUpdate(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw invalid();
  const keys = Object.keys(body);
  if (!keys.length || keys.some(key => !allowed.has(key))) throw invalid();
  const result = {};
  if (Object.hasOwn(body, 'full_name')) {
    if (typeof body.full_name !== 'string') throw invalid();
    const full_name = body.full_name.trim();
    if (!full_name || length(full_name) > 150) throw invalid();
    result.full_name = full_name;
  }
  if (Object.hasOwn(body, 'phone')) {
    if (body.phone !== null && typeof body.phone !== 'string') throw invalid();
    const phone = body.phone === null ? null : body.phone.trim();
    if (phone !== null && length(phone) > 30) throw invalid();
    result.phone = phone || null;
  }
  return result;
}
