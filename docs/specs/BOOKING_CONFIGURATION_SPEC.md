# Booking Configuration Specification

## Owner Bank Account + QR — implemented 2026-10-09

Owner quản lý singleton BankAccount theo Facility tại `/owner/facilities/{facility_id}/bank-account`. GET trả `null` hoặc DTO whitelist gồm `bank_name`, `account_number`, `account_holder`, `has_qr_image`, `qr_image_url`, `qr_image_expires_at`; không trả ID, timestamp, `qr_image_path` hay storage identifier. URL QR private có TTL 300 giây.

POST `/owner/facilities/{facility_id}/bank-account/qr` nhận đúng một field multipart `image`, chỉ JPEG/PNG tĩnh tối đa 5.000.000 byte và 25.000.000 pixel, kiểm tra signature/decode rồi chuẩn hóa PNG. DELETE cùng path bỏ current pointer. Cả hai trả 200 với Bank DTO hiện hành. QR dùng authenticated Cloudinary adapter; network upload nằm ngoài transaction. Sau upload, transaction khóa User → Facility, recheck session/ownership/state rồi đổi pointer. Replace/delete không destroy object cũ để bảo toàn Booking snapshot; cleanup object mới chỉ chạy khi DB write lỗi và đã xác minh không có BankAccount/Booking tham chiếu. Reconciliation orphan deferred.

GET/PUT/QR mutation cho DRAFT/ACTIVE/REJECTED/SUSPENDED; PENDING mutation trả 409. Origin/CSRF áp dụng cho PUT/POST/DELETE, cross-owner 404. Frontend route `/owner/facilities/:facility_id/bank-account` dùng reference approved, refresh URL hết hạn tối đa một lần cho mỗi URL và không biết raw path.

Kiểm chứng 2026-10-09: backend local 56/56, Booking Configuration PostgreSQL 14/14, Booking PostgreSQL 17/17, Payment PostgreSQL 16/16, frontend 203/203, lint/build PASS; các fixture cleanup PASS và health 200 trong integration. Automated tests chỉ dùng storage adapter giả, không gọi Cloudinary thật.

Khi tạo Booking, bank text và QR identifier được snapshot. Customer Booking Detail sinh `qr_image_url` private và `qr_image_expires_at` TTL 300 giây từ snapshot; thay/xóa QR hiện hành không thay Booking cũ. Booking mới sau delete có snapshot QR null.

## Owner Cancellation Policy frontend — implemented 2026-10-09

Route `/owner/facilities/{facility_id}/cancellation-policy` dùng GET/PUT backend hiện hành và reference approved. GET null hiển thị “Chưa thiết lập chính sách hủy”, input rỗng, không dùng 24 hoặc giá trị khác làm default và không tự PUT khi tải trang. Input chỉ gửi integer 0..168 sau validation; `0` là policy hợp lệ. Response validator chấp nhận null hoặc exact DTO policy, PENDING chỉ đọc và PUT 409 refetch Facility + policy.

Frontend chỉ cấu hình cutoff cho Booking mới snapshot sau đó. Không triển khai Customer/Owner cancel CONFIRMED, Refund, proof hoặc lifecycle; Booking cũ không đổi. Kiểm chứng: targeted24/24, frontend236/236, backend57/57, Booking Configuration PostgreSQL14/14 + cleanup, lint/build PASS; không schema/migration/seed/Cloudinary thật.

## Implementation status — 2026-10-09

Backend PriceRule/CancellationPolicy/BankAccount đã triển khai. Frontend PriceRule, BankAccount + QR và CancellationPolicy đã triển khai. Pricing nâng cao và confirmed cancellation/refund workflow vẫn DEFERRED.

Ghi nhận lịch sử: quyết định ngày 2026-09-27 chỉ thuộc Phase 1 backend Owner và lúc đó chưa triển khai Booking/public/QR/storage/frontend. Các phase mới hơn ở đầu tài liệu thay trạng thái implementation hiện tại.

Implementation backend hoàn tất kiểm chứng ngày2026-09-28: local configuration5/5, PostgreSQL13/13 và regression PASS; cleanup và metadata/data comparison PASS cho lượt xác minh cuối. Xem FEATURE_STATUS để biết đầy đủ phạm vi và ngày chạy từng suite. Không đánh dấu QR/frontend/Booking READY.

## Quyền và trạng thái

Session → User ACTIVE → OwnerProfile → Facility → cấu hình. Thiếu phiên 401; thiếu OWNER capability (kể cả ADMIN) 403; Facility ngoài sở hữu/không tồn tại 404. Mutation có Origin/CSRF. Không nhận owner_id/facility_id từ body.

GET cho mọi Facility state. PUT cho DRAFT/ACTIVE/REJECTED/SUSPENDED; PENDING trả 409 FACILITY_STATE_NOT_EDITABLE. Cấu hình không thay Facility status hoặc approval metadata, không cần duyệt lại, không tự activate.

## API contract

Prefix `/api/v1/owner/facilities/{facility_id}`. ID là positive BigInt string theo convention hiện tại. GET không nhận query. Tất cả success HTTP 200, envelope `{data,meta:{server_time}}`. Không pagination.

| Method/path | Body | data |
| --- | --- | --- |
| GET /price-rules | Không | Toàn bộ rules hoặc [] |
| PUT /price-rules | rules:[{start_time,end_time,hourly_rate}] | Tập mới đã replace |
| GET /cancellation-policy | Không | Policy hoặc null |
| PUT /cancellation-policy | cutoff_hours | Policy upsert |
| GET /bank-account | Không | Safe BankAccount DTO hoặc null |
| PUT /bank-account | bank_name,account_number,account_holder | Safe BankAccount DTO |
| POST /bank-account/qr | multipart `image` | Safe BankAccount DTO với signed URL |
| DELETE /bank-account/qr | Không | Safe BankAccount DTO, QR null |

PriceRule DTO: id, facility_id, start_time/end_time dạng HH:mm, hourly_rate dạng decimal string, created_at, updated_at. Order start_time ASC/end_time ASC/id ASC. Policy DTO: id, facility_id, cutoff_hours, created_at, updated_at. Bank DTO theo whitelist an toàn ở phần mới phía trên và không expose raw path.

## PriceRule

PUT thay toàn bộ tập nguyên tử, tối đa 48 rule; rules:[] xóa tập hiện hành, không đổi Facility status. Chỉ top-level rules và ba field mỗi rule; tất cả field mỗi rule bắt buộc. Input hourly_rate là JSON number nguyên >0 và ≤999999999999 (DECIMAL(12,0)); không coerce string, float, NaN/Infinity. Khoảng này biểu diễn chính xác bằng JS safe integer; chuyển sang decimal string khi ghi Prisma, không tính tiền bằng số thực.

Time string HH:mm, giờ00–23, phút00/30, không seconds/timezone/timestamp/overnight; start < end. Toàn bộ khoảng phải nằm trong giờ mở/đóng hiện hành, kiểm tra dưới khóa Facility. Không day_of_week/court_id/status/priority. Không overlap, exact duplicate cũng bị từ chối; chạm biên hợp lệ. Input/giới hạn/ngoài giờ trả 422 INVALID_PRICE_RULE; overlap trả 422 PRICE_RULE_OVERLAP. Không silently truncate.

UNIQUE hiện tại giữ nguyên; khóa Facility rồi validate toàn bộ tập trước delete/insert. BookingSlot snapshot độc lập; không sửa lịch sử. Giá chung toàn bộ Court, lặp hằng ngày. Slot /2, tổng/cọc decimal rounding theo BOOKING_SPEC, không triển khai tính giá booking ở phase này.

## CancellationPolicy

PUT upsert singleton, luôn 200. Chỉ cutoff_hours JSON integer 0–168; không string/float/unknown field, lỗi 422 VALIDATION_ERROR. Không default cutoff. GET null nếu chưa cấu hình. Không DELETE.

Policy không bắt buộc khi create Booking theo thiết kế. Snapshot cutoff của booking cũ bất biến. Customer CONFIRMED chỉ hủy trước cutoff nghiêm ngặt; thiếu snapshot trả CANCELLATION_POLICY_NOT_CONFIGURED cho nhánh đó. Không đổi quy tắc cọc30%/remaining70%/refund100% cọc đã xác nhận.

## BankAccount

PUT upsert singleton, luôn 200; chỉ ba field bắt buộc. bank_name/account_holder string trim, 1–150 ký tự Unicode, giữ case/dấu; không bank code/verification ngoài. account_number string trim, 1–50 ASCII letters/digits, regex [A-Za-z0-9]+; không khoảng trắng nội bộ/ký tự đặc biệt, không UNIQUE toàn hệ thống. Lỗi 422 VALIDATION_ERROR. GET null nếu chưa cấu hình.

Không nhận qr_image_path từ client. Create không QR; update text giữ nguyên QR hiện hành. QR upload/delete và private delivery theo contract 2026-10-08 phía trên. Booking dùng bank/QR snapshot của chính booking, không đọc thay bằng config mới. Không history table/versioning hoặc DELETE BankAccount.

## Transaction và phạm vi

Owner User → Facility → configuration nếu cần. Recheck session/User ACTIVE/OwnerProfile/ownership/state sau khóa. Price validate giờ từ Facility đã khóa; delete+createMany+đọc kết quả trong một transaction. Singleton upsert dưới cùng khóa Facility, giữ UNIQUE. GET kiểm tra ownership và đọc cấu hình trong snapshot RepeatableRead. Không network/storage trong transaction.

Giới hạn lịch sử của backend Phase 1: không thay schema/migration/.env/CA/TLS, giữ FK RESTRICT và không API từng PriceRule/Admin/public config. QR và frontend đã được triển khai ở các phase mới hơn nêu trên; CourtBlock, Refund, Notification và confirmed cancellation workflow vẫn ngoài scope. Court/Facility ACTIVE chưa booking-ready nếu thiếu giá/ngân hàng; điều kiện đầy đủ theo BOOKING_SPEC.
