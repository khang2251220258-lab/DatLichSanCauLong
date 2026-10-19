import { afterEach, expect, it } from 'vitest';
import { clearProtectedSnapshots, protectedIdentity, protectedSnapshotPolicy, readProtectedSnapshot, writeProtectedSnapshot } from '../src/services/protectedReadCache';

afterEach(() => clearProtectedSnapshots());

it('isolates snapshots by user, capabilities and full path', () => {
  const customer = protectedIdentity({ id:'1', capabilities:['CUSTOMER'] });
  const owner = protectedIdentity({ id:'1', capabilities:['OWNER','CUSTOMER'] });
  writeProtectedSnapshot(customer, '/bookings?page=1', { data:['customer'] }, 1_000);
  expect(readProtectedSnapshot(customer, '/bookings?page=1', 1_001)).toEqual({ data:['customer'] });
  expect(readProtectedSnapshot(owner, '/bookings?page=1', 1_001)).toBeNull();
  expect(readProtectedSnapshot(customer, '/bookings?page=2', 1_001)).toBeNull();
});

it('expires, bounds and clears protected snapshots', () => {
  const identity = protectedIdentity({ id:'7', capabilities:['ADMIN'] });
  writeProtectedSnapshot(identity, '/admin/facilities', { data:[] }, 1_000);
  expect(readProtectedSnapshot(identity, '/admin/facilities', 1_000 + protectedSnapshotPolicy.ttlMs + 1)).toBeNull();
  for (let index=0; index<=protectedSnapshotPolicy.maxEntries; index++) writeProtectedSnapshot(identity, `/resource/${index}`, index, 2_000);
  expect(readProtectedSnapshot(identity, '/resource/0', 2_001)).toBeNull();
  clearProtectedSnapshots(identity);
  expect(readProtectedSnapshot(identity, '/resource/40', 2_001)).toBeNull();
});
