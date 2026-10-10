import { AuthError } from '../auth/errors.js';

const invalid = () => new AuthError(422, 'INVALID_PRICE_RULE', 'Bảng giá không hợp lệ.');
const orderBy = [{ start_time: 'asc' }, { end_time: 'asc' }, { id: 'asc' }];
const select = { id: true, facility_id: true, start_time: true, end_time: true, hourly_rate: true, created_at: true, updated_at: true };
const time = value => value.toISOString().slice(11, 16);
const dbTime = value => new Date(`1970-01-01T${value}:00.000Z`);
export function validateRules(body, facility) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'rules') || !Array.isArray(body.rules) || body.rules.length > 48) throw invalid();
  const rules = body.rules.map(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || Object.keys(rule).some(k => !['start_time', 'end_time', 'hourly_rate'].includes(k))) throw invalid();
    for (const key of ['start_time', 'end_time']) if (typeof rule[key] !== 'string' || !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(rule[key])) throw invalid();
    if (rule.start_time >= rule.end_time || !Number.isSafeInteger(rule.hourly_rate) || rule.hourly_rate <= 0 || rule.hourly_rate > 999999999999) throw invalid();
    if (facility && (dbTime(rule.start_time) < facility.opening_time || dbTime(rule.end_time) > facility.closing_time)) throw invalid();
    return { start_time: rule.start_time, end_time: rule.end_time, hourly_rate: rule.hourly_rate };
  }).sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time));
  for (let i = 1; i < rules.length; i++) if (rules[i].start_time < rules[i - 1].end_time)
    throw new AuthError(422, 'PRICE_RULE_OVERLAP', 'Các khoảng giá không được chồng nhau.');
  return rules;
}
export async function listRules(db, facilityId) {
  const rows = await db.priceRule.findMany({ where: { facility_id: facilityId }, orderBy, select });
  return rows.map(row => ({ ...row, id: String(row.id), facility_id: String(row.facility_id), start_time: time(row.start_time), end_time: time(row.end_time), hourly_rate: row.hourly_rate.toString() }));
}
export async function replaceRules(tx, facility, body, createdAt) {
  const rules = validateRules(body, facility);
  await tx.priceRule.deleteMany({ where: { facility_id: facility.id } });
  if (rules.length) await tx.priceRule.createMany({ data: rules.map(rule => ({ facility_id: facility.id, start_time: dbTime(rule.start_time), end_time: dbTime(rule.end_time), hourly_rate: String(rule.hourly_rate), created_at: createdAt, updated_at: createdAt })) });
  return listRules(tx, facility.id);
}
