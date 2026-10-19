# Owner Analytics Specification

## 1. Status and scope

Phase 1 audit/specification and Phase 2 backend aggregation APIs were completed on 2026-10-17. Phase 3 Owner dashboard is now implemented at `/owner/analytics`. No phase added schema, indexes, analytics tables, seed data, or persistent database mutations.

Business timezone is `Asia/Ho_Chi_Minh`. Analytics always derives the Owner from the authenticated ACTIVE session with OWNER capability. A supplied `facility_id` is only a filter and must resolve to a Facility owned by that Owner; a missing or cross-owner Facility returns `404 RESOURCE_NOT_FOUND`.

`Booking` is the authoritative occurrence. A `BookingSeries` is only a grouping object and is never counted as a played/confirmed booking. Each recurring child Booking contributes once, using the same rules as a non-recurring Booking.

## 2. Data-source audit

| Metric/data | Source and fields | Notes |
| --- | --- | --- |
| Owner scope | `facilities.owner_id`, `courts.facility_id`, `bookings.court_id` | Never accept an Owner ID from the client. |
| Booking occurrence | `bookings.id`, `status`, `booking_flow_version`, `start_at`, `end_at`, `court_id`, `booking_series_id` | V1, V2 and recurring children share this table. |
| Booking value | `bookings.total_amount`, `deposit_amount`, `remaining_amount` | Immutable snapshots; `deposit + remaining = total`. |
| Confirmation evidence | `bookings.confirmed_at`, `confirmed_by_user_id`; V1 may additionally have `payment_proofs.status=APPROVED` | Owner confirmation is evidence that the deposit was reconciled, not an accounting ledger for the remaining 70%. |
| Completion evidence | `bookings.status=COMPLETED`, `completed_at` | Current source does not expose the documented Owner completion endpoint, so coverage is incomplete and cannot establish all actual play sessions. |
| Cancellation | `status=CANCELLED`, `cancelled_at`, `cancelled_by`, `cancellation_reason` | A cancelled occurrence is not occupied/value-confirmed in current-state KPIs. |
| Refund | `refunds.booking_id`, `amount`, `status`, `requested_at`, `proof_submitted_at`, `confirmed_at`, `refunded_at` | Only `REFUNDED` proves the Customer acknowledged receipt. |
| Occupied duration | `booking_slots.booking_id`, `start_at`, `end_at`, `slot_amount` joined to Booking | Slot rows correctly distribute multi-slot bookings across half-hour buckets. |
| Capacity | `facilities.opening_time`, `closing_time`; `courts.status`; `court_blocks.start_at/end_at` | Current configuration is not historical configuration. Past capacity is therefore a current-configuration proxy. |
| Effective holds | Booking status/version plus `expires_at` or `confirmation_expires_at` and DB time | Optional operational metric only; never count stale holds as utilization and never mutate/cleanup from Analytics. |
| Price rules | `price_rules.facility_id`, `start_time`, `end_time` | Not needed for snapshot value; may identify unpriced future capacity, but must not replace Booking snapshots. |

`CourtSlotLock` protects writers and current occupancy but is not historical analytics data. Payment/refund proof identifiers and bank snapshots are never returned by Analytics.

## 3. Authoritative metric semantics

### 3.1 Booking and play terminology

- `confirmed_booking_count`: occurrence count whose current status is `CONFIRMED` or `COMPLETED`, grouped by local occurrence `start_at`.
- `completed_booking_count`: occurrences currently `COMPLETED`. This is the strongest available play proxy, but must be labelled **Buổi đã hoàn thành**, not **Lượt chơi thực tế**, until the completion workflow is fully implemented and consistently used.
- `cancelled_booking_count`, `rejected_booking_count`, and `expired_booking_count` are separate measures. Pending rows are not mixed into confirmed counts.
- One recurring series of twelve child Bookings contributes twelve occurrences, never one.

### 3.2 Financial terminology

- `confirmed_booking_value`: sum of `total_amount` for current `CONFIRMED` and `COMPLETED` occurrences. UI label: **Giá trị booking đã xác nhận**. This is scheduled/fulfilled booking value, not cash received.
- `confirmed_deposit_amount`: sum of `deposit_amount` for occurrences with non-null `confirmed_at`/`confirmed_by_user_id`. This is a known, manually reconciled deposit amount across V1, V2, and recurring children.
- `refunded_deposit_amount`: sum of `Refund.amount` only where Refund status is `REFUNDED`.
- `net_known_deposit_amount = confirmed_deposit_amount - refunded_deposit_amount`. UI must retain the word **cọc**; it is not total revenue.
- Actual received revenue is **not currently measurable**. The system has no gateway/ledger or explicit receipt state for the remaining 70% paid at the venue. `total_amount - refund.amount` must not be labelled actual revenue.

All operational/value grouping uses occurrence `start_at` converted to `Asia/Ho_Chi_Minh`. A future cashflow report could group deposits/refunds by `confirmed_at`/`refunded_at`; that is outside MVP.

### 3.3 Status matrix

| Booking status | Booking KPI | Occupied slots | Confirmed booking value | Explanation |
| --- | --- | --- | --- | --- |
| `PENDING_PAYMENT` | Separate pending count only | No | No | V1 temporary hold; stale rows are not utilization. |
| `PENDING_CONFIRMATION` | Separate pending count only | No | No | Effective holds may be shown operationally, but are not confirmed demand. |
| `CONFIRMED` | Yes | Yes | Yes | Accepted future/current occurrence. |
| `COMPLETED` | Yes; also completed count | Yes for historical utilization | Yes | Strongest play proxy. |
| `CANCELLED` | Cancelled count only | No | No | Slot released; refund/deposit history is reported separately. |
| `REJECTED` | Rejected count only | No | No | Slot released. |
| `EXPIRED` | Expired count only | No | No | Slot released/effectively expired. |

Analytics reads effective expiry using one DB-time snapshot where pending operational counts are requested. It does not update stale rows or delete locks.

## 4. Range and grouping contract

- Required query fields: `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, interpreted as local calendar dates.
- Inclusive range: `[from 00:00, day-after-to 00:00)` in `Asia/Ho_Chi_Minh`, converted once to UTC parameters.
- `from <= to`; maximum 366 inclusive days. Invalid/unknown/duplicate query fields return `422 INVALID_QUERY` or the project's equivalent validation error.
- Frontend presets may provide Today, 7 days, 30 days, this month, and previous month. The backend receives only explicit `from`/`to`.
- Month, weekday, date, and slot bucket are calculated in PostgreSQL after `AT TIME ZONE 'Asia/Ho_Chi_Minh'`. Weekday DTO uses ISO values 1 Monday through 7 Sunday.
- Half-hour slot usage uses `BookingSlot`, so an 18:00–20:00 occurrence contributes to 18:00, 18:30, 19:00, and 19:30.

## 5. Capacity and utilization

`confirmed_slot_utilization_rate = confirmed_occupied_slots / operational_capacity_slots * 100`.

For MVP:

1. Generate 30-minute local slots inside each selected Facility's current opening interval for each currently ACTIVE Court.
2. Exclude any generated slot overlapping a `CourtBlock` from operational capacity and report it separately as `blocked_slot_count`.
3. `confirmed_occupied_slots` are BookingSlot rows belonging to `CONFIRMED` or `COMPLETED` Bookings.
4. `available_slot_count = operational_capacity_slots - confirmed_occupied_slots`; clamp only after validating data invariants, never to hide invalid overlap.
5. When capacity is zero, `utilization_rate` is `null`, not zero.

This is labelled **Tỷ lệ lấp đầy theo cấu hình hiện tại**. Facility opening hours and Court/Facility status changes are not historized; therefore this is not an exact historical capacity measure. PriceRule gaps may be exposed later as `unpriced_slot_count`, but they do not change physical operational capacity in Phase 2.

Daily capacity reports local `date`, capacity, blocked, occupied, and available slots. Weekday/hour heatmaps aggregate those daily rows across the selected range and return counts plus a ratio; the denominator is always included so percentages remain auditable.

## 6. Proposed Phase 2 API

### `GET /api/v1/owner/analytics/overview`

Protected OWNER read. Query whitelist: `from`, `to`, optional `facility_id`.

```json
{
  "data": {
    "range": { "from": "2026-10-01", "to": "2026-10-31", "timezone": "Asia/Ho_Chi_Minh", "facility_id": null },
    "summary": {
      "confirmed_booking_count": 0,
      "completed_booking_count": 0,
      "cancelled_booking_count": 0,
      "confirmed_hours": "0.0",
      "confirmed_booking_value": "0",
      "confirmed_deposit_amount": "0",
      "refunded_deposit_amount": "0",
      "net_known_deposit_amount": "0",
      "operational_capacity_slots": 0,
      "confirmed_occupied_slots": 0,
      "utilization_rate": null
    },
    "monthly_trend": [{ "month": "2026-10", "confirmed_count": 0, "cancelled_count": 0, "confirmed_booking_value": "0" }],
    "weekday_usage": [{ "weekday": 1, "confirmed_count": 0, "occupied_slots": 0, "capacity_slots": 0, "utilization_rate": null }],
    "hourly_heatmap": [{ "weekday": 1, "start_time": "06:00", "occupied_slots": 0, "capacity_slots": 0, "blocked_slots": 0, "available_slots": 0, "utilization_rate": null }],
    "daily_capacity": [{ "date": "2026-10-01", "capacity_slots": 0, "occupied_slots": 0, "blocked_slots": 0, "available_slots": 0 }]
  },
  "meta": { "server_time": "2026-10-17T00:00:00.000Z" }
}
```

Money remains a decimal string. Counts are integers. Ratios are decimal strings or `null`; frontend must not recompute them. Empty buckets required by the range are zero-filled by PostgreSQL, not invented client-side.

### `GET /api/v1/owner/analytics/courts`

Same range/facility filter plus `page` default 1 and `page_size` default 20/max 100. Order: `confirmed_occupied_slots DESC`, then Court ID ASC. Response is a paginated whitelist of Court ID/name, Facility ID/name, confirmed count/hours/value, capacity/occupied/blocked slots, and nullable utilization rate. No Customer, bank, proof, refund storage, lock, or snapshot-private fields are returned.

## 7. Query and performance strategy

- Convert local boundaries once in PostgreSQL/validated server input.
- Overview uses two independent set-based queries in parallel: (A) Booking/BookingSlot/Refund aggregates and time distributions; (B) generated operational capacity joined to blocks and confirmed slot occupancy. Do not fetch rows into Node for reduction.
- Court performance uses one bounded aggregate query with pagination and total count; no per-Court detail query.
- Expected API database round trips: overview 2 parallel statements; court table 1 statement. No transaction is required. Small timing differences between read-only statements are accepted and documented; adding a repeatable-read transaction would add material remote RTT for little dashboard value.
- CTEs, `FILTER`, `GROUP BY`, `date_trunc`, `generate_series`, and `AT TIME ZONE` are appropriate. Capacity generation must be bounded by the 366-day limit and owned Court set.
- The current indexes support ownership lookup (`facilities(owner_id,status)`), Court lookup (`courts(facility_id,status)`), Booking range/status access, BookingSlot-by-booking, refunds-by-booking, and CourtBlock range lookup. The representative development monthly query (47 bookings) measured 4.163 ms execution with 10 shared hits and zero disk reads.
- No index is approved in Phase 1. Before any migration, Phase 2 must run `EXPLAIN (ANALYZE, BUFFERS)` against the final overview and capacity queries with representative volume. A composite Owner-path/time index may only be proposed from that evidence.
- Materialized views/analytics tables are not needed for MVP. Revisit only after measured production-scale latency or volume requires them.

## 8. Security and errors

- Authenticate session, require ACTIVE User and OWNER capability, then scope every relation through `facilities.owner_id = session user ID`.
- Do not accept `owner_id`; cross-owner `facility_id` returns 404 to prevent enumeration.
- Validate exact query keys, local dates, range order, range length, page limits, and numeric IDs before database work.
- Analytics is GET/read-only; Origin/CSRF mutation middleware is not applicable. Existing credentialed CORS/session handling remains required.
- DTO is aggregate-only. No Customer PII, BankAccount, PaymentProof/Refund proof identifiers, signed URLs, CourtSlotLock, or private paths.
- Date bound, pagination, fixed response bucket sizes, statement timeout/query budget, and request abort handling mitigate expensive requests. Do not cache protected data across user/capability identity.

## 9. Owner UI proposal

Implemented Phase 3 route: `/owner/analytics`, added to the Owner workspace after backend Phase 2 passed.

1. Header **Thống kê hoạt động** with Facility and date-range filters.
2. Four primary KPI cards: confirmed booking value, confirmed booking count, confirmed hours, and current-configuration utilization.
3. Booking/value monthly trend: grouped bar or combined bar/line with explicit units.
4. Weekday bars and a weekday × half-hour heatmap.
5. Paginated Court performance table with utilization progress visualization and raw numerator/denominator.

The dashboard answers: how many bookings are confirmed, what their scheduled value is, how many confirmed hours exist, which weekday/time is busiest, which slots retain capacity, and which Court has the highest confirmed utilization. It must not claim actual total revenue or actual play attendance.

## 10. Limitations and deferred work

- Actual received revenue remains unmeasurable until the 70% payment has an authoritative ledger/status.
- Actual play count remains incomplete until the Owner completion/check-in workflow is fully implemented and consistently used.
- Exact historical utilization needs configuration history for Facility hours and Court/Facility status, plus durable CourtBlock history semantics.
- Court filter, realtime analytics, export, forecasts, Admin analytics, cache/precomputation, materialized views, and chart-library selection are deferred.

No unresolved decision blocks Phase 2 backend aggregation, provided it uses the names and limitations above.

## 11. Phase 2 implementation evidence

The protected routes `GET /api/v1/owner/analytics/overview` and `GET /api/v1/owner/analytics/courts` are implemented in `backend/src/modules/analytics`. Overview executes exactly two safe parameterized, set-based PostgreSQL statements in parallel; Court performance executes one aggregate statement. Neither path opens a transaction or reduces Booking rows in Node.

PostgreSQL integration covers ACTIVE OWNER authorization, cross-owner 404, all seven Booking states, a recurring child Booking, exact NUMERIC money, Refund `PENDING`/`PROOF_SUBMITTED`/`REFUNDED`, local UTC-to-Vietnam month/weekday grouping, 30-minute occupancy, CourtBlock, zero capacity, pagination, and cleanup of `TEST_ANALYTICS_` fixtures. The read-only 30-day profile used 10 sequential warm samples. Final plans used no disk reads and did not justify an index: facts execution 0.769 ms, capacity 214.917 ms, and Court performance 165.05 ms on the development dataset. Remote service p50/p95 was 1087.52/2602.85 ms for overview and 450.01/483.36 ms for Court performance; the overview tail is dominated by hosted PostgreSQL/network variability rather than the facts aggregation.

Historical utilization remains a proxy based on current opening hours and current ACTIVE Courts. The two parallel overview statements may observe a small read boundary, accepted for this dashboard. Phase 3 must use these DTOs without relabelling scheduled value as actual revenue.

## 12. Phase 3 frontend and Phase 4 runtime status (2026-10-18)

Phase 3 implements `/owner/analytics` with the two aggregate endpoints, strict DTO validation, independent parallel reads, protected snapshot isolation by account/capability/query, stale-generation protection, responsive KPI/chart/heatmap/Court presentations, and component coverage for loading, error, empty, zero-capacity, pagination, and filter reset behavior.

Phase 4 authenticated runtime verification is **PASS**. A disposable PostgreSQL fixture with prefix `TEST_E2E_OWNER_ANALYTICS_` authenticates through the real Login UI, covers 21 Courts for server pagination, representative confirmed/completed Booking facts and one CourtBlock, and cleans all rows/AuthSessions after every run. Desktop/tablet/mobile issue exactly one Overview and one Courts request on initial load, start them in parallel, preserve URL/filter/navigation state, avoid per-Court requests and horizontal overflow, and produce screenshot review candidates. Court pagination requests only Courts; filter changes request both endpoints and both responses are verified HTTP 200. The measured protected-snapshot revisit was 141 ms.

Runtime verification corrected the Courts response to the standard exact list metadata (`server_time`, `page`, `page_size`, `total`) and deferred the shared Owner hook's initial read so the discarded React StrictMode mount cannot create a duplicate GET. AbortController, generation guards, identity/capability/path cache isolation and last-known-good background revalidation remain authoritative. Screenshot candidates are not approved visual references. Owner Analytics MVP is closed; the next recommended phase is Final Project Stabilization.
