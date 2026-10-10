import { invalid } from '../../auth/errors.js';
export { requestId } from '../../users/owner-requests/validation.js';
function exact(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== keys.length || keys.some(key => !Object.hasOwn(body, key))) throw invalid();
}
export function policyInput(body) {
  exact(body, ['cutoff_hours']);
  if (!Number.isInteger(body.cutoff_hours) || body.cutoff_hours < 0 || body.cutoff_hours > 168) throw invalid();
  return { cutoff_hours: body.cutoff_hours };
}
export function bankInput(body) {
  exact(body, ['bank_name', 'account_number', 'account_holder']);
  const result = {};
  for (const key of ['bank_name', 'account_number', 'account_holder']) {
    if (typeof body[key] !== 'string') throw invalid();
    const value = body[key].trim();
    if (!value || [...value].length > (key === 'account_number' ? 50 : 150)) throw invalid();
    if (key === 'account_number' && !/^[A-Za-z0-9]+$/.test(value)) throw invalid();
    result[key] = value;
  }
  return result;
}
export function noQuery(query) { if (Object.keys(query).length) throw invalid(); }
