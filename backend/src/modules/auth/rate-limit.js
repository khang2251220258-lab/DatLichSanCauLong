import { createHash } from 'node:crypto';
import { authConfig } from './config.js';
import { AuthError } from './errors.js';
export function createRateLimits(clock = Date.now) {
  const buckets = new Map();
  const pending = new Map();
  const keyFor = (scope, value) => `${scope}:${createHash('sha256').update(value).digest('hex')}`;
  function bucket(scope, value) {
    const time = clock();
    for (const [key, item] of buckets) if (item.until <= time) buckets.delete(key);
    const key = keyFor(scope, value);
    if (!buckets.has(key)) buckets.set(key, { count: 0, until: time + authConfig.windowMs });
    return buckets.get(key);
  }
  return {
    async login(email, action) {
      const key = keyFor('queue', email);
      const previous = pending.get(key) || Promise.resolve();
      let release;
      const current = new Promise(resolve => { release = resolve; });
      pending.set(key, current);
      await previous;
      try { return await action(); }
      finally { release(); if (pending.get(key) === current) pending.delete(key); }
    },
    check(scope, value, limit, consume = true) {
      const item = bucket(scope, value);
      if (item.count >= limit) {
        const error = new AuthError(429, 'RATE_LIMITED', 'Quá nhiều yêu cầu. Vui lòng thử lại sau.');
        error.retryAfter = Math.max(1, Math.ceil((item.until - clock()) / 1000)); throw error;
      }
      if (consume) item.count++;
    },
    fail(email) { bucket('failed', email).count++; },
  };
}
