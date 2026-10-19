# Recurring Cancellation and Refund Specification

Status: **Phase 5B backend, Phase 5C Customer UI and Phase 5D authenticated Customer runtime verified** (2026-10-18).

Phase 5B closure evidence: backend local 93/93, recurring PostgreSQL 17/17 and all related PostgreSQL regression/cleanup PASS. Phase 5C evidence: targeted recurring frontend 15/15, full sequential frontend 408/408, lint and production build PASS. Phase 5D evidence: authenticated Playwright 4/4, targeted recurring 16/16, full sequential frontend 409/409, backend local 93/93, lint/build/Prisma/health/diff PASS. Phase 5D fixture cleanup returned all scoped counts to zero and preserved Booking #1119. No schema, migration, seed or persistent demo-data change in Phase 5C/5D.

## Phase 5D runtime boundary

- The authenticated runtime fixture is isolated by the `TEST_E2E_CUSTOMER_` namespace and creates only valid local users, one Facility/Court, one confirmed Series, four children, BookingSlots, active locks and one `PENDING` Refund. Setup and cleanup are guarded for the development target; cleanup is exact-scope and idempotent.
- Initial Series List and Series Detail each issue one GET. No per-child Booking, Refund or PaymentProof request is permitted.
- Runtime covers `CONFIRMED`, `COMPLETED`, `CANCELLED`, cancellable child presentation, accessible cancellation modal and Refund `PENDING`. `PROOF_SUBMITTED` and `REFUNDED` are not synthesized without a valid authenticated private asset; their approved contract remains verified by Phase 5B PostgreSQL and Phase 5C component tests.
- Generated `recurring-customer-*` screenshots are review candidates only.

## Customer UI contract (Phase 5C)

- `/booking-series/:series_id` renders each occurrence from the authoritative Series Detail DTO, including child money, cancellation advice/metadata and Refund summary. The browser does not calculate eligibility or use its clock as an authorization boundary.
- `can_cancel=true` is the only condition that exposes **Hủy buổi này**. The accessible modal identifies the exact date/time/Court and read-only child deposit/refund estimate. The mutation sends `{}` to the approved child endpoint with a synchronous lock and no optimistic transition.
- Success, 409 and uncertain results perform a Series Detail read. A failed authoritative read locks further cancellation; the mutation is never retried automatically. Parent Series stays `CONFIRMED`, and sibling occurrences keep their server state.
- Refund `PENDING` makes no proof request. `PROOF_SUBMITTED` and `REFUNDED` expose proof viewing on demand and reuse the existing private signed-URL and Customer acknowledgement flow by `refund_id`.
- Strict validation fails closed on illegal cancellation/refund timestamps, mismatched child/refund IDs, refund amount different from child deposit, malformed terminal state or unexpected response fields.
- Whole-Series, future-occurrence and bulk cancellation/refund remain deferred. Recurring PaymentProof remains prohibited.

## 1. Scope

Phase 5 supports Customer cancellation of exactly one confirmed occurrence in a confirmed recurring series. The cancellation target is the child `Booking`; `BookingSeries` remains the immutable record of the initial whole-series decision.

Included: one `CONFIRMED` child at a time; its cancellation-policy snapshot and database time; one child-level `Refund` for the child deposit; release of only that child's `CourtSlotLock`; reuse of the current Refund lifecycle.

Deferred: cancel whole/future series, reschedule/move occurrence, partial creation, aggregate Series Refund, Owner occurrence cancellation, automated banking/payment gateway and realtime availability.

## 2. Current source behavior and gap

The current Customer endpoint is `POST /api/v1/bookings/:booking_id/cancel`. It requires an ACTIVE CUSTOMER session, ownership, Origin and CSRF. Its transaction locks the Customer/Owner users through the Court helper, Facility, Court, Booking, PaymentProof and Refund; it uses `clock_timestamp()` and rechecks state/ownership.

For a confirmed Booking it requires `status=CONFIRMED`, a non-null cutoff snapshot, `now < start_at - cutoff`, `PaymentProof.status=APPROVED`, and no Refund. Success changes only the Booking to `CANCELLED`, records Customer metadata, creates a `PENDING` Refund for `booking.deposit_amount`, deletes its slot locks and retains BookingSlots.

This cannot safely handle a recurring V2 child today. Recurring V2 intentionally has no PaymentProof, so cancellation returns `INCONSISTENT_PAYMENT_STATE`. The Refund service `assertInvariant` also requires an APPROVED PaymentProof, so a recurring V2 Refund would fail closed during later read/upload/confirm.

## 3. Target invariants

- Parent Series exists, belongs to the Customer and has initial status `CONFIRMED`.
- Target is an owned child of that Series, `booking_flow_version=2`, non-null `booking_series_id`, and current status `CONFIRMED`.
- Child has authoritative `confirmed_at` and `confirmed_by_user_id`; those fields plus confirmed parent decision are recurring V2 deposit evidence. Never create a synthetic PaymentProof.
- All other child states are ineligible.
- Series stays `CONFIRMED`; sibling children, snapshots and locks remain unchanged.
- Target becomes `CANCELLED`, with `cancelled_by=CUSTOMER`, DB-time `cancelled_at`, and optional trimmed reason under the current 0..500-code-point contract.
- Refund amount is exactly `child.deposit_amount`, never the Series amount, an average or current-price recalculation.
- At most one Refund exists per child; it starts `PENDING` and reuses `PENDING -> PROOF_SUBMITTED -> REFUNDED`.
- Only target child locks are deleted; BookingSlot history remains.

No `PARTIALLY_CANCELLED` Series state is added. Mixed child status/counts are derived.

## 4. Cutoff

Use one PostgreSQL `clock_timestamp()` snapshot inside the transaction.

```text
deadline = child.start_at - child.cancellation_cutoff_hours_snapshot hours
eligible iff now < deadline
```

- snapshot `null`: `CANCELLATION_POLICY_NOT_CONFIGURED`;
- cutoff `0`: eligible only while `now < start_at`;
- `now == deadline` or later: `CANCELLATION_DEADLINE_PASSED`.

No browser clock or timezone conversion decides eligibility; `start_at` is an absolute timestamp.

## 5. Recommended API

Choose explicit Option B:

```http
POST /api/v1/booking-series/:series_id/occurrences/:booking_id/cancel
Content-Type: application/json
X-CSRF-Token: ...

{}
```

The body is `{}` or `{ "reason": string }`; trim and limit reason to 500 Unicode code points. Unknown fields are invalid.

Success reuses the existing cancellation response whitelist: `data.booking` contains id/status/cancelled metadata; `data.refund` contains id/booking_id/amount/status/requested_at; `meta.server_time` is DB time.

Option B binds both IDs and proves membership explicitly, prevents accidental broadening of the legacy cancellation endpoint to unrelated V2 Bookings, and aligns with Series Detail. Implementation should extract a bounded shared cancellation primitive rather than duplicate refund/lock writes.

Option A (`POST /bookings/:id/cancel`) has fewer routes but hides parent/membership invariants and makes legacy proof-guard changes affect unrelated single Booking behavior. It is not selected.

Errors:

- missing/cross-customer/wrong membership: `404 RESOURCE_NOT_FOUND`;
- malformed IDs/body/query: current validation error;
- ineligible/already cancelled/concurrent loser: `409 INVALID_BOOKING_STATE`;
- null cutoff: `409 CANCELLATION_POLICY_NOT_CONFIGURED`;
- exact/after cutoff: `409 CANCELLATION_DEADLINE_PASSED`;
- existing Refund or inconsistent confirmation evidence: `409 INCONSISTENT_PAYMENT_STATE`.

Network/5xx is unknown result; frontend refetches Series Detail and never retries the mutation automatically. A 409 also triggers authoritative refetch.

## 6. Atomic transaction and lock order

1. Read a minimal ownership/membership hint without trusting it for mutation.
2. Lock Customer and Facility Owner User IDs, deduplicated ascending.
3. Lock Facility, then Court.
4. Lock BookingSeries.
5. Lock target child Booking.
6. Lock optional PaymentProof and child Refund rows.
7. Take one DB-time snapshot; recheck session, CUSTOMER capability, ownership, membership, confirmation evidence, state and cutoff.
8. Update only the child, create its Refund, delete only locks whose BookingSlot belongs to it.
9. Commit atomically.

This extends the established Series order `Users -> Facility -> Court -> BookingSeries -> children` and keeps dependent PaymentProof/Refund locks after Booking. No external storage call occurs.

On failure, child state/metadata, Refund absence and all locks roll back. Same-child cancel/cancel yields one success and one 409 with one Refund. Different children may serialize on Series but remain isolated. DB time resolves cutoff races. Refund uniqueness is protected by the row lock and unique `booking_id`.

## 7. Refund compatibility

The schema is sufficient. Refund is child-Booking scoped and unique by `booking_id`; Booking contains series membership, confirmation/cancellation metadata, cutoff and deposit snapshots.

Phase 5B must narrowly generalize Refund evidence:

- V1 continues to require APPROVED PaymentProof;
- recurring V2 requires flow 2, non-null Series membership, confirmed parent decision, and non-null child confirmation metadata;
- both require Booking `CANCELLED` and Refund amount equal to child `deposit_amount`.

Do not weaken V1, accept unconfirmed V2, create fake PaymentProof or introduce Series Refund. Existing private owner proof upload and Customer acknowledgement then continue by child `refund_id`, with signed URLs and no private identifier exposure.

## 8. Read DTO and UI

Series Detail must support mixed occurrence states. The frontend validator assumption that every child status equals Series status must be removed.

Recommended per-occurrence detail fields:

- existing booking ID, start/end, status and child total/deposit/remaining;
- `cancellation_deadline`: ISO instant or null;
- `can_cancel`: backend-derived boolean from the response DB-time snapshot;
- `cancellation_block_reason`: null or `INVALID_BOOKING_STATE`, `CANCELLATION_POLICY_NOT_CONFIGURED`, `CANCELLATION_DEADLINE_PASSED`;
- `cancelled_at`, `cancelled_by`, `cancellation_reason`;
- existing Refund summary or null.

Mutation always rechecks; `can_cancel` is presentation guidance, not authorization. Series list does not expand occurrences.

Customer Series Detail exposes only `Hủy buổi này`. The accessible modal names the occurrence, says siblings are unaffected, and states that its deposit enters the refund process without claiming it was received. Success/409/unknown result refetches Series Detail. Reuse embedded Refund UI via child `refund_id`; no Refund Center.

Owner Series Detail has no occurrence-cancel action in this phase. It renders mixed states, derives total/effective/cancelled/completed counts, and identifies Series/occurrence/Booking when reusing Owner Refund UI.

## 9. Availability, search and analytics

Current occupancy predicates include `CONFIRMED` and effective holds, not `CANCELLED`. After target locks are removed, Availability and one-time Guest Search expose the slot unless another Booking/CourtBlock blocks it. Recurring Search likewise treats it as free while still requiring every requested occurrence to be available. Siblings remain occupied.

Owner Analytics counts value/occupancy only for `CONFIRMED|COMPLETED`, counts `CANCELLED` separately, and subtracts only `Refund.status=REFUNDED` from known deposit. A cancelled recurring child therefore follows existing semantics without Analytics changes.

## 10. Security and performance

- ACTIVE authenticated CUSTOMER and CUSTOMER capability;
- exact Customer plus Series/child ownership; cross-customer/mismatch is 404;
- Origin + CSRF;
- no client actor, amount, state, cutoff or refund metadata;
- strict DTO whitelist; no private storage identifier;
- parameterized Prisma/raw SQL.

The mutation is bounded to one Series and one child: two user locks, Facility/Court/Series/Booking locks, optional dependent-row locks, one update, one insert, one targeted lock delete and rechecks. It must not fetch/mutate every occurrence or call Availability.

## 11. Phase 5B test plan

Unit/local: exact validation/DTO; null/zero and before/equal/after cutoff; child deposit refund; mixed occurrence validation/counts; V1 proof remains required; recurring V2 evidence accepted only when confirmed; malformed response fail-closed and unknown-result recovery.

PostgreSQL integration: successful child cancel; exact refund; only child locks released; BookingSlots preserved; Series/siblings unchanged; Availability/Guest/Recurring Search after commit; cross-customer and wrong membership 404; duplicate Refund; cancel/cancel and child-A/child-B concurrency; DB-time boundary; injected rollback; complete existing Refund proof lifecycle for the child.

Regression: Booking V1/single V2, PaymentProof/Refund V1, Series create/read/confirm/reject/expiry, Availability, Public/Guest Search, Recurring Search, Owner Series, Owner Analytics, frontend Auth/role isolation and Booking/Refund screens.

## 12. Persistence decision

`SCHEMA CHANGE REQUIRED: NO`
`MIGRATION REQUIRED: NO`

Phase 5B is a guarded service/API/DTO/frontend extension over existing child Booking and Refund persistence.

## 13. Phase 5B.1 verification closure (2026-10-18)

PostgreSQL integration proves the strict cancellation boundary with a database-returned deterministic clock: one millisecond before the computed deadline succeeds, while exact equality and one millisecond after it return `CANCELLATION_DEADLINE_PASSED` without changing the child, Refund or locks. A dedicated failure injected after the Refund insert proves transaction rollback restores the confirmed child and its metadata, creates no Refund, and preserves BookingSlots and lock identities.

The same isolated fixture verifies cancel/cancel serialization, concurrent cancellation of two different children, sibling lock isolation, exact child-deposit Refund amounts, post-commit Availability, and the complete existing Refund lifecycle `PENDING -> PROOF_SUBMITTED -> REFUNDED` with private signed delivery and no storage identifier exposure. Legacy V1 still requires an approved PaymentProof; a standalone V2 Booking with no `booking_series_id` fails closed.

Evidence: backend local **93/93**; recurring PostgreSQL **17/17**; Recurring Search **7/7**; Guest Search **5/5**; Public Facility **9/9**; Availability **6/6**; Booking V2 **14/14**; Booking V1 **19/19**; Payment/Refund **22/22**; Owner Analytics **5/5**. All fixture cleanups passed. Frontend recurring **9/9**, full sequential frontend **402/402**, lint, production build, health/public/guest/recurring smoke and diff check passed. No schema, migration, seed or demo-data mutation was performed.
