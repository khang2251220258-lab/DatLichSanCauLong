# Demo Seed Review

## Mục tiêu và trạng thái

Script `backend/scripts/seed-demo.js` chuẩn bị dữ liệu development cho luồng Home → Facility List → Facility Detail → Availability → tạo/read Booking → upload PaymentProof. Target fingerprint đã được người dùng xác nhận và seed được apply ngày 2026-10-06. Chạy lại lần hai giữ nguyên count, xác nhận idempotency.

Không tạo sẵn Booking, BookingSlot, CourtSlotLock hoặc PaymentProof. Các record đó phải phát sinh qua API/UI thật trong manual demo. Không gọi Cloudinary hoặc Resend.

## Guard trước khi ghi

Script từ chối ghi nếu thiếu bất kỳ điều kiện nào:

- `NODE_ENV=development` chính xác.
- `DEMO_SEED_CONFIRM=BOOKING_DEVELOPMENT_ONLY`.
- `DEMO_SEED_TARGET_FINGERPRINT` khớp fingerprint SHA-256 rút gọn do `--check` tạo từ host/port/database của `DATABASE_URL`; không in connection string hoặc password.
- Initial migration `20260922000000_init` đã apply.
- `DEMO_OWNER_PASSWORD`, `DEMO_CUSTOMER_PASSWORD` và `DEMO_ADMIN_PASSWORD` đạt AUTH_SPEC: 8–128 ký tự, có chữ và số.

Toàn bộ seed nằm trong một transaction, dùng advisory transaction lock để ngăn hai seed đồng thời. Email `.invalid` và tên có tiền tố Demo tách namespace khỏi dữ liệu thật. Script upsert theo email/khóa tự nhiên của chính dữ liệu demo; chạy lại không tạo bản sao.

## Models được ghi

| Model | Dữ liệu | Ràng buộc chính |
| --- | --- | --- |
| `users` | 1 Admin reviewer không dùng đăng nhập, 1 Customer có Owner capability, 1 Customer demo | email_normalized UNIQUE; role CUSTOMER/ADMIN; status ACTIVE; Argon2id |
| `owner_requests` | 1 APPROVED của demo Owner | reviewer/time bắt buộc, không rejection_reason |
| `owner_profiles` | 1 profile trỏ approved request | user_id PK, approved_request_id UNIQUE/FK |
| `facilities` | 3 ACTIVE | OwnerProfile FK; reviewer Admin; opening < closing; district thuộc registry 94 |
| `courts` | 5 ACTIVE, Facility chính có 3 | UNIQUE(facility_id,name) |
| `amenities` | 3 ACTIVE có tiền tố Demo | name UNIQUE |
| `facility_amenities` | mapping ba tiện ích vào ba Facility | composite PK |
| `price_rules` | 1 rule 06:00–22:00 mỗi Facility | aligned 30 phút, rate dương, UNIQUE range |
| `cancellation_policies` | cutoff 2 giờ mỗi Facility | facility_id UNIQUE, cutoff hợp lệ |
| `bank_accounts` | text demo mỗi Facility, QR null | facility_id UNIQUE; account ASCII; cảnh báo không chuyển tiền thật |

Không tạo `facility_images`: runtime yêu cầu Cloudinary `public_id` có asset thật. Chèn path giả sẽ tạo ảnh hỏng; upload Cloudinary không cần cho mục tiêu seed và bị loại khỏi task. Frontend dùng placeholder an toàn. Có thể review một task upload demo riêng nếu cần ảnh thật.

## Idempotency và giới hạn

Script chỉ cập nhật namespace demo do chính nó sở hữu. Nó không xóa User, Booking, proof hoặc dữ liệu không phải demo. PriceRule của ba Facility demo được replace trong cùng transaction để giữ đúng một rule không overlap; Booking snapshot cũ không bị thay đổi. Sequence có thể tăng và không được reset.

Kết quả xác minh: 3 demo users, 1 approved OwnerRequest/Profile, 3 Facility ACTIVE, 5 Court ACTIVE, 3 Amenity ACTIVE với 9 mapping, 3 PriceRule, 3 policy và 3 bank account. Public list/Home trả tổng 3; detail Facility chính trả 3 Court; Availability ngày 2026-10-07 trả 32 slot AVAILABLE với `slot_amount=40000`. Booking và PaymentProof vẫn bằng 0; không gọi Cloudinary/Resend. Không đổi schema/migration.

## Full-state dataset

Dataset full-state-v1 mở rộng seed cho visual/manual E2E: 10 Facility blueprint, 10 Customer fixture riêng và 32 Booking đủ bảy trạng thái cùng PaymentProof/Refund matrix. Xem docs/plans/DEMO_DATA_EXPANSION_PLAN.md.

Các Customer demo.state.customerNN@booking.invalid dùng password development từ biến DEMO_CUSTOMER_PASSWORD; tài liệu không lưu password. Khi chạy lại, script chỉ xóa và tái tạo booking thuộc các Customer namespace này. Booking manual của demo.customer@booking.invalid không bị xóa.

Proof fixture chỉ lưu private identifier demo-fixtures; seed không gọi Cloudinary. Vì không có binary asset trên Cloudinary, manual test signed-image delivery cần dùng upload flow thật riêng; UI phải giữ fallback/error state.

Sau mỗi lần seed, dùng npm.cmd run seed:demo:verify để lấy ID/route hiện hành. ID không được hard-code vì booking fixture được tái tạo theo DB time.
