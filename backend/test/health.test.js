import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHealthRoutes } from '../src/routes/index.js';

async function withServer(db, action, options) {
  const app = express();
  app.use('/api/v1', createHealthRoutes(db, options));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await action(`http://127.0.0.1:${server.address().port}/api/v1`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('liveness does not depend on database readiness', async () => {
  await withServer({ $queryRaw: () => Promise.reject(new Error('private database detail')) }, async base => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, message: 'API is running' });
  });
});

test('readiness succeeds after lightweight database check', async () => {
  let calls = 0;
  await withServer({ $queryRaw: () => { calls += 1; return Promise.resolve([{ '?column?': 1 }]); } }, async base => {
    const response = await fetch(`${base}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, message: 'API is ready' });
  });
  assert.equal(calls, 1);
});

test('readiness fails closed without leaking database errors', async () => {
  await withServer({ $queryRaw: () => Promise.reject(new Error('host=secret.internal password=secret')) }, async base => {
    const response = await fetch(`${base}/ready`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(body, { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' } });
    assert.doesNotMatch(JSON.stringify(body), /secret|host|password/i);
  });
});

test('readiness has a bounded response time', async () => {
  await withServer({ $queryRaw: () => new Promise(() => {}) }, async base => {
    const response = await fetch(`${base}/ready`);
    assert.equal(response.status, 503);
  }, { readinessTimeoutMs: 10 });
});
