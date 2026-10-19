const TTL_MS = 30_000;
const MAX_ENTRIES = 24;
const entries = new Map();

export function readPublicSnapshot(key, now = Date.now()) {
  const entry = entries.get(key);
  if (!entry || now - entry.storedAt > TTL_MS) {
    if (entry) entries.delete(key);
    return null;
  }
  entries.delete(key);
  entries.set(key, entry);
  return entry.value;
}

export function writePublicSnapshot(key, value, now = Date.now()) {
  entries.delete(key);
  entries.set(key, { value, storedAt: now });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
}

export function clearPublicSnapshots() { entries.clear(); }
export const publicSnapshotPolicy = Object.freeze({ ttlMs: TTL_MS, maxEntries: MAX_ENTRIES });
