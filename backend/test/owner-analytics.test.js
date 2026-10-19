import test from 'node:test';
import assert from 'node:assert/strict';
import { courtsQuery, overviewQuery } from '../src/modules/analytics/owner-validation.js';
import { createOwnerAnalyticsService } from '../src/modules/analytics/owner-service.js';

const actor = { user: { id: '7', capabilities: ['CUSTOMER', 'OWNER'] } };
const input = { from: '2026-01-01', to: '2026-01-31', facility_id: null };

test('Owner Analytics query validation is strict and enforces inclusive 366-day range', () => {
  assert.deepEqual(overviewQuery({ from: '2024-01-01', to: '2024-12-31' }), { from: '2024-01-01', to: '2024-12-31', facility_id: null });
  for (const query of [
    {},
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-02-02', to: '2026-02-01' },
    { from: '2024-01-01', to: '2025-01-01' },
    { from: '2026-01-01', to: '2026-01-01', owner_id: '1' },
    { from: ['2026-01-01'], to: '2026-01-01' },
    { from: '2026-01-01', to: '2026-01-01', facility_id: '0' },
  ]) assert.throws(() => overviewQuery(query), { status: 422, code: 'VALIDATION_ERROR' });
});

test('Court Analytics pagination defaults and limits are validated', () => {
  assert.deepEqual(courtsQuery({ from: '2026-01-01', to: '2026-01-01' }), { ...input, to: '2026-01-01', page: 1, page_size: 20 });
  assert.equal(courtsQuery({ from: '2026-01-01', to: '2026-01-01', page: '2', page_size: '100' }).page, 2);
  assert.throws(() => courtsQuery({ from: '2026-01-01', to: '2026-01-01', page_size: '101' }), { status: 422 });
});

test('Overview uses exactly two independent statements and normalizes aggregate DTO', async () => {
  let calls = 0;
  const db = { $queryRaw: async () => {
    calls++;
    if (calls === 1) return [{ facility_exists: true, server_time: new Date('2026-01-01T00:00:00Z'),
      summary: { confirmed_booking_count: 1, completed_booking_count: 0, cancelled_booking_count: 0, confirmed_hours: '0.5', confirmed_booking_value: '100000', confirmed_deposit_amount: '30000', refunded_deposit_amount: '0', net_known_deposit_amount: '30000' },
      monthly_trend: [{ month: '2026-01', confirmed_count: 1, cancelled_count: 0, confirmed_booking_value: '100000' }],
      weekday_bookings: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, confirmed_count: i === 3 ? 1 : 0 })) }];
    return [{ facility_exists: true, capacity_slots: 2, occupied_slots: 1,
      daily_capacity: [{ date: '2026-01-01', capacity_slots: 2, occupied_slots: 1, blocked_slots: 0, available_slots: 1 }],
      weekday_capacity: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, capacity_slots: i === 3 ? 2 : 0, occupied_slots: i === 3 ? 1 : 0, blocked_slots: 0, available_slots: i === 3 ? 1 : 0, utilization_rate: i === 3 ? '50' : null })),
      hourly_heatmap: [{ weekday: 4, start_time: '18:00', capacity_slots: 2, occupied_slots: 1, blocked_slots: 0, available_slots: 1, utilization_rate: '50' }] }];
  } };
  const result = await createOwnerAnalyticsService(db).overview(actor, input);
  assert.equal(calls, 2);
  assert.equal(result.data.summary.utilization_rate, '50');
  assert.equal(result.data.weekday_usage.length, 7);
  assert.equal(result.data.weekday_usage[3].confirmed_count, 1);
});

test('Court performance uses one statement, preserves pagination and rejects foreign facility', async () => {
  let calls = 0;
  const good = { $queryRaw: async () => { calls++; return [{ facility_exists: true, total: 1,
    server_time: new Date('2026-01-01T00:00:00Z'), items: [{ court_id: '8', court_name: 'A', facility_id: '9', facility_name: 'F', confirmed_booking_count: 1, confirmed_hours: '1.0', confirmed_booking_value: '100000', capacity_slots: 2, occupied_slots: 2, blocked_slots: 0, available_slots: 0, utilization_rate: '100' }] }]; } };
  const result = await createOwnerAnalyticsService(good).courts(actor, { ...input, page: 1, page_size: 20 });
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(result.meta).sort(), ['page','page_size','server_time','total']);
  assert.equal(result.data[0].court_id, '8');
  const foreign = { $queryRaw: async () => [{ facility_exists: false, total: 0, items: [], server_time: new Date() }] };
  await assert.rejects(createOwnerAnalyticsService(foreign).courts(actor, { ...input, facility_id: 99n, page: 1, page_size: 20 }), { status: 404, code: 'RESOURCE_NOT_FOUND' });
});

test('Capacity invariant fails closed instead of returning negative availability', async () => {
  const db = { $queryRaw: async () => [{ facility_exists: true, total: 1, server_time: new Date(), items: [{ capacity_slots: 0, occupied_slots: 1, available_slots: -1 }] }] };
  await assert.rejects(createOwnerAnalyticsService(db).courts(actor, { ...input, page: 1, page_size: 20 }), /OWNER_ANALYTICS_CAPACITY_INVARIANT/);
});
