# Court Core Specification

## Implementation status — 2026-10-07

Owner Court create/list/detail/update và frontend đã triển khai. Delete, chuyển Facility và CourtBlock CRUD vẫn DEFERRED; Availability chỉ đọc được đặc tả riêng.

Cấu hình bảng giá/policy/ngân hàng thuộc Facility, triển khai ở phase riêng theo [BOOKING_CONFIGURATION_SPEC.md](BOOKING_CONFIGURATION_SPEC.md). Không tạo cấu hình riêng Court; Court Core không kiểm tra booking-readiness hoặc thay snapshot giao dịch.

Quyết định được duyệt ngày 2026-09-26. Court Core Phase 1 chỉ gồm backend Owner create/list/detail/update; trạng thái kiểm chứng tại FEATURE_STATUS.

## Model và ownership

Giữ schema hiện tại: id, facility_id, name, description, status, created_at, updated_at. Court thuộc đúng một Facility, không owner_id riêng. Session → User ACTIVE → OwnerProfile → Facility → Court; Owner chỉ truy cập cơ sở của mình. CUSTOMER không có OWNER và ADMIN không có OWNER trả 403; ngoài sở hữu hoặc không tồn tại trả 404. Phiên không hợp lệ trả 401. Mutation kiểm tra Origin/CSRF theo AUTH_SPEC.

## Ma trận Facility

| Facility | Create | Edit | List/detail |
| --- | --- | --- | --- |
| DRAFT | Có | Có | Có |
| PENDING | Không | Không | Có |
| ACTIVE | Có | Có | Có |
| REJECTED | Có | Có | Có |
| SUSPENDED | Có | Có | Có |

PENDING trả HTTP 409 FACILITY_STATE_NOT_EDITABLE. Thêm/sửa Court không thay Facility status hoặc approval metadata, không cần Admin duyệt lại. Đây là cấu hình Court; không thay quy tắc sửa Facility core chỉ DRAFT/REJECTED.

## Validation và cập nhật

- Create chỉ nhận name, description?; status luôn ACTIVE do backend đặt, không dựa DB default.
- Name: string, trim rồi Unicode NFC, 1–100 ký tự Unicode sau chuẩn hóa. UNIQUE(facility_id,name) giữ nguyên; không case-insensitive uniqueness. Chỉ vi phạm đúng constraint tên Court được map 409 COURT_NAME_EXISTS. Cùng tên ở cơ sở khác hợp lệ.
- Description: string plain text, trim, tối đa 2000 ký tự; không xử lý HTML riêng. Create bỏ qua hoặc chuỗi rỗng/whitespace → NULL. PATCH bỏ qua → giữ nguyên; rỗng/whitespace → NULL. null hoặc non-string → 422.
- PATCH chỉ nhận name?, description?, status?; body rỗng hoặc unknown field → 422 VALIDATION_ERROR. Không nhận facility_id, owner_id, id, timestamps. Không chuyển Court giữa Facility.
- Status chỉ ACTIVE/INACTIVE; cho đổi hai chiều khi parent cho phép. INACTIVE không xóa/hủy booking, slot lock hoặc block, không đổi Facility.
- Đổi tên dù có Booking được phép; không sửa court_name_snapshot lịch sử.
- ID dương theo convention BigInt hiện tại. Không thêm field/constraint/migration.

## API

Prefix /api/v1; tất cả endpoint dưới đây cần OWNER capability.

| Method | Path | Request | Success |
| --- | --- | --- | --- |
| POST | /owner/facilities/{facility_id}/courts | name, description? | 201 Court ACTIVE |
| GET | /owner/facilities/{facility_id}/courts | page?, page_size?, status? | 200 danh sách + meta |
| GET | /owner/courts/{court_id} | Không | 200 Court |
| PATCH | /owner/courts/{court_id} | name?, description?, status? | 200 Court |

Court response chỉ id, facility_id, name, description, status, created_at, updated_at; ID là string, timestamp ISO. Không aggregate Booking/PriceRule/CourtBlock. Envelope theo API_SPEC.

List mặc định page=1/page_size=20, max100; status ACTIVE/INACTIVE. Order created_at DESC, id DESC. meta gồm server_time/page/page_size/total. Unknown query hoặc pagination/status sai → 422. Không list toàn bộ Court của Owner.

## Transaction và concurrency

Mutation khóa Owner User → Facility → Court (create chưa có Court để khóa). Đọc lại session/User ACTIVE/OwnerProfile, ownership và Facility state sau khóa. Tuân thứ tự chung của ARCHITECTURE; không khóa Court trước Facility. UNIQUE database bảo vệ duplicate cuối cùng. Không optimistic version field. PATCH chỉ ghi các field gửi lên; không ghi lại toàn bộ bản snapshot cũ.

## Phạm vi hoãn

Không DELETE Court, không soft-delete field; giữ RESTRICT. CourtBlock, schedule, PriceRule, policy, ngân hàng, public Court, availability, Booking, Admin Court management, notification và frontend chưa thuộc phase này. Court tồn tại chưa đồng nghĩa booking-ready; xem BOOKING_SPEC. PENDING_CONFIRMATION vẫn giữ slot, không tự expire và không được hiển thị AVAILABLE.

## Availability consumer — specification

Contract riêng tại [AVAILABILITY_SPEC.md](AVAILABILITY_SPEC.md): Court ACTIVE + Facility ACTIVE + Owner User ACTIVE mới đọc public, còn lại404. Không thay Court Core mutation. PENDING_CONFIRMATION hiển thị HELD, không expiry; GET không tạo lock hoặc cập nhật state. Reader Phase 1 đã triển khai; không thay Court Core.
