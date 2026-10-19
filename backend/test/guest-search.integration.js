import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';

test('Guest Search PostgreSQL interval semantics and read-only cleanup', { timeout: 600000 }, async t => {
  const tag = `TEST_GUEST_SEARCH_${randomUUID()}`;
  const time = value => new Date(`1970-01-01T${value}:00.000Z`);
  const storage = { url: id => `https://images.example.invalid/${id}` };
  let server, owner, customer, facility, courts = [], booking;
  try {
    const [{ now, day }] = await prisma.$queryRaw`SELECT clock_timestamp() AS now,
      to_char((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, 'YYYY-MM-DD') AS day`;
    const user = async suffix => prisma.user.create({ data: { email: `${tag}-${suffix}@example.invalid`, email_normalized: `${tag}-${suffix}@example.invalid`.toLowerCase(), full_name: tag, google_subject: `${tag}-${suffix}`, role: 'CUSTOMER', status: 'ACTIVE', created_at: now } });
    owner = await user('owner'); customer = await user('customer');
    const request = await prisma.ownerRequest.create({ data: { user_id: owner.id, status: 'APPROVED', applicant_name_snapshot: tag, applicant_email_snapshot: owner.email, reviewed_by: owner.id, reviewed_at: now, created_at: now } });
    await prisma.ownerProfile.create({ data: { user_id: owner.id, approved_request_id: request.id, created_at: now } });
    facility = await prisma.facility.create({ data: { owner_id: owner.id, name: tag, address: 'Fixture', district: 'Phường Hải Châu', phone: '0123456789', opening_time: time('06:00'), closing_time: time('22:00'), status: 'ACTIVE', created_at: now } });
    courts = await Promise.all(['A', 'B'].map(name => prisma.court.create({ data: { facility_id: facility.id, name: `${tag}-${name}`, status: 'ACTIVE', created_at: now } })));
    await prisma.priceRule.create({ data: { facility_id: facility.id, start_time: time('06:00'), end_time: time('22:00'), hourly_rate: '100000', created_at: now } });
    const start = new Date(`${day}T18:00:00+07:00`), end = new Date(`${day}T20:00:00+07:00`);
    const makeBooking = async ({ status, version = 1, expires = new Date(+now + 3600000), confirmation = null, from = start, to = end }) => {
      booking = await prisma.booking.create({ data: { customer_id: customer.id, court_id: courts[0].id, status, booking_flow_version: version,
        start_at: from, end_at: to, expires_at: expires, confirmation_expires_at: version === 2 ? confirmation : null,
        total_amount: '100000', deposit_amount: '30000', remaining_amount: '70000', bank_name_snapshot: 'Fixture', account_number_snapshot: '1', account_holder_snapshot: 'Fixture',
        facility_name_snapshot: tag, facility_address_snapshot: 'Fixture', court_name_snapshot: courts[0].name,
        rejection_reason: status === 'REJECTED' ? 'Fixture' : null, cancelled_by: status === 'CANCELLED' ? 'CUSTOMER' : null,
        cancelled_at: status === 'CANCELLED' ? now : null, created_at: now } });
      return booking;
    };
    const clearBooking = async () => {
      if (!booking) return;
      await prisma.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: booking.id } } });
      await prisma.bookingSlot.deleteMany({ where: { booking_id: booking.id } });
      await prisma.booking.delete({ where: { id: booking.id } }); booking = null;
    };
    server = createApp(prisma, { nodeEnv: 'development', frontendUrl: 'http://localhost:5173' }, undefined, undefined, undefined, storage).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const search = async (extra = {}) => {
      const query = new URLSearchParams({ q: tag, district: 'Phường Hải Châu', date: day, start_time: '18:00', end_time: '20:00', ...extra });
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/facilities?${query}`, { signal: AbortSignal.timeout(60000) });
      return { status: response.status, body: await response.json() };
    };
    const matching = async () => (await search()).body.data?.[0]?.matching_courts?.map(value => value.id) ?? [];
    await t.test('fully priced Courts match, pagination is by Facility and DTO is public', async () => {
      const response = await search({ page_size: '1' }); assert.equal(response.status, 200); assert.equal(response.body.meta.total, 1);
      assert.deepEqual(response.body.data[0].matching_courts.map(value => value.id), courts.map(value => String(value.id)));
      for (const forbidden of ['owner_id', 'account_number', 'image_path', 'CourtSlotLock']) assert.ok(!JSON.stringify(response.body).includes(forbidden));
    });
    await t.test('CourtBlock and half-open boundaries are enforced', async () => {
      const block = await prisma.courtBlock.create({ data: { court_id: courts[0].id, start_at: new Date(+start + 1800000), end_at: new Date(+start + 3600000), reason: 'Fixture', created_by: owner.id, created_at: now } });
      assert.deepEqual(await matching(), [String(courts[1].id)]); await prisma.courtBlock.delete({ where: { id: block.id } });
      const boundary = await prisma.courtBlock.create({ data: { court_id: courts[0].id, start_at: end, end_at: new Date(+end + 1800000), reason: 'Fixture', created_by: owner.id, created_at: now } });
      assert.deepEqual(await matching(), courts.map(value => String(value.id))); await prisma.courtBlock.delete({ where: { id: boundary.id } });
    });
    await t.test('V1/V2 effective holds block while stale and terminal states do not mutate or block', async () => {
      const cases = [
        [{ status: 'CONFIRMED' }, false],
        [{ status: 'PENDING_PAYMENT', expires: new Date(+now + 3600000) }, false],
        [{ status: 'PENDING_PAYMENT', expires: new Date(+now - 1000) }, true],
        [{ status: 'PENDING_CONFIRMATION', version: 2, confirmation: new Date(+now + 3600000) }, false],
        [{ status: 'PENDING_CONFIRMATION', version: 2, confirmation: new Date(+now - 1000) }, true],
        [{ status: 'REJECTED', version: 2, confirmation: new Date(+now - 1000) }, true],
        [{ status: 'EXPIRED', version: 2, confirmation: new Date(+now - 1000) }, true],
        [{ status: 'CANCELLED' }, true],
      ];
      for (const [data, shouldMatch] of cases) {
        const row = await makeBooking(data);
        if (data.version === 2 && data.status === 'PENDING_CONFIRMATION' && shouldMatch) {
          const slot = await prisma.bookingSlot.create({ data: { booking_id: row.id, start_at: start, end_at: new Date(+start + 1800000), hourly_rate_snapshot: '100000', slot_amount: '50000', created_at: now } });
          await prisma.courtSlotLock.create({ data: { court_id: courts[0].id, start_at: start, booking_slot_id: slot.id, created_at: now } });
        }
        assert.equal((await matching()).includes(String(courts[0].id)), shouldMatch);
        const after = await prisma.booking.findUnique({ where: { id: row.id } });
        assert.equal(after.status, data.status);
        if (data.version === 2 && data.status === 'PENDING_CONFIRMATION' && shouldMatch) assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: row.id } } }), 1);
        await clearBooking();
      }
    });
    await t.test('unpriced coverage removes the Facility and normal list remains compatible', async () => {
      const rule = await prisma.priceRule.findFirst({ where: { facility_id: facility.id } }); await prisma.priceRule.delete({ where: { id: rule.id } });
      assert.equal((await search()).body.meta.total, 0);
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/facilities?q=${encodeURIComponent(tag)}`);
      const body = await response.json(); assert.equal(response.status, 200); assert.equal(body.meta.total, 1); assert.ok(!Object.hasOwn(body.data[0], 'matching_courts'));
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      if (booking) {
        await prisma.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: booking.id } } });
        await prisma.bookingSlot.deleteMany({ where: { booking_id: booking.id } });
        await prisma.booking.deleteMany({ where: { id: booking.id } });
      }
      if (facility) {
        await prisma.courtBlock.deleteMany({ where: { court_id: { in: courts.map(value => value.id) } } });
        await prisma.priceRule.deleteMany({ where: { facility_id: facility.id } });
        await prisma.court.deleteMany({ where: { facility_id: facility.id } });
        await prisma.facility.delete({ where: { id: facility.id } });
      }
      if (owner) {
        await prisma.ownerProfile.deleteMany({ where: { user_id: owner.id } });
        await prisma.ownerRequest.deleteMany({ where: { user_id: owner.id } });
      }
      await prisma.user.deleteMany({ where: { id: { in: [owner?.id, customer?.id].filter(Boolean) } } });
      assert.equal(await prisma.user.count({ where: { email_normalized: { startsWith: tag.toLowerCase() } } }), 0);
      console.log('GUEST SEARCH FIXTURE CLEANUP: PASS');
    } finally { await prisma.$disconnect(); }
  }
});
