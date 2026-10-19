import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/config/prisma.js';
import { passwordOptions } from '../src/modules/auth/password.js';
import { supportedDistricts } from '../src/modules/facilities/districts.js';

const PREFIX = 'TEST_E2E_RELEASE_';
const EMAIL_PREFIX = PREFIX.toLowerCase();
const APPROVED_FINGERPRINT = '70d7a1b8f31f0e92';
const backendRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(backendRoot, '../frontend/playwright/.auth/release-fixture.json');
const lockKey = 202610193;

function targetFingerprint() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
  const url = new URL(process.env.DATABASE_URL);
  return createHash('sha256')
    .update(`${url.protocol}//${url.hostname}:${url.port || 'default'}${url.pathname}`)
    .digest('hex').slice(0, 16);
}

function assertEnvironment() {
  if (process.env.NODE_ENV !== 'development') throw new Error('E2E_RELEASE_REQUIRES_DEVELOPMENT');
  const current = targetFingerprint();
  if (current !== APPROVED_FINGERPRINT) throw new Error('E2E_RELEASE_APPROVED_FINGERPRINT_MISMATCH');
  if (process.env.DEMO_SEED_TARGET_FINGERPRINT !== current) throw new Error('E2E_RELEASE_ENV_FINGERPRINT_MISMATCH');
  return current;
}

function json(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item instanceof Uint8Array) return Buffer.from(item).toString('hex');
    if (item && typeof item === 'object' && typeof item.toFixed === 'function') return item.toFixed();
    return item;
  });
}

function record(model, id, parent, purpose) {
  return { model, id: String(id), parent: parent ?? null, purpose };
}

function recordKey(item) {
  return `${item.model}:${item.id}`;
}

function addRecords(manifest, rows) {
  const existing = new Set(manifest.records.map(recordKey));
  for (const row of rows) {
    if (!existing.has(recordKey(row))) {
      manifest.records.push(row);
      existing.add(recordKey(row));
    }
  }
}

async function writeManifest(manifest) {
  await mkdir(dirname(manifestPath), { recursive: true });
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, manifestPath);
}

async function readManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.fixture_prefix !== PREFIX || manifest.target_fingerprint !== APPROVED_FINGERPRINT) {
    throw new Error('E2E_RELEASE_MANIFEST_GUARD_FAILED');
  }
  return manifest;
}

function timeOnly(hour, minute = 0) {
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
}

function vnParts(value) {
  const local = new Date(value.getTime() + 7 * 60 * 60 * 1000);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
}

function localDate(parts, offset) {
  const value = new Date(Date.UTC(parts.year, parts.month, parts.day + offset));
  return value.toISOString().slice(0, 10);
}

function weekday(date) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

async function booking1119Fingerprint(db = prisma) {
  const booking = await db.booking.findUnique({
    where: { id: 1119n },
    include: {
      slots: { orderBy: [{ start_at: 'asc' }, { id: 'asc' }] },
      paymentProof: true,
      refund: true,
    },
  });
  if (!booking) return { state: 'MISSING', hash: 'MISSING', invariants: null };
  const locks = await db.courtSlotLock.count({ where: { bookingSlot: { booking_id: booking.id } } });
  return {
    state: 'EXISTS',
    hash: createHash('sha256').update(json({ booking, locks })).digest('hex'),
    invariants: {
      status: booking.status,
      payment_proof_status: booking.paymentProof?.status ?? null,
      refund_status: booking.refund?.status ?? null,
      booking_slots: booking.slots.length,
      court_slot_locks: locks,
      total_amount: booking.total_amount.toString(),
      deposit_amount: booking.deposit_amount.toString(),
      remaining_amount: booking.remaining_amount.toString(),
    },
  };
}

async function namespaceRoots(db = prisma) {
  const users = await db.user.findMany({
    where: { email_normalized: { startsWith: EMAIL_PREFIX, mode: 'insensitive' } },
    select: { id: true, email_normalized: true },
  });
  const facilities = await db.facility.findMany({
    where: { name: { startsWith: PREFIX } }, select: { id: true, name: true },
  });
  const courts = await db.court.findMany({
    where: { name: { startsWith: PREFIX } }, select: { id: true, name: true },
  });
  const amenities = await db.amenity.findMany({
    where: { name: { startsWith: PREFIX } }, select: { id: true, name: true },
  });
  return { users, facilities, courts, amenities };
}

async function scopedCounts(db = prisma) {
  const roots = await namespaceRoots(db);
  const userIds = roots.users.map(row => row.id);
  const facilityIds = roots.facilities.map(row => row.id);
  const courtIds = roots.courts.map(row => row.id);
  const amenityIds = roots.amenities.map(row => row.id);
  const bookingIds = userIds.length
    ? (await db.booking.findMany({ where: { customer_id: { in: userIds } }, select: { id: true } })).map(row => row.id)
    : [];
  const seriesIds = userIds.length
    ? (await db.bookingSeries.findMany({ where: { customer_id: { in: userIds } }, select: { id: true } })).map(row => row.id)
    : [];
  return {
    users: roots.users.length,
    auth_sessions: userIds.length ? await db.authSession.count({ where: { user_id: { in: userIds } } }) : 0,
    owner_profiles: userIds.length ? await db.ownerProfile.count({ where: { user_id: { in: userIds } } }) : 0,
    owner_requests: userIds.length ? await db.ownerRequest.count({ where: { user_id: { in: userIds } } }) : 0,
    facilities: roots.facilities.length,
    courts: roots.courts.length,
    price_rules: facilityIds.length ? await db.priceRule.count({ where: { facility_id: { in: facilityIds } } }) : 0,
    cancellation_policies: facilityIds.length ? await db.cancellationPolicy.count({ where: { facility_id: { in: facilityIds } } }) : 0,
    bank_accounts: facilityIds.length ? await db.bankAccount.count({ where: { facility_id: { in: facilityIds } } }) : 0,
    amenities: roots.amenities.length,
    facility_amenities: facilityIds.length || amenityIds.length
      ? await db.facilityAmenity.count({ where: { OR: [{ facility_id: { in: facilityIds } }, { amenity_id: { in: amenityIds } }] } }) : 0,
    booking_series: seriesIds.length,
    bookings: bookingIds.length,
    booking_slots: bookingIds.length ? await db.bookingSlot.count({ where: { booking_id: { in: bookingIds } } }) : 0,
    court_slot_locks: bookingIds.length ? await db.courtSlotLock.count({ where: { bookingSlot: { booking_id: { in: bookingIds } } } }) : 0,
    payment_proofs: bookingIds.length ? await db.paymentProof.count({ where: { booking_id: { in: bookingIds } } }) : 0,
    refunds: bookingIds.length ? await db.refund.count({ where: { booking_id: { in: bookingIds } } }) : 0,
    facility_images: facilityIds.length ? await db.facilityImage.count({ where: { facility_id: { in: facilityIds } } }) : 0,
    court_blocks: courtIds.length ? await db.courtBlock.count({ where: { court_id: { in: courtIds } } }) : 0,
  };
}

function assertEmptyCounts(counts) {
  if (Object.values(counts).some(value => value !== 0)) throw new Error('E2E_RELEASE_NAMESPACE_NOT_EMPTY');
}

async function setup() {
  const fingerprint = assertEnvironment();
  try {
    await readFile(manifestPath, 'utf8');
    throw new Error('E2E_RELEASE_MANIFEST_ALREADY_EXISTS');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  assertEmptyCounts(await scopedCounts());
  const booking1119 = await booking1119Fingerprint();
  const password = `${randomBytes(24).toString('base64url')}Aa1`;
  const passwordHash = await argon2.hash(password, passwordOptions);
  const runId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomBytes(3).toString('hex')}`;
  const names = {
    customer: `${PREFIX}CUSTOMER_${runId}`,
    owner: `${PREFIX}OWNER_${runId}`,
    admin: `${PREFIX}ADMIN_${runId}`,
    otherOwner: `${PREFIX}OTHER_OWNER_${runId}`,
    facility: `${PREFIX}FACILITY_${runId}`,
    otherFacility: `${PREFIX}FOREIGN_FACILITY_${runId}`,
    court: `${PREFIX}COURT_${runId}`,
    amenity: `${PREFIX}AMENITY_${runId}`,
  };
  const emails = Object.fromEntries(['customer', 'owner', 'admin', 'otherOwner'].map(role => [
    role,
    `${EMAIL_PREFIX}${runId}_${role.toLowerCase()}@booking.invalid`,
  ]));
  let manifest;
  try {
    manifest = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
      assertEmptyCounts(await scopedCounts(tx));
      const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
      const parts = vnParts(now);
      const singleDate = localDate(parts, 7);
      const recurringStart = localDate(parts, 14);
      const recurringEnd = localDate(parts, 35);
      const records = [];
      const users = {};
      for (const role of ['customer', 'owner', 'admin', 'otherOwner']) {
        users[role] = await tx.user.create({ data: {
          email: emails[role], email_normalized: emails[role], password_hash: passwordHash,
          full_name: names[role], phone: role === 'customer' ? '0900000193' : null,
          role: role === 'admin' ? 'ADMIN' : 'CUSTOMER', status: 'ACTIVE', created_at: now,
        } });
        records.push(record('User', users[role].id, null, `${role} authentication identity`));
      }
      for (const role of ['owner', 'otherOwner']) {
        const request = await tx.ownerRequest.create({ data: {
          user_id: users[role].id, status: 'APPROVED',
          applicant_name_snapshot: users[role].full_name,
          applicant_email_snapshot: users[role].email,
          reviewed_by: users.admin.id, reviewed_at: now, created_at: now,
        } });
        records.push(record('OwnerRequest', request.id, `User:${users[role].id}`, `${role} approved capability source`));
        const profile = await tx.ownerProfile.create({ data: {
          user_id: users[role].id, approved_request_id: request.id, created_at: now,
        } });
        records.push(record('OwnerProfile', profile.user_id, `OwnerRequest:${request.id}`, `${role} capability`));
      }
      const facility = await tx.facility.create({ data: {
        owner_id: users.owner.id, name: names.facility,
        address: '19 Đường Kiểm Thử Release, Đà Nẵng', district: supportedDistricts[0],
        phone: '02360000193', description: 'Cơ sở cô lập cho release rehearsal Phase 3.',
        opening_time: timeOnly(6), closing_time: timeOnly(22), status: 'ACTIVE',
        submitted_at: now, reviewed_by: users.admin.id, reviewed_at: now, created_at: now,
      } });
      records.push(record('Facility', facility.id, `OwnerProfile:${users.owner.id}`, 'public search and booking facility'));
      const otherFacility = await tx.facility.create({ data: {
        owner_id: users.otherOwner.id, name: names.otherFacility,
        address: '20 Đường Kiểm Thử Quyền Sở Hữu, Đà Nẵng', district: supportedDistricts[1],
        phone: '02360000194', description: 'Cơ sở cô lập để kiểm tra cross-owner 404.',
        opening_time: timeOnly(6), closing_time: timeOnly(22), status: 'ACTIVE',
        submitted_at: now, reviewed_by: users.admin.id, reviewed_at: now, created_at: now,
      } });
      records.push(record('Facility', otherFacility.id, `OwnerProfile:${users.otherOwner.id}`, 'cross-owner authorization target'));
      const court = await tx.court.create({ data: {
        facility_id: facility.id, name: names.court,
        description: 'Sân cô lập cho Booking V2 và recurring rehearsal.', status: 'ACTIVE', created_at: now,
      } });
      records.push(record('Court', court.id, `Facility:${facility.id}`, 'single and recurring booking court'));
      const price = await tx.priceRule.create({ data: {
        facility_id: facility.id, start_time: timeOnly(6), end_time: timeOnly(22), hourly_rate: '100000', created_at: now,
      } });
      records.push(record('PriceRule', price.id, `Facility:${facility.id}`, 'priced availability'));
      const policy = await tx.cancellationPolicy.create({ data: {
        facility_id: facility.id, cutoff_hours: 2, created_at: now,
      } });
      records.push(record('CancellationPolicy', policy.id, `Facility:${facility.id}`, 'booking snapshot'));
      const bank = await tx.bankAccount.create({ data: {
        facility_id: facility.id, bank_name: 'Ngân hàng kiểm thử release',
        account_number: 'E2E00000193', account_holder: 'TEST E2E RELEASE OWNER', created_at: now,
      } });
      records.push(record('BankAccount', bank.id, `Facility:${facility.id}`, 'V2 transfer snapshot'));
      return {
        version: 1,
        fixture_prefix: PREFIX,
        run_id: runId,
        target_fingerprint: fingerprint,
        created_at: now.toISOString(),
        booking_1119_before: booking1119,
        credentials: {
          customer: { email: emails.customer, password },
          owner: { email: emails.owner, password },
          admin: { email: emails.admin, password },
          other_owner: { email: emails.otherOwner, password },
        },
        ids: {
          customer_user: String(users.customer.id), owner_user: String(users.owner.id),
          admin_user: String(users.admin.id), other_owner_user: String(users.otherOwner.id),
          facility: String(facility.id), other_facility: String(otherFacility.id), court: String(court.id),
        },
        names,
        single: { date: singleDate, start_time: '10:00', end_time: '11:00' },
        recurring: {
          weekday: weekday(recurringStart), start_date: recurringStart, end_date: recurringEnd,
          start_time: '18:00', end_time: '19:00', occurrence_count: 4,
        },
        records,
      };
    }, { maxWait: 20_000, timeout: 120_000 });
    await writeManifest(manifest);
  } catch (error) {
    if (manifest) {
      try { await deleteExact(manifest); } catch { /* Report the original setup failure. */ }
    }
    throw error;
  }
  console.log(json({
    mode: 'SETUP', fingerprint_guard: 'PASS', fixture_prefix: PREFIX,
    manifest: 'frontend/playwright/.auth/release-fixture.json', exact_records: manifest.records.length,
    dates: { single: manifest.single.date, recurring_start: manifest.recurring.start_date, recurring_end: manifest.recurring.end_date },
  }));
}

async function recordRuntime(kind, rawId) {
  assertEnvironment();
  const manifest = await readManifest();
  const id = BigInt(rawId);
  const rows = [];
  if (kind === 'booking') {
    const booking = await prisma.booking.findFirst({
      where: { id, customer_id: BigInt(manifest.ids.customer_user), court_id: BigInt(manifest.ids.court), booking_series_id: null },
      include: { slots: { include: { lock: true } }, paymentProof: true, refund: true },
    });
    if (!booking || booking.booking_flow_version !== 2) throw new Error('E2E_RELEASE_BOOKING_SCOPE_VIOLATION');
    if (booking.paymentProof || booking.refund) throw new Error('E2E_RELEASE_UNEXPECTED_PAYMENT_RECORD');
    rows.push(record('Booking', booking.id, `User:${manifest.ids.customer_user}`, 'single Booking V2 created by UI'));
    for (const slot of booking.slots) {
      rows.push(record('BookingSlot', slot.id, `Booking:${booking.id}`, 'single booking slot history'));
      if (slot.lock) rows.push(record('CourtSlotLock', `${slot.lock.court_id}:${slot.lock.start_at.toISOString()}`, `BookingSlot:${slot.id}`, 'single booking occupancy'));
    }
  } else if (kind === 'series') {
    const series = await prisma.bookingSeries.findFirst({
      where: {
        id, customer_id: BigInt(manifest.ids.customer_user), facility_id: BigInt(manifest.ids.facility),
        court_id: BigInt(manifest.ids.court),
      },
      include: { bookings: { include: { slots: { include: { lock: true } }, paymentProof: true, refund: true } } },
    });
    if (!series || series.bookings.length !== manifest.recurring.occurrence_count) throw new Error('E2E_RELEASE_SERIES_SCOPE_VIOLATION');
    rows.push(record('BookingSeries', series.id, `User:${manifest.ids.customer_user}`, 'recurring series created by UI'));
    for (const booking of series.bookings) {
      if (booking.paymentProof || booking.refund || booking.booking_flow_version !== 2) throw new Error('E2E_RELEASE_UNEXPECTED_SERIES_PAYMENT_RECORD');
      rows.push(record('Booking', booking.id, `BookingSeries:${series.id}`, 'recurring occurrence'));
      for (const slot of booking.slots) {
        rows.push(record('BookingSlot', slot.id, `Booking:${booking.id}`, 'recurring booking slot history'));
        if (slot.lock) rows.push(record('CourtSlotLock', `${slot.lock.court_id}:${slot.lock.start_at.toISOString()}`, `BookingSlot:${slot.id}`, 'recurring occurrence occupancy'));
      }
    }
  } else if (kind === 'amenity') {
    const amenity = await prisma.amenity.findUnique({ where: { id } });
    if (!amenity || amenity.name !== manifest.names.amenity) throw new Error('E2E_RELEASE_AMENITY_SCOPE_VIOLATION');
    rows.push(record('Amenity', amenity.id, null, 'Admin UI mutation'));
  } else {
    throw new Error('E2E_RELEASE_UNKNOWN_RECORD_KIND');
  }
  addRecords(manifest, rows);
  await writeManifest(manifest);
  console.log(json({ mode: 'RECORDED', kind, id: String(id), exact_records_added: rows.length }));
}

function idsFor(manifest, model) {
  return manifest.records.filter(row => row.model === model).map(row => row.id);
}

async function synchronizeManifest(manifest, db = prisma) {
  const userIds = idsFor(manifest, 'User').map(BigInt);
  const facilityIds = idsFor(manifest, 'Facility').map(BigInt);
  const courtIds = idsFor(manifest, 'Court').map(BigInt);
  const knownEmails = new Set(Object.values(manifest.credentials).map(row => row.email));
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email_normalized: true } });
  if (users.some(row => !knownEmails.has(row.email_normalized) || !row.email_normalized.startsWith(EMAIL_PREFIX))) {
    throw new Error('E2E_RELEASE_USER_IDENTITY_MISMATCH');
  }
  const facilities = await db.facility.findMany({ where: { id: { in: facilityIds } }, select: { id: true, name: true, owner_id: true } });
  if (facilities.some(row => !row.name.startsWith(PREFIX) || !userIds.some(id => id === row.owner_id))) {
    throw new Error('E2E_RELEASE_FACILITY_IDENTITY_MISMATCH');
  }
  const courts = await db.court.findMany({ where: { id: { in: courtIds } }, select: { id: true, name: true, facility_id: true } });
  if (courts.some(row => !row.name.startsWith(PREFIX) || !facilityIds.some(id => id === row.facility_id))) {
    throw new Error('E2E_RELEASE_COURT_IDENTITY_MISMATCH');
  }
  const series = await db.bookingSeries.findMany({ where: { customer_id: { in: userIds } }, select: { id: true, customer_id: true } });
  const bookings = await db.booking.findMany({ where: { customer_id: { in: userIds } }, select: { id: true, customer_id: true, booking_series_id: true, court_id: true } });
  if (bookings.some(row => !courtIds.some(id => id === row.court_id))) throw new Error('E2E_RELEASE_BOOKING_COURT_MISMATCH');
  addRecords(manifest, series.map(row => record('BookingSeries', row.id, `User:${row.customer_id}`, 'runtime recurring series discovered by exact fixture customer')));
  addRecords(manifest, bookings.map(row => record('Booking', row.id, row.booking_series_id ? `BookingSeries:${row.booking_series_id}` : `User:${row.customer_id}`, 'runtime booking discovered by exact fixture customer')));
  const bookingIds = bookings.map(row => row.id);
  const slots = bookingIds.length ? await db.bookingSlot.findMany({ where: { booking_id: { in: bookingIds } }, select: { id: true, booking_id: true } }) : [];
  addRecords(manifest, slots.map(row => record('BookingSlot', row.id, `Booking:${row.booking_id}`, 'runtime slot')));
  const slotIds = slots.map(row => row.id);
  const locks = slotIds.length ? await db.courtSlotLock.findMany({ where: { booking_slot_id: { in: slotIds } }, select: { court_id: true, start_at: true, booking_slot_id: true } }) : [];
  addRecords(manifest, locks.map(row => record('CourtSlotLock', `${row.court_id}:${row.start_at.toISOString()}`, `BookingSlot:${row.booking_slot_id}`, 'runtime slot lock')));
  const sessions = userIds.length ? await db.authSession.findMany({ where: { user_id: { in: userIds } }, select: { id: true, user_id: true } }) : [];
  addRecords(manifest, sessions.map(row => record('AuthSession', row.id, `User:${row.user_id}`, 'real browser session')));
  const proofs = bookingIds.length ? await db.paymentProof.findMany({ where: { booking_id: { in: bookingIds } }, select: { id: true, booking_id: true } }) : [];
  const refunds = bookingIds.length ? await db.refund.findMany({ where: { booking_id: { in: bookingIds } }, select: { id: true, booking_id: true } }) : [];
  addRecords(manifest, proofs.map(row => record('PaymentProof', row.id, `Booking:${row.booking_id}`, 'unexpected runtime dependent')));
  addRecords(manifest, refunds.map(row => record('Refund', row.id, `Booking:${row.booking_id}`, 'unexpected runtime dependent')));
  const amenities = await db.amenity.findMany({ where: { name: manifest.names.amenity }, select: { id: true } });
  addRecords(manifest, amenities.map(row => record('Amenity', row.id, null, 'Admin UI mutation discovered by exact name')));
  const amenityIds = amenities.map(row => row.id);
  const facilityAmenities = facilityIds.length || amenityIds.length ? await db.facilityAmenity.findMany({
    where: { OR: [{ facility_id: { in: facilityIds } }, { amenity_id: { in: amenityIds } }] },
    select: { facility_id: true, amenity_id: true },
  }) : [];
  addRecords(manifest, facilityAmenities.map(row => record('FacilityAmenity', `${row.facility_id}:${row.amenity_id}`, `Facility:${row.facility_id}`, 'fixture relation')));
  await writeManifest(manifest);
  return { manifest, unexpected_payment_proofs: proofs.length, unexpected_refunds: refunds.length };
}

async function deleteExact(manifest) {
  const synchronized = await synchronizeManifest(manifest);
  manifest = synchronized.manifest;
  const bigintIds = model => idsFor(manifest, model).filter(id => /^\d+$/.test(id)).map(BigInt);
  const bookingIds = bigintIds('Booking');
  const seriesIds = bigintIds('BookingSeries');
  const slotIds = bigintIds('BookingSlot');
  const facilityIds = bigintIds('Facility');
  const courtIds = bigintIds('Court');
  const userIds = bigintIds('User');
  const amenityIds = bigintIds('Amenity');
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    if (bookingIds.length) {
      await tx.notification.deleteMany({ where: { booking_id: { in: bookingIds } } });
      await tx.review.deleteMany({ where: { booking_id: { in: bookingIds } } });
      await tx.refund.deleteMany({ where: { booking_id: { in: bookingIds } } });
      await tx.paymentProof.deleteMany({ where: { booking_id: { in: bookingIds } } });
    }
    if (slotIds.length) await tx.courtSlotLock.deleteMany({ where: { booking_slot_id: { in: slotIds } } });
    if (bookingIds.length) await tx.bookingSlot.deleteMany({ where: { booking_id: { in: bookingIds } } });
    if (bookingIds.length) await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
    if (seriesIds.length) await tx.bookingSeries.deleteMany({ where: { id: { in: seriesIds } } });
    if (facilityIds.length || amenityIds.length) await tx.facilityAmenity.deleteMany({ where: {
      OR: [{ facility_id: { in: facilityIds } }, { amenity_id: { in: amenityIds } }],
    } });
    if (facilityIds.length) {
      await tx.facilityImage.deleteMany({ where: { facility_id: { in: facilityIds } } });
      await tx.cancellationPolicy.deleteMany({ where: { facility_id: { in: facilityIds } } });
      await tx.priceRule.deleteMany({ where: { facility_id: { in: facilityIds } } });
      await tx.bankAccount.deleteMany({ where: { facility_id: { in: facilityIds } } });
      await tx.favorite.deleteMany({ where: { facility_id: { in: facilityIds } } });
      await tx.notification.deleteMany({ where: { facility_id: { in: facilityIds } } });
    }
    if (courtIds.length) await tx.courtBlock.deleteMany({ where: { court_id: { in: courtIds } } });
    if (courtIds.length) await tx.court.deleteMany({ where: { id: { in: courtIds } } });
    if (facilityIds.length) await tx.facility.deleteMany({ where: { id: { in: facilityIds } } });
    if (amenityIds.length) await tx.amenity.deleteMany({ where: { id: { in: amenityIds } } });
    if (userIds.length) {
      await tx.notification.deleteMany({ where: { recipient_id: { in: userIds } } });
      await tx.passwordResetToken.deleteMany({ where: { user_id: { in: userIds } } });
      await tx.authSession.deleteMany({ where: { user_id: { in: userIds } } });
      await tx.ownerProfile.deleteMany({ where: { user_id: { in: userIds } } });
      await tx.ownerRequest.deleteMany({ where: { user_id: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }, { maxWait: 20_000, timeout: 120_000 });
  return synchronized;
}

async function cleanup() {
  assertEnvironment();
  const manifest = await readManifest();
  const synchronized = await deleteExact(manifest);
  const after = await scopedCounts();
  const booking1119 = await booking1119Fingerprint();
  const unchanged = booking1119.hash === manifest.booking_1119_before.hash;
  await rm(manifestPath, { force: true });
  console.log(json({
    mode: 'CLEANUP', cleanup_executed: true, counts: after,
    booking_1119: booking1119.state, booking_1119_unchanged: unchanged,
    unexpected_payment_proofs: synchronized.unexpected_payment_proofs,
    unexpected_refunds: synchronized.unexpected_refunds,
  }));
  assertEmptyCounts(after);
  if (!unchanged) throw new Error('BOOKING_1119_CHANGED');
  if (synchronized.unexpected_payment_proofs || synchronized.unexpected_refunds) throw new Error('E2E_RELEASE_UNEXPECTED_PAYMENT_DEPENDENTS');
}

async function verify() {
  const fingerprint = assertEnvironment();
  const counts = await scopedCounts();
  const booking1119 = await booking1119Fingerprint();
  console.log(json({
    mode: 'VERIFY_READ_ONLY', fingerprint_guard: fingerprint === APPROVED_FINGERPRINT ? 'PASS' : 'FAIL',
    fixture_prefix: PREFIX, counts, booking_1119: booking1119.state,
    booking_1119_invariants: booking1119.invariants,
  }));
}

try {
  const [command, kind, id] = process.argv.slice(2);
  if (command === 'setup') await setup();
  else if (command === 'record' && kind && id) await recordRuntime(kind, id);
  else if (command === 'cleanup') await cleanup();
  else if (command === 'verify') await verify();
  else throw new Error('USAGE: e2e-release-fixture.js <setup|record KIND ID|cleanup|verify>');
} finally {
  await prisma.$disconnect();
}
