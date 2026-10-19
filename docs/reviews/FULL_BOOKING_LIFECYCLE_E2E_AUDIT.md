# Full Booking Lifecycle E2E Audit

## Scope

Ngày 2026-10-13, môi trường Supabase development có fingerprint `70d7a1b8f31f0e92` đã được kiểm tra bằng **ONE BOOKING END-TO-END LIFECYCLE**. Đây không phải kết quả ghép từ state-fixture matrix.

Runner: `npm.cmd run audit:booking-lifecycle:e2e` trong `backend/`. Runner chỉ dùng production HTTP endpoints cho state transitions; Prisma chỉ được dùng để chọn fixture và đọc invariant. Guard yêu cầu `NODE_ENV=development`, đúng fingerprint và các biến demo/Cloudinary đã cấu hình.

## Record được kiểm tra

- Booking: `1119`
- Customer: `demo.customer@booking.invalid` (`id=299`)
- Owner: `demo.owner@booking.invalid` (`id=298`)
- Facility: `Demo Cầu Lông Sông Hàn` (`id=299`)
- Court: `Sân 1` (`id=167`)
- Hai slot liên tiếp: `2026-10-19T23:00:00.000Z` đến `2026-10-20T00:00:00.000Z`
- Tổng tiền / cọc / còn lại: `80.000 / 24.000 / 56.000`

Booking terminal được giữ lại để manual review vì PaymentProof và Refund proof là lịch sử immutable của workflow; không xóa asset hoặc record sau audit.

## Trace thực tế

```text
Booking:      PENDING_PAYMENT -> PENDING_CONFIRMATION -> CONFIRMED -> CANCELLED
PaymentProof: null -> SUBMITTED -> APPROVED
Refund:       null -> PENDING -> PROOF_SUBMITTED -> REFUNDED
```

Customer discovery dùng Public Facility Detail và Availability thật. Booking được tạo qua `POST /bookings`; payment proof và refund proof là PNG hợp lệ, được upload qua Cloudinary authenticated/private storage. Owner đọc signed PaymentProof URL, confirm payment; Customer refetch CONFIRMED, cancel trong cutoff, rồi đọc signed Refund proof URL và confirm đã nhận tiền.

## Invariant cuối

- Booking `CANCELLED`, `cancelled_by=CUSTOMER`, reason đã trim đúng input.
- Đúng một PaymentProof `APPROVED` và một Refund `REFUNDED`.
- Hai BookingSlot vẫn tồn tại; CourtSlotLock của booking bằng `0`.
- Refund amount bằng deposit; deposit theo 30%, remaining theo 70%.
- Payment/Refund proof DTO không lộ `image_path`, `proof_image_path` hay storage identifier.
- Signed URL tải được ảnh thật; TTL đúng 300 giây.
- Các mutation terminal lặp lại đều bị từ chối `409`: confirm refund, confirm/reject payment, cancel booking và upload refund proof lần hai.
- Request thiếu CSRF và sai Origin bị từ chối `403`; Customer khác đọc booking/proof bị `404`.

Development database chỉ có một Owner ACTIVE, nên không thể tạo một live cross-owner session thứ hai mà không mở rộng dataset. Cross-owner `404`, ownership, capability, Origin/CSRF và race vẫn được kiểm chứng bằng Payment PostgreSQL integration 22/22; không tạo Owner/Facility phụ chỉ để audit.

## Regression evidence

- Backend local: `npm.cmd test` — 62/62 PASS.
- Booking PostgreSQL: `node --test test/booking.integration.js` — 19/19 PASS, fixture cleanup PASS.
- Payment/Refund PostgreSQL: `npm.cmd run test:payment:db` — 22/22 PASS, fixture cleanup PASS.
- Frontend: `npm.cmd test` — 331/331 PASS.
- Frontend lint: `npm.cmd run lint` — PASS.
- Frontend production build: `npm.cmd run build` — PASS.

Automated PostgreSQL tests dùng fake storage theo policy. Chỉ runner E2E được phép trong task này mới gọi Cloudinary thật cho hai private proof assets gắn với Booking `1119`.

## Lưu ý vận hành

Lần chạy đầu dừng sau HTTP 201 upload payment proof vì runner ban đầu kiểm tra sai shape response (`data.status` thay vì `data.proof.status`/`data.booking.status`). Backend transition đã thành công và DB ở trạng thái nhất quán. Runner được sửa, resume chính Booking `1119`, không tạo booking thứ hai, rồi hoàn tất trace. Không có application/business bug và không chỉnh DB thủ công.
