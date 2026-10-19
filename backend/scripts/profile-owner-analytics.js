import { performance } from 'node:perf_hooks';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/config/prisma.js';
import { createOwnerAnalyticsService, courtsSql, overviewCapacitySql, overviewFactsSql } from '../src/modules/analytics/owner-service.js';

if (process.argv.slice(2).join(' ') !== '--read-only') throw new Error('OWNER_ANALYTICS_PROFILE_REQUIRES_EXPLICIT_READ_ONLY_FLAG');

function percentile(values, percentage) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * percentage) - 1];
}

async function explain(sql) {
  const rows = await prisma.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
  const document = rows[0]['QUERY PLAN'][0];
  return {
    planning_ms: document['Planning Time'],
    execution_ms: document['Execution Time'],
    root_node: document.Plan['Node Type'],
    total_cost: document.Plan['Total Cost'],
    shared_hit_blocks: document.Plan['Shared Hit Blocks'],
    shared_read_blocks: document.Plan['Shared Read Blocks'],
  };
}

try {
  const owner = await prisma.ownerProfile.findFirst({ orderBy: { user_id: 'asc' }, select: { user_id: true } });
  if (!owner) throw new Error('OWNER_ANALYTICS_PROFILE_OWNER_MISSING');
  const [{ to, from }] = await prisma.$queryRaw`SELECT
    to_char(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS to,
    to_char((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 29, 'YYYY-MM-DD') AS from`;
  const input = { from, to, facility_id: null };
  const courtInput = { ...input, page: 1, page_size: 20 };
  const actor = { user: { id: String(owner.user_id) } };
  const service = createOwnerAnalyticsService(prisma);
  await service.overview(actor, input);
  await service.courts(actor, courtInput);
  const overview = [], courts = [];
  for (let sample = 0; sample < 10; sample++) {
    let started = performance.now(); await service.overview(actor, input); overview.push(performance.now() - started);
    started = performance.now(); await service.courts(actor, courtInput); courts.push(performance.now() - started);
  }
  const report = {
    mode: 'READ_ONLY', sample_size: 10, range: { from, to },
    overview_ms: { p50: percentile(overview, 0.5), p95: percentile(overview, 0.95), samples: overview },
    courts_ms: { p50: percentile(courts, 0.5), p95: percentile(courts, 0.95), samples: courts },
    explain: {
      facts: await explain(overviewFactsSql(owner.user_id, input)),
      capacity: await explain(overviewCapacitySql(owner.user_id, input)),
      courts: await explain(courtsSql(owner.user_id, courtInput)),
    },
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await prisma.$disconnect();
}
