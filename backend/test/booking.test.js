import test from 'node:test';
import assert from 'node:assert/strict';
import { input, priceSlots, validateTime, pagination, cancellationInput, confirmedCancellationError } from '../src/modules/bookings/rules.js';
import { isSlotConflict } from '../src/modules/bookings/service.js';
const body = { court_id: '1', start_at: '2030-01-01T02:00:00Z', end_at: '2030-01-01T03:00:00Z' };
const time = s => new Date(`1970-01-01T${s}:00Z`);
const rule = (rate, start='06:00', end='22:00') => ({ start_time:time(start), end_time:time(end), hourly_rate:rate });
const code = (fn, expected) => assert.throws(fn, e => e.code === expected);
test('Booking strict shape, UTC, actual dates, alignment, duration and local day', () => {
  assert.equal(input(body).court_id,1n);
  for (const extra of ['customer_id','status','price','deposit','remaining','expires_at','snapshots','slots']) code(()=>input({...body,[extra]:1}),'VALIDATION_ERROR');
  for (const value of [null, 123, [], {}]) code(()=>input({...body,start_at:value}),'VALIDATION_ERROR');
  for (const start_at of ['2030-02-30T02:00:00Z','2030-01-01T02:00:00+00:00','2030-01-01T02:00:01Z','2030-01-01T02:15:00Z','2030-01-01T02:00:00.001Z']) code(()=>input({...body,start_at}),'INVALID_TIME_RANGE');
  code(()=>input({...body,end_at:body.start_at}),'INVALID_TIME_RANGE');
  code(()=>input({...body,end_at:'2030-01-01T05:30:00Z'}),'BOOKING_TOO_LONG');
  code(()=>input({...body,start_at:'2030-01-01T16:30:00Z',end_at:'2030-01-01T17:00:00Z'}),'INVALID_TIME_RANGE');
  assert.equal(priceSlots(input({...body,end_at:'2030-01-01T05:00:00Z'}),[rule('80001')]).slots.length,6);
});
test('Exact half VND, price boundaries, half-up total/deposit, missing/overlap and overflow', () => {
  let p=priceSlots(input(body),[rule('80001')]);
  assert.equal(p.total_amount,'80001'); assert.equal(p.deposit_amount,'24000'); assert.equal(p.remaining_amount,'56001');
  assert.equal(p.slots[0].slot_amount,'40000.5');
  p=priceSlots(input({...body,end_at:'2030-01-01T02:30:00Z'}),[rule('80001')]);
  assert.equal(p.total_amount,'40001'); assert.equal(p.remaining_amount,'28001');
  p=priceSlots(input(body),[rule('80000','09:00','09:30'),rule('120000','09:30','10:00')]);
  assert.equal(p.total_amount,'100000'); assert.equal(p.deposit_amount,'30000');
  code(()=>priceSlots(input(body),[]),'PRICE_NOT_CONFIGURED');
  code(()=>priceSlots(input(body),[rule('2'),rule('4')]),'PRICE_NOT_CONFIGURED');
  code(()=>priceSlots(input({...body,end_at:'2030-01-01T05:00:00Z'}),[rule('999999999999')]),'BOOKING_AMOUNT_TOO_LARGE');
});
test('DB clock strict future, inclusive rolling30day boundary and opening hours', () => {
  const i=input(body), facility={opening_time:time('06:00'),closing_time:time('22:00')};
  code(()=>validateTime(i,facility,i.start_at),'BOOKING_IN_PAST');
  validateTime(i,facility,new Date(+i.start_at-30*86400000));
  code(()=>validateTime(i,facility,new Date(+i.start_at-30*86400000-1)),'BOOKING_TOO_FAR');
  code(()=>validateTime(i,{...facility,opening_time:time('09:30')},new Date(+i.start_at-1)),'INVALID_TIME_RANGE');
});
test('Pagination rejects unsupported inputs; only slot PK errors map to slot conflict', () => {
  assert.deepEqual(pagination({}),{page:1,page_size:20});
  for(const q of [{status:'EXPIRED'},{page:['1','2']},{page_size:'101'}]) code(()=>pagination(q),'VALIDATION_ERROR');
  assert.equal(isSlotConflict({code:'P2002',meta:{modelName:'CourtSlotLock',target:['court_id','start_at']}}),true);
  assert.equal(isSlotConflict({code:'P2002',meta:{modelName:'BookingSlot',target:['booking_id','start_at']}}),false);
});
test('Cancellation body accepts only an optional trimmed reason', () => {
  assert.equal(cancellationInput({}), null);
  assert.equal(cancellationInput({reason:'  Thay đổi kế hoạch  '}), 'Thay đổi kế hoạch');
  assert.equal(cancellationInput({reason:'   '}), null);
  for (const value of [null, [], {status:'CANCELLED'}, {reason:1}, {reason:'x'.repeat(501)}, {reason:'x',amount:1}])
    code(() => cancellationInput(value), 'VALIDATION_ERROR');
});
test('Confirmed cancellation cutoff is strict, supports zero, and rejects a missing snapshot', () => {
  const start_at = new Date('2026-10-10T10:00:00.000Z');
  assert.equal(confirmedCancellationError({ start_at, cancellation_cutoff_hours_snapshot: 2 }, new Date('2026-10-10T07:59:59.999Z')), null);
  assert.equal(confirmedCancellationError({ start_at, cancellation_cutoff_hours_snapshot: 2 }, new Date('2026-10-10T08:00:00.000Z')), 'CANCELLATION_DEADLINE_PASSED');
  assert.equal(confirmedCancellationError({ start_at, cancellation_cutoff_hours_snapshot: 2 }, new Date('2026-10-10T08:00:00.001Z')), 'CANCELLATION_DEADLINE_PASSED');
  assert.equal(confirmedCancellationError({ start_at, cancellation_cutoff_hours_snapshot: 0 }, new Date('2026-10-10T09:59:59.999Z')), null);
  assert.equal(confirmedCancellationError({ start_at, cancellation_cutoff_hours_snapshot: 0 }, start_at), 'CANCELLATION_DEADLINE_PASSED');
  assert.equal(confirmedCancellationError({ start_at, cancellation_cutoff_hours_snapshot: null }, new Date('2026-10-10T00:00:00.000Z')), 'CANCELLATION_POLICY_NOT_CONFIGURED');
});
