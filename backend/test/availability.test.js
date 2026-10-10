import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlots, dateQuery } from '../src/modules/courts/availability/slots.js';

const time = v => new Date(`1970-01-01T${v}:00Z`);
const start = new Date('2030-01-01T17:00:00Z'); // Local 2030-01-02 midnight.
const at = minutes => new Date(+start + minutes * 60000);
const base = () => ({ facility: { opening_time: time('00:00'), closing_time: time('02:00') }, dayStart: start, now: at(-1),
  rules: [{ start_time: time('00:00'), end_time: time('02:00'), hourly_rate: '80001' }], blocks: [], bookings: [] });
const booking = (status, expires_at = at(5), start_at = at(0), end_at = at(30)) => ({ status, expires_at, start_at, end_at });
test('Availability date rejects invalid calendar, past validation delegated to DB clock', () => {
  for (const date of [undefined, '', '2030-02-29', '2030-02-31', '0000-01-01', '2030-1-01', ' 2030-01-01', ['2030-01-01'], {}])
    assert.throws(() => dateQuery({ date }), { code: 'INVALID_DATE' });
  for (const date of ['2028-02-29', '2000-02-29', '9999-12-31']) assert.equal(dateQuery({ date }), date);
  assert.throws(() => dateQuery({ date: '2030-01-01', timezone: 'UTC' }), { code: 'VALIDATION_ERROR' });
});
test('Availability slots UTC boundaries, ascending, decimal half VND and gaps', () => {
  const input = base(), slots = buildSlots(input);
  assert.equal(slots.length, 4); assert.equal(slots[0].start_at, start.toISOString());
  assert.equal(slots[3].end_at, at(120).toISOString());
  assert.ok(slots.every(s => s.state === 'AVAILABLE' && s.slot_amount === '40000.5'));
  input.rules[0].end_time = time('00:30');
  assert.deepEqual(buildSlots(input).map(s => s.slot_amount), ['40000.5', null, null, null]);
  input.rules[0].hourly_rate = '999999999999'; assert.equal(buildSlots(input)[0].slot_amount, '499999999999.5');
});
test('Availability all occupancy states and exact expiry', () => {
  for (const [state, expected] of [['CONFIRMED','BOOKED'],['PENDING_CONFIRMATION','HELD'],['PENDING_PAYMENT','HELD'],['CANCELLED','AVAILABLE'],['REJECTED','AVAILABLE'],['EXPIRED','AVAILABLE'],['COMPLETED','AVAILABLE']]) {
    const input = base(); input.bookings = [booking(state)]; assert.equal(buildSlots(input)[0].state, expected);
  }
  for (const expiry of [at(-2), at(-1)]) {
    const input = base(); input.bookings = [booking('PENDING_PAYMENT', expiry)]; assert.equal(buildSlots(input)[0].state, 'AVAILABLE');
    input.bookings[0].status = 'PENDING_CONFIRMATION'; assert.equal(buildSlots(input)[0].state, 'HELD');
  }
});
test('Availability strict priority and half-open block overlap', () => {
  const input = base(); input.bookings = [booking('CONFIRMED'), booking('PENDING_CONFIRMATION')];
  input.blocks = [{ start_at: at(15), end_at: at(30) }];
  assert.equal(buildSlots(input)[0].state, 'BLOCKED'); assert.equal(buildSlots(input)[1].state, 'AVAILABLE');
  input.now = at(0); assert.equal(buildSlots(input)[0].state, 'PAST');
  input.now = at(-1); input.blocks = []; assert.equal(buildSlots(input)[0].state, 'BOOKED');
  input.bookings.shift(); input.rules = []; assert.equal(buildSlots(input)[0].state, 'HELD');
  assert.equal(buildSlots(input)[1].state, 'UNPRICED');
  input.now = at(300); assert.ok(buildSlots(input).every(s => s.state === 'PAST'));
});
test('Availability overlapping price fails whole response even for PAST; invalid hours', () => {
  const input = base(); input.rules.push({ ...input.rules[0] }); input.now = at(300);
  assert.throws(() => buildSlots(input), { status: 409, code: 'PRICE_NOT_CONFIGURED' });
  input.rules = []; input.facility.closing_time = time('00:00');
  assert.throws(() => buildSlots(input), { status: 409, code: 'FACILITY_NOT_CONFIGURED' });
  input.facility.closing_time = time('00:31'); assert.throws(() => buildSlots(input), { code: 'FACILITY_NOT_CONFIGURED' });
});
