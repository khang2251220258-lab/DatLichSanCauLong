import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicFacilityService } from '../src/modules/facilities/public/service.js';
import { createAvailabilityService } from '../src/modules/courts/availability/service.js';
import { createOwnerPaymentService } from '../src/modules/payments/owner-service.js';

const time = value => new Date(`1970-01-01T${value}:00.000Z`);

test('Public list and detail each issue one application data query', async () => {
  let calls = 0;
  const tx = { $queryRaw: async () => { calls++; return [{ total: 0, items: [] }]; } };
  const db = { $transaction: callback => callback(tx) };
  const service = createPublicFacilityService(db, { url: value => value });
  await service.list({ page: 1, page_size: 20 });
  assert.equal(calls, 1);
  tx.$queryRaw = async () => { calls++; return [{ id: '1', name: 'A', district: 'D', address: 'X', phone: '0',
    description: null, opening_time: '06:00', closing_time: '22:00', latitude: null, longitude: null,
    images: [], amenities: [], courts: [], price_rules: [], cancellation_policy: null }]; };
  await service.detail(1n);
  assert.equal(calls, 2);
});

test('Availability keeps read-only boundary and uses one aggregate data query', async () => {
  let readonly = 0, reads = 0;
  const now = new Date('2030-01-01T00:00:00.000Z');
  const tx = {
    $executeRaw: async () => { readonly++; },
    $queryRaw: async () => { reads++; return [{ now, today: '2030-01-01', day_start: now,
      day_end: new Date('2030-01-02T00:00:00.000Z'), court_id: 1n, facility_id: 1n,
      opening_time: time('06:00'), closing_time: time('07:00'), rules: [], blocks: [], bookings: [], locked_bookings: [] }]; },
  };
  const db = { $transaction: callback => callback(tx) };
  const result = await createAvailabilityService(db).read(1n, '2030-01-01');
  assert.equal(readonly, 1); assert.equal(reads, 1); assert.equal(result.data.slots.length, 2);
});

test('Owner booking list uses one aggregate list query after clock and ownership check', async () => {
  const now = new Date('2030-01-01T00:00:00.000Z'); let raw = 0, auth = 0;
  const actor = { id: 7n, user: { id: '9' } };
  const session = { id: 7n, user_id: 9n, revoked_at: null, expires_at: new Date('2031-01-01T00:00:00Z'),
    user: { status: 'ACTIVE', role: 'CUSTOMER', ownerProfile: { user_id: 9n } } };
  const tx = { $queryRaw: async () => { raw++; return [{ total: 0, items: [] }]; } };
  const db = {
    $queryRaw: async () => [{ now }],
    authSession: { findUnique: async () => { auth++; return session; } },
    $transaction: callback => callback(tx),
  };
  const result = await createOwnerPaymentService(db, {}).list(actor, { page: 1, page_size: 20 });
  assert.equal(raw, 1); assert.equal(auth, 1); assert.equal(result.meta.total, 0);
});
