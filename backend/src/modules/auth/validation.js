import { invalid } from './errors.js';
export const normalizeEmail = value => value.trim().toLowerCase();
export function validatePassword(password) {
  if (typeof password !== 'string' || [...password].length < 8 || [...password].length > 128 || !/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) throw invalid();
  return password;
}
export function validatePasswordAction(body, action) {
  const fields = action === 'forgot' ? ['email'] : action === 'reset' ? ['token', 'new_password'] : ['current_password', 'new_password'];
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !fields.includes(k)) || fields.some(k => typeof body[k] !== 'string')) throw invalid();
  if (action === 'forgot') {
    const email = normalizeEmail(body.email);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid();
    return { email };
  }
  validatePassword(body.new_password);
  if (action === 'change' && (!body.current_password || [...body.current_password].length > 128)) throw invalid();
  return Object.fromEntries(fields.map(key => [key, body[key]]));
}
export function validate(body, registration = false) {
  const fields = registration ? ['email', 'password', 'full_name'] : ['email', 'password'];
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !fields.includes(k)) || fields.some(k => typeof body[k] !== 'string')) throw invalid();
  const email = normalizeEmail(body.email);
  const password = body.password;
  validatePassword(password);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid();
  const full_name = registration ? body.full_name.trim() : undefined;
  if (registration && (!full_name || [...full_name].length > 150)) throw invalid();
  return { email, password, ...(registration ? { full_name } : {}) };
}
