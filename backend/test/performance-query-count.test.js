import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicFacilityService } from '../src/modules/facilities/public/service.js';
import { createAvailabilityService } from '../src/modules/courts/availability/service.js';
import { createOwnerPaymentService } from '../src/modules/payments/owner-service.js';
import { createOwnerAnalyticsService } from '../src/modules/analytics/owner-service.js';

const time = value => new Date(`1970-01-01T${value}:00.000Z`);

test('Public list and detail each issue one application data query', async () => {
  let calls = 0;
  const db = { $queryRaw: async () => { calls++; return [{ total: 0, items: [] }]; } };
  const service = createPublicFacilityService(db, { url: value => value });
  await service.list({ page: 1, page_size: 20 });
  assert.equal(calls, 1);
  db.$queryRaw = async () => { calls++; return [{ id: '1', name: 'A', district: 'D', address: 'X', phone: '0',
    description: null, opening_time: '06:00', closing_time: '22:00', latitude: null, longitude: null,
    images: [], amenities: [], courts: [], price_rules: [], cancellation_policy: null }]; };
  await service.detail(1n);
  assert.equal(calls, 2);
});

test('Public interval search uses one application data query', async () => {
  let calls = 0;
  const db = { $queryRaw: async () => { calls++; return [{ today: '2030-01-01', total: 0, items: [] }]; } };
  const service = createPublicFacilityService(db, { url: value => value });
  await service.list({ page: 1, page_size: 20, interval: { date: '2030-01-01', start_time: '18:00', end_time: '19:00' } });
  assert.equal(calls, 1);
});

test('Public interval search validates DB-local 30-day window in the same query', async () => {
  let calls = 0;
  const db = { $queryRaw: async () => { calls++; return [{ today: '2030-01-01', total: 0, items: [] }]; } };
  const service = createPublicFacilityService(db, { url: value => value });
  await assert.rejects(service.list({ page: 1, page_size: 20, interval: { date: '2030-02-01', start_time: '18:00', end_time: '19:00' } }), { code: 'INVALID_DATE' });
  assert.equal(calls, 1);
});

test('Availability keeps read-only boundary and uses one aggregate data query', async () => {
  let reads = 0;
  const now = new Date('2030-01-01T00:00:00.000Z');
  const db = {
    $queryRaw: async () => { reads++; return [{ now, today: '2030-01-01', day_start: now,
      day_end: new Date('2030-01-02T00:00:00.000Z'), court_id: 1n, facility_id: 1n,
      opening_time: time('06:00'), closing_time: time('07:00'), rules: [], blocks: [], bookings: [], locked_bookings: [] }]; },
  };
  const result = await createAvailabilityService(db).read(1n, '2030-01-01');
  assert.equal(reads, 1); assert.equal(result.data.slots.length, 2);
});

test('Owner booking list uses one aggregate list query after clock and ownership check', async () => {
  const now = new Date('2030-01-01T00:00:00.000Z'); let raw = 0, auth = 0;
  const actor = { id: 7n, user: { id: '9' } };
  const session = { id: 7n, user_id: 9n, revoked_at: null, expires_at: new Date('2031-01-01T00:00:00Z'),
    user: { status: 'ACTIVE', role: 'CUSTOMER', ownerProfile: { user_id: 9n } } };
  const db = {
    $queryRaw: async strings => {
      if (String(strings[0]).includes('clock_timestamp')) return [{ now }];
      raw++; return [{ total: 0, items: [] }];
    },
    authSession: { findUnique: async () => { auth++; return session; } },
  };
  const result = await createOwnerPaymentService(db, {}).list(actor, { page: 1, page_size: 20 });
  assert.equal(raw, 1); assert.equal(auth, 1); assert.equal(result.meta.total, 0);
});

test('Owner Analytics keeps two overview statements and one court statement', async () => {
  let calls = 0;
  const facts = { facility_exists: true, server_time: new Date(), summary: {}, monthly_trend: [],
    weekday_bookings: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, confirmed_count: 0 })) };
  const capacity = { facility_exists: true, capacity_slots: 0, occupied_slots: 0, daily_capacity: [], hourly_heatmap: [],
    weekday_capacity: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, capacity_slots: 0, occupied_slots: 0, utilization_rate: null })) };
  const db = { $queryRaw: async () => (++calls === 1 ? [facts] : [capacity]) };
  const service = createOwnerAnalyticsService(db), actor = { user: { id: '7' } };
  const input = { from: '2026-01-01', to: '2026-01-01', facility_id: null };
  await service.overview(actor, input); assert.equal(calls, 2);
  db.$queryRaw = async () => { calls++; return [{ facility_exists: true, total: 0, items: [], server_time: new Date() }]; };
  await service.courts(actor, { ...input, page: 1, page_size: 20 }); assert.equal(calls, 3);
});
