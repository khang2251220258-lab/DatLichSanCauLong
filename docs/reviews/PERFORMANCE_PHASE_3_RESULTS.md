# Performance Phase 3 Results

Date: 2026-10-16. Method and environment match [the baseline](PERFORMANCE_PHASE_3_BASELINE.md). The change removes explicit transaction wrappers only where the entire read is already one aggregate SQL statement. Mutation transactions, lock order, DB clock authority and DTOs are unchanged.

| Operation | before p50 ms | after p50 ms | before p95 ms | after p95 ms | data-query count before/after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Public Facility list | 1089.9 | 281.3 | 1104.1 | 286.6 | 1 / 1 |
| Public Facility detail | 1096.4 | 281.8 | 1115.6 | 289.9 | 1 / 1 |
| Availability | 1365.4 | 283.6 | 1388.1 | 333.3 | 1 / 1 |
| Owner Booking list | 2085.6 | 1403.3 | 2091.0 | 1408.9 | 3 / 3 |

Connection primitives remained equivalent: reused `SELECT 1` p50 263.1 ms; simple read-only transaction p50 787.4 ms; five sequential queries p50 1316.2 ms. PostgreSQL `SELECT 1` planning/execution remained 0.019/0.023 ms.

The post-change Booking V2 isolated suite measured create 9716.7 ms, Availability 261.5 ms and lazy expiry 7744.2 ms. The entire 14-test concurrency/rollback suite passed and cleaned its fixture. Create and expiry were intentionally not structurally changed: reducing their mandatory sequential locks/rechecks without a consolidated, reviewed SQL design would trade correctness for benchmark speed. Their remaining time is consistent with roughly 263 ms per remote round trip plus transaction control and initial connection effects.

## Query and transaction result

- Public list/detail: direct single-statement reads; approximately three network round trips removed per request.
- Availability: direct single-statement snapshot; `clock_timestamp()` and all occupancy/config data remain in the same SQL statement. The explicit transaction and `SET TRANSACTION READ ONLY` were redundant.
- Owner list: its aggregate query is direct; DB-time and authoritative session/Owner checks remain separate. Further consolidation would require a contract-sensitive authorization query and was not attempted.
- Booking create/lazy expiry/Owner confirm/reject: unchanged transaction and locking semantics.
- Duplicate application data queries: none found in Public or Availability. Owner list has no duplicate read, though its three required concerns remain sequential.

## Index and connection decisions

No index or migration was created. The observed server execution for the primitive query is orders of magnitude below network time, and the aggregate read endpoints became fast after removing transaction-control round trips. PrismaClient is a module singleton, the pg adapter reuses a pool capped at five connections, and TLS verifies the configured CA. These settings were retained.

The safe production recommendation is to co-locate the Node deployment and Supabase database region and use the provider-supported pooling endpoint/mode appropriate for persistent application traffic after deployment benchmarking. Do not disable TLS or create PrismaClient per request.
