# MASTER HANDOFF --- WEBSITE ĐẶT SÂN CẦU LÔNG ĐÀ NẴNG

## FINAL PROJECT STABILIZATION PHASE 5A — ZERO-SECRET CI BASELINE (2026-10-20)

Ordinary GitHub Actions CI is now defined in `.github/workflows/ci.yml` for pull requests and pushes to `main`. It pins Node `24.14.1`, uses `npm ci` plus lockfile caching, least-privilege `contents: read`, and cancellation for superseded ref/PR runs. Repository safety rejects tracked runtime `.env` files (while allowing `.env.example`), private keys, dumps, pgpass content, and Playwright auth state. Backend validation runs production dependency audit, Prisma validate/generate with a disposable non-connected loopback URL, and non-database unit tests. Frontend validation runs full and production audits, lint, canonical tests, and production build.

No secrets, Supabase URL, local paths, TLS private material, database service, migration, seed, external service, Playwright run, or deployment are in ordinary CI. PostgreSQL integration stays deferred because the current adapter requires verified TLS; a plain service container would not be faithful without weakening TLS. Public Playwright requires a live API and authenticated/release suites require protected credentials plus isolated fixtures. Local rehearsal is retained alongside the hosted evidence below. Next phase is to select staging topology before any CD work.

Hosted evidence is now available: [CI run #1](https://github.com/khang2251220258-lab/DatLichSanCauLong/actions/runs/39390349745) was triggered by the push of `a1c4f5b` and completed successfully in 49 seconds. Repository safety, backend validation, and frontend validation were all green. It used no CI secrets, Supabase connection, database mutation, migration, seed, Playwright suite, or deployment. PostgreSQL integration remains deferred and the authenticated three-role release rehearsal remains release-only; this evidence does not establish staging or production readiness.

## FINAL PROJECT STABILIZATION PHASE 4B — ISOLATED BACKUP / RESTORE REHEARSAL (2026-10-20)

Phase 4B is **VERIFIED** for the isolated application backup/restore rehearsal, not a production deployment gate pass. Native `pg_dump`, `pg_restore`, and `psql` 17.11 were used with a read-only Supabase development source and a separately fingerprinted empty loopback PostgreSQL 17.11 target. The source was PostgreSQL 17.6/database `postgres`/schema `public`, with migrations `20260922000000_init`, `20261015000000_booking_v2_foundation`, and `20261017000000_recurring_booking_foundation`. Current source counts were 17 Users, 16 Facilities, 32 Courts, 48 Bookings, 141 BookingSlots, 66 CourtSlotLocks, 0 BookingSeries, 35 PaymentProofs, 9 Refunds, 3 OwnerRequests, and 3 Amenities. Booking #1119 remained `CANCELLED`, proof `APPROVED`, refund `REFUNDED`, 2 slots, 0 locks, and 80,000/24,000/56,000 snapshots before and after the rehearsal.

The retained operator-controlled public-schema custom archive was 140,941 bytes, SHA-256 `0BD539842C93AF9D7D9708A32A3D6B03B637768B787C423601713961F5CB5B86`. `pg_restore --list` completed with exit 0, the archive contained the expected public application objects without Supabase-managed schemas, and restore completed with `--clean --if-exists --no-owner --no-privileges --exit-on-error`, exit 0 and no warnings. The target matched source migration history, 26 public tables, 26 primary keys, 42 foreign keys, 284 checks, 75 indexes, all agreed count comparisons, and Booking #1119. The post-restore read-only source recheck was unchanged. No source migration, seed, fixture, demo-data mutation, external service call, or Booking #1119 mutation occurred.

Prisma validate and generate passed. The remaining runtime verification was completed with independently configured local TLS: a `verify-full` client connection confirmed CA and hostname verification for `localhost`, TLSv1.3, and `TLS_AES_256_GCM_SHA384`. The application's normal Prisma adapter connected to the restored target through process-scoped credentials and the local CA without weakening certificate verification. A temporary backend process returned HTTP 200 for health, readiness, Public Facility, Guest Search, and Recurring Search; each public search response passed its expected envelope check. The post-smoke source recheck and target recheck matched all counts and Booking #1119. No migration, seed, reset, db push, authenticated mutation, source configuration change, or source write occurred. The target and backup remain retained outside Git. Staging and production remain blocked only by separate provider/domain/proxy topology, monitoring ownership, and staging deployment validation.

## FINAL PROJECT STABILIZATION PHASE 4A / 4A.1 — RELEASE BASELINE AND DEPENDENCY AUDIT CLOSURE (2026-10-19)

Starting HEAD was `ac8b4fe`. The immutable local release baseline is now split into four reviewable commits: `eff8eda` (`feat(backend): establish booking platform release baseline`), `c50f904` (`feat(frontend): establish verified application release baseline`), `23bb847` (`chore(tooling): add verified E2E and developer workflow baseline`), and `4600492` (`docs(release): record current platform specifications and evidence`). No catch-all staging, amend, rebase, tag, push, deployment, schema change, migration application, seed, demo-data mutation, or Booking #1119 mutation occurred.

Baseline staged scans found no credentials, real environment files, or Playwright auth state. Backend unit tests passed **97/97**; frontend regression passed **409/409**; Prisma validate/generate/migration status passed with three migrations and development schema up to date; lint and production build passed. Temporary local read-only smoke checks returned HTTP 200 for health, readiness, public Facilities, Guest Search, and Recurring Search. The tracked Supabase CA remains a public trust certificate, and only placeholder `.env.example` files are tracked.

Phase 4A initially found one full-development audit high advisory: `GHSA-68fv-2mgg-jv7q`, affecting `source-map-js >=1.0.0 <1.2.2`. Installed `1.2.1` was transitive through Vite/PostCSS and jsdom/css-tree, all development/build/test tooling; React production dependencies do not include it in the browser bundle. Both parents declare `^1.2.1`, so the patch-compatible `1.2.2` was pinned with an npm override and deterministic lockfile in `43a5b61` (`chore(frontend): remediate release dependency audit`). Clean install, full audit, and `--omit=dev` production audit now report **0 vulnerabilities**. Post-remediation frontend regression **409/409**, Chromium public smoke **1/1**, lint, and production build pass.

The repository status is clean after this metadata closure. Production remains **NOT READY**: provider/domain/proxy topology, isolated backup/restore rehearsal, monitoring ownership, and staging deployment validation remain required go-live gates. Next recommended phase: **FINAL PROJECT STABILIZATION PHASE 4B — ISOLATED BACKUP/RESTORE REHEARSAL**.

## FINAL PROJECT STABILIZATION PHASE 3 (2026-10-19)

Authenticated release rehearsal passed **1/1** in 3.4 minutes using the real Login UI and isolated `TEST_E2E_RELEASE_` PostgreSQL records. The run covered Customer V2 booking, Owner confirmation, Customer post-confirmation read, recurring create, Owner series confirmation, Owner Analytics, and an Admin Amenity mutation. Each critical POST occurred once; initial Analytics reads were one Overview plus one Courts request; no unexpected browser console or page error occurred. Exact manifest cleanup and verify-only postflight returned every fixture count to zero, and Booking #1119 remained unchanged.

The rehearsal found and fixed a role-switch safeguard: dynamic Booking and Series detail paths are never restored after login because a new account's capability does not establish ownership of an ID captured by the previous account. Frontend regression **409/409**, targeted Auth/Facility/Recurring **64/64**, lint, and build passed. `release-*.png` are screenshot review candidates only. No schema, migration, normal seed, demo-data mutation, or external upload/email occurred.

Production is still **NOT READY**: create reviewed immutable baseline commits, select provider/domain/proxy topology, rehearse backup/restore into an isolated target, validate staging deployment, and assign monitoring ownership.

## FINAL PROJECT STABILIZATION PHASE 2 (2026-10-19)

Release hardening closed the two code/configuration blockers from Phase 1. Production startup now requires an explicit `BOOKING_FLOW_VERSION=2`; missing or invalid production configuration fails before the server starts, while development/test keeps the historical missing-value V1 fallback for compatibility verification. Prisma CLI, client, and PostgreSQL adapter are aligned at 7.10.1; the production dependency audit reports zero vulnerabilities.

`GET /api/v1/health` remains dependency-free liveness. New `GET /api/v1/ready` performs a bounded PostgreSQL `SELECT 1` and returns a generic 503 without leaking dependency details. Production environment, build/start, migration deploy, TLS/CORS/cookie, proxy, rate-limit, storage/email, backup/restore, rollback, logging/monitoring, and release smoke requirements are recorded in `docs/DEPLOYMENT.md`.

Verification after hardening: backend unit **97/97 PASS**; critical PostgreSQL matrix **95/95 PASS** across Booking V1, Booking V2, BookingSeries, Recurring Search, Guest Search, Availability, Payment/Refund, and Owner Analytics with fixture cleanup; frontend sequential **409/409 PASS**; lint/build/Prisma validate/generate/migration status/audit and runtime liveness/readiness/public smoke PASS. Tests used isolated PostgreSQL fixtures only; no seed, shared demo mutation, external upload/email, schema change, or migration occurred. Booking #1119 remains protected and is rechecked read-only before release closure.

The repository is **READY TO COMMIT**, not committed by this phase: the accumulated working tree must be split and reviewed using `docs/RELEASE_BASELINE_PLAN.md`; a catch-all commit was intentionally avoided. Production deployment remains blocked by provider/domain/proxy selection, staging backup/restore rehearsal, monitoring ownership, and a complete authenticated three-role release rehearsal. The pg concurrency-test warning about querying a busy client remains a pre-pg-9 test-helper cleanup item and does not change current pg 8 runtime results.

## Recurring Booking Phase 5D — authenticated Customer runtime VERIFIED (18/10/2026)

Authenticated Playwright dùng một Customer/session thật và fixture PostgreSQL cô lập `TEST_E2E_CUSTOMER_` để kiểm tra `/booking-series` cùng `/booking-series/:series_id`. Mixed state gồm `COMPLETED`, `CANCELLED` + Refund `PENDING` và hai `CONFIRMED`; direct load, SPA navigation, Back/Forward, cancellable child, accessible modal và responsive 1440/768/390 đều PASS. Initial List/Detail mỗi route có đúng một GET, không per-child Booking/Refund/PaymentProof request và không N+1.

Evidence: Playwright **4/4**, recurring targeted **16/16**, frontend tuần tự **409/409**, backend local **93/93**, lint/build/Prisma/health/diff PASS. Sáu `recurring-customer-*` PNG chỉ là review candidates. Fixture/AuthSession/credential file đã cleanup, verify-only trả mọi count bằng 0 và Booking #1119 không đổi. Runtime không dựng `PROOF_SUBMITTED`/`REFUNDED` vì không có authenticated private asset an toàn; contract này vẫn có Phase 5B PostgreSQL và Phase 5C component evidence. Không đổi backend business logic, schema, migration, seed hoặc demo data.

## Public Home Facility Showcase redesign — 17/10/2026

The Home Facility section was redesigned as an image-first discovery surface without changing Guest Search or backend contracts. Shared `FacilityCard` now has an explicit Home presentation: 3:2 cover/fallback, two-line Facility name, district/address hierarchy, up to three amenity chips plus an API-derived remainder count, and a lightweight **Xem sân** Detail link. Search Results keep their current interval/recurring `matching_courts`, URL context, and **Xem chi tiết** presentation. The list DTO does not provide a price summary, so no price is calculated or displayed.

Home remains one `GET /facilities?page=1&page_size=4`, with zero per-card Detail requests before navigation. Responsive layout is 4/2/1 cards for desktop/tablet/mobile; skeleton, empty, error/retry, image fallback, focus, touch targets, reduced motion, and no-body-overflow behavior are covered. Read-only Home Playwright **3/3** and Guest Search one-time/recurring **6/6** passed. Targeted frontend **91/91**, full sequential **402/402**, lint/build/diff PASS. The three `home-facilities-*` screenshots are review candidates only. No backend, database, schema, migration, seed, demo data, or Booking #1119 mutation occurred.

**Cập nhật:** 17/10/2026\
**Mục đích:** Dán/gửi tài liệu này vào một cuộc trò chuyện ChatGPT/Codex
mới để tiếp tục dự án mà không phải giải thích lại từ đầu.

## Owner Analytics Phase 4 — AUTHENTICATED RUNTIME VERIFIED / MVP CLOSED (18/10/2026)

Authenticated Playwright uses a disposable `TEST_E2E_OWNER_ANALYTICS_` Owner/Facility fixture and the real Login UI. Desktop/tablet/mobile passed with one parallel Overview/Courts pair on initial load, Court-only pagination, both endpoint refreshes returning HTTP 200 for filter changes, URL/navigation/active-state restoration, a 141 ms protected-snapshot revisit, no unintended console/page/network error and no horizontal overflow. The three generated screenshots are review candidates, not approved references.

Runtime verification removed an undocumented `meta.total_pages` field and deferred the shared Owner hook's initial read so React StrictMode cannot issue a discarded duplicate request. Backend local **93/93**, Analytics PostgreSQL **5/5**, frontend Analytics **6/6**, authenticated Playwright **4/4**, full frontend **409/409**, lint/build/Prisma/health/diff passed. Fixture/AuthSession/temp credentials were cleaned, Booking #1119 remained unchanged, and no schema/migration/seed/demo mutation occurred. Next phase: **FINAL PROJECT STABILIZATION**.

## FINAL PROJECT STABILIZATION PHASE 1 (2026-10-19)

### Repository and audit scope

Read-only audit covered application source, Prisma schema and all three migrations, API and frontend routes, validators, security boundaries, tests, demo verification, UI references, and current documentation. The repository inventory contains 417 files. Branch `main` still has only the initial commit `ac8b4fe` plus **235 modified/untracked working-tree entries**. This is a release reproducibility and rollback blocker; the audit did not commit, delete, or rewrite unrelated work.

Prisma reports migrations `20260922000000_init`, `20261015000000_booking_v2_foundation`, and `20261017000000_recurring_booking_foundation` applied with the database schema up to date. No migration was created or applied in this audit. No seed or persistent demo mutation was executed.

Audited modules: Auth/session/password, Profile, Owner Request, Facility, Court, Presentation/Amenity, Booking Configuration, Public Facility, Availability, Booking V1/V2, Guest Search, Recurring Search/BookingSeries, occurrence cancellation, PaymentProof, Refund, Owner Analytics, Admin Facility/Owner Request/Amenity, and frontend routing/auth/cache/reliability.

### Verification evidence

- Backend local: **93/93 PASS**.
- PostgreSQL integration: **188/188 PASS** across 16 suites; every suite reported fixture cleanup/rollback PASS.
- Frontend canonical sequential run: **25 files, 409/409 PASS**.
- Prisma validation and migration status: PASS / schema up to date.
- Frontend lint and production build: PASS; 162 modules transformed.
- `GET /api/v1/health`: HTTP 200.
- `git diff --check`: PASS with Windows LF/CRLF warnings only.
- Demo command ran in explicit verify-only mode: no invariant errors; 10 Customers, 10 managed Facilities, 32 seed-managed Bookings covering all seven states, plus PaymentProof/Refund coverage. Image verification reports 48 Bookings across the wider demo/legacy namespace; these counts have different scopes.
- Booking #1119 read-only verification: `CANCELLED`, PaymentProof `APPROVED`, Refund `REFUNDED`, 2 BookingSlots, 0 CourtSlotLock, snapshots 80,000/24,000/56,000. It was not changed.
- Full Playwright was not rerun. Existing coverage includes public smoke/performance, Admin shell, Profile, Guest/Recurring Search, authenticated Recurring Customer, and authenticated Owner Analytics. Prior authenticated Owner Analytics and Recurring Customer runs were each 4/4 PASS with isolated fixture cleanup.

### Findings

**CRITICAL: none found.** Current test evidence found no data-loss path, authorization bypass, double booking, or incorrect payment/refund calculation.

**HIGH — unresolved release blockers:**

1. **No reviewable release baseline:** 235 dirty entries sit above one initial commit. A release candidate cannot yet be reproduced or rolled back reliably.
2. **Production operations are incomplete:** no hosting/provider manifest, production domain/TLS/reverse-proxy decision, environment inventory, monitoring/alerting, backup/restore rehearsal, RPO/RTO, or deploy/rollback runbook. `/health` is liveness only and does not verify PostgreSQL readiness.
3. **Booking V2 cutover is unresolved:** `.env.example` keeps `BOOKING_FLOW_VERSION=1`; the audited development runtime has the variable missing and therefore defaults single-booking creation to V1. V2 and recurring tests pass, but the release must explicitly select and smoke the intended flow version.
4. **Dependency audit:** the backend production tree reports four HIGH advisories through Prisma 7.10.0 (`@prisma/config`/`deepmerge-ts` and transitive `mysql2`); npm offers Prisma 7.10.1 as a patch candidate. Runtime uses PostgreSQL rather than mysql2, but the dependency must be upgraded with regression evidence or formally accepted before release. Frontend production audit reports zero vulnerabilities.

**MEDIUM:**

- `docs/ARCHITECTURE.md` and historical tables in `docs/FEATURE_STATUS.md` still mix planned/TODO claims with later implemented reality. Current source and the newest FEATURE_STATUS sections are authoritative; historical sections need clearer archival labels.
- Auth rate limiting is per-process memory and `trust proxy` is not configured. Production proxy topology and multi-instance policy must be defined.
- PostgreSQL concurrency tests emit a pg@9 deprecation warning for issuing `client.query()` while that client is already executing a query. Tests pass today; race-test helpers need correction before a pg major upgrade.
- A single release run does not yet have authenticated Playwright coverage for every Customer payment/refund, Owner configuration/payment/refund, and Admin mutation flow. Component and PostgreSQL evidence exist, but a staging rehearsal remains required.
- Supabase/network RTT makes transaction suites slow. Query-budget evidence shows fixed fan-out/set-based reads, so correctness locks/transactions must not be weakened as a latency shortcut.

**LOW:** backend has no lint script; health has no build/version identifier; demo verification presents 32 seed-managed versus 48 wider-namespace Bookings without a prominent scope label; the working tree emits many LF/CRLF warnings although diff check passes.

### Security and correctness summary

Source confirms opaque random session tokens stored as hashes, Argon2id passwords, HttpOnly/SameSite cookies with Secure in production, exact Origin plus CSRF on mutation, ACTIVE-user/capability/ownership checks, 404 concealment, DB-time deadlines, DTO allowlists, private authenticated proof assets, signed URL expiry, upload decoding/limits, and deterministic transactions/lock order. Searches found no unsafe raw-query API, `dangerouslySetInnerHTML`, browser token/session storage, hard-coded credential, or secret in application source.

Booking V1 compatibility, V2 create/expiry/Owner decisions, Guest interval search, recurring all-or-nothing create/Series decisions/child cancellation, Refund lifecycle, and Owner Analytics all passed their PostgreSQL suites. Admin currently supports Facility moderation, Owner Request moderation, and Amenity catalog management; it does not implement a dashboard, user management, or global booking management.

### Known limitations and deferred scope

Google Login/account linking, Notification, Favorite, Review, content/report management, CourtBlock CRUD, expiry worker, completion/check-in adoption, authoritative ledger for the remaining 70%, recurring PaymentProof, future/whole-Series cancellation, bulk Refund, and advanced analytics remain deferred. Owner Analytics and Recurring Customer runtime screenshots remain REVIEW CANDIDATE, not APPROVED references.

### Recommended stabilization order

1. Review and split the 235 entries into coherent commits, scan the candidate for secrets/artifacts, and tag a reproducible baseline.
2. Select `BOOKING_FLOW_VERSION` explicitly and smoke create/read/Owner decision for that version while retaining V1 regression.
3. Patch Prisma or document a time-bounded risk acceptance; rerun generate/validate, backend local, and all PostgreSQL integration suites.
4. Define production hosting, HTTPS/domain/CORS/cookie/trusted-proxy settings, connection budget/CA, external services, SPA fallback, readiness, logs, and monitoring.
5. Rehearse backup/restore and deploy/rollback on staging.
6. Run a three-role release E2E with isolated fixtures, private proof access, desktop/mobile checks, and verified cleanup.
7. Archive documentation drift and publish a release checklist/artifact identifier before production go/no-go.

### Conclusion

The audit itself **PASS** with no CRITICAL finding and strong correctness evidence. Demo/manual data is ready for review. **READY FOR PRODUCTION DEPLOYMENT: NO** until the HIGH release blockers above are closed.

Next phase: **Final Stabilization Fixes — Release Baseline + Dependency/Deployment Hardening**, followed by staging rehearsal and a production go/no-go review.

## 1. Bối cảnh và nguyên tắc

### Owner Analytics Phase 2–3 — 17/10/2026

Backend Phase 2 PASS với `GET /api/v1/owner/analytics/overview` và `/courts`; frontend Phase 3 triển khai `/owner/analytics` trong Owner workspace. URL giữ `from`, `to`, `facility_id`, `page`; mặc định 30 ngày local Asia/Ho_Chi_Minh. Dashboard hiển thị bốn KPI đúng semantics, trend tháng, weekday, heatmap 30 phút, daily capacity và Court pagination. Overview/Courts đọc song song, mỗi endpoint một request cho filter state; Court page không refetch Overview. DTO validation fail-closed, protected cache tách account/capability/exact path, abort/generation guard và snapshot background refresh được giữ. `confirmed_booking_value` không phải doanh thu thực nhận; historical capacity vẫn là proxy theo cấu hình hiện tại. Không đổi backend/schema/database/demo data. Screenshot runtime nếu tạo chỉ là review candidate; Phase 4 đề xuất là screenshot review và runtime performance verification.

Đồ án: **Website đặt sân cầu lông trực tuyến tại thành phố Đà Nẵng /
Online badminton court booking website in Da Nang City.**

Dự án phần mềm thực tế, 1 developer, thời gian ngắn, cần deploy công
khai và demo với GVHD. Khi hỗ trợ, hãy giải thích bằng tiếng Việt dễ
hiểu, ưu tiên MVP, correctness, security, performance và khả năng demo;
tránh overengineering.

Không tự thay business rule. Audit source trước thay đổi lớn. Không dùng
`prisma migrate reset`, không broad DELETE, không seed khi chưa được yêu
cầu. Integration mutation phải dùng isolated fixtures và cleanup chính
xác. Không mutate Booking #1119. Full frontend regression nên chạy tuần
tự vì parallel jsdom từng có contention.

## 2. Stack

Frontend: React/React DOM 19.3.0, Vite 8.3.0, JavaScript, Oxlint,
Vitest, Playwright.\
Backend: Node.js 24.14.1, npm 11.11.0, Express 5.2.1, REST API.\
ORM/DB: Prisma 7.10.0 + PostgreSQL trên Supabase. Supabase chỉ host
PostgreSQL; không dùng Supabase Auth/Storage/Realtime/Edge Functions.

Kiến trúc:
`React → HTTP → Express (Auth/Authorization/Validation/Business Rules) → Prisma → PostgreSQL/Supabase`

Backend modular monolith. Health: `GET /api/v1/health`. Local API base:
`http://localhost:3000/api/v1`.

Backend `npm run dev` hiện dùng `node src/server.js`. Watch tách thành
`npm run dev:watch`, vì `node --watch` trước đây restart child process
gây `ERR_CONNECTION_RESET`.

## 3. Database

Các model nền tảng: User, AuthSession, PasswordResetToken, OwnerProfile,
OwnerRequest, Facility, FacilityImage, Court, Amenity, FacilityAmenity,
PriceRule, CancellationPolicy, Booking, BookingSlot, CourtSlotLock,
CourtBlock, BankAccount, PaymentProof, Refund, Favorite, Review,
ReviewImage, Notification, ContentPage.

Thiết kế: không dùng Prisma enum; VARCHAR + PostgreSQL CHECK. Money dùng
NUMERIC, timestamps dùng TIMESTAMPTZ(3), lịch sử chủ yếu FK RESTRICT.
CourtSlotLock bảo vệ tranh chấp slot. Refund UNIQUE(booking_id).
OwnerRequest có partial UNIQUE cho PENDING.

Migration Booking V2:
`backend/prisma/migrations/20261015000000_booking_v2_foundation/migration.sql`,
đã apply. Database hiện 2/2 migrations applied.

Baseline sau verification: 47 Booking, 35 PaymentProof, 9 Refund, 140
BookingSlot, 65 CourtSlotLock. 47/47 booking cũ là flow V1. Booking
#1119 vẫn CANCELLED, V1, proof APPROVED, refund REFUNDED, 2 slots, 0
locks.

## 4. Auth và Personal Account Center

Đã có Register/Login email-password, Google login, session, Forgot/Reset
Password, Change Password. Reset token one-time, expiry 15 phút, DB lưu
hash. Change password yêu cầu current password với local account, dùng
Argon2id, revoke sessions sau thành công.

Email là login identity; chưa hỗ trợ đổi email. Google-only chưa có
account linking.

Shared `/profile` cho Customer/Owner/Admin đã có GET/PATCH `/users/me`,
sửa full_name/phone, email read-only, Change Password UI,
capability/account info, Owner Request state/link, account menu,
responsive/accessibility/reliability.

Deferred: đổi email, avatar upload, Google account linking, account
deletion.

## 5. Owner onboarding

OwnerRequest states: PENDING / APPROVED / REJECTED. Tối đa 1
PENDING/user; reject có lý do; giữ lịch sử; có thể gửi lại sau reject.
Owner approval độc lập Facility approval.

Approve không tạo account mới: User vẫn là Customer, tạo OwnerProfile và
thêm capability OWNER; session cũ bị revoke. Owner Request lưu snapshot
profile tại thời điểm gửi; sửa profile sau này không rewrite snapshot
lịch sử.

Admin Owner Request List/Detail đã redesign: semantic desktop
table/mobile list, filters accessible, Approve/Reject modal,
authoritative refetch, protected cache, không N+1.

## 6. Facility/Admin

Public Home, Facility List, Facility Detail đã có. Owner Facility
management hiện hành đã có. Admin Facility List/Detail + moderation đã
có với DRAFT/PENDING/ACTIVE/REJECTED/SUSPENDED và
Approve/Reject/Suspend/Activate. Responsive/accessibility/reliability đã
kiểm thử.

## 7. Booking V1 --- compatibility

V1 cũ:
`PENDING_PAYMENT → upload PaymentProof trong 5 phút → PENDING_CONFIRMATION → Owner Confirm/Reject → CONFIRMED/REJECTED`.

Cọc 30%, còn lại 70% tại sân. V1 PaymentProof/private signed
URL/duplicate-submit/unknown-result recovery vẫn phải giữ. Refund là
bảng riêng, UNIQUE booking_id. Không xóa PaymentProof/Refund lịch sử.

## 8. Góp ý GVHD dẫn đến Booking V2

GVHD yêu cầu: 1. Guest chưa login vẫn tìm/xem sân. 2. Tìm sân rảnh theo
ngày + giờ + khu vực; và theo thứ + giờ + khu vực để đặt cố định
tháng/quý. 3. Bỏ upload bằng chứng chuyển khoản. 4. Owner có thống kê
doanh thu/lượt chơi/công suất/trống sân. 5. Đưa Confirm booking ra Owner
Booking List. 6. Tăng tốc xử lý.

Đã chốt: V2 vẫn cọc 30%, không upload proof; hiển thị tài khoản/QR và
nội dung `CLDN <BOOKING_ID>`; giữ slot tối đa 30 phút; Owner kiểm tra
ngân hàng bên ngoài rồi Confirm/Reject; DB time quyết định expiry.

## 9. Booking V2 Phase 1 --- PASS

Additive fields: `booking_flow_version`, `confirmation_expires_at`,
`confirmed_by_user_id`. Flow version chỉ 1/2; V1 deadline NULL; V2 phải
có deadline. Config 30 phút tại
`backend/src/modules/bookings/config.js`. DB clock authoritative.

V2 create trực tiếp PENDING_CONFIRMATION, BookingSlot + CourtSlotLock
atomically. Lazy expiry: `now >= confirmation_expires_at` → EXPIRED +
release lock. Stale hold không chặn create mới. Concurrent create cùng
slot: một 201, một 409 SLOT_UNAVAILABLE. Atomic rollback PASS.
PostgreSQL verification PASS.

## 10. Booking V2 Phase 2 --- PASS

Customer V2 nhận transfer instructions thay vì upload proof. Thiếu
BankAccount → `BANK_ACCOUNT_NOT_CONFIGURED` và rollback sạch.

Transfer reference centralized: `CLDN <BOOKING_ID>`; ví dụ 1256 →
`CLDN 1256`. Backend authoritative cho total/deposit 30%/remaining 70%.

DTO whitelist chứa booking, Facility/Court snapshot, thời gian, amounts,
bank/QR display data, reference, deadline, server time.

Countdown chỉ display theo server time; về 0 thì authoritative refetch.
V2 PaymentProof upload bị backend reject 409
`PAYMENT_PROOF_NOT_ALLOWED_FOR_BOOKING_FLOW` trước storage upload. V1
proof flow vẫn nguyên.

## 11. Booking V2 Phase 3 --- PASS

Confirm API: `POST /api/v1/owner/bookings/:booking_id/confirm`. Reject
yêu cầu reason trim 1--500 Unicode.

Owner chỉ xử lý Facility của mình; cross-owner 404; Customer/Admin không
có OWNER capability 403.

Lifecycle: `PENDING_CONFIRMATION → CONFIRMED | REJECTED | EXPIRED`.

Deadline dùng DB time; quá hạn thì EXPIRED + release lock, không thể
Confirm. Confirm ghi `confirmed_at` DB time + `confirmed_by_user_id`.
Reject ghi `rejected_at` + `rejection_reason`.

Availability: pending V2 = HELD; confirmed = BOOKED; rejected/expired =
AVAILABLE nếu không blocker khác. Architecture hiện hành giữ
CourtSlotLock khi CONFIRMED; reject/expire release lock; BookingSlot
history giữ lại.

Owner Booking List có Quick Confirm/Reject, accessible modal,
deposit/reference/countdown, không optimistic update, không N+1. Action
= 1 POST + 1 authoritative GET.

Reliability: synchronous mutation lock; double click chỉ 1 POST;
409/unknown result không retry mutation mà authoritative GET.
Confirm-vs-Reject/concurrency/deadline PostgreSQL tests PASS.

Booking V2 end-to-end: **PASS**.

## 12. Booking V2 flow hiện tại

Customer chọn Facility/Court/slot → backend kiểm tra availability +
BankAccount + pricing → tạo Booking V2 PENDING_CONFIRMATION + deadline
DB time +30 phút + CourtSlotLock → Customer thấy cọc 30%, còn 70%,
bank/QR, `CLDN <ID>`, countdown → Customer chuyển khoản ngoài hệ thống →
Owner kiểm tra ngân hàng → Confirm hoặc Reject → Confirm thành
CONFIRMED/BOOKED; Reject thành REJECTED/release slot; quá 30 phút thành
EXPIRED/release slot.

Không có automated bank verification, payment gateway hoặc realtime bank
integration; đây là chủ ý MVP.

## 13. Performance đã làm

Frontend Performance Phase 1: route-level code splitting, public
snapshot cache, stale-while-revalidate, StrictMode session dedup,
lazy/async images. Main JS từng giảm khoảng 471.62 kB xuống khoảng 290
kB.

Performance Phase 2: protected in-memory snapshot TTL 30s/max 40; key
gồm User ID + capabilities + exact path; clear khi
logout/account/capability switch; không cache
Availability/CSRF/password/proof URL; background revalidation giữ
last-known-good. Một số duplicate GET Admin đã loại bỏ.

## 14. Performance Phase 3 — PASS

Profiling xác định remote PostgreSQL RTT tái sử dụng khoảng 263–269 ms là
chi phí chính. Public Facility List và Availability đã về một statement/DB
round trip, warm p50 lần lượt khoảng 281 ms và 284 ms; không thêm index,
cache dài hạn hoặc transaction-control round trip đoán mò.

## 15. Guest Search Phase 2 — BACKEND IMPLEMENTED / VERIFIED

Mở rộng public `GET /api/v1/facilities`; không tạo `/facilities/search`.
Giữ `district` là field legacy biểu diễn 94 phường/xã/đặc khu hiện hành,
thêm bộ ba all-or-none `date`, `start_time`, `end_time`. Một Facility chỉ
match khi có ít nhất một ACTIVE Court AVAILABLE trong toàn bộ 1–6 slot
30 phút liên tiếp; không ghép nhiều Court. V1/V2 hold semantics, CourtBlock,
PriceRule và DB time tái sử dụng Availability authoritative.

Implementation phải là một truy vấn PostgreSQL set-based/một DB round trip,
không fan-out Availability, N+1, read-only transaction hoặc mutation. DTO giữ
Facility card whitelist và thêm `matching_courts`; Phase 1 không trả quote.
Guest search không cần auth/CSRF, nhưng Booking vẫn cần auth và luôn recheck
authoritative. Schema/migration không cần; index chỉ xét sau EXPLAIN evidence.
Contract đầy đủ: `docs/specs/GUEST_SEARCH_SPEC.md`. Backend đã implement và kiểm chứng PostgreSQL ngày 2026-10-17; list không interval giữ tương thích, interval DTO thêm `matching_courts`.

## 16. Guest Search Phase 3 — PUBLIC UI IMPLEMENTED / VERIFIED

Home, Facility List và Facility Detail đã tích hợp `district + date + start_time + end_time`; List giữ thêm `q` và pagination trong URL. Interval response bắt buộc strict `matching_courts`; Detail chỉ dùng Court còn tồn tại trong DTO authoritative và gọi Availability cho Court/date đang chọn.

Guest booking intent chỉ giữ trong React/router memory, không storage và không mutation trước login. Login/Register chỉ restore confirmation khi session mới có CUSTOMER capability; ADMIN hoặc destination stale được đưa về landing page hợp lệ. Booking V2 vẫn authoritative recheck giá, slot, lock và deadline; `SLOT_UNAVAILABLE` quay về search context, unknown result không retry mutation. Targeted frontend 137/137, full sequential 386/386, Playwright public desktop/tablet/mobile 3/3, lint/build/health PASS. Recurring/fixed-schedule search vẫn DEFERRED.

## 17. Recurring booking --- phase riêng

GVHD muốn tìm theo thứ + giờ + khu vực để đặt cố định tháng/quý. Phải
chốt trước: - một occurrence bận thì reject cả series hay cho chọn phần
còn lại? - cọc toàn series hay từng occurrence? - Owner confirm series
hay từng occurrence? - cancel/refund series? - deadline? - giới hạn
kỳ? - concurrency nhiều slot?

Không code trước khi chốt business rules.

### Phase 1 audit/design — 17/10/2026

Audit source/schema đề xuất mô hình additive `BookingSeries` + các Booking child hiện hành. Search strict trên mọi weekly occurrence bằng một PostgreSQL query set-based; create atomic all-or-nothing và tiếp tục dùng BookingSlot/CourtSlotLock cho từng child. Draft contract: `docs/specs/RECURRING_BOOKING_SPEC.md`.

Update 2026-10-17: Phase 2 đã chốt business rules, apply migration additive `20261017000000_recurring_booking_foundation`, triển khai recurrence expansion và public strict recurring search backend. Existing Booking/PaymentProof/Refund history giữ nguyên; BookingSeries count 0 sau verification. Local backend 83/83, recurring PostgreSQL 7/7 và related PostgreSQL regression 56/56 PASS; health/public smoke 200. Query dùng một DB round trip, 10 remote samples p50 280.3 ms/p95 282.6 ms; EXPLAIN execution 7.37 ms cho thấy remote RTT chi phối, nên không thêm performance index. Create, series reads/actions/payment/cancellation/refund mutation và frontend vẫn là phase sau. Next recommended phase: atomic series create + locks + expiry + Owner confirm/reject.

Status: **DRAFT / DESIGNED — AWAITING BUSINESS DECISIONS**, chưa implementation. Cần duyệt: (1) limit 93 ngày/14 occurrences, (2) strict all-occurrence/all-or-nothing, (3) một aggregate transfer và Owner series confirmation với shared deadline 30 phút, (4) MVP chỉ cancel từng occurrence. Sau approval mới lập migration/schema plan và UI references.

## 18. Owner Analytics --- sau Booking/Search

Cần: doanh thu ngày/tháng, lượt chơi theo giờ/ngày/thứ/tháng, sân được
đặt nhiều, sân trống, công suất, giờ cao/thấp điểm.

Phải chốt metric semantics trước chart, đặc biệt "doanh thu" vì hệ thống
không tự xác minh ngân hàng; cách xử lý cancelled/refunded; timezone
Việt Nam; V1/V2.

## 19. CI/CD và deployment

Dự án phải deploy công khai. CI/CD đã được bàn nhưng chưa xác nhận hoàn
thiện.

CI dự kiến: install → backend tests → frontend tests → lint → build.\
CD: frontend hosting, backend hosting, env, Prisma migration deploy,
health/smoke, rollback strategy. Không destructive DB command;
production không `db push`.

## 20. Archify/diagrams

Đã cài `tt-a1i/archify` 3.1.0 cho Codex tại
`C:\Users\ACER\.agents\skills\archify`; `archify doctor` PASS.

Đã tạo Backend Architecture: -
`docs/architecture-diagrams/backend-architecture.html` -
`docs/architecture-diagrams/backend-architecture.json` -
finalize/browser-check receipts.

Có thể tiếp tục ERD, Use Case, Sequence, Activity, Booking V2
state/lifecycle, Deployment diagram.

## 21. Logic/thuật toán chính để trình bày báo cáo

Không gọi CRUD đơn giản là thuật toán. Các logic đáng trình bày: 1.
CourtSlotLock + uniqueness/concurrency để chống double booking. 2.
Booking expiry dùng DB time. 3. Availability aggregation từ CourtBlock +
Booking/BookingSlot/lock/lifecycle. 4. Tính total → deposit 30% →
remaining 70% ở backend. 5. Deterministic transfer reference
`CLDN <BOOKING_ID>`. 6. Owner ownership/authorization. 7.
Transaction-safe state transition: create-vs-create, confirm-vs-reject,
expiry boundary.

Nếu cần chỉ đúng file code, phải audit source hiện tại trước; không đoán
đường dẫn.

## 22. Reliability/Security conventions

Frontend: AbortController, generation guard, stale-response protection,
StrictMode safety, strict response validation, synchronous mutation
lock, malformed 2xx fail closed, unknown result/409 → authoritative GET,
không auto-retry mutation, snapshot isolation.

Backend: auth/session, capability + ownership, Origin/CSRF mutation
protection, strict validation, DB authoritative time, Prisma
transaction, atomic rollback, DTO whitelist.

Không expose password_hash, google_subject, session/reset token, DB
credentials, internal storage keys/raw Prisma object. Không tin
role/capabilities/owner_id/status/confirmed_by/timestamps/amount từ
client.

## 23. Test status gần nhất

Guest Search Phase 3: targeted frontend 137/137 PASS; full frontend tuần tự 386/386 PASS; Playwright public desktop/tablet/mobile 3/3 PASS; lint/build/health PASS. Authenticated Playwright booking-intent không chạy vì login sẽ tạo session record; intent/capability/role-switch được kiểm chứng bằng component regression, không mutation demo data.

Booking V2 Phase 3: - Backend local 74/74 PASS - Booking V2 PostgreSQL
14/14 PASS - Payment V1 PostgreSQL 22/22 PASS - Frontend targeted 51/51
PASS - Owner Payment 39/39 PASS - Full frontend 381/381 PASS tuần tự -
Lint PASS - Build PASS - Health 200 - Public Facility API 200 - git diff
--check PASS, chỉ warning LF/CRLF Windows

Playwright Phase 3 không chạy mutation vì chưa có isolated runtime V2
fixture an toàn; PostgreSQL integration là correctness evidence thật.

## 24. Tài liệu quan trọng

`README.md`, `AGENTS.md`, `docs/PROJECT_OVERVIEW.md`,
`docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API_SPEC.md`,
`docs/FEATURE_STATUS.md`, `docs/UI_UX_SPEC.md`,
`docs/specs/AUTH_SPEC.md`, `docs/specs/BOOKING_SPEC.md`,
`docs/specs/PAYMENT_SPEC.md`, performance reviews và architecture
diagrams.

Trước phase mới: đọc FEATURE_STATUS + spec liên quan + source. Nếu
docs/source drift, source/runtime evidence là hiện trạng rồi cập nhật
docs.

## 25. Những thứ chưa ưu tiên

Đổi email, avatar, Google linking, account deletion, realtime/WebSocket,
bank API, payment gateway, automated bank verification, mobile app,
Supabase Auth/Realtime, microservices, Redis không evidence, index hàng
loạt, rewrite V1, xóa PaymentProof/Refund history.

## 26. Roadmap

A. Recurring search/booking theo thứ + tháng/quý.\
B. Owner Analytics.\
C. Remaining UX/notification nếu thật sự cần.\
D. CI/CD + production deployment.\
E. Final thesis/demo hardening: demo data, 3-role script, screenshots,
diagrams, report, performance/deployment evidence, rehearsal.

## 27. Demo 3 vai trò dự kiến

Guest: Home → search/xem Facility → detail → chọn đặt → login nếu cần.

Customer: Login → Profile → search → Court/slot → Booking V2 → cọc 30% +
bank/QR + `CLDN <ID>` → chờ Owner → CONFIRMED/history → Owner Request.

Owner: Login → workspace → Facility/Court config → Booking List → kiểm
tra bank → Quick Confirm/Reject → Detail → sau này Analytics.

Admin: Login → Admin workspace → Owner Requests → Approve/Reject →
Facility moderation → Amenity management → Profile.

## 28. Quy tắc viết prompt Codex

Mỗi prompt nên: audit trước; scope rõ; nêu điều cấm; không đổi business
rule; không mutate demo; isolated fixtures; PostgreSQL integration cho
concurrency; strict validation; unknown-result recovery; no auto retry
mutation; StrictMode safety; no N+1; measurement nếu performance; docs
update; full regression; report PASS/FAIL có evidence.

Không chấp nhận PASS nếu mục bắt buộc chưa chứng minh.

## 29. MASTER INSTRUCTION CHO CHATGPT/CODEX MỚI

Hãy coi toàn bộ tài liệu này là project context hiện tại và không bắt
tôi giải thích lại từ đầu.

Trước mỗi phase: 1. Tóm tắt trạng thái liên quan. 2. Kiểm tra
dependency/business logic. 3. Chỉ ra rủi ro. 4. Chọn scope nhỏ nhất hợp
lý. 5. Viết prompt Codex chi tiết khi tôi yêu cầu. 6. Khi tôi gửi report
Codex, phân tích report trước khi chuyển phase. 7. Report FAIL → không
nhảy phase. 8. Report PASS → xác định bước tiếp theo.

Ưu tiên dự án 1 người, thời gian ngắn, dễ demo, correctness,
performance, security, maintainability và tránh overengineering. Trao
đổi bằng tiếng Việt; giải thích kỹ thuật bằng ví dụ của chính dự án.

### Việc cần làm ngay khi tiếp tục

**Chốt specification cho Recurring Search/Booking trước implementation.**

Guest/Public Search một ngày đã hoàn tất. Phase tiếp theo phải quyết định semantics series, cọc, Owner confirmation, cancellation/refund, deadline, giới hạn kỳ và concurrency trước khi code.

### Nguyên tắc cuối

Không rewrite một hệ thống đang chạy chỉ vì có cách "đẹp hơn". Dự án đã
có schema thật, dữ liệu lịch sử, V1 compatibility, Booking V2
end-to-end, PostgreSQL concurrency evidence, regression tests lớn và
nhiều UI hoàn thiện. Mọi thay đổi tiếp theo phải tiến hóa từ nền hiện
tại, không xây lại từ đầu.

## Update 2026-10-17 — Recurring Booking Phase 3

Backend Phase 3 đã hoàn tất: atomic recurring create, Customer/Owner Series reads, exact shared 30-minute lazy expiry và Owner confirm/reject cả series. Transaction tạo Series + Booking V2 children + BookingSlots + CourtSlotLocks all-or-nothing; tiền child-first, snapshot bank/QR, reference `CLDNS <SERIES_ID>`. PostgreSQL đã kiểm chứng create/create, partial overlap, single Booking versus Series, confirm/reject và rollback; không N+1 theo occurrence. Local 86/86, Phase3 13/13 và regression Booking V2 14/14, Booking 19/19, Search 7/7, Availability 6/6, Payment 22/22 PASS; cleanup PASS. Không đổi schema/migration và baseline demo cùng Booking #1119 giữ nguyên. Frontend, recurring PaymentProof, cancellation/refund, cancel future/whole series vẫn deferred. Next recommended phase: Recurring Booking Phase 4 frontend sau approved UI references.

## Update 2026-10-17 — Recurring Booking Phase 4

Customer/Owner frontend đã hoàn tất trên backend Phase 3. Public `/facilities` có mode **Đặt lịch cố định**, URL-backed strict search và per-Court action. Guest intent đi qua Login/Register bằng router memory; return path chỉ hợp lệ với CUSTOMER capability. Confirmation POST đúng sáu intent fields, synchronous lock, không retry mutation; `SLOT_UNAVAILABLE` yêu cầu tìm lại và unknown result quay về authoritative Series list.

Customer routes: `/booking-series`, `/booking-series/:series_id`, `/facilities/:facility_id/recurring-confirm`. Detail hiển thị aggregate 30/70, bank/signed QR, copy controls, `CLDNS <SERIES_ID>` và DB-time countdown; không có PaymentProof. Owner routes: `/owner/booking-series`, `/owner/booking-series/:series_id`; list không N+1 và có quick confirm/reject, detail hiển thị ordered occurrences. Action dùng AccessibleModal, trim reason 1–500, một POST rồi authoritative refetch cho success/409/unknown.

Strict response validation, cache identity/capability/path isolation, AbortController, stale-generation guard và last-known-good snapshot được giữ. Targeted recurring/Owner **48/48**, full sequential frontend **395/395**, Playwright read-only desktop/tablet/mobile **3/3**, lint/build/diff PASS. Screenshot files là candidates chưa approved. Không sửa backend/schema/migration/database/demo data; Booking #1119 không đổi. Known limitations: chưa recurring PaymentProof, occurrence cancellation/refund UI, cancel-future/whole-series hoặc analytics. Next recommended phase: runtime screenshot review rồi chốt occurrence-level cancellation/refund nếu MVP cần.

## Update 2026-10-17 — Public Recurring Search visual redesign

Recurring Search tại `/facilities?mode=recurring` được tổ chức lại thành segmented mode selector, grouped date/time search panel, compact constraint guidance và các initial/empty/error/result states rõ ràng. `FacilityList.jsx`, `facilities.css`, recurring component/E2E tests và current-state docs được cập nhật; FacilityCard, `matching_courts`, URL state, validation, booking intent và API contract giữ nguyên. Targeted **20/20**, full frontend **402/402**, responsive Playwright **3/3**, lint/build PASS. Bốn `recurring-search-*-redesign-*.png` là review candidates. Business logic/backend/database/schema/migration/demo data/Booking #1119 không thay đổi.
## Owner Analytics Phase 1 — audit/specification (2026-10-17)

Recurring Booking Phase 4 passed and the Recurring Booking MVP is closed for its approved scope. Owner Analytics Phase 1 then audited actual schema/source across Booking V1, Booking V2, recurring child Bookings, slots, confirmation, PaymentProof, Refund, Facility/Court configuration, and CourtBlock. The approved specification is `docs/specs/OWNER_ANALYTICS_SPEC.md`.

Analytics counts each child `Booking` as one occurrence and never counts `BookingSeries` as a play. Primary MVP metrics are confirmed booking value/count, confirmed hours, known confirmed deposit minus Customer-confirmed refunded deposit, and current-configuration slot utilization. `total_amount` is not actual received revenue because the remaining 70% paid at the venue has no authoritative ledger. `COMPLETED` is the strongest play proxy, but the current application source lacks the documented completion mutation, so UI must say “buổi đã hoàn thành” and must not claim complete actual attendance.

Recommended backend contract: protected `GET /api/v1/owner/analytics/overview` and paginated `/owner/analytics/courts`, local `from`/`to` in `Asia/Ho_Chi_Minh`, optional ownership-checked `facility_id`, maximum 366 inclusive days, aggregate-only strict DTO. Query strategy is two parallel set-based PostgreSQL statements for overview and one bounded Court query; no transaction, Node reduction, N+1, materialized view, analytics table, index, or migration in Phase 1. A read-only development profile found 47 Bookings/140 BookingSlots and representative monthly aggregation execution of 4.163 ms; final Phase 2 queries still require EXPLAIN evidence before any index proposal.

Security: ACTIVE OWNER session, ownership scoped from session, cross-owner Facility as 404, exact query whitelist/range limits, no Customer PII, bank/proof identifiers, signed assets, locks, or private paths. Known limitations are no authoritative 70% receipt, incomplete completion/check-in coverage, and no historical Facility-hours/Court-status configuration. Next phase: Owner Analytics Phase 2 backend aggregation API.

## Update 2026-10-17 — Owner Analytics Phase 2

Backend Phase 2 is implemented at protected `GET /api/v1/owner/analytics/overview` and `GET /api/v1/owner/analytics/courts`. ACTIVE OWNER identity is session-derived; all facts scope through owned Facility/Court and a foreign `facility_id` returns 404. Booking children are occurrence facts across V1, V2 and recurring Series. CONFIRMED/COMPLETED determine count/value/occupied slots; confirmed deposit evidence and only `Refund.status=REFUNDED` remain distinct from actual revenue.

Overview executes two safe parameterized, set-based PostgreSQL statements in parallel; Court performance executes one aggregate statement. There is no read transaction, Node row reduction, N+1, cache, analytics table, schema change, migration, or index. Final 30-day plans measured facts/capacity/Court execution at 0.769/214.917/165.05 ms with zero disk reads. Ten sequential remote samples produced overview p50/p95 1087.52/2602.85 ms and Court p50/p95 450.01/483.36 ms; hosted network variability dominates the overview tail.

Local/query-budget **6/6 PASS** and real PostgreSQL Analytics integration **5/5 PASS** cover strict range/pagination, seven Booking states, one recurring child, exact money, Refund PENDING/PROOF_SUBMITTED/REFUNDED, UTC-to-Vietnam boundary, half-hour usage, CourtBlock, zero capacity, deterministic pagination and cross-owner isolation. `TEST_ANALYTICS_` fixtures were cleaned. Known limitations: no authoritative remaining-70% ledger, incomplete completion/check-in adoption, capacity uses current configuration for historical dates, and the two parallel reads accept a small snapshot boundary. Next phase: Owner Analytics Phase 3 Owner Dashboard UI.

## Update 2026-10-17 — Recurring Booking Phase 5A cancellation/refund audit

Phase 5A đã audit source/schema/tests và chốt `docs/specs/RECURRING_CANCELLATION_REFUND_SPEC.md`; chưa implementation hoặc database mutation. Scope kế tiếp là Customer hủy đúng một child `CONFIRMED` trong Series `CONFIRMED`. Parent Series giữ initial status, sibling không đổi, BookingSlot giữ history, chỉ child locks được nhả và Refund child bắt đầu `PENDING` bằng đúng `child.deposit_amount`.

API khuyến nghị: `POST /api/v1/booking-series/:series_id/occurrences/:booking_id/cancel`, CUSTOMER ownership, Origin/CSRF, DB-time cutoff (`now < deadline`; bằng deadline là quá hạn), lock order Users tăng dần → Facility → Court → BookingSeries → child Booking → PaymentProof/Refund. Không cần schema/migration.

Source gap cho Phase 5B: cancellation V1 và Refund invariant hiện bắt buộc PaymentProof APPROVED, còn recurring V2 cố ý không có PaymentProof. Phase 5B phải mở guard hẹp cho confirmed recurring V2 evidence mà không làm yếu V1. Frontend validator hiện còn bắt mọi child status bằng Series status nên phải hỗ trợ mixed children. Cancel future/whole series, Owner occurrence cancellation và Series Refund vẫn deferred.

## Update 2026-10-17 — Recurring Booking Phase 5B backend

Backend occurrence cancellation đã hoàn tất tại `POST /api/v1/booking-series/:series_id/occurrences/:booking_id/cancel`. Transaction khóa Users tăng dần → Facility → Court → Series → target child → PaymentProof/Refund, dùng DB time/cutoff snapshot, chỉ hủy child và nhả child locks, giữ BookingSlots, tạo Refund PENDING đúng child deposit. Series/siblings không đổi. Refund invariant phân biệt legacy V1 proof evidence và confirmed recurring V2 evidence; arbitrary single V2 vẫn fail closed. Series detail DTO hỗ trợ mixed children, cancellation advice/metadata và Refund summary.

Evidence hiện có: backend local **93/93 PASS**, recurring PostgreSQL **14/14 PASS** (same-child concurrency, membership/ownership, child isolation, Refund read; cleanup PASS), recurring frontend strict-contract **9/9 PASS**, lint/build/diff/health PASS. Full frontend run gặp native memory-allocation failure và các PostgreSQL regression còn lại chưa chạy trong lượt này, nên Phase 5B verification tổng thể còn PARTIAL. Không schema/migration/seed/demo mutation; Booking #1119 không được dùng. Chỉ chuyển Phase 5C sau khi đóng regression còn thiếu.

## Update 2026-10-18 — Recurring Booking Phase 5B.1 verification closure

Phase 5B hiện **PASS**. Dedicated PostgreSQL evidence đã đóng các gap: cutoff before/exact/after dùng DB-returned deterministic clock; failure injection sau Refund insert rollback toàn bộ; cancel/cancel; concurrent cancel hai child khác nhau; lock identity/sibling isolation; exact child-deposit amount; Availability sau commit; và Refund lifecycle hiện hành `PENDING -> PROOF_SUBMITTED -> REFUNDED` với private signed proof. V1 proof guard và standalone V2 fail-closed được giữ.

Evidence: local **93/93**; recurring PostgreSQL **17/17**; Recurring Search **7/7**; Guest Search **5/5**; Public **9/9**; Availability **6/6**; Booking V2 **14/14**; Booking V1 **19/19**; Payment/Refund **22/22**; Owner Analytics **5/5**; cleanup PASS. Frontend targeted **9/9**, full sequential **402/402**, lint/build/diff và health/public/guest/recurring smoke PASS. Runtime sau cleanup: 48 Booking, 35 PaymentProof, 9 Refund, 141 BookingSlot, 66 CourtSlotLock, 0 BookingSeries. Booking #1119 vẫn `CANCELLED`, PaymentProof `APPROVED`, Refund `REFUNDED`, 2 slots, 0 locks, snapshots 80.000/24.000/56.000. Không schema/migration/seed/demo mutation. Phase 5C Customer UI có thể bắt đầu riêng; bulk/future-series cancellation vẫn deferred.

## Update 2026-10-18 — Recurring Booking Phase 5C Customer UI

Customer Series Detail đã hoàn tất hủy đúng một occurrence theo advisory fields của backend Phase 5B. Modal accessible hiển thị đúng child/date/time/Court/deposit, POST body rỗng, synchronous lock chống double submit, không optimistic update và không retry mutation. Success/409/unknown đều dựa vào authoritative Series refetch; nếu chưa xác minh được, các action hủy khóa fail-closed. Series tiếp tục `CONFIRMED`, sibling không đổi.

Cancelled child hiển thị Refund `PENDING -> PROOF_SUBMITTED -> REFUNDED`; proof private chỉ tải khi Customer chủ động mở và acknowledgement tái sử dụng flow theo `refund_id`. Validator kiểm tra chặt state/timestamps, child/refund identity và refund amount bằng child deposit. Targeted recurring frontend **15/15**, full sequential **408/408**, lint/build PASS. Không đổi backend/database/schema/migration, không seed/mutate demo data hoặc Booking #1119. Whole/future/bulk cancellation, Series Refund và recurring PaymentProof vẫn deferred.

## Update 2026-10-18 — Owner Analytics Phase 4 closure

Authenticated runtime verification now passes through the real Login UI with an isolated `TEST_E2E_OWNER_ANALYTICS_` PostgreSQL fixture. Desktop/tablet/mobile Playwright is **4/4 PASS**: initial load performs exactly one Overview and one Courts GET in parallel, pagination only reloads Courts, filters reload both with HTTP 200, navigation/URL/active state and protected snapshot revisit work, and no unexpected console/page/network error or horizontal overflow remains. The measured desktop initial data-visible time was 6.546 s on the hosted development database; Overview/Courts completed in 4.282/3.792 s in that sample, while the cached revisit was visible in 141 ms.

Phase 4 fixed strict-contract drift by removing undocumented Courts `meta.total_pages` and fixed duplicate StrictMode initial reads in the shared Owner read hook without weakening abort, generation, cache, auth, or role isolation. Backend local **93/93**, Analytics PostgreSQL **5/5**, frontend Analytics **6/6**, full frontend **409/409**, lint/build/Prisma/health/diff all pass. Three `owner-analytics-*` screenshots are review candidates. Fixture/session/credential cleanup verified zero remaining rows; Booking #1119 is unchanged. Owner Analytics MVP is closed. Next recommended phase: **FINAL PROJECT STABILIZATION**.
