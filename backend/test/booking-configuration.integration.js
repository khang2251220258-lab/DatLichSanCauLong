// Real PostgreSQL concurrency; committed fixtures are restricted to this UUID and cleaned in finally.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { createOwnerRequestService } from '../src/modules/users/owner-requests/service.js';
import { createBookingConfigurationService } from '../src/modules/facilities/booking-configuration/service.js';
import { bootstrapAdmin } from '../scripts/admin-bootstrap-service.js';
import sharp from 'sharp';

test('Booking Configuration HTTP/PostgreSQL atomicity, permissions, concurrency and cleanup', { timeout: 900000 }, async t => {
  const emails = ['a', 'b', 'admin', 'customer'].map(n => `config-${randomUUID()}-${n}@example.invalid`);
  const password = 'Test1' + randomBytes(20).toString('hex');
  const setup = new Proxy(prisma, { get(target, key) { return key === '$transaction' ? (fn, opts) => target.$transaction(fn, { maxWait: 20000, timeout: 30000, ...opts }) : target[key]; } });
  const auth = createAuthService(setup), requests = createOwnerRequestService(setup), sessions = [];
  const config = { nodeEnv: 'development', frontendUrl: 'http://localhost:5173' };
  const storageObjects = new Set(), storageCalls = [];
  const storage = {
    ready() {},
    privateUrl(id, mime, expiresAt) { assert.equal(mime, 'image/png'); storageCalls.push({ action: 'url', id, expiresAt }); return `https://private.example.invalid/${encodeURIComponent(id)}?expires=${expiresAt}`; },
    async upload(buffer, id) { assert.equal((await sharp(buffer).metadata()).format, 'png'); storageObjects.add(id); storageCalls.push({ action: 'upload', id }); return id; },
    async destroy(id) { storageObjects.delete(id); storageCalls.push({ action: 'destroy', id }); },
  };
  const qrPng = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
  const rule = { start_time: '06:00', end_time: '10:00', hourly_rate: 50000 };
  const bank = { bank_name: ' Ngân hàng Abc ', account_number: ' 00aB123 ', account_holder: ' Nguyễn Văn A ' };
  const kinds = ['price-rules', 'cancellation-policy', 'bank-account'];
  const inputs = [{ rules: [rule] }, { cutoff_hours: 24 }, bank];
  let server, ids = [], a, b;
  const cases = (name, fn) => t.test(name, async () => { try { await fn(); } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; throw new Error('CONFIG_CASE_FAILED: ' + (/^[A-Z0-9_]+$/.test(e.code || '') ? e.code : 'UNEXPECTED_ERROR')); } });
  try {
    assert.equal(await prisma.user.count({ where: { email_normalized: { in: emails } } }), 0);
    for (let i = 0; i < emails.length; i++) {
      const input = { email: emails[i], password, full_name: 'Configuration fixture' };
      if (i === 2) await bootstrapAdmin(setup, input); else await auth.register(input);
      sessions.push(await auth.login({ email: emails[i], password }));
    }
    ids = sessions.map(s => BigInt(s.user.id));
    for (const i of [0, 1]) {
      const row = await requests.create(await auth.session(sessions[i].token));
      await requests.decide(await auth.session(sessions[2].token), BigInt(row.id), true);
      sessions[i] = await auth.login({ email: emails[i], password });
    }
    server = createApp(prisma, config, undefined, undefined, undefined, undefined, undefined, storage).listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    async function req(path, who = 0, method = 'GET', body, headers = {}) {
      const s = sessions[who];
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { Origin: config.frontendUrl, ...(s ? { Cookie: `booking_session=${s.token}`, 'X-CSRF-Token': s.csrf_token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
      const text = await res.text(); assert.ok(!text.includes('password_hash') && !text.includes('token_hash'));
      return { status: res.status, data: res.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null };
    }
    async function qrReq(path, who = 0, method = 'POST', buffer = qrPng, name = 'image', mime = 'image/png') {
      const s = sessions[who], form = new FormData(); if (buffer) form.append(name, new Blob([buffer], { type: mime }), 'qr.bin');
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { Origin: config.frontendUrl, Cookie: `booking_session=${s.token}`, 'X-CSRF-Token': s.csrf_token }, ...(method === 'POST' ? { body: form } : {}), signal: AbortSignal.timeout(60000) });
      return { status: res.status, data: await res.json() };
    }
    const path = (id, kind) => `/owner/facilities/${id}/${kind}`;
    async function facility(who = 0) {
      const r = await req('/owner/facilities', who, 'POST', { name: 'Configuration fixture', address: 'Fixture', district: 'Phường Hải Châu', phone: '0123456789', opening_time: '06:00', closing_time: '22:00' });
      assert.equal(r.status, 201); return r.data.data.id;
    }
    const action = (id, name, body = {}) => req(`/${name === 'submit' ? 'owner' : 'admin'}/facilities/${id}/${name}`, name === 'submit' ? 0 : 2, 'POST', body);
    a = await facility(); b = await facility(1);

    await cases('Empty GETs and 401/403/404/Origin/CSRF for all configuration endpoints', async () => {
      for (let i = 0; i < kinds.length; i++) {
        const url = path(a, kinds[i]), empty = await req(url); assert.equal(empty.status, 200); assert.deepEqual(empty.data.data, i === 0 ? [] : null);
        assert.equal((await req(url, -1)).status, 401);
        for (const who of [2, 3]) { assert.equal((await req(url, who)).status, 403); assert.equal((await req(url, who, 'PUT', inputs[i])).status, 403); }
        assert.equal((await req(url, 1)).status, 404); assert.equal((await req(url, 1, 'PUT', inputs[i])).status, 404);
        assert.equal((await req(path(b, kinds[i]))).status, 404);
        for (const headers of [{ Origin: 'https://evil.invalid' }, { 'X-CSRF-Token': '' }]) assert.equal((await req(url, 0, 'PUT', inputs[i], headers)).status, 403);
        assert.equal((await req(url + '?page=1')).status, 422);
        assert.equal((await req(path('0', kinds[i]))).status, 422);
        assert.equal((await req(path('9223372036854775807', kinds[i]))).status, 404);
      }
    });
    await cases('Price GET/PUT: replace, exact decimal serialization, ordering, touching, empty', async () => {
      const url = path(a, kinds[0]);
      let r = await req(url, 0, 'PUT', { rules: [rule] }); assert.equal(r.status, 200); assert.equal(r.data.data[0].hourly_rate, '50000');
      const later = { start_time: '10:00', end_time: '22:00', hourly_rate: 999999999999 };
      r = await req(url, 0, 'PUT', { rules: [later, rule] }); assert.equal(r.status, 200); assert.deepEqual(r.data.data.map(v => v.start_time), ['06:00', '10:00']);
      assert.equal(r.data.data[1].hourly_rate, '999999999999'); assert.equal((await req(url)).data.data.length, 2);
      assert.equal((await req(url, 0, 'PUT', { rules: [] })).status, 200); assert.deepEqual((await req(url)).data.data, []);
      assert.equal((await req(url, 0, 'PUT', { rules: [rule] })).status, 200);
    });
    await cases('Price invalid full set preserves prior records; overlap and duplicate fail', async () => {
      const url = path(a, kinds[0]), before = (await req(url)).data.data;
      const invalid = [{}, { rules: {} }, { rules: [], id: '1' }, { rules: Array(49).fill(rule) }, { rules: [{ ...rule, status: 'ACTIVE' }] }];
      for (const start_time of ['6:00', '06:15', '06:00:00', '10:00', '23:30', '05:30']) invalid.push({ rules: [{ ...rule, start_time }] });
      for (const hourly_rate of [0, -1, 1.5, '50000', 1000000000000]) invalid.push({ rules: [{ ...rule, hourly_rate }] });
      for (const body of invalid) { const r = await req(url, 0, 'PUT', body); assert.equal(r.status, 422); assert.equal(r.data.error.code, 'INVALID_PRICE_RULE'); }
      for (const second of [rule, { ...rule, start_time: '08:00', end_time: '12:00' }]) { const r = await req(url, 0, 'PUT', { rules: [rule, second] }); assert.equal(r.status, 422); assert.equal(r.data.error.code, 'PRICE_RULE_OVERLAP'); }
      assert.deepEqual((await req(url)).data.data, before);
    });
    await cases('Policy singleton first PUT/update 200, 0..168, strict validation', async () => {
      const url = path(a, kinds[1]);
      const created = await req(url, 0, 'PUT', { cutoff_hours: 0 }); assert.equal(created.status, 200); const id = created.data.data.id;
      const updated = await req(url, 0, 'PUT', { cutoff_hours: 168 }); assert.equal(updated.status, 200); assert.equal(updated.data.data.id, id); assert.equal((await req(url)).data.data.cutoff_hours, 168);
      for (const body of [{}, { cutoff_hours: -1 }, { cutoff_hours: 169 }, { cutoff_hours: 1.5 }, { cutoff_hours: '24' }, { cutoff_hours: 24, id: '1' }]) assert.equal((await req(url, 0, 'PUT', body)).status, 422);
      assert.equal(await prisma.cancellationPolicy.count({ where: { facility_id: BigInt(a) } }), 1);
    });
    await cases('Bank singleton trim/ASCII validation; text update preserves legacy QR', async () => {
      const url = path(a, kinds[2]), created = await req(url, 0, 'PUT', bank); assert.equal(created.status, 200);
      assert.equal(created.data.data.bank_name, 'Ngân hàng Abc'); assert.equal(created.data.data.account_number, '00aB123'); assert.equal(created.data.data.account_holder, 'Nguyễn Văn A'); assert.equal(created.data.data.has_qr_image, false); assert.equal(created.data.data.qr_image_url, null); assert.equal('qr_image_path' in created.data.data, false);
      await prisma.bankAccount.update({ where: { facility_id: BigInt(a) }, data: { qr_image_path: 'fixture/legacy-qr.png' } });
      const updated = await req(url, 0, 'PUT', { ...bank, account_number: 'abc123' }); assert.equal(updated.status, 200); assert.equal(updated.data.data.has_qr_image, true); assert.match(updated.data.data.qr_image_url, /^https:\/\/private\.example\.invalid\//); assert.equal('qr_image_path' in updated.data.data, false);
      const invalid = [{}, { ...bank, bank_name: ' ' }, { ...bank, account_holder: '' }, { ...bank, account_number: '' }, { ...bank, bank_name: 'x'.repeat(151) }, { ...bank, account_holder: 'x'.repeat(151) }, { ...bank, account_number: 'x'.repeat(51) }, { ...bank, account_number: 'ab 12' }, { ...bank, account_number: '12-3' }, { ...bank, facility_id: b }, { ...bank, qr_image_path: 'injected' }];
      for (const body of invalid) assert.equal((await req(url, 0, 'PUT', body)).status, 422);
      assert.equal(await prisma.bankAccount.count({ where: { facility_id: BigInt(a) } }), 1);
    });
    await cases('All module PUTs follow five-state matrix without touching Facility metadata', async () => {
      const f = await facility();
      async function verify(state, allowed) {
        const before = await prisma.facility.findUnique({ where: { id: BigInt(f) } }); assert.equal(before.status, state);
        for (let i = 0; i < kinds.length; i++) {
          const r = await req(path(f, kinds[i]), 0, 'PUT', inputs[i]); assert.equal(r.status, allowed ? 200 : 409);
          if (!allowed) assert.equal(r.data.error.code, 'FACILITY_STATE_NOT_EDITABLE');
          assert.equal((await req(path(f, kinds[i]))).status, 200);
        }
        assert.deepEqual(await prisma.facility.findUnique({ where: { id: BigInt(f) } }), before);
      }
      await verify('DRAFT', true); assert.equal((await action(f, 'submit')).status, 200); await verify('PENDING', false);
      assert.equal((await action(f, 'reject', { reason: 'Fixture' })).status, 200); await verify('REJECTED', true);
      assert.equal((await req(`/owner/facilities/${f}`, 0, 'PATCH', { name: 'Resubmit' })).status, 200);
      assert.equal((await action(f, 'submit')).status, 200); assert.equal((await action(f, 'approve')).status, 200); await verify('ACTIVE', true);
      assert.equal((await action(f, 'suspend', { reason: 'Fixture' })).status, 200); await verify('SUSPENDED', true);
    });
    await cases('Concurrent Price PUTs end with one complete set, never a mixture', async () => {
      const left = { rules: [rule, { start_time: '10:00', end_time: '12:00', hourly_rate: 60000 }] };
      const right = { rules: [{ start_time: '12:00', end_time: '14:00', hourly_rate: 70000 }] };
      const url = path(a, kinds[0]); const results = await Promise.all([req(url, 0, 'PUT', left), req(url, 0, 'PUT', right)]); assert.ok(results.every(r => r.status === 200));
      const final = (await req(url)).data.data.map(({ start_time, end_time, hourly_rate }) => ({ start_time, end_time, hourly_rate: Number(hourly_rate) }));
      assert.ok([JSON.stringify(left.rules), JSON.stringify(right.rules)].includes(JSON.stringify(final)));
    });
    await cases('Concurrent first upserts retain exactly one Policy and one BankAccount', async () => {
      const f = await facility();
      for (const [kind, bodies, model] of [[kinds[1], [{ cutoff_hours: 0 }, { cutoff_hours: 168 }], 'cancellationPolicy'], [kinds[2], [bank, { bank_name: 'Other', account_number: 'ABC', account_holder: 'Other' }], 'bankAccount']]) {
        const results = await Promise.all(bodies.map(body => req(path(f, kind), 0, 'PUT', body))); assert.ok(results.every(r => r.status === 200));
        if (kind === kinds[1]) assert.equal(results[0].data.data.id, results[1].data.data.id); assert.equal(await prisma[model].count({ where: { facility_id: BigInt(f) } }), 1);
        const final = (await req(path(f, kind))).data.data;
        assert.ok(results.some(r => JSON.stringify(r.data.data) === JSON.stringify(final)));
      }
    });
    await cases('Actual Price PUT/Facility submit race follows serialized parent state', async () => {
      const f = await facility(), url = path(f, kinds[0]);
      const results = await Promise.all([req(url, 0, 'PUT', inputs[0]), action(f, 'submit')]);
      assert.equal(results[1].status, 200); assert.ok([200, 409].includes(results[0].status));
      assert.equal((await req(url)).data.data.length, results[0].status === 200 ? 1 : 0);
    });
    await cases('Queued mutations recheck PENDING, Owner LOCKED and updated opening hours', async () => {
      const f = await facility(), actor = await auth.session(sessions[0].token);
      async function queued(kind, body, change, code) {
        let began; const beganPromise = new Promise(r => { began = r; }); let result;
        const db = new Proxy(prisma, { get(target, key) { return key === '$transaction' ? (fn, opts) => target.$transaction(async tx => { began(); return fn(tx); }, opts) : target[key]; } });
        await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${ids[0]} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${BigInt(f)} FOR UPDATE`;
          result = createBookingConfigurationService(db).put(actor, BigInt(f), kind, body).then(() => 'UNEXPECTED_SUCCESS', e => e.code);
          await beganPromise; await change(tx);
        }, { timeout: 20000 });
        assert.equal(await result, code);
      }
      await queued(kinds[0], inputs[0], tx => tx.facility.update({ where: { id: BigInt(f) }, data: { status: 'PENDING', submitted_at: new Date() } }), 'FACILITY_STATE_NOT_EDITABLE');
      await prisma.facility.update({ where: { id: BigInt(f) }, data: { status: 'DRAFT', submitted_at: null } });
      try { await queued(kinds[2], bank, tx => tx.user.update({ where: { id: ids[0] }, data: { status: 'LOCKED', locked_at: new Date(), locked_reason: 'Fixture' } }), 'SESSION_EXPIRED'); }
      finally { await prisma.user.update({ where: { id: ids[0] }, data: { status: 'ACTIVE', locked_at: null, locked_reason: null } }); }
      await queued(kinds[0], inputs[0], tx => tx.facility.update({ where: { id: BigInt(f) }, data: { opening_time: new Date('1970-01-01T08:00:00Z') } }), 'INVALID_PRICE_RULE');
      assert.deepEqual((await req(path(f, kinds[0]))).data.data, []); assert.equal((await req(path(f, kinds[2]))).data.data, null);
    });
    await cases('Failure after delete rolls back the entire real PostgreSQL price replacement', async () => {
      const before = (await req(path(a, kinds[0]))).data.data, actor = await auth.session(sessions[0].token);
      const db = new Proxy(prisma, { get(target, key) { return key === '$transaction' ? (fn, opts) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, prop) { return prop === 'priceRule' ? new Proxy(inner.priceRule, { get(model, method) { return method === 'createMany' ? () => { throw new Error('INJECTED_TEST_FAILURE'); } : model[method]; } }) : inner[prop]; } })), opts) : target[key]; } });
      await assert.rejects(createBookingConfigurationService(db).put(actor, BigInt(a), kinds[0], inputs[0]), { message: 'INJECTED_TEST_FAILURE' });
      assert.deepEqual((await req(path(a, kinds[0]))).data.data, before);
    });
    await cases('QR upload/replace/delete uses private adapter, safe DTO and preserves old objects', async () => {
      const qrPath = path(a, kinds[2]) + '/qr';
      let result = await qrReq(qrPath); assert.equal(result.status, 200); assert.equal(result.data.data.has_qr_image, true); assert.equal('qr_image_path' in result.data.data, false);
      const first = (await prisma.bankAccount.findUnique({ where: { facility_id: BigInt(a) } })).qr_image_path; assert.ok(first); assert.equal(storageObjects.has(first), true);
      const expires = Date.parse(result.data.data.qr_image_expires_at) - Date.parse(result.data.meta.server_time); assert.ok(expires >= 299000 && expires <= 301000);
      result = await qrReq(qrPath); assert.equal(result.status, 200); const second = (await prisma.bankAccount.findUnique({ where: { facility_id: BigInt(a) } })).qr_image_path; assert.notEqual(second, first); assert.equal(storageObjects.has(first), true); assert.equal(storageObjects.has(second), true);
      result = await qrReq(qrPath, 0, 'DELETE'); assert.equal(result.status, 200); assert.equal(result.data.data.has_qr_image, false); assert.equal((await prisma.bankAccount.findUnique({ where: { facility_id: BigInt(a) } })).qr_image_path, null); assert.equal(storageObjects.has(second), true);
      assert.equal(storageCalls.some(call => call.action === 'destroy' && [first, second].includes(call.id)), false);
      assert.equal((await qrReq(qrPath, 1)).status, 404); assert.equal((await qrReq(qrPath, 3)).status, 403);
      await prisma.facility.update({ where: { id: BigInt(a) }, data: { status: 'PENDING', submitted_at: new Date() } }); assert.equal((await qrReq(qrPath)).status, 409); assert.equal((await qrReq(qrPath, 0, 'DELETE')).status, 409); await prisma.facility.update({ where: { id: BigInt(a) }, data: { status: 'DRAFT', submitted_at: null } });
    });
    await cases('Admin/public routes remain absent; health unchanged', async () => {
      assert.equal((await req(`/admin/facilities/${a}/bank-account`, 2, 'PUT', bank)).status, 404);
      assert.equal((await req(`/facilities/${a}/price-rules`)).status, 404);
      const health = await req('/health'); assert.equal(health.status, 200); assert.deepEqual(health.data, { success: true, message: 'API is running' });
    });
  } catch (e) { throw new Error('CONFIG_SETUP_FAILED: ' + (/^[A-Z0-9_]+$/.test(e.code || '') ? e.code : 'CHECK_FAILED')); }
  finally {
    if (server?.listening) await new Promise(r => server.close(r));
    try {
      const fixtures = await prisma.user.findMany({ where: { email_normalized: { in: emails } }, select: { id: true } }), fixtureIds = fixtures.map(u => u.id);
      const facilities = await prisma.facility.findMany({ where: { owner_id: { in: fixtureIds } }, select: { id: true } }), facilityIds = facilities.map(f => f.id);
      await prisma.$transaction(async tx => {
        for (const model of ['priceRule', 'cancellationPolicy', 'bankAccount']) await tx[model].deleteMany({ where: { facility_id: { in: facilityIds } } });
        await tx.facility.deleteMany({ where: { id: { in: facilityIds } } });
        await tx.authSession.deleteMany({ where: { user_id: { in: fixtureIds } } });
        await tx.ownerProfile.deleteMany({ where: { user_id: { in: fixtureIds } } });
        await tx.ownerRequest.deleteMany({ where: { user_id: { in: fixtureIds } } });
        await tx.user.deleteMany({ where: { id: { in: fixtureIds }, email_normalized: { in: emails } } });
      }, { timeout: 30000, maxWait: 20000 });
      for (const model of ['priceRule', 'cancellationPolicy', 'bankAccount']) assert.equal(await prisma[model].count({ where: { facility_id: { in: facilityIds } } }), 0);
      assert.equal(await prisma.facility.count({ where: { id: { in: facilityIds } } }), 0); assert.equal(await prisma.user.count({ where: { email_normalized: { in: emails } } }), 0);
      console.log('CONFIG FIXTURE CLEANUP: PASS');
    } finally { await prisma.$disconnect(); }
  }
});
