import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/config/prisma.js';
import { passwordOptions } from '../src/modules/auth/password.js';
import { supportedDistricts } from '../src/modules/facilities/districts.js';

const PREFIX = 'TEST_E2E_CUSTOMER_';
const KEY = `${PREFIX}PHASE_5D`;
const backendRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(backendRoot, '../frontend/playwright/.auth/recurring-customer-fixture.json');
const emails = Object.freeze({
  customer: 'test_e2e_customer_phase_5d_customer@booking.invalid',
  owner: 'test_e2e_customer_phase_5d_owner@booking.invalid',
  admin: 'test_e2e_customer_phase_5d_admin@booking.invalid',
});

function targetFingerprint() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
  const url = new URL(process.env.DATABASE_URL);
  return createHash('sha256').update(`${url.protocol}//${url.hostname}:${url.port || 'default'}${url.pathname}`).digest('hex').slice(0, 16);
}

function assertEnvironment() {
  if (process.env.NODE_ENV !== 'development') throw new Error('E2E_FIXTURE_REQUIRES_DEVELOPMENT');
  const fingerprint = targetFingerprint();
  if (!process.env.DEMO_SEED_TARGET_FINGERPRINT || process.env.DEMO_SEED_TARGET_FINGERPRINT !== fingerprint) {
    throw new Error('E2E_FIXTURE_TARGET_FINGERPRINT_MISMATCH');
  }
  for (const value of Object.values(emails)) {
    if (!value.toUpperCase().startsWith(PREFIX)) throw new Error('E2E_FIXTURE_PREFIX_GUARD_FAILED');
  }
  return fingerprint;
}

function serialise(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item && typeof item === 'object' && typeof item.toFixed === 'function') return item.toFixed();
    return item;
  });
}

async function booking1119Fingerprint(db = prisma) {
  const booking = await db.booking.findUnique({
    where: { id: 1119n },
    include: { slots: { orderBy: { start_at: 'asc' } }, paymentProof: true, refund: true },
  });
  return booking ? createHash('sha256').update(serialise(booking)).digest('hex') : 'MISSING';
}

function localDateParts(date) {
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
}

function localInstant(parts, dayOffset, hour, minute = 0) {
  return new Date(Date.UTC(parts.year, parts.month, parts.day + dayOffset, hour - 7, minute, 0, 0));
}

function dateOnly(parts, dayOffset) {
  return new Date(Date.UTC(parts.year, parts.month, parts.day + dayOffset, 0, 0, 0, 0));
}

function timeOnly(hour, minute = 0) {
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
}

async function fixtureIds(tx) {
  const users = await tx.user.findMany({ where: { email_normalized: { in: Object.values(emails) } }, select: { id: true, email_normalized: true } });
  const userIds = users.map(item => item.id);
  const facilities = userIds.length
    ? await tx.facility.findMany({ where: { owner_id: { in: userIds }, name: { startsWith: PREFIX } }, select: { id: true, name: true } })
    : [];
  const facilityIds = facilities.map(item => item.id);
  const courts = facilityIds.length
    ? await tx.court.findMany({ where: { facility_id: { in: facilityIds }, name: { startsWith: PREFIX } }, select: { id: true, name: true } })
    : [];
  const courtIds = courts.map(item => item.id);
  const series = userIds.length
    ? await tx.bookingSeries.findMany({ where: { customer_id: { in: userIds }, facility_id: { in: facilityIds } }, select: { id: true } })
    : [];
  const seriesIds = series.map(item => item.id);
  const bookings = seriesIds.length
    ? await tx.booking.findMany({ where: { booking_series_id: { in: seriesIds } }, select: { id: true } })
    : [];
  return { users, userIds, facilities, facilityIds, courts, courtIds, seriesIds, bookingIds: bookings.map(item => item.id) };
}

function assertScoped(ids) {
  if (ids.users.some(item => !item.email_normalized.toUpperCase().startsWith(PREFIX))) throw new Error('E2E_FIXTURE_USER_SCOPE_VIOLATION');
  if (ids.facilities.some(item => !item.name.startsWith(PREFIX))) throw new Error('E2E_FIXTURE_FACILITY_SCOPE_VIOLATION');
  if (ids.courts.some(item => !item.name.startsWith(PREFIX))) throw new Error('E2E_FIXTURE_COURT_SCOPE_VIOLATION');
}

async function removeFixture(tx) {
  const ids = await fixtureIds(tx);
  assertScoped(ids);
  if (ids.bookingIds.length) {
    await tx.notification.deleteMany({ where: { booking_id: { in: ids.bookingIds } } });
    await tx.refund.deleteMany({ where: { booking_id: { in: ids.bookingIds } } });
    await tx.paymentProof.deleteMany({ where: { booking_id: { in: ids.bookingIds } } });
    await tx.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: { in: ids.bookingIds } } } });
    await tx.bookingSlot.deleteMany({ where: { booking_id: { in: ids.bookingIds } } });
    await tx.booking.deleteMany({ where: { id: { in: ids.bookingIds } } });
  }
  if (ids.seriesIds.length) await tx.bookingSeries.deleteMany({ where: { id: { in: ids.seriesIds } } });
  if (ids.courtIds.length) {
    await tx.courtBlock.deleteMany({ where: { court_id: { in: ids.courtIds } } });
    await tx.court.deleteMany({ where: { id: { in: ids.courtIds } } });
  }
  if (ids.facilityIds.length) {
    await tx.facilityAmenity.deleteMany({ where: { facility_id: { in: ids.facilityIds } } });
    await tx.facilityImage.deleteMany({ where: { facility_id: { in: ids.facilityIds } } });
    await tx.cancellationPolicy.deleteMany({ where: { facility_id: { in: ids.facilityIds } } });
    await tx.priceRule.deleteMany({ where: { facility_id: { in: ids.facilityIds } } });
    await tx.bankAccount.deleteMany({ where: { facility_id: { in: ids.facilityIds } } });
    await tx.facility.deleteMany({ where: { id: { in: ids.facilityIds } } });
  }
  if (ids.userIds.length) {
    await tx.ownerProfile.deleteMany({ where: { user_id: { in: ids.userIds } } });
    await tx.ownerRequest.deleteMany({ where: { user_id: { in: ids.userIds } } });
    await tx.authSession.deleteMany({ where: { user_id: { in: ids.userIds } } });
    await tx.passwordResetToken.deleteMany({ where: { user_id: { in: ids.userIds } } });
    await tx.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}

async function counts(db = prisma) {
  const ids = await fixtureIds(db);
  const bookingIds = ids.bookingIds;
  const [sessions, refunds, slots, locks] = await Promise.all([
    ids.userIds.length ? db.authSession.count({ where: { user_id: { in: ids.userIds } } }) : 0,
    bookingIds.length ? db.refund.count({ where: { booking_id: { in: bookingIds } } }) : 0,
    bookingIds.length ? db.bookingSlot.count({ where: { booking_id: { in: bookingIds } } }) : 0,
    bookingIds.length ? db.courtSlotLock.count({ where: { bookingSlot: { booking_id: { in: bookingIds } } } }) : 0,
  ]);
  return { users: ids.userIds.length, auth_sessions: sessions, facilities: ids.facilityIds.length, courts: ids.courtIds.length, booking_series: ids.seriesIds.length, bookings: bookingIds.length, refunds, booking_slots: slots, court_slot_locks: locks };
}

async function setup() {
  const fingerprint = assertEnvironment();
  const booking1119Before = await booking1119Fingerprint();
  const password = `E2e-${randomBytes(24).toString('base64url')}9a`;
  const passwordHash = await argon2.hash(password, passwordOptions);
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(202610185)`;
    await removeFixture(tx);
    const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
    const users = {};
    for (const [kind, email] of Object.entries(emails)) {
      users[kind] = await tx.user.create({ data: {
        email, email_normalized: email, password_hash: passwordHash,
        full_name: `${KEY}_${kind.toUpperCase()}`, phone: kind === 'customer' ? '0900000055' : null,
        role: kind === 'admin' ? 'ADMIN' : 'CUSTOMER', status: 'ACTIVE', created_at: now,
      } });
    }
    const request = await tx.ownerRequest.create({ data: {
      user_id: users.owner.id, status: 'APPROVED', applicant_name_snapshot: users.owner.full_name,
      applicant_email_snapshot: users.owner.email, applicant_phone_snapshot: null,
      reviewed_by: users.admin.id, reviewed_at: now, created_at: now,
    } });
    await tx.ownerProfile.create({ data: { user_id: users.owner.id, approved_request_id: request.id, created_at: now } });
    const facility = await tx.facility.create({ data: {
      owner_id: users.owner.id, name: `${PREFIX}PHASE_5D_FACILITY`, address: '55 Đường kiểm thử cô lập, Đà Nẵng',
      district: supportedDistricts[0], phone: '02360000055', description: 'Fixture E2E cô lập cho recurring booking Phase 5D.',
      opening_time: timeOnly(6), closing_time: timeOnly(22), status: 'ACTIVE', submitted_at: now,
      reviewed_by: users.admin.id, reviewed_at: now, created_at: now,
    } });
    const court = await tx.court.create({ data: { facility_id: facility.id, name: `${PREFIX}PHASE_5D_COURT`, description: 'Sân fixture E2E cô lập.', status: 'ACTIVE', created_at: now } });
    await tx.priceRule.create({ data: { facility_id: facility.id, start_time: timeOnly(6), end_time: timeOnly(22), hourly_rate: '80000', created_at: now } });
    await tx.cancellationPolicy.create({ data: { facility_id: facility.id, cutoff_hours: 2, created_at: now } });
    await tx.bankAccount.create({ data: { facility_id: facility.id, bank_name: 'Ngân hàng kiểm thử', account_number: 'E2E00000055', account_holder: 'TEST E2E CUSTOMER', qr_image_path: null, created_at: now } });

    const parts = localDateParts(now);
    const dates = [-7, 0, 7, 14].map(offset => ({ offset, start: localInstant(parts, offset, 18), end: localInstant(parts, offset, 19) }));
    const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const confirmedAt = new Date(createdAt.getTime() + 60 * 60 * 1000);
    const series = await tx.bookingSeries.create({ data: {
      customer_id: users.customer.id, facility_id: facility.id, court_id: court.id,
      weekday: ((dates[0].start.getUTCDay() + 6) % 7) + 1, start_time: timeOnly(18), end_time: timeOnly(19),
      starts_on: dateOnly(parts, -7), ends_on: dateOnly(parts, 14), occurrence_count: 4, status: 'CONFIRMED',
      confirmation_expires_at: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000), total_amount: '320000', deposit_amount: '96000', remaining_amount: '224000',
      bank_name_snapshot: 'Ngân hàng kiểm thử', account_number_snapshot: 'E2E00000055', account_holder_snapshot: 'TEST E2E CUSTOMER',
      qr_image_path_snapshot: null, facility_name_snapshot: facility.name, facility_address_snapshot: facility.address, court_name_snapshot: court.name,
      confirmed_at: confirmedAt, confirmed_by_user_id: users.owner.id, created_at: createdAt,
    } });

    const statuses = ['COMPLETED', 'CANCELLED', 'CONFIRMED', 'CONFIRMED'];
    const bookingIds = [];
    let refundId = null;
    for (let index = 0; index < dates.length; index++) {
      const status = statuses[index];
      const cancelledAt = status === 'CANCELLED' ? new Date(Math.min(now.getTime() - 60_000, dates[index].start.getTime() - 60 * 60 * 1000)) : null;
      const booking = await tx.booking.create({ data: {
        customer_id: users.customer.id, court_id: court.id, booking_series_id: series.id, status, booking_flow_version: 2,
        start_at: dates[index].start, end_at: dates[index].end, expires_at: new Date(createdAt.getTime() + 5 * 60 * 1000),
        confirmation_expires_at: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000), total_amount: '80000', deposit_amount: '24000', remaining_amount: '56000',
        cancellation_cutoff_hours_snapshot: 2, bank_name_snapshot: 'Ngân hàng kiểm thử', account_number_snapshot: 'E2E00000055',
        account_holder_snapshot: 'TEST E2E CUSTOMER', qr_image_path_snapshot: null, facility_name_snapshot: facility.name,
        facility_address_snapshot: facility.address, court_name_snapshot: court.name, confirmed_at: confirmedAt,
        confirmed_by_user_id: users.owner.id, completed_at: status === 'COMPLETED' ? new Date(dates[index].end.getTime() + 60_000) : null,
        cancelled_at: cancelledAt, cancelled_by: status === 'CANCELLED' ? 'CUSTOMER' : null, cancellation_reason: null, created_at: createdAt,
      } });
      bookingIds.push(booking.id);
      for (let slot = 0; slot < 2; slot++) {
        const slotStart = new Date(dates[index].start.getTime() + slot * 30 * 60 * 1000);
        const bookingSlot = await tx.bookingSlot.create({ data: { booking_id: booking.id, start_at: slotStart, end_at: new Date(slotStart.getTime() + 30 * 60 * 1000), hourly_rate_snapshot: '80000', slot_amount: '40000', created_at: createdAt } });
        if (status === 'CONFIRMED') await tx.courtSlotLock.create({ data: { court_id: court.id, start_at: slotStart, booking_slot_id: bookingSlot.id, created_at: createdAt } });
      }
      if (status === 'CANCELLED') {
        const refund = await tx.refund.create({ data: { booking_id: booking.id, amount: '24000', status: 'PENDING', reason: 'Khách hàng hủy một buổi trong lịch cố định.', requested_at: cancelledAt, created_at: cancelledAt } });
        refundId = refund.id;
      }
    }
    return { customerId: users.customer.id, facilityId: facility.id, courtId: court.id, seriesId: series.id, bookingIds, refundId };
  }, { maxWait: 20_000, timeout: 120_000 });

  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({
    fixture: KEY, email: emails.customer, password, series_id: result.seriesId.toString(),
    booking_ids: result.bookingIds.map(String), refund_id: result.refundId?.toString() ?? null,
    booking_1119_fingerprint: booking1119Before, target_fingerprint: fingerprint,
  }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ mode: 'SETUP', fixture: KEY, series_id: result.seriesId.toString(), states: { COMPLETED: 1, CANCELLED: 1, CONFIRMED: 2 }, refund: { PENDING: 1 }, counts: await counts() }));
}

async function cleanup() {
  assertEnvironment();
  let manifest = null;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(202610185)`;
        await removeFixture(tx);
      }, { maxWait: 20_000, timeout: 120_000 });
      break;
    } catch (error) {
      if (error?.code !== 'P2034' || attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  const finalCounts = await counts();
  const current1119 = await booking1119Fingerprint();
  const booking1119Unchanged = manifest ? manifest.booking_1119_fingerprint === current1119 : null;
  await rm(manifestPath, { force: true });
  console.log(JSON.stringify({ mode: 'CLEANUP', fixture: KEY, counts: finalCounts, booking_1119_unchanged: booking1119Unchanged }));
  if (Object.values(finalCounts).some(value => value !== 0)) throw new Error('E2E_FIXTURE_CLEANUP_INCOMPLETE');
  if (booking1119Unchanged === false) throw new Error('BOOKING_1119_CHANGED');
}

async function verify() {
  assertEnvironment();
  const currentCounts = await counts();
  console.log(JSON.stringify({ mode: 'VERIFY', fixture: KEY, counts: currentCounts, booking_1119: await booking1119Fingerprint() === 'MISSING' ? 'MISSING' : 'EXISTS' }));
}

const command = process.argv[2];
try {
  if (command === 'setup') await setup();
  else if (command === 'cleanup') await cleanup();
  else if (command === 'verify') await verify();
  else throw new Error('USAGE: e2e-customer-fixture.js <setup|cleanup|verify>');
} finally {
  await prisma.$disconnect();
}
