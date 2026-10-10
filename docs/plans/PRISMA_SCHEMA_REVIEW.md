# Prisma Schema Review — Giai đoạn 1, 2 và 3

## Trạng thái hiện tại — 2026-09-23

Initial migration `20260922000000_init` đã apply lên Supabase PostgreSQL bằng `node node_modules/prisma/build/index.js migrate deploy` từ backend. Các phần giai đoạn 1/2 bên dưới là lịch sử, bao gồm các dòng NOT APPLIED tại thời điểm review. Giữ nguyên file migration đã apply, kể cả comment lịch sử, để bảo toàn checksum.

- Pre-check: DATABASE_URL và CA configured; verification bật; TLS/authentication/SELECT 1 SUCCESS. CLI/runtime cùng đích Supabase cấu hình tại project. Metadata: database `postgres`, schema `public`, PostgreSQL 17.6. Trước apply public không có bảng, không có `_prisma_migrations`, không conflict.
- Apply: SUCCESS. Truy vấn `_prisma_migrations` xác nhận đúng một migration, có finished_at, không rolled_back_at; checksum SHA-256 khớp nguyên file SQL.
- Catalog thực tế: 24 bảng nghiệp vụ, không reports; 24 PK, 36 FK RESTRICT cả DELETE/UPDATE, 76 CHECK đúng tên M01–M16 và validated; 17 UNIQUE index toàn bảng, 1 partial UNIQUE index, 27 normal index. Tên index khớp SQL, tất cả valid. Index hỗ trợ PK tính riêng.
- Partial unique OwnerRequest, PK CourtSlotLock `(court_id,start_at)`, UNIQUE booking_slot_id và UNIQUE refunds.booking_id: PASS.
- Integration tests dùng SAVEPOINT và transaction ROLLBACK: invalid Booking/Refund/OwnerRequest status; tiền âm; sai cọc/remaining; slot sai 30 phút; rating ngoài 1..5; hash sai kích thước cho cả reset/session; refund âm; duplicate Refund; duplicate PENDING OwnerRequest; duplicate CourtSlotLock: PASS với đúng SQLSTATE và tên constraint kỳ vọng. REJECTED + REJECTED + PENDING cùng User được chấp nhận.
- Fixture chỉ chạy khi toàn bộ 24 bảng rỗng, dùng ID tường minh để không tăng sequence. Sau ROLLBACK, số dòng cả 24 bảng bằng trước test và bằng 0. Không seed, không lưu admin/fixture, không sửa dữ liệu thật.
- Script kiểm chứng: [verify-database-foundation.js](../../backend/scripts/verify-database-foundation.js). Chạy thủ công từ backend bằng `node scripts/verify-database-foundation.js`; script dừng phần fixture nếu có dữ liệu nghiệp vụ, không thuộc startup ứng dụng.
- Prisma format/validate/generate: SUCCESS. Backend Express được mở tạm trên loopback với cổng tự cấp; GET /api/v1/health HTTP 200, response cũ giữ nguyên; listener đã đóng.
- `prisma migrate status` lần đầu FAILED với P1001 (không kết nối được endpoint tại lần kiểm tra đó); retry read-only SUCCESS: `Database schema is up to date`. Không sửa migration history hoặc TLS.
- Không implement API/feature; FEATURE_STATUS giữ nguyên, mọi feature nghiệp vụ vẫn TODO. Chưa kiểm thử concurrency end-to-end hoặc transaction Booking service. Report tiếp tục hoãn; các TODO nghiệp vụ không thay đổi.

INITIAL MIGRATION APPLIED: YES

DATABASE STRUCTURE VERIFIED: YES

TEST DATA REMAINING: NO

DATABASE FOUNDATION READY: YES (phạm vi schema và constraint; chưa có nghiệp vụ).

Documentation baseline: v1. Nguồn thiết kế: [DATABASE.md](../DATABASE.md); file triển khai: [schema.prisma](../../backend/prisma/schema.prisma). Giai đoạn 2 đã tạo SQL offline tại [migration.sql](../../backend/prisma/migrations/20260922000000_init/migration.sql), chưa apply hoặc thay đổi Supabase. Các kết quả giai đoạn 1 phía dưới là lịch sử; kết quả và danh sách CHECK thực tế của giai đoạn 2 nằm cuối tài liệu.

Đã biểu diễn 24 model, 36 FK. User đã yêu cầu tạm hoãn Report vì tài liệu chưa chốt đối tượng/FK mục tiêu. Không tạo model nháp, polymorphic target_id hoặc trạng thái report dự phòng. Các model dưới đây sẵn sàng review ở phạm vi giai đoạn 1; chưa được coi là database hoàn chỉnh hoặc sẵn sàng migrate nguyên trạng.

## Model và phạm vi

| Nhóm | Prisma model | PostgreSQL table |
| --- | --- | --- |
| AUTH | User | users |
| AUTH | AuthSession | auth_sessions |
| AUTH | PasswordResetToken | password_reset_tokens |
| OWNER | OwnerProfile | owner_profiles |
| OWNER | OwnerRequest | owner_requests |
| FACILITY | Facility | facilities |
| FACILITY | FacilityImage | facility_images |
| FACILITY | Court | courts |
| FACILITY | Amenity | amenities |
| FACILITY | FacilityAmenity | facility_amenities |
| FACILITY | PriceRule | price_rules |
| FACILITY | CancellationPolicy | cancellation_policies |
| PAYMENT | BankAccount | bank_accounts |
| BOOKING | Booking | bookings |
| BOOKING | BookingSlot | booking_slots |
| BOOKING | CourtSlotLock | court_slot_locks |
| BOOKING | CourtBlock | court_blocks |
| PAYMENT | PaymentProof | payment_proofs |
| REFUND | Refund | refunds |
| CUSTOMER | Favorite | favorites |
| CUSTOMER | Review | reviews |
| CUSTOMER | ReviewImage | review_images |
| NOTIFICATION | Notification | notifications |
| CONTENT | ContentPage | content_pages |

Không thêm Schedule/Availability table, DepositPolicy, RefundProof hoặc bảng role vì DATABASE.md không định nghĩa chúng. Refund giữ proof trong chính record refund, tách PaymentProof. ContentPage chỉ phản ánh các cột dự kiến đã có; loại nội dung/format body vẫn TODO và API reserved.

## Naming, kiểu và relation

- Model PascalCase dùng @@map về table snake_case. Scalar field giữ nguyên tên cột snake_case, không cần @map dư thừa. Relation field chỉ phục vụ Prisma, không sinh thêm cột.
- ID độc lập: BigInt @id @default(autoincrement()) @db.BigInt. OwnerProfile dùng user_id PK/FK, không sinh ID mới. FacilityAmenity, Favorite và CourtSlotLock giữ PK kép.
- Tiền: Decimal @db.Decimal(12,0); slot_amount @db.Decimal(14,2); tọa độ @db.Decimal(10,7). Không Float hoặc default tỷ lệ cọc.
- Thời điểm: DateTime @db.Timestamptz(3); giờ mở cửa/giá: DateTime @db.Time(6), tương ứng TIME WITHOUT TIME ZONE. TIME không phải thời điểm UTC; application chuyển ngày + giờ theo Asia/Ho_Chi_Minh.
- token_hash: Bytes @db.ByteA; CHAR(64) cho csrf_token. Nullable giữ đúng DATABASE.md, kể cả password_hash cho Google-only và cutoff snapshot chưa cấu hình.
- created_at bắt buộc, không tự thêm default now(); caller phải lấy DB time phù hợp khi triển khai. updated_at dùng @updatedAt theo tài liệu; raw SQL sau này phải ghi updated_at rõ ràng. @updatedAt không phải database trigger.
- Mọi FK khai báo onDelete: Restrict để bảo toàn lịch sử. onUpdate: Restrict là lựa chọn ánh xạ kỹ thuật vì không có flow sửa khóa định danh; không thêm Cascade hoặc SetNull ngầm.
- User → OwnerProfile (0..1) → Facility (N) → Court (N). User → OwnerRequest (N), reviewer là User riêng, OwnerProfile trỏ approved_request_id UNIQUE.
- Booking → Customer/User và Court; Booking → BookingSlot (N); BookingSlot → CourtSlotLock (0..1). CourtSlotLock còn FK Court. Trùng Court/giờ giữa lock và Booking phải được service kiểm tra.
- Booking → PaymentProof/Refund/Review đều 0..1 qua booking_id UNIQUE. Tác giả Review/Customer của Refund suy ra qua Booking, không thêm author_id/customer_id vào các bảng này.
- Favorite nối User/Facility; FacilityAmenity nối Facility/Amenity. Notification có recipient và các FK đối tượng nullable đã định nghĩa; không tự thêm quy tắc exactly-one target chưa được chốt.

## Enum và status

**Không tạo Prisma enum**: DATABASE.md chốt cột VARCHAR + CHECK. Chuyển sang enum PostgreSQL sẽ thay kiểu vật lý đã chốt. Prisma dùng String + native VarChar; tập giá trị được liệt kê dưới đây và phải có CHECK trong migration sau. Generate thành công không có nghĩa các giá trị ngoài tập đã bị DB chặn.

| Cột | Giá trị CHECK bắt buộc |
| --- | --- |
| users.role | CUSTOMER, ADMIN; OWNER được suy ra từ OwnerProfile |
| users.status | ACTIVE, LOCKED |
| owner_requests.status | PENDING, APPROVED, REJECTED |
| facilities.status | DRAFT, PENDING, ACTIVE, REJECTED, SUSPENDED |
| courts.status | ACTIVE, INACTIVE |
| bookings.status | PENDING_PAYMENT, PENDING_CONFIRMATION, CONFIRMED, COMPLETED, EXPIRED, REJECTED, CANCELLED |
| bookings.cancelled_by | CUSTOMER, OWNER hoặc NULL theo trạng thái |
| payment_proofs.status | SUBMITTED, APPROVED, REJECTED |
| refunds.status | PENDING, PROOF_SUBMITTED, REFUNDED |
| reviews.status | VISIBLE, HIDDEN |
| notifications.event_type | BOOKING_CREATED, PAYMENT_PROOF_SUBMITTED, PAYMENT_CONFIRMED, PAYMENT_REJECTED, BOOKING_CANCELLED, BOOKING_EXPIRED, OWNER_REQUEST_APPROVED, OWNER_REQUEST_REJECTED, FACILITY_APPROVED, FACILITY_REJECTED, NEW_REVIEW |

Report OPEN/RESOLVED chỉ là đề xuất chưa hoàn chỉnh trong tài liệu; chưa đưa vào schema/check implementation.

## UNIQUE, index và chống đặt trùng

Tất cả PK, UNIQUE và index của 24 bảng đã được đối chiếu với DATABASE.md, không thêm index tìm kiếm suy đoán. Các điểm chính:

- User email_normalized/google_subject UNIQUE; AuthSession và PasswordResetToken token_hash UNIQUE.
- OwnerProfile user_id PK, approved_request_id UNIQUE.
- OwnerRequest dùng previewFeatures = ["partialIndexes"] của Prisma 7.10.0 và @@unique([user_id], map: "owner_requests_one_pending_per_user", where: raw("status = 'PENDING'")); validate/generate đã thành công. Không dùng UNIQUE(user_id,status) hoặc UNIQUE(user_id) toàn bảng. User.ownerRequests vẫn là quan hệ 1:N. Giai đoạn 2 đã kiểm tra SQL giữ đúng predicate; chưa tạo index trên DB.
- Court UNIQUE(facility_id,name); PriceRule UNIQUE(facility_id,start_time,end_time), không thay kiểm tra overlap bằng UNIQUE này.
- CancellationPolicy và BankAccount có facility_id UNIQUE.
- CourtSlotLock có @@id([court_id,start_at]) và booking_slot_id UNIQUE. Đây là ràng buộc DB chuẩn bị cho chống double booking; chưa có transaction/service hay kiểm thử tranh chấp thực tế.
- BookingSlot UNIQUE(booking_id,start_at) chỉ chống slot lặp trong một booking, không khóa vĩnh viễn lịch sử theo Court.
- PaymentProof/Refund/Review booking_id UNIQUE; Refund không có REFUNDED trong Booking status.
- FacilityAmenity PK(facility_id,amenity_id); Favorite PK(user_id,facility_id); Notification UNIQUE(recipient_id,event_key).
- Index giữ nguyên cho lịch sử Customer, lịch Court, expiry(status,expires_at), Owner/status/district, duyệt Owner/Facility/proof/refund, review, notification, và content. Không thêm index cho mọi FK một cách tự động.

## POSTGRESQL MANUAL MIGRATION REQUIREMENTS

**Giai đoạn 2 đã viết đủ CHECK M01–M16 trong migration SQL; chưa thực thi bất kỳ CHECK nào trên database.** Prisma 7.10 Schema Language không biểu diễn CHECK trực tiếp. Partial index OwnerRequest đã biểu diễn qua Preview và SQL sinh ra đã giữ đúng predicate; nếu không dùng Preview trong tương lai thì phải giữ nguyên predicate bằng migration SQL thủ công, không giảm semantics.

| Mã | Phạm vi | CHECK/ràng buộc hàng cần bổ sung ở migration sau |
| --- | --- | --- |
| M01 | ID | Giá trị ID độc lập và các cột ID/FK phải dương; FK nullable chỉ kiểm tra khi khác NULL. Autoincrement không tự cấm ghi ID âm thủ công. |
| M02 | Status | Đầy đủ tập giá trị VARCHAR trong bảng status phía trên, không có REFUNDED cho Booking hoặc OWNER trong users.role. |
| M03 | Hash | octet_length(token_hash) = 32 cho auth_sessions và password_reset_tokens. Không có cột raw token. |
| M04 | Miền số nguyên | sort_order của facility_images/review_images >= 0; cutoff_hours >= 0; cancellation_cutoff_hours_snapshot NULL hoặc >= 0; payment_proofs.size_bytes và refunds.proof_size_bytes khi có >= 0. Không tự đặt giới hạn X tối đa. |
| M05 | Facility | closing_time > opening_time theo giới hạn hiện tại chưa hỗ trợ qua đêm; REJECTED cần rejection_reason không rỗng, SUSPENDED cần suspension_reason không rỗng. Không tự chốt chính sách duyệt lại Facility ACTIVE/PENDING. |
| M06 | PriceRule | start_time < end_time, ranh giới phút 00/30, giây/phần giây bằng 0; hourly_rate > 0. Overlap giữa nhiều hàng vẫn thuộc service transaction, không tự thêm exclusion constraint. |
| M07 | Booking money | total_amount, deposit_amount, remaining_amount >= 0; deposit_amount = ROUND(total_amount * 30 / 100, 0) bằng numeric; remaining_amount = total_amount - deposit_amount. Đây là kiểm tra snapshot, không default hoặc cơ chế DB tự tính giá. |
| M08 | Booking interval | end_at > start_at; start/end đúng biên slot theo Asia/Ho_Chi_Minh, giây/phần giây bằng 0, thời lượng bội số 30 phút. Không dùng CHECK phụ thuộc now() để kiểm tra tương lai. |
| M09 | Booking cancellation/rejection | CANCELLED bắt buộc cancelled_by và cancelled_at; cancelled_by=OWNER bắt buộc cancellation_reason không rỗng sau trim. REJECTED bắt buộc rejection_reason. Các state transition và quyền actor vẫn kiểm tra bởi service. |
| M10 | BookingSlot | end_at = start_at + 30 phút, biên slot chuẩn; giá giờ snapshot > 0, slot_amount không âm và bằng hourly_rate_snapshot / 2 theo công thức đã chốt. Không làm tròn từng slot hoặc thêm FK PriceRule. |
| M11 | CourtSlotLock | start_at đúng biên slot; kiểm tra khớp Court/start_at với BookingSlot → Booking là điều kiện liên bảng dưới transaction, không thể thay bằng CHECK hàng đơn. |
| M12 | CourtBlock | end_at > start_at; reason bắt buộc không rỗng. Không ép biên 30 phút cho block; block được overlap với block khác. |
| M13 | OwnerRequest | PENDING có reviewed_by/reviewed_at/rejection_reason NULL; APPROVED/REJECTED có reviewer và reviewed_at; REJECTED có rejection_reason không rỗng. Không ép APPROVED reason NULL nếu tài liệu chưa yêu cầu. |
| M14 | PaymentProof | Khi REJECTED phải có rejection_reason không rỗng; tập status và size theo M02/M04. Reviewed_by phải là Owner đúng cơ sở và proof phải hợp lệ theo state của Booking là điều kiện service liên bảng. |
| M15 | Refund | amount >= 0. PENDING có toàn bộ proof metadata và proof_submitted_at/confirmed_at/refunded_at NULL. PROOF_SUBMITTED có proof_image_path, proof_mime_type, proof_size_bytes, proof_submitted_at; confirmed_at/refunded_at NULL. REFUNDED giữ các proof field và bắt buộc confirmed_at/refunded_at. Khi có mốc, requested_at <= proof_submitted_at <= confirmed_at; refunded_at = confirmed_at. |
| M16 | Review | rating nguyên 1..5; SmallInt không tự giới hạn phạm vi này. UNIQUE booking_id đã có, vẫn áp dụng khi review HIDDEN. |

Các điều kiện nullable/status-dependent dùng IS NULL/IS NOT NULL rõ ràng trong SQL; CHECK trả UNKNOWN không tự chặn NULL. Giai đoạn 1 chưa có SQL; giai đoạn 2 đã thêm file SQL để review.

Không có expression index, trigger, exclusion constraint hoặc PostgreSQL extension bổ sung nào được DATABASE.md yêu cầu. Không tự tạo chúng. Encoding UTF8/collation cần xác minh khi triển khai; đây là cấu hình database, không phải một model hay CHECK mới. Partial index Preview cần review SQL/migration drift ở task migration, chưa kiểm thử DB ở giai đoạn này.

## Application/transaction requirements — chưa triển khai

Các điều kiện sau không thể được coi là đã bảo vệ đầy đủ bởi schema hoặc CHECK hàng đơn:

- BookingSlot liên tiếp/phủ trọn Booking; tổng tiền bằng tổng slot sau làm tròn, snapshot ngân hàng/cutoff/cơ sở; giá hiện hành đủ và không overlap.
- Facility → Court → Booking → PaymentProof → Refund → slot locks theo thứ tự khóa; validate ownership/capability/status, lấy thời gian DB sau chờ khóa, cấp/nhả slot nguyên tử. CourtBlock và writer thay cấu hình dùng cùng cơ chế. PK slot lock không tự xử lý CourtBlock có khoảng giờ tự do.
- created_at/expiry hold = 5 phút do backend thiết lập, không thêm default TTL. PENDING_CONFIRMATION không expire/cancel; expiry/REJECTED/CANCELLED/COMPLETED nhả khóa trong transaction, giữ lịch sử slot/proof. Không resubmit proof booking cũ.
- Password reset token TTL 15 phút, single-use và revoke phiên nguyên tử. Hash 32 byte/UNIQUE không tự đảm bảo single-use.
- OwnerProfile chỉ tạo từ request APPROVED của cùng User có role CUSTOMER; approved Owner giữ Customer capability. Duyệt Facility độc lập.
- Cancellation cutoff theo snapshot và actor; Refund chỉ từ CONFIRMED có proof APPROVED, amount bằng deposit của Booking, tối đa một Refund, tạo cùng transaction hủy/nhả slot. Không auto-refund, không workflow cho 70%.
- Review chỉ cho Customer sở hữu Booking COMPLETED; Notification phải đúng recipient/đối tượng/event, không thêm notification refund mới.

Không thêm trigger cho các điều kiện này vì thiết kế chọn service transaction. TTL/tương lai/cutoff không được chuyển thành CHECK sử dụng đồng hồ hiện tại, không tự coi dữ liệu lịch sử là vô hiệu khi thời gian trôi qua.

## Đối chiếu và kết quả kiểm chứng — lịch sử giai đoạn 1

- 24 tập cột đối chiếu với phần Entities của DATABASE.md: khớp, không thiếu/thừa cột ở các model đã làm. Report được loại khỏi phạm vi theo xác nhận của user.
- Đối chiếu 179 khai báo trường riêng trong tài liệu về kiểu/native type và nullable: đạt; timestamps chung của mọi model giữ Timestamptz(3).
- 36 FK có action rõ ràng; kiểm tra PK slot lock, quan hệ 1:N OwnerRequest, unique proof/refund/review, token hash và money snapshot: đạt.
- Prisma 7.10.0 format: SUCCESS; validate: SUCCESS; generate: SUCCESS. Generated client chỉ cập nhật trong node_modules, không commit.
- Không chạy db:check, db execute, db push, introspection hoặc bất kỳ lệnh migrate nào. Không tạo migration, table, index hoặc thay dữ liệu Supabase.
- FEATURE_STATUS, business specs, DATABASE.md, cấu hình TLS/connection và package/lockfile giữ nguyên. Không đánh dấu feature DONE.

## TODO và phạm vi review

- Report: tạm hoãn theo quyết định user; cần chốt đối tượng, FK mục tiêu, đối tượng gửi, lý do và quy trình xử lý trước khi đưa model vào schema.
- ContentPage: model phản ánh đúng cột hiện có; chưa chốt loại nội dung/format body, API vẫn chưa triển khai.
- Các TODO nghiệp vụ hiện có về cutoff thiếu, giờ qua đêm, sửa Facility đã duyệt, search/rating, password policy/retention… không được tự giải quyết bằng default/field mới.
- Ghi chú trạng thái cũ trong AGENTS/DATABASE/FEATURE_STATUS có chỗ nói chưa scaffold/cài Prisma; đó là mô tả tiến độ cũ, không phải xung đột schema. Không sửa business documentation trong task này để che TODO.
- Giai đoạn 2 đã tạo SQL M01–M16 để review. Kiểm thử PostgreSQL thật và concurrency vẫn chưa thực hiện; schema hợp lệ chưa chứng minh các ràng buộc hoạt động trên DB.

SCHEMA READY FOR REVIEW: YES (24 model; Report đã được đồng ý hoãn).

MIGRATION CREATED (kết thúc giai đoạn 1): NO; giai đoạn 2: YES, chưa apply.

DATABASE MODIFIED: NO.

Tham chiếu khả năng Prisma: [partial indexes từ Prisma 7.4](https://www.prisma.io/changelog/2026-02-11), [Prisma Schema API: where trên unique/index](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference), [CHECK constraints](https://docs.prisma.io/docs/orm/v6/more/troubleshooting/check-constraints).

## Giai đoạn 2 — migration SQL offline, chưa apply

File: [20260922000000_init/migration.sql](../../backend/prisma/migrations/20260922000000_init/migration.sql). Metadata provider: [migration_lock.toml](../../backend/prisma/migrations/migration_lock.toml), chỉ ghi PostgreSQL, không đánh dấu đã apply.

Đã kiểm tra help của CLI Prisma 7.10.0 cài sẵn, chạy từ `backend/`:

```powershell
node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/20260922000000_init/migration.sql
```

Nguồn là schema rỗng, đích là file schema; không dùng datasource/database làm nguồn hoặc đích. Sau khi sinh SQL, bổ sung 76 CHECK M01–M16 thủ công. Không chạy SQL, không seed, không kết nối Supabase để áp dụng/kiểm tra trong task này.

### Kết quả đối chiếu SQL

| Thành phần | Số lượng |
| --- | --- |
| CREATE TABLE | 24, đúng bảng liệt kê ở phần Model |
| PRIMARY KEY | 24 |
| FOREIGN KEY | 36, tất cả ON DELETE RESTRICT / ON UPDATE RESTRICT |
| UNIQUE constraint riêng | 0 |
| UNIQUE index toàn bảng | 17 |
| Partial UNIQUE index | 1 |
| Normal index | 27 |
| CHECK | 76 |

18 UNIQUE index thực thi uniqueness tương ứng schema; không gọi chúng là UNIQUE constraint riêng. Index hỗ trợ 24 PK không cộng lại vào 45 CREATE INDEX trên. Không có Report, enum PostgreSQL, trigger, extension hoặc index suy đoán.

Các ràng buộc quan trọng đã đối chiếu trong SQL:

```sql
CREATE UNIQUE INDEX "owner_requests_one_pending_per_user"
ON "owner_requests"("user_id") WHERE (status = 'PENDING');

-- Trong CREATE TABLE court_slot_locks:
CONSTRAINT "court_slot_locks_pkey" PRIMARY KEY ("court_id","start_at")

CREATE UNIQUE INDEX "court_slot_locks_booking_slot_id_key"
ON "court_slot_locks"("booking_slot_id");

CREATE UNIQUE INDEX "refunds_booking_id_key" ON "refunds"("booking_id");
```

Tiền dùng DECIMAL(p,s) do Prisma sinh, là tên đồng nghĩa NUMERIC trong PostgreSQL, không dùng FLOAT/REAL/DOUBLE PRECISION. M07 bảo vệ cọc ROUND(total_amount * 30 / 100, 0) và remaining = total - deposit. Backend vẫn tính giá; CHECK không thay transaction hoặc snapshot liên bảng.

M08/M10/M11 căn biên phút 00/30 và giây/phần giây 0 theo Asia/Ho_Chi_Minh. M10 bắt buộc slot đúng 30 phút. M03 kiểm tra token_hash 32 byte bằng octet_length; các cột expires_at, used_at, invalidated_at, created_at giữ đúng schema; không raw token, không TTL default. M16 giới hạn rating 1..5. M02 giữ đúng các tập status đã liệt kê; Refund có state riêng, không thêm REFUNDED vào Booking.

M09/M13/M14 bảo vệ metadata điều kiện, dùng kiểm tra NULL tường minh cho trường bắt buộc. M15 kiểm tra proof theo từng state và thứ tự thời điểm Refund. Ownership, actor, state transition, hoàn tiền bằng cọc đã xác nhận và chống tranh chấp liên bảng vẫn là phần application/transaction chưa triển khai.

### Kiểm chứng giai đoạn 2

- FORMAT: SUCCESS; VALIDATE: SUCCESS; GENERATE: SUCCESS bằng các script Prisma hiện có. Client sinh trong node_modules; không thêm source feature.
- Đối chiếu tĩnh tập table với @@map: đúng 24; kiểm tra tên CHECK duy nhất và không quá 63 ký tự, cột tham chiếu của CHECK có tồn tại: đạt.
- Đối chiếu phần SQL nền với đầu ra migrate diff: giữ nguyên table, column, PK, FK và toàn bộ index; chỉ thêm chú thích và CHECK.
- Đọc/review SQL và kiểm tra loại câu lệnh: chỉ CREATE SCHEMA public, CREATE TABLE, CREATE INDEX và ALTER TABLE ADD CONSTRAINT. Không DROP, TRUNCATE, DML, seed/admin mặc định, GRANT, ALTER ROLE, đổi password/TLS/config Supabase. ON DELETE/UPDATE RESTRICT là action FK, không phải thao tác dữ liệu.
- Đây là kiểm tra tĩnh, không phải chạy migration trên PostgreSQL; chưa xác minh thực thi CHECK, rollback hoặc concurrency bằng database thật.
- FEATURE_STATUS không thay đổi, không đánh dấu feature hay Database implementation DONE. Package/lockfile, schema Prisma và cấu hình kết nối/TLS giữ nguyên.

### TODO sau review

- Review thủ công SQL trước task apply được cho phép riêng; không tự chuyển sang apply.
- Khi được phép, kiểm thử thực tế constraint, transaction và concurrency trên môi trường được chỉ định. Mọi migration sau phải giữ CHECK thủ công vì Prisma schema không mô tả chúng.
- Report tiếp tục hoãn; ContentPage và các TODO nghiệp vụ ở trên giữ nguyên. Không có mâu thuẫn schema đã xác định cần sửa trong phạm vi SQL này.

### Danh sách CHECK thực tế và ánh xạ M01–M16

Tên dưới đây khớp ADD CONSTRAINT trong migration; ý nghĩa từng nhóm theo bảng M01–M16 phía trên.

### M01 — 24 CHECK

- `m01_users_positive_ids_check` — `users`.
- `m01_auth_sessions_positive_ids_check` — `auth_sessions`.
- `m01_password_reset_tokens_positive_ids_check` — `password_reset_tokens`.
- `m01_owner_profiles_positive_ids_check` — `owner_profiles`.
- `m01_owner_requests_positive_ids_check` — `owner_requests`.
- `m01_facilities_positive_ids_check` — `facilities`.
- `m01_facility_images_positive_ids_check` — `facility_images`.
- `m01_courts_positive_ids_check` — `courts`.
- `m01_amenities_positive_ids_check` — `amenities`.
- `m01_facility_amenities_positive_ids_check` — `facility_amenities`.
- `m01_price_rules_positive_ids_check` — `price_rules`.
- `m01_cancellation_policies_positive_ids_check` — `cancellation_policies`.
- `m01_bank_accounts_positive_ids_check` — `bank_accounts`.
- `m01_bookings_positive_ids_check` — `bookings`.
- `m01_booking_slots_positive_ids_check` — `booking_slots`.
- `m01_court_slot_locks_positive_ids_check` — `court_slot_locks`.
- `m01_payment_proofs_positive_ids_check` — `payment_proofs`.
- `m01_refunds_positive_ids_check` — `refunds`.
- `m01_court_blocks_positive_ids_check` — `court_blocks`.
- `m01_favorites_positive_ids_check` — `favorites`.
- `m01_reviews_positive_ids_check` — `reviews`.
- `m01_review_images_positive_ids_check` — `review_images`.
- `m01_notifications_positive_ids_check` — `notifications`.
- `m01_content_pages_positive_ids_check` — `content_pages`.

### M02 — 11 CHECK

- `m02_users_role_check` — `users`.
- `m02_users_status_check` — `users`.
- `m02_owner_requests_status_check` — `owner_requests`.
- `m02_facilities_status_check` — `facilities`.
- `m02_courts_status_check` — `courts`.
- `m02_bookings_status_check` — `bookings`.
- `m02_bookings_cancelled_by_check` — `bookings`.
- `m02_payment_proofs_status_check` — `payment_proofs`.
- `m02_refunds_status_check` — `refunds`.
- `m02_reviews_status_check` — `reviews`.
- `m02_notifications_event_type_check` — `notifications`.

### M03 — 2 CHECK

- `m03_auth_sessions_token_hash_length_check` — `auth_sessions`.
- `m03_password_reset_tokens_token_hash_length_check` — `password_reset_tokens`.

### M04 — 6 CHECK

- `m04_facility_images_sort_order_check` — `facility_images`.
- `m04_review_images_sort_order_check` — `review_images`.
- `m04_cancellation_policies_cutoff_hours_check` — `cancellation_policies`.
- `m04_bookings_cancellation_cutoff_hours_snapshot_check` — `bookings`.
- `m04_payment_proofs_size_bytes_check` — `payment_proofs`.
- `m04_refunds_proof_size_bytes_check` — `refunds`.

### M05 — 3 CHECK

- `m05_facilities_opening_interval_check` — `facilities`.
- `m05_facilities_rejection_reason_check` — `facilities`.
- `m05_facilities_suspension_reason_check` — `facilities`.

### M06 — 4 CHECK

- `m06_price_rules_time_range_check` — `price_rules`.
- `m06_price_rules_start_alignment_check` — `price_rules`.
- `m06_price_rules_end_alignment_check` — `price_rules`.
- `m06_price_rules_hourly_rate_check` — `price_rules`.

### M07 — 3 CHECK

- `m07_bookings_nonnegative_amounts_check` — `bookings`.
- `m07_bookings_deposit_amount_check` — `bookings`.
- `m07_bookings_remaining_amount_check` — `bookings`.

### M08 — 4 CHECK

- `m08_bookings_time_range_check` — `bookings`.
- `m08_bookings_start_alignment_check` — `bookings`.
- `m08_bookings_end_alignment_check` — `bookings`.
- `m08_bookings_duration_check` — `bookings`.

### M09 — 3 CHECK

- `m09_bookings_cancelled_metadata_check` — `bookings`.
- `m09_bookings_owner_cancel_reason_check` — `bookings`.
- `m09_bookings_rejection_reason_check` — `bookings`.

### M10 — 4 CHECK

- `m10_booking_slots_duration_check` — `booking_slots`.
- `m10_booking_slots_start_alignment_check` — `booking_slots`.
- `m10_booking_slots_end_alignment_check` — `booking_slots`.
- `m10_booking_slots_price_snapshot_check` — `booking_slots`.

### M11 — 1 CHECK

- `m11_court_slot_locks_start_alignment_check` — `court_slot_locks`.

### M12 — 2 CHECK

- `m12_court_blocks_time_range_check` — `court_blocks`.
- `m12_court_blocks_reason_check` — `court_blocks`.

### M13 — 3 CHECK

- `m13_owner_requests_pending_metadata_check` — `owner_requests`.
- `m13_owner_requests_reviewed_metadata_check` — `owner_requests`.
- `m13_owner_requests_rejection_reason_check` — `owner_requests`.

### M14 — 1 CHECK

- `m14_payment_proofs_rejection_reason_check` — `payment_proofs`.

### M15 — 4 CHECK

- `m15_refunds_amount_check` — `refunds`.
- `m15_refunds_proof_by_status_check` — `refunds`.
- `m15_refunds_time_order_check` — `refunds`.
- `m15_refunds_confirmed_time_check` — `refunds`.

### M16 — 1 CHECK

- `m16_reviews_rating_check` — `reviews`.

MIGRATION SQL READY FOR REVIEW: YES

MIGRATION APPLIED: NO

SUPABASE DATABASE MODIFIED: NO
