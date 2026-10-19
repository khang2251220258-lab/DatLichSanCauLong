# Guest Search Phase 1 Specification

Status: **IMPLEMENTED / VERIFIED** (2026-10-17). Backend interval filters, strict validation, set-based query and PostgreSQL coverage are implemented. Public Home/List/Detail integration and safe in-memory auth booking intent are also implemented and verified in Phase 3.

## Phase 3 public UI contract

- Home, `/facilities`, and `/facilities/:facility_id` preserve `district`, `date`, `start_time`, and `end_time` in URL state. List additionally preserves `q`, `page`, and `page_size`; filter changes reset `page=1`.
- Date/time input follows the backend limits: local `Asia/Ho_Chi_Minh` date, half-hour boundaries, 1–6 slots, and at most 30 days ahead. The backend remains authoritative for DB time and availability.
- Interval list responses are validated fail-closed and must contain `matching_courts`; non-interval list responses retain the original exact DTO. Cards describe matching Courts as a search snapshot, never a reservation.
- Detail intersects URL Court IDs with the authoritative ACTIVE Court list, defaults to the first valid matching Court, and calls Availability only for the selected Court/date. The selected interval is restored only if every returned slot is currently `AVAILABLE`.
- Guest booking intent stays in React/router memory. It is never written to local/session storage and never triggers a booking mutation before authentication. Login/Register may restore confirmation only for a newly authenticated CUSTOMER-capable account; ADMIN is routed to its valid landing page. Booking creation still performs the authoritative transactional recheck.
- `SLOT_UNAVAILABLE` returns the user to the preserved search/detail context to refresh availability. Unknown mutation results remain fail-closed and are not retried automatically.

## Scope and API

Extend the existing public endpoint `GET /api/v1/facilities`. Do not add `/facilities/search`. Existing `q`, `district`, `page`, and `page_size` behavior remains compatible. Guest Search adds the all-or-none trio `date`, `start_time`, and `end_time`.

`district` is the legacy API/schema field for one current commune-level administrative unit of Da Nang (ward, commune, or special zone). It is trim + Unicode NFC normalized and must exactly match the existing 94-entry runtime registry. There is no separate ward or city field. Address remains free text; coordinates are optional and are not used by Phase 1 search.

## Validation

- `date`: local `YYYY-MM-DD` in `Asia/Ho_Chi_Minh`; today through 30 local days ahead.
- `start_time`, `end_time`: exact `HH:mm`, on `:00` or `:30`; `start_time < end_time`.
- The trio is either entirely absent (the current Facility List contract) or entirely present.
- The interval contains 1 to 6 consecutive 30-minute slots and is at most 3 hours.
- A Facility is a match only when the interval lies wholly within its opening hours. Being outside one Facility's hours is a non-match, not a request-wide validation error.
- Missing/partial/malformed/range/boundary/duration errors return `422 INVALID_SEARCH_RANGE`; malformed or past date returns `422 INVALID_DATE`. Unknown or repeated query parameters follow the existing `422 VALIDATION_ERROR` convention.
- Browser time is never authoritative. One database-time snapshot is used for the whole response; an interval whose first slot is not strictly after DB time has no matching Court.

## Match semantics

A Facility is returned only when it is ACTIVE, its Owner User is ACTIVE, and at least one ACTIVE Court is `AVAILABLE` for every requested half-open slot `[start_at,end_at)`.

The existing Availability priority and dual-read behavior apply unchanged: `PAST > BLOCKED > BOOKED > HELD > UNPRICED > AVAILABLE`. CourtBlock overlap blocks. CONFIRMED is BOOKED. V1 PENDING_CONFIRMATION and unexpired V1 PENDING_PAYMENT are HELD. V2 PENDING_CONFIRMATION is HELD only while `confirmation_expires_at` is non-null and DB time is earlier than it. CANCELLED, REJECTED, EXPIRED, COMPLETED, expired V1 holds, and expired V2 confirmation holds do not block.

Every requested slot must have exactly one covering PriceRule. Courts with missing or ambiguous price coverage are not search matches; a misconfigured Court does not fail the whole public result set. Search does not create or change Booking, BookingSlot, CourtSlotLock, expiry, or any persistent data.

## Response

Keep the existing Facility card whitelist and pagination metadata. For an interval search, each Facility item additionally contains:

```json
{
  "id": 1,
  "name": "...",
  "district": "...",
  "address": "...",
  "cover_image_url": null,
  "amenities": [],
  "matching_courts": [{ "id": 10, "name": "Sân 1" }]
}
```

`matching_courts` is ordered by Court ID and contains only Courts matching the entire requested interval. Phase 1 does not return a quote, deposit, rating, popularity, owner/bank data, storage identifiers, internal lock rows, customer data, payment proof, or refund data. Facility Detail and single-Court Availability remain the source for presentation detail. Booking creation always performs its authoritative transactional recheck and may still return `SLOT_UNAVAILABLE`.

## Query and performance design

Use one set-based PostgreSQL statement with a shared DB-time/interval CTE: filter public Facility/Court rows; generate the 30-minute requested slots; reject any Court with a half-open CourtBlock or effective Booking overlap; require exactly one PriceRule per slot; group matching Courts per Facility; order Facilities by ID; paginate Facilities; and aggregate cover, active amenities, items, and total metadata. Do not call the Availability service per Court and do not open a read-only transaction around a single statement.

Expected database round trips: **1**, independent of Facility/Court count. Existing relevant indexes are Facility `(status,district)`, Court `(facility_id,status)`, CourtBlock `(court_id,start_at,end_at)`, Booking `(court_id,start_at,end_at)`, PriceRule `(facility_id,start_time)`, BookingSlot booking/time indexes, and the CourtSlotLock primary key. No schema change or migration is required for the MVP. Any new index requires `EXPLAIN (ANALYZE, BUFFERS)` evidence against representative development data.

## Security and deferred scope

Search is public GET: no session and no CSRF. It still requires strict bounded validation, parameterized SQL, DTO whitelisting, and pagination max 100. Guest booking intent may be held only in frontend memory/navigation state; after login it may be restored only when the new account is authorized for the destination. Search is a snapshot, never a reservation.

Recurring/fixed-schedule search, maps/geocoding, coordinate-radius search, price/rating/amenity filters, search caching, Redis, Elasticsearch, realtime, and recurring booking are deferred.
