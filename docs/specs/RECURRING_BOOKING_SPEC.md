# Recurring Search / Booking Specification

Status: **PHASE 5C CUSTOMER OCCURRENCE CANCELLATION / REFUND UI IMPLEMENTED / VERIFIED** (2026-10-18). Schema/search Phase 2, backend Phase 3, Customer/Owner Phase 4 frontend and Phase 5B backend remain current.

## Scope

MVP biểu diễn một Court ACTIVE, một thứ trong tuần, một khoảng giờ local cố định và một khoảng ngày inclusive theo `Asia/Ho_Chi_Minh`: `weekday + start_time + end_time + start_date + end_date`. Nhiều weekday, cách tuần, exception, RRULE, nhiều Court và subscription đều deferred. UI nên dùng `start_date/end_date`; preset 1 tháng/3 tháng chỉ điền hai trường này.

## Source audit

`Booking` hiện là một khoảng liên tục trên một Court trong một ngày. Mỗi buổi giữ BookingSlot, CourtSlotLock, snapshot giá/chính sách/ngân hàng, lifecycle V1/V2, cancellation và Refund riêng. `CourtSlotLock` có PK `(court_id,start_at)`. V2 create khóa User IDs tăng dần → Facility → Court → Booking liên quan → slot locks trong một transaction.

Schema chưa có series identity, recurrence rule, deadline/reference/tổng tiền cấp series hoặc quan hệ gom nhóm. Recurring workflow bền vững vì vậy cần schema additive.

## Recurrence expansion

- Date là local calendar date, hai biên inclusive; weekday ISO Monday=1…Sunday=7.
- Time là `HH:mm` tại `:00/:30`; start < end; 1–6 slot, tối đa 3 giờ.
- Phải sinh ít nhất một occurrence; occurrence đầu phải bắt đầu sau DB-time snapshot.
- Khoảng inclusive tối đa 93 calendar days (`end_date - start_date <= 92`) và tối đa 14 occurrences.

```text
validate dates, weekday, half-hour times and limits
first = first date >= start_date matching weekday
for date = first; date <= end_date; date += 7 local calendar days:
  convert local(date,start_time/end_time) to UTC and append occurrence
reject empty/over-limit/past-first-occurrence
```

Luôn dùng timezone có tên; không dùng timezone máy khách.

## Availability

Đề xuất **strict all-occurrences**: Court chỉ match khi mọi slot của mọi occurrence đều AVAILABLE theo semantics Availability/V2 hiện hành. Một conflict, CourtBlock, PriceRule thiếu/mơ hồ, resource inactive hoặc effective V1/V2 hold loại Court khỏi kết quả. Partial mode deferred vì kéo theo exception selection, partial total, confirmation và refund phức tạp.

Search hoàn toàn read-only, không tạo/expire Booking hoặc lock.

## Data model recommendation

Chọn **Option B: BookingSeries + existing Booking children**.

### Conceptual BookingSeries

- `id` BIGINT PK.
- `customer_id` FK User RESTRICT; `court_id` FK Court RESTRICT.
- `weekday` SMALLINT CHECK 1..7.
- `start_time/end_time` TIME với CHECK half-hour và start < end.
- `starts_on/ends_on` DATE với CHECK ordering.
- `occurrence_count` SMALLINT CHECK 1..approved max.
- Initial decision status: `PENDING_CONFIRMATION | CONFIRMED | REJECTED | EXPIRED`.
- Shared `confirmation_expires_at`.
- Aggregate total/deposit/remaining snapshots.
- Facility/Court và bank/QR snapshots cho một transfer instruction.
- confirmed/rejected metadata; created/updated timestamps.

Sau initial confirmation, mixed occurrence states được derive từ child Bookings; không thêm PARTIALLY_CANCELLED/COMPLETED chỉ để trình bày.

### Additive Booking relation

- Nullable `booking_series_id` FK RESTRICT; V1/V2 hiện hữu giữ null.
- Không lưu `series_occurrence_index`: `start_at` là thứ tự authoritative, ổn định và duy nhất trong một series.
- UNIQUE `(booking_series_id,start_at)` vừa bảo vệ membership vừa phục vụ grouped reads; PostgreSQL vẫn cho phép mọi Booking cũ có `booking_series_id = NULL`.

Mỗi child vẫn là Booking V2 bình thường với snapshot, BookingSlot và CourtSlotLock riêng. Option A (các Booking không quan hệ) làm mất grouping/audit/confirmation. Option C (một Booking nhiều ngày rời rạc) phá giả định continuous range, cancellation, Refund và analytics hiện hành.

## Create, locks and atomicity

Đề xuất strict all-or-nothing. Một transaction:

1. Lock Customer/Owner User IDs deduplicated tăng dần.
2. Lock Facility → Court.
3. Lock overlapping/effective Booking rows theo ID tăng dần.
4. Recheck DB time, session/capability, states, CourtBlock, pricing, bank và mọi occurrence; expire stale holds theo rule hiện hành.
5. Create Series; create child Bookings theo thời gian; create BookingSlots và CourtSlotLocks theo `(start_at,court_id)`.

Bất kỳ conflict/write failure nào rollback toàn bộ. CourtSlotLock PK vẫn là concurrency barrier cuối; unique conflict map thành `SLOT_UNAVAILABLE`. Không external call trong transaction.

## Confirmation and expiry

Đề xuất chờ duyệt:

- Một shared deadline = DB time + 30 phút hiện hành.
- Mọi child tạo ở PENDING_CONFIRMATION cùng deadline và giữ toàn bộ slots.
- Owner confirm/reject toàn series bằng một action; transaction khóa Series rồi child IDs tăng dần.
- Confirm nghĩa là đã kiểm tra aggregate deposit: Series/children CONFIRMED, giữ locks.
- Reject yêu cầu một reason: Series/children REJECTED, nhả mọi locks, giữ BookingSlot history.
- Lazy expiry đổi Series/children pending thành EXPIRED và nhả locks atomically.

Per-occurrence confirmation deferred vì mâu thuẫn với một aggregate transfer.

## Price and payment

Mỗi occurrence tính giá độc lập bằng PriceRule hiện hành và giữ child snapshots; series total là tổng child totals, không nhân giá một tuần.

Đề xuất chờ duyệt: áp rounding 30% hiện hành cho từng child rồi cộng các child deposits thành một số tiền chuyển khoản. Series remaining là tổng child remaining. Cách này giữ invariant cho Refund theo Booking hiện hành.

Đề xuất một reference cấp series `CLDNS <SERIES_ID>`; single V2 vẫn `CLDN <BOOKING_ID>`. Series và child giữ bank/QR snapshots; recurring V2 không dùng PaymentProof.

## Cancellation and Refund

MVP chỉ hủy một confirmed future child bằng rule/cutoff hiện hành. Child hủy chỉ nhả locks của nó, giữ slots và tạo tối đa một Refund bằng child deposit. Bulk future/whole-series cancellation vẫn deferred. Initial Series status giữ `CONFIRMED`; UI derive occurrence counts. Contract và verification Phase 5B/5C nằm tại `RECURRING_CANCELLATION_REFUND_SPEC.md`; backend và Customer occurrence cancellation/Refund UI đã hoàn tất.

Tái sử dụng `Refund UNIQUE(booking_id)` và `PENDING → PROOF_SUBMITTED → REFUNDED`; không thêm series Refund.

## APIs

### Public search

`GET /api/v1/facilities/recurring-search?district=&weekday=1&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&start_time=HH:mm&end_time=HH:mm&q=&page=1&page_size=20`

**Implemented in Phase 2.** `weekday` dùng ISO 8601: Monday=1 … Sunday=7. Năm trường recurrence là bắt buộc; `q`/`district` optional; pagination theo Facility, order Facility/Court ID ASC. Response giữ Facility card whitelist, thêm `matching_courts`; `meta.occurrence_count` là số buổi đã expand. Query là một PostgreSQL statement set-based, dùng DB clock và không ghi dữ liệu.

Recurrence fields bắt buộc; q/district optional theo semantics hiện hành. DTO giữ public Facility card whitelist, thêm `matching_courts:[{id,name}]` và `occurrence_count`. Strict mode không cần `available_count`; không trả quote/locks/bank/customer.

Endpoint riêng rõ validation/DTO/query khác one-date search hơn việc mở rộng `/facilities`.

### Create

`POST /api/v1/bookings/recurring`

```json
{"court_id":"10","weekday":2,"start_date":"2026-11-01","end_date":"2027-01-31","start_time":"18:00","end_time":"20:00"}
```

Yêu cầu ACTIVE session, CUSTOMER capability, Origin/CSRF. Client không gửi actor, Facility, occurrence list, status, amount, snapshots, deadline hoặc reference. Response 201 whitelist Series/rule/status/deadline, aggregate amounts, bank/QR display, transfer reference và ordered child summaries; IDs là string, có `meta.server_time`.

Implemented reads/actions:

- Customer `GET /api/v1/booking-series` và `/:id`.
- Owner `GET /api/v1/owner/booking-series` và `/:id`.
- Owner `POST /api/v1/owner/booking-series/:id/confirm|reject`.

Reject body là `{ "rejection_reason": "..." }`, trim và bắt buộc 1–500 Unicode characters. Create/Owner mutations không tự retry khi kết quả mạng không rõ; client đọc lại Series Detail. List dùng aggregate set-based query, không query children theo từng Series. Detail/action khóa User IDs tăng dần → Facility → Court → BookingSeries → child Booking IDs tăng dần; create khóa User IDs → Facility → Court → các BookingSeries có thể xung đột → overlapping Booking IDs trước khi recheck và ghi atomically.

Cross-owner/customer trả 404; mutation giữ Origin/CSRF, synchronous lock và unknown-result authoritative recovery.

## Errors

Reuse `SLOT_UNAVAILABLE`, `FACILITY_UNAVAILABLE`, `COURT_UNAVAILABLE`, `PRICE_NOT_CONFIGURED`, `BANK_ACCOUNT_NOT_CONFIGURED`, `BOOKING_AMOUNT_TOO_LARGE`, `BOOKING_EXPIRED` và auth errors.

Chỉ thêm:

- `INVALID_RECURRENCE` 422: recurrence malformed/reversed/no occurrence.
- `RECURRENCE_TOO_LONG` 422: vượt limit đã duyệt.
- `INVALID_SERIES_STATE` 409: transition series sai.

Một occurrence conflict trả `SLOT_UNAVAILABLE`, không lộ booking/customer khác.

## Query/performance

Search target một parameterized PostgreSQL statement/một DB round trip: `generate_series` local dates → requested slots → public Court candidates → anti-join CourtBlock/effective V1/V2 Booking → verify exactly one PriceRule per slot → group matching Courts → paginate Facilities → aggregate DTO. Không fan-out Availability theo Court/date.

Logical work xấp xỉ Courts × occurrences × slots nhưng được chặn bởi limits. Create dùng nhiều statement trong một transaction để lock/recheck/snapshot đúng; không hy sinh correctness để giảm round trip.

Current indexes: Facility `(status,district)`; Court `(facility_id,status)`; Booking `(court_id,start_at,end_at)`, `(status,expires_at)`, `(status,start_at)`; CourtBlock `(court_id,start_at,end_at)`; PriceRule `(facility_id,start_time)` và unique range; BookingSlot `(booking_id,end_at)` và unique `(booking_id,start_at)`; CourtSlotLock PK `(court_id,start_at)`.

Không approve index mới trong audit. Series grouping index đi cùng relation mới; conflict/search index khác chỉ là candidate sau representative `EXPLAIN (ANALYZE,BUFFERS)`.

## Phase 4 frontend contract

- `/facilities?mode=recurring...` giữ `district`, ISO `weekday`, inclusive dates, half-hour times và pagination trong URL. Chưa đủ năm recurrence fields thì UI ở idle state và không gọi recurring search.
- Chọn một matching Court tạo destination `/facilities/:facility_id/recurring-confirm?...`. Guest đi qua Login/Register bằng router state; return path chỉ được dùng khi session mới có CUSTOMER capability. Không dùng localStorage/sessionStorage.
- Confirmation đọc public Facility để hiển thị tên Court, nhưng POST chỉ gửi sáu field approved. Mutation có synchronous lock, không retry; kết quả không rõ chuyển về Customer Series list để đọc authoritative state.
- Customer `/booking-series` và `/:series_id`; Owner `/owner/booking-series` và `/:series_id`. List dùng đúng một list GET, không gọi detail theo row. Owner quick actions dùng AccessibleModal; reject trim 1–500; success/409/unknown đều đọc lại authoritative state.
- Payment instruction chỉ dùng aggregate snapshots, signed QR và `CLDNS <SERIES_ID>`. Countdown dùng `meta.server_time + confirmation_expires_at`; khi bằng 0 chỉ refetch detail. Không render/call PaymentProof.
- Protected snapshots tiếp tục key theo User identity + capabilities + exact API path; signed QR chỉ nằm trong short-lived detail response/cache policy hiện hành.

## UI direction and references

Customer/Owner list group theo Series, hiển thị weekday/time/range và drill down ordered occurrences. Individual Booking detail tiếp tục dùng cho cancellation/refund history. Phase 4 dùng design system/source hiện hành; ba Playwright screenshots chỉ là review candidates và chưa phải approved reference.

## Compatibility and security

Schema additive; existing V1/V2 rows/IDs remain unchanged. Single Booking, PaymentProof/Refund history, Availability và one-date Guest Search tiếp tục hoạt động. Server tự expand recurrence/tính giá/snapshot/deadline/state; strict DTO không lộ storage identifier, locks hoặc dữ liệu Customer khác.

## Future test matrix

Expansion qua month/quarter/year/leap; inclusive boundaries; no occurrence/limits/timezone; strict match; one conflict; CourtBlock; effective/stale V1/V2 holds; pricing; inactive states; one-query budget; concurrent creates; deterministic locks; atomic rollback; deadline equality; confirm/reject/expire races; aggregate/child money; occurrence cancellation/refund; ownership/CSRF; malformed DTO; V1/V2 regression.

## Approved decisions

1. Inclusive range tối đa 93 calendar days và 14 occurrences.
2. Strict all-occurrences search; recurring create tương lai atomic all-or-nothing.
3. Một Owner confirm/reject cấp series, shared 30-minute deadline, một transfer bằng tổng authoritative child deposits, reference `CLDNS <SERIES_ID>`.
4. MVP chỉ cancel từng occurrence; cancel future/whole series deferred; Refund tiếp tục per child Booking.

Phase 3 không triển khai frontend, PaymentProof cho recurring/V2, recurring cancellation/refund mutation, cancel-future hoặc cancel-whole-series. Cancellation/refund tiếp tục là occurrence-level ở phase sau.
