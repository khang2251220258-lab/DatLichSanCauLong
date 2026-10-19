import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { createBookingService } from '../src/modules/bookings/service.js';
import { input } from '../src/modules/bookings/rules.js';
import { createPaymentService } from '../src/modules/payments/service.js';

test('Booking V2 PostgreSQL constraints, expiry, concurrency and rollback', { timeout: 600000 }, async t => {
  const tag = `TEST_V2_${randomUUID()}`;
  const users = [], sessions = [], facilities = [], courts = [], metrics = {};
  const time = value => new Date(`1970-01-01T${value}:00Z`);
  const config = { nodeEnv: 'development', frontendUrl: 'http://localhost:5173', bookingFlowVersion: 2 };
  const storage = { ready() {}, privateUrl() { return null; }, async upload() { throw new Error('EXTERNAL_CALL_FORBIDDEN'); }, async destroy() { throw new Error('EXTERNAL_CALL_FORBIDDEN'); } };
  let server;
  try {
    const [{ now: clock }] = await prisma.$queryRaw`SELECT clock_timestamp() AS now`;
    const localTomorrow = new Date(+clock + 86400000 + 7 * 3600000).toISOString().slice(0, 10);
    for (let i = 0; i < 4; i += 1) {
      const email = `${tag}-${i}@example.invalid`, token = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('hex');
      const user = await prisma.user.create({ data: { email, email_normalized: email.toLowerCase(), full_name: tag, google_subject: email, role: i === 3 ? 'ADMIN' : 'CUSTOMER', status: 'ACTIVE', created_at: clock } });
      users.push(user);
      await prisma.authSession.create({ data: { user_id: user.id, token_hash: createHash('sha256').update(token).digest(), csrf_token: csrf, created_at: clock, expires_at: new Date(+clock + 86400000) } });
      sessions.push({ token, csrf });
    }
    const request = await prisma.ownerRequest.create({ data: { user_id: users[0].id, status: 'APPROVED', applicant_name_snapshot: tag, applicant_email_snapshot: users[0].email, reviewed_by: users[3].id, reviewed_at: clock, created_at: clock } });
    await prisma.ownerProfile.create({ data: { user_id: users[0].id, approved_request_id: request.id, created_at: clock } });
    const otherRequest = await prisma.ownerRequest.create({ data: { user_id: users[1].id, status: 'APPROVED', applicant_name_snapshot: tag, applicant_email_snapshot: users[1].email, reviewed_by: users[3].id, reviewed_at: clock, created_at: clock } });
    await prisma.ownerProfile.create({ data: { user_id: users[1].id, approved_request_id: otherRequest.id, created_at: clock } });
    const facility = await prisma.facility.create({ data: { owner_id: users[0].id, name: tag, address: 'Fixture', district: 'Phường Hải Châu', phone: '0123456789', opening_time: time('06:00'), closing_time: time('22:00'), status: 'ACTIVE', created_at: clock } });
    facilities.push(facility);
    const court = await prisma.court.create({ data: { facility_id: facility.id, name: tag, status: 'ACTIVE', created_at: clock } });
    courts.push(court);
    await prisma.priceRule.create({ data: { facility_id: facility.id, start_time: time('06:00'), end_time: time('22:00'), hourly_rate: '80000', created_at: clock } });
    await prisma.bankAccount.create({ data: { facility_id: facility.id, bank_name: 'Fixture Bank', account_number: '123', account_holder: 'Fixture', created_at: clock } });

    const forbidden = () => { throw new Error('EXTERNAL_CALL_FORBIDDEN'); };
    server = createApp(prisma, config, undefined, { ready: forbidden, send: forbidden }, undefined, { url: forbidden, upload: forbidden, destroy: forbidden }, undefined, storage).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const body = (hour, duration = 30) => {
      const start = new Date(`${localTomorrow}T${String(hour).padStart(2, '0')}:00:00+07:00`);
      return { court_id: String(court.id), start_at: start.toISOString(), end_at: new Date(+start + duration * 60000).toISOString() };
    };
    const req = async (path, who = 2, method = 'GET', data) => {
      const session = sessions[who];
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { Origin: config.frontendUrl, Cookie: `booking_session=${session.token}`, 'X-CSRF-Token': session.csrf, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(60000) });
      return { status: response.status, body: await response.json() };
    };
    const create = async (hour, who = 2) => {
      const started = performance.now();
      const result = await req('/bookings', who, 'POST', body(hour));
      metrics.create = performance.now() - started;
      return result;
    };
    const availability = async hour => {
      const started = performance.now();
      const result = await req(`/courts/${court.id}/availability?date=${localTomorrow}`);
      metrics.availability = performance.now() - started;
      const start = body(hour).start_at;
      return { result, slot: result.body.data?.slots.find(item => item.start_at === start) };
    };

    await t.test('real PostgreSQL constraints accept valid V1/V2 and reject invalid flow/deadline/FK', async () => {
      const made = await create(7); assert.equal(made.status, 201);
      const id = BigInt(made.body.data.id);
      assert.equal(made.body.data.booking_flow_version, 2);
      assert.ok(made.body.data.confirmation_expires_at);
      await assert.rejects(prisma.$transaction(async tx => { await tx.booking.update({ where: { id }, data: { booking_flow_version: 1, confirmation_expires_at: null } }); throw new Error('ROLLBACK_VALID_V1'); }), /ROLLBACK_VALID_V1/);
      await assert.rejects(prisma.$transaction(async tx => { await tx.booking.update({ where: { id }, data: { booking_flow_version: 2, confirmation_expires_at: new Date(+clock + 60000) } }); throw new Error('ROLLBACK_VALID_V2'); }), /ROLLBACK_VALID_V2/);
      await assert.rejects(prisma.$executeRawUnsafe(`UPDATE bookings SET booking_flow_version = 3 WHERE id = ${id}`), error => error.code === 'P2010');
      await assert.rejects(prisma.$executeRawUnsafe(`UPDATE bookings SET confirmation_expires_at = NULL WHERE id = ${id}`), error => error.code === 'P2010');
      await assert.rejects(prisma.$executeRawUnsafe(`UPDATE bookings SET confirmed_by_user_id = 9223372036854775806 WHERE id = ${id}`), error => error.code === 'P2010');
    });

    await t.test('before deadline is HELD with one physical lock', async () => {
      const made = await create(8); assert.equal(made.status, 201);
      const id = BigInt(made.body.data.id);
      assert.equal(made.body.data.status, 'PENDING_CONFIRMATION');
      assert.equal(made.body.data.transfer_reference, `CLDN ${id}`);
      assert.equal(made.body.data.bank_name_snapshot, 'Fixture Bank');
      assert.equal(made.body.data.account_number_snapshot, '123');
      assert.equal(made.body.data.account_holder_snapshot, 'Fixture');
      assert.equal(made.body.data.total_amount, '40000');
      assert.equal(made.body.data.deposit_amount, '12000');
      assert.equal(made.body.data.remaining_amount, '28000');
      assert.equal(Date.parse(made.body.data.confirmation_expires_at) - Date.parse(made.body.meta.server_time), 30 * 60000);
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: id } } }), 1);
      const auth = createAuthService(prisma), actor = await auth.session(sessions[2].token);
      const before = await prisma.booking.findUnique({ where: { id } });
      await assert.rejects(createPaymentService(prisma, storage).precheck(actor, id), error => error.code === 'PAYMENT_PROOF_NOT_ALLOWED_FOR_BOOKING_FLOW');
      const after = await prisma.booking.findUnique({ where: { id } });
      assert.equal(await prisma.paymentProof.count({ where: { booking_id: id } }), 0);
      assert.equal(after.status, before.status);
      assert.equal(+after.confirmation_expires_at, +before.confirmation_expires_at);
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: id } } }), 1);
      const { result, slot } = await availability(8); assert.equal(result.status, 200); assert.equal(slot?.state, 'HELD');
    });

    await t.test('missing receiving bank fails closed without partial booking, slots, or locks', async () => {
      const bank = await prisma.bankAccount.findUnique({ where: { facility_id: facility.id } });
      const before = {
        bookings: await prisma.booking.count({ where: { court_id: court.id } }),
        slots: await prisma.bookingSlot.count({ where: { booking: { court_id: court.id } } }),
        locks: await prisma.courtSlotLock.count({ where: { court_id: court.id } }),
      };
      await prisma.bankAccount.delete({ where: { id: bank.id } });
      try {
        const result = await create(14);
        assert.equal(result.status, 409);
        assert.equal(result.body.error.code, 'BANK_ACCOUNT_NOT_CONFIGURED');
        assert.deepEqual({
          bookings: await prisma.booking.count({ where: { court_id: court.id } }),
          slots: await prisma.bookingSlot.count({ where: { booking: { court_id: court.id } } }),
          locks: await prisma.courtSlotLock.count({ where: { court_id: court.id } }),
        }, before);
      } finally {
        await prisma.bankAccount.create({ data: bank });
      }
    });

    await t.test('at/after deadline lazily expires atomically, releases lock and availability is no longer HELD', async () => {
      const made = await create(9); const id = BigInt(made.body.data.id);
      await prisma.$executeRaw`UPDATE bookings SET confirmation_expires_at = clock_timestamp() WHERE id = ${id}`;
      const started = performance.now();
      const detail = await req(`/bookings/${id}`);
      metrics.expiry = performance.now() - started;
      assert.equal(detail.body.data.status, 'EXPIRED');
      const row = await prisma.booking.findUnique({ where: { id } });
      assert.equal(row.status, 'EXPIRED'); assert.ok(row.expired_at);
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: id } } }), 0);
      assert.notEqual((await availability(9)).slot?.state, 'HELD');
    });

    await t.test('stale V2 hold is expired and replaced without duplicate active lock', async () => {
      const first = await create(10); const firstId = BigInt(first.body.data.id);
      await prisma.$executeRaw`UPDATE bookings SET confirmation_expires_at = clock_timestamp() - interval '1 millisecond' WHERE id = ${firstId}`;
      const second = await create(10, 1); assert.equal(second.status, 201);
      assert.equal((await prisma.booking.findUnique({ where: { id: firstId } })).status, 'EXPIRED');
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: firstId } } }), 0);
      assert.equal(await prisma.courtSlotLock.count({ where: { court_id: court.id, start_at: new Date(body(10).start_at) } }), 1);
    });

    await t.test('concurrent same-slot V2 create yields one success and one safe conflict', async () => {
      const results = await Promise.all([create(11, 1), create(11, 2)]);
      assert.deepEqual(results.map(item => item.status).sort(), [201, 409]);
      assert.equal(results.find(item => item.status === 409).body.error.code, 'SLOT_UNAVAILABLE');
      assert.equal(await prisma.courtSlotLock.count({ where: { court_id: court.id, start_at: new Date(body(11).start_at) } }), 1);
    });

    await t.test('failure after intermediate writes rolls back V2 booking, slots and locks', async () => {
      const auth = createAuthService(prisma), actor = await auth.session(sessions[2].token);
      const before = { bookings: await prisma.booking.count({ where: { court_id: court.id } }), slots: await prisma.bookingSlot.count({ where: { booking: { court_id: court.id } } }), locks: await prisma.courtSlotLock.count({ where: { court_id: court.id } }) };
      const db = new Proxy(prisma, { get(target, key) { if (key === '$transaction') return (fn, options) => target.$transaction(tx => fn(new Proxy(tx, { get(value, property) { if (property === 'courtSlotLock') return new Proxy(value.courtSlotLock, { get(model, method) { if (method === 'createMany') return async args => { await model.createMany(args); throw Object.assign(new Error('Injected'), { code: 'TEST_FAILURE' }); }; return model[method]; } }); return value[property]; } })), options); return target[key]; } });
      await assert.rejects(createBookingService(db, storage, { flowVersion: 2 }).create(actor, input(body(12))), error => error.code === 'TEST_FAILURE');
      assert.deepEqual({ bookings: await prisma.booking.count({ where: { court_id: court.id } }), slots: await prisma.bookingSlot.count({ where: { booking: { court_id: court.id } } }), locks: await prisma.courtSlotLock.count({ where: { court_id: court.id } }) }, before);
    });

    await t.test('expiry plus subsequent failure rolls back status and lock release', async () => {
      const made = await create(13); const id = BigInt(made.body.data.id);
      await prisma.$executeRaw`UPDATE bookings SET confirmation_expires_at = clock_timestamp() - interval '1 millisecond' WHERE id = ${id}`;
      const auth = createAuthService(prisma), actor = await auth.session(sessions[1].token);
      const db = new Proxy(prisma, { get(target, key) { if (key === '$transaction') return (fn, options) => target.$transaction(tx => fn(new Proxy(tx, { get(value, property) { if (property === 'priceRule') return new Proxy(value.priceRule, { get(model, method) { if (method === 'findMany') return async () => { throw Object.assign(new Error('Injected'), { code: 'TEST_FAILURE' }); }; return model[method]; } }); return value[property]; } })), options); return target[key]; } });
      await assert.rejects(createBookingService(db, storage, { flowVersion: 2 }).create(actor, input(body(13))), error => error.code === 'TEST_FAILURE');
      assert.equal((await prisma.booking.findUnique({ where: { id } })).status, 'PENDING_CONFIRMATION');
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: id } } }), 1);
    });

    await t.test('Owner V2 confirm records audit metadata and keeps availability BOOKED', async () => {
      const made = await create(15); const id = BigInt(made.body.data.id);
      const list = await req('/owner/bookings?page=1&page_size=20', 0);
      const item = list.body.data.find(row => row.id === String(id));
      assert.equal(list.status, 200); assert.equal(item.transfer_reference, `CLDN ${id}`); assert.ok(item.confirmation_expires_at);
      const confirmed = await req(`/owner/bookings/${id}/confirm`, 0, 'POST', {});
      assert.equal(confirmed.status, 200); assert.equal(confirmed.body.data.booking.status, 'CONFIRMED');
      assert.equal(confirmed.body.data.booking.confirmed_by_user_id, String(users[0].id));
      assert.ok(confirmed.body.data.booking.confirmed_at);
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: id } } }), 1);
      assert.equal((await availability(15)).slot?.state, 'BOOKED');
    });

    await t.test('Owner V2 reject records reason, preserves slots and releases availability', async () => {
      const made = await create(16); const id = BigInt(made.body.data.id);
      const rejected = await req(`/owner/bookings/${id}/reject`, 0, 'POST', { reason: '  Không tìm thấy giao dịch  ' });
      assert.equal(rejected.status, 200); assert.equal(rejected.body.data.booking.status, 'REJECTED');
      assert.equal(rejected.body.data.booking.rejection_reason, 'Không tìm thấy giao dịch');
      assert.ok(rejected.body.data.booking.rejected_at);
      assert.equal(await prisma.bookingSlot.count({ where: { booking_id: id } }), 1);
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: id } } }), 0);
      assert.equal((await availability(16)).slot?.state, 'AVAILABLE');
    });

    await t.test('V2 Owner actions enforce ownership, capability and deadline', async () => {
      const made = await create(17); const id = BigInt(made.body.data.id);
      assert.equal((await req(`/owner/bookings/${id}/confirm`, 1, 'POST', {})).status, 404);
      assert.equal((await req(`/owner/bookings/${id}/confirm`, 2, 'POST', {})).status, 403);
      assert.equal((await req(`/owner/bookings/${id}/confirm`, 3, 'POST', {})).status, 403);
      await prisma.$executeRaw`UPDATE bookings SET confirmation_expires_at = clock_timestamp() WHERE id = ${id}`;
      const expiredResult = await req(`/owner/bookings/${id}/confirm`, 0, 'POST', {});
      assert.equal(expiredResult.status, 409); assert.equal(expiredResult.body.error.code, 'BOOKING_EXPIRED');
      assert.equal((await prisma.booking.findUnique({ where: { id } })).status, 'EXPIRED');
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: id } } }), 0);
    });

    await t.test('concurrent Confirm/Reject and Confirm/Confirm produce exactly one terminal transition', async () => {
      const first = await create(18); const firstId = BigInt(first.body.data.id);
      const race = await Promise.all([
        req(`/owner/bookings/${firstId}/confirm`, 0, 'POST', {}),
        req(`/owner/bookings/${firstId}/reject`, 0, 'POST', { reason: 'Không tìm thấy giao dịch' }),
      ]);
      assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
      assert.ok(['CONFIRMED','REJECTED'].includes((await prisma.booking.findUnique({ where: { id: firstId } })).status));
      const second = await create(19); const secondId = BigInt(second.body.data.id);
      const confirmations = await Promise.all([
        req(`/owner/bookings/${secondId}/confirm`, 0, 'POST', {}),
        req(`/owner/bookings/${secondId}/confirm`, 0, 'POST', {}),
      ]);
      assert.deepEqual(confirmations.map(result => result.status).sort(), [200, 409]);
      assert.equal((await prisma.booking.findUnique({ where: { id: secondId } })).status, 'CONFIRMED');
    });

    await t.test('V2 action body, Origin and V1 compatibility fail closed', async () => {
      const made = await create(20); const id = BigInt(made.body.data.id);
      assert.equal((await req(`/owner/bookings/${id}/confirm`, 0, 'POST', { status: 'CONFIRMED' })).status, 422);
      assert.equal((await req(`/owner/bookings/${id}/reject`, 0, 'POST', { reason: '' })).status, 422);
      const session = sessions[0];
      const badOrigin = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/owner/bookings/${id}/confirm`, { method:'POST', headers:{ Origin:'https://invalid.example', Cookie:`booking_session=${session.token}`, 'X-CSRF-Token':session.csrf, 'Content-Type':'application/json' }, body:'{}' });
      assert.equal(badOrigin.status, 403);
      await prisma.booking.update({ where: { id }, data: { booking_flow_version: 1, confirmation_expires_at: null } });
      const legacy = await req(`/owner/bookings/${id}/confirm`, 0, 'POST', {});
      assert.equal(legacy.status, 409); assert.equal(legacy.body.error.code, 'INVALID_BOOKING_FLOW');
    });

    console.log(`BOOKING V2 PERFORMANCE SANITY: create=${metrics.create.toFixed(1)}ms availability=${metrics.availability.toFixed(1)}ms lazy_expiry=${metrics.expiry.toFixed(1)}ms`);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await prisma.$transaction(async tx => {
        const ids = users.map(item => item.id), facilityIds = facilities.map(item => item.id), courtIds = courts.map(item => item.id);
        await tx.courtSlotLock.deleteMany({ where: { court_id: { in: courtIds } } });
        await tx.courtBlock.deleteMany({ where: { court_id: { in: courtIds } } });
        await tx.refund.deleteMany({ where: { booking: { court_id: { in: courtIds } } } });
        await tx.paymentProof.deleteMany({ where: { booking: { court_id: { in: courtIds } } } });
        await tx.bookingSlot.deleteMany({ where: { booking: { court_id: { in: courtIds } } } });
        await tx.booking.deleteMany({ where: { court_id: { in: courtIds }, customer_id: { in: ids } } });
        await tx.court.deleteMany({ where: { id: { in: courtIds } } });
        await tx.priceRule.deleteMany({ where: { facility_id: { in: facilityIds } } });
        await tx.bankAccount.deleteMany({ where: { facility_id: { in: facilityIds } } });
        await tx.facility.deleteMany({ where: { id: { in: facilityIds } } });
        await tx.ownerProfile.deleteMany({ where: { user_id: { in: ids } } });
        await tx.ownerRequest.deleteMany({ where: { user_id: { in: ids } } });
        await tx.authSession.deleteMany({ where: { user_id: { in: ids } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
      }, { maxWait: 20000, timeout: 30000 });
      assert.equal(await prisma.user.count({ where: { full_name: tag } }), 0);
      assert.equal(await prisma.facility.count({ where: { name: tag } }), 0);
      console.log('BOOKING V2 FIXTURE CLEANUP: PASS');
    } finally { await prisma.$disconnect(); }
  }
});
