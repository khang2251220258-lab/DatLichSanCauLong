# Facility Specification

## Implementation status — 2026-10-07

Owner core Facility, submit/resubmit, Admin approve/reject/suspend/activate và frontend tương ứng đã triển khai. Presentation backend và Owner UI quản lý image/amenity đã hoàn tất; Admin Amenity frontend còn deferred; Public Facility được đặc tả riêng.

Booking Configuration ở phase riêng theo [BOOKING_CONFIGURATION_SPEC.md](BOOKING_CONFIGURATION_SPEC.md): GET mọi state; PUT price/policy/bank chỉ chặn PENDING, không sửa Facility status/approval metadata, không cần duyệt lại. Checklist Facility core vẫn không bắt buộc module con; thay giờ Facility có thể làm bảng giá cần được Owner cấu hình lại, không tự sửa giá hoặc triển khai booking-readiness trong phase này.

Court Core thuộc phase riêng theo [COURT_SPEC.md](COURT_SPEC.md): cho tạo/sửa ở DRAFT/ACTIVE/REJECTED/SUSPENDED, chặn PENDING; mọi trạng thái đều xem được. Không áp ma trận sửa Facility core sang Court. Thêm/sửa Court không thay Facility approval metadata/status, không cần duyệt lại, không thêm điều kiện Court/giá/ngân hàng vào submit/approve/activate Facility core.

## Facility Core Phase 1 — quyết định 2026-09-25

Phase này chỉ Owner create/list/detail/PATCH/submit và Admin list/detail/approve/reject/suspend/activate. Không public API, Court, ảnh, amenity, price/policy/bank, notification hoặc frontend. ACTIVE nghĩa Admin đã duyệt, không đồng nghĩa booking-ready; không yêu cầu module con tại create/submit/approve/activate.

Create nhận name/address/district/phone/opening_time/closing_time và description tùy chọn; PATCH chỉ nhận tập field này, ít nhất một field. Không nhận tọa độ, owner_id, status, ID, timestamps hoặc metadata hệ thống. name/address trim dài 1–200/1–500; district trim thuộc registry được duyệt. Phone trim 1–30, kiểm tra cơ bản chỉ chữ số ASCII với dấu + đầu chuỗi, khoảng trắng, dấu chấm/gạch nối/ngoặc, phải có ít nhất một chữ số; không tự lấy users.phone. Description plain text trim tối đa 2000 ký tự: bỏ qua lúc create hoặc chuỗi rỗng lưu NULL, bỏ qua khi PATCH giữ nguyên, null từ client bị từ chối vì contract yêu cầu string. Không render HTML. Độ dài tính theo Unicode code point.

Giờ HH:mm từ 00:00 tới 23:30, phút 00/30, closing > opening; không qua đêm. PATCH một đầu giờ phải kiểm tra cặp giờ sau khi merge với dữ liệu dưới khóa. Latitude/longitude giữ nullable, không nhận ở Phase 1.

Registry district đã được chốt: 94 đơn vị hành chính cấp xã của TP Đà Nẵng (23 phường, 70 xã, 1 đặc khu), theo Nghị quyết 1659/NQ-UBTVQH15 ngày 16/06/2025. `district` là tên field legacy trong API/schema, biểu diễn phường/xã/đặc khu, không biểu diễn quận/huyện. UI sau này dùng nhãn Khu vực hoặc Phường/Xã. Registry dùng Object.freeze, dữ liệu UTF-8/NFC, không duplicate, không truy vấn database hoặc gọi API ngoài runtime. Giá trị chuẩn gồm tiền tố viết hoa: Phường Hải Châu, Xã Hòa Vang, Đặc khu Hoàng Sa. Sau trim so sánh chính xác với tên trong registry; không tự đổi hoa/thường, không alias tên cũ. District không tồn tại trả 422 INVALID_DISTRICT. Admin vẫn kiểm tra tính hợp lý địa chỉ, không geocoding hoặc kiểm tra address chứa Đà Nẵng. Nếu cấu hình bị rỗng, giữ bảo vệ 503 DISTRICT_NOT_CONFIGURED.

Owner chỉ sửa DRAFT (giữ DRAFT) hoặc REJECTED (về DRAFT); PENDING/ACTIVE/SUSPENDED trả 409 FACILITY_EDIT_NOT_ALLOWED. Khi sửa REJECTED, giữ cùng Facility/id và dữ liệu liên quan, xóa metadata quyết định hiện hành submitted_at/reviewed_by/reviewed_at/rejection_reason. Schema không có lịch sử từng lần duyệt; không tuyên bố có audit trail hoặc tạo bảng mới. Submit chỉ DRAFT → PENDING, ghi DB time, clear metadata review/rejection cũ. Approve chỉ PENDING → ACTIVE, reviewer/time theo Admin/DB, rejection_reason NULL. Reject chỉ PENDING → REJECTED, lưu reason/reviewer/time. Suspend chỉ ACTIVE → SUSPENDED, lưu suspended_at/reason. Activate chỉ SUSPENDED → ACTIVE, clear suspended_at/suspension_reason; giữ metadata lần approve. reason trim 1–500. Body submit/approve/activate rỗng hoặc {}.

Submit/approve/activate kiểm tra OwnerProfile và User CUSTOMER ACTIVE cùng core hợp lệ; thiếu/quyền không hợp lệ bị từ chối. Khóa Facility trước đọc lại state; để ổn định owner status khi ghi, khóa Owner User trước Facility, tương thích User → OwnerRequest và Facility → Court của các flow hiện có. Không chuyển owner, không xóa Facility, không tạo module con hoặc notification. Delete tiếp tục TODO.

List page mặc định 1 >=1, page_size mặc định 20 trong 1–100, order created_at DESC/id DESC. Owner có status filter, Admin có status/owner_id. Owner lấy ownership từ session; ngoài quyền trả 404, thiếu capability 403. POST/PATCH dùng Origin/CSRF. List/detail core chỉ trả dữ liệu Facility; Admin detail thêm Owner id/full_name/email/phone/status, không credential hoặc aggregate giả.

Quyết định dữ liệu ngày 2026-09-26 thay thế blocker district trước đó. Giữ nguyên field district VARCHAR(100), không rename hoặc migration.


## Nguồn registry

[Nghị quyết 1659/NQ-UBTVQH15](https://chinhphu.vn/?classid=2&docid=213991&pageid=27160), Điều 1; [danh sách trên Báo điện tử Chính phủ](https://xaydungchinhsach.chinhphu.vn/sap-xep-dvhc-danh-sach-94-xa-phuong-dac-khu-cua-thanh-pho-da-nang-moi-119250622180811924.htm). Đối chiếu đủ 91 phường/xã mới, đặc khu Hoàng Sa và hai xã không sắp xếp Tam Hải, Tân Hiệp. Runtime chỉ dùng bản danh mục tĩnh đã review.

## Kiểm chứng ngày 2026-09-26

Registry 94 entry, số lượng theo loại 23/70/1, unique/non-empty/NFC/immutable và representative validation PASS. Local suite 15/15 (4 Facility); Facility integration PostgreSQL 13/13; Auth Phase 1 13/13; Auth Phase 2 10/10; Owner Request 10/10 PASS, gồm suite cha với integration. Health HTTP 200. Happy path dùng registry runtime thật, có kiểm tra 422 cho tên ngoài danh mục; config rỗng chỉ inject trong test negative. Các flow Create/PATCH/Submit/Approve/Activate và concurrency đã xác minh. Fixture cleanup/rollback, dữ liệu 24 bảng/schema không đổi sau test. FACILITY CORE PHASE 1 BACKEND READY: YES. Không chuyển sang Court hoặc module khác.

## Facility Presentation — quyết định 2026-09-28

Presentation theo FACILITY_PRESENTATION_SPEC.md: view mọi state, edit mọi state trừ PENDING, không thay status/approval metadata hoặc re-approve; không áp transition sửa core REJECTED → DRAFT. Ảnh/amenity không bắt buộc submit/approve/activate/booking-ready. Trạng thái implementation tại FEATURE_STATUS.

## Public Facility Phase 1 — specification

Contract đọc riêng tại [PUBLIC_FACILITY_SPEC.md](PUBLIC_FACILITY_SPEC.md), backend đã triển khai và kiểm chứng ngày 2026-10-01. Facility ACTIVE + Owner User ACTIVE mới public; Owner LOCKED loại khỏi list/detail404. Không yêu cầu module con, không tính booking_ready, không thay mutation/checklist/approval core.
