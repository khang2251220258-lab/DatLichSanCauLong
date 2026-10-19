import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { prisma } from '../src/config/prisma.js';
import { getPostgresConfig } from '../src/config/database.js';
import { createPublicFacilityService } from '../src/modules/facilities/public/service.js';
import { createAvailabilityService } from '../src/modules/courts/availability/service.js';
import { createOwnerPaymentService } from '../src/modules/payments/owner-service.js';

if (process.env.NODE_ENV !== 'development' || process.argv[2] !== '--read-only') {
  throw new Error('PERFORMANCE_PROFILE_REQUIRES_DEVELOPMENT_READ_ONLY');
}

const samples = 7;
const timed = async fn => {
  const started = performance.now();
  await fn();
  return Number((performance.now() - started).toFixed(1));
};
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return { samples: values.length, cold: values[0], min: sorted[0], p50: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1), values };
};
const measure = async fn => {
  const values = [];
  for (let index = 0; index < samples; index += 1) values.push(await timed(fn));
  return stats(values);
};

const storage = { url: value => `https://example.invalid/${encodeURIComponent(value)}` };
const report = { mode: 'READ_ONLY', samples };
const pool = new Pool(getPostgresConfig());

try {
  report.connection_acquire_and_select_1 = await measure(async () => {
    const client = await pool.connect();
    try { await client.query('SELECT 1'); } finally { client.release(); }
  });
  const client = await pool.connect();
  try {
    report.pg_select_1_reused_connection = await measure(() => client.query('SELECT 1'));
    report.pg_simple_read_only_transaction = await measure(async () => {
      await client.query('BEGIN READ ONLY');
      try { await client.query('SELECT clock_timestamp()'); } finally { await client.query('ROLLBACK'); }
    });
    report.pg_five_sequential_queries = await measure(async () => {
      for (let index = 0; index < 5; index += 1) await client.query('SELECT 1');
    });
    const explain = await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT 1');
    const plan = explain.rows[0]['QUERY PLAN'][0];
    report.select_1_server = {
      planning_ms: Number(plan['Planning Time'].toFixed(3)),
      execution_ms: Number(plan['Execution Time'].toFixed(3)),
    };
  } finally { client.release(); }

  report.prisma_select_1 = await measure(() => prisma.$queryRaw`SELECT 1`);
  const facility = await prisma.facility.findFirst({
    where: { status: 'ACTIVE', owner: { user: { status: 'ACTIVE' } } },
    select: { id: true, courts: { where: { status: 'ACTIVE' }, select: { id: true }, orderBy: { id: 'asc' }, take: 1 } },
    orderBy: { id: 'asc' },
  });
  if (!facility || !facility.courts[0]) throw new Error('READ_ONLY_PROFILE_FIXTURE_NOT_FOUND');
  const publicService = createPublicFacilityService(prisma, storage);
  report.public_facility_list = await measure(() => publicService.list({ page: 1, page_size: 20 }));
  report.public_facility_detail = await measure(() => publicService.detail(facility.id));
  const tomorrow = new Date(Date.now() + 86400000);
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow);
  report.availability = await measure(() => createAvailabilityService(prisma).read(facility.courts[0].id, localDate));

  const ownerSession = await prisma.authSession.findFirst({
    where: { revoked_at: null, expires_at: { gt: new Date() }, user: { status: 'ACTIVE', role: 'CUSTOMER', ownerProfile: { isNot: null } } },
    select: { id: true, user: { select: { id: true } } },
    orderBy: { id: 'asc' },
  });
  if (ownerSession) {
    const actor = { id: ownerSession.id, user: { id: String(ownerSession.user.id) } };
    report.owner_booking_list = await measure(() => createOwnerPaymentService(prisma, storage).list(actor, { page: 1, page_size: 20 }));
  } else report.owner_booking_list = { skipped: 'SAFE_OWNER_SESSION_NOT_FOUND' };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await prisma.$disconnect();
  await pool.end();
}
