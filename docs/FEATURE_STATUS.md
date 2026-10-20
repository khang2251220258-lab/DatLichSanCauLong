# Feature Status

## Final Project Stabilization Phase 5A — CI workflow IMPLEMENTED, local rehearsal VERIFIED (2026-10-20)

The repository now has zero-secret GitHub Actions validation at `.github/workflows/ci.yml`, triggered by pull requests and pushes to `main`. It pins Node `24.14.1`, uses clean lockfile installs and dependency caching, cancels superseded runs, and grants only `contents: read`. Repository safety rejects tracked runtime environment files, private keys, dumps, pgpass files, and Playwright auth state. Backend validation runs production dependency audit, Prisma validate/generate using a disposable non-connected URL, and the non-database unit suite; frontend validation runs full and production audits, lint, canonical tests, and production build.

PostgreSQL integration is intentionally deferred from ordinary CI because this application requires verified TLS and a normal Actions PostgreSQL service would not reproduce that model without a TLS bypass. Public Playwright requires a live backend/API; authenticated and three-role rehearsal Playwright additionally create isolated fixtures and require protected credentials. These remain integration/staging-release gates until a separate reviewed disposable TLS-enabled application stack is added. The workflow neither deploys nor connects to Supabase, runs migrations, seeds, or mutates demo data. Local command rehearsal passed; no GitHub-hosted execution is claimed until this commit is pushed.

## Final Project Stabilization Phase 4B — isolated backup/restore rehearsal VERIFIED (2026-10-20)

The public application schema was restored into a guarded, empty, loopback-only PostgreSQL 17.11 target with native PostgreSQL 17.11 clients. The custom archive validated with `pg_restore --list` (exit 0), `pg_restore` completed with exit 0 and no warnings, and migration history, 26 tables, constraints/indexes, agreed counts, and Booking #1119 matched the fresh source snapshot. A second source read-only fingerprint confirmed no Supabase source mutation, migration, seed, demo-data change, or Booking #1119 change. Prisma validate/generate passed.

The local target was then configured independently with verified local TLS. A `verify-full` connection used TLSv1.3 / `TLS_AES_256_GCM_SHA384`, CA verification, and hostname verification for `localhost`. Process-scoped backend credentials and CA configuration connected Prisma to the restored target; temporary-backend health, readiness, Public Facility, Guest Search, and Recurring Search GET smokes each returned HTTP 200 with valid response contracts. Post-smoke source and target counts, plus Booking #1119, remained unchanged. No TLS bypass, permanent `.env` change, migration, seed, reset, db push, or business mutation occurred. The restored target and external backup artifact are retained; provider/domain/proxy topology, staging validation, monitoring ownership, and production deployment remain blocked.

## Final Project Stabilization Phase 3 — authenticated release rehearsal VERIFIED (2026-10-19)

The isolated authenticated rehearsal covers Customer, Owner, and Admin through the real Login UI, real session cookies, browser navigation, and the development PostgreSQL database. It creates only `TEST_E2E_RELEASE_` records, executes one V2 booking create, Owner confirmation, recurring create, Owner series confirmation, Owner Analytics reads, and one Admin Amenity mutation; exact manifest cleanup and verify-only postflight returned every scoped count to zero. Booking #1119 remained unchanged.

The final run passed **1/1** in 3.4 minutes. Critical POST requests were each exactly one; Owner Analytics issued one Overview and one Courts request; no unexpected console or page error occurred. Expected session-bootstrap 401s were counted and matched their browser-console messages. A regression now prevents Login from restoring a resource-scoped Booking or Series URL captured for a prior account, including when the newly logged-in Owner also has CUSTOMER capability. Frontend regression **409/409**, targeted Auth/Facility/Recurring **64/64**, lint, and production build passed. Screenshots `release-*.png` are **REVIEW CANDIDATE**, not approved UI references.

No schema, migration, normal seed, external email/upload, or demo-data mutation occurred. Production deployment remains blocked by reviewed immutable commits, provider/domain/proxy topology, an isolated backup/restore rehearsal, staging deployment validation, and monitoring ownership.

## Final Project Stabilization Phase 2 — RELEASE HARDENING (2026-10-19)

Production single-booking contract now requires explicit `BOOKING_FLOW_VERSION=2`; development remains backward-compatible with missing value defaulting to V1. Prisma CLI/client/PostgreSQL adapter were upgraded together from 7.10.0 to 7.10.1, closing the four previously reported HIGH npm advisories. A bounded database readiness endpoint `/api/v1/ready` complements the unchanged liveness endpoint `/api/v1/health`. Production environment, migration, backup, rollback, monitoring, proxy and smoke procedures are documented in `docs/DEPLOYMENT.md`; the reviewable commit split is documented in `docs/RELEASE_BASELINE_PLAN.md`.

This section records release hardening, not production deployment. Provider/domain/proxy topology, backup/restore rehearsal and full authenticated three-role release rehearsal remain required. Historical phase tables below remain timeline records and do not override this current state.

## Recurring Booking Phase 5D — authenticated Customer runtime VERIFIED (2026-10-18)

Authenticated Playwright đã xác minh luồng Customer thật trên `/booking-series` và `/booking-series/:series_id` bằng fixture PostgreSQL cô lập `TEST_E2E_CUSTOMER_`, đăng nhập qua UI và session cookie thật. Dataset runtime gồm một Series `CONFIRMED` với child `COMPLETED`, `CANCELLED` + Refund `PENDING` và hai child `CONFIRMED`; không tạo private proof giả khi không có asset authenticated an toàn. Desktop/tablet/mobile đều không horizontal overflow, modal hủy giữ focus/Escape, list/detail trực tiếp cùng SPA Back/Forward hoạt động.

Initial Series List và Detail mỗi route phát đúng một GET trong React StrictMode; không có per-child Booking/Refund/PaymentProof N+1. Runtime evidence: authenticated Playwright **4/4 PASS**; recurring targeted **16/16 PASS**; frontend tuần tự **409/409 PASS**; backend local **93/93 PASS**; lint, build, Prisma validation, health 200 và diff check PASS. Sáu ảnh `recurring-customer-*` là **REVIEW CANDIDATE, chưa APPROVED**. Fixture, AuthSession và file credential tạm đã cleanup; verify-only trả mọi count bằng 0, Booking #1119 không đổi. Refund `PROOF_SUBMITTED`/`REFUNDED` chưa được dựng trong E2E này vì task không cho phép giả private storage identifier; lifecycle đó vẫn có PostgreSQL/component evidence từ Phase 5B/5C.

## Recurring Booking Phase 5C — Customer occurrence cancellation/refund UI COMPLETE (2026-10-18)

Customer Series Detail `/booking-series/:series_id` now renders authoritative mixed child states, cancellation deadline/block reason and child-level financials. Only a server-advised `can_cancel=true` occurrence exposes an accessible confirmation modal; the frontend posts no financial or actor fields, uses a synchronous lock, never retries the mutation, and performs an authoritative Series refetch after success, 409 or an uncertain result. Parent Series and siblings remain unchanged.

Cancelled occurrences render their child Refund lifecycle. `PENDING` is read-only without a proof request; `PROOF_SUBMITTED`/`REFUNDED` load the private signed proof only after an explicit disclosure action and reuse the existing Customer acknowledgement flow. Exact DTO validation now enforces cancellation/refund state timestamps, child identity and refund amount equal to the child deposit. Evidence: targeted recurring **15/15 PASS**, full sequential frontend **408/408 PASS**, lint and production build PASS. No backend, database, schema, migration, seed, demo data or Booking #1119 change; bulk/future/whole-Series cancellation and recurring PaymentProof remain deferred.

## Recurring Booking Phase 5B — occurrence cancellation/refund backend COMPLETE (2026-10-18)

Backend và verification closure đã hoàn tất. Customer có thể hủy đúng một confirmed recurring child qua endpoint explicit; child giữ BookingSlot history, chỉ nhả locks của nó và tạo Refund bằng deposit snapshot; parent Series giữ `CONFIRMED`. Refund invariant giữ V1 PaymentProof evidence và mở hẹp confirmed recurring V2 evidence. PostgreSQL đã chứng minh before/exact/after cutoff bằng DB-returned clock, rollback sau Refund insert, cancel/cancel, concurrent child A/B, lock identity isolation, Availability sau commit và Refund lifecycle `PENDING -> PROOF_SUBMITTED -> REFUNDED`.

Evidence: backend local **93/93**; recurring PostgreSQL **17/17**; Recurring Search **7/7**; Guest Search **5/5**; Public Facility **9/9**; Availability **6/6**; Booking V2 **14/14**; Booking V1 **19/19**; Payment/Refund **22/22**; Owner Analytics **5/5**; mọi fixture cleanup PASS. Frontend recurring **9/9**, full sequential frontend **402/402**, lint/build, health/public/guest/recurring smoke và diff check PASS. Ghi chú Customer UI pending ở mốc Phase 5B đã được Phase 5C phía trên thay thế; không schema/migration/seed/demo mutation và Booking #1119 giữ nguyên.

## Public Recurring Search — UI REDESIGN VERIFIED (2026-10-17)

`/facilities?mode=recurring` now has a compact public-search hierarchy, accessible segmented mode selector, grouped recurring date/time controls, neutral constraint guidance, distinct initial/empty/error/loading states and authoritative result metadata. Existing recurring validation, URL hydration, pagination, matching-Court selection, guest intent and strict response handling are unchanged.

Evidence: Public Search targeted **20/20 PASS**, responsive read-only Playwright **3/3 PASS** with zero pre-submit and exactly one post-submit recurring GET, full frontend **402/402 PASS** using the stable single-worker `vmThreads` run, lint and production build PASS. Four generated screenshots are **review candidates**, not approved references. Backend/database/schema/migration/demo data and Booking #1119 were unchanged.

## Public Home Facility Showcase — UI REDESIGN VERIFIED (2026-10-17)

The Home Facility section now uses an explicit `FacilityCard` Home variant with image-first 3:2 media, strong Facility identity, district/address hierarchy, at most three amenity chips plus an authoritative remainder count, and the lightweight **Xem sân** action. The list DTO has no price summary, so the showcase does not display or derive a price. Search Results retain their existing availability-focused `matching_courts`, URL state, and **Xem chi tiết** behavior.

Home still performs one `GET /facilities?page=1&page_size=4`; no per-card detail request or dependency was added. Read-only Playwright passed desktop/tablet/mobile **3/3**, with one list request, zero pre-navigation detail requests, correct Detail navigation, and no body overflow. Guest one-time plus recurring search Playwright passed **6/6**. Targeted frontend **91/91**, full sequential frontend **402/402**, lint, production build, and diff check PASS. Three generated Home showcase screenshots are review candidates, not approved references. Backend/database/schema/migrations/demo data and Booking #1119 were unchanged.

## Owner Analytics Phase 4 — AUTHENTICATED RUNTIME VERIFIED / MVP CLOSED (2026-10-18)

Authenticated Playwright now creates an isolated `TEST_E2E_OWNER_ANALYTICS_` Owner/Facility dataset, signs in through the real Login UI, and verifies `/owner/analytics` at desktop, tablet, and mobile. Initial load issues exactly one Overview GET plus one Courts GET in parallel; Court pagination only reloads Courts, filters reload both datasets with HTTP 200, URL state survives navigation, and protected snapshots make the measured revisit visible in 141 ms. Runtime screenshots are review candidates, not approved design references.

Phase 4 found and fixed two runtime integration defects: Courts metadata returned an undocumented `total_pages` field rejected by the strict frontend DTO, and the shared Owner read hook allowed React StrictMode's discarded mount to reach the API. The response now uses the standard exact list metadata, while deferred initial reads retain abort/generation/cache isolation without duplicate initial GETs. Evidence: authenticated Playwright **4/4 PASS**, Owner Analytics frontend **6/6**, backend local **93/93**, Analytics PostgreSQL **5/5**, full frontend **409/409**, lint/build/Prisma/health/diff PASS. All E2E rows, sessions, and temporary credentials were cleaned; Booking #1119 remained unchanged. No schema, migration, seed, or persistent demo-data change. **Owner Analytics MVP is CLOSED.** Next phase: **FINAL PROJECT STABILIZATION**.

## Owner Analytics Phase 3 — OWNER DASHBOARD IMPLEMENTED / VERIFIED (2026-10-17)

Route `/owner/analytics` is implemented inside the shared Owner workspace with URL-backed Facility/date filters, an Asia/Ho_Chi_Minh last-30-day default, four contract-labelled KPIs, monthly trend, weekday use, accessible half-hour heatmap, compact daily capacity, and server-paginated Court performance. It consumes exactly one Overview and one Courts request per filter state; Court-only pagination does not refetch Overview. Strict DTO validation, account/capability/path-isolated protected snapshots, AbortController/generation guards, last-known-good background refresh, and zero-capacity semantics are retained. The UI labels `confirmed_booking_value` as scheduled confirmed booking value, never actual revenue.

Frontend evidence: Analytics targeted plus Owner/Auth regression **141/141 PASS**; full sequential frontend **401/401 PASS**; lint, production build and `git diff --check` PASS. The default parallel run exhausted local worker memory, so the authoritative full run used one file worker as required by the project handoff. No backend, database, schema, migration, seed, demo data, or Booking #1119 was changed. Owner Playwright was not run because `E2E_OWNER_EMAIL` and `E2E_OWNER_PASSWORD` are not configured; no screenshots were generated.

## Owner Analytics Phase 2 — BACKEND IMPLEMENTED / VERIFIED (2026-10-17)

Protected read-only `GET /api/v1/owner/analytics/overview` and paginated `GET /api/v1/owner/analytics/courts` are implemented. Analytics counts `Booking` occurrences (including recurring children), not `BookingSeries`; CONFIRMED/COMPLETED drive value and occupancy, financial metrics keep confirmed deposits and Customer-confirmed REFUNDED amounts separate, and capacity uses current opening hours/current ACTIVE Courts with CourtBlock excluded. Owner identity comes only from the ACTIVE session; optional Facility filters are ownership checked and cross-owner access returns 404.

Overview keeps two parameterized PostgreSQL statements in parallel; Court performance uses one aggregate statement. Local/query-budget **6/6 PASS** and PostgreSQL Analytics integration **5/5 PASS**, including seven Booking states, recurring child, Refund state matrix, timezone boundary, CourtBlock, zero capacity, pagination, isolation, and fixture cleanup. Ten read-only samples and final EXPLAIN found no evidence for an index or migration. The newer Phase 3 entry supersedes the former frontend deferral; actual 70% revenue and exact historical configuration remain unavailable.

## Recurring Booking Phase 4 — CUSTOMER / OWNER FRONTEND IMPLEMENTED / VERIFIED (2026-10-17)

Public `/facilities` now offers accessible one-time and recurring modes. Recurring state is URL-backed, uses strict all-occurrence search, preserves the exact confirmation destination through Login/Register without browser storage, and posts only the approved recurring intent. Customer routes `/booking-series` and `/booking-series/:series_id` group children at Series level and show aggregate bank/QR instructions with DB-time 30-minute countdown; no recurring PaymentProof UI exists. Owner routes `/owner/booking-series` and `/owner/booking-series/:series_id` provide list/detail plus whole-Series quick confirm/reject with synchronous locks and authoritative recovery.

Frontend DTOs fail closed; protected reads retain identity/capability/path cache isolation, AbortController and stale-response guards. Evidence: targeted recurring/Owner regression **48/48 PASS**, full sequential frontend **395/395 PASS**, public read-only Playwright desktop/tablet/mobile **3/3 PASS**, lint/build/diff PASS. Three generated screenshots are **review candidates, not approved references**. Backend/schema/migration/database/demo data and Booking #1119 were not changed. Recurring occurrence cancellation/refund, bulk cancellation, analytics and PaymentProof remain deferred.

## Recurring Booking Phase 3 — BACKEND IMPLEMENTED / VERIFIED (2026-10-17)

Atomic `POST /api/v1/bookings/recurring`, Customer/Owner Series list/detail, shared DB-time 30-minute expiry và Owner whole-series confirm/reject đã hoàn tất. Create all-or-nothing qua BookingSeries, V2 children, BookingSlots và CourtSlotLocks; aggregate money child-first, bank/QR snapshots bất biến, reference `CLDNS <SERIES_ID>`, PaymentProof bị chặn cho recurring/V2. Evidence: backend local **86/86 PASS**; Phase 3 PostgreSQL **13/13 PASS** gồm injected rollback, create/create, partial overlap, single-vs-Series và confirm/reject races; Booking V2 **14/14**, legacy Booking **19/19**, Recurring Search **7/7**, Availability **6/6**, Payment **22/22** PASS, mọi fixture cleanup PASS. Không đổi schema/migration/demo data; runtime baseline vẫn 47 Booking/35 PaymentProof/9 Refund/140 BookingSlot/65 locks/0 Series và Booking #1119 giữ nguyên. Frontend và recurring cancellation/refund vẫn deferred.

## Recurring Booking Phase 2 — BACKEND FOUNDATION IMPLEMENTED / VERIFIED (2026-10-17)

**Recurring Booking Phase 2 backend foundation: COMPLETE (2026-10-17).** Business rules đã approved; migration additive tạo `BookingSeries` và nullable `Booking.booking_series_id`, không rewrite Booking V1/V2. Public strict all-occurrence `GET /api/v1/facilities/recurring-search` đã triển khai bằng một PostgreSQL statement, cùng recurrence expansion/validation và PostgreSQL integration coverage. Evidence: local backend 83/83, recurring PostgreSQL 7/7, related PostgreSQL regression 56/56, health/public smoke 200; 10 remote samples p50 280.3 ms/p95 282.6 ms, plan execution 7.37 ms và không cần performance index mới. BookingSeries runtime count sau verification là 0; Booking #1119 và baseline 47 Booking/35 PaymentProof/9 Refund giữ nguyên. Recurring create, series reads/actions/payment/cancellation/refund mutation và frontend vẫn deferred. Contract: `docs/specs/RECURRING_BOOKING_SPEC.md`.

## Guest Search Phase 3 — PUBLIC UI IMPLEMENTED / VERIFIED (2026-10-17)

Home, `/facilities`, and `/facilities/:facility_id` now support the public one-date interval-search flow using `district + date + start_time + end_time`, while Facility List keeps `q` and pagination in URL state. Interval cards use the strict `matching_courts` DTO; Detail preserves search context, highlights only matching ACTIVE Courts, and rechecks the selected Court through Availability before restoring a 1–6 slot selection. Recurring search backend is now covered by the newer Phase 2 entry above; recurring UI remains deferred.

Guest booking intent is held only in React/router memory and causes no pre-login mutation. Login/Register restore the confirmation destination only after the new authoritative session has CUSTOMER capability; ADMIN and stale cross-role destinations fail closed to capability landing pages. Booking create, price calculation, locking, expiry, and `SLOT_UNAVAILABLE` remain backend-authoritative. Targeted frontend **137/137 PASS**, full sequential frontend **386/386 PASS**, lint/build PASS, public Playwright desktop/tablet/mobile **3/3 PASS**, health 200. Backend/schema/migration/database/demo data were not changed in Phase 3. Recurring/fixed-schedule search remains deferred.

## Guest Search Phase 2 — BACKEND IMPLEMENTED / VERIFIED (2026-10-17)

Public `GET /api/v1/facilities` đã hỗ trợ bộ ba all-or-none `date`, `start_time`, `end_time` cùng `q`, `district` và pagination hiện hành. Một Facility chỉ match khi có ít nhất một ACTIVE Court AVAILABLE cho toàn bộ 1–6 slot 30 phút; V1/V2 effective holds, CourtBlock, PriceRule, half-open boundary và DB time được xử lý trong một PostgreSQL statement. Interval DTO thêm `matching_courts`; list không interval giữ nguyên DTO cũ. Local backend **77/77 PASS**, Guest Search PostgreSQL **5/5 PASS**, Public Facility PostgreSQL **9/9 PASS**, Availability **6/6 PASS**, Booking V2 **14/14 PASS**; query-budget một round trip và performance read-only 10 mẫu p50 259.9 ms/p95 272.1 ms. Fixtures cleanup PASS; không đổi schema/migration/demo data. Ghi chú lịch sử: frontend Guest Search còn deferred tại thời điểm Phase 2; Phase 3 ở trên đã hoàn tất public UI. Recurring search vẫn DEFERRED.

## Admin Owner Request List visual redesign — 2026-10-14

`/admin/owner-requests` đã được đồng bộ với Admin workspace hiện hành: hierarchy quản lý tài khoản rõ ràng, total theo pagination metadata, filter trạng thái có `aria-pressed`, desktop dùng semantic table và tablet/mobile dùng semantic list/card không overflow. List chỉ render Owner Request snapshot DTO, không fetch User/Profile/OwnerProfile, không thêm moderation action hoặc thay API/state machine.

Loading skeleton, empty/error, pagination, protected snapshot cache 30 giây, background revalidation, strict DTO validation, AbortController/generation guard và isolation theo User/capability/exact path được giữ nguyên. Targeted Owner Request/cache **18/18 PASS**; authenticated Playwright read-only tạo screenshot desktop/tablet/mobile và không gọi Approve/Reject. Backend/database/schema/migration/seed/demo data không đổi.

## Admin Facility Detail visual redesign — 2026-10-14

`/admin/facilities/:facility_id` đã được chuyển thành detail workspace trong Admin shell hiện hành: một H1 **Chi tiết cơ sở**, Facility identity/status rõ ràng, definition-list read-only và bố cục desktop khoảng 65/35. Năm Facility states giữ đúng action matrix; DRAFT/REJECTED không có mutation, PENDING approve/reject, ACTIVE suspend và SUSPENDED activate. Tablet/mobile stack theo nội dung, touch target/focus/reduced-motion và long-content wrapping được giữ.

Không đổi API/DTO hoặc state machine. Strict response validation, AbortController/generation guard, snapshot preservation, double-submit lock, Origin/CSRF, 409 và unknown-result authoritative recovery tiếp tục được kiểm chứng. Targeted Admin Facility/reliability **28/28 PASS**; authenticated Playwright read-only desktop/tablet/mobile **3/3 PASS**, một GET cho mỗi detail URL và không horizontal overflow/console error sau login. Full frontend chạy tuần tự **372/372 PASS**. Backend/database/schema/migration/seed và demo data không đổi; Playwright không gọi Admin mutation.

## Personal Account Center — COMPLETE (2026-10-13)

- Shared `/profile` provides Profile, Security, and Capabilities/Account sections for Customer, Owner, and Admin.
- The existing change-password endpoint is exposed through a guarded UI; success clears frontend auth and requires login again. Accounts without a local password receive a read-only explanation.
- The shared header has one accessible capability-aware account menu. Owner Request links to Profile while existing request snapshots remain unchanged.
- Email change, avatar upload, account deletion, 2FA, session management, and arbitrary preferences remain deferred.

## Shared Personal Profile — 2026-10-13

Shared route `/profile` đã triển khai cho Customer, Approved Owner và Admin. Backend `GET/PATCH /api/v1/users/me` trả DTO whitelist và chỉ cho tự cập nhật `full_name`/`phone`; email/capabilities/identity server-managed, phone rỗng chuẩn hóa `null`, PATCH bắt buộc session ACTIVE + Origin + CSRF và khóa User trước khi ghi. Frontend có strict response validation, abort/generation guard, snapshot preservation, synchronous submit lock, unknown-result authoritative GET recovery và đồng bộ AuthContext/Header ngay sau save.

Owner Request tiếp tục chụp snapshot `full_name/email/phone` tại thời điểm submit; sửa Profile không đổi request PENDING hoặc lịch sử. Email change, avatar upload, Change Password UI và full account menu/settings vẫn deferred. Không đổi schema/migration và không seed/demo mutation.

## Admin Facility List visual redesign — 2026-10-13

`/admin/facilities` đã chuyển từ div-grid CRUD sang hàng đợi vận hành rõ hierarchy. Desktop dùng semantic table; tablet/mobile chuyển record thành card có nhãn, status text và detail action dùng được bằng bàn phím/touch. UI chỉ dùng list DTO thật, bỏ cột Owner giả và không thêm search, analytics, Court/gallery/amenity/pricing.

Filter/pagination, strict response validation, AbortController/generation guard và snapshot preservation được giữ nguyên. Targeted Admin Facility **23/23 PASS**; authenticated Playwright desktop/tablet/mobile **3/3 PASS** và không có horizontal overflow. Full frontend chạy tuần tự **343/343 PASS**, lint/build và `git diff --check` PASS. Facility Detail và các màn Admin khác chưa được redesign trong phase này; backend/database/schema/migration/seed không đổi. Trong regression, chuỗi tiếng Việt bị mojibake từ thay đổi Admin Amenity đang có trong working tree đã được chuẩn hóa encoding mà không đổi logic.

## Playwright baseline + Admin Workspace Shell — 2026-10-13

- Playwright Test 1.64.0 được cấu hình cho Vite local tại `http://localhost:5173`, đồng bộ với Origin/CORS backend. Public smoke chạy tách biệt trên Chromium, Firefox và WebKit; artifacts chỉ giữ khi thất bại.
- Admin shell dùng header, account/logout, sidebar đúng ba route thật (`/admin/facilities`, `/admin/owner-requests`, `/admin/amenities`), active state hỗ trợ route detail, responsive theo desktop/tablet/mobile và không thay page content.
- Authenticated Admin E2E là read-only, lấy `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` từ environment. Thiếu credential thì test skip rõ ràng; không giả session/capability và không ghi Supabase.
- Screenshot runtime do E2E tạo chỉ là **review candidate**, chưa phải approved UI reference. Admin Reliability Hardening vẫn được giữ nguyên.
## One Booking full lifecycle E2E — 2026-10-13

Booking `1119` đã đi qua production API trên Supabase development theo một trace duy nhất: `PENDING_PAYMENT → PENDING_CONFIRMATION → CONFIRMED → CANCELLED`; PaymentProof `null → SUBMITTED → APPROVED`; Refund `null → PENDING → PROOF_SUBMITTED → REFUNDED`. Hai private Cloudinary proof tải được qua signed URL TTL 300 giây; final DB giữ 2 BookingSlot, 0 CourtSlotLock, đúng 1 PaymentProof/Refund và tiền 30/70 nhất quán. Terminal mutation, ownership, CSRF/Origin, private DTO và regression đều PASS. Evidence chi tiết tại [FULL_BOOKING_LIFECYCLE_E2E_AUDIT.md](reviews/FULL_BOOKING_LIFECYCLE_E2E_AUDIT.md).

## Demo Payment/Refund proof assets — 2026-10-13

Demo full-state dataset đã có binary PNG tổng hợp thật cho 24 PaymentProof và 4 Refund proof trong Cloudinary authenticated/private storage. Seed dùng stable managed namespace, đồng bộ byte metadata, dọn stale object trong đúng namespace và rerun không upload trùng; signed delivery của 28/28 object PASS. Runtime API xác minh PENDING_CONFIRMATION, CONFIRMED, Refund PENDING/PROOF_SUBMITTED/REFUNDED, anonymous rejection và DTO không lộ storage identifier. Không đổi schema, migration, API hay business state.

## Owner Booking Detail visual redesign — 2026-10-13

Route `/owner/bookings/:booking_id` đã được chuyển thành workspace vận hành với H1 chung **Chi tiết đặt sân**, bố cục desktop khoảng 68/32 và responsive stack trên tablet/mobile. Giao diện hỗ trợ đủ bảy Booking states, giữ đúng PaymentProof review, Confirm/Reject, Owner cancellation và Refund lifecycle; trạng thái read-only không để lại vùng action rỗng.

Strict DTO validation, private signed proof URL, 409/unknown-result recovery, snapshot preservation, abort/generation guard, auth/ownership và CSRF/Origin được giữ nguyên. Targeted Owner Payment/Refund/Auth/Booking **128/128 PASS**; full frontend chạy tuần tự **325/325 PASS**; lint/build PASS. Backend, API, business logic, database, schema, migration và demo data không đổi.

## Owner Booking List visual redesign — 2026-10-12

Nội dung `/owner/bookings` đã được nâng cấp thành booking operations list trong Owner workspace shell approved. Header gồm eyebrow, H1, mô tả và status filter hiện hành; mỗi booking nhóm Customer/Booking ID, Facility/Court, lịch chơi, tiền cọc, semantic status và detail action. Phone chỉ hiển thị khi DTO có dữ liệu; không tạo fallback giả.

Initial loading, blocking error, empty, filtered-empty, background refresh/error và pagination được trình bày riêng; background failure giữ snapshot gần nhất. Tablet/mobile chuyển row thành card, không ép desktop table hoặc tạo horizontal overflow. Targeted Owner Booking/Payment/Refund/Auth/Facility **107/107 PASS**, full frontend tuần tự **310/310 PASS**, lint/build PASS. Owner Booking Detail chưa được redesign trong phase này; backend/API/business logic/database/schema/migration/seed không đổi.

## Owner Facility List visual redesign — 2026-10-11

Vùng nội dung `/owner/facilities` đã được nâng cấp thành management list trong Owner workspace shell hiện hành: page eyebrow/H1/support copy/CTA có hierarchy rõ; Facility name là thông tin chính; địa điểm, giờ hoạt động, số sân, trạng thái và action được nhóm theo mục đích vận hành. Desktop dùng list/table hybrid, tablet/mobile chuyển từng Facility thành card và không tạo horizontal overflow.

Phase này không tạo summary cards vì contract phân trang chỉ cung cấp tổng số Facility authoritative; tổng Court và số Facility theo trạng thái từ trang hiện tại không đại diện toàn bộ tài khoản. `meta.total` chỉ được dùng làm metadata của danh sách. Initial loading, background refresh, empty, blocking error và populated/stale-snapshot error đã được tách riêng; refetch nền không xóa dữ liệu đã xác minh. Targeted Owner/Auth **68/68 PASS**, full frontend tuần tự **307/307 PASS**, lint/build PASS. Không đổi backend, API, business logic, database/schema/migration, seed hoặc demo data.

## Owner Workspace Shell Redesign Phase 1 — 2026-10-11

Owner shell đã chuyển sang workspace operational dùng chung cho toàn bộ `/owner/*`: Header compact giữ brand/account/logout; từ Analytics Phase 3 sidebar có ba mục **Cơ sở của tôi**, **Đơn đặt sân**, **Thống kê**. Active state theo route thực và Facility route lồng nhau vẫn thuộc mục Facility. Tablet/mobile dùng navigation theo hàng ngang thay sidebar cố định; focus, `aria-current`, vùng bấm và reduced-motion theo product tokens hiện hành.

Phase này chỉ thay shell/presentation. Nội dung Facility và Booking, `useOwnerRead`, capability guard, logout/role-switch, Payment/Cancel/Refund state machine, signed private asset, 409 recovery và unknown-result fail-closed giữ nguyên. Kiểm chứng targeted Owner/Auth/Refund **103/103 PASS**, full frontend **306/306 PASS**, lint/build PASS; không đổi backend/database/schema/migration/seed hoặc demo data. Redesign nội dung từng Owner page vẫn thuộc các phase sau.

## Frontend data/loading reliability hardening — 2026-10-11

Frontend API giữ timeout 20 giây và phân loại riêng `REQUEST_CANCELLED`, `REQUEST_TIMEOUT`, `NETWORK_ERROR`, HTTP/API error và `INVALID_RESPONSE`. Booking/Owner/Admin reads hủy request khi unmount/resource đổi, dùng generation để chặn stale commit và giữ snapshot đã xác minh trong background refetch; background failure giữ nội dung với lỗi có thể retry.

PaymentProof/Refund proof private dùng `server_time` của DTO cộng elapsed monotonic từ lúc nhận response để theo dõi TTL. Expiry hoặc lần đầu `img.onerror` yêu cầu signed URL authoritative mới; lỗi ảnh lần hai dừng ổn định, có manual retry và không lộ URL/path trong message. Owner proof loader bảo vệ race booking A → B. Kiểm chứng frontend tuần tự **300/300 PASS**, targeted reliability/Payment/Refund/Booking/Auth/Owner PASS, lint/build PASS; không đổi backend/database/schema/migration/seed và không gọi dịch vụ thật.

## Admin frontend reliability hardening — 2026-10-13

Admin Facility list/detail/mutation dùng validator exact theo DTO backend và invariant metadata theo trạng thái; malformed 2xx không được commit như thành công. Facility, Owner Request và Amenity reads dùng AbortController cùng generation/resource key, giữ snapshot đã xác minh khi background refresh lỗi và không commit response cũ sau đổi resource/session. Mutation 409 hoặc kết quả không chắc chắn được đối chiếu lại bằng authoritative GET; nếu GET cũng lỗi, UI giữ snapshot, khóa mutation tiếp theo và cung cấp retry read. Amenity create không tự retry POST nên không tạo trùng khi kết quả transport chưa rõ. Kiểm chứng targeted Admin/Auth/API reliability **98/98 PASS**, full frontend **342/342 PASS**, lint/build và `git diff --check` PASS; không đổi backend/database/schema/migration và không chạy seed.

## Auth role-switch redirect stabilization — 2026-10-11

Logout đã xóa session/capability state và thay protected URL bằng `/login` không kèm redirect state. Login đọc lại session authoritative, kiểm tra destination theo capability mới và không phục hồi resource-scoped URL cần ownership của tài khoản trước; fallback lần lượt là Customer `/`, Owner `/owner/facilities`, Admin `/admin/facilities`. Regression bao phủ đủ sáu chiều CUSTOMER/OWNER/ADMIN và đổi giữa hai tài khoản cùng capability.

## Owner CONFIRMED cancellation — implemented 2026-10-11

`POST /api/v1/owner/bookings/:booking_id/cancel` đã triển khai cho Owner sở hữu Facility: chỉ `CONFIRMED` với PaymentProof `APPROVED`, reason bắt buộc 1–500 Unicode code points và không áp cutoff Customer. Transaction khóa User tăng dần → Facility → Court → Booking → PaymentProof → Refund, ghi `cancelled_by=OWNER` bằng DB time, tạo đúng một Refund `PENDING` bằng `deposit_amount`, nhả CourtSlotLock và giữ BookingSlot/PaymentProof nguyên vẹn; cross-owner 404, Origin/CSRF và race Owner/Owner, Owner/Customer đã được kiểm chứng.

Route `/owner/bookings/:booking_id` đã triển khai reference `CURRENT/APPROVED` `owner-booking-confirmed-cancellation-desktop.png`: action chỉ hiện cho `CONFIRMED` + proof `APPROVED`, shared accessible modal hiển thị tiền hoàn chỉ đọc, reason/counter và destructive confirm. Frontend validate response exact, không optimistic update, refetch authoritative state sau success/409/unknown/malformed 2xx và tái sử dụng `OwnerRefundPanel`; không có Refund Center. Kiểm chứng: backend unit **59/59**, Payment/Owner/Refund PostgreSQL **22/22** với cleanup PASS, Booking PostgreSQL **19/19** với cleanup PASS, frontend targeted Owner/Refund **29/29**, full frontend **284/284**, lint/build PASS. Không đổi schema/migration, không seed/mutate demo data hoặc gọi dịch vụ ngoài thật.

## Refund workflow — implemented 2026-10-10

Owner và Customer xử lý Refund ngay trong Booking Detail theo hai reference CURRENT/APPROVED. Backend có GET/POST theo `refund_id`, ownership 404, Origin/CSRF, private authenticated proof URL TTL 300 giây và state duy nhất `PENDING → PROOF_SUBMITTED → REFUNDED`. Proof JPEG/PNG tối đa 5 MB/25 triệu decoded pixels, immutable sau submit; Customer confirm ghi hai terminal timestamp bằng cùng DB time. Không có Refund Center/list/reject/dispute/replace/delete/resubmit.

Kiểm chứng: backend unit **58/58 PASS**, Payment/Refund PostgreSQL **18/18 PASS**, Booking PostgreSQL **19/19 PASS**, toàn bộ integration regression và fixture cleanup PASS; frontend targeted **8/8**, full **278/278**, lint/build PASS. Không đổi schema/migration, không seed/mutate demo data và không gọi Cloudinary thật trong test.

## Cách đọc tài liệu này

Bảng **Baseline hiện tại** ngay bên dưới và các mục cập nhật mới nhất là nguồn trạng thái hiện hành. Các mục phase cũ được giữ làm bằng chứng kiểm chứng; mọi dòng có nhãn `HISTORICAL/SUPERSEDED` không được dùng để hạ trạng thái feature hiện tại.

## Customer CONFIRMED cancellation — implemented 2026-10-10

`POST /api/v1/bookings/:id/cancel` hỗ trợ `CONFIRMED → CANCELLED` khi Customer sở hữu booking, PaymentProof vẫn `APPROVED`, snapshot cutoff khác null và DB time nhỏ hơn nghiêm ngặt deadline. Cùng transaction ghi metadata, tạo đúng một Refund `PENDING` bằng `deposit_amount`, nhả `CourtSlotLock`, giữ `BookingSlot` và PaymentProof. `/bookings/:booking_id` đã triển khai reference approved, cutoff/deadline, eligibility, modal accessible và Refund lifecycle tiếp theo.

Kiểm chứng: backend unit **58/58 PASS**, Booking PostgreSQL integration gồm cutoff/payment/refund/locks/rollback/concurrency và fixture cleanup PASS; frontend targeted **40/40 PASS**, full frontend **270/270 PASS**, lint/build PASS. Không đổi schema/migration, không seed hoặc mutate demo data.

## Customer CONFIRMED cancellation reference — 2026-10-10

`docs/ui-reference/customer-booking-confirmed-cancellation-desktop.png` đã được mở, đối chiếu source và đăng ký `CURRENT/APPROVED` cho `/bookings/:booking_id` ở state `CONFIRMED`. Reference thể hiện Booking/payment/cost snapshot, cutoff/deadline và action hủy; dữ liệu minh họa không phải runtime contract. HISTORICAL/SUPERSEDED — tại thời điểm review, backend mới chỉ hủy `PENDING_PAYMENT`. Hiện `CONFIRMED → CANCELLED`, Refund `PENDING` nguyên tử và frontend action đã triển khai; Refund processing lifecycle vẫn deferred.

HISTORICAL/SUPERSEDED — Schema đã có cancellation metadata, cutoff snapshot, `Refund` và unique một Refund/Booking nên không cần migration theo contract hiện hành. Tại thời điểm review, business rule bắt buộc cancellation `CONFIRMED` đủ điều kiện phải tạo `Refund PENDING` bằng 100% cọc `APPROVED` trong cùng transaction với cập nhật Booking và nhả slot. Task review loại Refund implementation khỏi scope, vì vậy implementation chưa READY nếu không cho phép ít nhất việc tạo nghĩa vụ Refund PENDING nguyên tử. Không source/schema/database/demo data nào được thay đổi trong review này.

## Admin Amenity Catalog frontend — 2026-10-09

`/admin/amenities` đã triển khai theo `admin-amenity-catalog-desktop.png`: list/pagination, create, rename, deactivate/reactivate, navigation Admin ba mục, strict response validation và shared `AccessibleModal`; không có hard delete, search hoặc status filter. Frontend targeted 15/15 và full regression 265/265 PASS; lint/build PASS. Backend unit 57/57 và Facility Presentation PostgreSQL 12/12 PASS, gồm rename/duplicate/concurrent name, ordering, inactive retention và Owner catalog/assignment; fixture cleanup PASS. Không đổi schema/migration, không seed hoặc mutate demo data.

## Owner Request frontend — 2026-10-09

Năm PNG Customer/Admin Owner Request đã được triển khai tại `/owner-request`, `/admin/owner-requests` và `/admin/owner-requests/:request_id`. Customer có create/current/history, xử lý PENDING/REJECTED/APPROVED và đăng nhập lại sau khi session bị revoke; Admin có list/filter/pagination/detail, approve/reject, modal accessible, 409 refetch và response validation fail-closed. Home CTA đã dẫn tới route thật. Kiểm chứng: targeted frontend **14/14 PASS**, full frontend **250/250 PASS**, backend unit **57/57 PASS**, Owner Request PostgreSQL **10/10 PASS** và fixture cleanup PASS; lint/build PASS. Không đổi schema/migration, không seed hoặc mutate demo data.
## Owner Cancellation Policy Frontend — 2026-10-09

Owner đã có route `/owner/facilities/:facility_id/cancellation-policy` theo reference approved: đọc/tạo/cập nhật cutoff integer 0..168, null hiển thị chưa thiết lập với input rỗng và không có default. Trang dùng Facility context, hub sáu mục, OWNER guard, exact response validator, PENDING read-only và refetch Facility + policy khi PUT gặp 409. Policy chỉ được snapshot cho Booking tạo sau đó; không sửa Booking cũ.

Kiểm chứng: targeted frontend **24/24 PASS**, toàn bộ frontend **236/236 PASS**, backend unit **57/57 PASS**, Booking Configuration PostgreSQL **14/14 PASS** cùng fixture cleanup, lint/build PASS. Không đổi backend/schema/migration, không seed/mutate demo data và không gọi Cloudinary thật. Customer/Owner cancel CONFIRMED, Refund/proof/lifecycle vẫn ngoài scope và chưa hoàn tất.

## Owner Facility Images + Amenities — 2026-10-09

Owner đã có route `/owner/facilities/:facility_id/images-amenities` theo PNG approved: gallery API thật, upload từng ảnh, xóa có xác nhận, replace-all reorder, ảnh đầu là cover và giới hạn 10 ảnh. Frontend chỉ kiểm tra sớm JPEG/PNG/WebP và 5.000.000 byte; backend kiểm tra MIME + magic bytes, Sharp decode toàn bộ ảnh và giới hạn 25.000.000 pixel. Response validator từ chối `image_path`/public_id và shape sai.

Amenity dùng catalog backend, Owner chỉ assign/unassign và PUT replace-all. Assignment inactive hiện có vẫn được hiển thị và không bị tự mất; Owner phải chủ động bỏ chọn trước khi lưu tập ACTIVE mới. Facility PENDING chỉ đọc, các state khác theo contract Presentation. Navigation sáu khu vực Facility được dùng chung; Chính sách hủy đã được nối route ở phase sau.

Kiểm chứng: backend unit **57/57 PASS**, frontend **212/212 PASS**, Presentation PostgreSQL **12/12 PASS**, fixture cleanup PASS, lint/build PASS và health HTTP 200. Không đổi schema/migration, không seed/mutate demo data và automated tests không gọi Cloudinary thật.

## Baseline hiện tại — 2026-10-08

Đây là bảng trạng thái chuẩn hiện tại; các mục phase bên dưới được giữ làm bằng chứng lịch sử và không thay thế bảng này.

| Nhóm | Phạm vi | Trạng thái | Ghi chú |
| --- | --- | --- | --- |
| Auth | Email/password, session, forgot/reset/change; frontend login/register/forgot/reset | IMPLEMENTED | Google Login và frontend Change Password còn DEFERRED |
| Public Facility | Home, list, detail, q/district và gallery delivery | IMPLEMENTED | Filter giá/rating/amenity còn DEFERRED |
| Availability | API và UI một Court/một ngày, sáu trạng thái slot | IMPLEMENTED | Multi-court/multi-day và realtime DEFERRED |
| Customer Booking | Create/list/detail, hold 5 phút, lazy expiry và frontend | IMPLEMENTED | Cancel PENDING_PAYMENT backend DONE; CONFIRMED cancel/complete còn PARTIAL |
| Payment Proof | Customer upload/read private proof và Owner review confirm/reject | IMPLEMENTED | Customer UI `PENDING_PAYMENT`/`PENDING_CONFIRMATION` và Owner QR management DONE; Refund và notification DEFERRED |
| Owner Facility | Core CRUD, submit, approval-state UI | IMPLEMENTED | Image/amenity management frontend đã triển khai |
| Owner Court | Create/list/detail/update và frontend | IMPLEMENTED | Delete và CourtBlock CRUD DEFERRED |
| PriceRule | Owner GET/replace và frontend | IMPLEMENTED | Pricing nâng cao DEFERRED |
| Bank Account | Owner GET/PUT, private QR upload/delete, frontend và Booking snapshot delivery | IMPLEMENTED | Orphan reconciliation tự động DEFERRED |
| Cancellation Policy | Owner GET/PUT và frontend cấu hình | IMPLEMENTED | Cancel CONFIRMED và Refund processing đã triển khai |
| Facility Presentation | Backend image/amenity, public display; Owner image/amenity và Admin Amenity catalog frontend | IMPLEMENTED | Automated orphan reconciliation còn DEFERRED |
| Owner Request | Customer/Admin backend và frontend create/history/review | IMPLEMENTED | 5 UI references đã triển khai; session revoke, ownership/capability, approve/reject và concurrency đã kiểm chứng |
| Refund | Owner proof + Customer confirmation trong Booking Detail | IMPLEMENTED | `PENDING → PROOF_SUBMITTED → REFUNDED`; không có Refund Center/list/dispute |
| Favorite/Review | Schema/spec | TODO | Chưa có backend/frontend |
| Notification | Schema/spec | DEFERRED | Chưa có backend/frontend |
| Content Page | Schema/spec | TODO | Chưa có backend/frontend |
| Admin User Management | Phạm vi dự kiến | TODO | Chưa có backend/frontend |
| Statistics/Dashboard | Phạm vi dự kiến | DEFERRED | Chưa có API/UI thống kê hoàn chỉnh |

## Owner Bank Account + QR — 2026-10-09

Owner Bank Account theo Facility đã hoàn tất GET/PUT safe DTO, QR authenticated upload/replace/delete, signed URL TTL 300 giây và frontend theo reference approved. Booking Detail delivery dùng QR snapshot, không expose raw path; replace/delete giữ object cũ để bảo toàn booking lịch sử. Kiểm chứng: backend local 56/56, Booking Configuration PostgreSQL 14/14, Booking PostgreSQL 17/17, Payment PostgreSQL 16/16, frontend 203/203, lint/build PASS, health 200 và toàn bộ fixture cleanup PASS. Không đổi schema/migration, không seed/demo mutation và không gọi Cloudinary thật trong test. Orphan reconciliation tự động tiếp tục deferred.

## Customer Payment Phase A — 2026-10-08

HISTORICAL/SUPERSEDED — Phase A đã bổ sung Customer cancel PENDING_PAYMENT và GET proof riêng tư. Khi đó Owner QR upload/delete và QR delivery còn deferred; hiện các chức năng QR này đã triển khai và Booking vẫn dùng snapshot, không expose raw path hoặc đọc BankAccount live. Customer submitted UI theo reference approved thuộc Phase B/C.

Kiểm chứng cuối: backend local **54/54 PASS**; Booking PostgreSQL **17/17 PASS**; Payment PostgreSQL **16/16 PASS**; frontend **186/186 PASS**; lint/build PASS; health HTTP 200. Cả hai PostgreSQL fixture cleanup PASS, không gọi Cloudinary thật, không seed hoặc mutate demo data. Schema/migration không đổi.

## Customer Payment Phase B — 2026-10-08

Màn hình `/bookings/:booking_id/payment` cho `PENDING_PAYMENT` đã hoàn thiện theo PNG approved: tóm tắt booking/slot/tiền snapshot, countdown theo server time, thông tin chuyển khoản và copy, QR URL an toàn khi backend cung cấp hoặc fallback khi `null`, preview JPEG/PNG trong bộ nhớ, thay/xóa ảnh và hủy booking qua modal xác nhận. Submit proof và cancel đều refetch trạng thái server trước khi điều hướng; background focus refresh giữ snapshot đã xác minh, còn lỗi/unknown result và trạng thái terminal vẫn khóa mutation. Không tự tính total, không tự gán `EXPIRED`, không gọi Cloudinary trực tiếp từ frontend.

Kiểm chứng: frontend **190/190 PASS**, Payment PostgreSQL **16/16 PASS**, Booking PostgreSQL **17/17 PASS**, backend unit **54/54 PASS**, lint/build PASS và health HTTP 200. Integration fixture cleanup PASS; không gọi Cloudinary/email thật, không mutation demo data, không đổi schema/migration. UI `PENDING_CONFIRMATION` chuyên biệt theo reference approved tiếp tục ở Phase C.

## Customer Payment Phase C — 2026-10-08

Customer Payment lifecycle frontend đã hoàn thiện: `PENDING_CONFIRMATION` tải lại proof riêng tư sau reload, hiển thị ảnh/`submitted_at`/snapshot tiền và ngân hàng, không countdown/cancel/resubmit. URL proof hết hạn hoặc lỗi ảnh được làm mới có giới hạn và có nút tải lại thủ công; validator từ chối field storage lạ, URL không HTTPS, metadata sai và booking ID không khớp. Focus refetch Booking chuyển presentation sang `CONFIRMED` hoặc `REJECTED` theo state server. `CONFIRMED`, `REJECTED`, `EXPIRED`, `CANCELLED` có màn hình read-only riêng và không có payment mutation.

Kiểm chứng cuối: frontend **197/197 PASS**, Payment PostgreSQL **16/16 PASS**, Booking PostgreSQL **17/17 PASS**, lint/build PASS và health HTTP 200. Fixture cleanup PASS; không gọi Cloudinary thật, không seed/mutate demo data, không đổi schema/migration. Owner QR management, Refund và notification vẫn nằm ngoài scope.

## Customer Payment Lifecycle E2E — VERIFIED 2026-10-08

Audit HTTP/PostgreSQL xác minh đầy đủ create Booking `PENDING_PAYMENT`, hold 5 phút, snapshot tiền 30/70 và ngân hàng, PaymentProof `SUBMITTED`, Customer/Owner private proof read, Owner confirm/reject, Customer cancel, lazy expiry, duplicate proof, proof-vs-expiry và confirm-vs-reject concurrency. Các invariant slot lock, BookingSlot history, reviewer/rejection metadata, ownership, capability, Origin/CSRF và raw storage whitelist đều PASS.

Kết quả: Booking unit **5/5**, Payment/Owner Payment unit **9/9**, Booking PostgreSQL **17/17**, Payment lifecycle PostgreSQL **16/16**, backend full unit **54/54**, frontend Booking **33/33**, frontend Payment **41/41**, frontend full **197/197**, lint/build và health HTTP 200 đều PASS. Fixture cleanup PASS; số liệu database trước/sau giữ nguyên **3 Booking / 2 PaymentProof / 4 CourtSlotLock**, fingerprint demo giữ nguyên `55712ffb3aa7d546`, không còn User fixture `booking-*`/`payment-*`. Không dùng Cloudinary thật, không seed và không mutate dữ liệu demo hiện có.

## Stabilization Phase 4 — 2026-10-07

STAB-10 đã đóng đúng bản chất: Owner Booking là **fixed fan-out**, không phải N+1 vì query count không tăng theo số booking. Query budget sau tối ưu: Public List **6 → 2**, Detail **8 → 2**, Availability **11 → 3**, Owner Booking **12 → 6**. Network RTT, cold connection và deployment-region tiếp tục DEFERRED đến khi deploy thật.

STAB-11 gom nhãn Booking/Facility theo domain và đưa validation create Booking vào response validator dùng chung. Formatter, AccessibleModal, OwnerLayout/API client/error helpers đã dùng chung; các status khác domain không bị gom vào một map lớn. STAB-12 bổ sung baseline hiện tại và đánh dấu rõ các ghi nhận phase cũ là lịch sử.

Kiểm chứng Phase 4: frontend **184/184 PASS**, backend unit **53/53 PASS**, PostgreSQL integration **128/128 PASS**, performance query-count **3/3 PASS**, lint/build PASS và health HTTP 200. Mọi integration fixture đã cleanup; không đổi schema/migration/seed/API/business rule và không gọi dịch vụ ngoài thật.

## Candidate phase tiếp theo — historical snapshot, superseded

Bảng dưới đây là snapshot trước các phase Owner ngày 2026-10-09; không dùng thay trạng thái chuẩn ở đầu tài liệu.

| Candidate | Backend | Schema | Frontend | UI reference | Demo value | Risk / dependency |
| --- | --- | --- | --- | --- | --- | --- |
| Owner Bank Account | READY | READY | MISSING | MISSING | Cao: bỏ phụ thuộc seed cho Booking | Thấp; phụ thuộc Owner Facility |
| Cancellation Policy | READY | READY | MISSING | MISSING | Trung bình | Thấp; cancel workflow tổng thể còn partial |
| Facility Images | READY, Cloudinary verified | READY | MISSING | MISSING | Cao: cải thiện Home/Detail | Trung bình; external storage/cleanup |
| Facility Amenities | READY | READY | MISSING | MISSING | Trung bình | Thấp; cần Owner assignment và Admin catalog UI |
| Refund | MISSING | READY | MISSING | MISSING | Cao cho vòng đời sau hủy | Cao; phụ thuộc cancellation và proof riêng |
| Owner Request | READY | READY | MISSING | MISSING | Cao: hoàn chỉnh onboarding Owner | Trung bình; cần Customer và Admin UI |
| Favorite/Review | MISSING | READY | MISSING | MISSING | Trung bình | Trung bình; Review phụ thuộc COMPLETED |
| Notification | MISSING | READY | MISSING | MISSING | Trung bình | Trung bình; phụ thuộc event producers |
| Admin User Management | MISSING | READY một phần | MISSING | MISSING | Trung bình | Trung bình; cần chốt contract/permission |

Ưu tiên đề xuất: **(1) Owner Bank Account Management**, **(2) Owner Request UI/Admin Approval**, **(3) Facility Image Management**. Ba phase này có backend/schema sẵn hoặc gần sẵn, giá trị demo trực tiếp và ít phụ thuộc hơn Refund.

## Performance Optimization Phase 1 — 2026-10-07

Đã giảm database round-trip cho bốn read path mà không đổi API/business rule/schema: Public Facility List **6 → 2**, Public Facility Detail **8 → 2**, Availability **11 → 3**, Owner Booking List **12 → 6** theo Prisma query-event methodology hiện tại. Owner Booking được mô tả đúng là fixed relation fan-out trước tối ưu, không phải N+1 tuyến tính.

Warm median local sau tối ưu: Public List page_size 4 **1173.2 ms**, page_size 20 **1173.4 ms**, Detail **1172.0 ms**, Availability **1409.8 ms**, Owner Booking service **2440.5 ms**. RTT tới Supabase vẫn khoảng 300 ms/statement; deployment gần region database là bước kiểm chứng tiếp theo. Không cache frontend, index, migration, pool/provider/region hoặc state machine mới.

Kiểm chứng: backend unit **53/53 PASS**; PostgreSQL Public/Availability/Payment-Owner regression **30/30 PASS** và fixture cleanup PASS; frontend **184/184 PASS**, lint/build PASS, health HTTP 200. Query-count tests không phụ thuộc timing. Không gọi Cloudinary/Resend thật.

## Stabilization Phase 3 — 2026-10-07

STAB-04 và STAB-08 đã hoàn tất cho phạm vi UI hiện có. Modal Owner payment, Owner submit Facility và Admin approve/reject/suspend/activate dùng semantics/focus/keyboard/backdrop thống nhất và khóa đóng khi mutation đang chạy. Bảng Owner Booking/Facility/Court và Admin Facility giữ bảng desktop, chuyển thành card có nhãn ở tablet/mobile; header, sidebar, form và PriceRule được chỉnh để xử lý nội dung dài và màn hình hẹp mà không đổi nghiệp vụ. Dòng deferred ở đoạn lịch sử này đã được thay thế bởi baseline Phase 4 phía trên.

Kiểm chứng lịch sử Phase 3: frontend **184/184 PASS**, backend unit regression **50/50 PASS**, lint và production build PASS. Browser Edge headless đã render các trang public thật ở 1440×900, 1280×720, 1024×768, 768×1024 và 390×844; các route được bảo vệ được kiểm chứng bằng behavior/structure tests, không tạo session hay mutation Supabase chỉ để chụp ảnh. Không đổi backend, schema, migration, seed hoặc dữ liệu.

## Stabilization Phase 2 — 2026-10-07

Đã sửa STAB-05/06/07. Frontend API boundary hỗ trợ validator nhỏ theo từng loại response; list/detail và các nested collection mà page dùng được kiểm tra, response HTTP thành công sai shape được chuẩn hóa thành `INVALID_RESPONSE` và đi vào error/retry state thay vì crash hoặc empty giả. Guest vào protected route được đưa tới Login và quay lại internal destination sau đăng nhập; external/unsafe destination bị loại về `/`, capability guard vẫn chạy ở route đích và Router state không được lưu bền.

`/login`, `/register`, `/forgot-password` chờ session bootstrap và redirect authenticated User về `/` khi không có safe return destination. `/reset-password` tiếp tục truy cập độc lập bằng token fragment kể cả khi đang authenticated, không đổi reset contract. Kiểm chứng: frontend **180/180 PASS**, lint PASS không cảnh báo, production build PASS; backend unit regression **50/50 PASS**, health HTTP 200. Không database/schema/migration/seed mutation.

## Stabilization Phase 1 — 2026-10-07

Đã sửa các vấn đề STAB-01/02/03/09: Owner vẫn đọc Court và PriceRule khi Facility `PENDING` nhưng mọi đường tạo/sửa/đổi trạng thái/lưu giá đều bị khóa; Home không còn mô tả Booking, Payment hoặc Owner management đã triển khai là chức năng tương lai; Owner/Admin Facility Detail hiển thị `suspension_reason` khi `SUSPENDED`; Facility form kiểm tra trim, registry district, phone, độ dài và mốc giờ 30 phút trước request theo backend contract. Backend vẫn là authority và business rule không đổi.

Kiểm chứng: frontend **160/160 PASS**, lint PASS, production build PASS; backend unit regression **50/50 PASS**. Automated tests dùng HTTP mock, không mutation database, seed hay dịch vụ ngoài thật. STAB-04/05/06/07/08/10/11/12 tiếp tục deferred.

## Facility Approval Frontend Phase 1 — 2026-10-07

Owner Facility Detail đã hỗ trợ xác nhận submit `DRAFT → PENDING`, hiển thị trạng thái chờ duyệt và lý do `REJECTED`; PATCH `REJECTED → DRAFT` tiếp tục theo backend hiện có. Admin có `/admin/facilities` và `/admin/facilities/:facility_id`, guard ADMIN, filter/pagination, detail core + Owner tối thiểu và các action approve/reject/suspend/activate đúng state machine. Mutation dùng API client cookie/CSRF, confirmation/reason modal, chống submit lặp và refetch khi 409/kết quả không chắc chắn.

Header dùng session capabilities và hiển thị **Quản lý cơ sở** tới `/admin/facilities` cho `ADMIN`; active ở list/detail. Entry không xuất hiện cho Customer/Owner thiếu capability ADMIN và không thay navigation hiện có của họ.

Sáu Admin Facility PNG đã APPROVED. Frontend tests/lint/build và backend local regression đã PASS bằng HTTP mock/local unit; không mutation Supabase, không đổi schema/migration và không gọi dịch vụ ngoài thật.

## Owner Facility + Court Frontend Phase 1 — 2026-10-07

Đã triển khai 8 route Owner cho Facility list/detail/create/edit, Court list/create/edit và PriceRule Facility replace-all. Frontend dùng Owner capability guard, Auth Context/API client cookie-CSRF hiện có, body allowlist và status rules từ backend; không giả quyền sửa Facility ACTIVE/PENDING/SUSPENDED, không hard delete/chuyển Court. PriceRule hỗ trợ tối đa 48 dòng, bước 30 phút, trong giờ Facility, không qua đêm/overlap, giá nguyên dương và `rules: []`.

Owner layout được tách dùng chung với Booking/Payment; sidebar nối Facility và Booking thật, mục Quản lý sân dẫn về danh sách Facility để chọn cơ sở. Facility List lấy số Court thật qua meta của Court API, không hard-code aggregate. Sáu PNG Owner Facility/Court/Pricing đã APPROVED. Frontend 138/138 PASS, lint PASS, production build PASS; automated tests dùng HTTP mock, không mutation Supabase/demo data. Không backend/schema/migration thay đổi.

## Pre-demo UI cleanup và regression — 2026-10-07

Customer Booking Detail đã bỏ thông báo Payment deferred cũ và hiển thị thông điệp tiếng Việt phù hợp cho `PENDING_CONFIRMATION`, `CONFIRMED`, `REJECTED`, `CANCELLED`, `EXPIRED`, `COMPLETED`; CTA thanh toán chỉ còn ở `PENDING_PAYMENT`. Owner Booking/Payment không hiển thị raw enum cho Booking/PaymentProof. Header giữ Customer capability của Approved Owner và bổ sung lối vào `/owner/bookings`.

Kiểm chứng cuối: frontend 125/125 PASS, lint PASS, production build PASS; backend local 50/50, Auth PostgreSQL 13/13, Booking PostgreSQL 15/15, Owner/Payment PostgreSQL 16/16 PASS; fixture cleanup PASS và health HTTP 200. Test frontend dùng HTTP mock, test backend dùng fixture riêng; không gọi Cloudinary/Resend thật và không mutation Booking #112. Không đổi schema hoặc migration.

## Owner Booking + Payment Review Backend Phase 1 — implemented, 2026-10-06

Đã triển khai GET `/owner/bookings`, GET `/owner/bookings/:booking_id`, GET `/owner/payments/:proof_id`, POST confirm và POST reject theo `specs/OWNER_BOOKING_PAYMENT_SPEC.md`. Ownership qua Facility, private authenticated URL TTL 300 giây, Confirm giữ locks, Reject reason 1–500 và nhả locks. PostgreSQL Owner/Payment 16/16, Booking 15/15, Auth 13/13, local backend 50/50, health 200; fixture cleanup PASS, không Cloudinary thật. Booking #112 chỉ đọc và giữ nguyên PENDING_CONFIRMATION/proof SUBMITTED/2 slots/2 locks. Schema/migration không đổi.

Frontend Phase 1 đã triển khai `/owner/bookings` và `/owner/bookings/:booking_id` theo 2 PNG approved: list/filter/pagination, private proof URL expiry/reload, Confirm hai bước, Reject modal reason, 409/unknown-result recovery và OWNER guard. Frontend 119/119 PASS gồm toàn bộ Auth/Home/Facility/Customer Booking/Customer Payment regression; lint và production build PASS. Automated tests chỉ mock HTTP, không Supabase/Cloudinary thật và không mutation Booking #112.

## Payment Backend Phase 1 — 2026-10-06

Đã triển khai `POST /api/v1/payments/bookings/:booking_id/proof`: multipart một ảnh JPEG/PNG tĩnh, tối đa 5,000,000 bytes và 25,000,000 pixels; kiểm tra MIME/signature và giải mã thật bằng Sharp. Cloudinary adapter riêng dùng `resource_type=image`, `type=authenticated`, identifier UUID và không trả URL/path. Transaction khóa theo Booking spec, dùng DB clock, tạo PaymentProof SUBMITTED và chuyển Booking sang PENDING_CONFIRMATION nguyên tử; giữ slot locks. Expiry race commit EXPIRED + nhả locks trước 409; UNIQUE và khóa Booking chống proof trùng. Cleanup kiểm tra DB reference dưới cùng lock order trước destroy khi kết quả commit chưa rõ.

Kiểm chứng: local backend 47/47 PASS; Payment PostgreSQL 12/12 PASS, health200, fixture/storage giả cleanup PASS. Regression PostgreSQL: Auth13, Password10, Owner Request10, Facility13, Court12, Booking Configuration13, Presentation12, Public Facility8, Availability6, Booking15 đều PASS và cleanup PASS. Một lượt Booking Configuration mất kết nối P1001; kết nối TLS/auth/SELECT1 phục hồi, fixture lượt lỗi được xác định và dọn an toàn, sau đó suite PASS13/13. Không gọi Cloudinary/Resend thật; private adapter được kiểm tra bằng SDK fake. Không schema/migration/.env/CA/TLS thay đổi. Payment frontend, GET proof, Owner review, QR, Refund, Notification và cleanup scheduler vẫn TODO.

## Booking Frontend Phase 1 — 2026-10-05

| Module | Feature | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Frontend / Booking | Selection → Confirmation → POST create | P1 | DONE | React memory, giá dự kiến chính xác, CSRF, không retry POST chưa xác định |
| Frontend / Booking | `/bookings` và `/bookings/:id` | P1 | DONE | Snapshot DTO, ownership/error, pagination, đủ7 status |
| Frontend / Booking | Countdown PENDING_PAYMENT | P1 | DONE | Server time + elapsed monotonic; zero/focus GET, không local EXPIRED |

Spec: [BOOKING_FRONTEND_SPEC.md](specs/BOOKING_FRONTEND_SPEC.md). Handoff Detail đã bật; các ghi nhận CTA disabled/Booking frontend deferred của phase trước bên dưới là lịch sử. Guest đăng nhập rồi chọn lại, không sửa Auth redirect. Confirmation `/facilities/:facility_id/booking-confirm` thiếu memory có lối chọn lại; không browser storage/history-state persistence. Chặn submit lặp cả khi quay lại lúc POST đang chạy, unknown result dẫn lịch cá nhân. Chỉ sau người dùng kiểm tra lịch và chủ động chọn lại mới bỏ trạng thái unknown.

Kiểm chứng cuối: `npm test -- --reporter=dot` **80/80 PASS**: Booking27, Auth20, Home9, Facility List10, Detail/Availability14. Bao phủ timeout API client thật20s bằng fake timer, whitelist/credentials/CSRF, create201/401/403/409/422/network/500, memory mất/giữ/recheck, pagination, snapshot, ownership404, server countdown/reload/focus/zero/sync error/no-refetch-loop và không storage. Assertion CTA disabled cũ đổi theo quyết định handoff mới, giữ các assertion min/max/liên tiếp/reset/không mutation khi chỉ chọn. `npm run lint` không cảnh báo; `npm run build` PASS.

Edge headless: cả4 màn hình ở1440/800/390px không horizontal overflow, detail/confirm2 cột desktop →1 cột tablet/mobile; screenshot desktop/mobile đã quan sát. Browser/automated tests dùng HTTP fixture cô lập; **chưa E2E Supabase thật**, không tạo booking/test data DB, không email/Cloudinary call. Runtime vẫn gọi API thật. Browser test cấp VITE_API_BASE_URL tạm trong process; môi trường chạy thực tế cần cấu hình biến này, không sửa `.env`. Không package/backend/schema/migration/CA/TLS thay đổi. Ghi nhận Payment frontend chưa triển khai tại thời điểm Booking Phase 1 là lịch sử; Refund/Owner confirm/cancel frontend vẫn chưa triển khai.

## Home Frontend Phase 1 — 2026-10-05

| Module | Feature | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Frontend / Home | `/`: hero/search/list/areas/static/Owner CTA | P1 | DONE | GET Facility thật; district navigation; không Booking/Owner Request mutation |

Home thay scaffold, dùng PublicLayout/Auth Context/API client và district generated hiện có. FacilityCard được tách dùng chung List/Home; Home4/2/1 cột, List vẫn3/2/1. NavLink active theo route. GET /facilities?page=1&page_size=4, loading/error/empty riêng; không ranking/price/rating/count/availability giả. Ngày/giờ disabled có giải thích; card đến Detail, khu vực đến List. CTA Owner xử lý guest/Customer/Owner/Admin/loading/error an toàn; Booking/Payment chỉ mô tả quy trình dự kiến.

Kiểm chứng: frontend53/53 PASS (Home9 + Auth20 + List10 + Detail/Availability14), lint không cảnh báo, production build PASS. Assertion Auth đếm request được scope về /auth/ vì Home nay có thêm GET Facility, giữ nguyên kiểm tra CSRF/204. Edge headless1440/800/390px: grid4/2/1, không overflow ngang; đã quan sát screenshot desktop/mobile. HTTP/browser tests dùng fixture cô lập, runtime không mock/fake data; chưa kiểm chứng end-to-end Supabase thật trong task này. Không database write, backend/schema/migration/.env/CA/TLS/package mới. Booking frontend vẫn deferred.

## Facility Detail + Availability frontend — 2026-10-05

| Module | Feature | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Frontend / Public Facility | Detail `/facilities/:facility_id` | P1 | DONE | Public DTO, gallery/amenities/Courts/giá/policy; link từ List đã bật |
| Frontend / Availability | Chọn Court/ngày, đọc lịch và chọn slot | P1 | DONE | 1–6 AVAILABLE liên tiếp; selection memory; CTA Booking disabled |

Đã triển khai GET Detail/Availability bằng API client hiện có, runtime không mock. Tách PublicLayout Header/Footer dùng chung với List và Auth Context cũ. Court mặc định id số tăng dần; date mặc định từ meta.server_time theo Asia/Ho_Chi_Minh. Đổi Court/ngày reset selection, bỏ response cũ. Đủ6states, giá decimal hiển thị bằng chuỗi không làm tròn hoặc tính total quote. Loading/error/404/409/422/network/empty riêng. Không POST Booking, không route Booking giả.

Kiểm chứng: frontend44/44 PASS gồm14 Detail/Availability,20 Auth và10 Facility List; lint không cảnh báo, production build PASS. Test List thay assertion CTA disabled bằng link tới Detail thật do dependency đã triển khai, không làm yếu kiểm tra DTO/Auth. Browser Edge headless1440/800/390px không overflow ngang, slot wrap; đã quan sát screenshot desktop/mobile. Browser/test HTTP dùng fixture cô lập, không ghi database hoặc đưa fake data vào runtime. Chưa xác minh live end-to-end Supabase trong task này. Không package mới/backend/schema/migration/.env/CA/TLS thay đổi, không email hoặc Cloudinary API. Home/Booking UI vẫn chưa triển khai.

## Facility List frontend — 2026-10-05

| Module | Feature | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Frontend / Public Facility | `/facilities`: list, q, district, pagination, URL state | P1 | DONE | Detail/Home/Availability/Booking frontend đã triển khai ở phase sau |

Runtime dùng API client hiện có, không fixture/mock; Auth Context dùng chung. Registry94 được generate từ backend canonical trước dev/test/build, không sửa backend. Card whitelist, cover fallback, amenities thật; Detail disabled, không route giả. Loading/error/empty tách biệt, abort và bỏ response cũ; pagination theo meta. Bộ lọc áp dụng khi submit Tìm kiếm, reset page1; URL phục hồi khi reload/Back/Forward.

Kiểm chứng: frontend tests30/30 PASS (10 Facility List + 20 Auth), lint PASS không cảnh báo, production build PASS. Tests HTTP transport giả chỉ trong test, bao phủ render/search/district/clear/URL/pagination/Back-Forward/error/empty/cover/amenities/stale-response/Auth/logout/CSRF và registry canonical. Edge headless kiểm tra1440/800/390px: grid3/2/1 cột, không tràn ngang; screenshots được quan sát desktop/mobile. Browser dùng response fixture cô lập để kiểm tra visual; chưa ghi nhận phiên end-to-end với dữ liệu Supabase thật trong task này. Không database write/test fixture DB, không email/Cloudinary API. Không package mới, backend/schema/migration/.env/CA/TLS không đổi.

Bảng theo dõi **feature ứng dụng**, không phải tiến độ viết tài liệu. Auth giai đoạn 1 đã triển khai và kiểm thử; các feature khác theo bảng. Status hợp lệ: TODO / IN_PROGRESS / DONE / BLOCKED. Không tự chuyển DONE chỉ vì có spec.

P1/P2/P3 theo PROJECT_OVERVIEW. Cập nhật 2026-09-19: ưu tiên cancellation và refund P1 để hoàn tất vòng đời cọc 30% trong MVP; chỉ là kế hoạch, chưa triển khai. Với các chức năng bổ trợ chưa được prompt xếp riêng, priority dưới đây là đề xuất lập kế hoạch và được ghi trong Notes. TODO nghiệp vụ vẫn ghi trong Notes; trạng thái ban đầu không chuyển BLOCKED theo yêu cầu.

| Module | Feature | Priority | Status | Notes |
| ------ | ------- | -------- | ------ | ----- |
| auth | Kiểm tra phiên và middleware | P1 | DONE | Session thiếu/hết hạn/revoked bị từ chối |
| auth | Rate limit register/login | P1 | DONE | 5/20/5 mỗi 15 phút; test HTTP và concurrency trong process |
| auth | Đăng ký email/password CUSTOMER | P1 | DONE | Không nhận role từ client |
| auth | Đăng nhập session cookie | P1 | DONE | Hash password, CSRF/Origin |
| auth | Đăng xuất và thu hồi phiên | P1 | DONE | Session server, chưa JWT |
| auth | Customer capabilities + Owner capabilities, Admin riêng | P1 | DONE | Session suy ra OwnerProfile, guard Owner Request đã test; ownership module nghiệp vụ khác vẫn TODO |
| auth | Google-only không thêm mật khẩu cục bộ | P2 | TODO | Không reset/change để tạo password hoặc account-linking |
| ui | Auth F1 routing/API/session/guards | P1 | DONE | React Router/fetch/Context; 20 test, lint/build PASS 2026-10-02 |
| ui | Login/Register frontend | P1 | DONE | Approved PNG; không phone/Google/auto-login Register |
| ui | Forgot/Reset Password frontend | P1 | DONE | Generic202, fragment token trong memory; success cùng route |
| ui | Change Password frontend | P1 | TODO | Owner Request frontend đã hoàn thành |
| auth | Quên mật khẩu và gửi email Resend | P1 | DONE | Resend ACCEPTED; người dùng xác nhận email development đã tới ngày 2026-09-24; token lộ đã invalidated |
| auth | Reset Password | P1 | DONE | Integration DB: token hợp lệ/sai/hết hạn/used/invalidated, revoke phiên và đổi password PASS |
| auth | Đổi mật khẩu | P1 | DONE | Integration DB: đúng/sai mật khẩu, policy, session, Google-only, revoke phiên/token PASS |
| auth | Google Login | P2 | TODO | Google-only tiếp tục Google Login; không account-linking MVP |
| users | Hồ sơ họ tên/email/SĐT/avatar | P1 | TODO | Ưu tiên đề xuất; đổi email chưa chốt |
| users | Yêu cầu trở thành Owner | P1 | DONE | Hồ sơ tài khoản hiện có; REJECTED giữ lịch sử, tạo request mới |
| admin | Duyệt/từ chối Owner request | P1 | DONE | Ưu tiên đề xuất; từ chối có lý do |
| users | Approved Owner giữ Customer + thêm Owner capability | P1 | DONE | Giữ users.role CUSTOMER; OwnerProfile cấp quyền bổ sung |
| users | Một Owner Request PENDING mỗi user | P1 | DONE | partial UNIQUE(user_id) WHERE status = 'PENDING' + transaction khóa User |
| admin | Owner approval không tự tạo/duyệt Facility | P1 | DONE | Owner approval không tạo/duyệt Facility; Facility approval là flow riêng đã kiểm chứng |
| facilities | Owner quản lý nhiều Facility | P1 | DONE | Create/list/detail/PATCH core, ownership và registry runtime 94 đơn vị đã test |
| facilities | Thông tin/giờ hoạt động/khu vực | P1 | DONE | Core validation + district cấp xã, giờ 30 phút, không qua đêm |
| facilities | Vị trí bản đồ nếu cần | P2 | TODO | Ưu tiên đề xuất; provider/UI còn TODO |
| facilities | Ảnh cơ sở | P1 | DONE | Backend list/upload/delete/reorder, local + PostgreSQL/fake adapter PASS; real Cloudinary upload/delivery/delete verified trong development 2026-09-29 |
| facilities | Tiện ích cơ sở | P1 | DONE | Owner active catalog/read/replace nguyên tử; inactive retention, ownership/state/concurrency PASS |
| facilities | Gửi duyệt/DRAFT/PENDING | P1 | DONE | Core + Owner ACTIVE; concurrent submit PASS |
| admin | Duyệt/từ chối Facility | P1 | DONE | Approve/reject transaction, reason 1–500, concurrent review PASS |
| admin | Đình chỉ/mở lại Facility | P1 | DONE | Suspend/activate đã test; giữ rule không tự hủy booking |
| facilities | Sửa Facility đang hoạt động/chờ duyệt | P1 | TODO | Phase 1 chặn PATCH PENDING/ACTIVE/SUSPENDED; re-approval mở rộng ngoài scope |
| courts | Owner Create Court | P1 | DONE | 201 ACTIVE; parent state/ownership/UNIQUE đã kiểm chứng PostgreSQL |
| courts | Owner List Court theo Facility | P1 | DONE | Pagination 1/20/max100, status filter, created_at DESC/id DESC |
| courts | Owner Court Detail | P1 | DONE | Chỉ 7 field Court; ngoài sở hữu 404 |
| courts | Owner Update Court | P1 | DONE | Name/description/status; không chuyển Facility/đổi approval metadata |
| courts | ACTIVE/INACTIVE | P1 | DONE | Không hủy/xóa booking hoặc slot lock/block; snapshot lịch sử giữ nguyên |
| courts | Ownership/security | P1 | DONE | Session/OWNER, 403 capability, 404 ngoài sở hữu, Origin/CSRF |
| courts | Validation | P1 | DONE | Name trim+NFC 1–100, description max2000, allowlist strict |
| courts | Transaction/concurrency | P1 | DONE | User → Facility → Court; duplicate/create, PATCH, parent transition và User lock PASS |
| courts | Court Delete | P1 | TODO | Deferred; không endpoint/soft-delete, giữ FK RESTRICT |
| courts | Court schedule | P2 | TODO | Deferred cùng CourtBlock/booking |
| courts | Public Court endpoint riêng | P1 | TODO | Deferred; Court ACTIVE cơ bản đã nhúng trong Public Facility detail |
| admin | Court management trực tiếp | P1 | TODO | Deferred; không mở quyền qua API OWNER |
| pricing | Owner GET PriceRule theo Facility | P1 | DONE | Toàn bộ tập, order start_time/end_time/id ASC, không pagination |
| pricing | Owner PUT PriceRule atomic replace | P1 | DONE | Max48, rules:[] cho phép, validate trước ghi, transaction rollback đã test |
| pricing | PriceRule validation/overlap protection | P1 | DONE | HH:mm biên30 phút trong giờ Facility; integer VND; touching hợp lệ, overlap/duplicate bị từ chối |
| pricing | Backend tính tổng tiền | P1 | DONE | BigInt theo đơn vị nửa đồng; tổng round half-up VND, snapshot từng slot; overflow422 trước ghi |
| pricing | Cọc cố định 30% toàn hệ thống | P1 | DONE | Backend round half-up30%, remaining=total-deposit; không Owner cấu hình tỷ lệ; PostgreSQL PASS |
| payments | Hiển thị total/cọc 30%/trả tại sân 70% | P1 | DONE | Frontend Payment dùng Booking snapshot thật; không giao dịch/proof 70% |
| facilities | Owner GET/PUT BankAccount text | P1 | DONE | Singleton safe DTO, trim/ASCII account validation, update giữ QR hiện hành |
| payments | BankAccount QR upload/delete | P1 | DONE | Authenticated storage, PNG normalization, signed URL TTL 300 giây, không expose path |
| payments | Bank snapshot khi tạo Booking | P1 | DONE | Bank text + QR path nullable snapshot nội bộ; DTO trả signed URL/expiry, không expose path |
| search | Tìm theo tên cơ sở/sân | P1 | DONE | Backend Public Phase 1: q trim/NFC, contains case-insensitive Facility hoặc ACTIVE Court; Owner ACTIVE, không duplicate |
| search | Lọc khu vực (phường/xã/đặc khu) | P1 | DONE | Backend Public Phase 1: một district trim/NFC thuộc registry, invalid422 |
| search | Lọc ngày và khoảng thời gian | P1 | TODO | Một Court phải trống toàn khoảng |
| search | Lọc giá/rating/amenity | P1 | TODO | Công thức giá/rating và all/any amenity còn TODO; rating phụ thuộc review P2 |
| search | Sort phổ biến/rating/giá | P1 | TODO | Công thức/tie-break còn TODO; phụ thuộc dữ liệu thực |
| facilities | Public Facility list | P1 | DONE | Guest; Facility ACTIVE + Owner ACTIVE; pagination/id ASC, card whitelist |
| facilities | Public Facility detail | P1 | DONE | Core/gallery/active amenities/Courts/price_rules/policy; không Owner/bank/internal fields hoặc readiness |
| bookings | Availability theo Court/ngày | P1 | DONE | Backend Phase 1: guest, một DB-time snapshot, read-only; local/PostgreSQL/regression PASS 2026-10-01 |
| bookings | Slot 30 phút liên tiếp cùng Court | P1 | DONE | 1–6slot, cùng ngày Asia/Ho_Chi_Minh, start tương lai, tối đa30ngày; local/PostgreSQL PASS |
| bookings | Create booking transaction | P1 | DONE | Snapshot giá/policy/bank; atomic Booking + BookingSlot + CourtSlotLock; rollback đã test |
| bookings | Chống double booking | P1 | DONE | Create writer User IDs ASC → Facility → Court → Booking; PK slot, same-slot/crossed Owner concurrency PASS |
| bookings | Hold 5 phút và expires_at | P1 | DONE | DB time sau khóa; expires_at=created_at+5phút, không gia hạn; PostgreSQL PASS |
| bookings | Lazy expiry | P1 | DONE | Create/detail chuyển EXPIRED và nhả toàn bộ locks, giữ lịch sử; list/Availability read-only; worker deferred |
| bookings | Expiry worker | P1 | TODO | Deferred sau Booking Phase1; Availability bỏ hold hết hiệu lực dù chưa cleanup |
| bookings | State machine hợp lệ | P1 | TODO | Không hủy PENDING_CONFIRMATION; Owner phải Confirm/Reject; Refund riêng |
| bookings | Booking detail/history | P1 | DONE | Chỉ Customer sở hữu; DTO whitelist, list pagination/order/effective status, detail phục hồi snapshot/countdown |
| bookings | Owner quản lý booking | P1 | TODO | Chỉ Facility của mình |
| bookings | Owner ghi nhận COMPLETED | P1 | TODO | Từ CONFIRMED sau end_at, đã dùng sân và xử lý 70% trực tiếp |
| payments | Hướng dẫn chuyển khoản thủ công | P1 | DONE | V1 giữ nội dung `BOOKING <id>`; V2 dùng server-derived `CLDN <id>`; frontend hiển thị bank/QR snapshot và fallback khi QR null; không gateway/bank scraping |
| payments | Upload/gửi payment proof backend | P1 | DONE | POST multipart; private authenticated storage; trước expires_at; PENDING_CONFIRMATION nguyên tử |
| payments | Owner xác nhận cọc | P1 | DONE | Backend: SUBMITTED → APPROVED; booking CONFIRMED, giữ slot locks |
| payments | Owner từ chối kèm lý do | P1 | DONE | Backend + Owner frontend: reason 1–500, Booking REJECTED, nhả slot |
| ui | Owner Booking List + Payment Review | P1 | DONE | Hai route Owner, proof private, confirm/reject modal và recovery |
| payments | Đặt lại sau proof bị từ chối | P1 | TODO | Booking mới; không reopen/resubmit booking cũ |
| courts | CourtBlock khóa/mở lịch | P2 | TODO | Không khóa đè booking đang giữ slot |
| facilities | Owner GET/PUT CancellationPolicy | P1 | DONE | GET null nếu thiếu, upsert200; cutoff_hours integer0..168; không default |
| facilities | Booking Configuration ownership/state/concurrency | P1 | DONE | User → Facility; recheck quyền/state/giờ; PENDING chặn PUT; metadata Facility giữ nguyên |
| facilities | Configuration DELETE riêng/history/versioning | P1 | TODO | Deferred; chỉ rules:[] xóa tập giá qua PUT |
| admin | Configuration management trực tiếp | P1 | TODO | Không cấp quyền qua Owner API |
| facilities | Public PriceRule/Policy trong Facility detail | P1 | DONE | Chỉ đọc cấu hình hiện hành qua detail; không public bank hoặc endpoint config riêng |
| bookings | Customer hủy theo policy | P1 | IN_PROGRESS | PENDING_PAYMENT còn hạn/chưa proof đã DONE backend; PENDING_CONFIRMATION bị chặn; CONFIRMED trước cutoff còn TODO |
| bookings | Owner hủy CONFIRMED | P1 | TODO | Cơ sở mình, reason bắt buộc; hoàn 100% cọc đã xác nhận |
| bookings | Cancellation metadata và transaction nhả slot | P1 | TODO | cancelled_by/reason/at; tạo Refund đủ điều kiện nguyên tử |
| refunds | Record hoàn 100% cọc đã xác nhận | P1 | TODO | Một Refund/Booking; Booking CANCELLED độc lập Refund PENDING |
| refunds | Owner xem danh sách/chi tiết cần hoàn | P1 | TODO | Chỉ cơ sở mình; chuyển tiền ngoài website |
| refunds | Owner upload refund proof | P1 | TODO | PENDING → PROOF_SUBMITTED, ảnh riêng tư tách PaymentProof |
| refunds | Customer xem refund/proof | P1 | TODO | Chỉ booking của mình |
| refunds | Customer xác nhận đã nhận hoàn cọc | P1 | TODO | PROOF_SUBMITTED → REFUNDED, không tự xác nhận |
| refunds | Kiểm tra ownership/state/retry đồng thời | P1 | TODO | UNIQUE booking_id, không tạo hai refund hoặc giữ lại slot |
| ui | UI hủy và refund cho Customer/Owner | P1 | TODO | Badge Booking/Refund riêng, mapping Figma phần mới còn TODO |
| favorites | Lưu/bỏ/danh sách yêu thích | P2 | TODO | CUSTOMER, Facility |
| reviews | Review booking COMPLETED | P2 | TODO | Rating 1–5, comment, UNIQUE booking_id |
| reviews | Ảnh review | P3 | TODO | Giới hạn ảnh còn TODO |
| reviews | Owner xem review cơ sở mình | P2 | TODO | Không thêm reply |
| notifications | Thông báo BOOKING_CREATED | P2 | TODO | Customer |
| notifications | Thông báo PAYMENT_PROOF_SUBMITTED | P2 | TODO | Owner |
| notifications | Thông báo PAYMENT_CONFIRMED/REJECTED | P2 | TODO | Customer |
| notifications | Thông báo BOOKING_CANCELLED/EXPIRED | P2 | TODO | Recipient theo DATABASE |
| notifications | Thông báo OWNER_REQUEST_APPROVED/REJECTED | P2 | TODO | Người gửi request |
| notifications | Thông báo FACILITY_APPROVED/REJECTED | P2 | TODO | Owner |
| notifications | Thông báo NEW_REVIEW | P2 | TODO | Owner |
| notifications | Inbox, read/unread, mark all read | P2 | TODO | Chỉ trong website, không email/SMS |
| customer | Dashboard cá nhân | P1 | TODO | Ưu tiên đề xuất; tổng hợp booking thật |
| owner | Dashboard và danh sách khách liên quan | P1 | TODO | Ưu tiên đề xuất; không lộ khách Owner khác |
| owner | Thống kê đơn giản | P2 | TODO | Chốt chỉ số/công thức |
| owner | Settings/profile/policy | P2 | TODO | Ưu tiên đề xuất; không settings ngoài scope |
| admin | Dashboard | P1 | TODO | Ưu tiên đề xuất; count dữ liệu thật |
| admin | Quản lý Customer/Owner | P1 | TODO | Ưu tiên đề xuất |
| admin | Khóa/mở tài khoản | P1 | TODO | Ưu tiên đề xuất; revoke sessions |
| admin | Xem booking toàn hệ thống | P1 | TODO | Ưu tiên đề xuất; không duyệt payment |
| admin | Quản lý review/ẩn hiện | P2 | TODO | Ưu tiên đề xuất; moderation rules còn TODO |
| admin | Report cơ bản | P2 | TODO | Ưu tiên đề xuất; đối tượng/schema/quy trình còn TODO |
| admin | Advanced reports | P3 | TODO | Không thêm chi tiết ngoài scope khi chưa chốt |
| admin | Quản lý Amenity | P1 | DONE | Backend + frontend list/pagination/create/rename/deactivate/reactivate; validation/quyền/concurrency/strict DTO PASS |
| admin | Nội dung cơ bản | P2 | TODO | Ưu tiên đề xuất; loại nội dung còn TODO |
| admin | Advanced content management | P3 | TODO | Cần đặc tả thêm |
| admin | Thống kê hệ thống đơn giản | P2 | TODO | Chốt chỉ số/công thức |
| admin | Advanced charts | P3 | TODO | Chưa chọn thư viện/chart |
| admin | Settings cá nhân | P2 | TODO | Ưu tiên đề xuất; không tự thêm cấu hình hệ thống |
| ui | Giao diện tiếng Việt theo Figma | P1 | TODO | Cần link/phiên bản Figma |
| ui | Responsive/loading/empty/error/modal/toast | P1 | TODO | Không redesign hoặc dùng dữ liệu giả |
| security | Input/upload validation và auth rate limit | P1 | TODO | Tham số/giới hạn cần chốt trước release |
| security | Backend authorization/ownership | P1 | TODO | Kiểm tra cả list/detail/mutation/file |
| deployment | External image/object storage | P1 | TODO | Provider/retention chưa chọn |
| deployment | HTTPS/domain/SPA/API/PostgreSQL thực tế | P1 | TODO | PostgreSQL trên Supabase qua Prisma; frontend/backend hosting, version/env còn TODO |
| deployment | Expiry sau restart, backup/log/restore | P1 | TODO | Ưu tiên đề xuất; chính sách vận hành còn TODO |

Kiểm chứng 2026-09-23: local 4/4 và integration 13/13 PASS, fixture rollback và không còn User/session test. Health HTTP 200. Đây là kết quả Phase 1; trạng thái Phase 2 theo các dòng cập nhật. Google Login vẫn TODO; Owner Request được cập nhật theo kết quả 2026-09-25 bên dưới.

Phase 2: adapter Resend thật, test dùng fake không gửi email ra ngoài. Schema/migration giữ nguyên; User/token/session fixture rollback. Ghi chú lịch sử ngày 2026-09-23: khi đó Forgot chưa DONE vì thiếu cấu hình email thật. Xem xác nhận delivery ngày 2026-09-24 bên dưới.

Kiểm chứng Phase 2 ngày 2026-09-23: npm test 8/8 PASS; npm run test:password:db 10/10 PASS (gồm suite cha); regression npm run test:auth:db 13/13 PASS. Sau rollback xác minh User/token/session fixture không tồn tại. Tại ngày 2026-09-23 chưa gửi email thật; đã xác nhận delivery development ngày 2026-09-24. Chưa kiểm thử tranh chấp reset trên hai kết nối độc lập.

## Xác nhận email development — 2026-09-24

Register test trả 201, CUSTOMER local ACTIVE. Một request Forgot trả 202, tạo một reset token chỉ lưu hash với TTL 15 phút; gọi Resend đúng một lần và nhận ACCEPTED. Người dùng xác nhận email đã tới, có tiêu đề/nội dung đặt lại mật khẩu, single-use, TTL 15 phút và link /reset-password#token=... đúng cấu trúc.

HISTORICAL/SUPERSEDED — Token test bị lộ trong ảnh đã được invalidated, không dùng để Reset Password; giữ User test theo yêu cầu. Ở thời điểm ghi nhận này frontend `/reset-password` chưa triển khai; frontend Auth F1 sau đó đã hoàn tất route này. Forgot/Reset/Change backend development không xác nhận domain/delivery production hoặc Google Login.

Regression 2026-09-24: local 8/8 PASS; Phase 1 integration 13/13 PASS; Phase 2 integration 10/10 PASS (gồm suite cha); health HTTP 200. So sánh fingerprint/số dòng toàn bộ 24 bảng trước/sau regression: không thay đổi dữ liệu lưu bền; fixture đã rollback. Chỉ thao tác vô hiệu token test trước regression được ghi nhận; User test vẫn ACTIVE, token chưa sử dụng. Catalog schema và file .env/CA/TLS/schema/migration giữ nguyên. Sequence có thể tăng do fixture, không reset sequence. AUTH PHASE 2 BACKEND READY: YES.

## Owner Request backend Phase 1 — 2026-09-25

Customer create/list/detail và Admin list/detail/approve/reject đã triển khai, gồm validation, pagination, snapshot và permission/Origin/CSRF. Internal Admin bootstrap dùng CLI chủ động, password ẩn và cấu hình Argon2id dùng chung; từ chối email trùng, không promote Customer.

Kiểm chứng: npm test 11/11 PASS; test:owner:db 10/10 PASS (9 ca + suite cha), hai create đồng thời chỉ một PENDING, hai Admin approve/reject đồng thời chỉ một quyết định commit. Approve tạo profile/revoke session/giữ CUSTOMER; login lại có CUSTOMER + OWNER. Reject giữ lịch sử và cho tạo request mới. Health HTTP 200. Fixture riêng đã cleanup, không còn user/session/profile/request của test này; giữ User test email thật trước đó. Không gửi notification/email/SMS.

Regression Auth Phase 1 13/13 PASS; Phase 2 10/10 PASS (gồm suite cha), fixture rollback, email fake adapter. Schema và migration không đổi. Google Login, frontend và notification delivery tiếp tục TODO. OWNER REQUEST PHASE 1 BACKEND READY: YES.

Đối chiếu sau toàn bộ test với baseline database đã ghi nhận: số dòng/fingerprint dữ liệu của 24 bảng và catalog schema không đổi. .env, CA, cấu hình database/TLS, schema.prisma và initial migration giữ nguyên. Không còn fixture mới; User email test cũ được giữ nguyên.


## Facility Core backend Phase 1 — hoàn tất 2026-09-26

Registry runtime đầy đủ 94 đơn vị hành chính cấp xã (23 phường, 70 xã, 1 đặc khu) theo Nghị quyết 1659/NQ-UBTVQH15 ngày 16/06/2025. district là tên field legacy, biểu diễn phường/xã/đặc khu, không phải quận/huyện. Cấu hình immutable, không DB/network lookup. Nguồn tại FACILITY_SPEC. Blocker thiếu registry của lượt 2026-09-25 đã được giải quyết; không dùng TEST_ONLY_AREA cho happy path nữa.

| Module | Feature | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| facilities | District registry cấp xã | P1 | DONE | 94 entry, không duplicate/rỗng, UTF-8/NFC, Object.freeze |
| facilities | Owner create/list/detail/PATCH/submit core | P1 | DONE | Registry runtime thật; chỉ DRAFT/REJECTED được sửa |
| admin | Facility list/detail/approve/reject/suspend/activate | P1 | DONE | Session/capability, Origin/CSRF, Owner ACTIVE, khóa state và metadata |

Kết quả: npm test 15/15 PASS (4 local Facility tests); test:facility:db 13/13 PASS (12 ca + suite cha), gồm representative Phường Hải Châu, Xã Hòa Vang, Đặc khu Hoàng Sa và invalid district 422. Create/PATCH/submit/approve/activate dùng registry mặc định thật; chỉ ứng dụng lỗi cấu hình inject registry rỗng riêng. Concurrent submit, approve/reject, suspend, activate và PATCH/state race PASS.

Regression: Auth Phase 1 13/13 PASS; Auth Phase 2 10/10 PASS; Owner Request 10/10 PASS. GET /api/v1/health HTTP 200. Fixture Facility/Owner Request cleanup và Auth rollback thành công; đối chiếu số dòng/fingerprint của 24 bảng cùng catalog schema trước/sau không đổi. User test email thật trước đây giữ nguyên; sequence có thể tăng do fixture, không reset sequence. Không gửi email/notification thật.

Không thêm package, không đổi schema.prisma/initial migration/.env/CA/TLS, không migration mới. Court/FacilityImage/Amenity/PriceRule/CancellationPolicy/BankAccount/Public search/Booking/Notification/Frontend tiếp tục TODO; ACTIVE chưa đồng nghĩa booking-ready. FACILITY CORE PHASE 1 BACKEND READY: YES.

## Court Core Phase 1 — kiểm chứng 2026-09-27

Court Core hiện DONE theo các dòng trên, thay trạng thái Court TODO tại thời điểm kết thúc Facility phase. Approved specification: [COURT_SPEC.md](specs/COURT_SPEC.md).

- Local `npm test`: 20/20 PASS, gồm Court 5 và Facility 4.
- `npm run test:court:db`: 12/12 PASS (11 ca + suite cha), PostgreSQL thật, đầy đủ 5 Facility state; không sửa approval metadata. Concurrent create chỉ một 201, còn lại 409 COURT_NAME_EXISTS; concurrent PATCH, PATCH/submit và recheck User LOCKED/parent PENDING PASS. Rename/inactivate giữ nguyên Booking snapshot/CourtSlotLock/CourtBlock.
- Regression Facility 13/13, Owner Request 10/10, Auth Phase 1 13/13, Auth Phase 2 10/10 PASS; email fake adapter, không gửi email thật. Health HTTP 200, response giữ nguyên.
- Đã sửa mapping unique violation cho metadata của Prisma PostgreSQL adapter; chỉ đúng constraint courts_facility_id_name_key thành COURT_NAME_EXISTS. Một lần setup fixture bị P2028; chỉ tăng timeout transaction setup riêng của test, không thay config ứng dụng/database. Kết quả trên là lần chạy cuối thành công.
- Cleanup fixture UUID PASS. Đối chiếu count + fingerprint bản ghi trước/sau của 24 bảng nghiệp vụ và _prisma_migrations khớp; metadata constraint khớp. Không còn fixture mới; giữ nguyên User test email thật và dữ liệu có trước task. Sequence tự tăng có thể tiêu thụ ID khi test, không reset sequence.
- Không package mới, schema/migration/.env/CA/TLS không đổi. Không frontend, PriceRule, CourtBlock service, schedule, public Court, availability, Booking hoặc Admin Court API mới. Court tồn tại chưa đồng nghĩa booking-ready.

COURT CORE PHASE 1 BACKEND READY: YES.

## Booking Configuration Phase 1 — hoàn tất kiểm chứng 2026-09-28

Spec đã duyệt tại [BOOKING_CONFIGURATION_SPEC.md](specs/BOOKING_CONFIGURATION_SPEC.md). Sáu GET/PUT Owner endpoints đã triển khai; PriceRule atomic replace và policy/bank singleton upsert. Kết quả này thay trạng thái TODO của riêng configuration trong các ghi nhận phase trước, không đánh dấu Booking/Payment/Refund DONE.

- Local trong task: 25/25 PASS, gồm Booking Configuration5, Court5, Facility4; không giảm test cũ.
- PostgreSQL Booking Configuration chạy lại ngày28: 13/13 PASS (12 ca + suite cha). Đã kiểm tra validation, ownership/Origin/CSRF, cả 5 Facility state và approval metadata, bank QR legacy giữ nguyên, replace tập rỗng, concurrent replace không trộn tập, concurrent singleton upsert, PUT/submit race, recheck User LOCKED/parent PENDING/giờ mới sau khóa, rollback toàn bộ khi lỗi xảy ra sau delete. Health HTTP200, response giữ nguyên.
- Regression trong task: Court12/12, Facility13/13, Auth Phase1 13/13, Auth Phase2 10/10 PASS ngày27; Owner Request chạy lại ngày28 10/10 PASS. Email adapter giả, không gửi email thật.
- Khi tiếp tục phiên ngày28, không còn User fixture config/owner/court/facility/auth/password. Hai suite chưa thu được kết quả kết thúc từ phiên trước đã chạy lại đầy đủ. Các suite đã PASS không sửa hoặc giảm coverage.
- Cleanup fixture UUID PASS. So sánh trước/sau lượt xác minh cuối ngày28: count/fingerprint của 24 bảng nghiệp vụ và _prisma_migrations khớp; metadata columns/indexes/constraints/triggers khớp. User test email thật và dữ liệu có trước lượt test được giữ nguyên. Không reset sequence; test có thể tiêu thụ ID theo PostgreSQL.
- Hash các file bảo vệ trước/sau lượt cuối khớp: schema.prisma, initial migration, migration lock, Prisma/database config, .env, CA và package-lock.json. Không migration/schema/package mới; chỉ thêm script test vào package.json.
- HISTORICAL/SUPERSEDED — tại thời điểm Backend Presentation Phase 1, QR, Availability, Booking, PaymentProof và frontend còn deferred. Hiện các phần đó đã triển khai theo baseline đầu file; Refund, Notification, CourtBlock CRUD và automated reconciliation vẫn deferred.

BOOKING CONFIGURATION PHASE 1 BACKEND READY: YES.

## Facility Presentation Phase 1 — kiểm chứng 2026-09-28

Backend READY: Owner images list/upload/delete/reorder; Owner active Amenity catalog/read/replace; Admin catalog list/create/update. DONE ở bảng trên chỉ backend đã implement và kiểm thử, không frontend hoặc xác nhận dịch vụ Cloudinary thật.

- Local: 29/29 PASS (4 test Presentation).
- Presentation HTTP/PostgreSQL: 12/12 PASS, gồm suite cha; fake Cloudinary, fixture UUID đã cleanup. Ma trận năm state, max10/concurrent uploads, reorder/delete, submit trong upload, assignment/deactivate, session recheck, DB/storage failure và giữ lỗi gốc được kiểm chứng.
- Regression: 71/71 PASS: Auth Phase 1 13, Auth Phase 2 10, Owner Request 10, Facility 13, Court 12, Booking Configuration 13 (gồm suite cha).
- GET /api/v1/health HTTP 200, response giữ nguyên. Regression fixture cleanup/rollback PASS.
- Database vẫn 24 bảng nghiệp vụ, chỉ migration 20260922000000_init; không schema/migration mới hoặc đổi .env/CA/TLS. Không còn User fixture Presentation.
- Thêm cloudinary 2.11.0, multer 2.4.0, file-type 22.1.1. Npm audit vẫn 4 high trong dependency graph Prisma đã ghi nhận trước; không tự audit fix/downgrade.
- CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET đều MISSING khi kiểm tra. REAL CLOUDINARY UPLOAD VERIFIED: NO. Cần cấu hình thật và smoke upload/delete có cleanup; không dùng credential giả hoặc gửi upload thật trong task này.
- Cleanup MVP best-effort, log code/public_id để xử lý thủ công; automated orphan reconciliation, optimization nâng cao, Public/Availability/Booking/frontend tiếp tục deferred. Không đánh dấu các module đó DONE.

## Real Cloudinary verification — hoàn tất 2026-09-29

REAL CLOUDINARY UPLOAD VERIFIED: YES. FACILITY PRESENTATION PHASE 1 READY: YES (backend).

- Ba biến Cloudinary CONFIGURED; không hiển thị/log credential hoặc sửa .env.
- Dùng Owner/Admin/Facility fixture UUID riêng theo convention integration; Facility DRAFT. Ảnh PNG 1x1 được tạo cục bộ, không chứa dữ liệu cá nhân.
- Đúng 1 upload qua POST FacilityImage hiện tại: HTTP 201, Cloudinary resource_type=image/type=upload, public_id trả về khớp image_path trong DB; đúng Facility và sort_order=0. URL HTTPS sinh từ adapter truy cập được, trả nội dung image.
- Đúng 1 destroy qua DELETE cùng FacilityImage: HTTP 204, Cloudinary result=ok, DB record đã xóa. Guard của verification chỉ cho destroy đúng public_id vừa upload.
- Probe resource đơn lẻ ban đầu không phân loại được dạng error object của SDK. Không retry upload/destroy; kiểm tra đọc bổ sung bằng Admin API resources với resource_type=image, type=upload, prefix=facility-images/ cho 0 asset và không next_cursor, xác nhận asset test không còn tồn tại. CDN invalidation có thể bất đồng bộ; dùng metadata origin để xác nhận xóa.
- Cleanup toàn bộ fixture mới thành công: không còn FacilityImage/Facility/OwnerProfile/User test; không chạm User test email thật hoặc dữ liệu có sẵn. Không gửi email thật.
- Sau verification: npm test 29/29 PASS; PostgreSQL 83/83 PASS (Presentation 12, các regression Auth 1/2, Owner Request, Facility, Court, Booking Configuration 71; gồm suite cha). Fixture cleanup/rollback PASS.
- GET /api/v1/health với cấu hình backend hiện tại: HTTP 200, response giữ nguyên.
- Không thay source/business rules/schema/migration/.env/CA/TLS. Không thêm package. Chỉ cập nhật ghi nhận verification trong documentation; không chuyển phase hoặc triển khai frontend/Public/Availability/Booking.

## Public Facility Phase 1 — hoàn tất 2026-10-01

Backend GET /api/v1/facilities và GET /api/v1/facilities/:facility_id đã triển khai. Visibility Facility ACTIVE + Owner User ACTIVE; guest; q/district/pagination theo PUBLIC_FACILITY_SPEC. Public DTO whitelist, URL adapter hiện có, không Owner/bank/internal metadata hoặc booking_ready. Nested relation reads, count/items trong RepeatableRead, không N+1 loop trong service.

Kiểm chứng: npm test 32/32 PASS (3 Public local); node --test test/public-facility.integration.js 8/8 PASS; regression Auth1/Password2/OwnerRequest/Facility/Court/BookingConfiguration/Presentation 83/83 PASS, không skip/fail. GET /api/v1/health HTTP200, response giữ nguyên. Test Public bao phủ visibility/Owner LOCKED, guest, q/NFC/case/contains literal/ACTIVE Court/dedup, district, pagination, gallery/cover/order, active relations, price/policy empty và có dữ liệu, whitelist. Fixture UUID riêng cleanup PASS; regression cleanup/rollback PASS. Không email/upload Cloudinary thật. Assertion Facility cũ coi /facilities là chưa tồn tại được cập nhật sang guest200 + whitelist; cấm DELETE và business rules giữ nguyên.

Không package mới, schema/migration/.env/CA/TLS không đổi. Scope DONE chỉ backend hai endpoint, không frontend hoặc Court endpoint riêng, public Amenity catalog/filter, giá đại diện/filter/sort, rating/popularity, Availability/Booking/readiness. PUBLIC FACILITY PHASE 1 READY: YES.

## Availability Phase 1 — kiểm chứng 2026-10-01

- Đã triển khai GET /api/v1/courts/:court_id/availability?date=YYYY-MM-DD, guest; visibility Court/Facility/Owner ACTIVE. Validation, UTC/Asia/Ho_Chi_Minh, slot30 phút, priority/state mapping và giá decimal theo AVAILABILITY_SPEC.
- PostgreSQL READ ONLY + RepeatableRead, một clock_timestamp cho toàn response; đọc batch rules/blocks/Booking/lock relation, không truy vấn từng slot. Không BankAccount, total quote, Booking writer hoặc cleanup trong GET. Availability là snapshot, không giữ chỗ.
- `npm test`: 37/37 PASS, gồm 5 local Availability. `node --test test/availability.integration.js`: 6/6 PASS; kiểm tra dữ liệu trước/sau không đổi, lock hết hạn/terminal không chặn, booking hiệu lực thiếu lock vẫn chặn, overlap price409, DTO whitelist; fixture cleanup PASS.
- Regression Auth, Password, Owner Request, Court, Presentation và Public Facility PASS. Lượt tổng hợp ban đầu có timeout tại Facility và Booking Configuration, không phải một lượt 91/91 thành công. Đã chạy lại nguyên hai suite bằng `node --test --test-concurrency=1 test/facility.integration.js test/booking-configuration.integration.js`: 26/26 PASS, không sửa test/timeout/business rule. Kết hợp các suite đã hoàn tất, toàn bộ 91 test regression được xác minh PASS. Không khẳng định nguyên nhân timeout là lỗi mạng khi chưa có bằng chứng.
- Fixture của lượt chạy và chạy lại đã cleanup/rollback. Fixture Facility còn sót do timeout đã được dọn theo đúng UUID và cửa sổ created_at của lượt bị gián đoạn; không xóa User test email thật hoặc dữ liệu có sẵn. Không còn fixture test của task.
- GET /api/v1/health HTTP200, response giữ nguyên. Không gửi email hoặc gọi Cloudinary thật. Không package mới; schema/migration/.env/CA/TLS không đổi.
- Chỉ Availability backend DONE. Booking creation, chống double booking ở writer, expiry worker, CourtBlock CRUD, total quote, realtime và frontend tiếp tục TODO/deferred. Các ghi nhận Availability deferred ở các phase trước là lịch sử.

AVAILABILITY PHASE 1 READY: YES.

## Payment Frontend Phase 1 — hoàn tất 2026-10-06

HISTORICAL/SUPERSEDED — Route `/bookings/:id/payment` ở mốc Payment UI ban đầu được triển khai theo `payment-pending-desktop.png`. Trang dùng Booking snapshot thật, nội dung chuyển khoản `BOOKING <id>`, countdown đồng bộ `expires_at` với `meta.server_time`, chọn một JPEG/PNG tối đa 5.000.000 bytes và gửi đúng một field multipart `image` qua API client cookie/CSRF hiện có. Ở mốc lịch sử này QR, PaymentProof URL và Owner review còn deferred; hiện ba phần đó đã triển khai. Refund và workflow giao dịch 70% vẫn deferred.

Frontend xử lý riêng lỗi trạng thái/validation/network; kết quả POST không xác định được phục hồi bằng GET Booking Detail trước khi cho retry. HTTP 201 `PENDING_CONFIRMATION` điều hướng về Detail; frontend không tự gán EXPIRED. Fix ngày 2026-10-06 giữ snapshot đã xác minh khi focus refresh đang pending, nên đóng file picker không khóa nhầm submit; terminal/error/unknown vẫn bảo vệ. Tests cuối: 109/109 PASS (Payment 28 cùng Auth/Home/Facility List/Facility Detail/Availability/Booking regression), lint PASS, production build PASS. CSS responsive có layout hai cột desktop và xếp dọc tablet/mobile; kiểm tra Edge 1440/800 và guard dùng chung, quy tắc 390 được kiểm tra qua media CSS/test nhưng không live API E2E. Không dữ liệu DB/Cloudinary/email thật, không backend/schema/migration/.env thay đổi.

PAYMENT FRONTEND PHASE 1 READY: YES.

## Frontend Auth F1 — kiểm chứng 2026-10-02

Bốn route Auth đã triển khai theo 6 PNG approved và các ngoại lệ đã chốt; chỉ frontend Auth F1 DONE. / vẫn trang scaffold, không Home nghiệp vụ. React Router8.4.0; fetch/Context, không Axios/Redux. Test tooling Vitest5.0.3, jsdom29.1.1, Testing Library React16.3.3.

- npm test:20/20 PASS. Bao phủ sessionbootstrap/loading/401/authenticated/network/503/retry; login redirect/errors/double-submit/password toggle; Register đúng body/no auto-login/notice/validation; Forgot202generic/429; token fragment/memory/StrictMode/duplicate/missing/expired; resetconfirm/success/network; capabilityguards/CSRF/204/APIerrors; spy cấm Storage.setItem trong mọi test.
- npm run lint:PASS, không cảnh báo. npm run build:PASS với API base URL public cấp cho tiến trình, không sửa .env.
- Edge browser thật: guest session backend qua CORS, Login desktop1440; Register mobile390; Forgot desktop; Reset thiếu token mobile. Không overflow ngang, đã quan sát screenshots trong thư mục tạm ngoài project.
- Không mutation/backend integration mới: test flow dùng HTTP fake trong test, runtime không mock. Không email/Cloudinary thật hoặc dữ liệu test database. Không sửa backend/schema/migration/.env/CA/TLS.
- Môi trường chạy/build phải cấp VITE_API_BASE_URL; cấu hình thật frontend hiện chưa được task thay đổi. Production domain/HTTPS/same-site và SPA fallback vẫn cần cấu hình khi deploy.
- Change Password frontend và Google Login vẫn TODO/DEFERRED. Home/Public Facility/Availability/Booking frontend đã triển khai; những ghi nhận cũ khác là lịch sử.

AUTH FRONTEND F1 READY: YES.

## Booking Phase 1 — backend hoàn tất kiểm chứng 2026-10-04

Ngày 2026-10-04: Booking Phase 1 backend đã triển khai POST /api/v1/bookings, GET /api/v1/bookings và GET /api/v1/bookings/:id. Chỉ Customer capability và dữ liệu cá nhân; POST Origin/CSRF. Transaction khóa User IDs tăng dần/loại trùng → Facility → Court → Booking liên quan → slot locks, recheck sau khóa. Giá tính chính xác bằng BigInt theo đơn vị nửa đồng, rounding theo spec; batch ghi BookingSlot/CourtSlotLock, overflow kiểm tra trước ghi. Lazy expiry tại create/detail, list read-only effective status; Availability không thay đổi. Không PaymentProof/Refund/worker/frontend.

Local npm test: 41/41 PASS. Booking PostgreSQL: 15/15 PASS (14 ca + suite cha), gồm 6 slot, hold 5 phút, DTO/ownership/CSRF, expiry/read-only list, mất lock nhưng booking còn hiệu lực, PK collision thật, hai Customer cùng slot, self-booking, hai Owner đặt chéo, writer state/price/bank/Owner lock race và rollback sau ghi lock. Fixture cleanup PASS; HTTP health200.

Regression PostgreSQL: Auth13, Availability6, Booking Configuration13, Court12, Facility13, Owner Request10, Password10, Public Facility8 =85 test hoàn tất PASS. Lượt tổng hợp ban đầu có90 PASS/5 FAIL/2 CANCELLED vì Presentation vượt timeout900000ms sau khoảng thời gian chạy bị gián đoạn; không ghi nhận lượt đó là PASS. Đã chạy lại nguyên `node --test test/presentation.integration.js`:12/12 PASS, không đổi assertion/timeout/business rule. Tổng hợp các suite hoàn tất:97 test regression đã được xác minh PASS. Cleanup của lượt cũ và lượt chạy lại đều PASS; các fixture transaction của Auth/Password rollback. Không gửi email hoặc upload Cloudinary thật.

HISTORICAL/SUPERSEDED — Booking Phase 1 ban đầu chỉ đánh dấu pricing/snapshot/create/hold/lazy-expiry/history/detail DONE. PaymentProof, Owner confirm/reject và frontend nay đã triển khai; confirmed cancellation, Refund, worker và CourtBlock CRUD vẫn deferred. Không package mới, schema/migration/.env/CA/TLS không đổi. BOOKING PHASE 1 BACKEND READY: YES.

## Current update — Booking V2 State & Expiry Foundation (2026-10-15)
Foundation source và migration additive đã hoàn tất: discriminator V1/V2, confirmation deadline 30 phút từ DB time, lazy expiry nguyên tử và Availability dual-read. Migration `20261015000000_booking_v2_foundation` đã apply lên Supabase DEVELOPMENT sau fingerprint/preflight; 47 Booking hiện hữu được giữ nguyên trạng thái và phân loại V1, PaymentProof/Refund/BookingSlot/CourtSlotLock giữ nguyên số lượng. PostgreSQL verification PASS: constraints V1/V2/FK, V2 trước hạn HELD, hết hạn EXPIRED + nhả lock, stale-hold replacement, concurrent create một winner, rollback nguyên tử và Availability query thật. Fixture `TEST_V2_` cleanup PASS; Booking #1119 giữ `CANCELLED`, proof `APPROVED`, refund `REFUNDED`, 2 slot và 0 lock. Regression: backend local 73/73, Booking V2 PostgreSQL 8/8, Availability 6/6, Booking 19/19, Payment 22/22, frontend tuần tự 375/375, lint/build/health/public API PASS. Rollout mặc định vẫn V1 (`BOOKING_FLOW_VERSION=1`); Payment/Refund V1 giữ nguyên, Owner confirm/reject V2 và Payment V2 vẫn deferred sang phase tương ứng.

## Current update — Booking V2 Deposit / Bank Transfer Phase 2 (2026-10-15)

Customer V2 đã có hướng dẫn chuyển cọc read-only từ Booking Detail: bank/QR snapshot, cọc 30%, còn lại 70%, transfer reference `CLDN <BOOKING_ID>` và countdown 30 phút theo server time. Frontend không render/gọi upload proof cho V2; expiry refetch server, `EXPIRED`/`CONFIRMED` có state riêng. Backend proof endpoint fail closed cho V2 trước storage/mutation; V1 PaymentProof compatibility giữ nguyên. Owner confirm/reject V2 vẫn chưa thuộc phase này.

## Current update — Booking V2 Owner Confirm / Reject Phase 3 (2026-10-16)
COMPLETE: Owner V2 confirm/reject API, DB-time expiry, ownership/security, audit metadata, occupancy/release invariants, Owner list quick actions/countdown và Owner detail actions. V1 PaymentProof flow giữ nguyên. Evidence: backend local 74/74; Booking V2 PostgreSQL 14/14 với fixture cleanup; Payment V1 PostgreSQL 22/22 với cleanup; frontend targeted 51/51 và Owner Payment 39/39; full frontend tuần tự 381/381; lint/build PASS. Không schema/migration/seed/demo mutation trong Phase 3.
## Owner Analytics Phase 1 — Audit/Specification PASS (2026-10-17)

Source/schema and a read-only development profile were audited. Owner Analytics now has an approved occurrence-based contract, V1/V2/recurring compatibility, financial terminology that does not mislabel booking value as received revenue, current-configuration capacity/utilization semantics, a 366-day local-date bound, aggregate-only DTOs, Owner isolation, and a bounded PostgreSQL query strategy. `docs/specs/OWNER_ANALYTICS_SPEC.md` is current. Analytics API/UI remain **DEFERRED** until Phase 2/3 implementation; no schema, migration, seed, or database mutation was performed.
