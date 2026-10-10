# Website đặt sân cầu lông trực tuyến tại thành phố Đà Nẵng

> Baseline 2026-10-10: Customer hủy Booking `CONFIRMED` tạo Refund `PENDING` nguyên tử; Owner proof và Customer confirmation đã triển khai đầy đủ theo `PENDING → PROOF_SUBMITTED → REFUNDED` trong Booking Detail.

## Trạng thái hiện tại — 2026-10-07

Baseline v1 hiện có frontend và backend cho Auth email/password, Home, Public Facility list/detail, Availability, Customer Booking, Payment Proof, Owner Booking review, confirmed cancellation + Refund, Owner Facility/Court/PriceRule/Bank Account + QR/Cancellation Policy/Images + Amenities, Owner Request và Admin Facility/Amenity/Owner Request. Favorite/Review, Notification, Content, Admin User Management và Statistics/Dashboard chưa hoàn chỉnh. Bảng chuẩn tại [Feature Status](docs/FEATURE_STATUS.md); các đoạn phase cũ bên dưới là lịch sử triển khai.

Performance read paths đã giảm query budget: Public List 6→2, Detail 8→2, Availability 11→3, Owner Booking 12→6. Owner Booking là fixed fan-out, không phải N+1 theo query-count test. Network/cold-start/deployment optimization được hoãn đến khi deploy thật.

HISTORICAL/SUPERSEDED — Payment Phase 1 ngày 2026-10-06 ban đầu chỉ có upload proof và UI PENDING_PAYMENT. Các phase sau đã bổ sung Customer GET proof, Owner confirm/reject và Bank Account + QR. Refund, confirmed cancellation và notification vẫn chưa hoàn tất; trạng thái hiện tại theo [PAYMENT_SPEC.md](docs/specs/PAYMENT_SPEC.md) và [FEATURE_STATUS.md](docs/FEATURE_STATUS.md).

Booking Frontend Phase1 READY ngày2026-10-05: từ Detail sang `/facilities/:facility_id/booking-confirm`, POST Booking, `/bookings`, `/bookings/:id` và countdown server-time. Selection chỉ React memory; guest login chọn lại; không Payment. Frontend80/80 tests/lint/build PASS, responsive4 màn hình ở1440/800/390; chưa live Supabase E2E. Spec [BOOKING_FRONTEND_SPEC.md](docs/specs/BOOKING_FRONTEND_SPEC.md), bằng chứng tại FEATURE_STATUS. Chạy frontend với `VITE_API_BASE_URL` trỏ Express `/api/v1`; không thay `.env` trong task. Các ghi nhận frontend/CTA chưa có trong lịch sử phase cũ bên dưới đã được thay thế.

Home Frontend Phase1 READY ngày2026-10-05: `/` thay scaffold, tìm theo district đến List, card đến Detail, session/Header/Footer dùng chung. Frontend53 tests (Home/Auth/List/Detail), lint/build PASS; kiểm chứng và giới hạn tại FEATURE_STATUS. Runtime dùng API thật, không fake facility/statistics. Booking frontend đã được triển khai ở phase sau.

Facility Detail + Availability frontend READY ngày2026-10-05: `/facilities/:facility_id`, link từ List, GET Detail/lịch theo Court/ngày và chọn1–6 slot liên tiếp trong memory. Đây là mốc lịch sử trước Booking frontend; CTA đã được nối ở phase Booking sau đó. Header/Footer dùng chung; xem FEATURE_STATUS cho trạng thái hiện tại.

Facility List frontend đã triển khai tại `/facilities` (2026-10-05), dùng API thật qua `VITE_API_BASE_URL`, không dữ liệu giả trong runtime. Trong frontend chạy `npm run dev`, `npm test`, `npm run lint`, `npm run build`; dev/test/build tự sinh registry khu vực từ nguồn canonical backend nên cần đầy đủ checkout dự án. Detail, Home, Availability và Booking frontend đã được triển khai ở các phase sau; xem `docs/FEATURE_STATUS.md`.

HISTORICAL/SUPERSEDED — Booking Configuration Phase 1 ban đầu chỉ có Owner GET/PUT `/api/v1/owner/facilities/:facility_id/price-rules`, `/cancellation-policy`, `/bank-account` và chưa có QR/Public/Booking/frontend. Các phase sau đã triển khai các phần này; trạng thái hiện tại theo [Feature Status](docs/FEATURE_STATUS.md) và các spec liên quan. Lệnh kiểm chứng lịch sử của backend là `npm test` và `npm run test:booking-config:db`.

Booking Configuration backend READY ngày2026-09-28: local25/25; configuration PostgreSQL13/13; regression Court12/12, Facility13/13, Owner Request10/10, Auth Phase1 13/13 và Phase2 10/10 PASS trong task. Health200, cleanup PASS; dữ liệu/catalog trước–sau lượt xác minh cuối khớp. Không schema/migration mới. Xem FEATURE_STATUS cho ngày chạy và phạm vi bằng chứng.

Court Core backend Phase 1: Owner create/list theo Facility, detail/PATCH theo Court; spec tại `docs/specs/COURT_SPEC.md`. Chạy local bằng `npm test`, PostgreSQL integration bằng `npm run test:court:db` trong backend. Integration dùng UUID fixture riêng, cleanup trong finally; không gửi email hoặc đụng User test email thật. Trạng thái kiểm chứng xem FEATURE_STATUS. Không public Court, availability, CourtBlock, delete hoặc frontend trong phase này.

Kiểm chứng 2026-09-27: local 20/20; Court PostgreSQL 12/12; Facility 13/13; Owner Request 10/10; Auth Phase 1 13/13 và Phase 2 10/10 PASS. Health HTTP 200. Fixture cleanup và so sánh dữ liệu trước/sau PASS; Court Core Phase 1 backend READY, không schema/migration/package mới.

**Online Badminton Court Booking Website in Da Nang City**

Website kết nối khách hàng đặt sân cầu lông tại Đà Nẵng với chủ sân: tìm cơ sở, chọn sân con và lịch trống, đặt chỗ, chuyển cọc cố định 30% và gửi minh chứng để chủ sân xác nhận; 70% còn lại thanh toán trực tiếp tại sân. Hủy hợp lệ sau khi cọc được xác nhận được hoàn 100% cọc theo luồng thủ công: Owner chuyển tiền ngoài hệ thống, gửi proof; Customer xác nhận đã nhận. Booking và Refund có trạng thái riêng, website không tự chuyển tiền.

## Stack chính thức

- React + Vite SPA responsive, giao diện tiếng Việt.
- Node.js + Express, REST API.
- Prisma ORM → PostgreSQL hosted trên Supabase; kiến trúc modular monolith.
- Supabase chỉ cung cấp database, không dùng Auth/Storage/Realtime/Edge Functions. Authentication vẫn thuộc Express theo AUTH_SPEC.
- Luồng: React → Express REST API → Prisma → Supabase PostgreSQL. React không truy cập database trực tiếp.
- Backend dùng DATABASE_URL qua Prisma 7.10.0; kết nối Supabase đã kiểm tra bằng SELECT 1 với CA/TLS verification. DIRECT_URL chỉ cần khi dùng đường kết nối CLI riêng; không lưu credential thật trong Git.
- Website phải deploy thực tế; frontend/backend hosting provider vẫn TODO. Documentation baseline vẫn v1, không đổi business rules.
- Một người phát triển; ưu tiên đơn giản, dễ bảo trì và triển khai thực tế.

## Project Structure

```text
BOOKING SanTheThao/
├── frontend/                  # React + Vite (JavaScript)
├── backend/                   # Express, health API
├── docs/
│   ├── plans/.gitkeep
│   ├── specs/
│   │   ├── BOOKING_SPEC.md
│   │   ├── AUTH_SPEC.md
│   │   ├── PAYMENT_SPEC.md
│   │   ├── PERMISSION_SPEC.md
│   │   └── FACILITY_SPEC.md
│   ├── tasks/.gitkeep
│   ├── PROJECT_OVERVIEW.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API_SPEC.md
│   ├── UI_UX_SPEC.md
│   └── FEATURE_STATUS.md
├── AGENTS.md
├── .gitignore
└── README.md
```

## Documentation

Bắt đầu từ [Project Overview](docs/PROJECT_OVERVIEW.md), nguồn chuẩn nghiệp vụ. Xem [Architecture](docs/ARCHITECTURE.md), [Database](docs/DATABASE.md), [API](docs/API_SPEC.md), [UI/UX](docs/UI_UX_SPEC.md), các [spec chi tiết](docs/specs/) và [Feature Status](docs/FEATURE_STATUS.md). Coding agent tuân [AGENTS.md](AGENTS.md).

## Current Status

Documentation baseline: v1 — rà soát ngày 2026-09-21.

Baseline xác nhận email reset token một lần 15 phút, Approved Owner giữ đầy đủ Customer capabilities, Owner Request có lịch sử và duyệt riêng với Facility. PENDING_CONFIRMATION chờ Owner Confirm/Reject, không countdown, không tự expire và không cho Customer cancel.

Ngày 2026-09-23 đã apply initial migration `20260922000000_init` lên Supabase PostgreSQL và xác minh 24 bảng, 36 FK, 24 PK, 76 CHECK cùng các index đã review. Đây là mốc lịch sử database; trạng thái implementation hiện tại nằm ở bảng phía trên và [Feature Status](docs/FEATURE_STATUS.md). Report tiếp tục hoãn.

## Chạy local

Môi trường đã kiểm tra: Node.js 24.14.1, npm 11.11.0. Dùng Node.js 24 LTS cho bộ khung này.
Chạy các lệnh từ thư mục gốc trong hai terminal riêng. Trên PowerShell, dùng `npm.cmd` nếu execution policy chặn `npm.ps1`.

Frontend:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Truy cập http://localhost:5173. Cổng được cố định; Vite báo lỗi nếu cổng đã được dùng.
`VITE_API_BASE_URL=http://localhost:3000/api/v1` là cấu hình local bắt buộc để frontend hiện tại gọi API. Biến `VITE_*` là thông tin công khai, không đặt secret tại đây.

Backend:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
npm run dev
```

Backend mặc định http://localhost:3000, tự chạy lại khi sửa file bằng Node watch mode.
Có thể dùng `npm start` để chạy không watch. Các biến: `PORT=3000`, `NODE_ENV=development`, `FRONTEND_URL=http://localhost:5173`. CORS cho origin này và JSON parser đã được bật.
Chỉ sao chép `.env.example` khi chưa có `.env`; không ghi đè cấu hình local hiện có. Backend có giá trị mặc định nên cũng chạy được khi chưa tạo `.env`.

Health API công khai:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health
```

Response HTTP 200:

```json
{"success":true,"message":"API is running"}
```

Kiểm tra frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Lint dùng Oxlint mặc định của template Vite. Build tạo `frontend/dist/`; `npm run preview` dùng để xem thử bản build local, không phải server production. Backend chưa cấu hình lint riêng.
Dừng mỗi server bằng `Ctrl+C`.

## Cấu trúc source scaffold

```text
frontend/
  public/.gitkeep
  src/
    assets/.gitkeep
    components/.gitkeep
    layouts/.gitkeep
    pages/.gitkeep
    features/.gitkeep
    routes/.gitkeep
    services/.gitkeep
    hooks/.gitkeep
    utils/.gitkeep
    App.jsx
    App.css
    index.css
    main.jsx
  .env.example
  .oxlintrc.json
  index.html
  vite.config.js
  package.json
  package-lock.json
backend/
  src/
    config/env.js
    middleware/.gitkeep
    modules/.gitkeep
    routes/index.js
    utils/.gitkeep
    app.js
    server.js
  .env.example
  package.json
  package-lock.json
```

Một số thư mục khung vẫn giữ `.gitkeep`; source thực tế hiện được tổ chức theo feature trong `frontend/src/features` và module trong `backend/src/modules`. `node_modules/`, `.env`, build output và file tạm được bỏ qua bởi `.gitignore`; giữ `.env.example` và lockfile trong version control.

## Prisma và Supabase PostgreSQL

Đã kiểm tra trên Node.js 24.14.1, npm 11.11.0, Express 5.2.1 (JavaScript ESM). Prisma CLI (devDependency), @prisma/client và @prisma/adapter-pg cùng phiên bản 7.10.0; pg 8.23.0 là driver runtime của adapter. Chọn bản ổn định 7.10.0 thay vì Prisma 8 RC; không downgrade Node.js hoặc Express.

Các file cấu hình:

- `backend/prisma.config.js`: cấu hình Prisma CLI theo Prisma 7, datasource URL lấy từ môi trường.
- `backend/prisma/schema.prisma`: provider PostgreSQL, 24 model ánh xạ DATABASE.md; Report tạm hoãn. Status giữ VARCHAR + CHECK theo thiết kế, Owner Request partial unique dùng Preview partialIndexes. Initial migration đã apply và CHECK đã được xác minh trên DB; giữ phần CHECK thủ công trong các migration sau.
- `backend/src/config/database.js`: nạp môi trường và cấu hình CA cho CLI/runtime riêng.
- `backend/src/config/prisma.js`: một Prisma Client dùng chung, adapter PrismaPg; chưa tích hợp vào health endpoint.
- `backend/scripts/check-database.js`: kiểm tra Prisma bằng SELECT 1, đóng kết nối, chỉ in kết quả/error code an toàn.
- `backend/certs/supabase-ca.crt`: Server Root CA chính thức do người phát triển cung cấp, không phải client private key; không log nội dung. Cần cung cấp file này khi deploy hoặc cấu hình đường dẫn tương ứng.

Generator dùng `prisma-client-js` với `engineType = "client"`, vẫn được Prisma 7.10 hỗ trợ, sinh JavaScript cho backend hiện tại và import từ @prisma/client. Generator mới `prisma-client` sinh TypeScript; chưa chuyển ứng dụng sang TypeScript hoặc thêm build pipeline trong task này. Generator cũ sẽ bị loại bỏ trong phiên bản tương lai: xem xét lại trước khi nâng major Prisma. Generated client nằm trong node_modules, không commit, cần generate lại sau npm ci.

Biến môi trường chỉ ở backend:

- `DATABASE_URL`: connection string thật chỉ điền trong `.env` hoặc secret environment, không in ra/log/commit.
- `DATABASE_CA_PATH`: mặc định `certs/supabase-ca.crt`, đường dẫn tương đối tính từ backend; hỗ trợ đường dẫn tuyệt đối.
- `DIRECT_URL`: tùy chọn, Prisma CLI ưu tiên nếu có, nếu không dùng DATABASE_URL. Runtime luôn dùng DATABASE_URL.

Kết nối hiện tại là Supabase session pooler nên chưa bắt buộc DIRECT_URL. Nếu runtime chuyển sang transaction pooler, cần đường kết nối direct hoặc session pooler phù hợp cho CLI/migration; không tự suy đoán credential, đổi port hoặc tạo shadow database. Quyền migration/shadow database và connection strategy khi deploy cần kiểm tra trong task migration sau này.

Runtime dùng PrismaPg với host/port/user/password/database tách từ URL và `ssl: { ca, rejectUnauthorized: true }`. Không truyền connectionString vào pg nên sslmode/sslcert trong URL không ghi đè CA. Prisma CLI dùng cơ chế schema engine: URL được chuẩn hóa trong bộ nhớ với `sslmode=require`, `sslaccept=strict`, `sslcert` trỏ CA; không sửa `.env`. Cấu hình TLS của CLI không sao chép nguyên ssl object của pg. Runtime pool tối đa 5 kết nối/instance, connection timeout 12 giây; điều chỉnh theo giới hạn Supabase khi deploy.

Chạy từ backend, sau khi đã cấu hình `.env` riêng và cung cấp CA:

```powershell
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
npm run db:check
```

Task cấu hình trước đã kiểm chứng SELECT 1 qua Prisma Client/CLI và health API HTTP 200 cùng response cũ. Task schema giai đoạn 1 chỉ chạy format/validate/generate, không kết nối hoặc thay đổi database. Không chạy db push, migration, introspection hoặc tạo table test; Documentation baseline vẫn v1, FEATURE_STATUS nghiệp vụ vẫn TODO. Xem [Prisma Schema Review](docs/plans/PRISMA_SCHEMA_REVIEW.md) cho danh sách model, manual migration requirements và giới hạn kiểm chứng.

Npm audit tại thời điểm cài đặt báo 4 mục high trong dependency graph của Prisma CLI, liên quan deepmerge-ts và mysql2 gián tiếp (không phải driver ứng dụng). Chưa chạy audit fix --force, downgrade hoặc override major dependency. TODO theo dõi bản Prisma ổn định đã sửa các advisory trước production; không coi cảnh báo này là đã xử lý.

Tham chiếu: [Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [PostgreSQL connector](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [Supabase với Prisma](https://supabase.com/docs/guides/database/prisma), [pg SSL configuration](https://node-postgres.com/features/ssl).

## Authentication — giai đoạn 1

Endpoints: POST /api/v1/auth/register, POST /api/v1/auth/login, GET /api/v1/auth/session, POST /api/v1/auth/logout. Contract tại docs/API_SPEC.md, policy tại docs/specs/AUTH_SPEC.md. Argon2id dùng argon2 0.45.1; cấu hình tập trung backend/src/modules/auth/config.js.

Session token randomBytes(32) base64url, DB chỉ lưu SHA-256 hash; CSRF token riêng 32 byte hex. Phiên 7 ngày cố định; logout revoke. Middleware tại backend/src/modules/auth/middleware.js.

FRONTEND_URL phải là origin chính xác, không dấu / cuối; production bắt buộc khai báo HTTPS. Cookie booking_session HttpOnly/SameSite=Lax/Path=/, Secure trong production. Client gửi credentials: include; POST gửi Origin, logout phiên hợp lệ thêm X-CSRF-Token từ login/session. Không thêm biến môi trường hoặc đổi TLS.

Rate limit lưu memory một process, restart reset; không khóa User. Chưa bật trust proxy: không tin X-Forwarded-For. Khi deploy sau proxy cần chốt trusted proxy chính xác; nhiều instance cần shared store.

Chạy test từ backend: npm test và npm run test:auth:db. Dùng node:test/assert/fetch, không thêm test framework. Test DB opt-in dùng CA hiện tại, HTTP loopback tạm và Prisma transaction rollback; xác minh không còn User/session fixture. Sequence có thể tăng dù rollback, không reset sequence. Không xóa dữ liệu thật.

Kết quả 2026-09-23: 4/4 test local và 13/13 test integration PASS; health HTTP 200. Kết quả lịch sử Phase 1; Phase 2 đã bổ sung forgot/reset/change phía dưới. Chưa làm frontend, Google hoặc nghiệp vụ khác. Không tạo migration/sửa schema.

## Authentication Phase 2

Kết quả: 8/8 local tests, 10/10 password integration tests và 13/13 Phase 1 regression tests PASS; health HTTP 200. User/reset token/session fixture đã rollback và kiểm tra không còn dữ liệu test. Đã kiểm chứng email thật qua Resend trong development: người dùng xác nhận nhận email ngày 2026-09-24.

Đã triển khai POST /api/v1/auth/forgot-password, /reset-password, /change-password. Official Resend SDK 6.28.1; adapter có thể inject fake để test, runtime dùng Resend API thật. Không SMTP/Supabase Auth.

Cấu hình riêng trong backend/.env: RESEND_API_KEY và EMAIL_FROM (chỉ địa chỉ sender). Display name cố định “Đặt sân cầu lông Đà Nẵng”; production dùng domain đã verify. Không có default/credential giả. FRONTEND_URL tiếp tục là origin, link /reset-password#token=...; frontend reset-password đã triển khai trong Auth F1.

Thiếu cấu hình email: Forgot trả 503 AUTH_EMAIL_UNAVAILABLE; register/login/session/logout/reset/change vẫn hoạt động theo contract. Resend delivery development đã được xác nhận bởi người dùng ngày 2026-09-24. Production vẫn cần domain/sender đã verify và cấu hình phù hợp trước release.

Chạy npm test, npm run test:password:db và npm run test:auth:db từ backend. Integration dùng PostgreSQL thật trong transaction rollback, email adapter giả; kiểm tra không còn fixture User/reset token/session sau test. Không migration, không thay CA/TLS. Email gửi sau commit/response; không lưu raw token để retry. Lỗi gửi chỉ log mã cố định, User có thể yêu cầu lại.

Forgot trả 202 trước khi lookup tài khoản/xử lý token/email để response không phụ thuộc tài khoản tồn tại hoặc độ trễ provider. Sau response, tác vụ memory tạo token trong transaction; chỉ sau commit mới gửi email. Lỗi tác vụ log mã cố định AUTH_PASSWORD_RESET_REQUEST_FAILED. Process dừng có thể mất tác vụ; không lưu queue/raw token, User cần yêu cầu lại. Missing config vẫn trả 503 trước lookup.

### Xác nhận delivery development

Resend ACCEPTED sau đúng một request Forgot; người dùng xác nhận email thực sự tới và nội dung/link/single-use/TTL 15 phút đúng ngày 2026-09-24. Token bị lộ trong ảnh đã invalidated; không dùng để reset và không gửi email thêm, giữ User test. Frontend /reset-password chưa triển khai; link localhost không mở trên điện thoại không phải lỗi backend. Auth Phase 2 READY chỉ nói về backend, không frontend hoặc production delivery.

## Owner Request backend Phase 1

Đã triển khai Customer create/list/detail và Admin list/detail/approve/reject theo `docs/API_SPEC.md`. Approve giữ role CUSTOMER, thêm OWNER qua OwnerProfile và thu hồi session cũ; cần login lại. Chưa có UI hoặc notification delivery cho Owner Request.

Tạo Admin vận hành bằng terminal tương tác, chủ động chạy trong `backend`:

```powershell
npm run bootstrap:admin
```

CLI hỏi họ tên, email, rồi password ẩn; dùng policy/Argon2id Auth hiện tại, chuẩn hóa email trim + lowercase. Không truyền password qua command arguments, file hoặc log. Email đã tồn tại bị từ chối; không đổi Customer thành Admin. Tạo ADMIN ACTIVE, không OwnerProfile/request. CLI không được gọi từ server startup/deploy và không có public HTTP endpoint. Không tự tạo Admin vận hành trong task; Admin fixture được dọn sau test.

Kiểm thử local: `npm test`. Integration Owner Request: `npm run test:owner:db` (cần database/TLS hiện tại). Test này tạo fixture commit tạm để kiểm tra concurrency trên kết nối riêng, sau đó cleanup theo đúng ID/email UUID; không gửi email. Regression: `npm run test:auth:db` và `npm run test:password:db`, fixture rollback, email adapter giả.

## Facility Core backend Phase 1

Có Owner create/list/detail/PATCH/submit và Admin list/detail/approve/reject/suspend/activate. Contract và trạng thái sẵn sàng tại `docs/specs/FACILITY_SPEC.md`, `docs/API_SPEC.md`, `docs/FEATURE_STATUS.md`.

Registry district đã được chốt: 94 đơn vị hành chính cấp xã của TP Đà Nẵng (23 phường, 70 xã, 1 đặc khu), theo Nghị quyết 1659/NQ-UBTVQH15 ngày 16/06/2025. `district` là tên field legacy trong API/schema, biểu diễn phường/xã/đặc khu, không biểu diễn quận/huyện. UI sau này dùng nhãn Khu vực hoặc Phường/Xã. Registry tại backend/src/modules/facilities/districts.js; không network/database lookup, không thêm package.

`npm run test:facility:db` chạy HTTP + Prisma integration với registry runtime thật. Chỉ registry rỗng được inject riêng để kiểm tra lỗi cấu hình. Fixture UUID riêng được commit tạm để dùng nhiều kết nối concurrency, cleanup đúng tập ID/email trong finally; không gửi email/notification, không chạm User test email thật. Chạy `npm test` cho validation local; regression dùng các script Auth/Owner Request hiện có.

ACTIVE có thể có 0 Court, chưa có giá/policy/ngân hàng/ảnh/amenity; không đồng nghĩa booking-ready. Public API, frontend, upload, cấu hình vận hành khác, notification và DELETE Facility chưa triển khai. Court Core có phase riêng nêu ở đầu README. Không có migration mới hoặc package mới cho task này.


Kiểm chứng Facility Core ngày 2026-09-26: registry 94 entry; local 15/15, Facility integration 13/13, Auth Phase 1 13/13, Phase 2 10/10, Owner Request 10/10 PASS; health 200, fixture cleanup. Facility Core Phase 1 backend READY. Đây là kết quả của phase Facility; Court Core có phase riêng, public/frontend vẫn chưa triển khai.

## Facility Presentation — quyết định 2026-09-28

Spec Facility Presentation đã cập nhật tại docs/specs/FACILITY_PRESENTATION_SPEC.md: Cloudinary public delivery, schema đủ, không migration. Implementation backend ở mục bên dưới; real upload/delivery/delete đã xác minh ngày 2026-09-29.

## Facility Presentation Phase 1 backend
Code tại backend/src/modules/facilities/presentation/. Owner images list/upload/delete/reorder và amenities read/replace; GET /api/v1/owner/amenities; Admin amenities list/create/update. Xem docs/specs/FACILITY_PRESENTATION_SPEC.md và docs/API_SPEC.md cho contract.
Package thêm: cloudinary 2.11.0, multer 2.4.0, file-type 22.1.1. Cấu hình backend CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET theo .env.example; không commit key. Thiếu cấu hình vẫn chạy auth/health/catalog, thao tác cần storage fail rõ; không dùng key giả.
Chạy npm test và npm run test:presentation:db tại backend. PostgreSQL test chỉ dùng fixture UUID riêng và cleanup trong finally; adapter Cloudinary giả, không upload thật. Supabase CA/TLS giữ nguyên, không migration. Cleanup best-effort; destroy fail log code/public_id để xử lý thủ công. Không tự retry upload hoặc background reconciliation. Real Cloudinary upload/delivery/delete đã xác minh trong development ngày 2026-09-29, đúng một ảnh và fixture đã cleanup.

## Kết quả Facility Presentation Phase 1 — 2026-09-28
Backend implementation và automated verification hoàn tất: local 29/29, Presentation PostgreSQL 12/12, regression 71/71 PASS; health HTTP 200; fixture cleanup/rollback PASS. Không schema/migration/.env/CA/TLS thay đổi. Cloudinary official SDK đã tích hợp; real upload chưa xác minh vì ba biến cấu hình MISSING. READY chỉ backend theo scope đã chốt, không frontend/production storage verification. Xem docs/FEATURE_STATUS.md (hoặc FEATURE_STATUS.md trong docs) cho giới hạn kiểm chứng.

## Real Cloudinary verification — 2026-09-29
Đã xác minh 1 upload (201), DB chỉ lưu public_id, delivery URL truy cập được và 1 DELETE (204, destroy=ok). Admin API xác nhận không còn asset test, fixture database đã cleanup; không gửi email thật hoặc đổi .env/schema/migration/CA/TLS. Local 29/29 và PostgreSQL 83/83 PASS, health200. Real verification: YES; backend Facility Presentation Phase 1: READY. Xem docs/FEATURE_STATUS.md. Các ghi nhận credentials MISSING ngày 2026-09-28 bên trên là lịch sử, không phải trạng thái hiện tại. Không triển khai Public/Frontend/Availability/Booking.

## Public Facility Phase 1 — backend implementation

[PUBLIC_FACILITY_SPEC.md](docs/specs/PUBLIC_FACILITY_SPEC.md): guest list/detail cho Facility ACTIVE của Owner ACTIVE, q/district/pagination và DTO whitelist. Không giá đại diện/rating/booking_ready; public Amenity catalog deferred. Hai endpoint và frontend Home/List/Detail đã triển khai. Schema giữ nguyên, không migration.

Public backend source: backend/src/modules/facilities/public/ (routes, validation, service). Chạy tại backend: `npm test` và `node --test test/public-facility.integration.js`. Regression dùng các script integration hiện có theo AGENTS. Public tests dùng fixture riêng, fake delivery adapter, cleanup trong finally; không email/upload thật. Kết quả ngày 2026-10-01: local32/32, Public PostgreSQL8/8, regression83/83 PASS; health200. Chi tiết docs/FEATURE_STATUS.md.

## Availability Phase 1 — backend

[AVAILABILITY_SPEC.md](docs/specs/AVAILABILITY_SPEC.md) đã chốt contract public một Court/ngày, state priority, DB-time snapshot, giá slot và error handling. Backend đã triển khai, Availability local/PostgreSQL PASS. Không triển khai Booking/expiry/CourtBlock CRUD/frontend. Kết quả regression tổng hợp tại docs/FEATURE_STATUS.md.

Chạy trong backend: `npm test` và `node --test test/availability.integration.js`. Integration dùng fixture riêng và cleanup; không gửi email hoặc gọi Cloudinary.

## Frontend Auth F1 — 2026-10-02

Đã có /login, /register, /forgot-password, /reset-password theo 6 PNG approved. Login về / (trang scaffold), Register không auto-login, Forgot/Reset success cùng route. Google/phone Register được ẩn; Change Password frontend và các trang nghiệp vụ chưa triển khai.

Trong frontend chạy npm test, npm run lint, npm run build. Kết quả 20/20 tests PASS, lint sạch, build PASS. Thêm react-router8.4.0; dev tooling vitest5.0.3, jsdom29.1.1, @testing-library/react16.3.3. Không thêm dependency backend.

Phải cấp VITE_API_BASE_URL theo frontend/.env.example khi chạy dev/build; task không sửa .env thật. Đã kiểm tra bằng biến môi trường của tiến trình với http://localhost:3000/api/v1. Backend FRONTEND_URL/CORS phải khớp origin frontend; production HTTPS và same-site theo cookie SameSite=Lax. Thiếu API base URL hiển thị lỗi cấu hình. SPA hosting cần fallback route. Không đưa secret vào VITE_*.

Tests chỉ fake HTTP trong môi trường test; browser Edge đã kiểm tra guest session backend thật và layout desktop1440/mobile390 không tràn ngang. Không tạo tài khoản/reset mật khẩu/gửi email thật trong kiểm chứng frontend này. Xem FEATURE_STATUS cho phạm vi DONE.

## Booking Phase 1 — backend

Ngày 2026-10-04: Booking Phase 1 backend đã triển khai POST /api/v1/bookings, GET /api/v1/bookings và GET /api/v1/bookings/:id. Chỉ Customer capability và dữ liệu cá nhân; POST Origin/CSRF. Transaction khóa User IDs tăng dần/loại trùng → Facility → Court → Booking liên quan → slot locks, recheck sau khóa. Giá tính chính xác bằng BigInt theo đơn vị nửa đồng, rounding theo spec; batch ghi BookingSlot/CourtSlotLock, overflow kiểm tra trước ghi. Lazy expiry tại create/detail, list read-only effective status; Availability không thay đổi. Không PaymentProof/Refund/worker/frontend.

Chạy trong backend: `npm test` và `node --test test/booking.integration.js`. Regression PostgreSQL theo AGENTS.md. Kết quả chi tiết, phạm vi DONE và cleanup tại docs/FEATURE_STATUS.md. Không thêm dependency, không sửa schema/migration/.env/CA/TLS.
