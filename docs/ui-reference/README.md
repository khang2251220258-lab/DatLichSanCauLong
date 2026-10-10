# UI Reference

## Refund workflow — CURRENT/APPROVED, 2026-10-10

| PNG reference | Màn hình/route | Trạng thái |
| --- | --- | --- |
| [owner-booking-refund-desktop.png](owner-booking-refund-desktop.png) | Owner Booking Detail — `/owner/bookings/:booking_id` | Booking `CANCELLED`, PaymentProof `APPROVED`, Refund `PENDING`; CURRENT/APPROVED |
| [customer-booking-refund-desktop.png](customer-booking-refund-desktop.png) | Customer Booking Detail — `/bookings/:booking_id` | Booking `CANCELLED`, PaymentProof `APPROVED`, Refund `PROOF_SUBMITTED`; CURRENT/APPROVED |

Hai reference đã được triển khai cho Refund ngay trong Booking Detail hiện có; không tạo Refund Center hoặc route frontend `/refunds`. Owner ở `PENDING` được chọn một ảnh JPEG/PNG tối đa 5 MB, xem preview và gửi proof. Sau submit, proof immutable và Refund chuyển `PROOF_SUBMITTED`. Customer chỉ có action xác nhận khi Refund `PROOF_SUBMITTED`; `REFUNDED` là terminal và cả hai phía chỉ đọc. Runtime dùng dữ liệu API thật; booking ID, số tiền, thời gian, Facility, Customer/Owner và ảnh trong PNG chỉ là presentation data.

Backend/spec quyết định quyền, state transition và file security: ảnh decode tối đa 25.000.000 pixel, lưu private/authenticated, URL ký có hạn sau authorization, không expose storage identifier. Workflow backend/frontend và automated tests đã hoàn tất ngày 2026-10-10; dữ liệu minh họa trong PNG vẫn chỉ là presentation data.

## Customer CONFIRMED cancellation — CURRENT/APPROVED, 2026-10-10

| PNG reference | Màn hình/route | Trạng thái |
| --- | --- | --- |
| [customer-booking-confirmed-cancellation-desktop.png](customer-booking-confirmed-cancellation-desktop.png) | Customer Booking Detail `CONFIRMED` — `/bookings/:booking_id` | CURRENT/APPROVED |

Reference chốt visual cho Booking đã xác nhận: booking/slot/cost snapshot, PaymentProof đã được Owner xác nhận, chính sách hủy snapshot, deadline hiển thị theo `Asia/Ho_Chi_Minh` và action **Hủy đặt sân** khi server xác nhận còn đủ điều kiện. Mã `BK...`, tên, địa chỉ, số tiền, thời gian, notification, contact/social và deadline trong PNG chỉ là presentation data; runtime phải dùng ID/DTO/server time thật và không hard-code dữ liệu minh họa.

PNG không tự mở rộng backend. Source hiện tại đã triển khai `CONFIRMED → CANCELLED`, đồng thời tạo `Refund PENDING` bằng 100% `deposit_amount` đã được xác nhận và nhả slot trong một transaction. Upload proof và Customer xác nhận Refund chưa được triển khai; reference readiness không đồng nghĩa feature COMPLETE.

## Admin Amenity Catalog — CURRENT/APPROVED, 2026-10-09

| PNG reference | Màn hình/route | Trạng thái |
| --- | --- | --- |
| [admin-amenity-catalog-desktop.png](admin-amenity-catalog-desktop.png) | Danh mục tiện ích Admin — `/admin/amenities` | CURRENT/APPROVED |

Reference thể hiện navigation Admin gồm **Quản lý cơ sở**, **Yêu cầu chủ sân** và **Tiện ích**, trong đó Tiện ích active tại `/admin/amenities`. Một màn hình bao phủ list, pagination, tạo mới, đổi tên, deactivate Amenity `ACTIVE` và reactivate Amenity `INACTIVE`. Không có hard delete, search hoặc status filter. Modal create/edit/activate/deactivate tái sử dụng `AccessibleModal` và shared Admin interaction pattern; không cần PNG riêng.

ID, tên Amenity, trạng thái, ngày tạo, bốn dòng dữ liệu và pagination trang 1/2 trong PNG chỉ là presentation data. Không dùng chúng để suy ra seed, ID thật, `page_size`, tổng record, timestamp, Amenity bắt buộc hoặc business default. Backend/API/source hiện hành tiếp tục là nguồn chuẩn cho validation, ordering, pagination, DTO và lifecycle. Admin Amenity frontend đã được triển khai và kiểm chứng ngày 2026-10-09; trạng thái implementation hiện hành được xác nhận tại `docs/FEATURE_STATUS.md`.

## Owner Request — CURRENT/APPROVED, 2026-10-09

| PNG reference | Màn hình/route | Trạng thái |
| --- | --- | --- |
| [customer-owner-request-desktop.png](customer-owner-request-desktop.png) | `/owner-request` — chưa có request `PENDING`, hiển thị snapshot tài khoản và action gửi yêu cầu | CURRENT/APPROVED |
| [customer-owner-request-pending-desktop.png](customer-owner-request-pending-desktop.png) | `/owner-request` — request `PENDING` và lịch sử | CURRENT/APPROVED |
| [customer-owner-request-approved-desktop.png](customer-owner-request-approved-desktop.png) | `/owner-request` — request `APPROVED`, hướng dẫn đăng nhập lại để nạp Owner capability | CURRENT/APPROVED |
| [admin-owner-request-list-desktop.png](admin-owner-request-list-desktop.png) | `/admin/owner-requests` — list/filter/pagination | CURRENT/APPROVED |
| [admin-owner-request-detail-desktop.png](admin-owner-request-detail-desktop.png) | `/admin/owner-requests/:request_id` — detail và action khi `PENDING` | CURRENT/APPROVED |

Năm ảnh đã được mở và đối chiếu trực tiếp với backend Owner Request hiện hành. PNG quyết định visual hierarchy; API/schema/source quyết định dữ liệu, quyền và state machine. Mã `OR-...`, tên, email, số điện thoại, ngày giờ, notification badge, contact/social và dữ liệu trong ảnh chỉ minh họa, không được hard-code. Runtime dùng `id` dạng string từ API, không tự tạo mã hiển thị mới. `applicant_phone_snapshot` nullable và phải có fallback trung tính.

Customer dùng một route độc lập `/owner-request`, yêu cầu capability `CUSTOMER`; Home CTA dẫn tới route này và không triển khai Profile đầy đủ. Cùng page trình bày create, `PENDING`, latest `REJECTED` có thể tạo request mới, `APPROVED` và history. Backend revoke session applicant khi approve; frontend không hot-update capability, không giữ dữ liệu stale như còn actionable và đưa 401 về auth flow hiện hành.

Owner Request list/detail dùng navigation Admin shared gồm **Quản lý cơ sở**, **Yêu cầu chủ sân** và **Tiện ích**. Chỉ Owner Request `PENDING` có Approve/Reject. Approve dùng confirmation, Reject dùng shared `AccessibleModal` với reason 1–500 ký tự sau trim. `APPROVED`/`REJECTED` chỉ đọc. Không cần PNG modal riêng vì dùng pattern accessible đã có của Admin Facility.

Owner Request frontend đã được triển khai và kiểm chứng ngày 2026-10-09 theo năm reference này. Trạng thái implementation hiện hành tiếp tục được xác nhận tại `docs/FEATURE_STATUS.md`; PNG tự thân không phải bằng chứng feature DONE.

## Admin Facility Approval — APPROVED, 2026-10-07

| PNG reference | Màn hình/trạng thái | Trạng thái |
| --- | --- | --- |
| [admin-facility-list-desktop.png](admin-facility-list-desktop.png) | `/admin/facilities` | APPROVED |
| [admin-facility-active-detail-desktop.png](admin-facility-active-detail-desktop.png) | Detail `ACTIVE` | APPROVED |
| [admin-facility-review-detail-desktop.png](admin-facility-review-detail-desktop.png) | Detail `PENDING` | APPROVED |
| [admin-facility-rejected-detail-desktop.png](admin-facility-rejected-detail-desktop.png) | Detail `REJECTED` | APPROVED |
| [admin-facility-reject-modal-desktop.png](admin-facility-reject-modal-desktop.png) | Modal từ chối; pattern lý do cũng dùng cho suspend | APPROVED |
| [admin-facility-suspended-detail-desktop.png](admin-facility-suspended-detail-desktop.png) | Detail `SUSPENDED` | APPROVED |

Các ID, tên, địa chỉ và thông tin Owner trong PNG chỉ minh họa visual. Runtime dùng Facility core và Owner tối thiểu từ Admin Facility API. Không dựng Court, PriceRule, image, thống kê hoặc module Admin khác từ PNG. Owner Facility tiếp tục dùng ba reference đã duyệt bên dưới; detail bổ sung action submit và thông báo trạng thái theo Facility state machine.

## Owner Facility Management — CURRENT/APPROVED, 2026-10-08

| PNG reference | Màn hình/route dự kiến | Trạng thái |
| --- | --- | --- |
| [owner-facility-list-desktop.png](owner-facility-list-desktop.png) | Cơ sở của tôi — `/owner/facilities` | CURRENT/APPROVED |
| [owner-facility-detail-desktop.png](owner-facility-detail-desktop.png) | Hub chi tiết Facility — `/owner/facilities/:facility_id` | CURRENT/APPROVED |
| [owner-facility-images-amenities-desktop.png](owner-facility-images-amenities-desktop.png) | Hình ảnh & tiện ích của Facility | CURRENT/APPROVED |
| [owner-court-list-desktop.png](owner-court-list-desktop.png) | Quản lý sân của Facility | CURRENT/APPROVED |
| [owner-price-configuration-desktop.png](owner-price-configuration-desktop.png) | Bảng giá của Facility | CURRENT/APPROVED |
| [owner-cancellation-policy-desktop.png](owner-cancellation-policy-desktop.png) | Chính sách hủy của Facility | CURRENT/APPROVED |
| [owner-bank-account-desktop.png](owner-bank-account-desktop.png) | Tài khoản nhận cọc và QR của Facility | CURRENT/APPROVED |

Sidebar Owner cấp cao chỉ gồm **Cơ sở của tôi** và **Đơn đặt sân**. Từ Facility Detail, Owner đi tới sáu khu vực theo đúng Facility đang chọn: Thông tin cơ sở, Hình ảnh & tiện ích, Quản lý sân, Bảng giá, Chính sách hủy và Tài khoản nhận cọc. Không đưa các cấu hình Facility này trở lại sidebar toàn cục.

Ngoại lệ visual đã ghi nhận: sidebar minh họa trong `owner-facility-list-desktop.png` và `owner-booking-list-desktop.png` còn các mục cũ như Tổng quan, Quản lý sân, Thanh toán hoặc Thống kê. Phần sidebar đó đã bị supersede bởi navigation hai mục ở trên; implementation không được khôi phục route/menu cũ từ PNG. Nội dung chính của hai màn hình vẫn là reference hiện hành.

BankAccount thuộc từng Facility, tối đa một tài khoản hiện hành trên mỗi Facility. Tỷ lệ cọc là hằng số nghiệp vụ 30%, chỉ hiển thị giải thích và không có control cho Owner thay đổi. Booking chụp snapshot `bank_name`, `account_number`, `account_holder` và QR tại lúc tạo; thay đổi sau đó không sửa booking cũ. PNG chỉ quyết định visual: QR upload/delete/private delivery chỉ được bật khi backend contract tương ứng đã triển khai và kiểm chứng.

`owner-cancellation-policy-desktop.png` đã được triển khai ngày 2026-10-09 tại `/owner/facilities/:facility_id/cancellation-policy`. Null policy dùng input rỗng và trạng thái chưa thiết lập, không lấy số 24 minh họa làm default. Runtime chấp nhận integer0..168, PENDING chỉ đọc và policy mới chỉ ảnh hưởng snapshot của Booking tạo sau đó. Phase này không bao gồm cancel CONFIRMED hoặc Refund.

Tên Owner, Facility, địa chỉ, district, Court, ảnh, amenity và thông tin ngân hàng trong PNG chỉ là dữ liệu minh họa. Runtime phải dùng API và registry hiện hành; notification badge/link chưa có contract không được giả hoạt động.

### Owner references cũ đang giữ để đối chiếu

Các file sau không còn là reference chính cho navigation Owner mới, chưa xóa trong bước review này:

- `owner-facility-form-desktop.png`: form core cũ vẫn có thể hỗ trợ visual route create/edit, nhưng sidebar/layout không còn là chuẩn hiện hành.
- `owner-court-form-desktop.png`: form Court cũ vẫn có thể hỗ trợ visual create/edit, nhưng sidebar/layout không còn là chuẩn hiện hành.
- `owner-payment-review-desktop.png`: reference lịch sử của detail/review payment đã triển khai; cần reference mới nếu muốn đồng bộ hoàn toàn với sidebar hai mục.

## Owner Booking — CURRENT/APPROVED

[owner-booking-list-desktop.png](owner-booking-list-desktop.png) là reference hiện hành cho `/owner/bookings`. Behavior/security theo [OWNER_BOOKING_PAYMENT_SPEC.md](../specs/OWNER_BOOKING_PAYMENT_SPEC.md); runtime dùng ID, Customer, Facility/Court, tiền và trạng thái từ API. Không dùng mã `BK...`, notification badge hoặc dữ liệu minh họa như dữ liệu thật.

## Payment Phase 1 — implemented, 2026-10-06

`payment-pending-desktop.png` đã mở trực tiếp, đọc được và được dùng cho `/bookings/:id/payment`. Visual triển khai gồm header, mã booking, countdown vàng, bank card hai cột với thao tác copy, upload card JPG/PNG 5 MB và nút Tôi đã chuyển khoản. QR, support/contact/social minh họa không được giả lập. Contract chuẩn tại PAYMENT_SPEC/UI_UX_SPEC; frontend tests 107/107, lint và build PASS.

HISTORICAL/SUPERSEDED — Reference Payment ban đầu dùng bank/deposit snapshot và fallback khi QR null; ở thời điểm đó QR delivery, GET proof và Owner review chưa có. Hiện QR snapshot delivery, Customer GET proof và Owner review đã triển khai; Refund vẫn deferred. PNG chỉ quyết định visual, không tự chứng minh backend support.

## Booking Phase 1 — APPROVED, 2026-10-05

Implementation4/4 references hoàn tất: frontend80/80/lint/build PASS; Edge1440/800/390 không overflow ở cả4 màn hình. Dữ liệu kiểm chứng là HTTP fixture cô lập, không ảnh/dữ liệu mẫu trong runtime; xem FEATURE_STATUS. Booking handoff đã bật, các ghi nhận disabled ở review Detail cũ là lịch sử.

Đã mở trực tiếp cả4 PNG: `booking-confirm-desktop.png` (bước trước POST), `booking-list-desktop.png` (`/bookings`), `booking-detail-desktop.png` và `booking-detail-pending-payment-desktop.png` (`/bookings/:id`, state theo server). Contract mới tại [BOOKING_FRONTEND_SPEC.md](../specs/BOOKING_FRONTEND_SPEC.md).

Ngoại lệ approved: List không ảnh vì DTO không có; ID thật không mã BK tự tạo; tiền runtime từ backend, cọc30%; Confirmation ghi DỰ KIẾN; không notification/contact/social giả. Ghi nhận Pending chưa có Payment là lịch sử của Booking Phase; Payment route nay đã triển khai theo section trên. Selection chỉ React memory, Guest login chọn lại; không sửa PNG hoặc mở rộng sang Owner review/Refund.

## Facility Detail + Availability reference

Implementation đã kiểm chứng ngày2026-10-05: Detail route và Availability frontend READY;44 tests/lint/build PASS, responsive1440/800/390. Xem FEATURE_STATUS cho giới hạn test. Link Detail từ List hiện hoạt động; những mô tả Detail CTA disabled trong phần List review bên dưới là lịch sử. CTA “Tiếp tục đặt sân” trong Detail vẫn disabled và không mutation.

[facility-detail-desktop.png](facility-detail-desktop.png) là PNG đã duyệt cho `/facilities/:facility_id`, được mở trực tiếp trong review. Spec: [FACILITY_DETAIL_FRONTEND_SPEC.md](../specs/FACILITY_DETAIL_FRONTEND_SPEC.md). Dữ liệu mẫu chỉ tham chiếu visual; runtime phải dùng Detail/Availability API thật, không notification/contact/social giả.

Quyết định 2026-10-05: chọn 1–6 slot AVAILABLE liên tiếp cùng Court/ngày và chuẩn bị selection trong memory; không total quote. Giữ visual CTA “Tiếp tục đặt sân” nhưng disabled cùng chú thích bước đặt sân chưa bật, kể cả khi selection hợp lệ. Không gọi POST Booking hoặc tạo route/page giả. Boundary đã READY; chưa implementation hoặc feature DONE.

## Facility List reference — APPROVED

Implementation List hoàn tất ngày2026-10-05: route `/facilities`, tests30/30 gồm Auth regression, lint/build PASS; responsive3/2/1 cột. Chi tiết và giới hạn kiểm chứng tại FEATURE_STATUS. Ghi nhận “chưa implementation” trong phần duyệt PNG dưới đây là trạng thái lúc review; Detail vẫn deferred.

[facility-list-desktop.png](facility-list-desktop.png) đã được mở trực tiếp và đối chiếu với Public Facility backend/Auth frontend. Mapping: `/facilities`. Reference APPROVED cho Facility List Phase 1 với các giới hạn dưới đây; chưa implementation hoặc đánh dấu feature DONE.

- Giữ header, tiêu đề, form tìm kiếm, nền nhạt, grid ba cột desktop, card bo góc, pagination và footer theo PNG. Tái sử dụng Auth Context/API client; guest/auth/loading/error theo foundation hiện có. Tên người dùng lấy từ session, không hard-code “Tuấn”; notification, menu dashboard và link Giới thiệu chưa có đích không được giả hoạt động. Footer không dùng contact/social minh họa làm dữ liệu thật, theo HOME_SPEC.
- Ô Tên sân dùng `q`: trim + Unicode NFC, rỗng bỏ tham số; contains không phân biệt hoa/thường trên Facility name hoặc ACTIVE Court name, không tìm bỏ dấu. Khu vực dùng một `district` từ registry94 canonical theo nguồn generate đã mô tả trong HOME_SPEC; Tất cả khu vực bỏ district. Không thêm date/time/price/rating/amenity filter hoặc sort.
- API `GET /api/v1/facilities` public, chỉ Facility ACTIVE của Owner ACTIVE; `page=1`, `page_size=20` mặc định, max100, order id ASC. Bốn card trong PNG không quy định page_size=4. Pagination dùng meta.page/page_size/total, không hard-code một trang; ranh giới vô hiệu nút trước/sau. URL đồng bộ q/district/page/page_size; đổi bộ lọc về trang1, xóa bộ lọc bỏ q/district và về trang1, Back/Forward phục hồi query. Query sai phải hiện lỗi phù hợp, không ngầm coi bộ lọc chưa hỗ trợ là đã áp dụng.
- Card chỉ cover_image_url, name, district, address, amenities ACTIVE {id,name}; id dùng định danh. Cover null/lỗi dùng placeholder trung tính; amenities rỗng không tự bổ sung. Không rating/review count/giá/số Court/availability badge/popularity. Tên cơ sở, địa chỉ, khu vực, ảnh thể thao và tiện ích mẫu trong PNG chỉ minh họa visual, không hard-code production.
- Loading/error/empty riêng, không lấy lỗi API làm empty; retry do người dùng, không mock data. Không gọi detail từng card để thêm dữ liệu ngoài list DTO.
- “Xem chi tiết” có thể giữ vị trí/visual nhưng phải disabled/non-interactive, kèm thông tin chưa hỗ trợ; không href tới route hỏng hoặc click toàn card. Đích dự kiến `/facilities/:facility_id` là dependency Facility Detail của phase kế tiếp. Không triển khai Detail trong List Phase 1.

Facility List có thể implementation độc lập, không cần sửa backend; Detail chưa có không chặn List với hành vi trên. Người dùng đã chọn làm Facility List trước Home. PNG là chuẩn visual; API/spec là chuẩn dữ liệu/behavior. Không sửa PNG.

## Home reference — specification 2026-10-04

Implementation Home hoàn tất ngày2026-10-05: route `/` theo reference và ngoại lệ approved,53 tests/lint/build PASS; responsive1440/800/390, grid4/2/1 không overflow. Xem FEATURE_STATUS về phạm vi/giới hạn test. Các mô tả chưa implementation trong review bên dưới là lịch sử; không thay PNG hoặc mở rộng Booking.

Review lại ngày2026-10-05 sau khi List/Detail/Availability frontend hoàn tất: reference vẫn READY. Card Home nay được link tới `/facilities/:facility_id`, tìm khu vực tới `/facilities?district=...`; dependency List đã giải quyết. Tái sử dụng PublicLayout/API/Auth và registry generated. Home vẫn chưa implementation. Contract cập nhật tại HOME_SPEC; giữ district-only form theo PNG, q được hỗ trợ ở List, ngày/giờ disabled không gửi filter; không tổng số/rating/giá/availability giả. Không còn decision blocker.

`home-desktop.png` là visual reference được người dùng chỉ định cho `/`; đã mở và đối chiếu trực tiếp. Contract Home Phase 1 tại [HOME_SPEC.md](../specs/HOME_SPEC.md) và [UI_UX_SPEC.md](../UI_UX_SPEC.md). Chưa implementation Home.

Giữ layout/màu/card/hierarchy theo PNG; ngoại lệ đã chốt: header theo session, không notification/menu giả; hero trung tính; bỏ thống kê giả; ngày/giờ disabled có giải thích; section cơ sở chỉ list DTO thật, không rating/giá/số sân/availability badge; khu vực dùng registry94 đơn vị cấp xã thay quận/huyện cũ; CTA Owner không tự gửi request; footer không contact/social giả. Ghi nhận Booking/Payment frontend chưa có là lịch sử tại lúc duyệt Home; các đích frontend chưa tồn tại vẫn không được giả lập.

PNG không chứng minh feature/dữ liệu đã sẵn sàng. Không sửa ảnh trong bước cập nhật specification.

Thư mục này chứa các ảnh PNG tham chiếu từ Figma Make.

## Approved visual references

Sáu PNG dưới đây đã được người dùng duyệt và có trong thư mục này:

| PNG reference | Route | Trạng thái |
| --- | --- | --- |
| [auth-login-desktop.png](auth-login-desktop.png) | `/login` | APPROVED |
| [auth-register-desktop.png](auth-register-desktop.png) | `/register` | APPROVED |
| [auth-forgot-password-desktop.png](auth-forgot-password-desktop.png) | `/forgot-password` — form | APPROVED |
| [auth-forgot-password-sent-desktop.png](auth-forgot-password-sent-desktop.png) | `/forgot-password` — sent state | APPROVED |
| [auth-reset-password-desktop.png](auth-reset-password-desktop.png) | `/reset-password` — form | APPROVED |
| [auth-reset-password-success-desktop.png](auth-reset-password-success-desktop.png) | `/reset-password` — success state | APPROVED |
| [customer-payment-pending-desktop.png](customer-payment-pending-desktop.png) | `/bookings/:id/payment` — PENDING_PAYMENT | APPROVED |
| [customer-payment-proof-submitted-desktop.png](customer-payment-proof-submitted-desktop.png) | `/bookings/:id/payment` — proof submitted | APPROVED |

Lưu ý cho implementation sau:

- PNG quyết định visual; backend/spec quyết định behavior và validation. Không tự redesign.
- Password phải theo `docs/specs/AUTH_SPEC.md` và backend hiện tại, không theo placeholder “Ít nhất 6 ký tự” trong PNG.
- Google Login xuất hiện trong reference nhưng backend chưa hỗ trợ; không được coi là feature đã sẵn sàng.
- Auth F1 đã chốt: Register chỉ full_name/email/password, bỏ phone; Google ẩn ở Login/Register. Không auto-login sau Register; về /login kèm thông báo. Login thành công về /.
- Forgot Sent dùng thông báo có điều kiện theo backend, không khẳng định delivery hoặc phản ánh tồn tại tài khoản. Reset confirm password chỉ validation frontend. Hai màn hình success là state, không route riêng.
- Font system-ui; branding icon + “Cầu Lông ĐN” gần PNG, không cần asset mới. Responsive hợp lý; loading/error inline, không alert và chống submit lặp.


## Quy tắc

1. PNG trong thư mục này là source of truth cho visual của frontend: layout, màu sắc, typography, spacing, component appearance và visual hierarchy.
2. Business behavior và dữ liệu phải theo `docs/API_SPEC.md`, `docs/specs/` và backend implementation hiện tại.
3. Không tự redesign màn hình khi đã có PNG reference.
4. Không tự thêm PNG hoặc tự tạo thiết kế thay thế.
5. Không được suy ra rằng một feature đã được backend hỗ trợ chỉ vì nó xuất hiện trong PNG.
6. Trước khi triển khai một frontend page/feature, phải xác định PNG reference tương ứng, đối chiếu PNG với API/spec hiện tại và báo conflict nếu visual yêu cầu feature backend chưa hỗ trợ.
7. Chỉ những PNG đã được người dùng duyệt mới được dùng làm reference chính thức.

## Naming convention

`<feature>-<screen>-<viewport>.png`

Ví dụ:

- `home-main-desktop.png`
- `auth-login-desktop.png`
- `auth-register-desktop.png`
- `facility-list-desktop.png`
- `facility-detail-desktop.png`
- `availability-desktop.png`

Có thể bổ sung biến thể `-mobile` hoặc `-tablet` khi có reference tương ứng.

## Owner Facility Images & Amenities implementation

Reference `owner-facility-images-amenities-desktop.png` đã được triển khai ngày 2026-10-09 cho `/owner/facilities/:facility_id/images-amenities`. Runtime dùng Owner Presentation API và dữ liệu backend thật; nội dung minh họa trong PNG không được hard-code.
