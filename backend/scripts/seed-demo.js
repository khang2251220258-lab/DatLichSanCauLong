import 'dotenv/config';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { prisma } from '../src/config/prisma.js';
import { passwordOptions } from '../src/modules/auth/password.js';
import { validatePassword } from '../src/modules/auth/validation.js';
import { supportedDistricts } from '../src/modules/facilities/districts.js';

const CONFIRMATION = 'BOOKING_DEVELOPMENT_ONLY';
const EMAILS = Object.freeze({
  admin: 'demo.admin@booking.invalid',
  owner: 'demo.owner@booking.invalid',
  customer: 'demo.customer@booking.invalid',
});
const FACILITIES = Object.freeze([
  { name: 'Demo Cầu Lông Sông Hàn', district: 'Phường Hải Châu', address: '100 Đường Demo, Phường Hải Châu, Đà Nẵng', phone: '0000000001', rate: '80000', courts: 3 },
  { name: 'Demo Cầu Lông Hòa Xuân', district: 'Phường Hòa Xuân', address: '200 Đường Demo, Phường Hòa Xuân, Đà Nẵng', phone: '0000000002', rate: '90000', courts: 1 },
  { name: 'Demo Cầu Lông Hội An', district: 'Phường Hội An', address: '300 Đường Demo, Phường Hội An, Đà Nẵng', phone: '0000000003', rate: '100000', courts: 1 },
]);
const AMENITIES = Object.freeze(['Demo - Bãi đỗ xe', 'Demo - Phòng thay đồ', 'Demo - Nước uống']);
const time = value => new Date(`1970-01-01T${value}:00.000Z`);

function targetFingerprint() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
  const url = new URL(process.env.DATABASE_URL);
  const safeTarget = `${url.protocol}//${url.hostname}:${url.port || 'default'}${url.pathname}`;
  return createHash('sha256').update(safeTarget).digest('hex').slice(0, 16);
}
function assertStaticData() {
  for (const facility of FACILITIES) if (!supportedDistricts.includes(facility.district)) throw new Error('DEMO_DISTRICT_INVALID');
}
async function databaseSnapshot() {
  const [database] = await prisma.$queryRaw`SELECT current_database() AS name, current_schema() AS schema`;
  const migration = await prisma.$queryRaw`SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20260922000000_init' AND finished_at IS NOT NULL`;
  if (!migration.length) throw new Error('INITIAL_MIGRATION_NOT_APPLIED');
  const [users, owners, facilities, courts, bookings, proofs] = await Promise.all([
    prisma.user.count(), prisma.ownerProfile.count(), prisma.facility.count(), prisma.court.count(), prisma.booking.count(), prisma.paymentProof.count(),
  ]);
  return { database: database.name, schema: database.schema, migration: migration[0].migration_name,
    counts: { users, owner_profiles: owners, facilities, courts, bookings, payment_proofs: proofs } };
}
function assertWriteGuard(fingerprint) {
  if (process.env.NODE_ENV !== 'development') throw new Error('NODE_ENV_MUST_BE_DEVELOPMENT');
  if (process.env.DEMO_SEED_CONFIRM !== CONFIRMATION) throw new Error('DEMO_SEED_CONFIRM_REQUIRED');
  if (process.env.DEMO_SEED_TARGET_FINGERPRINT !== fingerprint) throw new Error('DEMO_SEED_TARGET_FINGERPRINT_MISMATCH');
  validatePassword(process.env.DEMO_OWNER_PASSWORD);
  validatePassword(process.env.DEMO_CUSTOMER_PASSWORD);
  validatePassword(process.env.DEMO_ADMIN_PASSWORD);
}
async function upsertDemoUser(tx, input, now) {
  const existing = await tx.user.findUnique({ where: { email_normalized: input.email } });
  if (existing && existing.role !== input.role) throw new Error('DEMO_USER_ROLE_CONFLICT');
  return tx.user.upsert({
    where: { email_normalized: input.email },
    create: { email: input.email, email_normalized: input.email, password_hash: input.passwordHash,
      full_name: input.name, role: input.role, status: 'ACTIVE', created_at: now },
    update: { email: input.email, password_hash: input.passwordHash, full_name: input.name, status: 'ACTIVE', locked_at: null, locked_reason: null },
  });
}
async function ensureOwnerProfile(tx, owner, admin, now) {
  const profile = await tx.ownerProfile.findUnique({ where: { user_id: owner.id } });
  if (profile) return profile;
  let request = await tx.ownerRequest.findFirst({ where: { user_id: owner.id, status: 'APPROVED' }, orderBy: { id: 'asc' } });
  request ??= await tx.ownerRequest.create({ data: { user_id: owner.id, status: 'APPROVED',
    applicant_name_snapshot: owner.full_name, applicant_email_snapshot: owner.email,
    reviewed_by: admin.id, reviewed_at: now, created_at: now } });
  return tx.ownerProfile.create({ data: { user_id: owner.id, approved_request_id: request.id, created_at: now } });
}
async function ensureFacility(tx, ownerId, adminId, spec, now) {
  const data = { owner_id: ownerId, name: spec.name, address: spec.address, district: spec.district,
    phone: spec.phone, description: 'Dữ liệu demo dành riêng cho môi trường development.',
    opening_time: time('06:00'), closing_time: time('22:00'), status: 'ACTIVE',
    submitted_at: now, reviewed_by: adminId, reviewed_at: now,
    rejection_reason: null, suspended_at: null, suspension_reason: null };
  const existing = await tx.facility.findFirst({ where: { owner_id: ownerId, name: spec.name }, orderBy: { id: 'asc' } });
  const facility = existing
    ? await tx.facility.update({ where: { id: existing.id }, data })
    : await tx.facility.create({ data: { ...data, created_at: now } });
  for (let index = 1; index <= spec.courts; index += 1) {
    await tx.court.upsert({ where: { facility_id_name: { facility_id: facility.id, name: `Sân ${index}` } },
      create: { facility_id: facility.id, name: `Sân ${index}`, description: 'Sân demo đang hoạt động.', status: 'ACTIVE', created_at: now },
      update: { description: 'Sân demo đang hoạt động.', status: 'ACTIVE' } });
  }
  await tx.priceRule.deleteMany({ where: { facility_id: facility.id } });
  await tx.priceRule.create({ data: { facility_id: facility.id, start_time: time('06:00'), end_time: time('22:00'), hourly_rate: spec.rate, created_at: now } });
  await tx.cancellationPolicy.upsert({ where: { facility_id: facility.id },
    create: { facility_id: facility.id, cutoff_hours: 2, created_at: now }, update: { cutoff_hours: 2 } });
  await tx.bankAccount.upsert({ where: { facility_id: facility.id }, create: { facility_id: facility.id,
    bank_name: 'Ngân hàng Demo - Không chuyển tiền thật', account_number: `DEMO${facility.id}`,
    account_holder: 'TAI KHOAN DEMO KHONG CHUYEN TIEN', qr_image_path: null, created_at: now },
    update: { bank_name: 'Ngân hàng Demo - Không chuyển tiền thật', account_number: `DEMO${facility.id}`,
      account_holder: 'TAI KHOAN DEMO KHONG CHUYEN TIEN', qr_image_path: null } });
  return facility;
}
async function seed() {
  assertStaticData();
  const fingerprint = targetFingerprint();
  const before = await databaseSnapshot();
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ mode: 'CHECK_ONLY', target_fingerprint: fingerprint, ...before }));
    return;
  }
  assertWriteGuard(fingerprint);
  const [ownerHash, customerHash, adminHash] = await Promise.all([
    argon2.hash(process.env.DEMO_OWNER_PASSWORD, passwordOptions),
    argon2.hash(process.env.DEMO_CUSTOMER_PASSWORD, passwordOptions),
    argon2.hash(process.env.DEMO_ADMIN_PASSWORD, passwordOptions),
  ]);
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261006)`;
    const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
    const admin = await upsertDemoUser(tx, { email: EMAILS.admin, name: 'Demo Admin Reviewer', role: 'ADMIN', passwordHash: adminHash }, now);
    const owner = await upsertDemoUser(tx, { email: EMAILS.owner, name: 'Demo Owner', role: 'CUSTOMER', passwordHash: ownerHash }, now);
    const customer = await upsertDemoUser(tx, { email: EMAILS.customer, name: 'Demo Customer', role: 'CUSTOMER', passwordHash: customerHash }, now);
    await ensureOwnerProfile(tx, owner, admin, now);
    const amenityRows = [];
    for (const name of AMENITIES) amenityRows.push(await tx.amenity.upsert({ where: { name }, create: { name, is_active: true, created_at: now }, update: { is_active: true } }));
    const facilities = [];
    for (const spec of FACILITIES) {
      const facility = await ensureFacility(tx, owner.id, admin.id, spec, now);
      facilities.push(facility);
      for (const amenity of amenityRows) await tx.facilityAmenity.upsert({
        where: { facility_id_amenity_id: { facility_id: facility.id, amenity_id: amenity.id } },
        create: { facility_id: facility.id, amenity_id: amenity.id, created_at: now }, update: {},
      });
    }
    return { owner_id: String(owner.id), customer_id: String(customer.id), facility_ids: facilities.map(v => String(v.id)) };
  }, { maxWait: 20000, timeout: 60000 });
  const after = await databaseSnapshot();
  console.log(JSON.stringify({ mode: 'SEEDED', target_fingerprint: fingerprint, result, counts: after.counts }));
}

try { await seed(); }
catch (error) { console.error(`DEMO SEED FAILED: ${error?.message || 'UNKNOWN_ERROR'}`); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
