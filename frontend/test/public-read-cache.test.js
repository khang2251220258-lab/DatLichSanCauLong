import { afterEach, expect, it } from 'vitest';
import { clearPublicSnapshots, publicSnapshotPolicy, readPublicSnapshot, writePublicSnapshot } from '../src/services/publicReadCache';

afterEach(clearPublicSnapshots);

it('keeps a recent public snapshot and expires it at the bounded TTL', () => {
  writePublicSnapshot('/facilities?page=1', { data:['recent'] }, 1_000);
  expect(readPublicSnapshot('/facilities?page=1', 1_000 + publicSnapshotPolicy.ttlMs - 1)).toEqual({ data:['recent'] });
  expect(readPublicSnapshot('/facilities?page=1', 1_000 + publicSnapshotPolicy.ttlMs + 1)).toBeNull();
});

it('isolates resources by the complete request path and bounds memory', () => {
  writePublicSnapshot('/facilities/1', { data:{ id:'1' } }, 1_000);
  expect(readPublicSnapshot('/facilities/2', 1_000)).toBeNull();
  for (let index=0; index<=publicSnapshotPolicy.maxEntries; index++) writePublicSnapshot(`/facilities/${index+10}`, { data:index }, 1_000);
  expect(readPublicSnapshot('/facilities/1', 1_000)).toBeNull();
});
