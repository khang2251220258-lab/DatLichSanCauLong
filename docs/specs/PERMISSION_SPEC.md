# Permission Specification

Booking Phase 1: POST /api/v1/bookings và GET /api/v1/bookings(/:id) cần session hợp lệ, User ACTIVE và CUSTOMER capability, gồm Approved Owner. ADMIN không kế thừa quyền này. List/detail luôn lọc customer_id của phiên; tài nguyên người khác trả404 RESOURCE_NOT_FOUND. Không dùng quyền sở hữu Facility để đọc booking khách khác qua route Customer. Facility/Court/Owner ngừng ACTIVE chặn create nhưng không chặn Customer ACTIVE đọc booking lịch sử của mình. POST dùng Origin/CSRF; GET chỉ lazy-expire booking sở hữu tại detail, không nhận thao tác ghi do client chỉ định. Xem BOOKING_SPEC cho whitelist.

Booking Configuration Owner GET/PUT theo [BOOKING_CONFIGURATION_SPEC.md](BOOKING_CONFIGURATION_SPEC.md): session User ACTIVE+OwnerProfile, chỉ Facility mình. 401 phiên,403 capability/Origin/CSRF,404 ngoài sở hữu. GET mọi state, PUT chặn PENDING bằng409 FACILITY_STATE_NOT_EDITABLE. Không Admin configuration API, không public bank exposure; không suy quyền cấu hình từ Facility approval.

Court Core Owner API theo [COURT_SPEC.md](COURT_SPEC.md): session User ACTIVE và OWNER capability; ownership qua Facility. CUSTOMER không OWNER và ADMIN không OWNER trả 403, tài nguyên ngoài sở hữu trả 404. Mutation có Origin/CSRF và recheck quyền sau khóa User → Facility → Court. Facility PENDING chặn create/PATCH bằng 409 FACILITY_STATE_NOT_EDITABLE; các state còn lại cho phép. View/list mọi state. Không Admin Court management, delete hoặc chuyển Court trong Phase 1.

## Nguyên tắc

Nguồn chuẩn: [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md). Ba nhóm quyền: CUSTOMER, OWNER, ADMIN. Approved Owner = Customer capabilities + Owner capabilities; CUSTOMER và OWNER không loại trừ nhau. users.role nền là CUSTOMER/ADMIN; OwnerProfile được duyệt bổ sung OWNER cho CUSTOMER. ADMIN không tự có Customer/Owner capability. Người chưa đăng nhập chỉ xem public data. Mọi quyền còn yêu cầu tài khoản ACTIVE và session hợp lệ nếu endpoint có xác thực.

Ký hiệu: “Của mình” là dữ liệu User sở hữu; “Cơ sở mình” là Facility.owner_id = session.user_id; “Toàn hệ thống” chỉ áp dụng đúng hành động nêu trong dòng, không có nghĩa toàn quyền mọi endpoint.

## Permission Matrix

| Hành động | CUSTOMER | OWNER | ADMIN |
| --- | --- | --- | --- |
| Xem/tìm Facility ACTIVE, Court/lịch public | Có | Có | Có |
| Hồ sơ, logout, đổi mật khẩu cục bộ | Của mình | Của mình | Của mình |
| Gửi Owner request | Của mình, một PENDING; sau REJECTED tạo request mới | Không cần gửi lại khi đã APPROVED | Không |
| Xem Owner request cá nhân | Của mình | Của mình, giữ toàn bộ lịch sử | Qua quản trị |
| Duyệt/từ chối Owner request | Không | Không | Toàn hệ thống, từ chối có lý do |
| Tạo/sửa Facility, ảnh, tiện ích | Không | Cơ sở mình, theo trạng thái được phép | Duyệt/quản lý trạng thái; không sửa hộ tùy ý |
| Gửi Facility duyệt | Không | Cơ sở mình DRAFT | Không |
| Duyệt/từ chối/đình chỉ/mở Facility | Không | Không | Toàn hệ thống |
| Quản lý Court, giá, chính sách hủy, ngân hàng | Không | Cơ sở mình | Không qua API Owner |
| Khóa/mở lịch Court | Không | Cơ sở mình, không chồng booking giữ chỗ | Không qua API Owner |
| Tạo booking | Của mình | Của mình qua Customer capability | Không |
| Xem booking | Của mình | Booking cá nhân qua Customer route; cơ sở mình qua Owner route | Toàn hệ thống, dữ liệu tối thiểu |
| Gửi/xem proof cọc | Booking của mình | Gửi/xem booking cá nhân qua Customer route; xem cơ sở mình qua Owner route | Không qua API proof thông thường |
| Xác nhận/từ chối proof | Không | Cơ sở mình | Không |
| Hủy booking | Của mình: PENDING_PAYMENT còn hạn; CONFIRMED chỉ trước cutoff; không hủy PENDING_CONFIRMATION | Booking cá nhân theo cùng rule Customer; Owner route chỉ CONFIRMED cơ sở mình, bắt buộc lý do | Không |
| Thay đổi tỷ lệ cọc | Không, cố định 30% | Không, cố định 30% | Không có chức năng chỉnh tỷ lệ |
| Xem Refund/proof hoàn cọc | Booking của mình | Booking cá nhân hoặc cơ sở mình, theo route/quyền sở hữu | Không cấp qua API Refund |
| Upload refund proof | Không | Cơ sở mình, Refund PENDING | Không |
| Xác nhận đã nhận refund | Booking của mình, Refund PROOF_SUBMITTED | Được cho booking cá nhân với Customer capability; không thay khách khác | Không |
| Ghi nhận COMPLETED | Không | Cơ sở mình, CONFIRMED, đã qua end_at, sử dụng sân và xử lý 70% trực tiếp | Không |
| Favorite | Của mình | Của mình qua Customer capability | Không |
| Tạo review | Booking COMPLETED của mình, một lần | Cùng quyền Customer với booking cá nhân COMPLETED | Không |
| Xem review public | Có | Có | Có |
| Xem review quản lý | Của mình | Review cá nhân và review cơ sở mình theo từng route | Toàn hệ thống |
| Ẩn/hiện review | Không | Không | Có, lưu lý do; quy trình moderation TODO |
| Xem danh sách Customer | Không | Chỉ khách có booking tại cơ sở mình | Toàn hệ thống |
| Khóa/mở tài khoản Customer/Owner | Không | Không | Có |
| Quản lý danh mục Amenity | Không | Chỉ liên kết amenity đang có | Có |
| Report | Gửi khi phạm vi/đối tượng được chốt | Cùng Customer capability, cùng giới hạn TODO | Quản lý khi quy trình được chốt |
| Quản lý Content | Không | Không | Có, loại nội dung còn TODO |
| Xem/đánh dấu notification | Của mình | Của mình | Của mình |
| Dashboard/thống kê | Booking cá nhân | Cả dashboard Customer cá nhân và dashboard Owner cơ sở mình | Toàn hệ thống |

Khách không đăng nhập không có quyền tạo booking, upload proof, favorite hoặc review. Màn hình Checkout/Payment nằm trong hành trình public nhưng phải có Customer capability đã đăng nhập (bao gồm Approved Owner) trước thao tác tạo booking/thanh toán.

## Ownership Rules

- Owner A không được sửa Facility, Court, PriceRule, CancellationPolicy, BankAccount hoặc CourtBlock của Owner B, kể cả đoán được ID.
- Với tài nguyên gián tiếp, kiểm tra qua FK: PaymentProof hoặc Refund → Booking → Court → Facility → owner_id. Không nhận owner_id làm bằng chứng quyền.
- Customer chỉ đọc/sửa profile, booking, proof cọc, refund/proof hoàn cọc, favorite, review và notification theo user_id của phiên. ID trong path chỉ xác định tài nguyên cần kiểm tra.
- Owner Customers chỉ lấy người có booking tại Facility của Owner đó; chỉ trả id, full_name, phone và số liệu booking liên quan. Không lộ lịch sử ở Owner khác, password, session, Google subject hoặc dữ liệu không cần thiết.
- Admin booking view phục vụ giám sát; không cấp quyền xem file proof ngân hàng nhạy cảm mặc định. TODO nếu cần điều tra report yêu cầu quyền bổ sung phải cập nhật tài liệu trước.
- Notification dành cho người nhận; Admin không được đọc inbox của người khác qua endpoint notification cá nhân.
- Review bị ẩn không xuất hiện public; Customer tác giả/Owner liên quan/Admin vẫn thấy trạng thái qua màn hình quản lý phù hợp.

## Kiểm soát ở Backend

Kiểm tra session ACTIVE → role → ownership → trạng thái tài nguyên → business rules trước khi ghi. List query phải scope ngay trong truy vấn, không lấy toàn bộ rồi lọc frontend. Truy cập ID ngoài sở hữu trả 404 RESOURCE_NOT_FOUND; sai role ở nhóm route trả 403 FORBIDDEN.

Upload xem/xóa file cũng cần cùng quyền, không chỉ API metadata. Trả URL proof có thời hạn sau kiểm tra quyền. Không public bucket proof.

Admin khóa/mở tài khoản chỉ áp dụng CUSTOMER/OWNER trong scope hiện tại; không có UI tự tạo/nâng/cấp lại ADMIN. Owner approval chỉ thêm OwnerProfile/capability, giữ CUSTOMER; client không chỉ định role/capabilities.

## Cancellation / Refund Ownership

Customer không bị áp cutoff khi hủy PENDING_PAYMENT còn hạn. CONFIRMED chỉ hủy khi DB now < start_at - cutoff_hours snapshot; đúng cutoff bị từ chối. Owner chỉ được hủy CONFIRMED thuộc cơ sở mình trong phạm vi đã chốt, reason bắt buộc, không bị áp cutoff Customer. Các trạng thái kết thúc không được hủy. PENDING_CONFIRMATION không countdown, không tự expire, không có Customer cancel; Owner phải Confirm hoặc Reject. cancelled_by lấy từ ngữ cảnh route đã xác thực: Customer route là CUSTOMER kể cả tài khoản có Owner capability; Owner route là OWNER.

Customer hủy đúng hạn sau xác nhận cọc hoặc Owner hủy CONFIRMED → tạo Refund PENDING bằng 100% deposit snapshot cùng transaction hủy/nhả slot. Hủy PENDING_PAYMENT chưa xác nhận cọc không tạo Refund; PENDING_CONFIRMATION không cho hủy. Refund không giữ slot, không đổi Booking CANCELLED.

Owner A không xem/upload refund của Owner B; Customer A không xem/xác nhận refund thuộc Booking của Customer B. Quyền tải ảnh hoàn cọc cũng phải kiểm tra ownership, không chỉ metadata. Không ai có API sửa refund amount hoặc tạo record tùy ý.

Owner upload chỉ từ PENDING → PROOF_SUBMITTED; Customer sở hữu mới xác nhận PROOF_SUBMITTED → REFUNDED. Không cho Owner trong ngữ cảnh quản lý hoặc Admin xác nhận thay Customer khác; Approved Owner được xác nhận refund của booking cá nhân bằng Customer route. Website không chuyển tiền tự động; 70% trả tại sân không có proof/workflow trên website.

## TODO cần chốt

fallback khi CONFIRMED thiếu cutoff snapshot; moderation/report/content. Facility Phase 1 chặn sửa core ACTIVE/PENDING/SUSPENDED; chỉ DRAFT/REJECTED được sửa. Những ô TODO chưa được cấp quyền mặc định, UI không được hiện hành động như đã hỗ trợ.

## Owner Request và Facility Approval độc lập

Customer gửi request PENDING; Admin approve tạo OwnerProfile, giữ Customer capability và thêm Owner capability. Reject bắt buộc rejection_reason và giữ lịch sử; Customer tạo request mới, không reopen record cũ. Backend và DB cùng ngăn nhiều PENDING/user. Approved Owner không được tạo yêu cầu cấp Owner trùng.

Duyệt Owner không duyệt Facility: Approved Owner tạo cơ sở DRAFT và gửi PENDING riêng; Admin chỉ duyệt Facility đó. Facility REJECTED/SUSPENDED không thu hồi Customer capability. Hai quy trình có endpoint và state riêng.

## Owner Request backend Phase 1 — 2026-09-25

Customer endpoints kiểm tra CUSTOMER capability và scope user_id từ session. Approved Owner vẫn xem lịch sử/detail cá nhân nhưng tạo request mới trả ALREADY_OWNER. Admin chỉ dùng Admin endpoints; không thừa hưởng CUSTOMER. Tất cả POST có Origin/CSRF; request của người khác được xử lý như không tồn tại (404). Approve revoke toàn bộ phiên applicant; đăng nhập lại trả CUSTOMER + OWNER nhờ OwnerProfile, không đổi users.role. Không tạo hoặc duyệt Facility trong flow này.

## Facility Core Phase 1 — 2026-09-25

Các quyết định Phase 1 tại [FACILITY_SPEC.md](FACILITY_SPEC.md). Quyết định này thay các TODO trước đó về edit/checklist/validation core: sửa chỉ DRAFT/REJECTED; submit/approve/activate chỉ yêu cầu core hợp lệ, không cần module con. ACTIVE chưa đồng nghĩa booking-ready. Registry district đã được chốt: 94 đơn vị hành chính cấp xã của TP Đà Nẵng (23 phường, 70 xã, 1 đặc khu), theo Nghị quyết 1659/NQ-UBTVQH15 ngày 16/06/2025. `district` là tên field legacy trong API/schema, biểu diễn phường/xã/đặc khu, không biểu diễn quận/huyện. UI sau này dùng nhãn Khu vực hoặc Phường/Xã. Không public search/frontend/module con/notification trong phase này.

## Facility Presentation — quyết định 2026-09-28

Presentation: Owner sở hữu xem mọi state, sửa mọi state trừ PENDING, không đổi approval metadata/re-approve. Admin catalog; Owner chỉ gán ACTIVE và xem inactive đã gán. Public tương lai ẩn inactive. Ảnh public Cloudinary không tự mất quyền truy cập theo Facility state; không áp cho proof. Xem FACILITY_PRESENTATION_SPEC.md.

## Public Facility Phase 1 — specification

Guest không cần session; list/count/detail lọc Facility ACTIVE và Owner User ACTIVE. Owner LOCKED/Facility không ACTIVE loại khỏi list, detail404 RESOURCE_NOT_FOUND. Chỉ whitelist theo PUBLIC_FACILITY_SPEC.md; không Owner data/bank/approval metadata/public_id/image_path/booking_ready. Amenities/Courts chỉ active. Không thay quyền Owner/Admin. Backend đã triển khai và kiểm chứng; xem FEATURE_STATUS.
