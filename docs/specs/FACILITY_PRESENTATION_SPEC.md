# Facility Presentation Specification

## Implementation status — 2026-10-07

Backend FacilityImage/Amenity và public delivery đã triển khai, gồm xác minh Cloudinary thật. Owner frontend quản lý ảnh và assignment đã triển khai; Admin Amenity frontend còn deferred.

## Trạng thái và scope
Quyết định 2026-09-28; backend đã implementation, kiểm chứng tự động và xác minh Cloudinary upload/delivery/delete thật ngày 2026-09-29; không migration. Phase 1 gồm Owner list/upload/delete/reorder ảnh, read/replace amenities; Admin list/create/update catalog; Cloudinary integration, validation/security/ownership/concurrency và tests. Public API/frontend/Availability/Booking và upload module khác ngoài scope.

## Image rules
Cloudinary public delivery; Supabase chỉ cung cấp PostgreSQL. `image_path` lưu Cloudinary `public_id`, không lưu full URL. JPEG/PNG/WebP tối đa 5.000.000 byte và 10 ảnh/Facility. Backend kiểm tra MIME, magic bytes, giải mã toàn bộ bằng Sharp, từ chối ảnh lỗi/không hoàn chỉnh và ảnh vượt 25.000.000 pixel. Resize/compress/optimization nâng cao tiếp tục deferred.
Cover = sort_order nhỏ nhất; service duy trì 0..n-1. Upload nối cuối; reorder replace-all toàn bộ ID hiện có, từ chối thiếu/thừa/trùng; xóa ảnh compact thứ tự, xóa cover dùng ảnh kế tiếp. Không ảnh: gallery rỗng, cover null.

## State và permission
Owner view mọi state; edit DRAFT/ACTIVE/REJECTED/SUSPENDED, PENDING chỉ đọc (mutation 409 FACILITY_STATE_NOT_EDITABLE). Không re-approve, không thay Facility status/approval metadata; không áp transition core REJECTED → DRAFT cho presentation. Ảnh/amenity không bắt buộc submit/approve/activate/booking-ready.
Backend recheck session/User ACTIVE/capability/ownership, dùng Origin/CSRF hiện tại; 401 phiên không hợp lệ, 403 thiếu capability, 404 ngoài ownership. Admin quản lý catalog, không mặc nhiên sửa ảnh thay Owner.

## Amenity
Global catalog Admin quản lý. Service tạo is_active=true. Name trim+Unicode NFC, 1–100 Unicode code point; giữ UNIQUE(name), không tự lowercase/case-fold hoặc migration. Trùng tên normalized trả 409 AMENITY_NAME_EXISTS. Admin PATCH name và/hoặc is_active boolean, ít nhất một field; không DELETE catalog.
Owner PUT replace-all nguyên tử; [] hợp lệ. Duplicate/nonexistent/inactive ID trong tập mới trả 422, không ghi một phần. Deactivate giữ FacilityAmenity; Owner thấy assignment inactive và is_active, public tương lai ẩn inactive. Tập replace mới chỉ chứa ACTIVE, kể cả assignment đã có. Không tự seed.

## Cloudinary assessment
Schema đủ khi cố định một cloud environment/deployment, resource_type=image, type=upload. public_id ngẫu nhiên riêng từng asset, do backend tạo; không overwrite/rename/tái sử dụng hoặc lấy filename/client ID. Lưu public_id trả về upload. Không tự đổi cloud environment khi còn dữ liệu tham chiếu.
SDK tạo HTTPS URL với cloud_name/public_id, secure=true, image/upload; không bắt buộc lưu full URL/format/version cho ảnh gốc không overwrite. Destroy lấy public_id từ DB sau ownership check, resource_type=image, type=upload, invalidate=true; không nhận ID asset xóa tùy ý từ client. CDN invalidation không tức thì. Public URL không tự thu hồi theo Facility state; không áp public delivery cho proof.
Không bắt buộc persist asset_id/version/format/bytes/dimensions. Schema hiện tại đủ, không migration; max10/sort continuity do service enforce dưới khóa.
Package implementation: cloudinary 2.11.0, multer 2.4.0, file-type 22.1.1. Không cần sharp nếu không resize. Env backend: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. Thiếu config fail rõ ở storage; không credential giả/log secret/raw provider response. Đã bổ sung .env.example rỗng; không sửa .env thực tế.
Nguồn chính thức:
- https://cloudinary.com/documentation/node_integration
- https://cloudinary.com/documentation/node_image_and_video_upload
- https://cloudinary.com/documentation/image_upload_api_reference
- https://cloudinary.com/documentation/invalidate_cached_media_assets_on_the_cdn

## API contract
Prefix /api/v1; envelope data/meta và ID string theo API_SPEC. Trạng thái kiểm chứng tại FEATURE_STATUS.

| Method/path | Input | Response |
| --- | --- | --- |
| GET /owner/facilities/{id}/images | Không | 200 danh sách id, facility_id, url, sort_order, timestamps |
| POST /owner/facilities/{id}/images | multipart image, một file; không sort_order/public_id/URL | 201 metadata; 413 vượt byte, 415 sai loại, 422 đủ 10 ảnh |
| PUT /owner/facilities/{id}/images/order | image_ids[] toàn bộ ID theo thứ tự mới | 200 danh sách; 422 tập ID sai, 404 ngoài ownership |
| DELETE /owner/facilities/{id}/images/{image_id} | Không | 204 sau xóa metadata; cleanup storage bên dưới |
| GET /owner/facilities/{id}/amenities | Không | 200 assignment id/name/is_active, gồm inactive |
| PUT /owner/facilities/{id}/amenities | amenity_ids[] | 200 tập mới; 422 duplicate/nonexistent/inactive |
| GET /admin/amenities | page=1, page_size=20/max100 | 200 active/inactive, created_at DESC/id DESC |
| POST /admin/amenities | name | 201 is_active=true |
| PATCH /admin/amenities/{id} | name?, is_active? | 200; 404 thiếu, 409 trùng, 422 input |

GET /api/v1/owner/amenities yêu cầu OWNER/session hợp lệ, chỉ trả ACTIVE, name ASC/id ASC, không pagination. Public GET /amenities tiếp tục deferred, không thuộc Public Facility Phase 1.

## Concurrency/cleanup và tests
Khóa User → Facility, recheck actor/state/ownership; serialize count/append/reorder/delete/compact. Assignment khóa Amenity ID tăng dần và recheck ACTIVE; Admin deactivate dùng cùng row lock, không khóa ngược Facility. Không gọi storage trong DB transaction/row lock.
Upload ngoài transaction rồi transaction metadata recheck count/state/quyền; thất bại thì destroy object chưa tham chiếu. Delete commit metadata/compact trước, destroy sau. Storage fail không phục hồi metadata giả. Cleanup MVP: upload thành công nhưng DB insert fail thì best-effort destroy ngay; destroy fail log mã lỗi + public_id để xử lý thủ công, giữ nguyên lỗi gốc. Delete commit metadata/compact trước rồi best-effort destroy; thất bại log mã lỗi + public_id, không phục hồi metadata giả. Không scheduler/reconciliation; automated orphan cleanup deferred. Crash có thể để lại orphan cần xử lý thủ công. Không network dưới DB lock hoặc distributed transaction.
Tests đã chạy: input/content/size/count; state/ownership; reorder/cover; inactive/duplicate; catalog normalization/default; concurrent upload/reorder/delete/submit/assignment/deactivate; fake adapter và upload/DB/destroy failure; regression Auth/Owner/Facility/Court/Booking Configuration, health200. Real Cloudinary test cần cấu hình hợp lệ và cleanup asset test, chỉ thực hiện khi có cấu hình hợp lệ; verification development đã PASS ngày 2026-09-29.
Schema đủ, không migration. Hai quyết định cuối đã chốt trước implementation. Feature chỉ DONE sau kiểm chứng.

## Implementation contract — Phase 1
Hai quyết định cuối đã duyệt: GET /api/v1/owner/amenities chỉ OWNER, ACTIVE, name ASC/id ASC, không pagination; public GET /amenities deferred. Cleanup MVP không scheduler/reconciliation, chỉ best-effort destroy và manual handling bằng log code/public_id. Delete commit DB metadata/compact trước rồi destroy, trả 204 kể cả destroy fail; log orphan để xử lý thủ công. Không network trong transaction. Upload DB lỗi: kiểm tra lại tham chiếu ngoài transaction trước cleanup để không xóa asset đã commit khi kết quả COMMIT không rõ; nếu DB không kiểm tra được, log DB_COMMIT_OUTCOME_UNKNOWN/public_id, giữ lỗi gốc và asset. Không tự thử lại upload.
Code tại backend/src/modules/facilities/presentation/. Adapter thiếu cấu hình trả 503 IMAGE_STORAGE_NOT_CONFIGURED, provider upload lỗi trả 503 IMAGE_STORAGE_UNAVAILABLE; không lộ raw provider response. Metadata ảnh trả URL HTTPS, không trả credential. Danh sách ảnh sắp sort_order ASC/id ASC, ảnh đầu là cover. Bộ test dùng fake storage, không gửi ảnh ra ngoài.

## Kết quả Facility Presentation Phase 1 — 2026-09-28
Backend implementation và automated verification hoàn tất: local 29/29, Presentation PostgreSQL 12/12, regression 71/71 PASS; health HTTP 200; fixture cleanup/rollback PASS. Không schema/migration/.env/CA/TLS thay đổi. Cloudinary official SDK đã tích hợp; real upload chưa xác minh vì ba biến cấu hình MISSING. READY chỉ backend theo scope đã chốt, không frontend/production storage verification. Xem docs/FEATURE_STATUS.md (hoặc FEATURE_STATUS.md trong docs) cho giới hạn kiểm chứng.

## Real verification — 2026-09-29
Đã xác minh đúng 1 PNG qua upload API hiện tại (201), public_id-only trong DB, đúng Facility/sort_order=0 và delivery URL truy cập được. DELETE cùng ảnh (204) gọi đúng 1 destroy, Cloudinary result=ok. Admin API đọc namespace image/upload facility-images/ trả 0 asset, không next_cursor; fixture DB đã cleanup. Không retry upload/delete, không gửi email thật, không thay business rules hoặc cấu hình. Local 29/29, PostgreSQL 83/83 PASS (Presentation 12 + regression 71), health200. Các ghi nhận thiếu credential ở mục ngày 2026-09-28 là lịch sử; real verification hiện YES. Chi tiết tại ../FEATURE_STATUS.md.

## Public consumer — specification

PUBLIC_FACILITY_SPEC.md tái sử dụng URL adapter: cover_image_url/null, gallery URL array/[], order sort_order ASC/id ASC; không field public_id/image_path. Active amenities name ASC/id ASC. Public Amenity catalog vẫn deferred; Owner/Admin API giữ nguyên. Consumer Public Facility Phase 1 đã triển khai và kiểm chứng ngày 2026-10-01.

## Owner frontend implementation — 2026-10-09

Route `/owner/facilities/:facility_id/images-amenities` dùng API thật và reference approved. Gallery hỗ trợ empty/loading/error, upload từng ảnh, preview trong memory, xác nhận delete và nút chuyển trước/sau gửi toàn bộ `image_ids`; refetch dữ liệu authoritative sau mutation. Ảnh đầu theo `sort_order ASC, id ASC` được đánh dấu cover. Frontend không nhận hoặc hiển thị `image_path`/public_id.

Owner lấy catalog ACTIVE và assignment hiện tại từ hai endpoint riêng. Assignment inactive được giữ và hiển thị; UI không tự loại bỏ khi catalog ACTIVE không chứa nó. Owner phải chủ động bỏ chọn inactive trước khi PUT tập ACTIVE replace-all. Facility `PENDING` chỉ đọc; các state còn lại cho mutation. Shared Facility navigation nối các route thật và giữ Chính sách hủy disabled cho đến phase riêng.
