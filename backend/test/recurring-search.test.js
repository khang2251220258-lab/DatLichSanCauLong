import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRecurrence } from '../src/modules/facilities/recurring/recurrence.js';
import { recurringQuery } from '../src/modules/facilities/recurring/validation.js';
import { createRecurringSearchService } from '../src/modules/facilities/recurring/service.js';

const base = { weekday: 1, start_date: '2026-10-01', end_date: '2026-10-31', start_time: '18:00', end_time: '20:00' };

test('expands ISO weekday occurrences inclusively in Asia/Ho_Chi_Minh', () => {
  const rows = expandRecurrence(base);
  assert.deepEqual(rows.map(row => row.start_at.toISOString()), [
    '2026-10-05T11:00:00.000Z', '2026-10-12T11:00:00.000Z', '2026-10-19T11:00:00.000Z', '2026-10-26T11:00:00.000Z',
  ]);
  assert.ok(rows.every(row => row.end_at - row.start_at === 2 * 60 * 60 * 1000));
});

test('handles matching endpoints, month/year/leap boundaries', () => {
  assert.equal(expandRecurrence({ ...base, weekday: 4, start_date: '2026-10-01', end_date: '2026-10-01' }).length, 1);
  assert.throws(() => expandRecurrence({ ...base, weekday: 1, start_date: '2026-10-01', end_date: '2026-10-04' }), { code: 'INVALID_RECURRENCE' });
  assert.deepEqual(expandRecurrence({ ...base, weekday: 5, start_date: '2027-12-31', end_date: '2028-01-07' }).map(x => x.start_at.toISOString().slice(0, 10)), ['2027-12-31', '2028-01-07']);
  assert.equal(expandRecurrence({ ...base, weekday: 2, start_date: '2028-02-28', end_date: '2028-03-01' }).length, 1);
});

test('enforces 93 inclusive days, 14 occurrences, weekday and time boundaries', () => {
  assert.equal(expandRecurrence({ ...base, weekday: 4, start_date: '2026-10-01', end_date: '2027-01-01' }).length, 14);
  for (const input of [
    { ...base, end_date: '2027-01-02' },
    { ...base, weekday: 0 }, { ...base, weekday: 8 },
    { ...base, start_date: '2026-02-30' }, { ...base, start_date: '2026-10-31', end_date: '2026-10-01' },
    { ...base, start_time: '18:15' }, { ...base, start_time: '20:00', end_time: '18:00' },
    { ...base, start_time: '18:00', end_time: '21:30' },
  ]) assert.throws(() => expandRecurrence(input));
});

test('strict query validation and normalization', () => {
  const result = recurringQuery({ ...base, weekday: '1', q: '  Sân  ', district: 'Phường Hải Châu' });
  assert.equal(result.q, 'Sân'); assert.equal(result.occurrences.length, 4);
  assert.throws(() => recurringQuery({ ...base, weekday: '1', extra: 'x' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => recurringQuery({ ...base, weekday: '1', district: 'Quận cũ' }), { code: 'INVALID_DISTRICT' });
  assert.throws(() => recurringQuery({ ...base, weekday: ['1'] }), { code: 'VALIDATION_ERROR' });
});

test('recurring search service uses one database statement and maps public DTO', async () => {
  let calls = 0;
  const db = { $queryRaw: async () => { calls++; return [{ total: 1, occurrence_count: 4, items: [{
    id: '1', name: 'A', district: 'D', address: 'X', image_path: 'cover', amenities: [], matching_courts: [{ id: '2', name: 'Sân 1' }],
  }] }]; } };
  const service = createRecurringSearchService(db, { url: value => `https://images/${value}` });
  const result = await service.list({ ...base, page: 1, page_size: 20, weekday: 1 });
  assert.equal(calls, 1); assert.equal(result.occurrence_count, 4);
  assert.equal(result.items[0].cover_image_url, 'https://images/cover');
  assert.deepEqual(Object.keys(result.items[0]), ['id', 'name', 'district', 'address', 'cover_image_url', 'amenities', 'matching_courts']);
});
