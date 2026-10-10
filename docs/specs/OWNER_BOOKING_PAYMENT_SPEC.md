# Owner Booking and Payment Review Specification

## Implementation status — 2026-10-07

Backend và frontend phase này đã triển khai, gồm list/detail Owner, private proof URL có hạn, confirm/reject và state recovery. Regression evidence nằm ở `FEATURE_STATUS.md`; Refund/cancel/complete/notification vẫn ngoài scope.

## Phạm vi

Phase này cung cấp cho Owner đã được duyệt khả năng xem booking thuộc Facility mình sở hữu, xem PaymentProof riêng tư và Confirm hoặc Reject proof đang `SUBMITTED`. Không gồm dashboard, thống kê, notification, hoàn tiền, hủy/complete booking hay quản lý Facility mở rộng.

Visual hiện hành và lịch sử:

- `docs/ui-reference/owner-booking-list-desktop.png` là reference CURRENT/APPROVED cho `/owner/bookings`.
- `docs/ui-reference/owner-payment-review-desktop.png` là reference lịch sử đã dùng để triển khai `/owner/bookings/:booking_id`; chưa có reference detail mới đồng bộ hoàn toàn với sidebar hai mục nên không được dùng để khôi phục navigation cũ.

PNG quyết định visual; API và spec quyết định dữ liệu, quyền và hành vi. Mã `BK...`, tên, số điện thoại, notification, Facility và ảnh trong PNG chỉ là minh họa. Runtime dùng `booking.id` thật và dữ liệu API thật.

## Quyền và ownership

- Mọi endpoint yêu cầu session hợp lệ, User `ACTIVE` và capability `OWNER` từ `OwnerProfile` đã duyệt. Owner vẫn giữ capability Customer.
- Chỉ booking có `Booking.court -> Court.facility -> Facility.owner_id` bằng User hiện tại được đọc hoặc xử lý.
- ID không tồn tại và tài nguyên ngoài ownership cùng trả `404 RESOURCE_NOT_FOUND` để tránh IDOR.
- Mutation yêu cầu Origin hợp lệ và CSRF token theo contract Auth hiện tại.
- Owner User `LOCKED` bị chặn. Backend là security boundary; frontend guard chỉ phục vụ điều hướng.

## GET /api/v1/owner/bookings

- `page`: mặc định 1, integer >= 1.
- `page_size`: mặc định 20, integer 1–100.
- `status`: tùy chọn, một BookingStatus hợp lệ.
- Query khác trả `422 VALIDATION_ERROR`, không silently ignore.
- Thứ tự cố định `created_at DESC, id DESC`.

List DTO gồm `id`, `status`, `start_at`, `end_at`, `total_amount`, `deposit_amount`, `created_at`; Customer `{id, full_name, phone}`; Facility `{id, name}`; Court `{id, name}`; PaymentProof summary `{id, status}` hoặc null. Tiền là decimal string; phone có thể null. Meta gồm `server_time`, `page`, `page_size`, `total`. Không trả email, bank snapshot, storage identifier, proof URL hoặc approval metadata. Không tự tạo mã booking trình bày.

## GET /api/v1/owner/bookings/:booking_id

Detail whitelist gồm lifecycle/status/time, `total_amount`, `deposit_amount`, `remaining_amount`, Customer `{id, full_name, phone}`, Facility/Court `{id, name}`, và PaymentProof summary `{id, status, submitted_at, reviewed_at, rejection_reason}`. Không trả `image_path` hoặc proof URL tại endpoint này. Booking ngoài ownership trả 404. Detail không mutation hoặc tự chuyển trạng thái.

## GET /api/v1/owner/payments/:proof_id

Backend authorize session, capability và Facility ownership trước khi tạo URL. Proof detail trả metadata whitelist, booking/customer/facility/court/time/amount cần cho màn review và:

- `proof_image_url`: URL Cloudinary authenticated có chữ ký, thời hạn 5 phút.
- `proof_image_expires_at`: UTC ISO 8601 có `Z`, bằng server/DB time dùng cho response cộng 300 giây.
- `meta.server_time`.

Không trả `image_path`, Cloudinary public ID, API key, signature components riêng hoặc credential. URL không được log hoặc lưu browser storage; khi hết hạn frontend GET lại endpoint.

## POST /api/v1/owner/payments/:proof_id/confirm

Body không có hoặc `{}`. Trong một transaction, recheck actor/ownership, yêu cầu Booking `PENDING_CONFIRMATION` và PaymentProof `SUBMITTED`; chuyển proof thành `APPROVED`, ghi `reviewed_by`/`reviewed_at`; chuyển booking thành `CONFIRMED`, ghi `confirmed_at`; giữ BookingSlot và CourtSlotLock. Response 200 trả whitelist mới và `meta.server_time`.

## POST /api/v1/owner/payments/:proof_id/reject

Body duy nhất `{ "reason": "..." }`. Reason phải là string, trim, dài 1–500 ký tự Unicode. Thiếu/rỗng trả `422 REJECTION_REASON_REQUIRED`; sai kiểu, field thừa hoặc quá 500 trả `422 VALIDATION_ERROR`.

Trong cùng transaction/recheck như Confirm: proof -> `REJECTED` với reviewer/time/reason; booking -> `REJECTED` với `rejected_at` và cùng reason; xóa CourtSlotLock thuộc Booking; giữ BookingSlot và PaymentProof lịch sử. Không tạo Refund, không resubmit proof trên booking cũ.

## Transaction và concurrency

Lock order: User IDs tăng dần, loại trùng (Owner và Customer) -> Facility -> Court -> Booking -> PaymentProof -> slot locks khi Reject cần nhả. Read trước transaction chỉ tìm khóa; sau khóa đọc lại session, capability, ownership, quan hệ và state. Confirm/Reject đồng thời serialize trên Booking/PaymentProof; request sau nhận 409 và không ghi đè quyết định đầu. Confirm không chạm locks; Reject xóa đúng locks nối qua BookingSlot trong cùng commit.

Lỗi chính: 401 session; 403 capability/Origin/CSRF; 404 ngoài ownership; 409 `INVALID_BOOKING_STATE`/`INVALID_PROOF_STATE`; 422 validation/reason. Không lộ database/provider error.

## Frontend và responsive

- `/owner/bookings`: list, status filter, pagination và loading/error/empty riêng; dòng mở detail.
- `/owner/bookings/:booking_id`: detail + Payment Review. Chỉ proof `SUBMITTED` của booking `PENDING_CONFIRMATION` cho phép review.
- Confirm có bước xác nhận trước mutation. Reject mở modal reason 1–500; click đầu không mutation.
- Không optimistic giả state. Sau success dùng response rồi refresh backend; unknown result phải đọc lại trước retry.
- Desktop bám PNG. Tablet thu gọn navigation và layout; mobile dùng card/stack, không overflow ngang. Modal quản lý focus, Escape/Cancel và chống double submit.
- Sidebar/notification/dashboard/thống kê trong PNG ngoài scope không được giả hoạt động.

## Trạng thái implementation

Backend Phase 1 đã triển khai ngày 2026-10-06 cho đủ năm endpoint trong spec. Private URL dùng Cloudinary authenticated adapter và TTL 300 giây; automated tests dùng adapter giả, không gọi Cloudinary thật. PostgreSQL integration PASS 16/16 (gồm Payment regression và Owner review), Booking regression 15/15, Auth regression 13/13, local backend 50/50, health HTTP 200; fixture cleanup PASS.

Frontend Phase 1 đã triển khai cùng ngày cho `/owner/bookings` và `/owner/bookings/:booking_id`, gồm OWNER guard, list states/filter/pagination, private proof load/error/expiry refresh, Confirm dialog, Reject modal, double-submit guard và state recovery. Frontend 119/119, lint và build PASS. Booking #112 được giữ cho manual E2E, không mutation trong automated tests.
