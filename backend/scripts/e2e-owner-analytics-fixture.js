import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/config/prisma.js';
import { passwordOptions } from '../src/modules/auth/password.js';
import { supportedDistricts } from '../src/modules/facilities/districts.js';

const PREFIX = 'TEST_E2E_OWNER_ANALYTICS_';
const KEY = `${PREFIX}PHASE_4`;
const backendRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(backendRoot, '../frontend/playwright/.auth/owner-analytics-fixture.json');
const emails = Object.freeze({
  owner: 'test_e2e_owner_analytics_phase_4_owner@booking.invalid',
  customer: 'test_e2e_owner_analytics_phase_4_customer@booking.invalid',
  admin: 'test_e2e_owner_analytics_phase_4_admin@booking.invalid',
});

function fingerprint() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
  const url = new URL(process.env.DATABASE_URL);
  return createHash('sha256').update(`${url.protocol}//${url.hostname}:${url.port || 'default'}${url.pathname}`).digest('hex').slice(0, 16);
}

function assertEnvironment() {
  if (process.env.NODE_ENV !== 'development') throw new Error('E2E_FIXTURE_REQUIRES_DEVELOPMENT');
  const current = fingerprint();
  if (!process.env.DEMO_SEED_TARGET_FINGERPRINT || current !== process.env.DEMO_SEED_TARGET_FINGERPRINT) throw new Error('E2E_FIXTURE_TARGET_FINGERPRINT_MISMATCH');
  if (Object.values(emails).some(value => !value.toUpperCase().startsWith(PREFIX))) throw new Error('E2E_FIXTURE_PREFIX_GUARD_FAILED');
  return current;
}

function serialise(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item?.toFixed instanceof Function ? item.toFixed() : item);
}

async function booking1119Fingerprint(db = prisma) {
  const booking = await db.booking.findUnique({ where: { id: 1119n }, include: { slots: { orderBy: { start_at: 'asc' } }, paymentProof: true, refund: true } });
  return booking ? createHash('sha256').update(serialise(booking)).digest('hex') : 'MISSING';
}

function localParts(date) {
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
}
const localInstant = (parts, offset, hour, minute = 0) => new Date(Date.UTC(parts.year, parts.month, parts.day + offset, hour - 7, minute));
const timeOnly = (hour, minute = 0) => new Date(Date.UTC(1970, 0, 1, hour, minute));

async function ids(tx) {
  const users = await tx.user.findMany({ where: { email_normalized: { in: Object.values(emails) } }, select: { id: true, email_normalized: true } });
  const userIds = users.map(row => row.id);
  const facilities = userIds.length ? await tx.facility.findMany({ where: { owner_id: { in: userIds }, name: { startsWith: PREFIX } }, select: { id: true, name: true } }) : [];
  const facilityIds = facilities.map(row => row.id);
  const courts = facilityIds.length ? await tx.court.findMany({ where: { facility_id: { in: facilityIds }, name: { startsWith: PREFIX } }, select: { id: true, name: true } }) : [];
  const courtIds = courts.map(row => row.id);
  const bookings = courtIds.length ? await tx.booking.findMany({ where: { court_id: { in: courtIds }, facility_name_snapshot: { startsWith: PREFIX } }, select: { id: true } }) : [];
  return { users, userIds, facilities, facilityIds, courts, courtIds, bookingIds: bookings.map(row => row.id) };
}

function assertScoped(scope) {
  if (scope.users.some(row => !row.email_normalized.toUpperCase().startsWith(PREFIX))) throw new Error('E2E_FIXTURE_USER_SCOPE_VIOLATION');
  if (scope.facilities.some(row => !row.name.startsWith(PREFIX))) throw new Error('E2E_FIXTURE_FACILITY_SCOPE_VIOLATION');
  if (scope.courts.some(row => !row.name.startsWith(PREFIX))) throw new Error('E2E_FIXTURE_COURT_SCOPE_VIOLATION');
}

async function removeFixture(tx) {
  const scope = await ids(tx); assertScoped(scope);
  if (scope.bookingIds.length) {
    await tx.notification.deleteMany({ where: { booking_id: { in: scope.bookingIds } } });
    await tx.refund.deleteMany({ where: { booking_id: { in: scope.bookingIds } } });
    await tx.paymentProof.deleteMany({ where: { booking_id: { in: scope.bookingIds } } });
    await tx.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: { in: scope.bookingIds } } } });
    await tx.bookingSlot.deleteMany({ where: { booking_id: { in: scope.bookingIds } } });
    await tx.booking.deleteMany({ where: { id: { in: scope.bookingIds } } });
  }
  if (scope.courtIds.length) {
    await tx.courtBlock.deleteMany({ where: { court_id: { in: scope.courtIds } } });
    await tx.court.deleteMany({ where: { id: { in: scope.courtIds } } });
  }
  if (scope.facilityIds.length) {
    await tx.cancellationPolicy.deleteMany({ where: { facility_id: { in: scope.facilityIds } } });
    await tx.priceRule.deleteMany({ where: { facility_id: { in: scope.facilityIds } } });
    await tx.bankAccount.deleteMany({ where: { facility_id: { in: scope.facilityIds } } });
    await tx.facility.deleteMany({ where: { id: { in: scope.facilityIds } } });
  }
  if (scope.userIds.length) {
    await tx.ownerProfile.deleteMany({ where: { user_id: { in: scope.userIds } } });
    await tx.ownerRequest.deleteMany({ where: { user_id: { in: scope.userIds } } });
    await tx.authSession.deleteMany({ where: { user_id: { in: scope.userIds } } });
    await tx.passwordResetToken.deleteMany({ where: { user_id: { in: scope.userIds } } });
    await tx.user.deleteMany({ where: { id: { in: scope.userIds } } });
  }
}

async function counts(db = prisma) {
  const scope = await ids(db);
  const [sessions, profiles, slots, locks, blocks] = await Promise.all([
    scope.userIds.length ? db.authSession.count({ where: { user_id: { in: scope.userIds } } }) : 0,
    scope.userIds.length ? db.ownerProfile.count({ where: { user_id: { in: scope.userIds } } }) : 0,
    scope.bookingIds.length ? db.bookingSlot.count({ where: { booking_id: { in: scope.bookingIds } } }) : 0,
    scope.bookingIds.length ? db.courtSlotLock.count({ where: { bookingSlot: { booking_id: { in: scope.bookingIds } } } }) : 0,
    scope.courtIds.length ? db.courtBlock.count({ where: { court_id: { in: scope.courtIds } } }) : 0,
  ]);
  return { users: scope.userIds.length, auth_sessions: sessions, owner_profiles: profiles, facilities: scope.facilityIds.length, courts: scope.courtIds.length, bookings: scope.bookingIds.length, booking_slots: slots, court_slot_locks: locks, court_blocks: blocks };
}

async function setup() {
  const target = assertEnvironment(), booking1119Before = await booking1119Fingerprint();
  const password = `E2e-${randomBytes(24).toString('base64url')}9a`;
  const passwordHash = await argon2.hash(password, passwordOptions);
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(202610184)`;
    await removeFixture(tx);
    const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
    const users = {};
    for (const [kind, email] of Object.entries(emails)) users[kind] = await tx.user.create({ data: {
      email, email_normalized: email, password_hash: passwordHash, full_name: `${KEY}_${kind.toUpperCase()}`,
      role: kind === 'admin' ? 'ADMIN' : 'CUSTOMER', status: 'ACTIVE', created_at: now,
    } });
    const request = await tx.ownerRequest.create({ data: {
      user_id: users.owner.id, status: 'APPROVED', applicant_name_snapshot: users.owner.full_name,
      applicant_email_snapshot: users.owner.email, reviewed_by: users.admin.id, reviewed_at: now, created_at: now,
    } });
    await tx.ownerProfile.create({ data: { user_id: users.owner.id, approved_request_id: request.id, created_at: now } });
    const facility = await tx.facility.create({ data: {
      owner_id: users.owner.id, name: `${PREFIX}OPERATIONS_CENTER`, address: '18 Đường kiểm thử Analytics, Đà Nẵng',
      district: supportedDistricts[0], phone: '02360000044', description: 'Fixture E2E cô lập cho Owner Analytics Phase 4.',
      opening_time: timeOnly(17), closing_time: timeOnly(22), status: 'ACTIVE', submitted_at: now,
      reviewed_by: users.admin.id, reviewed_at: now, created_at: now,
    } });
    const courts = [];
    for (let index = 1; index <= 21; index++) courts.push(await tx.court.create({ data: {
      facility_id: facility.id, name: `${PREFIX}COURT_${String(index).padStart(2, '0')}`,
      description: index <= 2 ? 'Sân đại diện có dữ liệu vận hành.' : 'Sân nhẹ phục vụ kiểm tra phân trang.', status: 'ACTIVE', created_at: now,
    } }));
    await tx.priceRule.create({ data: { facility_id: facility.id, start_time: timeOnly(17), end_time: timeOnly(22), hourly_rate: '100000', created_at: now } });
    await tx.cancellationPolicy.create({ data: { facility_id: facility.id, cutoff_hours: 2, created_at: now } });
    await tx.bankAccount.create({ data: { facility_id: facility.id, bank_name: 'Ngân hàng kiểm thử', account_number: 'E2E00000044', account_holder: 'TEST E2E OWNER ANALYTICS', created_at: now } });
    const parts = localParts(now), bookingIds = [];
    const samples = [
      { court: courts[0], offset: -3, hour: 18, slots: 2, total: '100000' },
      { court: courts[0], offset: -10, hour: 19, slots: 3, total: '150000' },
      { court: courts[1], offset: -6, hour: 20, slots: 2, total: '100000' },
    ];
    for (const sample of samples) {
      const start = localInstant(parts, sample.offset, sample.hour), end = new Date(start.getTime() + sample.slots * 30 * 60 * 1000);
      const total = BigInt(sample.total), deposit = total * 30n / 100n, confirmedAt = new Date(start.getTime() - 24 * 60 * 60 * 1000);
      const booking = await tx.booking.create({ data: {
        customer_id: users.customer.id, court_id: sample.court.id, status: 'COMPLETED', start_at: start, end_at: end,
        expires_at: new Date(confirmedAt.getTime() - 5 * 60 * 1000), total_amount: total.toString(), deposit_amount: deposit.toString(), remaining_amount: (total - deposit).toString(),
        bank_name_snapshot: 'Ngân hàng kiểm thử', account_number_snapshot: 'E2E00000044', account_holder_snapshot: 'TEST E2E OWNER ANALYTICS',
        facility_name_snapshot: facility.name, facility_address_snapshot: facility.address, court_name_snapshot: sample.court.name,
        confirmed_at: confirmedAt, confirmed_by_user_id: users.owner.id, completed_at: new Date(end.getTime() + 60_000), created_at: new Date(confirmedAt.getTime() - 60 * 60 * 1000),
      } });
      bookingIds.push(booking.id);
      for (let slot = 0; slot < sample.slots; slot++) {
        const slotStart = new Date(start.getTime() + slot * 30 * 60 * 1000);
        await tx.bookingSlot.create({ data: { booking_id: booking.id, start_at: slotStart, end_at: new Date(slotStart.getTime() + 30 * 60 * 1000), hourly_rate_snapshot: '100000', slot_amount: '50000', created_at: now } });
      }
    }
    const blockStart = localInstant(parts, -1, 17);
    await tx.courtBlock.create({ data: { court_id: courts[1].id, start_at: blockStart, end_at: new Date(blockStart.getTime() + 30 * 60 * 1000), reason: KEY, created_by: users.owner.id, created_at: now } });
    return { ownerId: users.owner.id, facilityId: facility.id, bookingIds };
  }, { maxWait: 20_000, timeout: 120_000 });
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({ fixture: KEY, email: emails.owner, password, facility_id: String(result.facilityId), booking_ids: result.bookingIds.map(String), booking_1119_fingerprint: booking1119Before, target_fingerprint: target }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ mode: 'SETUP', fixture: KEY, facility_id: String(result.facilityId), counts: await counts() }));
}

async function cleanup() {
  assertEnvironment(); let manifest = null;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
  for (let attempt = 1; attempt <= 3; attempt++) try {
    await prisma.$transaction(async tx => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(202610184)`; await removeFixture(tx); }, { maxWait: 20_000, timeout: 120_000 }); break;
  } catch (error) {
    if (error?.code !== 'P2034' || attempt === 3) throw error;
    await new Promise(resolve => setTimeout(resolve, attempt * 750));
  }
  const finalCounts = await counts(), current1119 = await booking1119Fingerprint();
  const unchanged = manifest ? manifest.booking_1119_fingerprint === current1119 : null;
  await rm(manifestPath, { force: true });
  console.log(JSON.stringify({ mode: 'CLEANUP', fixture: KEY, counts: finalCounts, booking_1119_unchanged: unchanged }));
  if (Object.values(finalCounts).some(value => value !== 0)) throw new Error('E2E_FIXTURE_CLEANUP_INCOMPLETE');
  if (unchanged === false) throw new Error('BOOKING_1119_CHANGED');
}

async function verify() {
  assertEnvironment();
  console.log(JSON.stringify({ mode: 'VERIFY', fixture: KEY, counts: await counts(), booking_1119: await booking1119Fingerprint() === 'MISSING' ? 'MISSING' : 'EXISTS' }));
}

try {
  if (process.argv[2] === 'setup') await setup();
  else if (process.argv[2] === 'cleanup') await cleanup();
  else if (process.argv[2] === 'verify') await verify();
  else throw new Error('USAGE: e2e-owner-analytics-fixture.js <setup|cleanup|verify>');
} finally { await prisma.$disconnect(); }
