# Project Overview

## Implementation Baseline — 2026-10-07

Baseline v1 đã có luồng Auth email/password, khám phá Facility, Availability, tạo/đọc Booking, gửi PaymentProof, Owner confirm/reject proof và quản lý/duyệt Facility cốt lõi. Các phần chỉ có backend hoặc còn thiếu UI được ghi `PARTIAL`; Refund, notification, favorite/review, content và statistics vẫn TODO/DEFERRED trong `FEATURE_STATUS.md`. Mục này chỉ ghi trạng thái, không thay đổi nghiệp vụ bên dưới.

## Project Information

- Tên đề tài: **Website đặt sân cầu lông trực tuyến tại thành phố Đà Nẵng**.
- Tên tiếng Anh: **Online Badminton Court Booking Website in Da Nang City**.
- Dự án do một người phát triển trong thời gian ngắn; ưu tiên đơn giản, dễ hiểu, dễ bảo trì và demo được trên môi trường triển khai thật.
- Stack chính thức: React + Vite, Node.js + Express, Prisma, PostgreSQL hosted trên Supabase, REST API; kiến trúc modular monolith; website responsive.
- Trạng thái hiện tại: đã triển khai database foundation, Auth, Public Facility/Availability, Customer Booking/Payment, Customer proof read, Owner proof confirm/reject và Owner Facility Hub gồm core, ảnh/tiện ích, sân, giá, chính sách hủy và tài khoản nhận cọc + QR. Confirmed cancellation, Refund, notification và các module deferred khác theo `FEATURE_STATUS.md`.
- Documentation baseline: v1 — rà soát ngày 2026-09-21. Các quyết định mới trong baseline này thay thế nội dung cũ mâu thuẫn; TODO còn lại được nêu rõ, không được tự suy đoán.

Tài liệu này là **nguồn chuẩn về nghiệp vụ**. Các spec chi tiết phải tuân theo tài liệu này và yêu cầu dự án. Các lựa chọn thiết kế được nêu rõ để toàn bộ tài liệu dùng chung; mục TODO không phải nghiệp vụ đã được quyết định và không được âm thầm hiện thực hóa.

HISTORICAL/SUPERSEDED — Booking Configuration Phase 1 được duyệt ngày 2026-09-27: Owner GET/PUT bảng giá (thay toàn bộ, gồm tập rỗng, max48, nằm trong giờ mở cửa, không overlap), cutoff giờ nguyên 0–168 và ngân hàng text singleton. PUT chỉ chặn Facility PENDING, không đổi status/approval metadata hoặc yêu cầu duyệt lại; GET mọi state. Không đổi snapshot booking cũ. QR upload/delete, Admin/public API và Booking vẫn hoãn. Chi tiết contract chuẩn tại [BOOKING_CONFIGURATION_SPEC.md](specs/BOOKING_CONFIGURATION_SPEC.md).

Supabase chỉ cung cấp PostgreSQL hosting; không dùng Supabase Auth/Storage/Realtime/Edge Functions. React gọi Express REST API; Express xử lý authentication, authorization và nghiệp vụ, truy cập DB qua Prisma. Frontend/backend hosting provider vẫn TODO; website phải deploy thực tế. Quyết định công nghệ này giữ Documentation baseline v1 và toàn bộ business rules.

## Background

Website kết nối khách hàng có nhu cầu đặt sân cầu lông tại Đà Nẵng với chủ sân. Người dùng tìm cơ sở, xem lịch sân con, đặt giờ chơi và gửi minh chứng chuyển khoản đặt cọc. Chủ sân quản lý cơ sở và trực tiếp kiểm tra khoản cọc; quản trị viên quản lý tài khoản, phê duyệt và giám sát hệ thống.

## Objectives

- Cung cấp luồng tìm sân → đặt lịch → đặt cọc → xác nhận nhất quán.
- Ngăn hai booking chiếm cùng một slot của một Court.
- Quản lý nhiều Facility cho một OWNER, nhiều Court cho một Facility.
- Thể hiện rõ giá, tiền cọc, thời hạn giữ chỗ, chính sách hủy và trạng thái xử lý.
- Bảo vệ dữ liệu theo role và quyền sở hữu; backend quyết định mọi nghiệp vụ quan trọng.
- Triển khai website thực tế với UI tiếng Việt, dùng được trên điện thoại và máy tính.

## Scope

Bao gồm tài khoản, Google Login, hồ sơ, quản lý cơ sở/sân con, bảng giá, tìm kiếm, lịch trống, booking, chuyển khoản thủ công, minh chứng, duyệt cơ sở/chủ sân, hủy theo chính sách, theo dõi hoàn cọc thủ công, favorite, review, thông báo trong website và thống kê đơn giản.

Không bao gồm microservices, native mobile app, chat realtime, AI, payment gateway tự động, tự đọc giao dịch ngân hàng, SMS notification, email notification nghiệp vụ hoặc automated refund. Email khôi phục mật khẩu là ngoại lệ được chốt: gửi liên kết reset bằng token ngẫu nhiên dùng một lần, hết hạn sau 15 phút. Thông báo booking/payment/refund vẫn chỉ trong website.

## Actors

| Actor | Trách nhiệm |
| --- | --- |
| Khách chưa đăng nhập | Tìm kiếm và xem thông tin công khai của Facility ACTIVE, Court và lịch trống |
| CUSTOMER | Tài khoản/hồ sơ, đặt sân, gửi minh chứng cọc 30%, trả 70% tại sân, theo dõi lịch sử, hủy hợp lệ, xem refund và xác nhận đã nhận tiền, favorite, notification, review booking COMPLETED |
| OWNER | Giữ toàn bộ Customer capabilities; quản lý các Facility thuộc mình, Court, lịch, giá, chính sách, ngân hàng, booking, minh chứng cọc, hủy CONFIRMED có lý do, hoàn cọc thủ công và upload refund proof, khách hàng liên quan, review và thống kê |
| ADMIN | Quản lý Customer/Owner, duyệt Owner request/Facility, khóa tài khoản, giám sát booking, review/report, amenity, nội dung, notification và thống kê |

Approved Owner = Customer capabilities + Owner capabilities. CUSTOMER và OWNER không loại trừ nhau: sau duyệt, cùng User giữ toàn bộ booking, favorite, review, refund cá nhân và được dùng tất cả chức năng Customer; thêm quyền quản lý cơ sở của mình. ADMIN là quyền quản trị riêng, không mặc định kế thừa hai nhóm này. Tài khoản LOCKED không được thực thi capability nào. Các từ Customer/Owner trong tài liệu chỉ vai trò khi thực hiện hành động, không phải hai tài khoản tách biệt.

## Functional Requirements

| Nhóm | Chức năng |
| --- | --- |
| Tài khoản | Đăng ký email/password, đăng nhập/đăng xuất, Google Login, quên/reset/đổi mật khẩu; họ tên, email, SĐT, avatar |
| Tìm kiếm | Tên cơ sở/sân, khu vực (phường/xã/đặc khu) Đà Nẵng, ngày, khoảng giờ, khoảng giá, rating, amenity; sắp xếp phổ biến/rating/giá |
| Cơ sở | Thông tin, địa chỉ, vị trí bản đồ nếu cần, SĐT, mô tả, giờ mở/đóng cửa, ảnh, tiện ích, trạng thái duyệt |
| Sân con | Thuộc một cơ sở, tên, mô tả, trạng thái hoạt động; lịch và khóa sân theo khoảng giờ |
| Giá/chính sách | Giá theo khoảng thời gian, cọc cố định 30% toàn hệ thống; Owner không chỉnh tỷ lệ cọc, hủy trước X giờ, tài khoản ngân hàng/QR |
| Booking | Chọn slot liên tiếp cùng Court, giữ 5 phút, xem chi tiết/lịch sử, hết hạn, xác nhận, hoàn thành, hủy theo chính sách |
| Payment | Chuyển khoản cọc 30%, upload minh chứng cọc, Owner xác nhận/từ chối có lý do; 70% trả trực tiếp tại sân; theo dõi hoàn 100% cọc đủ điều kiện qua Refund riêng |
| Tương tác | Favorite, review sau hoàn thành, notification chỉ trong website, đọc/chưa đọc/đánh dấu tất cả đã đọc |
| Quản trị | Duyệt Owner request/Facility, từ chối có lý do, khóa/mở tài khoản và Facility, quản lý review/report/amenity/nội dung |
| Thống kê | Tổng hợp đơn giản cho Owner theo tài nguyên của mình và Admin toàn hệ thống; chưa coi minh chứng được duyệt là sổ kế toán |

TODO: chốt công thức phổ biến, cách hiển thị/lọc giá đại diện, bộ chỉ số thống kê, nội dung quản trị và loại/xử lý report. Các lựa chọn chưa chốt phải thể hiện trạng thái chưa hỗ trợ thay vì trả dữ liệu giả.

## Core Domain Model

- User có Customer capability; sau Owner request APPROVED được bổ sung Owner capability qua OwnerProfile. Approved Owner → nhiều Facility; Facility → nhiều Court.
- Facility có hình ảnh và nhiều Amenity; bảng giá, chính sách hủy và tài khoản ngân hàng được cấu hình tại Facility. Cọc là hằng số nghiệp vụ toàn hệ thống DEPOSIT_RATE = 30%, không cấu hình theo Owner/Facility.
- PriceRule theo khoảng giờ trong ngày, áp dụng chung cho Court của Facility trong thiết kế MVP. TODO: nhu cầu giá khác nhau giữa Court/ngày trong tuần; chưa bổ sung.
- Booking thuộc một CUSTOMER và một Court; gồm nhiều slot 30 phút liên tiếp và bản chụp giá/chính sách/ngân hàng tại thời điểm đặt.
- PaymentProof thuộc Booking, chỉ chứng minh Customer chuyển cọc 30% cho Owner. Booking có tối đa một Refund độc lập, chứa minh chứng Owner hoàn cọc cho Customer. Review thuộc Booking COMPLETED, tối đa một review/booking, có thể có ảnh.
- CourtBlock thuộc Court và khoảng thời gian; Favorite nối Customer với Facility; Notification thuộc người nhận.

## Booking Phase 1 — backend đã triển khai, 2026-10-04

Gồm create và Customer list/detail của chính mình; dùng lazy expiry, worker hoãn sang phase sau. Hold đúng5phút theo DB time, hết hạn nhả lock nhưng giữ lịch sử. Availability luôn chỉ đọc và bỏ qua hold hết hiệu lực. Phase1 dừng trước upload proof, không triển khai Payment/Refund/Notification/frontend. Không thay quy tắc cọc30%/remaining70% hoặc cancellation. Contract tại specs/BOOKING_SPEC.md.

## Booking Flow

1. Customer tìm Facility ACTIVE và Court đang hoạt động.
2. Chọn ngày và các slot 30 phút liên tiếp của cùng Court.
3. Xem tổng tiền dự kiến, cọc 30%, thanh toán tại sân 70% và chính sách. Backend tự tính cả ba số tiền khi tạo booking.
4. Backend kiểm tra trạng thái cơ sở, sân, giờ hoạt động, bảng giá, CourtBlock và xung đột booking.
5. Tạo booking `PENDING_PAYMENT`, giữ slot đúng 5 phút, có `expires_at`.
6. Customer gửi minh chứng hợp lệ trước hạn → `PENDING_CONFIRMATION`.
7. Owner xác nhận cọc → `CONFIRMED`; Customer sử dụng sân và xử lý 70% còn lại trực tiếp với Owner; Owner ghi nhận → `COMPLETED`. Sau đó Customer được review.
8. Không gửi đúng hạn → `EXPIRED`, nhả slot. Hủy hợp lệ hoặc từ chối → nhả slot.

Owner ghi nhận hoàn thành thủ công sau `end_at`, sau khi Customer sử dụng sân và hai bên xử lý 70% còn lại trực tiếp. MVP không lưu trạng thái thanh toán riêng cho 70%, không yêu cầu proof khoản này và không tự hoàn thành theo đồng hồ. TODO: chốt xử lý no-show; chưa có trạng thái riêng.

## Payment Flow

Customer chuyển khoản cọc 30% ngoài website theo thông tin ngân hàng của Facility rồi gửi ảnh. 70% còn lại thanh toán trực tiếp tại sân bằng tiền mặt hoặc chuyển khoản, không upload proof và không có giao dịch 70% trên website. Ảnh hợp lệ về định dạng không có nghĩa ngân hàng đã nhận tiền. Owner tự đối soát và xác nhận/từ chối.

**Quy tắc minh chứng chính thức:** một booking chỉ có một lần gửi proof thành công. Owner từ chối có lý do → booking `REJECTED`, proof `REJECTED`, nhả slot. Không mở lại booking cũ. Customer muốn thử lại phải tạo booking mới, kiểm tra lại availability/giá, có 5 phút mới và gửi proof mới. Tiền đã chuyển nếu có do hai bên tự đối soát; website không đảm bảo khoản chuyển được chuyển sang booking mới.

Khi đã nhận proof đúng hạn, booking `PENDING_CONFIRMATION` không còn countdown 5 phút, không tự expire và Customer không được tự cancel. Owner phải Confirm → CONFIRMED hoặc Reject có lý do → REJECTED. Không thêm timeout hoặc nhánh hủy ở trạng thái này. TODO: xử lý vận hành khi Owner không phản hồi, không tự đặt auto-expire.

## Facility Management

| Từ | Đến | Actor/điều kiện |
| --- | --- | --- |
| DRAFT | PENDING | OWNER sở hữu gửi hồ sơ đủ thông tin |
| PENDING | ACTIVE | ADMIN duyệt |
| PENDING | REJECTED | ADMIN từ chối, bắt buộc lý do |
| REJECTED | DRAFT | OWNER sửa hồ sơ để gửi lại |
| ACTIVE | SUSPENDED | ADMIN đình chỉ, lưu lý do |
| SUSPENDED | ACTIVE | ADMIN mở lại sau kiểm tra |

Chỉ Facility `ACTIVE` của Owner User `ACTIVE` được xuất hiện công khai; ACTIVE là điều kiện cần để nhận booking mới; booking còn cần Court/giá/ngân hàng và các điều kiện đã chốt. ACTIVE trong Phase 1 có thể chưa có module con. Facility không công khai vẫn được tra cứu qua booking hợp lệ bởi Customer liên quan/Owner/Admin. Đình chỉ cơ sở/khóa tài khoản không tự hủy booking hoặc tự hoàn tiền. Phase 1 chỉ sửa core khi DRAFT/REJECTED; PENDING/ACTIVE/SUSPENDED không được sửa core. Cơ chế duyệt lại ACTIVE nếu mở rộng sau vẫn ngoài scope.

Owner request và Facility approval là hai quy trình độc lập. Customer gửi yêu cầu trở thành Owner: PENDING → APPROVED hoặc REJECTED. Admin reject bắt buộc rejection_reason; request bị từ chối giữ nguyên lịch sử, Customer có thể tạo request mới với ID mới. Mỗi User tối đa một request PENDING cùng lúc; khi đã là Approved Owner không cần và không gửi thêm yêu cầu trở thành Owner.

MVP dùng thông tin hồ sơ tài khoản sẵn có cho yêu cầu, không tự thêm giấy tờ hoặc trường nghiệp vụ chưa được yêu cầu. Duyệt Owner tạo OwnerProfile và bổ sung Owner capability, không xóa Customer capability hoặc dữ liệu cá nhân; không tự tạo/duyệt Facility. Sau đó Owner tạo Facility DRAFT và gửi duyệt riêng; chỉ Facility ACTIVE mới công khai. Facility bị reject/suspend không làm mất Customer capability hoặc tự thu hồi Owner capability.

## Authentication Baseline

Forgot Password qua email với random single-use token; thời hạn 15 phút từ server tạo token. Database chỉ lưu token hash, không raw token. Response giống nhau cho email không tồn tại, tài khoản mật khẩu cục bộ hoặc Google-only, không tiết lộ khả năng tồn tại tài khoản. Email chỉ gửi reset link cho tài khoản có mật khẩu cục bộ đủ điều kiện.

Reset Password kiểm tra token chưa dùng/chưa hết hạn, hash mật khẩu mới, tiêu thụ token nguyên tử và thu hồi session. Change Password yêu cầu đăng nhập và current_password đúng, rồi hash mật khẩu mới và thu hồi session. Chi tiết bảo mật ở AUTH_SPEC.

Google-only account tiếp tục Google Login trong MVP, không tạo mật khẩu qua forgot/reset/change, không thêm account-linking. Nếu Google email trùng tài khoản cục bộ chưa liên kết, không tự gộp; hướng dẫn dùng phương thức đăng nhập đã có.

## Business Rules

1. Slot dài 30 phút, ranh giới giờ địa phương `:00`/`:30`, khoảng thời gian dạng `[start, end)`; hai khoảng tiếp giáp không xung đột.
2. Một booking chỉ thuộc một Court, 1–6 slot liên tiếp (30 phút–3 giờ), không trùng/khoảng hở, cùng ngày Asia/Ho_Chi_Minh và trong giờ hoạt động. start_at > DB time và <= DB time + 30 × 24 giờ. Facility/Court/Owner User phải ACTIVE, đủ giá/ngân hàng; Booking Phase 1 không yêu cầu phone.
3. Mọi tính giá, tiền cọc, availability, chuyển trạng thái và authorization do backend kiểm tra.
4. Giá theo VND; tính mỗi slot từ giá giờ / 2 và cộng lại. Dùng số tiền chính xác, không số thực nhị phân. Làm tròn một lần ở tổng tiền và một lần khi tính cọc 30% đến VND gần nhất, nửa đơn vị làm tròn lên.
5. DEPOSIT_RATE = 30% cho mọi booking. Backend tính `deposit_amount = total_amount * 30 / 100`, làm tròn đến VND gần nhất, nửa đơn vị lên; `remaining_amount = total_amount - deposit_amount` là phần 70% thanh toán tại sân. Không làm tròn độc lập phần còn lại. Lưu snapshot cả ba số tiền. Owner không có quyền chỉnh tỷ lệ cọc.
6. PriceRule không chồng nhau; thiếu giá không được đặt. Thay đổi giá/chính sách/ngân hàng không sửa snapshot của booking cũ.
7. `expires_at = created_at + 5 phút`. Khi `now >= expires_at`, proof mới không được nhận cho `PENDING_PAYMENT`.
8. `PENDING_PAYMENT` chưa hết hạn, `PENDING_CONFIRMATION`, `CONFIRMED` giữ slot. `EXPIRED`, `REJECTED`, `CANCELLED` không giữ slot. Slot COMPLETED được lưu lịch sử; không nhận booking quá khứ.
9. Customer hủy PENDING_PAYMENT còn hiệu lực không cần xét cutoff; Customer không được hủy PENDING_CONFIRMATION và phải chờ Owner Confirm/Reject; hủy CONFIRMED chỉ khi `current_time < start_at - cutoff_hours` theo snapshot. Owner được hủy CONFIRMED thuộc cơ sở mình với lý do bắt buộc. Các trạng thái kết thúc không được hủy. Chi tiết ở mục Cancellation và Refund.
10. Website không chuyển tiền hoàn tự động. Cancellation đủ điều kiện tạo Refund riêng bằng 100% deposit đã được Owner xác nhận; Owner chuyển tiền ngoài hệ thống, upload refund proof, Customer xác nhận đã nhận. 70% thanh toán tại sân không thuộc refund này.
11. CourtBlock không được chồng lên booking đang giữ slot; yêu cầu khóa xung đột bị từ chối, không âm thầm hủy booking. Khóa và booking phải được kiểm tra trong cùng cơ chế chống tranh chấp.
12. Chỉ Customer sở hữu booking COMPLETED mới review, rating nguyên 1–5, tối đa một review mỗi booking kể cả review bị ẩn.
13. OWNER chỉ quản lý tài nguyên của mình; ADMIN không duyệt payment thay Owner trong flow bình thường.
14. Mọi notification nghiệp vụ chỉ trong website, hỗ trợ đọc/chưa đọc và đánh dấu tất cả đã đọc. Các event: BOOKING_CREATED, PAYMENT_PROOF_SUBMITTED, PAYMENT_CONFIRMED, PAYMENT_REJECTED, BOOKING_CANCELLED, BOOKING_EXPIRED, OWNER_REQUEST_APPROVED, OWNER_REQUEST_REJECTED, FACILITY_APPROVED, FACILITY_REJECTED, NEW_REVIEW. Không gửi email/SMS cho notification nghiệp vụ; email reset password thuộc auth.

## Booking State Machine

| Từ | Đến | Tác nhân/điều kiện | Tác động slot |
| --- | --- | --- | --- |
| PENDING_PAYMENT | PENDING_CONFIRMATION | Customer gửi proof hợp lệ, trước expires_at | Tiếp tục giữ |
| PENDING_PAYMENT | EXPIRED | Hệ thống, now >= expires_at | Nhả |
| PENDING_CONFIRMATION | CONFIRMED | Owner sở hữu duyệt proof đang SUBMITTED | Tiếp tục giữ |
| PENDING_CONFIRMATION | REJECTED | Owner từ chối, có lý do | Nhả |
| CONFIRMED | COMPLETED | Owner ghi nhận sau end_at, đã sử dụng sân và xử lý 70% trực tiếp | Kết thúc chiếm dụng; giữ lịch sử |
| PENDING_PAYMENT | CANCELLED | Customer sở hữu, hold chưa hết hạn | Nhả |
| CONFIRMED | CANCELLED | Customer trước cutoff hoặc Owner có lý do | Nhả; tạo Refund PENDING bằng 100% cọc đã xác nhận |

`COMPLETED`, `CANCELLED`, `REJECTED`, `EXPIRED` là trạng thái kết thúc, không mở lại. Ngoài các chuyển đổi trên đều bị từ chối. `cancelled_by` phân biệt CUSTOMER/OWNER; không tách Booking status theo người hủy. Refund có state machine riêng, REFUNDED không thuộc Booking status. Không có endpoint cho client gán status tùy ý.

## Cancellation và Refund

Quy tắc cọc/hoàn cọc ngày 2026-09-19 được giữ nguyên; baseline v1 ngày 2026-09-21 cập nhật riêng việc không cho Customer hủy PENDING_CONFIRMATION. Ví dụ tổng 200.000đ → cọc trước 30% = 60.000đ → thanh toán tại sân 70% = 140.000đ. Tỷ lệ cọc không phải tùy chọn của Owner.

| Booking hiện tại | Customer sở hữu được hủy? | Owner sở hữu được hủy? | Refund khi hủy thành công |
| --- | --- | --- | --- |
| PENDING_PAYMENT | Có khi hold còn hiệu lực; quá expires_at phải EXPIRED | Chưa cấp ngoài quy tắc CONFIRMED | Không: cọc chưa được xác nhận |
| PENDING_CONFIRMATION | Không | Phải Confirm hoặc Reject; không Cancel | Không phát sinh do hủy vì không cho hủy |
| CONFIRMED | Chỉ khi DB current_time < start_at - cutoff_hours snapshot | Có, bắt buộc cancellation_reason; không áp cutoff Customer | Có: 100% deposit đã được xác nhận |
| COMPLETED / REJECTED / EXPIRED / CANCELLED | Không | Không | Không tạo thêm |

cutoff_hours = 2, booking 18:00: Customer chỉ hủy trước 16:00; đúng 16:00 hoặc muộn hơn bị từ chối. Snapshot cutoff không thay đổi khi Owner sửa policy. TODO duy nhất về cấu hình thiếu: cách xử lý booking CONFIRMED không có snapshot cutoff; không tự đặt X mặc định. Tạm từ chối hủy Customer ở trường hợp thiếu dữ liệu đó; không chặn hủy PENDING_PAYMENT còn hạn hoặc hủy CONFIRMED của Owner. PENDING_CONFIRMATION luôn không cho Customer cancel.

Cancellation thành công lưu status=CANCELLED, cancelled_by=CUSTOMER hoặc OWNER lấy từ ngữ cảnh hành động đã được xác thực, cancellation_reason (bắt buộc Owner, tùy chọn Customer), cancelled_at. Trong cùng transaction: kiểm tra lại state/policy và cọc đã xác nhận, đổi status, nhả slot, tạo tối đa một Refund PENDING nếu đủ điều kiện. Booking đã CANCELLED không giữ slot dù refund chưa xong. PaymentProof được giữ làm lịch sử và không được duyệt tiếp sau khi booking hủy.

Refund chỉ phát sinh cho cọc đã được Owner xác nhận qua PaymentProof APPROVED. Customer hủy đúng hạn sau xác nhận, hoặc Owner hủy CONFIRMED, phải hoàn đủ deposit_amount snapshot; không hoàn tổng tiền sân hoặc phần 70%. Chưa xác nhận cọc → không có Refund trong website; nếu thực tế đã chuyển nhưng proof chưa được duyệt/bị từ chối/hết hạn, hai bên đối soát ngoài hệ thống, không khẳng định chưa từng có chuyển tiền.

Refund độc lập: `PENDING → PROOF_SUBMITTED → REFUNDED`. Owner chuyển tiền cho Customer ngoài hệ thống rồi upload minh chứng hoàn cọc; Customer chỉ xác nhận REFUNDED sau khi kiểm tra đã nhận tiền. Upload không tự chứng minh đã nhận tiền. Website lưu amount, reason, proof, trạng thái và các mốc lịch sử; không thực hiện chuyển tiền, không tự xác nhận thay Customer. Không mở lại Booking khi refund hoàn tất.

TODO: cách hai bên trao đổi tài khoản nhận hoàn tiền, xử lý tranh chấp/ảnh hoàn tiền sai hoặc Customer chưa phản hồi chưa được quy định; không tự thêm ngân hàng Customer, flow reject/resubmit refund hoặc auto-confirm.

## Business Rule Identifiers

| Rule | Quy tắc chính thức |
| --- | --- |
| BR-PAY-01 | Cọc cố định 30% total_amount, không có cấu hình tùy chọn |
| BR-PAY-02 | Backend tự tính total_amount, deposit_amount, remaining_amount và lưu snapshot |
| BR-PAY-03 | Customer chuyển khoản cọc 30% trước khi booking được xác nhận |
| BR-PAY-04 | Customer thanh toán 70% còn lại trực tiếp cho Owner tại sân |
| BR-PAY-05 | Website không xử lý giao dịch 70% trong MVP |
| BR-PAY-06 | PaymentProof chỉ dùng cho cọc 30% |
| BR-PAY-07 | Owner xác nhận cọc thì Booking mới CONFIRMED |
| BR-PAY-08 | Owner reject proof phải có rejection_reason; Booking chuyển REJECTED |
| BR-PAY-09 | Booking REJECTED không được resubmit proof; muốn đặt lại phải tạo booking mới |
| BR-CANCEL-01 | Customer hủy theo ma trận trạng thái chính thức ở trên |
| BR-CANCEL-02 | Customer hủy CONFIRMED chỉ khi current_time < start_at - cutoff_hours |
| BR-CANCEL-03 | Customer hủy đúng hạn sau khi cọc được xác nhận → hoàn 100% deposit |
| BR-CANCEL-04 | Đúng cutoff hoặc quá cutoff, Customer không thể tự hủy |
| BR-CANCEL-05 | Owner hủy CONFIRMED bắt buộc lý do |
| BR-CANCEL-06 | Owner hủy CONFIRMED đã nhận cọc → hoàn 100% deposit |
| BR-REFUND-01 | Website không tự chuyển tiền hoàn |
| BR-REFUND-02 | Owner chuyển khoản hoàn tiền bên ngoài hệ thống |
| BR-REFUND-03 | Owner upload refund proof riêng, không dùng PaymentProof |
| BR-REFUND-04 | Customer sở hữu booking xác nhận đã nhận tiền để Refund thành REFUNDED |
| BR-REFUND-05 | Booking status và Refund status độc lập; mỗi booking tối đa một refund |
| BR-REFUND-06 | Cancellation giải phóng slot và tạo Refund đủ điều kiện trong cùng transaction |

## Non-functional Requirements

- Giao diện tiếng Việt, responsive; tuân Figma đã có, không thiết kế lại tùy ý.
- Không double booking kể cả khi request đồng thời hoặc tác vụ expiry chạy chậm.
- Mật khẩu được hash, upload có kiểm tra, secrets qua environment variables, HTTPS khi deploy.
- Backend kiểm tra role/ownership, không coi frontend là ranh giới bảo mật.
- Giữ dữ liệu lịch sử booking/minh chứng; thông tin ngân hàng và chứng từ không công khai.
- Có log lỗi không chứa secrets, backup và hướng dẫn vận hành khi triển khai. TODO: mục tiêu tải, thời gian phản hồi, lưu giữ dữ liệu và chính sách backup cụ thể.

## MVP

| Priority | Phạm vi |
| --- | --- |
| P1 | Auth cơ bản, roles, Facility/Court, giá/cọc/ngân hàng, tìm kiếm, chi tiết, availability, booking 30 phút, chống trùng, hết hạn 5 phút, proof/Owner confirmation, lịch sử, duyệt Facility, cancellation policy/hủy booking/hoàn cọc thủ công, deployment |
| P2 | Google Login, review, favorite, notification, CourtBlock, thống kê Owner/Admin |
| P3 | Review images, advanced reports, advanced charts, advanced content management |

Cancellation và refund được ưu tiên P1 trong kế hoạch MVP cập nhật để hoàn tất vòng đời cọc 30%; đây là điều chỉnh ưu tiên thiết kế theo quy tắc mới. Các nghiệp vụ bổ trợ không được xếp rõ trong yêu cầu được ghi đề xuất ưu tiên ở FEATURE_STATUS. Trạng thái implementation và kiểm chứng thực tế theo FEATURE_STATUS. Tính năng P2/P3 không được quảng bá như đã có trong bản P1; phụ thuộc nghiệp vụ chưa hoàn thành phải được ẩn/khóa với giải thích.

## Court Core Phase 1 — quyết định đã duyệt

Court Core Phase 1 được chốt ngày 2026-09-26: Owner tạo/sửa Court khi Facility DRAFT/ACTIVE/REJECTED/SUSPENDED; PENDING khóa mutation, vẫn xem được. Court ACTIVE/INACTIVE, tên trim + NFC, unique trong Facility; có thể đổi tên khi đã có Booking nhưng giữ snapshot lịch sử. Thêm/sửa Court không đổi trạng thái hoặc metadata duyệt Facility, không cần duyệt lại. Không chuyển Facility hoặc DELETE Court. Chi tiết nguồn đặc tả: [COURT_SPEC.md](specs/COURT_SPEC.md).

## Future Scope

Thực hiện P2/P3 sau luồng P1. Không coi các chức năng đã loại trừ là cam kết tương lai.

Các TODO cần chốt: cấu hình vận hành email reset Resend; fallback khi thiếu snapshot cutoff; mở cửa qua đêm và giờ không tròn slot; duyệt lại chỉnh sửa cơ sở; xử lý Owner chậm duyệt/no-show; quy tắc search/sort; moderation/report/content; Figma cụ thể; nhà cung cấp lưu trữ/deploy và chính sách vận hành.

## Authentication baseline — 2026-09-23

Password 8–128 ký tự, có chữ cái và chữ số, không bắt buộc chữ hoa/ký tự đặc biệt. Email trim+lowercase, giữ dấu chấm/+tag. Session cố định 7 ngày, không gia hạn tự động. Register 5 request/15 phút/IP; login 20 request/15 phút/IP và 5 lần thất bại/15 phút/email normalized. Vượt ngưỡng trả 429, không khóa tài khoản. Chi tiết tại AUTH_SPEC.

## Owner Request baseline cập nhật — 2026-09-25

Rejection reason dài 1–500 ký tự sau trim. Danh sách phân trang mặc định page=1/page_size=20, tối đa page_size=100; yêu cầu mới nhất trước theo created_at DESC, id DESC. Admin khởi tạo bằng CLI nội bộ chủ động với password policy/Argon2id Auth hiện tại, không API public hoặc tự chạy deploy; email trùng bị từ chối, không nâng quyền Customer ngầm.

Backend Owner Request Phase 1 đã được kiểm thử; Owner approval bổ sung capability và thu hồi phiên để đăng nhập lại, không tạo/duyệt Facility. Notification approval/rejection giữ scope dự kiến nhưng chưa triển khai trong phase này. Frontend chưa triển khai.

## Facility Core Phase 1 — 2026-09-25

Các quyết định Phase 1 tại [FACILITY_SPEC.md](specs/FACILITY_SPEC.md). Quyết định này thay các TODO trước đó về edit/checklist/validation core: sửa chỉ DRAFT/REJECTED; submit/approve/activate chỉ yêu cầu core hợp lệ, không cần module con. ACTIVE chưa đồng nghĩa booking-ready. Registry district đã được chốt: 94 đơn vị hành chính cấp xã của TP Đà Nẵng (23 phường, 70 xã, 1 đặc khu), theo Nghị quyết 1659/NQ-UBTVQH15 ngày 16/06/2025. `district` là tên field legacy trong API/schema, biểu diễn phường/xã/đặc khu, không biểu diễn quận/huyện. UI sau này dùng nhãn Khu vực hoặc Phường/Xã. Không public search/frontend/module con/notification trong phase này.

## Facility Presentation — quyết định 2026-09-28

Facility Presentation Phase 1: Cloudinary public delivery, JPEG/PNG/WebP max5 MB/ảnh, max10; cover sort_order nhỏ nhất, liên tục 0..n-1, reorder toàn bộ. Backend áp giới hạn 25.000.000 pixel và Sharp decode; optimization nâng cao vẫn deferred. Owner xem mọi state, sửa mọi state trừ PENDING, không đổi approval metadata/re-approve. Ảnh/amenity không bắt buộc approval/booking-ready. Amenity Admin catalog, name trim+NFC 1–100, service default active; assignment replace-all nguyên tử, [] hợp lệ, duplicate/nonexistent/inactive422. Deactivate giữ liên kết, Owner thấy inactive, public tương lai ẩn. Chi tiết specs/FACILITY_PRESENTATION_SPEC.md; trạng thái implementation tại FEATURE_STATUS.

## Public Facility Phase 1 — quyết định 2026-09-29

Backend Public Facility Phase 1 đã triển khai và kiểm chứng ngày 2026-10-01. Guest không cần session; Facility ACTIVE + Owner User ACTIVE mới public. Owner LOCKED loại khỏi list/detail404, không thay Facility status hoặc booking lịch sử. ACTIVE thiếu module con vẫn public; không kiểm tra ngân hàng/slot, không tính/trả booking_ready.

Phase 1 chỉ q (trim+NFC, contains case-insensitive tên Facility hoặc ACTIVE Court, không bỏ dấu, không duplicate), một district trim+NFC theo registry và pagination1/20/max100, id ASC. Card chỉ core/cover/active amenities, không giá đại diện/rating. Detail core public/gallery/active amenities/ACTIVE Courts/toàn bộ PriceRule/policy; không Owner data/ngân hàng/metadata nội bộ. Amenity catalog public/filter, giá filter/sort, rating/popularity/date-time/advanced search/readiness deferred. Chi tiết [PUBLIC_FACILITY_SPEC.md](specs/PUBLIC_FACILITY_SPEC.md); mục tiêu search rộng hơn thuộc phase tương lai.

## Availability Phase 1 — quyết định 2026-10-01

Backend Phase 1 đã triển khai: guest đọc một Court/ngày hôm nay hoặc tương lai. Chỉ Court ACTIVE của Facility ACTIVE và Owner User ACTIVE. Slot30 phút, giờ Asia/Ho_Chi_Minh, một DB-time snapshot; hôm nay start_at <= snapshot là PAST. Priority PAST > BLOCKED > BOOKED > HELD > UNPRICED > AVAILABLE. CONFIRMED→BOOKED; PENDING_CONFIRMATION và PENDING_PAYMENT còn hạn→HELD; các state kết thúc/hold hết hạn không chặn.

Giá slot dự kiến hourly_rate/2 nếu đúng một rule, thiếu null (không giá0), nhiều rule là lỗi cấu hình không tự chọn; state khác vẫn có giá nếu xác định được. Không total quote, không BankAccount check, không booking_ready. Reader không tạo booking/lock hoặc expire/cleanup. Booking vẫn recheck ngân hàng/giá/lịch và chống trùng trong transaction. Contract tại [AVAILABILITY_SPEC.md](specs/AVAILABILITY_SPEC.md); không thay cọc/refund/cancellation.
