# Hướng dẫn cho AI Coding Agents
## Project workflow và skill routing

Project dùng workflow `SPEC → PLAN → TASK → IMPLEMENT → TEST → REVIEW` với hướng dẫn tại `.agents/skills/{spec,plan,task,implement,test,review}/SKILL.md`. Route theo ý định: review/audit/kiểm tra → `review`; phân tích contract → `spec`; lập kế hoạch → `plan`; chia việc → `task`; triển khai → `implement`; kiểm thử → `test`. Không phụ thuộc cứng vào từ khóa.

Nếu user yêu cầu hoàn thiện feature từ đầu đến cuối, áp dụng nội bộ toàn workflow và tiếp tục qua implementation, test, review. Không trả “READY FOR IMPLEMENTATION” làm kết quả cuối khi user đã yêu cầu implementation, trừ khi có blocker thật. `implement` là skill duy nhất mặc định được sửa application source; các phase khác chỉ ghi source khi user cho phép rõ.

## Thứ tự nguồn chuẩn

1. Database schema/migration hiện hành quyết định structural persistence constraints.
2. Backend/frontend source hiện hành quyết định behavior đã implement.
3. Approved/current contracts và specs quyết định behavior phải implement.
4. Approved UI references quyết định presentation, không quyết định capability hay dữ liệu runtime.
5. Documentation/status hiện hành mô tả trạng thái và evidence.
6. Historical/superseded documentation chỉ lưu lịch sử, không hạ trạng thái hiện tại.

Docs stale không ghi đè source. Nếu source và approved contract mâu thuẫn thực sự, dừng phần bị ảnh hưởng và báo blocker; không tự chọn một phía hoặc âm thầm đổi contract.

## An toàn chung cho mọi phase

- Không migration khi chưa chứng minh schema change cần thiết và task chưa cho phép; không sửa migration đã apply.
- Không seed nếu task không yêu cầu; không mutate persistent demo data để test.
- Automated tests không gọi Cloudinary, Resend hoặc production external service; dùng adapter/fake và cleanup fixture.
- Không expose private storage identifier, credential, token, hash hoặc internal path.
- Không hard-code dữ liệu PNG/mock thành runtime contract.
- Mutation giữ auth, capability, ownership, Origin/CSRF; không tin client về actor, ownership, state, amount hoặc server-managed metadata.
- Giữ DTO whitelist, strict response validation, DB time, transaction và lock order đã được source/spec xác nhận.
- Approved Owner giữ CUSTOMER capability và có thêm OWNER capability.
- Không làm yếu test. Chỉ báo PASS/COMPLETE khi có evidence; suite chưa chạy ghi `NOT RUN`.
- Không tự phát minh API/schema/behavior hay mở rộng business rule. Giữ lịch sử bằng nhãn historical/superseded khi phù hợp.

## Lệnh kiểm chứng hiện hành

Trên Windows dùng `npm.cmd` trong đúng package:

- Frontend: `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.
- Backend local: `npm.cmd test`.
- PostgreSQL integration có scripts `test:auth:db`, `test:password:db`, `test:owner:db`, `test:facility:db`, `test:court:db`, `test:booking-config:db`, `test:presentation:db`, `test:payment:db`.
- Integration không có npm script chạy theo file hiện hành, ví dụ `node --test test/booking.integration.js`, `test/availability.integration.js`, `test/public-facility.integration.js`.

Chạy targeted trước, DB integration khi liên quan persistence/transaction, regression liên quan, rồi full suite/lint/build theo rủi ro. Luôn kiểm tra `package.json` và file test tại thời điểm chạy.

Refund workflow đã triển khai ngày 2026-10-10: đọc `docs/specs/PAYMENT_SPEC.md`, `docs/specs/BOOKING_SPEC.md` và hai approved PNG `owner-booking-refund-desktop.png`, `customer-booking-refund-desktop.png`. UI nằm trong Booking Detail; API read/mutation theo `refund_id`. Proof JPEG/PNG ≤5 MB, ≤25 triệu decoded pixels, private/authenticated, immutable sau submit. State duy nhất `PENDING → PROOF_SUBMITTED → REFUNDED`; không Refund Center, replace/delete/resubmit, dispute hoặc auto-refund.

Stabilization Phase 4 ngày 2026-10-07: baseline hiện tại đã gom status labels theo domain và response validation Booking create; không xây design system/framework validator lớn. Performance query budget: Public List 2, Detail 2, Availability 3, Owner Booking 6. Owner Booking là fixed fan-out, **không phải N+1** theo query-count evidence. Không tối ưu RTT/cold-start/cache/deployment cho đến phase deploy. Trạng thái feature chuẩn nằm ở đầu `docs/FEATURE_STATUS.md`; các dòng “chưa triển khai” trong ghi nhận phase lịch sử không được dùng thay trạng thái hiện tại.

Payment core backend/frontend đã hoàn tất: Customer upload/read proof riêng tư, Owner confirm/reject, Bank Account + QR, Booking bank/QR snapshot, confirmed cancellation và Refund workflow. Đọc `docs/specs/PAYMENT_SPEC.md` trước khi sửa proof, Refund hoặc `/bookings/:id/payment`. Frontend chỉ gửi một field multipart `image`, dùng Booking snapshot và server-time countdown; không tự gán EXPIRED. Notification vẫn deferred; không tự mở rộng phase.

Booking Configuration Phase 1: đọc `docs/specs/BOOKING_CONFIGURATION_SPEC.md` trước thay price/policy/bank. GET/PUT Owner, mutation khóa User → Facility và recheck state/ownership. PENDING chặn PUT, không đổi approval metadata. Price atomic replace gồm [], max48; policy0..168; bank text giữ QR. Không schema/migration hoặc QR/Admin/public/Booking implementation ngoài scope.

HISTORICAL/SUPERSEDED — Ngày 2026-09-28, Booking Configuration Phase 1 backend mới chỉ có cấu hình text và QR/Public/Availability/Booking còn ngoài scope. Các phase sau đã triển khai QR, Public, Availability và Booking; trạng thái hiện tại theo đầu `docs/FEATURE_STATUS.md`.

Court Core Phase 1: đọc `docs/specs/COURT_SPEC.md` trước khi sửa Court. Không áp ma trận Facility core cho Court: Court chỉ bị chặn mutation khi parent PENDING; không làm đổi approval metadata hoặc yêu cầu duyệt lại. Name trim+NFC; giữ UNIQUE hiện tại. Khóa User → Facility → Court và recheck quyền/state; không sửa booking snapshot khi đổi tên. Không DELETE/chuyển Facility/Admin Court/public/availability/module vận hành khác trong scope này.

Ngày 2026-09-27: Court Core backend đã triển khai và kiểm chứng PostgreSQL + regression, READY; xem FEATURE_STATUS. Không tự chuyển sang module tiếp theo.

## Trước khi thay đổi

1. Luôn đọc `docs/PROJECT_OVERVIEW.md` trước khi làm việc; đây là nguồn chuẩn nghiệp vụ.
2. Đọc các spec liên quan trong `docs/specs/`: booking, payment, auth và permission theo phạm vi thay đổi.
3. Đọc `docs/DATABASE.md` nếu thay database, entity, constraint hoặc transaction.
4. Đọc `docs/API_SPEC.md` nếu thêm/sửa API hoặc contract dữ liệu.
5. Đọc `docs/UI_UX_SPEC.md` nếu thay frontend; bám Figma đã có, không tự redesign.
6. Đọc `docs/ARCHITECTURE.md` để giữ kiến trúc modular monolith và ranh giới module.

## Quyết định công nghệ

- Stack chính thức: React + Vite → Node.js + Express REST API → Prisma → PostgreSQL hosted trên Supabase; modular monolith.
- Supabase chỉ cung cấp PostgreSQL hosting; không dùng Supabase Auth/Storage/Realtime/Edge Functions. Authentication theo AUTH_SPEC do Express xử lý; React không truy cập DB trực tiếp.
- Prisma khi triển khai dùng provider = "postgresql". DATABASE_URL chỉ ở backend; DIRECT_URL hoặc cấu hình tương đương nếu công cụ migration cần. Không commit credential/connection string thật.
- Giữ partial unique index một Owner Request PENDING/user, PK court_slot_locks và transaction/khóa hàng theo DATABASE.md. Không thay DB constraint bằng kiểm tra availability đơn thuần.

## Quy tắc triển khai

- Không tự thay business rules hoặc thêm feature ngoài scope. TODO không phải quyết định được phê duyệt; làm rõ quy tắc trước khi triển khai phần phụ thuộc.
- Nếu phát hiện mâu thuẫn, ưu tiên yêu cầu đã được người dùng chốt và `docs/PROJECT_OVERVIEW.md`, đồng bộ các tài liệu liên quan trước khi sửa behavior.
- Không thay business rule nếu chưa cập nhật documentation; cập nhật docs khi implementation/contract thay đổi.
- Ưu tiên code đơn giản, dễ bảo trì cho dự án một người. Không over-engineer, không microservices.
- Backend phải enforce authorization, ownership, input validation và business rules. Frontend không phải security boundary.
- Backend tự tính giá/cọc và kiểm tra lại availability; không tin amount/status/customer_id/owner_id từ client.
- Mọi thay đổi giữ/nhả slot phải tuân transaction và cơ chế chống double booking đã mô tả trong BOOKING_SPEC/DATABASE.
- CUSTOMER chỉ truy cập dữ liệu của mình; OWNER chỉ truy cập tài nguyên cơ sở của mình. ADMIN không xác nhận payment thay OWNER trong flow bình thường.
- Hash password; validate upload; dùng environment variables; không commit secrets hoặc log credential/token/proof nhạy cảm.
- Cọc cố định DEPOSIT_RATE = 30% do backend tính, remaining 70% trả trực tiếp tại sân. Không thêm cấu hình tỷ lệ cọc cho Owner hoặc workflow/proof cho 70%.
- Booking REJECTED không resubmit proof; muốn đặt lại phải tạo booking mới. Countdown 5 phút chỉ áp dụng PENDING_PAYMENT. PENDING_CONFIRMATION không countdown, không tự expire, Customer không được cancel; Owner phải Confirm hoặc Reject.
- Tuân ma trận hủy và cutoff nghiêm ngặt đã chốt; cancelled_by là metadata CUSTOMER/OWNER. Hủy CONFIRMED đủ điều kiện tạo Refund bằng 100% cọc đã xác nhận cùng transaction nhả slot.
- Refund có state riêng PENDING → PROOF_SUBMITTED → REFUNDED; Owner chuyển tiền ngoài hệ thống và upload proof, Customer xác nhận đã nhận. Không thêm REFUNDED vào BookingStatus, không auto-confirm/refund.
- Không thêm email/SMS notification nghiệp vụ, payment gateway, bank scraping hoặc automated refund. Email reset mật khẩu là ngoại lệ auth đã chốt: token ngẫu nhiên một lần, hết hạn 15 phút, DB chỉ lưu hash, response không tiết lộ email tồn tại.
- Chạy kiểm chứng phù hợp thay đổi và báo rõ giới hạn; không tuyên bố đã kiểm thử điều chưa chạy.
- Cập nhật `docs/FEATURE_STATUS.md` sau khi feature thực sự hoàn thành và được kiểm chứng. Viết xong tài liệu không đồng nghĩa feature DONE.

- Approved Owner giữ toàn bộ Customer capability và được bổ sung Owner capability; không thay CUSTOMER bằng OWNER loại trừ nhau. Backend/route phải kiểm tra capability và sở hữu dữ liệu theo ngữ cảnh hành động.
- Owner Request PENDING/APPROVED/REJECTED; reject bắt buộc rejection_reason, giữ lịch sử và cho tạo request mới, tối đa một PENDING/user. Owner approval không đồng nghĩa Facility approval.
- Google-only tiếp tục Google Login, không xây account-linking hoặc dùng reset/change để thêm mật khẩu trong MVP.

## Trạng thái dự án hiện tại

Documentation baseline: v1.

Đã scaffold React/Vite và Express health API, cấu hình Prisma 7.10.0. Ngày 2026-09-23 đã apply initial migration `20260922000000_init` lên Supabase và xác minh 24 bảng cùng constraint/index; integration fixture đã rollback. Xem docs/plans/PRISMA_SCHEMA_REVIEW.md. Report tiếp tục hoãn; Auth giai đoạn 1 và Reset/Change Password đã triển khai, kiểm thử. Forgot đã xác minh Resend delivery thật trong development, người dùng xác nhận ngày 2026-09-24; token test lộ đã invalidated, giữ User test. Backend Auth Phase 2 và frontend reset-password đã hoàn tất; Google Login chưa triển khai. Xem FEATURE_STATUS. Owner Request backend Phase 1 đã triển khai và kiểm thử, gồm Admin bootstrap CLI chủ động; rejection_reason 1–500 sau trim, pagination 1/20/max100, order created_at DESC/id DESC. Notification delivery/frontend chưa triển khai; Public Facility Phase 1 backend đã hoàn tất ngày 2026-10-01. Các feature khác theo FEATURE_STATUS. Không sửa migration đã apply, reset database hoặc tự chuyển sang implementation nghiệp vụ khi chưa được yêu cầu.

## Facility Phase 1

Đọc docs/specs/FACILITY_SPEC.md trước khi thay Facility. Code Phase 1 có Owner/Admin core routes. Registry district đã được chốt: 94 đơn vị hành chính cấp xã của TP Đà Nẵng (23 phường, 70 xã, 1 đặc khu), theo Nghị quyết 1659/NQ-UBTVQH15 ngày 16/06/2025. `district` là tên field legacy trong API/schema, biểu diễn phường/xã/đặc khu, không biểu diễn quận/huyện. UI sau này dùng nhãn Khu vực hoặc Phường/Xã. Không sửa tên field/schema hoặc dùng danh sách hành chính cũ. Chỉ sửa DRAFT/REJECTED; checklist submit/approve/activate chỉ core và Owner ACTIVE, không module con. ACTIVE chưa đồng nghĩa booking-ready. Không tự triển khai Public/Court/price/policy/bank/images/amenities/notification hoặc delete.

Ngày 2026-09-26: Facility Core Phase 1 backend đã hoàn tất và kiểm chứng với registry runtime 94 đơn vị cấp xã. Không còn blocker district. Giữ nguyên schema/migration; xem FEATURE_STATUS và FACILITY_SPEC cho bằng chứng test và phạm vi.

## Facility Presentation — quyết định 2026-09-28

Trước sửa ảnh/amenity đọc docs/specs/FACILITY_PRESENTATION_SPEC.md. Cloudinary public image/upload, image_path lưu public_id; max 10 ảnh, JPEG/PNG/WebP tối đa 5.000.000 byte, magic-byte validation, Sharp decode và tối đa 25.000.000 pixel. Mutation chỉ chặn PENDING, không đổi approval metadata. Catalog Admin, assignment atomic replace-all ACTIVE; deactivate giữ liên kết. Ngày 2026-09-28: Backend Presentation đã PASS local/PostgreSQL/regression và READY; xem FEATURE_STATUS. Ngày 2026-09-29 đã xác minh đúng 1 real upload/delivery/delete, Admin API xác nhận asset test không còn; fixture cleanup, local29/PostgreSQL83 PASS, health200. Xem FEATURE_STATUS. Không tự chuyển Public/Availability/Booking/frontend, không migration hoặc upload thật khi thiếu cấu hình.

Facility Presentation hiện đã hoàn tất cả backend và Owner frontend. Owner catalog GET /owner/amenities chỉ trả ACTIVE theo name/id ASC, không pagination. Cleanup MVP best-effort ngoài transaction, log code/public_id khi destroy fail, giữ lỗi gốc; automated orphan reconciliation vẫn deferred. Khi sửa module này, chạy npm test, test:presentation:db và regression liên quan; không đổi schema/.env/CA/TLS nếu không có yêu cầu riêng.

## Public Facility Phase 1 — backend implementation

Đọc docs/specs/PUBLIC_FACILITY_SPEC.md trước implementation. Backend đã triển khai và kiểm chứng ngày 2026-10-01: guest; Facility ACTIVE + Owner User ACTIVE; q/district/page/page_size, id ASC; Public whitelist không bank/Owner/internal metadata/public_id/booking_ready. Query deferred lỗi rõ, không silently ignore. Không mở rộng Availability/Booking/frontend/public Amenity catalog. Không migration/index mới khi chưa có bằng chứng cần. Spec READY không phải feature DONE.

Public regression: npm test, node --test test/public-facility.integration.js và auth/password/owner/facility/court/booking-config/presentation integration. Ngày 2026-10-01 local32/32, Public PostgreSQL8/8, regression83/83 PASS; fixture cleanup/rollback, health200. Không mở rộng phase. Public API không dùng DTO Owner/Admin, không đọc ngân hàng/slot hoặc ghi dữ liệu; giữ response whitelist và visibility predicate trong query.

## Payment Backend Phase 1 — 2026-10-06

Đọc `docs/specs/PAYMENT_SPEC.md` trước khi sửa Payment. POST `/api/v1/payments/bookings/:booking_id/proof` đã triển khai trong `src/modules/payments`: CUSTOMER sở hữu booking, Origin/CSRF, multipart đúng một `image`; JPEG/PNG tĩnh <=5,000,000bytes và <=25,000,000pixels, Sharp decode thật. Storage dùng adapter Cloudinary riêng `type=authenticated`, identifier UUID; không dùng Facility public adapter hoặc trả image_path/URL. Upload ngoài transaction; sau upload khóa User IDs tăng dần → Facility → Court → Booking → PaymentProof, dùng DB time. Proof SUBMITTED + PENDING_CONFIRMATION nguyên tử và giữ slot locks; expiry commit EXPIRED/nhả locks trước409. Cleanup phải khóa/kiểm tra DB reference trước destroy khi COMMIT chưa rõ. Customer GET proof, Owner review confirm/reject, Bank Account + QR snapshot delivery và Refund workflow đã triển khai; notification và automated reconciliation vẫn deferred.

Kiểm chứng: local47/47, Payment PostgreSQL12/12, toàn bộ integration regression PASS; health200, fixture cleanup. Chạy `npm test`, `npm run test:payment:db` và regression liên quan khi sửa. Không đổi schema/initial migration; Sharp 0.35.5 là decoder đã chốt cho proof.

## Availability Phase 1 — backend

Đọc docs/specs/AVAILABILITY_SPEC.md trước implementation. Backend đã triển khai: guest một Court/ngày hôm nay/tương lai, Court/Facility/Owner ACTIVE, một DB-time snapshot. Priority PAST > BLOCKED > BOOKED > HELD > UNPRICED > AVAILABLE; PENDING_CONFIRMATION HELD không expiry. Không BankAccount check, total quote hoặc writer/cleanup trong GET. Giá một rule /2 decimal, thiếu null, nhiều rule409 PRICE_NOT_CONFIGURED. Không schema/migration hoặc tự mở rộng Booking/frontend; Xem FEATURE_STATUS để biết kết quả kiểm chứng. Transaction READ ONLY + RepeatableRead; regression gồm Availability, Public, Presentation, Booking Configuration, Court, Facility, Owner Request, Auth và Password.

## Frontend Auth F1 — 2026-10-02

Đọc docs/ui-reference/README.md và sáu PNG approved trước sửa Auth UI. React Router/fetch/Context/system-ui; /login,/register,/forgot-password,/reset-password đã triển khai, 20 test/lint/build PASS. Register bỏ phone/Google, không auto-login; login về / scaffold. Forgot Sent/Reset Success cùng route, không khẳng định email delivery. Không storage/log reset/session token; lấy fragment trước router rồi xóa URL. GET session401 guest, network/5xx error; CSRF trong memory. Chạy frontend npm test/lint/build khi thay Auth frontend. Không tự triển khai Change Password/Google/Home hoặc module khác; ghi nhận frontend reset chưa có ở các phase trước là lịch sử. Không sửa .env thật; cấp VITE_API_BASE_URL theo môi trường.

## Booking Phase 1 — backend, 2026-10-04

Đọc BOOKING_SPEC/API_SPEC trước sửa Booking. Module src/modules/bookings có POST/create và GET list/detail cá nhân. Giữ User IDs tăng dần, deduplicate → Facility → Court → Booking liên quan → slot locks; recheck session/state/time sau khóa. Tiền dùng BigInt đơn vị nửa đồng, batch slots/locks; không tin amount/status từ client. Lazy expiry create/detail nguyên tử, giữ lịch sử; list/Availability chỉ đọc. Không PaymentProof/worker/frontend. Chạy npm test, node --test test/booking.integration.js và toàn bộ backend integration regression; fixture cleanup bắt buộc. Xem FEATURE_STATUS cho bằng chứng, không sửa .env/CA/TLS/schema/migration.

