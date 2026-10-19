const TTL_MS = 30_000;
const MAX_ENTRIES = 40;
const entries = new Map();

export function protectedIdentity(user) {
  if (!user?.id) return null;
  const capabilities = [...(user.capabilities || [])].sort().join(',');
  return `${user.id}:${capabilities}`;
}

const keyFor = (identity, path) => identity && path ? `${identity}|${path}` : null;

export function readProtectedSnapshot(identity, path, now = Date.now()) {
  const key = keyFor(identity, path);
  if (!key) return null;
  const entry = entries.get(key);
  if (!entry || now - entry.storedAt > TTL_MS) {
    if (entry) entries.delete(key);
    return null;
  }
  entries.delete(key);
  entries.set(key, entry);
  return entry.value;
}

export function writeProtectedSnapshot(identity, path, value, now = Date.now()) {
  const key = keyFor(identity, path);
  if (!key) return;
  entries.delete(key);
  entries.set(key, { value, storedAt: now });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
}

export function clearProtectedSnapshots(identity) {
  if (!identity) { entries.clear(); return; }
  const prefix = `${identity}|`;
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
}

export const protectedSnapshotPolicy = Object.freeze({ ttlMs: TTL_MS, maxEntries: MAX_ENTRIES });
