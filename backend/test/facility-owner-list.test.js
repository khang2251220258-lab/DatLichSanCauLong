import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacilityService } from '../src/modules/facilities/service.js';

const at = value => new Date(`1970-01-01T${value}:00.000Z`);
const row = (id, courts) => ({
  id: BigInt(id), owner_id: 10n, name: `Facility ${id}`, address: `Address ${id}`, district: 'Phường Hải Châu',
  latitude: null, longitude: null, phone: '0900000000', description: null, opening_time: at('06:00'), closing_time: at('22:00'),
  status: 'DRAFT', submitted_at: null, reviewed_by: null, reviewed_at: null, rejection_reason: null,
  suspended_at: null, suspension_reason: null, created_at: new Date('2026-10-01T00:00:00.000Z'), updated_at: new Date('2026-10-01T00:00:00.000Z'),
  _count: { courts },
});

test('Owner Facility list returns authoritative per-Facility court_count in its existing paginated query', async () => {
  const calls = [], rows = [row(31, 0), row(32, 4)];
  const db = {
    court: { count: async () => { throw new Error('Owner Facility list must not count Courts per Facility'); } },
    $transaction: async work => work({
      facility: {
        findMany: async input => { calls.push({ type: 'findMany', input }); return rows; },
        count: async input => { calls.push({ type: 'count', input }); return 7; },
      },
    }),
  };

  const result = await createFacilityService(db).list({ user: { id: '10' } }, { page: 2, page_size: 2 }, false);

  assert.deepEqual(result.items.map(item => [item.id, item.court_count]), [['31', 0], ['32', 4]]);
  assert.equal(result.total, 7);
  const find = calls.find(call => call.type === 'findMany').input;
  assert.deepEqual(find.where, { owner_id: 10n });
  assert.equal(find.skip, 2);
  assert.equal(find.take, 2);
  assert.deepEqual(find.include, { _count: { select: { courts: true } } });
  assert.deepEqual(calls.find(call => call.type === 'count').input.where, { owner_id: 10n });
});
