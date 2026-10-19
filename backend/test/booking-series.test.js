import test from 'node:test';
import assert from 'node:assert/strict';
import { recurringBookingInput, seriesListQuery, seriesReference, seriesRejectInput } from '../src/modules/bookings/series-validation.js';
import { assertRefundInvariant } from '../src/modules/refunds/service.js';

const valid = { court_id: '12', weekday: 1, start_date: '2026-11-02', end_date: '2026-11-30', start_time: '18:00', end_time: '19:00' };

test('recurring create accepts only authoritative intent and re-expands occurrences', () => {
  const value = recurringBookingInput(valid);
  assert.equal(value.court_id, 12n);
  assert.equal(value.occurrences.length, 5);
  assert.equal(value.occurrences[0].start_at.toISOString(), '2026-11-02T11:00:00.000Z');
  assert.throws(() => recurringBookingInput({ ...valid, total_amount: '1' }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => recurringBookingInput({ ...valid, weekday: '1' }), error => error.code === 'VALIDATION_ERROR');
});

test('refund invariant accepts only legacy approved proof or confirmed recurring V2 evidence',()=>{
  const base={status:'PENDING',amount:{toString:()=> '30000'},proof_image_path:null,proof_mime_type:null,proof_size_bytes:null,proof_submitted_at:null,confirmed_at:null,refunded_at:null,
    booking:{status:'CANCELLED',deposit_amount:{toString:()=> '30000'},booking_flow_version:1,booking_series_id:null,paymentProof:{status:'APPROVED'},bookingSeries:null}};
  assert.doesNotThrow(()=>assertRefundInvariant(base));
  const at=new Date('2030-01-01T00:00:00Z'),uid=9n;
  const recurring={...base,booking:{...base.booking,booking_flow_version:2,booking_series_id:4n,paymentProof:null,confirmed_at:at,confirmed_by_user_id:uid,bookingSeries:{status:'CONFIRMED',confirmed_at:at,confirmed_by_user_id:uid}}};
  assert.doesNotThrow(()=>assertRefundInvariant(recurring));
  assert.throws(()=>assertRefundInvariant({...recurring,booking:{...recurring.booking,booking_series_id:null}}),error=>error.code==='INCONSISTENT_PAYMENT_STATE');
  assert.throws(()=>assertRefundInvariant({...base,booking:{...base.booking,paymentProof:null}}),error=>error.code==='INCONSISTENT_PAYMENT_STATE');
});

test('series list pagination/status and server-generated transfer reference are strict', () => {
  assert.deepEqual(seriesListQuery({}), { page: 1, page_size: 20 });
  assert.deepEqual(seriesListQuery({ page: '2', page_size: '100', status: 'CONFIRMED' }), { page: 2, page_size: 100, status: 'CONFIRMED' });
  assert.throws(() => seriesListQuery({ status: 'CANCELLED' }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => seriesListQuery({ sort: 'id' }), error => error.code === 'VALIDATION_ERROR');
  assert.equal(seriesReference(52n), 'CLDNS 52');
});

test('series rejection requires one trimmed rejection_reason of 1..500 Unicode characters', () => {
  assert.equal(seriesRejectInput({ rejection_reason: '  Lịch không phù hợp  ' }), 'Lịch không phù hợp');
  assert.throws(() => seriesRejectInput({ reason: 'Sai field' }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => seriesRejectInput({ rejection_reason: '   ' }), error => error.code === 'REJECTION_REASON_REQUIRED');
  assert.throws(() => seriesRejectInput({ rejection_reason: 'ạ'.repeat(501) }), error => error.code === 'VALIDATION_ERROR');
});
