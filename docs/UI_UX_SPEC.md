# UI/UX Specification

## Refund Booking Detail — implemented 2026-10-10

Hai reference hiện hành là `owner-booking-refund-desktop.png` tại `/owner/bookings/:booking_id` và `customer-booking-refund-desktop.png` tại `/bookings/:booking_id`. Refund nằm trong Booking Detail; không có Refund Center hoặc route frontend riêng.

- Owner: `PENDING` hiển thị amount, chọn JPEG/PNG ≤5 MB, preview và submit; `PROOF_SUBMITTED/REFUNDED` chỉ đọc, không replace/delete/resubmit.
- Customer: `PENDING` chỉ hiển thị chờ hoàn tiền; `PROOF_SUBMITTED` hiển thị URL proof tạm, submitted timestamp và modal accessible xác nhận đã nhận tiền; `REFUNDED` chỉ đọc và giữ proof/timestamps.
- Booking badge vẫn `CANCELLED`; Refund dùng badge riêng. Không countdown, không tự chuyển state ở frontend và không tính lại amount.
- 409 hoặc kết quả mutation chưa rõ phải refetch Booking/Refund trước retry. Response 2xx sai whitelist/state combination phải fail closed.
- Desktop bám PNG; tablet/mobile giữ hierarchy, proof không tràn viewport, file input và action dùng keyboard/focus/error association theo shared patterns.

## Owner Cancellation Policy — implemented 2026-10-09

Route `/owner/facilities/:facility_id/cancellation-policy` đã triển khai theo PNG CURRENT/APPROVED: breadcrumb, Facility name/address/status, hub sáu mục, content card, input cutoff và action lưu. Null policy hiển thị chưa thiết lập với input rỗng, không default hoặc auto-PUT; integer0..168, `0` hợp lệ. Facility PENDING chỉ đọc; 409 refetch Facility + policy. Exact response validation fail closed và UI responsive theo Owner breakpoints hiện hành.

Kiểm chứng targeted24/24, frontend236/236, lint/build PASS. Phase này không triển khai cancel CONFIRMED hoặc Refund và không đổi snapshot Booking cũ.

## Customer Payment Phase C — implemented 2026-10-08

`PENDING_CONFIRMATION` trên `/bookings/:booking_id/payment` bám reference `customer-payment-proof-submitted-desktop.png`: badge chờ xác nhận, booking/slot/cost snapshot và card “Đã gửi minh chứng”. Frontend GET Customer Proof sau mỗi lần mở trang để hiển thị URL ảnh riêng tư, `submitted_at`, deposit snapshot, ngân hàng snapshot và nội dung `BOOKING <id>`. Không có countdown, cancel, file picker, replace/delete hoặc submit lại.

URL proof được xem là tạm thời: frontend theo dõi `proof_image_expires_at` dựa trên `meta.server_time`; lỗi ảnh chỉ tự lấy URL mới một lần trong một failure cycle, sau đó hiển thị fallback và nút “Tải lại”. Response sai shape, URL không HTTPS, field storage ngoài whitelist hoặc `booking_id` không khớp đều fail-safe và không render ảnh. Booking focus refresh là authority để chuyển sang presentation `CONFIRMED`, `REJECTED`, `EXPIRED` hoặc `CANCELLED`; tất cả state này read-only và không có payment mutation.

## Customer Payment Phase B — implemented 2026-10-08

`/bookings/:booking_id/payment` đã hoàn thiện màn hình `PENDING_PAYMENT` theo reference approved. Hai cột desktop hiển thị dữ liệu Booking snapshot thật: cơ sở/sân/khung giờ, tổng tiền, cọc 30%, còn lại, thời hạn, ngân hàng và nội dung `BOOKING <id>`. QR chỉ render từ `qr_image_url` HTTPS đã được response validator chấp nhận; `null` dùng fallback rõ ràng, không tạo QR giả.

Customer chọn một JPEG/PNG hợp lệ để xem preview cục bộ, có thể thay hoặc xóa; object URL được thu hồi khi thay/xóa/unmount và không lưu browser storage. Submit proof, cancel modal và các nút copy có trạng thái focus/disabled rõ. Background refresh không xóa snapshot đã xác minh, nhưng lỗi đồng bộ, unknown result, hết hạn hoặc trạng thái khác `PENDING_PAYMENT` vẫn chặn mutation. Sau proof/cancel thành công, frontend GET Booking Detail và chỉ điều hướng theo trạng thái server. `PENDING_CONFIRMATION` không countdown và không cancel; màn hình submitted chuyên biệt tiếp tục Phase C.

## Stabilization Phase 4 — 2026-10-07

Frontend hiện có Auth, Home, Facility List/Detail, Availability, Customer Booking/Payment, Owner Booking review, Owner Facility/Court/Pricing/Bank Account + QR/Cancellation Policy/Images + Amenities và Admin Facility approval. Nhãn trạng thái Booking/Facility dùng nguồn theo domain; modal mutation dùng `AccessibleModal`; Auth/API/Owner layout và formatter hiện có tiếp tục dùng chung. Owner Request và các module deferred chưa được giả lập bằng UI. Bộ Owner Facility reference hiện hành gồm bảy PNG được đăng ký trong `docs/ui-reference/README.md`.

## Stabilization Phase 3 — 2026-10-07

Các modal mutation hiện có dùng một primitive nhỏ thống nhất: `role="dialog"`, `aria-modal`, tên/diễn giải truy cập được, focus ban đầu, focus trap, Escape/backdrop chỉ đóng trước khi mutation bắt đầu, khóa cuộn trang nền và trả focus về trigger khi đóng. Trong lúc mutation đang chạy, modal không cho đóng để tránh trạng thái kết quả không xác định; business mutation và API contract giữ nguyên.

Ở viewport dưới 900px, bảng Owner Booking, Owner Facility, Owner Court và Admin Facility chuyển từng hàng thành card có nhãn trường; desktop tiếp tục dùng bảng theo PNG đã duyệt. Owner sidebar chuyển thành navigation ngang ở tablet/mobile, form xếp một cột ở màn hình hẹp, PriceRule không tràn và action giữ vùng bấm rõ. Header mobile xếp khu vực tài khoản và navigation thành các hàng có thể wrap, không dùng overflow toàn trang để che lỗi. Nội dung dài dùng wrap tại chính phần tử chứa.

Các trạng thái loading/error/empty và `INVALID_RESPONSE` từ Phase 2 giữ nguyên ngữ nghĩa. Phase này chỉ polish UI đã triển khai, không thêm action, field, API hay business flow.

## Stabilization Phase 2 — 2026-10-07

- Success response sai shape bắt buộc được hiển thị như lỗi tải dữ liệu có thể retry; không được biến `data: null`, object thay cho array hoặc nested collection sai thành empty state hay làm crash React tree.
- Guest bị guard từ protected route được chuyển tới Login với destination trong Router state. Sau login chỉ restore path nội bộ bắt đầu bằng `/`; URL ngoài, protocol-relative, scheme khác hoặc path chứa backslash đều fallback `/`. Capability guard tại destination vẫn quyết định quyền truy cập và destination không lưu trong browser storage.
- Auth guard chờ session bootstrap. Authenticated User vào `/login`, `/register` hoặc `/forgot-password` được chuyển về safe destination hoặc `/`. `/reset-password` không dùng GuestOnly vì token reset là luồng độc lập; token fragment và các quy tắc bảo mật hiện có được giữ nguyên.

## Stabilization Phase 1 — 2026-10-07

- Với Facility `PENDING`, màn hình Court và Pricing của Owner vẫn hiển thị dữ liệu hiện có nhưng khóa toàn bộ control mutation; direct route create/edit Court cũng dừng ở thông báo trạng thái. Các Facility state khác tiếp tục theo backend contract hiện hành.
- Facility form validate tại client cùng giới hạn backend cho name/address/district/phone/opening/closing/description, gồm giờ theo bước 30 phút và `opening_time < closing_time`; backend vẫn validate lại. Lỗi xác định được hiển thị cạnh field, lỗi 422 không có field metadata dùng thông báo form chung và không đoán field.
- Owner/Admin Facility Detail chỉ hiển thị panel lý do tạm ngưng khi server trả Facility `SUSPENDED` cùng `suspension_reason`.
- Home chỉ mô tả luồng và chức năng đã có; Owner có capability được dẫn tới `/owner/facilities`. CTA Owner Request dẫn tới `/owner-request` thật; không gửi request ngầm.

## Facility Approval Frontend Phase 1 — 2026-10-07

- Owner Facility Detail dùng reference Owner đã duyệt: `DRAFT` có action **Gửi duyệt** qua bước xác nhận; `PENDING` chỉ đọc core và hiển thị đang chờ duyệt; `REJECTED` hiển thị lý do và cho đi đến Edit. Frontend không tự chuyển trạng thái, luôn refetch sau mutation.
- Admin dùng hai route `/admin/facilities` và `/admin/facilities/:facility_id`, chỉ cho capability `ADMIN`. List có status filter, pagination và bốn state loading/error/empty/data. Detail chỉ hiển thị Facility core cùng Owner tối thiểu từ DTO.
- Action theo server state: `PENDING` approve/reject; `ACTIVE` suspend; `SUSPENDED` activate; `DRAFT` và `REJECTED` chỉ đọc. Reject/suspend dùng reason trim 1–500; approve/activate có confirmation. Mutation không optimistic, chống submit lặp và refetch khi 409 hoặc kết quả không xác định.
- Visual theo sáu Admin Facility PNG approved trong `docs/ui-reference/`. Desktop dùng bảng/detail hai cột; tablet xếp detail một cột và cho bảng cuộn trong vùng chứa; mobile xếp card/form/modal một cột, không thêm Admin Dashboard hoặc module ngoài scope.
- Header hiển thị entry **Quản lý cơ sở** tới `/admin/facilities` chỉ khi session có capability `ADMIN`; link giữ active state ở cả list và detail. Customer/Owner không có `ADMIN` không thấy entry này, các navigation theo capability khác được giữ nguyên.

## Owner Facility navigation và references hiện hành — 2026-10-08

Sidebar Owner cấp cao chỉ tập trung vào **Cơ sở của tôi** và **Đơn đặt sân**. Các cấu hình thuộc một Facility không phải menu Owner toàn cục. Facility Detail là hub điều hướng đến: Thông tin cơ sở, Hình ảnh & tiện ích, Quản lý sân, Bảng giá, Chính sách hủy và Tài khoản nhận cọc. Mỗi màn hình phải giữ rõ Facility đang thao tác; cross-owner vẫn trả 404 từ backend.

Sidebar cũ còn xuất hiện trong `owner-facility-list-desktop.png` và `owner-booking-list-desktop.png` chỉ là phần visual lịch sử và không còn quyết định navigation. Nội dung chính của hai PNG vẫn được dùng; sidebar implementation phải theo quy tắc hai mục cấp cao.

Bảy reference CURRENT/APPROVED là `owner-facility-list-desktop.png`, `owner-facility-detail-desktop.png`, `owner-facility-images-amenities-desktop.png`, `owner-court-list-desktop.png`, `owner-price-configuration-desktop.png`, `owner-cancellation-policy-desktop.png` và `owner-bank-account-desktop.png`. `owner-booking-list-desktop.png` tiếp tục là reference hiện hành cho danh sách booking Owner. PNG quyết định visual; API/spec/source quyết định feature đã sẵn sàng, validation, state, ownership và security.

Tài khoản nhận cọc là singleton theo Facility, không phải cấu hình Owner toàn cục. Cọc cố định 30% và Owner không được chỉnh tỷ lệ. Booking cũ luôn dùng bank/QR snapshot tại thời điểm tạo. Route `/owner/facilities/:facility_id/bank-account` đã có text form, QR empty/current preview, upload/replace/delete, PENDING read-only và refresh signed URL; frontend không nhận storage identifier.

## Owner Facility + Court Frontend Phase 1 — implemented 2026-10-07

Tám route `/owner/facilities`, create/detail/edit, Court list/create/edit và Facility pricing đã được triển khai theo bộ reference trước ngày 2026-10-08. Source hiện cần được đối chiếu lại với hub Facility và sidebar mới ở phase implementation sau; trạng thái feature đã chạy không bị hạ chỉ vì visual reference được thay. Facility core form chỉ có name/address/district/phone/opening/closing/description; edit chỉ DRAFT/REJECTED. Court không delete hoặc chuyển Facility; edit hỗ trợ ACTIVE/INACTIVE. Pricing là replace-all cấp Facility, không Court/day-of-week/overnight. Loading/error/empty, status tiếng Việt, responsive desktop/tablet/mobile và OWNER guard được áp dụng; backend vẫn là authority cho ownership, state và validation.

## Pre-demo status và navigation cleanup — 2026-10-07

Customer Booking Detail dùng nhãn/thông điệp tiếng Việt theo trạng thái thật: chờ Owner xác nhận sau khi gửi proof, đã xác nhận và còn 70% thanh toán tại sân, bị từ chối không resubmit, đã hủy, đã hết hạn hoặc đã hoàn thành. Không còn placeholder Payment deferred; countdown và CTA thanh toán chỉ áp dụng `PENDING_PAYMENT`.

Owner Booking/Payment hiển thị nhãn thân thiện cho cả BookingStatus và PaymentProofStatus, không render raw enum. Approved Owner vẫn có toàn bộ Customer navigation và có thêm liên kết `Quản lý đặt sân` tới `/owner/bookings`; guest/Customer không thấy liên kết Owner này.

## Payment Frontend Phase 1 — implemented 2026-10-06

`/bookings/:id/payment` dùng reference pending đã duyệt và Booking Detail làm entry khi booking thực tế là `PENDING_PAYMENT` còn hạn. UI hiển thị bank/deposit/QR snapshot, nội dung `BOOKING <id>`, countdown theo server-time, JPEG/PNG tối đa 5.000.000 bytes và submit multipart một lần. QR null dùng fallback; URL private phải qua response validator. HTTP 201 `PENDING_CONFIRMATION` trở về Detail; lỗi network/5xx phải GET Detail để xác định kết quả trước retry.

## Payment Phase 1 — spec approved, chưa implementation

Reference `ui-reference/payment-pending-desktop.png` đã mở và đọc được. `/bookings/:id/payment` dùng CUSTOMER guard/session và ownership qua Detail; chỉ PENDING_PAYMENT còn hạn có form. State khác về Detail; không tồn tại/ngoài quyền404. Countdown expires_at/server_time + elapsed monotonic, zero/focus GET. Background focus refresh không làm mất snapshot đã xác minh; lỗi sync/unknown khóa submit, không local EXPIRED. PENDING_CONFIRMATION không countdown/auto-expire/cancel.

Bank/name/account/amount/QR dùng snapshot Detail, nội dung `BOOKING <booking_id>` frontend derive; không mã BK. QR null dùng fallback “QR thanh toán chưa khả dụng. Vui lòng chuyển khoản bằng thông tin bên cạnh.” Không support phone/contact/social/notification mẫu. Giữ layout/card/màu theo PNG; mobile/tablet wrap/xếp dọc, tái sử dụng Header/Footer/Auth/API.

Chọn một JPEG/PNG <=5,000,000bytes, <=25,000,000pixels, ảnh tĩnh; frontend hỗ trợ kiểm tra/preview, backend validate đầy đủ. Idle/selected/uploading/loading/error/expired/success/unknown riêng; nút thiếu file/đang gửi/chưa xác minh state bị disabled. FormData không JSON.stringify hoặc tự Content-Type; credentials/CSRF giữ nguyên. Không auto retry POST. Unknown GET Detail: PENDING_CONFIRMATION đã nhận, PENDING_PAYMENT còn hạn chỉ chủ động thử lại sau sync, terminal không retry, GET lỗi khóa submit.201 về Detail “Chờ chủ sân xác nhận”. HISTORICAL/SUPERSEDED — tại phase UI này GET proof/Owner review/Refund còn ngoài scope. Hiện Customer GET proof, Owner review và Refund workflow đã triển khai.

## Booking Frontend Phase 1 — quyết định mới 2026-10-05

Đã implementation và kiểm chứng:80/80 frontend tests, lint/build PASS;4 màn hình desktop/tablet/mobile không overflow. Xem FEATURE_STATUS cho phạm vi và giới hạn fixture test. Booking frontend Phase1 READY, Payment vẫn deferred.

Theo [BOOKING_FRONTEND_SPEC.md](specs/BOOKING_FRONTEND_SPEC.md): selection React memory → Confirmation trước POST → `/bookings/:id`; `/bookings` phục hồi lịch cá nhân. Guest đăng nhập rồi chọn lại, không restore/auto-POST. Confirmation hiển thị giá dự kiến, sau create dùng snapshot. Countdown server-time chỉ PENDING_PAYMENT, zero/focus GET đồng bộ; lỗi không tự EXPIRED. Không Payment. Quyết định này thay boundary CTA disabled/no total quote của Detail phase cũ tại bước Confirmation; các ghi nhận cũ bên dưới là lịch sử.

## Home Phase 1 — implementation 2026-10-05

`/` đã thay scaffold bằng Home theo PNG và các ngoại lệ approved. Shared PublicLayout/Auth/API/FacilityCard/registry generated; active navigation theo route, Home card4/2/1 cột, district tới List và card tới Detail. Static copy không số liệu/feature giả, Owner CTA không gửi request, ngày/giờ disabled có giải thích. Tests53/53/lint/build PASS; xem FEATURE_STATUS. Những ghi nhận Home chưa triển khai trong phần review cũ là lịch sử, Booking frontend vẫn chưa có.

## Facility Detail + Availability — implementation 2026-10-05

Route `/facilities/:facility_id` đã có frontend, link Xem chi tiết từ List đã bật. Gallery/core public/amenities/Courts/giá/policy lấy backend; Court/date điều khiển GET Availability. 1–6 slot AVAILABLE liên tiếp được chọn trong memory, CTA Booking vẫn disabled và có chú thích. Không total quote hoặc mutation Booking. Header/Footer chia sẻ qua PublicLayout, không duplicate Auth. Tests44/44, lint/build và responsive kiểm chứng theo FEATURE_STATUS. Ghi nhận chưa triển khai Detail/Availability ở các phần review cũ bên dưới là lịch sử; Home/Booking frontend vẫn deferred.

## Facility Detail + Availability — quyết định 2026-10-05

Spec frontend tại [FACILITY_DETAIL_FRONTEND_SPEC.md](specs/FACILITY_DETAIL_FRONTEND_SPEC.md), visual `ui-reference/facility-detail-desktop.png`. Chưa implementation. Chỉ đọc Detail/Availability và chuẩn bị selection memory `{court_id,start_at,end_at}` từ 1–6 slot AVAILABLE liên tiếp cùng Court/ngày. Không tự tính total quote. CTA “Tiếp tục đặt sân” disabled trong phase này kể cả selection hợp lệ, có chú thích bước đặt sân chưa bật; không POST Booking, không mutation, không Booking route/page giả. Handoff thực sự deferred sang phase sau. Quyết định này gỡ blocker trong review; không đổi backend/business rules hoặc FEATURE_STATUS thành DONE.

## Facility List frontend — triển khai 2026-10-05

`/facilities` đã triển khai theo facility-list-desktop.png và ngoại lệ được duyệt trong ui-reference/README.md. Search q/district, pagination và URL state; header dùng Auth Context, card chỉ list DTO. Registry frontend sinh từ canonical backend trước dev/test/build. Grid desktop3/tablet2/mobile1; loading/error/empty và cover fallback riêng. Detail CTA disabled với giải thích, route Detail chưa có. Không Home/Availability/Booking UI. Kết quả test và giới hạn tại FEATURE_STATUS; các ghi nhận chưa có List trước ngày này là lịch sử.

## Home Frontend Phase 1 — specification 2026-10-04

Contract chi tiết: [HOME_SPEC.md](specs/HOME_SPEC.md). Visual chính thức: [home-desktop.png](ui-reference/home-desktop.png), route `/`. Chưa implementation; không đánh dấu DONE. Các bảng màn hình tổng thể bên dưới là roadmap, không mở rộng phạm vi Home Phase 1.

- Header guest/auth theo session thật; login về `/`, authenticated dùng tên/initial và Logout. Loading/error không giả guest; không notification/dashboard/menu giả.
- Hero giữ visual nhưng bỏ claim số 1 và số liệu chưa xác minh. Bỏ dải thống kê; điều chỉnh khoảng cách tối thiểu.
- Form chỉ dùng district. Ngày/Giờ disabled và giải thích rõ chưa hỗ trợ lọc; không gọi Availability. Tất cả khu vực bỏ query district.
- Section “Sân cầu lông” đọc GET /api/v1/facilities?page=1&page_size=4; chỉ list DTO, loading/error/empty, không rating/giá/số Court/Còn sân. Card đến `/facilities/:facility_id` đã triển khai.
- Nguồn khu vực frontend được generate lúc dev/build từ supportedDistricts canonical trong backend/src/modules/facilities/districts.js; không sửa backend hoặc sao chép tay. Dropdown đủ94, section lấy sáu entry đầu, không số cơ sở/khu vực.
- Tìm sân/Xem tất cả/khu vực đến `/facilities` với district URL-encode khi có; route đã triển khai. List hỗ trợ q/district; Home theo PNG vẫn chỉ input district, tìm tên q ở List, không thêm filter ngày/giờ.
- CTA Owner: guest về Login; Customer chưa Owner thấy chưa hỗ trợ gửi yêu cầu, không mutation; Owner thấy thông tin quyền hiện có, dashboard deferred; Admin không đăng ký Owner. Nội dung hướng dẫn đặt sân được ghi rõ quy trình dự kiến, không quảng cáo UI chưa có.
- Footer không liên hệ/social/link giả. Giữ visual desktop và responsive hợp lý theo HOME_SPEC, không redesign.

Review lại ngày2026-10-05: List/Detail đã có nên Home implementation READY, không decision blocker hoặc backend change. Tái sử dụng PublicLayout Header/Footer, API client/Auth Context và registry generated; Header cần active state theo route khi implementation. Card có thể tách từ List dùng chung; Home grid4/2/1 theo PNG, không đổi List grid3/2/1. Home vẫn chưa implementation; không thay FEATURE_STATUS trong review.

Booking Configuration contract tại [BOOKING_CONFIGURATION_SPEC.md](specs/BOOKING_CONFIGURATION_SPEC.md). Owner UI đã có GET/PUT bảng giá toàn bộ (max48, tập rỗng hợp lệ), bank text + private QR POST/DELETE và Cancellation Policy integer 0..168; policy null không có default, giá trị 0 hợp lệ. GET thiếu config trả []/null. PENDING khóa mutation, state khác cho phép; xử lý 409 và refresh state authoritative.

Contract cho màn hình Courts tương lai: xem [COURT_SPEC.md](specs/COURT_SPEC.md). Owner xem được Court ở mọi Facility state; PENDING khóa thêm/sửa, các state khác cho phép. List page1/page_size20/max100, lọc ACTIVE/INACTIVE; detail có GET riêng. Form name trim+NFC 1–100, description string max2000, chuỗi rỗng xóa mô tả. Không nút delete/chuyển Facility hoặc Admin Court management trong Phase 1. Đây là documentation backend contract, frontend Courts chưa triển khai; không thay Figma.

## Design System và Figma

UI đã có thiết kế Figma; tài liệu này mô tả hành vi/dữ liệu, **không thay thế hoặc tự redesign Figma**. TODO cung cấp link/file Figma, phiên bản, mapping frame và design tokens trước khi hiện thực UI. Chưa chọn màu, font, khoảng cách, icon hoặc layout chi tiết nếu chưa đọc thiết kế.

Tất cả nhãn, nút, thông báo và nội dung UI bằng tiếng Việt; enum và API vẫn tiếng Anh. Hiển thị VND theo định dạng Việt Nam, giờ Đà Nẵng (Asia/Ho_Chi_Minh); không đưa UTC thô cho người dùng. Form có label, lỗi ngay cạnh trường, focus/keyboard hợp lý và badge không chỉ phân biệt bằng màu.

## Navigation

Public có đường đến Trang chủ, Tìm sân, Chi tiết cơ sở và đăng nhập/đăng ký theo tiến độ từng phase. Auth F1 và Home Phase 1 giữ login thành công về `/`; điều hướng dashboard theo capabilities là phạm vi tương lai. Approved Owner dùng được cả khu vực Customer (đặt sân, lịch sử, favorite, review, refund cá nhân) và khu vực quản lý Owner khi UI tương ứng được triển khai, không phải đổi tài khoản/đổi role. Không coi menu/route guard là authorization.

Chọn lịch có thể xem public; **Checkout/Payment yêu cầu Customer capability đã đăng nhập, gồm Approved Owner**. Sau login có thể phục hồi lựa chọn cũ nhưng phải kiểm tra availability/giá lại, không tự tạo booking chỉ do redirect.

Owner quản lý nhiều Facility: mọi màn hình cấu hình phải thể hiện Facility đang thao tác và Court nếu liên quan. Không có công cụ chọn Facility của Owner khác. Notification/profile/logout dùng endpoint cá nhân cho cả ba role.

## Public Pages

| Màn hình | Nội dung và hành vi | API chính |
| --- | --- | --- |
| Trang chủ | Giới thiệu đúng đề tài, lối vào tìm sân; không số liệu/quảng cáo giả | GET /facilities cho dữ liệu thực nếu Figma có danh sách |
| Tìm sân | Tên cơ sở/sân, khu vực, ngày/giờ, giá, rating, amenity; sort theo phạm vi đã chốt | GET /facilities, GET /amenities |
| Chi tiết cơ sở | Tên/địa chỉ/SĐT/mô tả, ảnh, giờ, tiện ích, Court, bảng giá, policy, review; bản đồ nếu có tọa độ và được chốt | GET /facilities/{id}, /courts, /reviews |
| Chọn lịch | Chọn Court/ngày, trạng thái slot, dải liên tiếp, tổng dự kiến | GET /courts/{id}/availability |
| Checkout | Kiểm tra sân/ngày/giờ, dự kiến tổng/cọc 30%/thanh toán tại sân 70%, policy; nút tạo booking | POST /bookings sau đăng nhập |
| Payment | Snapshot booking, ngân hàng/QR, countdown, chọn/gửi ảnh, kết quả chờ Owner | GET /bookings/{id}, POST /payments/bookings/{id}/proof |

Các path trên tương đối với `/api/v1`. Nếu Facility không ACTIVE, public detail trả trạng thái không khả dụng, không lộ lý do duyệt nội bộ. Link từ booking cũ mở snapshot ở booking detail thay vì ép vào public detail không còn truy cập được.

Search không bỏ qua lỗi silently. Công thức phổ biến/giá đại diện/rating và logic nhiều amenity còn TODO: chưa bật control chưa có contract đầy đủ. Không hiển thị giá 0 hoặc “phổ biến” giả. Khi có lọc ngày/giờ, kết quả phải có ít nhất một Court trống suốt khoảng yêu cầu.

## Authentication Pages

| Màn hình | Hành vi v1 | API |
| --- | --- | --- |
| Đăng ký / Đăng nhập | Email/password, Google Login; giữ capabilities từ backend | /auth/register, /auth/login, /auth/google |
| Quên mật khẩu | Nhập email, phản hồi chung: “Nếu tài khoản đủ điều kiện, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email của bạn.” Không báo email tồn tại hoặc không tồn tại | POST /auth/forgot-password |
| Đặt lại mật khẩu | Mở link email token một lần có hạn 15 phút; nhập mật khẩu mới/xác nhận ở UI; token hết hạn/đã dùng báo chung và cho quay lại Quên mật khẩu | POST /auth/reset-password |
| Đổi mật khẩu | Trong Profile/Settings, nhập mật khẩu hiện tại và mật khẩu mới; thành công yêu cầu đăng nhập lại | POST /auth/change-password |

Email reset là email auth, không thay notification nghiệp vụ trong website. Không hiển thị raw token ngoài trang reset, không lưu localStorage/telemetry. Form confirm password chỉ kiểm tra phía UI; backend luôn validate new_password. Sau reset/change thành công clear phiên và về login.

Google-only hiển thị “Tiếp tục đăng nhập bằng Google”, không có form tạo/liên kết mật khẩu. Dựa trên has_local_password từ /auth/session hoặc /users/me để ẩn chức năng đổi mật khẩu cục bộ cho Google-only; API vẫn kiểm tra PASSWORD_NOT_CONFIGURED. Quên mật khẩu luôn giữ response chung, không tiết lộ email thuộc loại tài khoản nào. Google email collision không tự gộp tài khoản, không có màn hình account-linking MVP. Profile hiển thị email; đổi email chưa thuộc contract.

## Đăng ký trở thành chủ sân

Owner Request frontend dùng route độc lập `/owner-request`, yêu cầu session hợp lệ và capability `CUSTOMER`; không xây Profile frontend đầy đủ chỉ để chứa feature này. CTA “Dành cho chủ sân”/“Đăng ký trở thành chủ sân” ở Home dẫn tới route thật. Approved Owner vẫn có quyền Customer nhưng không được gửi request mới. Ba Customer PNG và hai Admin PNG CURRENT/APPROVED được đăng ký tại `docs/ui-reference/README.md`.

Customer ACTIVE chưa được duyệt Owner thấy thông tin tài khoản hiện có và nút “Gửi yêu cầu”; body tạo rỗng, backend chụp hồ sơ. Không tự thêm form giấy tờ hoặc biến phone nullable thành bắt buộc. Không có request thì hiện create state. Có `PENDING` thì hiện request hiện hành và history, không cho submit lần hai. Latest `REJECTED` mà không có `PENDING` phải hiện lý do và cho tạo record mới, không sửa/xóa record cũ. `APPROVED` hiện trạng thái đã duyệt; Owner capability chỉ có sau khi đăng nhập lại vì backend revoke session applicant trong transaction.

Dùng POST /users/me/owner-requests, GET /users/me/owner-requests và GET /users/me/owner-requests/{request_id}. Lịch sử giữ tất cả lần gửi, ngày gửi/ngày duyệt và rejection_reason. PENDING = “Chờ duyệt”, APPROVED = “Đã được duyệt”, REJECTED = “Bị từ chối”.

Có PENDING thì khóa nút gửi thêm; response 409 `REQUEST_ALREADY_PENDING` phải refetch lịch sử. `ALREADY_OWNER` phải refresh session/đưa User tới khu vực Owner phù hợp, không gửi lại mutation. Sau approval, request tiếp theo bằng session cũ có thể nhận 401; dùng auth flow hiện tại, không render snapshot stale như còn actionable và không giả định capability hot-update. Sau đăng nhập lại, session trả `CUSTOMER + OWNER`; User vẫn truy cập đầy đủ khu vực Customer.

Admin dùng `/admin/owner-requests` và `/admin/owner-requests/:request_id` trong navigation Admin shared gồm **Quản lý cơ sở**, **Yêu cầu chủ sân** và **Tiện ích**. List có loading/error/empty/data, filter `PENDING/APPROVED/REJECTED`, pagination và URL state phù hợp. Detail hiện snapshot applicant và metadata; phone nullable có fallback. Chỉ `PENDING` có Approve/Reject; trạng thái kết thúc chỉ đọc. Approve cần confirmation; Reject dùng `AccessibleModal`, reason trim 1–500 ký tự. Chống double submit; 409 `INVALID_REQUEST_STATE` hoặc kết quả không chắc chắn phải refetch authoritative state, không optimistic transition. Duyệt một request không tự duyệt/tạo Facility.

Response validators phải kiểm tra exact Owner Request DTO: ID string dương; status whitelist; phone/reviewer/reviewed_at/rejection_reason nullable theo state; timestamp hợp lệ; list meta có page/page_size/total/server_time. Customer list/detail/create, Admin list/detail/approve/reject đều phải reject malformed 2xx thành `INVALID_RESPONSE`, không render như empty hoặc dữ liệu hợp lệ. Approve response còn kiểm tra User giữ role `CUSTOMER` và có capabilities `CUSTOMER`, `OWNER`.

Desktop bám năm PNG approved; tablet/mobile stack card và chuyển bảng Admin sang row/card có data label theo pattern Admin Facility hiện có, không overflow ngang. Mọi action dùng keyboard được, có focus visible, status/error live region thích hợp, disabled/loading semantics và modal focus trap/restore từ shared `AccessibleModal`.

Test implementation tối thiểu: Customer no-request/create, submit success/double-submit, `REQUEST_ALREADY_PENDING`, `ALREADY_OWNER`, PENDING/history, REJECTED reason/resubmit, APPROVED/login-again, revoked-session 401, loading/error/empty/malformed 2xx và responsive/accessibility. Admin bao phủ guard, list states/filter/pagination, detail, approve/reject, reason rỗng/quá 500, double-submit, 409 refetch, malformed 2xx, terminal read-only và modal accessibility. Backend regression nên bổ sung applicant LOCKED trước approve, approve-vs-approve, reject-vs-reject và fault-injection rollback quanh request update → OwnerProfile create → session revoke; không thay contract.

## Customer Pages

| Màn hình | Nội dung / hành động | API chính |
| --- | --- | --- |
| Dashboard | Tổng hợp booking cá nhân và booking sắp tới | GET /users/me/dashboard |
| Booking history | Danh sách phân trang, lọc status/ngày, link chi tiết | GET /bookings |
| Booking detail | Snapshot tổng/cọc 30%/trả tại sân 70%, status, proof/rejection reason, policy, metadata hủy và phần Refund | GET /bookings/{id}, GET /payments/bookings/{id}/proof, /refunds/{id}, /refunds/{id}/confirm |
| Favorite | Danh sách đã lưu, bỏ yêu thích; cơ sở ngừng public ghi không khả dụng | GET/PUT/DELETE /favorites |
| Review | Form rating 1–5/comment cho booking COMPLETED, danh sách review đã viết; ảnh P3 | POST /reviews, GET /reviews/mine, POST /reviews/{id}/images |
| Notification | Đọc/chưa đọc, số chưa đọc, mở tài nguyên theo quyền, đánh dấu tất cả | GET /notifications, PATCH read, POST read-all |
| Profile | Họ tên, email, SĐT, avatar, đổi mật khẩu; frontend đầy đủ còn ngoài phase Owner Request | GET/PATCH /users/me, avatar, auth/change-password |
| Owner Request | Route độc lập `/owner-request`: gửi yêu cầu, trạng thái hiện hành và lịch sử | /users/me/owner-requests |

Customer có nút hủy cho PENDING_PAYMENT còn hạn; CONFIRMED chỉ trước cutoff theo snapshot. PENDING_CONFIRMATION không có nút Customer Cancel, không countdown 5 phút, không tự expire; hiển thị chờ Owner Confirm hoặc Reject. Đúng cutoff hoặc state kết thúc không được hủy. Hiển thị policy và thời điểm hạn hủy. Thiếu snapshot cutoff ở CONFIRMED hiển thị không đủ thông tin chính sách, không tự dùng X mặc định. Không có nút chuyển tiền hoàn tự động. REJECTED hiển thị lý do và lối “Chọn lịch để đặt lại”, không nút gửi lại proof vào booking cũ.

## Owner Dashboard và Pages

Owner Booking list dùng reference hiện hành `owner-booking-list-desktop.png`; contract tại `specs/OWNER_BOOKING_PAYMENT_SPEC.md`. `owner-payment-review-desktop.png` là reference lịch sử của detail/review đã triển khai và chưa phải reference chính cho navigation Owner mới. Phase hiện có `/owner/bookings` và `/owner/bookings/:booking_id`. List dùng ID thật, status filter và pagination API. Detail lấy proof qua URL riêng tư 5 phút; Confirm có bước xác nhận, Reject mở modal reason 1–500, không mutation ở click đầu và không optimistic state. Sidebar/notification/dashboard/thống kê trong PNG không được giả hoạt động. Desktop bám visual đã duyệt phù hợp contract; tablet/mobile stack thích nghi, modal quản lý focus và không overflow ngang.

Implementation Frontend Phase 1 hoàn tất ngày 2026-10-06. Navigation ngoài scope trong sidebar được render non-interactive; proof không có ảnh fallback; lỗi mạng/5xx tách khỏi empty và mutation không tự retry.

| Màn hình | Nội dung / hành động | API chính |
| --- | --- | --- |
| Dashboard | Deferred; không tạo mục sidebar hoặc số liệu giả | Chưa có API |
| Facilities | Sidebar cấp cao; danh sách cơ sở của mình, tạo DRAFT, sửa trạng thái cho phép, gửi duyệt; lý do reject/suspend | /owner/facilities, submit |
| Facility Detail hub | Điều hướng trong Facility tới core, ảnh/tiện ích, Court, giá, policy và ngân hàng/QR | /owner/facilities/{id} và các API con |
| Courts | Danh sách theo Facility, tên/mô tả, ACTIVE/INACTIVE | /owner/facilities/{id}/courts, /owner/courts/{id} |
| Pricing | Khoảng giờ/giá, cảnh báo overlap/thiếu bảng giá; thông tin cọc cố định 30% chỉ đọc, không control sửa | price-rules |
| Schedule | Lịch theo Court, booking/khóa sân, tạo/xóa block kèm reason | /owner/courts/{id}/schedule, blocks |
| Bookings | Lọc theo Facility/Court/status/ngày; chi tiết, hủy CONFIRMED có lý do, ghi nhận hoàn thành sau sử dụng sân/xử lý 70% trực tiếp và end_at | /owner/bookings, cancel, complete |
| Payments | Proof cọc 30% chờ duyệt, total/deposit/remaining 70%/deposit status; mục hoàn cọc và upload refund proof | /owner/payments, confirm, reject; /owner/refunds, /owner/refunds/{id}/proof |
| Customers | Chỉ khách từng đặt cơ sở của mình, thông tin cần vận hành và booking liên quan | /owner/customers |
| Reviews | Review cơ sở mình, trạng thái moderation; không tự thêm reply | /owner/reviews |
| Statistics | TODO chốt chỉ số/công thức; không biểu đồ hoặc doanh thu giả | /owner/statistics reserved |
| Bank Account | Nằm trong Facility Detail, ngân hàng/số tài khoản/chủ tài khoản/QR; nhắc booking cũ dùng snapshot; cọc 30% chỉ đọc | bank-account, bank-account/qr |
| Notifications | Inbox cá nhân | /notifications |
| Settings | Không dùng làm menu chứa cấu hình Facility; profile/đổi mật khẩu là account-scoped và còn deferred | /users/me, /auth/change-password |

Phase 1 khóa chỉnh sửa hồ sơ core ở PENDING/ACTIVE/SUSPENDED; DRAFT/REJECTED được sửa core. Backend, Owner frontend ảnh/tiện ích và Admin Amenity catalog frontend đã hoàn tất ở Facility Presentation. Trang ảnh/tiện ích nằm trong Facility Detail hub, dùng dữ liệu API thật, PENDING chỉ đọc và không tự làm mất assignment inactive. Backend vẫn là authority cho ownership, validation và trạng thái.

## Admin Dashboard và Pages

### Admin Amenity Catalog — implemented

Route `/admin/amenities` dùng reference `admin-amenity-catalog-desktop.png`. Navigation Admin gồm **Quản lý cơ sở**, **Yêu cầu chủ sân** và **Tiện ích**; tab Tiện ích active tại route này. Màn hình dùng API thật để hiển thị cả Amenity `ACTIVE`/`INACTIVE`, phân trang, tạo mới, đổi tên, deactivate và reactivate. Không có hard delete, search hoặc status filter trong phase này. Các mutation dùng `AccessibleModal`/shared Admin pattern, chống submit lặp và tuân Origin/CSRF; backend vẫn quyết định validation và trạng thái cuối cùng.

Dữ liệu, số dòng, ID, ngày tạo và số trang trong PNG chỉ mô tả presentation. Không hard-code hoặc suy ra `page_size`, total, seed, Amenity bắt buộc hay business default. Frontend đã triển khai strict response validation, loading/error/empty/data, pagination theo metadata thật và modal accessible; kiểm chứng ngày 2026-10-09 được ghi tại `docs/FEATURE_STATUS.md`.

| Màn hình | Nội dung / hành động | API chính |
| --- | --- | --- |
| Dashboard | Count tài khoản/cơ sở/booking và lối vào yêu cầu duyệt | /admin/dashboard |
| Users | Customer/Owner, lọc, xem, khóa có lý do/mở tài khoản | /admin/users, lock/unlock |
| Owners | Danh sách Owner, hồ sơ liên quan | /admin/owners |
| Owner Requests | Snapshot hồ sơ, approve/reject; rejection_reason bắt buộc, giữ lịch sử | /admin/owner-requests |
| Facilities | Duyệt PENDING, từ chối có lý do, đình chỉ/mở | /admin/facilities, approve/reject/suspend/activate |
| Bookings | Giám sát toàn bộ booking, không nút duyệt payment | /admin/bookings |
| Reviews | Review, ẩn/hiện sau khi chốt moderation | /admin/reviews, visibility reserved |
| Reports | TODO đối tượng/quy trình; chưa có action giả | /admin/reports reserved |
| Amenities | Tạo/sửa/ngừng sử dụng danh mục | /admin/amenities |
| Content | TODO loại nội dung; bám Figma khi được cung cấp | /admin/content reserved |
| Notifications | Thông báo dành cho Admin hiện tại; không inbox người khác, không broadcast tùy ý | /notifications |
| Statistics | TODO công thức chỉ số, charts nâng cao P3 | /admin/statistics reserved |
| Settings | Hồ sơ/đổi mật khẩu hiện tại, mục hệ thống khác TODO | /users/me, /auth/change-password |

Không hiển thị ảnh proof nhạy cảm mặc định ở Admin booking detail. Không cho Admin xác nhận cọc thay Owner trong flow bình thường.

## Booking UI và Slot States

Các slot là khoảng nửa giờ, hiển thị thời gian địa phương. Click/chạm chọn dải liên tiếp cùng Court; đổi Court/ngày phải bỏ lựa chọn không còn phù hợp. Chọn rời rạc báo lỗi, không tự ghép thành booking có khoảng hở.

| UI state | Nhãn tiếng Việt | Có chọn được? |
| --- | --- | --- |
| AVAILABLE | Còn trống | Có, server còn phải kiểm tra lại |
| SELECTED | Đang chọn | State cục bộ frontend, không có trong Booking enum/API availability |
| HELD | Đang được giữ | Không |
| BOOKED | Đã đặt | Không |
| BLOCKED | Tạm khóa | Không |
| PAST | Đã qua | Không |
| UNPRICED | Chưa có giá | Không |

Ngoài giờ mở cửa không có slot để chọn. Facility/Court không khả dụng thì không cho vào bước đặt mới. Response create 409 → thông báo lịch vừa thay đổi, reload availability và yêu cầu chọn lại; không tự chọn giờ thay Customer.

## Booking Status Badges

| Enum | Nhãn |
| --- | --- |
| PENDING_PAYMENT | Chờ gửi minh chứng |
| PENDING_CONFIRMATION | Chờ chủ sân xác nhận |
| CONFIRMED | Đã xác nhận |
| COMPLETED | Đã hoàn thành |
| CANCELLED | Đã hủy |
| REJECTED | Bị từ chối |
| EXPIRED | Hết hạn giữ chỗ |

Badge màu theo Figma, không tự chọn palette. Proof có nhãn riêng SUBMITTED = Đã gửi, APPROVED = Đã duyệt, REJECTED = Bị từ chối; không nhầm proof APPROVED với Booking status. Facility DRAFT/PENDING/ACTIVE/REJECTED/SUSPENDED có nhãn Nháp/Chờ duyệt/Đang hoạt động/Bị từ chối/Tạm đình chỉ.

## Checkout, Countdown và Payment

Hiển thị đồng thời ba dòng, dùng snapshot backend sau khi tạo booking:

| Nhãn UI | Ví dụ |
| --- | --- |
| Tổng tiền sân | 200.000đ |
| Cọc trước (30%) | 60.000đ |
| Thanh toán tại sân (70%) | 140.000đ |

Payment page ghi rõ: “Bạn chỉ cần thanh toán 30% tiền cọc để xác nhận đặt sân. 70% còn lại thanh toán trực tiếp tại sân.” Giải thích thêm cần Owner kiểm tra proof mới CONFIRMED. Không có form upload proof 70% hoặc chọn tỷ lệ cọc.

Trước tạo booking hiển thị giá dự kiến; sau tạo luôn dùng snapshot backend. Countdown tính từ expires_at − server_time, cập nhật khi tab focus/refresh, không tạo đồng hồ 5 phút mới ở mỗi lần mount.

Khi đồng hồ chạm 0, khóa gửi proof ở UI và đọc lại booking. Không tự gán EXPIRED ở frontend; response server quyết định, nhất là trường hợp proof vừa được chấp nhận. Upload đang chạy không gia hạn. Gửi thành công chuyển giao diện chờ Owner, dừng countdown 5 phút; chưa hiện thành công đặt sân cho đến CONFIRMED.

Thông tin chuyển khoản: bank name/account number/account holder/cọc30% và QR URL từ Booking snapshot, nội dung `BOOKING <booking_id>`. QR null dùng fallback; không contact/support phone vì DTO chưa có. Ảnh proof có preview, validation và trạng thái upload; disable submit khi request đang chạy hoặc state chưa xác minh, không gửi trùng do double click.

REJECTED/EXPIRED: nêu rõ lý do/hết hạn, không hứa giữ lại slot; quay lại lịch để tạo booking mới, không upload lại proof booking cũ. Khoản đã chuyển nhưng chưa được Owner xác nhận cần hai bên đối soát ngoài hệ thống; không tạo Refund như khoản cọc đã APPROVED. Hủy CONFIRMED hợp lệ có Refund được theo dõi riêng bên dưới.

## Cancellation UI

### Customer Booking `CONFIRMED` — approved reference 2026-10-10

`customer-booking-confirmed-cancellation-desktop.png` là reference hiện hành đã được triển khai cho `/bookings/:booking_id` khi Booking `CONFIRMED`. Màn hình tiếp tục dùng Booking snapshot thật, hiển thị PaymentProof đã được xác nhận, `cancellation_cutoff_hours_snapshot`, deadline và trạng thái đủ/không đủ điều kiện. Deadline chỉ để trình bày; backend dùng DB time và state sau khóa làm authority. Snapshot `null` không được thay bằng default; cutoff `0` vẫn yêu cầu thời điểm hủy nhỏ hơn nghiêm ngặt `start_at`. Đúng hoặc quá deadline, Booking đã bắt đầu hay server không xác minh được state đều không cho frontend báo hủy thành công.

Reference cancellation và Refund đã được triển khai: source hỗ trợ `CONFIRMED → CANCELLED`, ghi cancellation metadata, nhả `CourtSlotLock`, tạo `Refund PENDING` bằng 100% cọc `APPROVED`, rồi Owner upload proof và Customer xác nhận theo state server.

Hiển thị cutoff_hours và hạn hủy theo ngày/giờ địa phương, dựa trên snapshot. Ví dụ bắt đầu 18:00, cutoff 2 giờ: “Bạn có thể tự hủy trước 16:00”; đúng 16:00 không được hủy CONFIRMED. PENDING_PAYMENT còn hạn được hủy không xét cutoff; đã hết hạn phải đọc EXPIRED từ server. PENDING_CONFIRMATION không có nút Customer Cancel và Owner phải Confirm hoặc Reject.

Modal Customer hủy nêu booking/khung giờ, lý do tùy chọn và kết quả: PENDING_PAYMENT chưa xác nhận cọc không tạo refund; CONFIRMED hủy đúng hạn sẽ được hoàn đủ deposit_amount qua luồng thủ công. UI không tự quyết định đủ điều kiện; nếu server trả 409, refresh detail và giải thích.

Owner chỉ có nút hủy cho CONFIRMED cơ sở mình, reason bắt buộc. Modal nói rõ phải hoàn 100% cọc đã xác nhận, hiển thị amount. Sau hủy, detail giữ status CANCELLED và metadata “Khách hàng hủy”/“Chủ sân hủy”, cancellation_reason/cancelled_at. Không tạo enum booking riêng theo actor.

## Refund UI

Tích hợp hoàn cọc vào Booking Detail Customer và Owner theo hai PNG CURRENT/APPROVED đã đăng ký; không tự redesign. Booking Detail nhận Refund summary, còn proof private được đọc theo `refund_id`; không thêm ngân hàng Customer khi chưa có đặc tả.

| Vai trò | Nội dung | Hành động / API |
| --- | --- | --- |
| Owner | Booking, Customer, deposit_amount, refund amount, reason, status, các mốc lịch sử, ảnh nếu có | Booking Detail trả summary; GET /owner/refunds/{id} đọc proof; PENDING upload qua POST /owner/refunds/{id}/proof sau khi chuyển tiền bên ngoài |
| Customer | Refund amount, status, reason, proof hoàn cọc, requested/proof_submitted/confirmed timestamps | Booking Detail trả summary; GET /refunds/{id} đọc proof; PROOF_SUBMITTED dùng POST /refunds/{id}/confirm |

| Refund enum | Nhãn UI |
| --- | --- |
| PENDING | Chờ chủ sân hoàn cọc |
| PROOF_SUBMITTED | Đã gửi minh chứng hoàn cọc, chờ khách xác nhận |
| REFUNDED | Khách đã xác nhận nhận tiền hoàn cọc |

Hiển thị Booking CANCELLED và Refund badge riêng; không thay badge booking bằng REFUNDED. Refund PENDING/PROOF_SUBMITTED không có countdown 5 phút, không giữ slot. Với Booking CANCELLED từ PENDING_PAYMENT và không có Refund, hiển thị “Không phát sinh hoàn cọc trên hệ thống vì cọc chưa được xác nhận” thay vì số tiền đã hoàn bằng 0 hoặc trạng thái REFUNDED giả.

Upload refund proof chỉ Owner, preview/validation như proof cọc, không thay ảnh đã được nhận. Toast thành công là “Đã gửi minh chứng hoàn cọc”, không “Khách đã nhận tiền”. Customer xác nhận trong modal sau khi tự kiểm tra tiền thực tế; chưa có proof thì không bật nút. Sau server thành công mới hiển thị REFUNDED.

Mất response phải GET detail trước retry; không nhân đôi upload/xác nhận. Proof private chỉ hiển thị cho bên liên quan. Chưa có reject/resubmit/dispute refund hoặc auto-confirm; các tình huống này còn TODO, không tự thêm nút ngoài scope. Website không thực hiện chuyển tiền và không có proof cho phần 70%.

Owner complete có lời xác nhận đã sử dụng sân và xử lý 70% còn lại trực tiếp; không form nhập giao dịch/ngân hàng hoặc xác nhận proof 70%.

## Responsive Design

Theo breakpoint/layout trong Figma; TODO giá trị cụ thể. Luồng chọn sân/ngày/slot/payment phải hoàn thành trên điện thoại. Bảng quản trị có cuộn/chuyển bố cục theo thiết kế, không làm mất nút quan trọng. Ảnh proof/QR không tràn viewport, phóng to trong cách hiển thị Figma cho phép. Form/nút đủ dễ thao tác và có keyboard focus.

## Loading / Empty / Error

- Loading: skeleton/spinner theo Figma, disable nút đang ghi, giữ ngữ cảnh đang chọn.
- Empty: phân biệt chưa có booking/favorite/review với không có kết quả tìm kiếm hoặc không có slot trống; có hướng dẫn hành động phù hợp.
- Error: lỗi field sát input; 401 yêu cầu login, 403 không đủ quyền, 404 không khả dụng, 409 conflict giải thích và refresh; 5xx cho thử lại an toàn.
- Mất mạng sau request ghi: đọc lại detail/history trước retry; không nói thất bại chắc chắn nếu server có thể đã commit.
- Các TODO/feature chưa bật: trạng thái chưa khả dụng rõ ràng, không dữ liệu mẫu giả như dữ liệu thật.

## Modal / Toast

Modal xác nhận cho duyệt/từ chối payment, duyệt/từ chối Facility, khóa tài khoản, xóa block, hủy hợp lệ và Customer xác nhận đã nhận hoàn cọc. Owner hủy CONFIRMED bắt buộc lý do; Customer hủy có lý do tùy chọn. Rejection/lock reason bắt buộc ở nơi API yêu cầu. Hiển thị booking/cơ sở liên quan để tránh thao tác nhầm.

Toast chỉ báo kết quả request, không thay thông tin quan trọng cần lưu (rejection reason phải còn ở detail). Không toast “đã thanh toán” khi mới upload. Lỗi có thể thao tác lại phải giữ input an toàn, nhưng không giữ password/token nhạy cảm lâu dài.

## TODO bàn giao UI

Link/phiên bản Figma; mapping frame; tokens/breakpoints; nội dung screen chưa có dữ liệu; công thức search/statistics; fallback khi CONFIRMED thiếu cutoff snapshot; trao đổi tài khoản nhận hoàn tiền/tranh chấp refund; moderation/report/content. Không bổ sung UI tính năng ngoài scope để lấp chỗ trống.

Mọi hành động Customer ở trên cũng áp dụng cho Approved Owner với booking/tài nguyên cá nhân của mình. Route quản lý Owner vẫn chỉ cơ sở của mình; không dùng nhãn OWNER để bỏ kiểm tra quyền sở hữu.

Route đã chốt cho email reset: /reset-password#token=<RAW_RESET_TOKEN>. Frontend đọc fragment rồi loại token khỏi URL; không analytics/referrer token. Đây là contract route, chưa triển khai UI.

## Facility Core Phase 1 — 2026-09-25

Các quyết định Phase 1 tại [FACILITY_SPEC.md](specs/FACILITY_SPEC.md). Quyết định này thay các TODO trước đó về edit/checklist/validation core: sửa chỉ DRAFT/REJECTED; submit/approve/activate chỉ yêu cầu core hợp lệ, không cần module con. ACTIVE chưa đồng nghĩa booking-ready. Registry district đã được chốt: 94 đơn vị hành chính cấp xã của TP Đà Nẵng (23 phường, 70 xã, 1 đặc khu), theo Nghị quyết 1659/NQ-UBTVQH15 ngày 16/06/2025. `district` là tên field legacy trong API/schema, biểu diễn phường/xã/đặc khu, không biểu diễn quận/huyện. UI sau này dùng nhãn Khu vực hoặc Phường/Xã. Không public search/frontend/module con/notification trong phase này.


## Facility Presentation — quyết định 2026-09-28

Presentation chưa frontend: gallery max10 JPEG/PNG/WebP max5 MB; cover đầu, reorder toàn bộ, xóa cover chọn ảnh kế tiếp. PENDING chỉ xem, state khác sửa presentation không re-approve. Owner thấy inactive đã gán nhưng tập lưu mới chỉ ACTIVE; [] hợp lệ. Public tương lai ẩn inactive. Bám Figma; không đánh dấu UI DONE. Xem specs/FACILITY_PRESENTATION_SPEC.md.

## Public Facility Phase 1 — contract cho UI tương lai

Theo [PUBLIC_FACILITY_SPEC.md](specs/PUBLIC_FACILITY_SPEC.md), chưa triển khai frontend hoặc redesign Figma. Màn hình/bộ lọc đầy đủ bên trên thuộc roadmap. Phase 1 chỉ q, một district (Khu vực/Phường/Xã), pagination1/20/max100; id ASC không gọi là phổ biến. Không bật amenity/giá/rating/ngày giờ/sort hoặc gọi public Amenity catalog.

Card chỉ tên/địa chỉ/khu vực/cover/active amenities. Detail core public/gallery/active amenities/ACTIVE Courts/toàn bộ price_rules/cancellation_policy. Thiếu ảnh/giá trả[], cover/policy null; không giá0 giả hoặc suy hủy tự do. Owner LOCKED hoặc Facility không ACTIVE detail404 không lộ lý do nội bộ. Không booking_ready/availability hoặc bảo đảm đặt được.

## Availability Phase 1 — contract lịch sử; frontend đã triển khai

Theo specs/AVAILABILITY_SPEC.md: chỉ đọc hôm nay/tương lai, ngày quá khứ422 INVALID_DATE. Slot UTC hiển thị Asia/Ho_Chi_Minh; thứ tự PAST > BLOCKED > BOOKED > HELD > UNPRICED > AVAILABLE. HELD gồm PENDING_CONFIRMATION không expiry và PENDING_PAYMENT còn hạn, không suy countdown5 phút từ badge HELD. start_at <= DB snapshot hôm nay là PAST. slot_amount luôn có, decimal string hoặc null; state bị chiếm/quá khứ vẫn có giá nếu xác định được. Nhiều rule trả409 PRICE_NOT_CONFIGURED toàn response, không hiển thị giá tùy ý. Không total quote/backend readiness hoặc bảo đảm đặt thành công; frontend/Booking tiếp tục deferred.

## Auth F1 — approved PNG và implementation 2026-10-02

Sáu ảnh docs/ui-reference/auth-*.png là visual chuẩn cho Auth F1, thay TODO bàn giao Figma riêng cho bốn route Auth này. Font system-ui, branding dựng icon + “Cầu Lông ĐN” theo quyết định người dùng. Không áp quyết định này cho các màn hình nghiệp vụ khác.

Đã triển khai /login, /register, /forgot-password và /reset-password. Ngoại lệ PNG đã duyệt: ẩn Google, bỏ phone và chỉ dùng field backend ở Register, policy8–128 có chữ/số, Forgot Sent dùng thông báo có điều kiện không xác nhận delivery. Forgot Sent/Reset Success là state cùng route. Loading/error inline và chống submit lặp. Login thành công về /; Register không auto-login, về Login kèm thông báo; Reset success có nút Login. Không frontend Change Password/Home/Public/Availability/Booking. Chi tiết kiểm chứng tại FEATURE_STATUS.
