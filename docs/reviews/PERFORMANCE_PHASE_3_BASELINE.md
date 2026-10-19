# Performance Phase 3 Baseline

Date: 2026-10-16. Environment: local Node.js 24 / Prisma 7.10 / `@prisma/adapter-pg`, connecting over verified TLS to the configured Supabase development PostgreSQL target. No credential or connection string was recorded.

## Method

Read operations used seven sequential samples. `cold` is the first sample; p50/p95 use nearest-rank percentiles. The Booking V2 integration fixture supplied isolated mutation measurements and removed its own records. Database execution was separated from client-observed latency with `EXPLAIN (ANALYZE, BUFFERS)` on `SELECT 1`.

| Operation | samples | cold ms | min ms | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| acquire pooled connection + SELECT 1 | 7 | 2446.4 | 268.8 | 269.7 | 2446.4 | 2446.4 |
| SELECT 1, reused connection | 7 | 270.4 | 268.9 | 269.1 | 274.8 | 274.8 |
| simple read-only transaction | 7 | 809.4 | 808.1 | 809.4 | 820.8 | 820.8 |
| five sequential SELECT 1 | 7 | 1352.4 | 1348.0 | 1354.0 | 1361.0 | 1361.0 |
| Prisma SELECT 1 | 7 | 2521.3 | 271.7 | 273.1 | 2521.3 | 2521.3 |
| Public Facility list | 7 | 1104.1 | 1088.3 | 1089.9 | 1104.1 | 1104.1 |
| Public Facility detail | 7 | 1115.6 | 1089.4 | 1096.4 | 1115.6 | 1115.6 |
| Availability | 7 | 1388.1 | 1297.8 | 1365.4 | 1388.1 | 1388.1 |
| Owner Booking list | 7 | 2091.0 | 2077.6 | 2085.6 | 2091.0 | 2091.0 |

Booking V2 measurements available before the change were 10,207 ms create, 1,508 ms Availability and 8,833 ms lazy expiry. A previous isolated run measured 9,655.7 / 1,326.3 / 7,976.4 ms respectively. These are sanity samples rather than a statistically stable percentile series.

## Evidence and diagnosis

`SELECT 1` planned in 0.019 ms and executed in 0.019 ms on PostgreSQL, while its reused-connection client time was about 269 ms. Five sequential queries scaled almost linearly to 1.35 seconds. A transaction containing one query cost about 809 ms because BEGIN, query and ROLLBACK each cross the network.

The public queries and Availability were already one aggregate SQL statement, but each was wrapped in an explicit transaction; Availability also issued `SET TRANSACTION READ ONLY`. The transaction could not improve statement-level snapshot consistency because PostgreSQL already evaluates one statement against one snapshot. Owner Booking list likewise wrapped its one aggregate list statement after separate DB clock and session checks.

The dominant cost is remote network/connection round trips, with a separate roughly 2.5-second first-connection penalty. SQL execution is not the demonstrated bottleneck. No index change is justified by this evidence.

## Application query counts before optimization

- Health: 0 database queries.
- Public Facility list: 1 application data query, plus transaction control commands.
- Public Facility detail: 1 application data query, plus transaction control commands.
- Availability: 1 application data query plus `SET TRANSACTION READ ONLY`, plus transaction control commands.
- Owner Booking list: DB clock + session/Owner check + 1 aggregate query, plus transaction control commands.
- Booking V2 create: approximately 18 application operations in the current call graph; lock ordering, rechecks and writes account for most of them.
- Lazy-expiry detail: approximately 13 application operations when expiry updates and lock release occur.

Counts for create/expiry are audited call-graph counts and vary by number of distinct User locks and whether expiry/conflict branches execute. Their sequential locks and rechecks protect correctness and were not removed.
