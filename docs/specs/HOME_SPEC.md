# Home Frontend Specification

## Search-first redesign — 2026-10-21

`/` is now a discovery entry point rather than a Facility showcase. The first meaningful content after the shared public header is the search form: `q`, `district`, `date`, `start_time`, and `end_time`. Its submit navigates to the existing `/facilities` route and uses only the already-supported one-date search contract. Values are trim/NFC-normalized where appropriate; blank `q` and `district` are omitted. The client validates the 30-minute, 30-day and 1–6-slot interval before navigation, while the backend remains authoritative.

The Home-only `GET /facilities?page=1&page_size=4` showcase, Facility cards, Owner CTA, long process/benefit sections and their loading/error states have been removed. Home makes no Facility API request until Facility List loads after navigation. Six quick district links are derived from the canonical generated registry and link to `/facilities?district=...`; they are not a second registry or popularity ranking. Header/Footer remain shared. Search results, availability, booking and recurring discovery stay in their existing routes; no duplicate listing logic, new endpoint, schema or backend behavior was added. Targeted Home 5/5 and full frontend 402/402, lint, production build and production dependency audit passed.

The older Phase 1 showcase material below is historical where it conflicts with this current Search-first Home behavior.

## Implementation — 2026-10-05

Home Phase1 đã triển khai tại `/`, thay scaffold; các ghi nhận chưa implementation dưới đây là lịch sử duyệt spec. Code features/home/Home.jsx và home.css; PublicLayout Header/Footer dùng chung, NavLink active theo route, FacilityCard chia sẻ với List. API/Auth/registry generated giữ nguyên; search district và card navigation thật, CTA Owner không mutation. 53 tests/lint/build PASS, responsive4/2/1 cột tại1440/800/390px không tràn ngang. Giới hạn kiểm chứng tại FEATURE_STATUS. Không Booking frontend hoặc filter ngày/giờ.

## Cập nhật dependency — 2026-10-05

Đã review lại PNG và source sau khi Auth F1, Facility List, Facility Detail và Availability frontend hoàn tất. `/facilities` và `/facilities/:facility_id` đều tồn tại; blocker điều hướng đã được giải quyết. Home `/` hiện vẫn render App scaffold/test; implementation Home sẽ thay phần đó, không đổi redirect Login về `/`. Booking frontend và Owner Request frontend vẫn chưa có. Home chưa implementation, không đánh dấu DONE.

## Phạm vi và nguồn chuẩn

Home Frontend Phase 1 — specification ngày 2026-10-04; chưa implementation, chưa kiểm chứng UI. Visual: [home-desktop.png](../ui-reference/home-desktop.png), route `/`. Behavior/data/security: [PUBLIC_FACILITY_SPEC.md](PUBLIC_FACILITY_SPEC.md), [AUTH_SPEC.md](AUTH_SPEC.md), [PERMISSION_SPEC.md](PERMISSION_SPEC.md), [API_SPEC.md](../API_SPEC.md). Các ngoại lệ visual dưới đây do yêu cầu Home Phase 1 chốt; không thay nghiệp vụ backend.

Chỉ tích hợp session, Public Facility list và điều hướng theo district. Không Availability search, Booking UI, review/rating, price filter, notification, Google Login hoặc dữ liệu giả. Không thêm API, sửa backend/schema/migration. Login thành công và người đã đăng nhập vào `/login` vẫn về `/` theo Auth F1.

## Visual và responsive

Giữ header trắng, branding “Cầu Lông ĐN”, hero xanh đậm với chữ lớn và hình trang trí cầu lông, thanh tìm kiếm bo góc, card trắng, section khu vực nền nhạt, hướng dẫn bốn bước, lưới lợi ích, CTA xanh và footer tối như PNG. Dùng system-ui và branding hiện có từ Auth F1. Không dùng các ảnh cơ sở minh họa trong PNG thay ảnh API.

Desktop giữ thứ tự section, màu, hierarchy, chiều rộng nội dung và khoảng cách gần reference. Bỏ dải thống kê, nối hero với danh sách bằng khoảng cách section thông thường; không giữ ô trống lớn hoặc thay bằng số khác. Tablet/mobile chuyển cột vừa chiều rộng, form xếp dọc khi cần, card/lợi ích từ nhiều cột về một cột; giữ thứ tự đọc, không tràn ngang. Header có thể xuống dòng, không thêm menu chức năng mới. Label, focus bàn phím, trạng thái disabled và thông báo lỗi phải đọc được; không chỉ dùng màu.

## Route và điều hướng

| Thành phần | Contract |
| --- | --- |
| Logo, Trang chủ | `/` |
| Đăng nhập / Đăng ký | `/login` / `/register` hiện có |
| Tìm sân trên header, Xem tất cả | Facility List tại `/facilities`, không filter |
| Submit form tìm sân | `/facilities?district=<giá trị được URL-encode>`; Tất cả khu vực dùng `/facilities` |
| Click khu vực | Cùng route/query district như form |
| Card / Xem chi tiết | `/facilities/:facility_id`, ID từ DTO thật; route đã có |

Dùng URLSearchParams cho district, giữ nguyên tên Unicode chuẩn. Không gửi date/start_time/end_time hoặc query rỗng. `/facilities` là route SPA đã có, khác backend `/api/v1/facilities`. Không tạo link đến route chưa tồn tại.

## Header và session

- Guest: logo, Trang chủ, Tìm sân, Đăng nhập, Đăng ký. Không Giới thiệu nếu chưa có đích thật.
- Authenticated: logo, Trang chủ, Tìm sân, `user.full_name` và initial suy từ tên session, nút Đăng xuất. Không hiển thị email thay tên, không dữ liệu tài khoản mẫu. Không notification, dashboard hoặc menu Owner/Admin giả.
- Tái sử dụng Auth Context hiện có: loading, authenticated, guest, error. Loading dùng placeholder trung tính; error hiển thị lỗi kiểm tra phiên và thao tác thử lại, không suy ra guest từ network/5xx. Public content vẫn có thể đọc độc lập.
- Logout gọi `POST /api/v1/auth/logout` qua Context request với CSRF memory và credentials include; trình duyệt gửi Origin theo cấu hình hiện có. Chặn submit lặp. Sau 204 gọi clearSession và giữ `/`; lỗi mạng/5xx giữ trạng thái phiên, báo inline và cho thử lại, không giả báo logout thành công. Theo convention hiện tại, 401 SESSION_EXPIRED chuyển guest. Không đọc HttpOnly cookie hoặc lưu token vào browser storage.
- Khả năng Owner lấy từ capabilities, không suy từ tên/menu hay coi CUSTOMER/OWNER loại trừ nhau. Backend vẫn là authority.

## Hero và tìm sân

Tiêu đề có thể giữ “Đặt sân cầu lông tại Đà Nẵng dễ dàng hơn”; phần mô tả trung tính: “Khám phá các cơ sở cầu lông tại Đà Nẵng theo khu vực.” Bỏ badge “số 1”, tổng cơ sở/sân và lời hứa đặt trực tuyến trong vài phút khi UI hành trình chưa có.

Form Home theo PNG và quyết định Phase 1 vẫn chỉ có một lựa chọn hoạt động: Khu vực. “Tất cả khu vực” dùng giá trị UI rỗng nhưng **không gửi district rỗng**. Dropdown có đủ 94 giá trị canonical, giữ tên đầy đủ phường/xã/đặc khu. Backend/List đã hỗ trợ q: trim+NFC, contains không phân biệt hoa/thường trên tên Facility hoặc ACTIVE Court, không tìm bỏ dấu; q ở query `/facilities?q=...`, kết hợp district khi có. Home không tự thêm ô q ngoài visual đã duyệt; người dùng tìm tên tại List. Không map q thành tên query khác hoặc nhét q vào district.

Chọn cách giữ bố cục PNG: Ngày chơi và Giờ bắt đầu disabled, không nhận input/focus nhập liệu, kèm giải thích hiển thị rõ “Chưa hỗ trợ lọc theo ngày/giờ”. Không giá trị mặc định trông như filter đã áp dụng; không tooltip-only. Nút Tìm sân chỉ dùng district. Không gọi Availability để giả lập tìm cơ sở theo ngày/giờ; endpoint Availability hiện chỉ đọc một Court trong một ngày.

## Danh sách cơ sở trên Home

Gọi đúng `GET /api/v1/facilities?page=1&page_size=4` qua API client hiện có. Envelope `data` array, `meta.server_time/page/page_size/total`; backend order id ASC. Lựa chọn district ở form chỉ dùng khi điều hướng, không tự thay request section Home. Không dùng total để tạo dải thống kê hay suy ra tổng Court/booking.

Tiêu đề “Sân cầu lông”; mô tả “Khám phá các cơ sở tại Đà Nẵng.” Không “nổi bật”, “được đánh giá cao”, “đặt nhiều nhất”. Backend chỉ trả Facility ACTIVE của Owner User ACTIVE; frontend không gọi API Owner để bổ sung dữ liệu.

Whitelist card: id làm key, name, district, address, cover_image_url, amenities dạng `{id,name}` ACTIVE. Cover do backend chọn theo sort_order ASC/id ASC; null hoặc lỗi tải ảnh dùng placeholder trung tính “Chưa có ảnh”, không ảnh cơ sở giả. Render tên/địa chỉ/amenity như text. Không gọi detail từng card, không lấy thêm Court/price/rating để lấp chỗ trống.

Không rating, review count, giá “Từ...”, số Court, Còn sân/Hết sân, popularity hoặc booking_ready. Bỏ các hàng/badge đó; giữ link Xem chi tiết đến route Detail đã có. Không expose Owner, ngân hàng, metadata nội bộ hoặc image_path/public_id riêng.

Loading: skeleton card, không số liệu giả. Empty: “Chưa có cơ sở để hiển thị.” Error: thông báo inline và nút thử lại chỉ request đọc; phân biệt lỗi với danh sách rỗng. Không alert(). Bỏ response cũ khi unmount/abort, không tự retry vòng lặp. Không cần Cloudinary API/upload từ frontend; chỉ dùng URL delivery backend trả.

## Nguồn khu vực và section khu vực

Nguồn canonical duy nhất: [backend/src/modules/facilities/districts.js](../../backend/src/modules/facilities/districts.js), export immutable `supportedDistricts`. `district` là tên field legacy biểu diễn đơn vị cấp xã, không phải quận/huyện. Không sửa hoặc xác minh lại danh sách hành chính trong task Home này.

Đã có frontend/scripts/generate-districts.js và frontend/src/generated/districts.json, chạy trước dev/test/build. Home tái sử dụng resource này; không sửa backend, không import module backend runtime vào browser, không đọc env/database, không thêm API hoặc generator thứ hai. Resource sinh tự động không sửa tay. Giữ test đối chiếu nguyên mảng với nguồn, đúng94, không trùng/rỗng. Backend tiếp tục validate authority.

Section Home dùng sáu entry đầu theo thứ tự canonical hiện tại, không ngụ ý xếp hạng hoặc khu vực có cơ sở: Phường Hải Châu, Phường Hòa Cường, Phường Thanh Khê, Phường An Khê, Phường An Hải, Phường Sơn Trà. Đây là lựa chọn trình bày, không phải filter giới hạn dropdown. Không copy mảng tên riêng: chọn từ resource canonical. Không hiển thị số cơ sở; copy “Khám phá theo phường/xã/đặc khu”. Click theo bảng route; khu vực không có Facility vẫn hợp lệ và List tương lai phải có empty state.

## Nội dung tĩnh và CTA Owner

Giữ layout bốn bước “Cách đặt sân”, nhưng ghi rõ “Quy trình dự kiến — giao diện đặt sân và thanh toán chưa có trong giai đoạn này”. Bốn bước chỉ giải thích: tìm cơ sở theo khu vực → chọn lịch → chuyển khoản cọc và gửi minh chứng → chờ chủ sân xác nhận rồi đến sân. Không CTA thực hiện Booking/Payment hoặc hứa xác nhận tự động. Đây là mô tả quy trình theo spec, không thông báo feature đã triển khai.

Lưới lợi ích giữ visual sáu ô, dùng thông tin trung tính: “Theo khu vực”, “Thông tin cơ sở”, “Hình ảnh cơ sở”, “Tiện ích được công bố”, “Tài khoản cá nhân”, “Trải nghiệm trên nhiều thiết bị”. Không quảng cáo review đã hoạt động, realtime, tìm theo giá/rating, quản lý lịch sử qua frontend hoặc đặt sân 24/7. Không dựng số liệu marketing.

CTA giữ khối xanh và nội dung dành cho chủ sân, không hứa tăng doanh thu/lượng khách. Hành vi an toàn:

| Phiên | Hành vi |
| --- | --- |
| Guest | Nút “Đăng nhập” → `/login`, ghi “Đăng nhập bằng tài khoản của bạn. Giao diện gửi yêu cầu chủ sân sẽ được bổ sung sau.” Không return-to tự gửi request |
| CUSTOMER chưa có OWNER | Hiển thị text “Giao diện đăng ký trở thành chủ sân chưa được hỗ trợ”; CTA gửi yêu cầu disabled, không gọi Owner Request API |
| Có OWNER capability | Text “Bạn đã có quyền chủ sân. Giao diện quản lý sẽ được bổ sung sau.” Không nút dashboard giả, không gửi request lại |
| ADMIN | Không CTA đăng ký chủ sân; không suy ra Customer capability |
| Loading/error session | Không xác định nhầm role hoặc gửi request; chờ/thử lại session theo header |

Owner Request frontend/dashboard DEFER, không tạo route mới trong Home. Owner approval vẫn khác Facility approval.

## Footer

Giữ nền tối, branding, nhóm cột và hierarchy của PNG. Logo/Trang chủ dùng `/`; đăng nhập/đăng ký dùng route thật. Tìm sân theo dependency route đã nêu. Mục Giới thiệu, Dành cho chủ sân, hỗ trợ, điều khoản/chính sách chưa có trang là text không tương tác hoặc hoãn, không href="#" giả chức năng. Không chép địa chỉ, phone, email, social hay URL minh họa từ PNG; không tự tạo dữ liệu liên hệ thay thế. Không dùng icon mạng xã hội như link nếu chưa có đích được cung cấp.

## Kiểm chứng cần có ở implementation

Đối chiếu PNG desktop và responsive; guest/auth/loading/error header; logout CSRF/204/lỗi/chống lặp; login redirect giữ nguyên. Kiểm tra API list đúng query, whitelist, loading/error/empty/cover null; không fake data/N+1. Kiểm tra canonical districts, URL encoding và bỏ district khi Tất cả; ngày/giờ disabled không được gửi. CTA từng capability không mutation. Link không có đích không giả hoạt động. Chạy frontend tests/lint/build khi implementation; task spec này không chạy test hoặc ghi database.

## Reuse và responsive sau review

Tái sử dụng services/api.js (VITE_API_BASE_URL, credentials include, envelope/error/204), Auth Context và Header/Footer trong features/facilities/PublicLayout.jsx. Header hiện hard-code active Tìm sân: khi implementation phải dùng route-aware active state cho Trang chủ/Tìm sân, không sao chép auth/logout. Card hiện là component nội bộ FacilityList.jsx; có thể tách dùng chung, giữ DTO/fallback/link và regression List. Không import nguyên page List vào Home.

Home desktop dùng4 card/hàng như PNG, tablet2 và mobile1; không đổi grid3/2/1 của List. Giữ hero/section hierarchy, form và CTA xếp dọc khi hẹp, khu vực/lợi ích wrap, không horizontal overflow. Dùng system-ui/focus và shared header/footer đã có; không dựng notification/menu mới. Availability ở Detail đã hoạt động nhưng không biến Home thành tìm Facility theo ngày/giờ. Booking/Payment UI nay đã có; nội dung Home vẫn không quảng cáo Owner review/Refund hoặc feature chưa triển khai.

## Readiness

API/backend đủ cho dữ liệu Home; không cần backend change/schema/migration. UI/data/security đã chốt như trên; chưa có implementation, không thay FEATURE_STATUS.

List và Detail đã hoàn tất, navigation Home không còn dependency chặn. Owner Request có backend nhưng chưa có frontend; giữ CTA an toàn theo bảng phía trên, không tự gọi POST. Không cần backend/schema/package mới để hoàn thiện contract này. Footer không contact/social giả; nội dung tĩnh không phải số liệu runtime. Các chức năng Booking/review/notification/realtime/price-rating search không được quảng cáo như đã sẵn sàng.

DECISION REQUIRED: NO. HOME FRONTEND PHASE 1 IMPLEMENTATION READY: YES. Đây là readiness của specification, không phải xác nhận Home implementation/test DONE. Review này chỉ cập nhật documentation.
