import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/service.js';

const TIME = value => new Date(`1970-01-01T${value}:00.000Z`);

test('Owner Analytics PostgreSQL aggregation, isolation and cleanup', { timeout: 600000 }, async t => {
  const tag = `TEST_ANALYTICS_${randomUUID()}`;
  const emails = ['owner', 'other-owner', 'customer'].map(name => `${tag}-${name}@example.invalid`.toLowerCase());
  const password = `Test${randomBytes(20).toString('hex')}1`;
  const auth = createAuthService(prisma);
  const config = { nodeEnv: 'development', frontendUrl: 'http://localhost:5173', bookingFlowVersion: 1 };
  const users = [], facilities = [], courts = [], bookings = [];
  let server, series;
  try {
    for (let i = 0; i < emails.length; i++) {
      await auth.register({ email: emails[i], password, full_name: `${tag}-${i}` });
      users.push(await prisma.user.findUnique({ where: { email_normalized: emails[i] } }));
    }
    for (const owner of users.slice(0, 2)) {
      const request = await prisma.ownerRequest.create({ data: { user_id: owner.id, status: 'APPROVED', applicant_name_snapshot: tag,
        applicant_email_snapshot: owner.email, reviewed_by: owner.id, reviewed_at: new Date(), created_at: new Date() } });
      await prisma.ownerProfile.create({ data: { user_id: owner.id, approved_request_id: request.id, created_at: new Date() } });
    }
    const createFacility = async (owner, suffix) => {
      const facility = await prisma.facility.create({ data: { owner_id: owner.id, name: `${tag}-${suffix}`, address: tag,
        district: 'Phường Hải Châu', phone: '0123456789', opening_time: TIME('06:00'), closing_time: TIME('22:00'), status: 'ACTIVE', created_at: new Date() } });
      facilities.push(facility); return facility;
    };
    const own = await createFacility(users[0], 'own');
    const foreign = await createFacility(users[1], 'foreign');
    const zero = await createFacility(users[0], 'zero');
    for (const [facility, names] of [[own, ['A', 'B']], [foreign, ['X']]]) {
      for (const name of names) courts.push(await prisma.court.create({ data: { facility_id: facility.id, name: `${tag}-${name}`, status: 'ACTIVE', created_at: new Date() } }));
    }
    courts.push(await prisma.court.create({ data: { facility_id: zero.id, name: `${tag}-inactive`, status: 'INACTIVE', created_at: new Date() } }));
    series = await prisma.bookingSeries.create({ data: { customer_id: users[2].id, facility_id: own.id, court_id: courts[0].id,
      weekday: 7, start_time: TIME('18:00'), end_time: TIME('18:30'), starts_on: new Date('2026-02-01T00:00:00Z'), ends_on: new Date('2026-02-01T00:00:00Z'),
      occurrence_count: 1, status: 'CONFIRMED', confirmation_expires_at: new Date('2026-02-01T10:00:00Z'),
      total_amount: '100000', deposit_amount: '30000', remaining_amount: '70000', bank_name_snapshot: tag, account_number_snapshot: '1',
      account_holder_snapshot: tag, facility_name_snapshot: own.name, facility_address_snapshot: tag, court_name_snapshot: courts[0].name,
      confirmed_at: new Date('2026-02-01T10:00:00Z'), confirmed_by_user_id: users[0].id, created_at: new Date() } });
    const startBase = new Date('2026-02-01T11:00:00.000Z'); // 18:00 local, Sunday.
    const statuses = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'PENDING_CONFIRMATION', 'PENDING_PAYMENT'];
    const totals = ['100000', '120000', '100000', '80000', '80000', '80000', '80000'];
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i], start = status === 'CANCELLED' ? new Date('2026-01-31T17:30:00Z') : new Date(+startBase + i * 1_800_000), end = new Date(+start + 1_800_000);
      const total = BigInt(totals[i]), deposit = total * 30n / 100n;
      const confirmed = ['CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(status);
      const booking = await prisma.booking.create({ data: {
        customer_id: users[2].id, court_id: courts[0].id, booking_series_id: status === 'CANCELLED' ? series.id : null,
        status, booking_flow_version: status === 'CANCELLED' ? 2 : 1, confirmation_expires_at: status === 'CANCELLED' ? new Date(+start - 300_000) : null,
        start_at: start, end_at: end,
        expires_at: new Date(+start - 300_000), total_amount: total.toString(), deposit_amount: deposit.toString(), remaining_amount: (total - deposit).toString(),
        bank_name_snapshot: tag, account_number_snapshot: '1', account_holder_snapshot: tag,
        facility_name_snapshot: own.name, facility_address_snapshot: tag, court_name_snapshot: courts[0].name,
        confirmed_at: confirmed ? (status === 'CANCELLED' ? series.confirmed_at : new Date(+start - 3_600_000)) : null, confirmed_by_user_id: confirmed ? users[0].id : null,
        completed_at: status === 'COMPLETED' ? end : null,
        cancelled_at: status === 'CANCELLED' ? new Date(+start - 1_000) : null, cancelled_by: status === 'CANCELLED' ? 'OWNER' : null,
        cancellation_reason: status === 'CANCELLED' ? tag : null,
        rejected_at: status === 'REJECTED' ? new Date(+start - 1_000) : null, rejection_reason: status === 'REJECTED' ? tag : null,
        expired_at: status === 'EXPIRED' ? new Date(+start - 1_000) : null, created_at: new Date(+start - 7_200_000),
      } });
      bookings.push(booking);
      await prisma.bookingSlot.create({ data: { booking_id: booking.id, start_at: start, end_at: end,
        hourly_rate_snapshot: (total * 2n).toString(), slot_amount: total.toString(), created_at: new Date() } });
    }
    const cancelled = bookings[2];
    await prisma.refund.create({ data: { booking_id: cancelled.id, amount: cancelled.deposit_amount, status: 'REFUNDED', reason: tag,
      proof_image_path: tag, proof_mime_type: 'image/png', proof_size_bytes: 10n,
      requested_at: new Date(+cancelled.start_at - 3_000_000), proof_submitted_at: new Date(+cancelled.start_at - 2_000_000),
      confirmed_at: new Date(+cancelled.start_at - 1_000_000), refunded_at: new Date(+cancelled.start_at - 1_000_000), created_at: new Date() } });
    for (const [index, refundStatus] of ['PENDING', 'PROOF_SUBMITTED'].entries()) {
      const start = new Date(`2026-01-31T${19 + index}:00:00Z`), end = new Date(+start + 1_800_000);
      const booking = await prisma.booking.create({ data: { customer_id: users[2].id, court_id: courts[0].id, status: 'CANCELLED',
        start_at: start, end_at: end, expires_at: new Date(+start - 300_000), total_amount: '100000', deposit_amount: '30000', remaining_amount: '70000',
        bank_name_snapshot: tag, account_number_snapshot: '1', account_holder_snapshot: tag, facility_name_snapshot: own.name,
        facility_address_snapshot: tag, court_name_snapshot: courts[0].name, confirmed_at: new Date(+start - 3_600_000), confirmed_by_user_id: users[0].id,
        cancelled_at: new Date(+start - 1_000), cancelled_by: 'OWNER', cancellation_reason: tag, created_at: new Date(+start - 7_200_000) } });
      bookings.push(booking);
      await prisma.bookingSlot.create({ data: { booking_id: booking.id, start_at: start, end_at: end, hourly_rate_snapshot: '200000', slot_amount: '100000', created_at: new Date() } });
      await prisma.paymentProof.create({ data: { booking_id: booking.id, image_path: `${tag}-${refundStatus}`, mime_type: 'image/png', size_bytes: 10n,
        status: 'APPROVED', submitted_at: new Date(+start - 7_200_000), reviewed_by: users[0].id, reviewed_at: new Date(+start - 3_600_000), created_at: new Date() } });
      const submitted = refundStatus === 'PROOF_SUBMITTED' ? new Date(+start - 2_000_000) : null;
      await prisma.refund.create({ data: { booking_id: booking.id, amount: '30000', status: refundStatus, reason: tag,
        proof_image_path: submitted ? `${tag}-refund` : null, proof_mime_type: submitted ? 'image/png' : null,
        proof_size_bytes: submitted ? 10n : null, requested_at: new Date(+start - 3_000_000), proof_submitted_at: submitted, created_at: new Date() } });
    }
    await prisma.courtBlock.create({ data: { court_id: courts[1].id, start_at: new Date('2026-01-31T23:00:00Z'), end_at: new Date('2026-01-31T23:30:00Z'), reason: tag, created_by: users[0].id, created_at: new Date() } });

    const sessions = [];
    for (const email of emails) sessions.push(await auth.login({ email, password }));
    server = createApp(prisma, config).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const request = async (path, session) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { headers: session ? { Cookie: `booking_session=${session.token}` } : {}, signal: AbortSignal.timeout(60_000) });
      return { status: response.status, body: await response.json() };
    };
    const query = 'from=2026-02-01&to=2026-02-01';
    await t.test('authentication, capability, strict validation and ownership concealment', async () => {
      assert.equal((await request(`/owner/analytics/overview?${query}`)).status, 401);
      assert.equal((await request(`/owner/analytics/overview?${query}`, sessions[2])).status, 403);
      assert.equal((await request('/owner/analytics/overview?from=2024-01-01&to=2025-01-01', sessions[0])).status, 422);
      assert.equal((await request(`/owner/analytics/overview?${query}&unknown=1`, sessions[0])).status, 422);
      assert.equal((await request(`/owner/analytics/overview?${query}&facility_id=${foreign.id}`, sessions[0])).status, 404);
    });
    await t.test('overview aggregates status, money, local buckets, capacity and block exactly', async () => {
      const response = await request(`/owner/analytics/overview?${query}&facility_id=${own.id}`, sessions[0]);
      assert.equal(response.status, 200);
      const data = response.body.data;
      assert.deepEqual(data.range, { from: '2026-02-01', to: '2026-02-01', timezone: 'Asia/Ho_Chi_Minh', facility_id: String(own.id) });
      assert.equal(data.summary.confirmed_booking_count, 2);
      assert.equal(data.summary.completed_booking_count, 1);
      assert.equal(data.summary.cancelled_booking_count, 3);
      assert.equal(data.summary.confirmed_hours, '1.0');
      assert.equal(data.summary.confirmed_booking_value, '220000');
      assert.equal(data.summary.confirmed_deposit_amount, '156000');
      assert.equal(data.summary.refunded_deposit_amount, '30000');
      assert.equal(data.summary.net_known_deposit_amount, '126000');
      assert.equal(data.summary.operational_capacity_slots, 63);
      assert.equal(data.summary.confirmed_occupied_slots, 2);
      assert.equal(data.daily_capacity[0].blocked_slots, 1);
      assert.equal(data.daily_capacity[0].available_slots, 61);
      assert.equal(data.monthly_trend[0].month, '2026-02');
      assert.equal(data.monthly_trend[0].cancelled_count, 3); // UTC Jan 31 is local Feb 1.
      assert.equal(data.weekday_usage[6].weekday, 7);
      assert.equal(data.weekday_usage[6].confirmed_count, 2);
      assert.ok(data.hourly_heatmap.some(row => row.weekday === 7 && row.start_time === '18:00' && row.occupied_slots === 1));
      for (const key of ['customer', 'bank_name', 'image_path', 'CourtSlotLock']) assert.ok(!JSON.stringify(response.body).includes(key));
    });
    await t.test('court performance is deterministic, paginated and aggregate-only', async () => {
      const first = await request(`/owner/analytics/courts?${query}&facility_id=${own.id}&page=1&page_size=1`, sessions[0]);
      const second = await request(`/owner/analytics/courts?${query}&facility_id=${own.id}&page=2&page_size=1`, sessions[0]);
      assert.equal(first.status, 200); assert.equal(first.body.meta.total, 2);
      assert.deepEqual(Object.keys(first.body.meta).sort(), ['page','page_size','server_time','total']);
      assert.equal(first.body.data[0].court_id, String(courts[0].id));
      assert.equal(first.body.data[0].confirmed_booking_count, 2);
      assert.equal(first.body.data[0].confirmed_hours, '1.0');
      assert.equal(second.body.data[0].court_id, String(courts[1].id));
      assert.equal(second.body.data[0].blocked_slots, 1);
    });
    await t.test('zero active Court capacity returns null utilization', async () => {
      const response = await request(`/owner/analytics/overview?${query}&facility_id=${zero.id}`, sessions[0]);
      assert.equal(response.status, 200); assert.equal(response.body.data.summary.operational_capacity_slots, 0);
      assert.equal(response.body.data.summary.utilization_rate, null);
      assert.equal((await request(`/owner/analytics/courts?${query}&facility_id=${zero.id}`, sessions[0])).body.meta.total, 0);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      const bookingIds = bookings.map(row => row.id);
      await prisma.refund.deleteMany({ where: { booking_id: { in: bookingIds } } });
      await prisma.paymentProof.deleteMany({ where: { booking_id: { in: bookingIds } } });
      await prisma.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: { in: bookingIds } } } });
      await prisma.bookingSlot.deleteMany({ where: { booking_id: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
      if (series) await prisma.bookingSeries.deleteMany({ where: { id: series.id } });
      await prisma.courtBlock.deleteMany({ where: { court_id: { in: courts.map(row => row.id) } } });
      await prisma.court.deleteMany({ where: { id: { in: courts.map(row => row.id) } } });
      await prisma.facility.deleteMany({ where: { id: { in: facilities.map(row => row.id) } } });
      await prisma.authSession.deleteMany({ where: { user_id: { in: users.map(row => row.id) } } });
      await prisma.ownerProfile.deleteMany({ where: { user_id: { in: users.map(row => row.id) } } });
      await prisma.ownerRequest.deleteMany({ where: { user_id: { in: users.map(row => row.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
      assert.equal(await prisma.user.count({ where: { email_normalized: { startsWith: tag.toLowerCase() } } }), 0);
      assert.equal(await prisma.facility.count({ where: { name: { startsWith: tag } } }), 0);
      assert.equal(await prisma.court.count({ where: { name: { startsWith: tag } } }), 0);
      assert.equal(await prisma.booking.count({ where: { facility_name_snapshot: { startsWith: tag } } }), 0);
      assert.equal(await prisma.bookingSeries.count({ where: { facility_name_snapshot: { startsWith: tag } } }), 0);
      assert.equal(await prisma.refund.count({ where: { reason: tag } }), 0);
      assert.equal(await prisma.courtBlock.count({ where: { reason: tag } }), 0);
      console.log('OWNER ANALYTICS FIXTURE CLEANUP: PASS');
    } finally { await prisma.$disconnect(); }
  }
});
