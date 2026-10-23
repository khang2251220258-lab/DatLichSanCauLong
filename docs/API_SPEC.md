# REST API Specification

## Operational health endpoints

| Method / path | Access | Meaning |
| --- | --- | --- |
| GET `/health` | Public | Process liveness only; does not query PostgreSQL. |
| GET `/ready` | Public | Bounded lightweight PostgreSQL readiness check; returns 200 when the application can serve database-backed traffic and a generic 503 `SERVICE_UNAVAILABLE` otherwise. |

These endpoints use the normal `/api/v1` prefix. Readiness never returns database connection details or raw dependency errors.

## Recurring occurrence cancellation — implemented backend

`POST /api/v1/booking-series/{series_id}/occurrences/{booking_id}/cancel` dành cho ACTIVE CUSTOMER sở hữu Series/child; mutation yêu cầu Origin + CSRF. Body là `{}` hoặc `{ "reason": string }`, trim và tối đa 500 Unicode code points. Cả hai ID phải khớp một recurring V2 child; mismatch/cross-customer trả 404.

Chỉ child `CONFIRMED` của Series `CONFIRMED`, trước cutoff snapshot theo DB time, được hủy. Thành công chỉ chuyển child sang `CANCELLED`, nhả locks của child, giữ BookingSlots và tạo Refund `PENDING` bằng child deposit snapshot; Series/sibling không đổi. Response dùng cancellation/refund whitelist hiện hành. Backend luôn recheck dù read DTO báo `can_cancel`. Xem `docs/specs/RECURRING_CANCELLATION_REFUND_SPEC.md`. Backend đã implement; Customer UI thuộc Phase 5C.

## Recurring Search / Booking — backend implemented through Phase 3

`GET /api/v1/facilities/recurring-search` dùng contract Phase 2: query bắt buộc `weekday=1..7` (ISO Monday..Sunday), `start_date`, `end_date`, `start_time`, `end_time`; `q`, `district`, `page`, `page_size` optional. Range inclusive tối đa 93 ngày, tối đa 14 occurrences, 1–6 slot 30 phút. Response dùng public Facility whitelist, `matching_courts`, pagination và `meta.occurrence_count`; chỉ trả Court trống và có đúng một PriceRule cho mọi occurrence.

| Method / path | Role | Contract chính |
| --- | --- | --- |
| POST `/bookings/recurring` | CUSTOMER | Strict intent body; backend re-expand/recheck và atomically tạo Series + V2 children + slots + locks; trả 201 aggregate/occurrence DTO, signed bank/QR display và `CLDNS <SERIES_ID>` |
| GET `/booking-series` và `/{id}` | CUSTOMER | Chỉ Series của chính Customer; list pagination/status, detail lazy expiry và ordered occurrences |
| GET `/owner/booking-series` và `/{id}` | OWNER | Chỉ Series thuộc Facility của Owner; list aggregate không N+1, detail lazy expiry |
| POST `/owner/booking-series/{id}/confirm` | OWNER | Body rỗng, Origin/CSRF; pending trước deadline → Series và children CONFIRMED, giữ locks |
| POST `/owner/booking-series/{id}/reject` | OWNER | `{rejection_reason}` trim 1–500, Origin/CSRF; Series và children REJECTED, giữ history và nhả locks |

Exact deadline `now >= confirmation_expires_at` chuyển Series/children còn pending sang EXPIRED và nhả locks. Một conflict trả `SLOT_UNAVAILABLE` và rollback toàn bộ. PaymentProof cho recurring child fail closed; frontend/cancellation/refund recurring vẫn deferred.

## Refund processing — implemented 2026-10-10

Refund UI nằm trong Booking Detail, nhưng mutation/read proof dùng `refund_id` theo contract hiện có. Không có frontend Refund Center và các list `/refunds`, `/owner/refunds` tiếp tục deferred. Booking Detail Customer/Owner phải trả `refund: null` hoặc summary whitelist gồm `id`, `booking_id`, `amount`, `status`, `reason`, `requested_at`, `proof_submitted_at`, `confirmed_at`, `refunded_at`; không trả storage path.

| Method / path | Role | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- | --- |
| GET /refunds/{refund_id} | C sở hữu Booking | Không | Refund detail; `proof_image_url` HTTPS và `proof_image_expires_at` chỉ khi `PROOF_SUBMITTED/REFUNDED` | 404 ngoài ownership; 409 trạng thái dữ liệu không nhất quán; 503 storage |
| POST /refunds/{refund_id}/confirm | C sở hữu Booking | Body rỗng | `PROOF_SUBMITTED → REFUNDED`, ghi `confirmed_at=refunded_at` bằng DB time | 409 INVALID_REFUND_STATE; 403 Origin/CSRF |
| GET /owner/refunds/{refund_id} | O sở hữu Facility của Booking | Không | Refund detail và URL proof tạm khi đã submit | 404 ngoài ownership; 409 dữ liệu không nhất quán; 503 storage |
| POST /owner/refunds/{refund_id}/proof | O sở hữu Facility của Booking | multipart đúng một field `image` | `PENDING → PROOF_SUBMITTED`, proof immutable | 409 INVALID_REFUND_STATE; 413 quá 5 MB; 415 không JPEG/PNG; 422 ảnh lỗi; 403 Origin/CSRF |

Proof nhận JPEG/PNG tối đa 5.000.000 byte và 25.000.000 decoded pixels; backend kiểm tra magic bytes, ảnh tĩnh và Sharp decode thật. Cloudinary dùng asset authenticated/private và URL ký TTL 300 giây; DTO không expose `proof_image_path`. Upload nằm ngoài transaction, sau đó khóa/recheck theo thứ tự chung `User IDs tăng dần → Facility → Court → Booking → PaymentProof → Refund`; lỗi DB cleanup best-effort, kết quả commit không rõ phải kiểm tra DB reference trước destroy/retry. Không replace/delete/resubmit proof và không confirm lặp.

## Implementation baseline — 2026-10-07

Đã triển khai các nhóm Auth email/password, Public Facility, Availability, Customer Booking, customer PaymentProof, Owner Booking/Payment review, Owner Facility/Court/Booking Configuration và Admin Facility approval. Endpoint có trong roadmap nhưng chưa có source không được coi là implemented; trạng thái chi tiết theo `FEATURE_STATUS.md`. Cleanup Phase 4 chỉ dùng chung response validator ở frontend, không thay method/path/body/DTO/error contract.

Booking Configuration có Owner GET/PUT price/policy/bank và POST/DELETE Bank QR theo [BOOKING_CONFIGURATION_SPEC.md](specs/BOOKING_CONFIGURATION_SPEC.md). Tất cả success 200; price GET/PUT trả array order start_time/end_time/id ASC, policy/bank GET trả null nếu chưa có, PUT upsert trả record. GET không query/pagination. Price/policy DTO giữ ID/timestamp; Bank DTO là whitelist text + `has_qr_image` + private URL/expiry, không raw path. Rate input JSON integer 1..999999999999; price PUT chỉ rules (max48, [] cho phép), không overlap. Cutoff integer0..168; bank name/holder1..150, account1..50 ASCII alphanumeric. PENDING mutation→409 FACILITY_STATE_NOT_EDITABLE, state khác được phép. 401 phiên;403 capability/Origin/CSRF;404 ngoài sở hữu. QR multipart nhận đúng `image`, JPEG/PNG an toàn và trả signed URL TTL300 giây.

Baseline v1: Customer capability áp dụng cho cả Approved Owner khi dùng chức năng cá nhân; quyền quản lý Owner chỉ áp dụng tài nguyên cơ sở mình. PENDING_CONFIRMATION không countdown 5 phút, không tự expire, không cho Customer cancel; Owner phải Confirm hoặc Reject.

## API Conventions

Auth, Owner Request, Facility Core, Court Core, Booking Configuration, Facility Presentation và Public Facility Phase 1 có backend; trạng thái kiểm chứng chi tiết theo FEATURE_STATUS. Các endpoint ngoài phạm vi đã ghi nhận vẫn là contract dự kiến. Prefix `/api/v1`; các path bên dưới bỏ prefix cho gọn. REST/JSON, riêng upload dùng multipart/form-data, OAuth dùng redirect. Nguồn chuẩn [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md), dữ liệu [DATABASE.md](DATABASE.md).

- ID là string trong JSON; thời điểm ISO 8601 UTC với Z, ví dụ `2026-10-01T02:00:00Z`; UI hiển thị Asia/Ho_Chi_Minh. Query `date` là YYYY-MM-DD theo ngày địa phương cơ sở.
- Tiền VND response dạng chuỗi decimal để giữ chính xác, ví dụ `"60000"`; rating/count là số. Ngoại lệ input được duyệt: PriceRule PUT nhận hourly_rate JSON integer 1..999999999999 (safe integer), response vẫn string. Enum/field/path tiếng Anh; message hiển thị tiếng Việt.
- Thành công: `{ "data": ..., "meta": { "server_time": "..." } }`. List thêm `page`, `page_size`, `total`; đề xuất page=1, page_size=20, tối đa 100. HTTP 201 khi tạo, 200 khi đọc/cập nhật, 204 khi xóa/logout, 302 cho OAuth. 204 không có body.

Ngoại lệ Booking Configuration: GET bảng giá trả toàn bộ tập ≤48 không pagination, meta chỉ server_time. PUT price/policy/bank luôn 200, kể cả tạo singleton lần đầu; xem BOOKING_CONFIGURATION_SPEC.
- Lỗi: `{ "error": { "code": "SLOT_UNAVAILABLE", "message": "Khung giờ không còn trống.", "details": {} }, "meta": { "server_time": "...", "request_id": "..." } }`. Không SQL/stack trace/secrets.
- Auth bằng session cookie, không Bearer JWT trong thiết kế này. Request ghi đã đăng nhập gửi CSRF token qua `X-CSRF-Token`; kiểm tra Origin. Login/register cũng kiểm tra Origin và rate limit; callback Google dùng state.
- P = public; C = Customer capability (gồm Approved Owner); O = Owner capability đã được duyệt; A = ADMIN; U = mọi tài khoản đã đăng nhập ACTIVE. Approved Owner có đồng thời C + O. role nền trả về CUSTOMER/ADMIN, capabilities trả [CUSTOMER], [CUSTOMER, OWNER] hoặc [ADMIN]. Sai role 403; tài nguyên ngoài ownership trả 404. Mỗi API có auth vẫn kiểm tra tài khoản ACTIVE.
- Field không được phép (role/status/customer_id/owner_id/amount từ client ở create booking) bị từ chối 422, không âm thầm dùng. Không generic endpoint patch booking.status.
- Những endpoint ghi **reserved/TODO** chưa đủ quy tắc để triển khai. Khi route được đưa vào app trước khi hoàn thiện, trả 501 FEATURE_NOT_CONFIGURED; auth và Owner Request đã có contract v1, không reserved. UI thể hiện không khả dụng.
- Lỗi chung mọi nhóm: 401 chưa đăng nhập/hết phiên; 403 sai role/CSRF; 404 không tồn tại/ngoài ownership; 422 input; 429 rate limit; 500 lỗi nội bộ; 503 dịch vụ phụ thuộc chưa sẵn sàng. Bảng dưới chỉ ghi lỗi nghiệp vụ bổ sung.

## Authentication

| Method / path | Role | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- | --- |
| POST /auth/register | P | full_name, email, password | 201 user CUSTOMER; chưa tự login | 409 EMAIL_ALREADY_EXISTS; 422 password/email |
| POST /auth/login | P | email, password | 200 user + csrf_token; set session cookie | 401 INVALID_CREDENTIALS; 403 ACCOUNT_LOCKED |
| GET /auth/session | U | Không | user id/role/capabilities/has_local_password/profile + csrf_token | 401 SESSION_EXPIRED |
| POST /auth/logout | U/phiên đã hết | Không | 204 revoke phiên và clear cookie | 403 CSRF nếu có phiên |
| GET /auth/google | P | Không | 302 Google OAuth, state cookie HttpOnly ký/hạn 10 phút | 503 GOOGLE_AUTH_NOT_CONFIGURED; 429 RATE_LIMITED |
| GET /auth/google/callback | P + OAuth state | code, state hoặc lỗi Google | 302 `/login?google=<allow-list>`; set application cookie khi thành công | `google_cancelled`, `google_failed`, `account_exists`, `account_inactive` qua redirect an toàn |
| POST /auth/forgot-password | P | email | 202 cùng message cho mọi email hợp lệ, không lộ tồn tại | 422 email sai định dạng; 429 rate limit; 503 AUTH_EMAIL_UNAVAILABLE chỉ khi dịch vụ chung không sẵn sàng |
| POST /auth/reset-password | P | token, new_password | 200 đổi mật khẩu, tiêu thụ token, revoke phiên, yêu cầu login | 422 INVALID_RESET_TOKEN / VALIDATION_ERROR; 429 |
| POST /auth/change-password | U | current_password, new_password | 200 yêu cầu đăng nhập lại, clear cookie | 422 INVALID_CURRENT_PASSWORD; 409 PASSWORD_NOT_CONFIGURED |

### Forgot / Reset / Change Password Contract

Forgot body `{ "email": "user@example.com" }`; response 202 `{ "data": { "message": "Nếu tài khoản đủ điều kiện, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email của bạn." }, "meta": { "server_time": "..." } }`. Cùng HTTP/body cho email không tồn tại, Google-only, LOCKED hoặc có mật khẩu cục bộ. Không trả exists, phương thức login hoặc raw token. Không chờ Resend API riêng theo tài khoản khiến response lộ tồn tại; lỗi gửi được xử lý nội bộ. Lỗi cấu hình email toàn hệ thống 503 phải áp dụng đồng nhất trước tra cứu email.

Với tài khoản ACTIVE có password_hash, server sinh random single-use token, lưu token_hash SHA-256 trong password_reset_tokens; expires_at = created_at + 15 phút. Vô hiệu token cũ trong transaction, gửi link HTTPS qua email sau commit. Không lưu raw token vào DB/log/response. Google-only không được phát token tạo mật khẩu cục bộ; UI hướng dẫn tiếp tục Google Login, nhưng forgot response vẫn chung.

Reset body `{ "token": "...", "new_password": "..." }`: kiểm tra hash, used_at/invalidated_at NULL và DB now < expires_at sau khóa. Đúng mốc 15 phút, đã dùng hoặc không hợp lệ → 422 INVALID_RESET_TOKEN chung. Transaction hash mật khẩu mới + used_at + vô hiệu token khác + revoke tất cả session; hai request cùng token chỉ một thành công. Response 200 message “Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.”; không tự login/mở khóa tài khoản.

Change body current_password/new_password, cần phiên ACTIVE/CSRF. Kiểm tra mật khẩu cũ, hash mới, revoke toàn bộ phiên và vô hiệu reset tokens nguyên tử. Response 200 yêu cầu login lại; sai mật khẩu cũ 422 INVALID_CURRENT_PASSWORD, Google-only 409 PASSWORD_NOT_CONFIGURED. Không thêm account-linking hoặc tạo mật khẩu cho Google-only trong MVP.

Email reset là ngoại lệ auth; notification booking/payment/refund không gửi email/SMS.

## Customer APIs / Users

| Method / path | Role | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- | --- |
| GET /users/me | U | Không | DTO whitelist id/full_name/email/phone/capabilities/has_local_password | 401 SESSION_EXPIRED |
| PATCH /users/me | U | full_name? và/hoặc phone? | Cùng DTO whitelist đã cập nhật | 401; 403 Origin/CSRF; 422 field/value không hợp lệ |
| POST /users/me/avatar | U | multipart image | avatar_url | 413 file lớn; 415 định dạng |
| POST /users/me/owner-requests | C chưa có O | Body rỗng hoặc {} | 201 request PENDING với snapshot hồ sơ server | 409 REQUEST_ALREADY_PENDING / ALREADY_OWNER; 422 field ngoài scope |
| GET /users/me/owner-requests | C (gồm O) | page, page_size | Lịch sử yêu cầu của mình + status/rejection_reason | Lỗi chung |
| GET /users/me/owner-requests/{request_id} | C sở hữu | Không | Chi tiết request/snapshot/reviewer time/rejection_reason | 404 ngoài quyền |
| GET /users/me/dashboard | C | Không | Số booking theo status, booking sắp tới của mình | Lỗi chung |

Không có endpoint client tự đổi role/capabilities hoặc đăng ký Admin công khai. C áp dụng cho cả Approved Owner ở mọi route Customer: booking/proof/hủy/refund/favorite/review/dashboard/report cá nhân, vẫn scope theo user_id. Owner capability không cho truy cập dữ liệu Customer khác.

### Create / View Owner Request

GET/PATCH `/users/me` yêu cầu session User ACTIVE và trả đúng `id`, `full_name`, `email`, `phone`, `capabilities`, `has_local_password`. PATCH chỉ nhận tập con không rỗng của `full_name`, `phone`: tên trim 1–150 Unicode code points; phone nullable, trim, tối đa 30, chuỗi rỗng thành `null`. Email/ID/role/capabilities/status/avatar/password/timestamps và field lạ bị từ chối 422. PATCH lấy User ID từ session, khóa User, recheck session/state và yêu cầu Origin + CSRF; không revoke session vì không đổi login identity.

POST /users/me/owner-requests nhận body rỗng; không nhận user_id/status/role. Server khóa User, kiểm tra ACTIVE, Customer capability và chưa có OwnerProfile; chụp full_name/email/phone từ hồ sơ hiện có. Insert PENDING, partial UNIQUE(user_id) WHERE status = 'PENDING' bảo đảm một PENDING/user. Snapshot không đổi khi Profile được sửa sau đó. Đây là contract MVP dùng hồ sơ sẵn có, không yêu cầu giấy tờ chưa đặc tả.

Response 201: id, user_id, status=PENDING, applicant_name_snapshot, applicant_email_snapshot, applicant_phone_snapshot, created_at; reviewed_at/rejection_reason ban đầu null. GET list/detail trả các trường này và quyết định/rejection_reason khi đã duyệt. Request REJECTED giữ lịch sử, Customer tạo mới bằng POST với id mới; không sửa record cũ về PENDING. Hai request tạo đồng thời: một thành công, còn lại 409 REQUEST_ALREADY_PENDING. Đã Approved Owner: 409 ALREADY_OWNER.

Dashboard cá nhân của Approved Owner vẫn lấy bookings.customer_id của mình; không dùng dữ liệu quản lý Owner để thay danh sách booking cá nhân.

## Facility APIs / Search

Contract Phase 1 đã triển khai và kiểm chứng ngày 2026-10-01: [PUBLIC_FACILITY_SPEC.md](specs/PUBLIC_FACILITY_SPEC.md). Guest không cần session; chỉ Facility ACTIVE của Owner User ACTIVE public, còn lại detail404. Phase 1 chỉ GET /facilities và GET /facilities/{facility_id}; q/district/page/page_size, mặc định 1/20/max100, id ASC. q trim+NFC, rỗng bỏ qua, contains case-insensitive tên Facility hoặc ACTIVE Court, không bỏ dấu/duplicate. district một giá trị trim+NFC theo registry, invalid422.

List whitelist id/name/district/address/cover_image_url/amenities. Detail core public/gallery URLs/active amenities/ACTIVE Courts/price_rules/cancellation_policy; DTO chính xác tại spec. Không Owner/bank/internal metadata/public_id/image_path/rating/representative price/booking_ready. Query filter/sort deferred trả422 FILTER_NOT_CONFIGURED, query sai/unknown trả422 VALIDATION_ERROR. Không silently ignore. Gallery/cover order sort_order ASC/id ASC; amenities name ASC/id ASC; Courts id ASC; rules start_time/end_time/id ASC. Thiếu gallery/rules trả[], cover/policy null.

Bảng và mô tả dưới đây chỉ là thiết kế tổng thể tương lai: public Amenity catalog/filter, Court/review endpoint riêng, giá/rating/popularity/date-time và sort đều deferred trong Phase 1. Contract Phase 1 ở trên thay thế phần tương ứng, không triển khai các endpoint tương lai:

| Method / path | Role | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- | --- |
| GET /facilities | P | q, district, date?, start_time?, end_time?, page, page_size; bộ ba thời gian all-or-none | Facility ACTIVE; interval search kèm `matching_courts` đáp ứng trọn khoảng | 422 INVALID_DATE / INVALID_SEARCH_RANGE / FILTER_NOT_CONFIGURED |
| GET /facilities/{facility_id} | P | Không | Thông tin public, ảnh, tiện ích, giờ mở cửa, Court ACTIVE, bảng giá và policy hiển thị | 404 nếu không ACTIVE |
| GET /facilities/{facility_id}/courts | P | Không | Court ACTIVE của Facility ACTIVE | 404 nếu Facility không public |
| GET /facilities/{facility_id}/reviews | P | page, page_size | Review VISIBLE, tên hiển thị tác giả, rating/comment/ảnh nếu P3 | 404 nếu Facility không public |
| GET /amenities | P | Không | Danh mục is_active | Lỗi chung |

`q` tìm tên Facility hoặc Court, kết quả không lặp Facility. Guest Search theo [GUEST_SEARCH_SPEC.md](specs/GUEST_SEARCH_SPEC.md) đã implement: date/start_time/end_time phải xuất hiện cùng nhau, một ACTIVE Court phải AVAILABLE cho toàn bộ các slot 30 phút liên tiếp, không ghép giờ từ nhiều Court. Không truyền interval giữ nguyên Facility card DTO; có interval bổ sung `matching_courts`. Giá/rating/amenity filter vẫn deferred và trả FILTER_NOT_CONFIGURED.

Các giá trị sort dự kiến `popular`, `rating`, `price_asc`, `price_desc`; TODO công thức popular, giá đại diện/lọc giá và tie-break rating. Trước khi chốt không âm thầm bỏ query chưa hỗ trợ: trả FILTER_NOT_CONFIGURED; UI chưa bật lựa chọn đó. Khi không truyền sort, dùng thứ tự kỹ thuật ổn định id tăng dần, không gắn nhãn “phổ biến”. District dùng registry 94 đơn vị cấp xã; TODO logic nhiều amenity (tất cả hay bất kỳ) trước triển khai bộ lọc tương ứng.

## Court APIs và Availability

`GET /courts/{court_id}` (P): trả id, facility_id, name, description, status công khai và link dữ liệu Facility; 404 nếu Court INACTIVE hoặc Facility không ACTIVE.

### GET /courts/{court_id}/availability

Endpoint Phase 1 đã triển khai: [AVAILABILITY_SPEC.md](specs/AVAILABILITY_SPEC.md).
- GET /api/v1/courts/:court_id/availability?date=YYYY-MM-DD, public/guest. Chỉ Court ACTIVE + Facility ACTIVE + Owner User ACTIVE; còn lại404 RESOURCE_NOT_FOUND.
- Chỉ date hôm nay/tương lai theo Asia/Ho_Chi_Minh; thiếu/sai/lặp/ngày không tồn tại/quá khứ →422 INVALID_DATE. Path ID sai hoặc unknown query →422 VALIDATION_ERROR. Không start/end/facility_id query.
- Một snapshot DB time cho toàn response, gồm meta.server_time. Slot30 phút [start_at,end_at), biên :00/:30 trong giờ Facility; UTC ISO Z; hôm nay start_at <= DB time →PAST.
- Priority PAST > BLOCKED > BOOKED > HELD > UNPRICED > AVAILABLE. CONFIRMED→BOOKED; PENDING_CONFIRMATION→HELD không expiry; PENDING_PAYMENT còn hạn→HELD. Hết hạn hoặc CANCELLED/REJECTED/EXPIRED/COMPLETED không chặn. CourtBlock bất kỳ overlap→BLOCKED.
- 200 {data:{court_id,date,timezone,slot_minutes,slots},meta:{server_time}}. Mỗi slot chỉ start_at/end_at/state/slot_amount; order start_at ASC. Một PriceRule phủ toàn slot→hourly_rate/2 decimal string, không rule→null, UNPRICED nếu không có state ưu tiên cao hơn. State khác vẫn trả giá nếu có.
- Nhiều PriceRule phủ một slot→409 PRICE_NOT_CONFIGURED cho toàn response, không tự chọn giá; giờ cấu hình sai→409 FACILITY_NOT_CONFIGURED. Không tổng quote, không snapshot giá DB.
- Read-only: không tạo/expire/cleanup Booking hoặc lock; không kiểm tra BankAccount. AVAILABLE không bảo đảm Booking thành công. Không booking/customer/proof/internal IDs hoặc countdown HELD. Chi tiết validation, giá và nguồn đọc ở spec.

## Booking APIs

### Booking Phase 1 — backend đã triển khai, 2026-10-04

Contract đầy đủ và whitelist chuẩn: [BOOKING_SPEC.md](specs/BOOKING_SPEC.md), mục Booking Phase 1. Prefix /api/v1; Customer capability gồm Approved Owner, không gồm ADMIN.

| Method / path | Request | Response |
| --- | --- | --- |
| POST /bookings | Chỉ court_id, start_at, end_at | 201 data BookingDetail; meta.server_time |
| GET /bookings | Chỉ page=1, page_size=20 (max100) | 200 data BookingSummary[]; meta.server_time/page/page_size/total |
| GET /bookings/:id | Không query | 200 data BookingDetail; meta.server_time |

Body create chỉ ba field bắt buộc. ID là string BIGINT dương; start_at/end_at là UTC ISO có Z, dạng YYYY-MM-DDTHH:mm:ssZ hoặc YYYY-MM-DDTHH:mm:ss.SSSZ. Ngày phải thật, giây/millisecond bằng0, phút local :00/:30. Khoảng 1–6 slot liên tiếp cùng Court/cùng ngày Asia/Ho_Chi_Minh, nằm trọn giờ Facility; start_at > DB time và <= DB time + 30 × 24 giờ. Không yêu cầu phone. Không nhận customer_id/status/price/deposit/remaining/expires_at/snapshots/slot prices hoặc field lạ.

BookingSummary chỉ: id, court_id, status, start_at, end_at, expires_at, created_at, total_amount, deposit_amount, remaining_amount, facility_name_snapshot, facility_address_snapshot, court_name_snapshot.

BookingDetail thêm: cancellation_cutoff_hours_snapshot (integer/null), cancelled_at, cancelled_by, cancellation_reason, bank_name_snapshot, account_number_snapshot, account_holder_snapshot, `qr_image_url`, `qr_image_expires_at`, `refund` summary nullable và slots. Mỗi slot chỉ start_at/end_at/hourly_rate_snapshot/slot_amount, order start_at ASC. ID string, tiền decimal string, timestamp UTC Z. QR URL private TTL300 giây được sinh từ snapshot; raw path không expose. Không Customer/Owner relation, slot/lock ID, PaymentProof hoặc storage path. Refund proof URL không nằm trong BookingDetail; client đọc riêng bằng Refund Detail endpoint có ownership check.

Session ACTIVE + CUSTOMER bắt buộc; POST kiểm tra Origin/X-CSRF-Token. GET luôn lọc customer_id từ session, booking ngoài sở hữu trả404; không chặn lịch sử vì Facility/Court/Owner ngừng ACTIVE. Cache-Control: no-store. List created_at DESC/id DESC, count/items cùng snapshot; query lạ/lặp bị422. List chỉ đọc, biểu diễn PENDING_PAYMENT đã hết hạn thành EXPIRED theo meta.server_time; detail lazy expiry commit trước khi trả. Không countdown PENDING_CONFIRMATION.

Create recheck dưới khóa User IDs tăng dần loại trùng → Facility → Court → Booking liên quan ID tăng dần → slot locks. Bank/rules/policy/snapshots do backend đọc và tính; Booking + BookingSlot + CourtSlotLock cùng transaction với dọn expiry liên quan. created_at là DB time sau khóa, expires_at=created_at+5 phút. Cọc round half-up30%, remaining=total-deposit; overflow trả lỗi nghiệp vụ trước ghi DB.

| HTTP / code | Điều kiện |
| --- | --- |
| 401 SESSION_EXPIRED | Thiếu/sai/hết hạn/revoked session, Customer không ACTIVE |
| 403 FORBIDDEN | Capability/Origin/CSRF |
| 404 RESOURCE_NOT_FOUND | Court không tồn tại hoặc booking không tồn tại/không sở hữu |
| 422 VALIDATION_ERROR | Body/query/path/field/pagination không đúng contract |
| 422 INVALID_TIME_RANGE | Sai datetime/alignment, end<=start, khác ngày local hoặc ngoài giờ Facility |
| 422 BOOKING_IN_PAST | start_at <= DB time sau khóa |
| 422 BOOKING_TOO_LONG | Hơn6 slot/3giờ |
| 422 BOOKING_TOO_FAR | start_at > DB time +30×24giờ |
| 409 FACILITY_UNAVAILABLE | Facility hoặc Owner User không ACTIVE |
| 409 COURT_UNAVAILABLE | Court không ACTIVE |
| 409 SLOT_UNAVAILABLE | Block/booking hiệu lực/PK slot collision |
| 409 PRICE_NOT_CONFIGURED | Thiếu hoặc nhiều rule phủ slot |
| 409 BANK_ACCOUNT_NOT_CONFIGURED | Thiếu hoặc sai cấu hình bank text |
| 422 BOOKING_AMOUNT_TOO_LARGE | Vượt NUMERIC(12,0) amount hoặc NUMERIC(14,2) slot_amount; không lộ overflow DB |

Không có idempotency key Phase1. Mất response phải đọc list/detail của mình trước khi thử lại; detail trả đủ giá/ngân hàng/slot snapshot/expires_at/server_time để phục hồi hold, không tự tạo lại. Hết hold không xóa lịch sử.

### Các thao tác Customer deferred

Cancel/complete, PaymentProof, Refund, worker và các filter status/from/to không thuộc Booking Phase1. Contract tương lai dưới đây không tự cấp scope implementation.

### Cancel Booking

`POST /bookings/{booking_id}/cancel` (C) đã triển khai cho `PENDING_PAYMENT` còn hạn/chưa có PaymentProof và `CONFIRMED` đủ cutoff/cọc APPROVED; body chỉ nhận `{ "reason": "..." }` tùy chọn. Backend xác định actor CUSTOMER từ session (kể cả User có thêm Owner capability), không nhận cancelled_by/amount/status từ client. Thành công chuyển `CANCELLED`, ghi metadata, nhả `CourtSlotLock`, giữ `BookingSlot`; nhánh PENDING_PAYMENT trả `refund: null`, nhánh CONFIRMED tạo/trả Refund PENDING. Ngoài ownership 404; đã hết hạn `BOOKING_EXPIRED`; đã có proof hoặc `PENDING_CONFIRMATION` trả `CANCELLATION_NOT_ALLOWED`; state kết thúc khác trả `INVALID_BOOKING_STATE`.

| State hiện tại | Quyền Customer | Refund khi thành công |
| --- | --- | --- |
| PENDING_PAYMENT còn hạn | Hủy không xét cutoff | null |
| PENDING_CONFIRMATION | Không được hủy; Owner phải Confirm hoặc Reject | Không phát sinh từ hủy |
| CONFIRMED | DB now < start_at - cancellation_cutoff_hours_snapshot | PENDING, amount=deposit_amount đã APPROVED |
| COMPLETED/REJECTED/EXPIRED/CANCELLED | Không được hủy | Không tạo |

Đúng cutoff cũng bị từ chối. Ví dụ start 18:00, cutoff_hours=2: trước 16:00 được hủy, từ 16:00 không được. CONFIRMED thiếu snapshot cutoff trả 409 CANCELLATION_POLICY_NOT_CONFIGURED; đúng hoặc quá deadline trả 409 CANCELLATION_DEADLINE_PASSED; quy tắc này không chặn nhánh PENDING_PAYMENT. PENDING_PAYMENT đã hết hạn phải commit EXPIRED/nhả locks rồi trả 409 BOOKING_EXPIRED, không chuyển CANCELLED.

`POST /owner/bookings/{booking_id}/cancel` (O sở hữu Facility) đã triển khai, nhận exact body `{ "reason": "..." }`, trim và bắt buộc 1–500 Unicode code points; chỉ `CONFIRMED` với PaymentProof `APPROVED`. Không áp cutoff của Customer. Response 200 trả cancellation summary `cancelled_by=OWNER`, Refund `PENDING` bằng `deposit_amount` và `meta.server_time`; thiếu lý do 422 `CANCELLATION_REASON_REQUIRED`, body sai 422 `VALIDATION_ERROR`, sai state/payment 409 `INVALID_BOOKING_STATE`/`INCONSISTENT_PAYMENT_STATE`, ngoài ownership 404. Owner route không hủy PENDING_PAYMENT/PENDING_CONFIRMATION; người có thêm Customer capability vẫn được hủy PENDING_PAYMENT của mình qua Customer route.

Customer cancel PENDING_CONFIRMATION trả 409 CANCELLATION_NOT_ALLOWED; Owner cancel trạng thái này trả 409 INVALID_BOOKING_STATE. Không nhả slot; Owner phải Confirm hoặc Reject. Cả hai route khóa User (ID tăng dần, loại trùng) → Facility → Court → Booking → PaymentProof → Refund → slot locks, đọc lại quyền/state/time. Ghi CANCELLED, cancelled_by từ ngữ cảnh route: route cá nhân là CUSTOMER, route owner là OWNER, cancellation_reason, cancelled_at; xóa slot locks, giữ BookingSlot/PaymentProof lịch sử. Nếu cọc APPROVED và hủy CONFIRMED hợp lệ, tạo Refund PENDING bằng 100% deposit snapshot trong cùng transaction; UNIQUE booking_id chống tạo trùng. CONFIRMED thiếu proof APPROVED trả 409 INCONSISTENT_PAYMENT_STATE và rollback, không bỏ qua nghĩa vụ refund. Cọc chưa xác nhận không tạo Refund.

Response 200: `{ data: { booking: { id, status, cancelled_by, cancellation_reason, cancelled_at }, refund: { id, booking_id, amount, status, requested_at } | null }, meta: { server_time } }` (ký hiệu mô tả contract). Booking CANCELLED có refund PENDING nghĩa đã hủy, chưa hoàn tiền. Không gửi tiền qua endpoint này, không đợi refund hoàn tất để nhả slot. Request hủy lần hai trả 409, không ghi đè actor/reason hoặc tạo thêm refund.

### Booking Expiration

Không có public endpoint yêu cầu EXPIRED/gia hạn. Phase1 lazy expiry tại create/detail, chỉ PENDING_PAYMENT với expires_at <= DB time; nhả toàn bộ locks và ghi expired_at nguyên tử, giữ lịch sử. List chỉ đọc/effective status; Availability READ ONLY. Expiry worker, CourtBlock CRUD và notification deferred; PaymentProof upload/read/review đã triển khai. PENDING_CONFIRMATION không bị expiry. Chi tiết transaction/rollback tại BOOKING_SPEC.

## Payment APIs

### POST /payments/bookings/{booking_id}/proof

- Payment Backend Phase1 đã triển khai và kiểm chứng ngày 2026-10-06. Role C ACTIVE sở hữu booking (gồm Approved Owner); session/Origin/X-CSRF-Token bắt buộc. Ngoài quyền/không tồn tại cùng404. Không nhận query; booking_id chuỗi BIGINT dương theo convention hiện tại.
- Multipart/form-data đúng một file field `image`, không text field hoặc file khác. Không amount/status/customer_id/booking status/image URL/storage path. Sai field/body/path422 VALIDATION_ERROR.
- Chỉ image/jpeg, image/png; tối đa5,000,000bytes và25,000,000pixels; tĩnh/một frame. MIME + magic bytes + decode ảnh thật; malformed/multi-frame/pixel vượt giới hạn422 INVALID_IMAGE. Không tin extension/filename/client MIME.
- Lưu file ngoài transaction, rồi khóa chung/Booking và kiểm tra PENDING_PAYMENT, DB now < expires_at. Tạo PaymentProof SUBMITTED và chuyển Booking PENDING_CONFIRMATION trong cùng transaction; không gia hạn.
- Response201 whitelist: `data.proof={id,status,submitted_at}`, `data.booking={id,status,expires_at}`, `meta={server_time}`. ID string, timestamp UTC ISO Z; proof SUBMITTED, booking PENDING_CONFIRMATION. expires_at là mốc cũ, không gia hạn; UI dừng countdown. Không image_path/signed URL/actor/credential.
- 409 BOOKING_EXPIRED nếu hết hạn; 409 PROOF_ALREADY_SUBMITTED nếu đã nhận proof; 409 INVALID_BOOKING_STATE nếu không đúng state; 413 PROOF_TOO_LARGE; 415 INVALID_FILE_TYPE; 422 INVALID_IMAGE; 404 ngoài quyền.
- Upload đang chạy tại mốc hết hạn vẫn bị từ chối. File đã tải nhưng transaction không nhận phải dọn orphan. Không dùng timestamp từ frontend.

`GET /payments/bookings/{booking_id}/proof` (C) trả proof của chính booking Customer: `id`, `booking_id`, `status`, `submitted_at`, `proof_image_url`, `proof_image_expires_at`; URL authenticated có TTL 300 giây. Không có proof hoặc ngoài ownership trả 404; thiếu CUSTOMER capability trả 403. Response không trả `image_path`/storage identifier.

Payment dùng Cloudinary authenticated adapter riêng; upload ngoài transaction, sau đó khóa User IDs tăng dần/deduplicate → Facility → Court → Booking → PaymentProof → slot locks khi cần. Recheck session/ownership/DB time; không chặn chỉ vì Facility SUSPENDED/Court INACTIVE/Owner User LOCKED sau khi tạo booking, Customer vẫn ACTIVE. Duplicate409; hết hạn commit EXPIRED/nhả locks trước trả409 BOOKING_EXPIRED. Storage/config lỗi trả503 theo error envelope, không lộ provider response; mã Payment storage cụ thể thuộc triển khai theo convention IMAGE_STORAGE_NOT_CONFIGURED/IMAGE_STORAGE_UNAVAILABLE hiện có. Cleanup ngoài transaction; COMMIT chưa rõ kiểm tra reference trước destroy.

Frontend `/bookings/:id/payment`: bank/QR snapshot từ Detail, transfer text derive `BOOKING <booking_id>`; QR null dùng fallback. FormData không JSON.stringify/không tự Content-Type, credentials/CSRF giữ nguyên. Chỉ PENDING_PAYMENT còn hạn upload; zero/focus GET đồng bộ, lỗi khóa submit. Không auto retry POST; unknown → GET Detail: PENDING_CONFIRMATION đã nhận, PENDING_PAYMENT còn hạn cho chủ động thử lại, terminal không retry, GET lỗi giữ unknown. HTTP201 về Detail. Xem PAYMENT_SPEC cho privacy/cleanup/race và phạm vi phase.

## Owner APIs

Mọi route O đều truy owner_id từ session và kiểm tra tài nguyên thuộc Owner đó, kể cả child ID. Phản hồi list không lộ dữ liệu Owner khác. Lỗi ngoài sở hữu 404 áp dụng toàn nhóm.

### Facility, Court và cấu hình

| Method / path | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- |
| GET /owner/dashboard | Không | Số Facility/booking cần xử lý của mình | Lỗi chung |
| GET /owner/facilities | status?, phân trang | Cơ sở mọi trạng thái của mình, gồm `court_count` nguyên không âm (tổng Court ACTIVE/INACTIVE hiện có) | 422 status |
| POST /owner/facilities | name, address, district, phone, description?, opening_time, closing_time | 201 Facility DRAFT, owner_id từ phiên | 422 input/giờ chưa hỗ trợ |
| GET /owner/facilities/{id} | Không | Chi tiết quản lý + approval reason | 404 |
| PATCH /owner/facilities/{id} | Các trường thông tin được phép như create | Facility cập nhật; REJECTED → DRAFT | 409 FACILITY_EDIT_NOT_ALLOWED cho PENDING/ACTIVE/SUSPENDED |
| POST /owner/facilities/{id}/images | multipart image, service nối cuối | 201 metadata ảnh | 413/415/422 upload |
| DELETE /owner/facilities/{id}/images/{image_id} | Không | 204 bỏ ảnh liên kết | 404 child ngoài Facility |
| PUT /owner/facilities/{id}/amenities | amenity_ids[] | Tập tiện ích hiện tại | 422 amenity không hoạt động |
| POST /owner/facilities/{id}/submit | Không | Facility PENDING | 409 INVALID_FACILITY_STATE; 422 thiếu hồ sơ |
| GET /owner/facilities/{id}/courts | page?, page_size?, status? | Court ACTIVE/INACTIVE, meta pagination | 404; 422 query |
| GET /owner/courts/{court_id} | Không | 200 Court thuộc Owner, không aggregate | 404 |
| POST /owner/facilities/{id}/courts | name, description? | 201 Court ACTIVE | 409 COURT_NAME_EXISTS |
| PATCH /owner/courts/{court_id} | name?, description?, status? ACTIVE/INACTIVE | Court cập nhật | 409 COURT_NAME_EXISTS; 422 status |
| GET /owner/facilities/{id}/price-rules | Không | Danh sách khoảng giờ/giá | 404 |
| PUT /owner/facilities/{id}/price-rules | rules[{start_time,end_time,hourly_rate}] | Toàn bộ bảng giá thay nguyên tử | 422 PRICE_RULE_OVERLAP/INVALID_PRICE_RULE |
| GET /owner/facilities/{id}/cancellation-policy | Không | cutoff_hours hoặc null | 404 Facility |
| PUT /owner/facilities/{id}/cancellation-policy | cutoff_hours | Policy hiện hành; booking cũ dùng cutoff snapshot, không áp hồi tố | 422 invalid cutoff |
| GET /owner/facilities/{id}/bank-account | Không | Ngân hàng/QR của Facility hoặc null | 404 Facility |
| PUT /owner/facilities/{id}/bank-account | bank_name, account_number, account_holder | Ngân hàng hiện hành | 422 thiếu/sai thông tin |
| POST /owner/facilities/{id}/bank-account/qr | multipart image | qr image metadata | 409 BANK_ACCOUNT_NOT_CONFIGURED; 413/415 |
| DELETE /owner/facilities/{id}/bank-account/qr | Không | 200 safe BankAccount DTO với QR null; giữ object cũ | 404 Facility; 409 PENDING/chưa có BankAccount |

Facility Core Phase 1 không gồm ảnh/amenity; Facility Presentation backend đã hoàn tất riêng. Presentation có ma trận riêng: xem mọi state, chỉ chặn mutation PENDING, không đổi approval metadata. SUSPENDED không sửa hồ sơ để tự mở; config vận hành (Court/price/policy/bank) có thể cập nhật nhưng không khôi phục public status và không thay booking cũ. Submit Phase 1 từ DRAFT chỉ kiểm tra core và Owner ACTIVE; không yêu cầu Court/ảnh/tiện ích/price/policy/bank. Không tự coi ngân hàng là chứng nhận Admin đã xác minh.

### Schedule và CourtBlock

Court Core Phase 1: xem [COURT_SPEC.md](specs/COURT_SPEC.md) cho contract validation, response và ma trận. Create/PATCH chỉ bị khóa khi Facility PENDING: 409 FACILITY_STATE_NOT_EDITABLE. Không thay Facility status/approval metadata. Name trim+NFC 1–100, description string trim max2000, rỗng→NULL, null→422. Create chỉ name/description; PATCH chỉ name/description/status, body rỗng hoặc field khác→422 VALIDATION_ERROR. List page1/page_size20/max100, status ACTIVE/INACTIVE, order created_at DESC/id DESC; meta server_time/page/page_size/total. Response Court gồm id/facility_id/name/description/status/created_at/updated_at. ID string. 401 phiên, 403 capability/Origin/CSRF, 404 ngoài sở hữu, 409 COURT_NAME_EXISTS chỉ cho unique tên trong Facility. Các API schedule/block bên dưới là thiết kế phase sau, chưa triển khai.

| Method / path | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- |
| GET /owner/courts/{court_id}/schedule | from, to | Booking/blocks của Court theo thời gian, thông tin cần vận hành | 422 range |
| POST /owner/courts/{court_id}/blocks | start_at, end_at, reason | 201 CourtBlock | 409 COURT_BLOCK_CONFLICT; 422 range/reason |
| DELETE /owner/courts/{court_id}/blocks/{block_id} | Không | 204 chỉ xóa block đó | 404 child ngoài Court |

Create block khóa User (ID tăng dần, loại trùng) → Facility → Court, dọn hold quá hạn, check overlap booking giữ slot rồi ghi. Không cho khóa đè CONFIRMED/PENDING_CONFIRMATION/PENDING_PAYMENT chưa hết hạn. Delete dùng cùng khóa; block khác vẫn còn hiệu lực.

### Booking và Payment Review

| Method / path | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- |
| GET /owner/bookings | status?, page?, page_size? | Booking cơ sở mình; order created_at DESC/id DESC | 422 filter; ngoài ownership không xuất hiện |
| GET /owner/bookings/{booking_id} | Không | Booking + Customer name/phone + Facility/Court + total/cọc 30%/remaining + proof summary | 404 |
| POST /owner/bookings/{booking_id}/complete | Không; hành động xác nhận đã sử dụng sân và xử lý 70% trực tiếp | Booking COMPLETED, completed_at | 409 INVALID_BOOKING_STATE / BOOKING_NOT_ENDED |
| POST /owner/bookings/{booking_id}/cancel | reason bắt buộc | Booking CANCELLED/cancelled_by=OWNER + Refund PENDING | 422 CANCELLATION_REASON_REQUIRED; 409 INVALID_BOOKING_STATE/INCONSISTENT_PAYMENT_STATE |
| GET /owner/payments | status?, facility_id?, phân trang | PaymentProof cùng booking/customer/amount | 422 enum; 404 filter ngoài quyền |
| GET /owner/payments/{proof_id} | Không | Proof + `proof_image_url`/`proof_image_expires_at` TTL 300 giây + booking/customer/phone/facility/court/date/time/amount | 404 |
| POST /owner/payments/{proof_id}/confirm | Không | proof APPROVED + booking CONFIRMED | 409 INVALID_BOOKING_STATE / INVALID_PROOF_STATE |
| POST /owner/payments/{proof_id}/reject | reason bắt buộc | proof REJECTED + booking REJECTED + reason | 422 REJECTION_REASON_REQUIRED; 409 INVALID_BOOKING_STATE / INVALID_PROOF_STATE |

Confirm/reject chỉ xác nhận cọc 30%, bắt buộc Booking PENDING_CONFIRMATION, Proof SUBMITTED, Owner đúng Facility. Không có API duyệt hoặc upload proof phần 70%. Khóa cùng thứ tự; cập nhật cả hai bản ghi trong một transaction. Confirm giữ locks; reject xóa locks và lưu lý do ở cả proof/booking. Notification chỉ phát khi module đó được triển khai và không phải điều kiện commit. Không gọi gateway/ngân hàng.

Contract Owner Booking + Payment Review được chốt tại `specs/OWNER_BOOKING_PAYMENT_SPEC.md`: list mặc định page 1/page_size 20/max 100, order created_at DESC/id DESC và Phase này chỉ filter `status`. Reject nhận duy nhất `{reason}`, trim 1–500 ký tự. Payment detail authorize ownership trước khi cấp `proof_image_url` có hạn 300 giây và `proof_image_expires_at`; không trả `image_path`/public ID. Notification chưa triển khai nên transition không phụ thuộc notification delivery.

Backend Phase 1 của năm endpoint trên đã triển khai và kiểm chứng ngày 2026-10-06. Owner frontend, GET `/owner/payments` tổng hợp, complete/cancel/refund/notification vẫn ngoài phạm vi.

Complete chỉ từ CONFIRMED khi DB now >= end_at; Owner thao tác sau khi đã sử dụng sân và xử lý 70% tại sân, không gửi proof/remaining_payment_status. Request lần hai trả 409 và trạng thái hiện tại, không ghi đè quyết định lần đầu. Không ADMIN override. Sau reject, Customer dùng POST /bookings để thử lại từ đầu, không endpoint resubmit cho booking cũ.

### Customers, Reviews, Statistics

#### Owner Analytics — Phase 2 backend implemented

Owner Analytics is protected, read-only, and occurrence-based: recurring `BookingSeries` rows are never counted as bookings; their child `Booking` rows are. Implemented endpoints are `GET /api/v1/owner/analytics/overview` and paginated `GET /api/v1/owner/analytics/courts`, with required local `from`/`to`, optional owned `facility_id`, timezone `Asia/Ho_Chi_Minh`, and maximum 366 inclusive days. Court pagination defaults to 1/20, max 100, ordered by occupied slots descending then Court ID ascending. Unknown, repeated, malformed, reversed, or excessive query values return the current 422 validation envelope. Cross-owner Facility filters return 404. Responses contain aggregate whitelists only and never Customer PII, bank/proof/private storage data, or locks.

`confirmed_booking_value` means the snapshot value of current CONFIRMED/COMPLETED occurrences grouped by local `start_at`; it is not actual cash revenue. Known deposit and refunded-deposit metrics remain explicitly separate because the system does not track authoritative receipt of the remaining 70%. Capacity/utilization uses current Facility hours/current ACTIVE Courts and excludes CourtBlock slots, so historical results must be labelled as current-configuration utilization. Full DTO, state semantics, query strategy, and limitations are defined in [OWNER_ANALYTICS_SPEC.md](specs/OWNER_ANALYTICS_SPEC.md).

| Method / path | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- |
| GET /owner/customers | q?, phân trang | Khách có booking tại cơ sở mình, name/phone và số booking liên quan | Lỗi chung |
| GET /owner/customers/{customer_id}/bookings | phân trang | Chỉ booking Customer đó ở cơ sở mình | 404 nếu không có quan hệ |
| GET /owner/reviews | facility_id?, phân trang | Review cơ sở mình, trạng thái moderation | 404 filter ngoài quyền |
| GET /owner/statistics | from, to, facility_id? | Reserved: TODO chỉ số/công thức | 501; 404 filter ngoài quyền |

Không có Owner trả lời review/chat hoặc export nâng cao vì chưa được yêu cầu. Dashboard có thể tổng hợp count cơ bản, statistics chưa coi sum deposit là thu nhập thực thu.

## Refund APIs — theo dõi hoàn cọc thủ công

Refund chỉ tạo bởi transaction hủy đủ điều kiện; không có POST tạo refund tùy ý, không API sửa amount hoặc chuyển tiền. Mỗi booking tối đa một Refund. Role C chỉ dữ liệu booking mình; role O qua Refund → Booking → Court → Facility.owner_id. Admin không upload hoặc xác nhận thay các bên.

| Method / path | Role | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- | --- |
| GET /refunds | C | — | DEFERRED; không triển khai list/Refund Center trong phase Booking Detail | 501 FEATURE_NOT_CONFIGURED nếu route được giữ chỗ |
| GET /refunds/{refund_id} | C sở hữu | Không | Refund detail whitelist + proof URL tạm thời nếu đã submit | 404 RESOURCE_NOT_FOUND |
| POST /refunds/{refund_id}/confirm | C sở hữu | Không | Refund REFUNDED, confirmed_at/refunded_at | 409 INVALID_REFUND_STATE / INCONSISTENT_PAYMENT_STATE |
| GET /owner/refunds | O | — | DEFERRED; không triển khai list/Refund Center trong phase Booking Detail | 501 FEATURE_NOT_CONFIGURED nếu route được giữ chỗ |
| GET /owner/refunds/{refund_id} | O sở hữu | Không | Refund detail whitelist + proof URL tạm thời nếu đã submit | 404 RESOURCE_NOT_FOUND |
| POST /owner/refunds/{refund_id}/proof | O sở hữu | multipart image | Refund PROOF_SUBMITTED và proof metadata/timestamps | 409 INVALID_REFUND_STATE/INCONSISTENT_PAYMENT_STATE; 413 PROOF_TOO_LARGE; 415 INVALID_FILE_TYPE; 422 INVALID_IMAGE |

Refund detail gồm đúng `id`, `booking_id`, `amount`, `status`, `reason`, `requested_at`, `proof_submitted_at`, `refunded_at`, `confirmed_at`, `proof_image_url`, `proof_image_expires_at`; proof URL/expiry là null khi PENDING. Không lộ object path hoặc storage identifier. Booking Detail cung cấp Refund summary; Refund status không thay Booking status.

### Owner upload Refund Proof

Owner đã chuyển khoản hoàn 100% deposit bên ngoài hệ thống rồi gọi upload. Chỉ Refund PENDING, Booking CANCELLED và deposit proof APPROVED. Chỉ nhận một ảnh JPEG/PNG tĩnh tối đa 5.000.000 byte và 25.000.000 decoded pixels; không nhận URL/amount/status từ client.

Lưu object riêng tư ngoài transaction, sau đó khóa chung/Refund, kiểm tra lại quyền và state, ghi proof metadata/proof_submitted_at, chuyển PROOF_SUBMITTED. Response 201 trả Refund summary; chưa REFUNDED và không ghi confirmed_at/refunded_at. Lỗi sau upload dọn orphan file sau kiểm tra DB reference. Gửi lại sau PROOF_SUBMITTED/REFUNDED trả 409, không thay ảnh cũ. Reject/resubmit refund proof ngoài scope.

### Customer xác nhận đã nhận tiền

Customer kiểm tra đã nhận tiền rồi gọi confirm. Chỉ Refund PROOF_SUBMITTED; backend kiểm tra Booking CANCELLED và cọc APPROVED/amount khớp snapshot dưới khóa. Ghi REFUNDED, confirmed_at và refunded_at cùng DB time. Đây là thời điểm hệ thống ghi nhận xác nhận, không tự xác minh giờ chuyển tiền ngân hàng.

PENDING chưa có proof hoặc đã REFUNDED trả 409 INVALID_REFUND_STATE; ngoài quyền 404. Không tự confirm theo thời gian, không Owner/Admin confirm thay Customer. Retry sau mất response phải GET detail trước; không tạo refund/notification hoặc ghi timestamp lần nữa.

### Transaction và giới hạn

Mọi thao tác dùng thứ tự User (ID tăng dần, loại trùng) → Facility → Court → Booking → PaymentProof → Refund → slot locks, bỏ qua hàng không liên quan. Refund submit/confirm không tạo/giữ lại slot; Booking vẫn CANCELLED. Website không xử lý chuyển tiền, không hoàn phần 70%, không có gateway callback.

TODO cách trao đổi tài khoản nhận refund, tranh chấp/ảnh sai và Customer chậm xác nhận; không thêm endpoint hoặc auto-confirm cho tình huống chưa đặc tả. Không bổ sung notification refund ngoài danh sách event hiện có.

## Review, Favorite, Notification APIs

| Method / path | Role | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- | --- |
| POST /reviews | C | booking_id, rating 1..5, comment? | 201 Review VISIBLE | 409 BOOKING_NOT_COMPLETED / REVIEW_ALREADY_EXISTS |
| GET /reviews/mine | C | phân trang | Review của mình, kể cả HIDDEN | Lỗi chung |
| POST /reviews/{review_id}/images | C tác giả | multipart image, sort_order; P3 | 201 review image | 501 khi P3 chưa bật; 413/415; giới hạn số ảnh TODO |
| GET /favorites | C | phân trang | Facility yêu thích, unavailable nếu không còn public | Lỗi chung |
| PUT /favorites/{facility_id} | C | Không | 200 favorite, lặp không thêm trùng | 404 Facility không ACTIVE |
| DELETE /favorites/{facility_id} | C | Không | 204, lặp an toàn | Lỗi chung |
| GET /notifications | U | unread?, phân trang | Thông báo của mình, unread_count | Lỗi chung |
| PATCH /notifications/{id}/read | U người nhận | Không | Notification/read_at | 404 ngoài quyền |
| POST /notifications/read-all | U | Không | Số thông báo đã đổi read_at | Lỗi chung |
| POST /reports | C | Reserved: TODO đối tượng/lý do/quy trình | Sau chốt 201 report | Hiện 501 FEATURE_NOT_CONFIGURED |

Không endpoint cho client tạo notification tùy ý. Các event/recipient nằm trong DATABASE.md. Mark read lặp an toàn. Không tự thêm sửa/xóa review Customer khi chính sách chưa có.

## Admin APIs

Role A; chỉ quản lý trong phạm vi bên dưới, không payment confirm/reject. Admin lấy dữ liệu tối thiểu cần quản trị, không password/session/token.

| Method / path | Request | Response chính | Lỗi chính |
| --- | --- | --- | --- |
| GET /admin/dashboard | Không | Count Customer/Owner/Facility/booking theo status | Lỗi chung |
| GET /admin/users | capability? CUSTOMER/OWNER, status?, q?, phân trang | CUSTOMER gồm Approved Owner; OWNER lọc có OwnerProfile | 422 capability |
| GET /admin/users/{id} | Không | Hồ sơ/trạng thái Customer/Owner | 404 ngoài nhóm quản lý |
| POST /admin/users/{id}/lock | reason | User LOCKED, revoke toàn bộ session | 422 thiếu reason; 403 không quản lý ADMIN |
| POST /admin/users/{id}/unlock | Không | User ACTIVE | 403 không quản lý ADMIN |
| GET /admin/owners | q?, status?, phân trang | users role CUSTOMER có owner_profiles, capabilities=[CUSTOMER,OWNER] | Lỗi chung |
| GET /admin/owner-requests | status?, phân trang | Request và applicant | 422 status |
| GET /admin/owner-requests/{id} | Không | Snapshot hồ sơ, status, reviewer/time/rejection_reason | 404 |
| POST /admin/owner-requests/{id}/approve | Không | 200 request APPROVED + user role=CUSTOMER, capabilities=[CUSTOMER,OWNER] | 409 INVALID_REQUEST_STATE / ALREADY_OWNER; 403 ACCOUNT_LOCKED |
| POST /admin/owner-requests/{id}/reject | rejection_reason bắt buộc | 200 request REJECTED + rejection_reason/reviewed_by/reviewed_at | 422 REJECTION_REASON_REQUIRED; 409 INVALID_REQUEST_STATE |
| GET /admin/facilities | status?, owner_id?, phân trang | Cơ sở mọi trạng thái | 422 filter |
| GET /admin/facilities/{id} | Không | Phase 1: Facility core và Owner id/full_name/email/phone/status; không aggregate module con | 404 |
| POST /admin/facilities/{id}/approve | Không | Facility ACTIVE | 409 INVALID_FACILITY_STATE |
| POST /admin/facilities/{id}/reject | reason | Facility REJECTED + reason | 422 thiếu reason; 409 INVALID_FACILITY_STATE |
| POST /admin/facilities/{id}/suspend | reason | Facility SUSPENDED | 409 INVALID_FACILITY_STATE |
| POST /admin/facilities/{id}/activate | Không | Facility ACTIVE từ SUSPENDED | 409 INVALID_FACILITY_STATE |
| GET /admin/bookings | status?, facility_id?, customer_id?, from?, to?, phân trang | Booking toàn hệ thống | 422 filter |
| GET /admin/bookings/{id} | Không | Booking/amount/status; không URL proof | 404 |
| GET /admin/reviews | status?, phân trang | Review toàn hệ thống | 422 status |
| PATCH /admin/reviews/{id}/visibility | status VISIBLE/HIDDEN, reason | Review/moderation metadata | 501 đến khi chốt moderation; 422 |
| GET /admin/reports | status?, phân trang | Reserved, danh sách report sau chốt | 501 |
| PATCH /admin/reports/{id} | TODO hành động/resolution_note | Reserved | 501 |
| GET /admin/amenities | page mặc định 1; page_size mặc định 20, tối đa 100 | Amenity cả active/inactive, order created_at DESC/id DESC và meta phân trang | 422 query không hợp lệ/không hỗ trợ |
| POST /admin/amenities | exact body `{ name }`; trim + Unicode NFC, 1–100 ký tự | 201 Amenity ACTIVE | 409 AMENITY_NAME_EXISTS; 422 body/name |
| PATCH /admin/amenities/{id} | exact body có `name?`, `is_active?`, ít nhất một field | Amenity cập nhật; rename không đổi ID/assignment | 404; 409 AMENITY_NAME_EXISTS; 422 |
| GET /admin/content | phân trang | Reserved content_pages | 501 đến khi chốt loại nội dung |
| POST /admin/content | slug, title, body, is_published; format TODO | Reserved | 501 |
| PATCH /admin/content/{id} | title?, body?, is_published? | Reserved | 501 |
| GET /admin/statistics | from, to | Reserved chỉ số/công thức TODO | 501 |

Public content nếu được chốt dùng `GET /content/{slug}`, P, chỉ is_published; hiện reserved 501, sau triển khai 404 nếu không public. Không tự tạo nội dung giả.

### Facility Approval

Owner tạo DRAFT → POST submit → PENDING. Submit kiểm tra ownership và hồ sơ tối thiểu; chỉnh sửa REJECTED chuyển DRAFT rồi submit lại. Không tự chuyển ACTIVE khi Owner tạo Court/ngân hàng.

Admin approve/reject chỉ từ PENDING. Transaction khóa Facility, đọc lại status, đổi ACTIVE hoặc REJECTED, ghi reviewed_by/reviewed_at; reject lưu reason không rỗng; ghi notification Owner nếu đã triển khai. Approve không tạo quyền payment. Request đúp trả 409.

Suspend chỉ ACTIVE → SUSPENDED, lưu lý do/thời điểm; activate chỉ SUSPENDED → ACTIVE sau kiểm tra. Không tự hủy booking cũ hoặc thu hồi tiền; Customer liên quan vẫn đọc booking snapshot. Public facility API chỉ trả ACTIVE. Phase 1 chặn PATCH core PENDING/ACTIVE/SUSPENDED. Checklist approve/activate chỉ core hợp lệ và Owner ACTIVE, không yêu cầu module con.

### Owner Request Approval

Admin approve body rỗng; khóa User → request, kiểm tra PENDING, User ACTIVE/role CUSTOMER chưa có OwnerProfile. Đổi APPROVED, ghi reviewed_by/reviewed_at, tạo owner_profiles với approved_request_id, giữ users.role=CUSTOMER và toàn bộ dữ liệu Customer; bổ sung OWNER capability, revoke phiên cũ. Tất cả commit/rollback cùng nhau.

Admin reject body `{ "rejection_reason": "..." }` bắt buộc dài 1–500 ký tự sau trim; cùng khóa, chỉ PENDING → REJECTED, lưu lý do/reviewer/time. Giữ request cũ; Customer có thể POST request mới. Đã kết thúc hoặc approve/reject đồng thời chỉ một quyết định thành công, lần sau 409 INVALID_REQUEST_STATE. Không endpoint reopen/xóa request REJECTED.

Owner approval không tạo hoặc duyệt Facility. Facility approval dùng /admin/facilities/{id}/approve|reject trên Facility PENDING riêng; duyệt một quy trình không đổi trạng thái của quy trình kia.

## Error Handling và Retry

| HTTP | Dùng cho |
| --- | --- |
| 400 | JSON/multipart sai cấu trúc |
| 401 | Không có phiên hợp lệ hoặc sai thông tin login |
| 403 | Sai role, CSRF hoặc tài khoản LOCKED |
| 404 | ID không tồn tại/không sở hữu/không công khai |
| 409 | Xung đột slot/state, trùng dữ liệu nghiệp vụ, policy chưa chốt |
| 413 / 415 | File quá lớn / định dạng không cho phép |
| 422 | Validation, khoảng giờ/rating/reason sai, filter chưa hỗ trợ |
| 429 | Rate limit |
| 500 | Lỗi nội bộ không tiết lộ chi tiết |
| 501 | Contract reserved, feature/quy tắc chưa hoàn thiện |
| 503 | Dịch vụ/cấu hình cần thiết chưa sẵn sàng |

Không retry tự động create/proof/confirm/reject vô hạn. Sau mất response đọc lại tài nguyên theo quyền; chỉ retry khi hiểu kết quả. Hết hạn proof trả BOOKING_EXPIRED; frontend đọc detail rồi refresh lịch. Không cho client đánh dấu EXPIRED/CONFIRMED bằng patch status.

## Liên kết UI và dữ liệu

Public sử dụng facilities/courts/amenities/reviews; Customer dùng auth/users/bookings/payments/refunds/favorites/notifications; Owner dùng owner/* cộng profile/notification cá nhân; Admin dùng admin/* cộng profile/notification cá nhân. Owner/Admin Settings hiện chỉ tái sử dụng profile/change-password và các cấu hình đã mô tả, không có API Settings tổng quát hoặc bảng settings không có nghiệp vụ.

## Authentication giai đoạn 1 — implementation

- Register: chỉ full_name/email/password; tên trim 1–150 ký tự; email trim+lowercase tối đa 254, giữ dấu chấm/+tag; password Unicode 8–128 ký tự, có chữ và số, không trim. Login chỉ email/password cùng validation. Field thừa trả 422 VALIDATION_ERROR.
- Register 201 data.user, không tự login. Login 200 data.user + data.csrf_token và set cookie. GET session trả cùng hai field. User gồm id string, email, full_name, phone, avatar_path, role, capabilities, has_local_password; không hash/Google subject.
- Login sai email/password hoặc Google-only: 401 INVALID_CREDENTIALS. Password đúng nhưng User khóa: 403 ACCOUNT_LOCKED. Thiếu/sai/hết hạn/revoked session hoặc User không ACTIVE: 401 SESSION_EXPIRED.
- Cookie booking_session: HttpOnly, SameSite=Lax, Path=/, không Domain, Secure khi production; expires cố định 7 ngày. Response auth no-store; client dùng credentials: include.
- POST register/login/logout bắt buộc Origin khớp FRONTEND_URL. Logout phiên hợp lệ cần X-CSRF-Token, revoke phiên hiện tại; phiên hết hạn trả 204 và clear cookie sau kiểm tra Origin.
- Register 5/15 phút/IP; login 20/15 phút/IP; sai credentials hoặc ACCOUNT_LOCKED tính vào 5 lần thất bại/15 phút/email normalized. Validation lỗi không tăng email counter. Vượt ngưỡng trả 429 RATE_LIMITED + Retry-After giây; login thành công không xóa counter thất bại. Cửa sổ cố định; request login cùng email tuần tự hóa.
- Error envelope theo API Conventions, request_id do server tạo; JSON sai trả 422, body quá 16 KiB trả 413 PAYLOAD_TOO_LARGE. Không lộ Prisma/SQL/stack.
- `/users/me` read/update tên và phone đã triển khai; Google Login qua backend OAuth đã triển khai, còn đổi email và avatar upload chưa triển khai. Owner Request được triển khai riêng và giữ snapshot tại thời điểm submit.

## Password endpoints — Phase 2 implementation

POST /auth/forgot-password, POST /auth/reset-password và POST /auth/change-password đã có backend; prefix /api/v1. Body/status/error theo contract phía trên. POST đều yêu cầu Origin khớp FRONTEND_URL; change cần session và X-CSRF-Token. Field thừa/sai loại trả 422 VALIDATION_ERROR, password mới dùng policy Phase 1.

Forgot giới hạn 5/15 phút/IP, 3/15 phút/email trim+lowercase; Reset 10/15 phút/IP. Vượt ngưỡng trả 429 RATE_LIMITED với Retry-After. Thiếu RESEND_API_KEY/EMAIL_FROM hoặc cấu hình origin/sender không hợp lệ trả 503 AUTH_EMAIL_UNAVAILABLE đồng nhất trước lookup. Khi cấu hình sẵn sàng: 202 chung cho email tồn tại/không tồn tại/Google-only/LOCKED, không trả token; delivery qua Resend sau commit/response.

Link email dùng fragment /reset-password#token=..., không query. Reset thành công 200 “Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.”; Change 200 “Đã đổi mật khẩu. Vui lòng đăng nhập lại.”; cả hai clear cookie và revoke toàn bộ phiên, không tự login. Google-only change trả 409 PASSWORD_NOT_CONFIGURED.

Forgot trả 202 trước khi lookup tài khoản/xử lý token/email để response không phụ thuộc tài khoản tồn tại hoặc độ trễ provider. Sau response, tác vụ memory tạo token trong transaction; chỉ sau commit mới gửi email. Lỗi tác vụ log mã cố định AUTH_PASSWORD_RESET_REQUEST_FAILED. Process dừng có thể mất tác vụ; không lưu queue/raw token, User cần yêu cầu lại. Missing config vẫn trả 503 trước lookup.

HISTORICAL/SUPERSEDED — Xác minh 2026-09-24: Forgot HTTP 202, Resend ACCEPTED và người dùng xác nhận nhận email development. Token của lần kiểm tra bị lộ đã invalidated, không dùng để Reset. Tại mốc này frontend `/reset-password` chưa triển khai; frontend Auth F1 sau đó đã hoàn tất route này. Contract backend giữ nguyên.

## Owner Request baseline — 2026-09-25

- Reject bắt buộc rejection_reason là string sau trim dài 1–500 ký tự; rỗng/chỉ whitespace/sai loại/quá 500 trả 422. Không thêm field ngoài contract.
- List Customer/Admin: page integer >=1 mặc định 1; page_size integer 1–100 mặc định 20; thứ tự created_at DESC, id DESC. Admin status tùy chọn PENDING/APPROVED/REJECTED.
- Admin bootstrap là CLI nội bộ chủ động, không HTTP, không tự chạy startup/deploy. Nhập họ tên/email và password ẩn; dùng password policy/Argon2id Auth hiện tại. Email trùng bị từ chối, không promote CUSTOMER; tạo ADMIN ACTIVE, không OwnerProfile/request. Không hard-code/log/commit password/hash.
- Approve khóa Applicant User → OwnerRequest, chỉ PENDING và CUSTOMER ACTIVE chưa có profile; tạo profile, ghi reviewer/DB time, revoke toàn bộ phiên applicant cùng transaction; giữ role CUSTOMER. Login lại nhận CUSTOMER + OWNER.
- Reject chỉ PENDING, ghi lý do đã trim/reviewer/DB time, giữ lịch sử, không tạo profile. Request mới được phép sau reject. Không notification delivery hoặc Facility trong phase này.

### Contract Owner Request đã triển khai

Prefix `/api/v1`. Tất cả endpoint yêu cầu session hợp lệ; POST yêu cầu Origin hợp lệ và X-CSRF-Token theo Auth hiện tại. ID trả về dạng chuỗi; thời gian dạng ISO. Không trả password/session token/hash.

| Method / path | Capability | Request | Response |
| --- | --- | --- | --- |
| POST /users/me/owner-requests | CUSTOMER ACTIVE, chưa Owner | Không body hoặc {} | 201, data = request PENDING với snapshot hồ sơ |
| GET /users/me/owner-requests | CUSTOMER, gồm Approved Owner | page, page_size | 200, data = danh sách của mình |
| GET /users/me/owner-requests/:request_id | CUSTOMER, gồm Approved Owner | ID số nguyên dương | 200, data = request của mình |
| GET /admin/owner-requests | ADMIN | page, page_size, status? | 200, data = danh sách, status chỉ PENDING/APPROVED/REJECTED |
| GET /admin/owner-requests/:id | ADMIN | ID số nguyên dương | 200, data = request |
| POST /admin/owner-requests/:id/approve | ADMIN | Không body hoặc {} | 200, data = {request, user: {id, role, capabilities}} |
| POST /admin/owner-requests/:id/reject | ADMIN | {rejection_reason} | 200, data = {request} |

Request gồm id, user_id, status, applicant_name_snapshot, applicant_email_snapshot, applicant_phone_snapshot, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at. Metadata chưa duyệt là null. List có meta.server_time, page, page_size, total; endpoint khác có meta.server_time. List mặc định page=1/page_size=20, tối đa 100, sắp created_at DESC rồi id DESC. Customer list không nhận status filter. Field/query ngoài contract bị từ chối 422.

Lỗi: 401 SESSION_EXPIRED; 403 FORBIDDEN (capability/Origin/CSRF), ACCOUNT_LOCKED khi approve applicant bị khóa; 404 RESOURCE_NOT_FOUND cho ID không tồn tại hoặc không thuộc Customer; 409 REQUEST_ALREADY_PENDING / ALREADY_OWNER / INVALID_REQUEST_STATE; 422 VALIDATION_ERROR hoặc REJECTION_REASON_REQUIRED. Reject chỉ chấp nhận reason 1–500 ký tự Unicode sau trim; ID phải trong phạm vi BIGINT dương.

Approve trả role CUSTOMER và capabilities CUSTOMER + OWNER, nhưng mọi session cũ của applicant đã bị revoke trong transaction; applicant phải đăng nhập lại. Admin không được dùng Customer routes. Notification approval/rejection chưa được gửi trong phase này; Facility không được tạo hay duyệt tự động.

## Facility Core Phase 1 — 2026-09-25

Các quyết định Phase 1 tại [FACILITY_SPEC.md](specs/FACILITY_SPEC.md). Quyết định này thay các TODO trước đó về edit/checklist/validation core: sửa chỉ DRAFT/REJECTED; submit/approve/activate chỉ yêu cầu core hợp lệ, không cần module con. ACTIVE chưa đồng nghĩa booking-ready. Registry district đã được chốt: 94 đơn vị hành chính cấp xã của TP Đà Nẵng (23 phường, 70 xã, 1 đặc khu), theo Nghị quyết 1659/NQ-UBTVQH15 ngày 16/06/2025. `district` là tên field legacy trong API/schema, biểu diễn phường/xã/đặc khu, không biểu diễn quận/huyện. UI sau này dùng nhãn Khu vực hoặc Phường/Xã. Không public search/frontend/module con/notification trong phase này.

### Facility Core Phase 1 — HTTP contract thực tế

Prefix /api/v1. Owner cần session ACTIVE + OWNER, Admin cần ADMIN. POST/PATCH cần Origin và X-CSRF-Token. List trả data array và meta.server_time/page/page_size/total. Detail/mutation trả data Facility core, meta.server_time. ID là string, giờ HH:mm, timestamp ISO; latitude/longitude nullable chỉ đọc. Admin detail thêm owner {id, full_name, email, phone, status}, không password/token/profile nhạy cảm. Không aggregate module con.

| Method / path | Input | Success |
| --- | --- | --- |
| POST /owner/facilities | name,address,district,phone,opening_time,closing_time,description? | 201 DRAFT |
| GET /owner/facilities | status?,page?,page_size? | 200, chỉ của mình |
| GET /owner/facilities/:id | Không | 200 |
| PATCH /owner/facilities/:id | Ít nhất một field create, không nhận null | 200 DRAFT |
| POST /owner/facilities/:id/submit | Không hoặc {} | 200 PENDING |
| GET /admin/facilities | status?,owner_id?,page?,page_size? | 200 |
| GET /admin/facilities/:id | Không | 200 core + owner |
| POST /admin/facilities/:id/approve | Không hoặc {} | 200 ACTIVE |
| POST /admin/facilities/:id/reject | reason string trim 1–500 | 200 REJECTED |
| POST /admin/facilities/:id/suspend | reason string trim 1–500 | 200 SUSPENDED |
| POST /admin/facilities/:id/activate | Không hoặc {} | 200 ACTIVE |

Lỗi: 401 SESSION_EXPIRED; 403 FORBIDDEN; 404 RESOURCE_NOT_FOUND (kể cả ngoài ownership); 422 VALIDATION_ERROR / INVALID_DISTRICT; 409 FACILITY_EDIT_NOT_ALLOWED / INVALID_FACILITY_STATE / FACILITY_OWNER_UNAVAILABLE; 503 DISTRICT_NOT_CONFIGURED. Runtime đã có registry chính thức; district ngoài danh mục trả 422 INVALID_DISTRICT. 503 DISTRICT_NOT_CONFIGURED chỉ là bảo vệ khi cấu hình bị làm rỗng, được inject riêng trong test. Không endpoint public hoặc DELETE Facility trong Phase 1.


## Facility Presentation — quyết định 2026-09-28

Contract mới tại specs/FACILITY_PRESENTATION_SPEC.md: GET Owner images; POST một image, không sort_order/public_id client; PUT images/order nhận image_ids[] toàn bộ; DELETE ảnh; GET/PUT Owner amenities. Admin list/create/update catalog, name trim+NFC, service default active. Backend đã triển khai và real Cloudinary verification PASS ngày 2026-09-29; xem FEATURE_STATUS. Owner view mọi state, mutation chỉ chặn PENDING, không đổi approval metadata. Public API tiếp tục ngoài scope.

## Facility Presentation Phase 1 — Owner catalog và cleanup
GET /api/v1/owner/amenities yêu cầu session/capability OWNER, chỉ ACTIVE, name ASC/id ASC, không pagination, trả data array. Query không hỗ trợ trả 422; 401/403 theo auth. Public GET /amenities vẫn deferred. Contract ảnh/assignment/Admin catalog tại specs/FACILITY_PRESENTATION_SPEC.md; POST image không nhận sort_order/public_id/URL.
Delete trả 204 sau commit xóa metadata/compact; destroy Cloudinary là best-effort, lỗi được log code/public_id để xử lý thủ công, không rollback giả metadata. Không scheduler/reconciliation. Thiếu storage config trả 503 IMAGE_STORAGE_NOT_CONFIGURED; upload provider lỗi trả 503 IMAGE_STORAGE_UNAVAILABLE. Owner GET ảnh rỗng vẫn trả []; các operation cần storage/URL yêu cầu cấu hình hợp lệ.

## Facility Presentation validation/frontend — 2026-10-09

POST ảnh chỉ nhận đúng một multipart field `image`: JPEG/PNG/WebP, tối đa 5.000.000 byte. Backend kiểm tra MIME, magic bytes, Sharp decode toàn bộ và giới hạn 25.000.000 pixel; ảnh lỗi hoặc không hoàn chỉnh trả `422 INVALID_IMAGE`. DTO chỉ trả URL HTTPS và metadata an toàn, không trả `image_path`/public_id. Owner frontend dùng nguyên các endpoint Presentation đã có; không thêm API.

## Booking V2 compatibility overlay (2026-10-15)
Booking DTO detail/create bổ sung `booking_flow_version` (1|2), `confirmation_expires_at` (V1 null, V2 UTC ISO) và `confirmed_by_user_id` nullable. Khi controlled config chọn V2, `POST /bookings` tạo trực tiếp `PENDING_CONFIRMATION` với deadline DB time +30 phút; V1 response/flow giữ nguyên. V2 hết hạn tại `now >= confirmation_expires_at`, được trả/commit `EXPIRED` tại correctness boundary và không còn HELD. PaymentProof endpoints chỉ thuộc V1; frontend payment fail closed/read-only với V2. Owner confirm/reject V2 là phase sau.
## Booking V2 Phase 2 response additions — 2026-10-15

`POST /api/v1/bookings` và `GET /api/v1/bookings/:id` với Booking V2 trả `booking_flow_version=2`, `status=PENDING_CONFIRMATION`, `confirmation_expires_at`, bank/QR snapshots, amounts và `transfer_reference` đúng `CLDN <BOOKING_ID>` cùng `meta.server_time`. Customer ownership vẫn áp dụng; không trả storage identifier. `POST /api/v1/payments/bookings/:booking_id/proof` chỉ dành cho V1 và trả HTTP 409 `PAYMENT_PROOF_NOT_ALLOWED_FOR_BOOKING_FLOW` khi booking là V2, không upload hoặc mutation.

## Booking V2 Phase 3 Owner actions — 2026-10-16
`POST /api/v1/owner/bookings/{booking_id}/confirm` nhận exact body `{}`. `POST /api/v1/owner/bookings/{booking_id}/reject` nhận exact `{ reason }`, trim NFC, 1–500 Unicode code points. Cả hai chỉ dành cho Owner ACTIVE sở hữu Facility và Booking V2 `PENDING_CONFIRMATION` còn hạn; ngoài ownership 404, sai capability 403, sai flow/state hoặc hết hạn 409. Hết hạn được commit `EXPIRED` và nhả locks trước response. Confirm ghi `confirmed_at`, `confirmed_by_user_id` và giữ occupancy; Reject ghi `rejected_at`, `rejection_reason`, nhả locks, giữ slots. Owner list/detail trả `transfer_reference` cho V2 và list đủ dữ liệu quick action trong một query.
