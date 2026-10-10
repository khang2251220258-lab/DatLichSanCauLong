import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRules, replaceRules } from '../src/modules/pricing/rules.js';
import { bankInput, policyInput, noQuery } from '../src/modules/facilities/booking-configuration/validation.js';

const rule = { start_time: '06:00', end_time: '10:00', hourly_rate: 50000 };
const facility = { id: 1n, opening_time: new Date('1970-01-01T06:00:00Z'), closing_time: new Date('1970-01-01T22:00:00Z') };
test('Config price: empty, touching, sorting, numeric limits and time bounds', () => {
  assert.deepEqual(validateRules({ rules: [] }, facility), []);
  const touching = { ...rule, start_time: '10:00', end_time: '22:00', hourly_rate: 999999999999 };
  assert.deepEqual(validateRules({ rules: [touching, rule] }, facility), [rule, touching]);
  for (const hourly_rate of [0, -1, 1.2, NaN, Infinity, '50000', '50.000đ', 1000000000000, null]) assert.throws(() => validateRules({ rules: [{ ...rule, hourly_rate }] }, facility), { code: 'INVALID_PRICE_RULE' });
  for (const start_time of ['6:00', '06:15', '06:00:00', '06:00Z', '24:00', '2026-01-01T06:00', '05:30', '10:00', '22:30']) assert.throws(() => validateRules({ rules: [{ ...rule, start_time }] }, facility), { status: 422 });
  assert.throws(() => validateRules({ rules: [{ ...rule, end_time: '22:30' }] }, facility), { code: 'INVALID_PRICE_RULE' });
});
test('Config price: full allowlist, max count, overlap and exact duplicates', () => {
  for (const body of [null, [], {}, { rules: null }, { rules: {} }, { rules: [], extra: 1 }, { rules: Array(49).fill(rule) }, { rules: [null] }, { rules: [{}] }, { rules: [{ ...rule, id: '1' }] }]) assert.throws(() => validateRules(body, facility), { code: 'INVALID_PRICE_RULE' });
  for (const second of [rule, { ...rule, start_time: '08:00', end_time: '12:00' }, { ...rule, start_time: '06:30', end_time: '07:00' }]) assert.throws(() => validateRules({ rules: [rule, second] }, facility), { code: 'PRICE_RULE_OVERLAP' });
});
test('Config price: rejected full set cannot reach delete or insert', async () => {
  let wrote = false;
  const tx = { priceRule: { deleteMany() { wrote = true; }, createMany() { wrote = true; } } };
  await assert.rejects(replaceRules(tx, facility, { rules: [rule, rule] }, new Date()), { code: 'PRICE_RULE_OVERLAP' });
  assert.equal(wrote, false);
});
test('Config policy: strict integer 0..168 and exact body', () => {
  for (const cutoff_hours of [0, 24, 168]) assert.deepEqual(policyInput({ cutoff_hours }), { cutoff_hours });
  for (const cutoff_hours of [-1, 169, 1.5, '24', null, Infinity, NaN]) assert.throws(() => policyInput({ cutoff_hours }), { status: 422 });
  for (const body of [undefined, [], {}, { cutoff_hours: 24, id: '1' }]) assert.throws(() => policyInput(body), { status: 422 });
});
test('Config bank: trim preserves case/Unicode/leading zero; strict allowlist', () => {
  const bank = { bank_name: ' Ngân hàng Abc ', account_number: ' 00aB123 ', account_holder: ' Nguyễn Văn A ' };
  assert.deepEqual(bankInput(bank), { bank_name: 'Ngân hàng Abc', account_number: '00aB123', account_holder: 'Nguyễn Văn A' });
  for (const key of Object.keys(bank)) for (const value of [null, 1, ' ', 'x'.repeat(key === 'account_number' ? 51 : 151)]) assert.throws(() => bankInput({ ...bank, [key]: value }), { status: 422 });
  for (const account_number of ['ab 12', '12-34', '12.34', 'á123', '１２３', '123_']) assert.throws(() => bankInput({ ...bank, account_number }), { status: 422 });
  for (const key of ['id', 'facility_id', 'owner_id', 'qr_image_path', 'created_at']) assert.throws(() => bankInput({ ...bank, [key]: 'x' }), { status: 422 });
  assert.throws(() => bankInput({}), { status: 422 });
  noQuery({}); assert.throws(() => noQuery({ page: '1' }), { status: 422 });
});
