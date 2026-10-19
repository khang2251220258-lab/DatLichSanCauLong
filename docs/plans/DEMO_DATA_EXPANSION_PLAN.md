# Demo Data Expansion Plan

Mở rộng dataset development có namespace riêng để review CUSTOMER, OWNER và ADMIN, không đổi schema, migration, API hay business rule.

## Thiết kế an toàn

- Chỉ chạy khi NODE_ENV=development, confirmation và target fingerprint khớp.
- Giữ ba account demo hiện hành. Thêm 10 Customer demo.state.customerNN@booking.invalid; chỉ booking của namespace này được xóa và tái tạo khi chạy lại.
- Facility được upsert theo Owner + tên Demo; configuration và quan hệ được cập nhật idempotent.
- Proof dùng private storage identifier demo-fixtures, không URL công khai và không gọi Cloudinary. Asset nhị phân thật không tồn tại nên signed URL chỉ dùng để kiểm tra contract/fallback.
- Thời gian booking tính tương đối từ DB time, căn slot local Asia/Ho_Chi_Minh.

## Dataset và kiểm chứng

- 10 Facility, 27 Court theo blueprint; 10 Customer có cả phone và null.
- 32 Booking đủ 7 trạng thái, duration 30–180 phút, PaymentProof/Refund matrix hợp lệ.
- Lock chỉ tồn tại cho PENDING_PAYMENT còn hạn, PENDING_CONFIRMATION và CONFIRMED.
- npm.cmd run seed:demo -- --check: target read-only.
- npm.cmd run seed:demo: ghi sau guard.
- npm.cmd run seed:demo:verify: report integrity và manual routes read-only.
