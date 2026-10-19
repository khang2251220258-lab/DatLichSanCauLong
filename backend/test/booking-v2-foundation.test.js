import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_FLOW_V1, BOOKING_FLOW_V2, bookingDomainConfig, bookingFlowVersion } from '../src/modules/bookings/config.js';
import { expire, isExpiredHold } from '../src/modules/bookings/transaction.js';
import { creationLifecycle } from '../src/modules/bookings/service.js';
import { transferReference } from '../src/modules/bookings/transfer-reference.js';

const now = new Date('2030-01-01T00:30:00.000Z');

test('Booking flow configuration is explicit and keeps the 30-minute confirmation hold centralized', () => {
  assert.equal(bookingDomainConfig.confirmationHoldMinutes, 30);
  assert.equal(bookingFlowVersion(undefined), BOOKING_FLOW_V1);
  assert.equal(bookingFlowVersion('2'), BOOKING_FLOW_V2);
  assert.throws(() => bookingFlowVersion('3'), /BOOKING_FLOW_VERSION/);
  assert.throws(() => bookingFlowVersion(undefined, { required: true }), /BOOKING_FLOW_VERSION_REQUIRED/);
  assert.equal(bookingFlowVersion('2', { required: true }), BOOKING_FLOW_V2);
});

test('V2 transfer reference is deterministic and contains only the authoritative Booking ID', () => {
  assert.equal(transferReference(1256n), 'CLDN 1256');
  assert.equal(transferReference('1256'), 'CLDN 1256');
});

test('creation lifecycle preserves V1 and creates V2 directly in confirmation with a 30-minute DB-time deadline', () => {
  assert.deepEqual(creationLifecycle(1, now), {
    status: 'PENDING_PAYMENT', expires_at: new Date('2030-01-01T00:35:00.000Z'), confirmation_expires_at: null,
  });
  assert.deepEqual(creationLifecycle(2, now), {
    status: 'PENDING_CONFIRMATION', expires_at: now, confirmation_expires_at: new Date('2030-01-01T01:00:00.000Z'),
  });
});

test('V1 and V2 hold expiry use separate authoritative deadlines with an exact inclusive boundary', () => {
  assert.equal(isExpiredHold({ booking_flow_version: 1, status: 'PENDING_PAYMENT', expires_at: now }, now), true);
  assert.equal(isExpiredHold({ booking_flow_version: 1, status: 'PENDING_CONFIRMATION', expires_at: new Date(0) }, now), false);
  assert.equal(isExpiredHold({ booking_flow_version: 2, status: 'PENDING_CONFIRMATION', confirmation_expires_at: now }, now), true);
  assert.equal(isExpiredHold({ booking_flow_version: 2, status: 'PENDING_CONFIRMATION', confirmation_expires_at: new Date(+now + 1) }, now), false);
  assert.equal(isExpiredHold({ booking_flow_version: 2, status: 'PENDING_PAYMENT', confirmation_expires_at: new Date(0) }, now), false);
});

test('lazy expiry transitions eligible V1/V2 holds and releases only their locks', async () => {
  const calls = [];
  const tx = {
    booking: { updateMany: async args => { calls.push(['booking', args]); return { count: 2 }; } },
    courtSlotLock: { deleteMany: async args => { calls.push(['locks', args]); return { count: 2 }; } },
  };
  await expire(tx, [
    { id: 11n, booking_flow_version: 1, status: 'PENDING_PAYMENT', expires_at: now },
    { id: 12n, booking_flow_version: 2, status: 'PENDING_CONFIRMATION', confirmation_expires_at: now },
    { id: 13n, booking_flow_version: 1, status: 'PENDING_CONFIRMATION', expires_at: new Date(0) },
  ], now);
  assert.deepEqual(calls[0][1].where.id.in, [11n, 12n]);
  assert.deepEqual(calls[0][1].data, { status: 'EXPIRED', expired_at: now });
  assert.deepEqual(calls[1][1].where.bookingSlot.booking_id.in, [11n, 12n]);
});
