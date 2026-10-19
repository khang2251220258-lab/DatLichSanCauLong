# Demo Dataset Full State v1

Seed có ghi dữ liệu: từ `backend/` chạy `npm.cmd run seed:demo`. Kiểm tra read-only: `npm.cmd run seed:demo:verify`.

Hai command đi qua CLI guard bắt buộc đúng một mode. Không nối `--verify` vào command seed ghi dữ liệu; command `seed:demo:verify` là entrypoint authoritative cho verification. CLI từ chối mode thiếu, mode lạ hoặc đồng thời `--write --verify` trước khi chạy bất kỳ stage nào.

Guard bắt buộc: NODE_ENV development, confirmation và fingerprint target. Password chỉ lấy từ environment; không ghi trong tài liệu. Dataset quản lý 10 Customer demo.state.customer01..10@booking.invalid. Chạy lại sẽ tái tạo booking của namespace này, giữ booking manual của demo.customer@booking.invalid.

## Owner manual test matrix

Đăng nhập demo.owner@booking.invalid.

- PENDING_PAYMENT: 1087 — /owner/bookings/1087
- PENDING_CONFIRMATION + SUBMITTED: 1091 — /owner/bookings/1091
- CONFIRMED + APPROVED: 1096 — /owner/bookings/1096
- COMPLETED: 1102 — /owner/bookings/1102
- REJECTED reason ngắn: 1105 — /owner/bookings/1105
- REJECTED reason dài: 1106 — /owner/bookings/1106
- EXPIRED: 1109 — /owner/bookings/1109
- CANCELLED không Refund: 1112 — /owner/bookings/1112
- CANCELLED + Refund PENDING: 1113 — /owner/bookings/1113
- CANCELLED + Refund PROOF_SUBMITTED: 1114 — /owner/bookings/1114
- CANCELLED + REFUNDED: 1115 — /owner/bookings/1115

## Customer manual test matrix

Các account dùng password từ DEMO_CUSTOMER_PASSWORD.

- customer01: PENDING_PAYMENT 1087, CONFIRMED 1097
- customer05: PENDING_CONFIRMATION 1091
- customer10: CONFIRMED 1096
- customer06: CANCELLED không Refund 1112
- customer07: CANCELLED + Refund PENDING 1113
- customer08: CANCELLED + Refund PROOF_SUBMITTED 1114
- customer09: CANCELLED + REFUNDED 1115

Route Customer: /bookings/<id>. PENDING_PAYMENT giữ đúng 5 phút; rerun seed ngay trước khi review state/countdown này.

## Facility manual test matrix

- 508: 3 Court, không Amenity
- 509: 1 Court, 1 Amenity
- 510: 2 Court, 2 Amenity
- 511: 4 Court, tên/địa chỉ dài, 3 Amenity
- 512: 5 Court (1 INACTIVE)
- 514: DRAFT
- 515: PENDING
- 516: REJECTED
- 517: SUSPENDED

## Private demo proof assets

PaymentProof và Refund proof dùng binary PNG tổng hợp trong Cloudinary `authenticated`, cùng private storage adapter và signed URL TTL 300 giây của application. Ảnh ghi rõ `DEMO`, `PAYMENT PROOF` hoặc `REFUND PROOF`, `NOT A REAL TRANSACTION`; không chứa tên người thật, tài khoản, QR hay dữ liệu giao dịch thật. Database chỉ lưu managed identifier `demo-fixtures/payment-proofs/...` hoặc `demo-fixtures/refund-proofs/...`, MIME và kích thước byte thật; API không trả identifier này.

Từ `backend/`:

- `npm.cmd run seed:demo:proofs`: tạo object còn thiếu, đồng bộ metadata và dọn object thừa chỉ trong hai namespace demo được quản lý.
- `npm.cmd run seed:demo:proofs:verify`: read-only verification cho coverage và signed delivery của mọi proof demo.
- `npm.cmd run seed:demo:proofs:runtime`: đăng nhập Demo Owner trong process, đọc các API private đại diện, tải signed image thật, kiểm tra anonymous rejection rồi logout/xóa session kiểm chứng.
- `npm.cmd run seed:demo`: base dataset → Facility images → private Payment/Refund proofs.

Stage proof là deterministic và idempotent: identity dựa trên stable booking seed key trong path, không dựa vào Booking ID. Rerun không duplicate object/PaymentProof/Refund; stale object chỉ được xóa trong namespace demo do script quản lý. `PENDING` Refund hợp lệ không có proof. `PROOF_SUBMITTED` và `REFUNDED` giữ binary proof/history thật.

Booking ID không phải stable identity và thay đổi sau mỗi managed reseed có chủ đích. Manual review luôn phải chạy `npm.cmd run seed:demo:verify` và dùng `owner_matrix`/`customer_matrix` hiện hành thay vì tin ID đã ghi trong tài liệu này. Matrix trên là snapshot reconciliation ngày 2026-10-13.

Booking `1119` là record Full Booking Lifecycle E2E độc lập, không thuộc namespace booking mà managed seed tái tạo. Reconciliation ngày 2026-10-13 xác nhận record vẫn tồn tại ở `CANCELLED`, PaymentProof `APPROVED`, Refund `REFUNDED`, có 2 BookingSlot và 0 CourtSlotLock.

## Facility image dataset

Image seed quản lý 14 Facility thuộc đúng `demo.owner@booking.invalid`: 10 Facility full-state và 4 Facility demo runtime legacy vẫn xuất hiện trước theo thứ tự public `id ASC`. Tổng cộng có 30 public Cloudinary images thuộc quality set `demo-gallery-v2`. Cover là ảnh sân indoor rõ ràng ở `sort_order = 0`; gallery có 1–4 ảnh tùy Facility. Facility E2E/test không thuộc registry tên đã duyệt và không được gắn ảnh. Nguồn và license tại `docs/DEMO_IMAGE_SOURCES.md`.

Identity của image seed là owner email + exact Facility name, không phải ID sequence. Vì vậy việc chạy lại base seed theo cơ chế upsert hiện hành rồi chạy image seed vẫn tìm đúng Facility; rerun image seed không tạo duplicate.

Court không hỗ trợ image trong schema/API hiện hành. Không suy diễn Facility gallery thành Court image.

Image seed chạy trong `npm.cmd run seed:demo` và được kiểm tra bằng `npm.cmd run seed:demo:verify`. Rerun không tạo duplicate media record.
