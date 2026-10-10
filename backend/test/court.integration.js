// Real PostgreSQL connections for races; only UUID-scoped fixtures are committed and cleaned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { createOwnerRequestService } from '../src/modules/users/owner-requests/service.js';
import { createCourtService } from '../src/modules/courts/service.js';
import { bootstrapAdmin } from '../scripts/admin-bootstrap-service.js';

test('Court HTTP, state matrix, PostgreSQL concurrency and scoped cleanup', { timeout: 600000 }, async t => {
  const prefix = 'court-' + randomUUID(), emails = ['a', 'b', 'admin', 'customer'].map(n => `${prefix}-${n}@example.invalid`);
  const password = 'Test1' + randomBytes(20).toString('hex');
  const config = { nodeEnv: 'development', frontendUrl: 'http://localhost:5173' };
  // Setup has several remote round trips; only fixture setup extends Prisma's default 5s timeout.
  const setupDb = new Proxy(prisma, { get(target, key) {
    return key === '$transaction' ? (fn, opts) => target.$transaction(fn, { maxWait: 20000, timeout: 30000, ...opts }) : target[key];
  } });
  const auth = createAuthService(setupDb), requests = createOwnerRequestService(setupDb), sessions = [];
  const core = { name: 'Court fixture facility', address: 'Fixture', district: 'Phường Hải Châu', phone: '0123456789', opening_time: '06:00', closing_time: '22:00' };
  let ids = [], server, a, b, main;
  const cases = (name, fn) => t.test(name, async () => {
    try { await fn(); } catch (e) {
      if (e.code === 'ERR_ASSERTION') throw e;
      throw new Error('COURT_TEST_FAILED: ' + (/^[A-Z0-9_]+$/.test(e.code || '') ? e.code : 'UNEXPECTED_ERROR'));
    }
  });
  try {
    assert.equal(await prisma.user.count({ where: { email_normalized: { in: emails } } }), 0);
    for (let i = 0; i < emails.length; i++) {
      const input = { email: emails[i], password, full_name: 'Court fixture ' + i };
      if (i === 2) await bootstrapAdmin(setupDb, input); else await auth.register(input);
      sessions.push(await auth.login({ email: emails[i], password }));
    }
    ids = sessions.map(s => BigInt(s.user.id));
    for (const i of [0, 1]) {
      const row = await requests.create(await auth.session(sessions[i].token));
      await requests.decide(await auth.session(sessions[2].token), BigInt(row.id), true);
      sessions[i] = await auth.login({ email: emails[i], password });
    }
    server = createApp(prisma, config).listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    async function req(path, who = 0, method = 'GET', body, headers = {}) {
      const s = sessions[who];
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
        method, headers: { Origin: config.frontendUrl, ...(s ? { Cookie: `booking_session=${s.token}`, 'X-CSRF-Token': s.csrf_token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
      });
      const text = await response.text();
      assert.ok(!text.includes('password_hash') && !text.includes('token_hash'));
      return { status: response.status, data: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null };
    }
    const collection = id => `/owner/facilities/${id}/courts`, detail = id => `/owner/courts/${id}`;
    const createFacility = async (who = 0) => { const r = await req('/owner/facilities', who, 'POST', core); assert.equal(r.status, 201); return r.data.data.id; };
    const create = (id, name, who = 0) => req(collection(id), who, 'POST', { name });
    const transition = (id, action, body = {}) => req(`/${action === 'submit' ? 'owner' : 'admin'}/facilities/${id}/${action}`, action === 'submit' ? 0 : 2, 'POST', body);
    a = await createFacility(); b = await createFacility(1);

    await cases('Create ACTIVE, normalization, nullable description, strict input rejection', async () => {
      const r = await req(collection(a), 0, 'POST', { name: ' Sân 1 ', description: ' ' });
      assert.equal(r.status, 201); main = r.data.data.id;
      assert.equal(r.data.data.name, 'Sân 1'); assert.equal(r.data.data.status, 'ACTIVE'); assert.equal(r.data.data.description, null);
      assert.deepEqual(Object.keys(r.data.data).sort(), ['id', 'facility_id', 'name', 'description', 'status', 'created_at', 'updated_at'].sort());
      for (const body of [{}, { description: 'x' }, { name: '' }, { name: ' ' }, { name: 'x'.repeat(101) }, { name: 'x', description: null }, { name: 'x', description: 'x'.repeat(2001) }, { name: 'x', unknown: true }, { name: 'x', status: 'INACTIVE' }, { name: 'x', facility_id: b }]) assert.equal((await req(collection(a), 0, 'POST', body)).status, 422);
      const dup = await create(a, ' Sân 1 '); assert.equal(dup.status, 409); assert.equal(dup.data.error.code, 'COURT_NAME_EXISTS');
      assert.equal((await create(b, 'Sân 1', 1)).status, 201);
      const omitted = await create(a, 'Sân 2'); assert.equal(omitted.data.data.description, null);
    });
    await cases('Session/capability/Origin/CSRF and IDOR for all owner operations', async () => {
      assert.equal((await req(collection(a), -1)).status, 401);
      for (const who of [2, 3]) {
        assert.equal((await req(collection(a), who)).status, 403);
        assert.equal((await create(a, 'Denied', who)).status, 403);
        assert.equal((await req(detail(main), who)).status, 403);
        assert.equal((await req(detail(main), who, 'PATCH', { name: 'Denied' })).status, 403);
      }
      assert.equal((await req(collection(a), 1)).status, 404);
      assert.equal((await create(a, 'Denied', 1)).status, 404);
      assert.equal((await req(detail(main), 1)).status, 404);
      assert.equal((await req(detail(main), 1, 'PATCH', { name: 'Denied' })).status, 404);
      for (const headers of [{ Origin: 'https://evil.invalid' }, { 'X-CSRF-Token': '' }]) {
        assert.equal((await req(collection(a), 0, 'POST', { name: 'Denied' }, headers)).status, 403);
        assert.equal((await req(detail(main), 0, 'PATCH', { name: 'Denied' }, headers)).status, 403);
      }
      for (const path of [detail('0'), collection('0')]) assert.equal((await req(path)).status, 422);
      assert.equal((await req(detail('9223372036854775807'))).status, 404);
      assert.equal((await req(collection('9223372036854775807'))).status, 404);
    });
    await cases('PATCH exact fields, status both ways, uniqueness and description rules', async () => {
      assert.equal((await req(detail(main), 0, 'PATCH', { name: ' Sân VIP ', description: ' Text ', status: 'INACTIVE' })).status, 200);
      let row = (await req(detail(main))).data.data;
      assert.equal(row.name, 'Sân VIP'); assert.equal(row.description, 'Text'); assert.equal(row.status, 'INACTIVE');
      assert.equal((await req(detail(main), 0, 'PATCH', { status: 'ACTIVE' })).status, 200);
      assert.equal((await req(detail(main))).data.data.description, 'Text');
      assert.equal((await req(detail(main), 0, 'PATCH', { description: '' })).data.data.description, null);
      for (const body of [{}, { other: true }, { status: 'DRAFT' }, { facility_id: b }, { description: null }]) assert.equal((await req(detail(main), 0, 'PATCH', body)).status, 422);
      const duplicate = await req(detail(main), 0, 'PATCH', { name: 'Sân 2' }); assert.equal(duplicate.status, 409); assert.equal(duplicate.data.error.code, 'COURT_NAME_EXISTS');
    });
    await cases('List pagination, filters, stable timestamp tie ordering and errors', async () => {
      const f = await createFacility(), courtIds = [];
      for (let i = 0; i < 3; i++) courtIds.push((await create(f, 'List ' + i)).data.data.id);
      await prisma.court.updateMany({ where: { facility_id: BigInt(f) }, data: { created_at: new Date('2026-01-01T00:00:00Z') } });
      await req(detail(courtIds[0]), 0, 'PATCH', { status: 'INACTIVE' });
      const list = await req(collection(f)); assert.equal(list.data.meta.page, 1); assert.equal(list.data.meta.page_size, 20); assert.equal(list.data.meta.total, 3);
      assert.deepEqual(list.data.data.map(c => c.id), [...courtIds].reverse());
      assert.equal((await req(collection(f) + '?page=2&page_size=1')).data.data[0].id, courtIds[1]);
      assert.equal((await req(collection(f) + '?page_size=100')).status, 200);
      for (const [status, total] of [['ACTIVE', 2], ['INACTIVE', 1]]) assert.equal((await req(collection(f) + '?status=' + status)).data.meta.total, total);
      for (const query of ['page=0', 'page_size=101', 'page=1.5', 'status=WRONG', 'unknown=x']) assert.equal((await req(collection(f) + '?' + query)).status, 422);
    });
    await cases('All five Facility states: mutation matrix and unchanged approval metadata', async () => {
      const f = await createFacility(), c = (await create(f, 'Matrix')).data.data.id;
      async function verify(state, allowed) {
        const before = await prisma.facility.findUnique({ where: { id: BigInt(f) } }); assert.equal(before.status, state);
        const created = await create(f, state), patched = await req(detail(c), 0, 'PATCH', { name: 'Matrix ' + state });
        assert.equal(created.status, allowed ? 201 : 409); assert.equal(patched.status, allowed ? 200 : 409);
        if (!allowed) for (const r of [created, patched]) assert.equal(r.data.error.code, 'FACILITY_STATE_NOT_EDITABLE');
        assert.equal((await req(collection(f))).status, 200); assert.equal((await req(detail(c))).status, 200);
        assert.deepEqual(await prisma.facility.findUnique({ where: { id: BigInt(f) } }), before);
      }
      await verify('DRAFT', true);
      assert.equal((await transition(f, 'submit')).status, 200); await verify('PENDING', false);
      assert.equal((await transition(f, 'reject', { reason: 'Fixture review' })).status, 200); await verify('REJECTED', true);
      assert.equal((await req(`/owner/facilities/${f}`, 0, 'PATCH', { name: 'Resubmit' })).status, 200);
      assert.equal((await transition(f, 'submit')).status, 200); assert.equal((await transition(f, 'approve')).status, 200); await verify('ACTIVE', true);
      assert.equal((await transition(f, 'suspend', { reason: 'Fixture suspension' })).status, 200); await verify('SUSPENDED', true);
    });
    await cases('Concurrent create: exactly one 201 and one precise name conflict', async () => {
      const results = await Promise.all([create(a, 'Concurrent'), create(a, 'Concurrent')]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      assert.equal(results.find(r => r.status === 409).data.error.code, 'COURT_NAME_EXISTS');
      assert.equal(await prisma.court.count({ where: { facility_id: BigInt(a), name: 'Concurrent' } }), 1);
    });
    await cases('Concurrent PATCH: disjoint updates survive, valid final constraint state', async () => {
      const results = await Promise.all([req(detail(main), 0, 'PATCH', { name: 'Concurrent renamed' }), req(detail(main), 0, 'PATCH', { description: 'Concurrent description', status: 'INACTIVE' })]);
      assert.ok(results.every(r => r.status === 200));
      const row = (await req(detail(main))).data.data; assert.equal(row.name, 'Concurrent renamed'); assert.equal(row.description, 'Concurrent description'); assert.equal(row.status, 'INACTIVE');
    });
    await cases('Concurrent Court PATCH and real Facility submit respect serialized state', async () => {
      const f = await createFacility(), c = (await create(f, 'Before submit')).data.data.id;
      const results = await Promise.all([req(detail(c), 0, 'PATCH', { name: 'Before lock' }), transition(f, 'submit')]);
      assert.equal(results[1].status, 200); assert.ok([200, 409].includes(results[0].status));
      const row = (await req(detail(c))).data.data; assert.equal(row.name, results[0].status === 200 ? 'Before lock' : 'Before submit');
      assert.equal((await req(detail(c), 0, 'PATCH', { name: 'After pending' })).status, 409);
    });
    await cases('Deterministic queued mutation rechecks changed parent and locked Owner', async () => {
      // Signal when the service transaction begins, while an independent connection holds User/Facility.
      const f = await createFacility(), c = (await create(f, 'Queue')).data.data.id;
      const actor = await auth.session(sessions[0].token);
      async function queued(change, expected) {
        let began; const started = new Promise(r => { began = r; });
        const db = new Proxy(prisma, { get(target, key) { return key === '$transaction' ? (fn, opts) => target.$transaction(async tx => { began(); return fn(tx); }, opts) : target[key]; } });
        let result;
        await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${ids[0]} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${BigInt(f)} FOR UPDATE`;
          result = createCourtService(db).patch(actor, BigInt(c), { name: 'Must not persist' }).then(() => 'UNEXPECTED_SUCCESS', e => e.code);
          await started;
          await change(tx);
        }, { timeout: 20000 });
        assert.equal(await result, expected);
        assert.equal((await prisma.court.findUnique({ where: { id: BigInt(c) } })).name, 'Queue');
      }
      await queued(tx => tx.facility.update({ where: { id: BigInt(f) }, data: { status: 'PENDING', submitted_at: new Date() } }), 'FACILITY_STATE_NOT_EDITABLE');
      await prisma.facility.update({ where: { id: BigInt(f) }, data: { status: 'DRAFT', submitted_at: null } });
      try { await queued(tx => tx.user.update({ where: { id: ids[0] }, data: { status: 'LOCKED', locked_at: new Date(), locked_reason: 'Fixture' } }), 'SESSION_EXPIRED'); }
      finally { await prisma.user.update({ where: { id: ids[0] }, data: { status: 'ACTIVE', locked_at: null, locked_reason: null } }); }
    });
    await cases('Rename/inactivate with booking preserves history, slot lock and block', async () => {
      const start = new Date('2030-01-01T03:00:00Z'), end = new Date('2030-01-01T03:30:00Z'), created = new Date();
      const booking = await prisma.booking.create({ data: { customer_id: ids[3], court_id: BigInt(main), status: 'PENDING_PAYMENT', start_at: start, end_at: end, expires_at: new Date(created.getTime() + 300000), total_amount: 100000, deposit_amount: 30000, remaining_amount: 70000, bank_name_snapshot: 'Fixture', account_number_snapshot: '123', account_holder_snapshot: 'Fixture', facility_name_snapshot: 'Fixture', facility_address_snapshot: 'Fixture', court_name_snapshot: 'Historical name', created_at: created } });
      const before = await prisma.booking.findUnique({ where: { id: booking.id } });
      const slot = await prisma.bookingSlot.create({ data: { booking_id: booking.id, start_at: start, end_at: end, hourly_rate_snapshot: 200000, slot_amount: 100000, created_at: created } });
      const lock = await prisma.courtSlotLock.create({ data: { court_id: BigInt(main), start_at: start, booking_slot_id: slot.id, created_at: created } });
      const block = await prisma.courtBlock.create({ data: { court_id: BigInt(main), start_at: end, end_at: new Date(end.getTime() + 1800000), reason: 'Fixture', created_by: ids[0], created_at: created } });
      assert.equal((await req(detail(main), 0, 'PATCH', { name: 'New name', status: 'ACTIVE' })).status, 200);
      assert.equal((await req(detail(main), 0, 'PATCH', { status: 'INACTIVE' })).status, 200);
      assert.deepEqual(await prisma.booking.findUnique({ where: { id: booking.id } }), before);
      assert.deepEqual(await prisma.courtSlotLock.findUnique({ where: { court_id_start_at: { court_id: BigInt(main), start_at: start } } }), lock);
      assert.deepEqual(await prisma.courtBlock.findUnique({ where: { id: block.id } }), block);
    });
    await cases('Deferred routes absent; health unchanged HTTP 200', async () => {
      for (const [path, method] of [[detail(main), 'DELETE'], [`/admin/courts/${main}`, 'GET'], [`/courts/${main}`, 'GET'], [detail(main) + '/schedule', 'GET'], [detail(main) + '/blocks', 'POST']]) assert.equal((await req(path, 0, method, method === 'POST' ? {} : undefined)).status, 404);
      const health = await req('/health'); assert.equal(health.status, 200); assert.deepEqual(health.data, { success: true, message: 'API is running' });
    });
  } catch (e) {
    throw new Error('COURT_SETUP_FAILED: ' + (/^[A-Z0-9_]+$/.test(e.code || '') ? e.code : 'CHECK_FAILED'));
  } finally {
    if (server?.listening) await new Promise(r => server.close(r));
    try {
      const fixtures = await prisma.user.findMany({ where: { email_normalized: { in: emails } }, select: { id: true } });
      const fixtureIds = fixtures.map(u => u.id);
      const facilities = await prisma.facility.findMany({ where: { owner_id: { in: fixtureIds } }, select: { id: true } }), facilityIds = facilities.map(f => f.id);
      await prisma.$transaction(async tx => {
        await tx.courtSlotLock.deleteMany({ where: { court: { facility_id: { in: facilityIds } } } });
        await tx.courtBlock.deleteMany({ where: { court: { facility_id: { in: facilityIds } }, created_by: { in: fixtureIds } } });
        await tx.bookingSlot.deleteMany({ where: { booking: { customer_id: { in: fixtureIds }, court: { facility_id: { in: facilityIds } } } } });
        await tx.booking.deleteMany({ where: { customer_id: { in: fixtureIds }, court: { facility_id: { in: facilityIds } } } });
        await tx.court.deleteMany({ where: { facility_id: { in: facilityIds } } });
        await tx.facility.deleteMany({ where: { id: { in: facilityIds } } });
        await tx.authSession.deleteMany({ where: { user_id: { in: fixtureIds } } });
        await tx.ownerProfile.deleteMany({ where: { user_id: { in: fixtureIds } } });
        await tx.ownerRequest.deleteMany({ where: { user_id: { in: fixtureIds } } });
        await tx.user.deleteMany({ where: { id: { in: fixtureIds }, email_normalized: { in: emails } } });
      }, { timeout: 30000, maxWait: 20000 });
      assert.equal(await prisma.court.count({ where: { facility_id: { in: facilityIds } } }), 0);
      assert.equal(await prisma.facility.count({ where: { id: { in: facilityIds } } }), 0);
      assert.equal(await prisma.user.count({ where: { email_normalized: { in: emails } } }), 0);
      console.log('COURT FIXTURE CLEANUP: PASS');
    } finally { await prisma.$disconnect(); }
  }
});
