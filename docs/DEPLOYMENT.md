# Production Deployment Runbook

## Release assumptions

The production topology for this MVP is one React/Vite static deployment, one Node/Express backend instance, and the existing Supabase PostgreSQL database. The hosting providers and public domain are not selected yet. Do not set Express `trust proxy` until the actual proxy hop topology is known.

Production single-booking creation uses Booking V2. Existing V1 records remain readable and keep their historical behavior. Recurring children continue to use Booking V2.

## Environment contract

Never commit real values. Store backend variables in the server platform and `VITE_API_BASE_URL` in the frontend build environment.

### Backend required in production

| Variable | Contract |
| --- | --- |
| `NODE_ENV` | Must be `production`. |
| `FRONTEND_URL` | Exact HTTPS frontend origin, without a trailing slash. Used by CORS and Origin checks. |
| `BOOKING_FLOW_VERSION` | Must be explicitly set to `2`. Missing or invalid values fail startup. |
| `DATABASE_URL` | PostgreSQL runtime connection, server-side only. |
| `DATABASE_CA_PATH` | Path to the trusted PostgreSQL CA. Defaults to `certs/supabase-ca.crt`; the file must exist in the runtime image. TLS verification remains enabled. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account identifier for public Facility images and authenticated private assets. |
| `CLOUDINARY_API_KEY` | Cloudinary credential, server-side only. |
| `CLOUDINARY_API_SECRET` | Cloudinary credential, server-side only. |
| `RESEND_API_KEY` | Required when Forgot Password email is enabled. |
| `EMAIL_FROM` | Verified production sender address. `resend.dev` is rejected in production. |

`PORT` is optional and defaults to `3000`; use the port supplied by the hosting platform. `DIRECT_URL` is optional and is used only by Prisma CLI when the runtime URL is unsuitable for migration commands.

The application has no `SESSION_SECRET`: session tokens are random opaque values and only their hashes are persisted. Cookie settings are code-managed: HttpOnly, SameSite=Lax, Path=/, and Secure in production. Frontend and backend must therefore use compatible HTTPS sites; the frontend sends `credentials: include`.

### Frontend build requirement

| Variable | Contract |
| --- | --- |
| `VITE_API_BASE_URL` | Public HTTPS API base ending in `/api/v1`. It is not a secret. |

### Development/demo only

`DEMO_SEED_CONFIRM`, `DEMO_SEED_TARGET_FINGERPRINT`, `DEMO_OWNER_PASSWORD`, `DEMO_CUSTOMER_PASSWORD`, and `DEMO_ADMIN_PASSWORD` must not be present in production.

### Test/E2E only

`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_CUSTOMER_EMAIL`, `E2E_CUSTOMER_PASSWORD`, `E2E_OWNER_EMAIL`, and `E2E_OWNER_PASSWORD` belong only in ignored local or CI secret storage. Do not commit Playwright auth state.

## Build and start

Use the Node/npm versions selected for the release image and perform clean installs from lockfiles.

```text
cd backend
npm ci
npx prisma generate
npm start
```

```text
cd frontend
npm ci
npm run build
```

Serve `frontend/dist` as a static SPA with fallback to `index.html`. Do not use `vite preview` as the production server.

## Database migration procedure

1. Confirm the target database, approved release commit, backup status, and migration files.
2. Run `npx prisma migrate status` with the production migration connection.
3. Apply reviewed migrations with `npx prisma migrate deploy`.
4. Run `npx prisma migrate status` again.
5. Start the backend and require readiness plus public smoke tests before routing traffic.

Never use `prisma migrate dev`, `prisma db push`, or `prisma migrate reset` in production. Prisma does not provide automatic down migrations. No migration is added by Stabilization Phase 2.

## Health and readiness

- `GET /api/v1/health` is process liveness and does not access PostgreSQL.
- `GET /api/v1/ready` performs a bounded lightweight PostgreSQL check. It returns HTTP 200 when ready and a generic HTTP 503 without database details otherwise.

Configure the platform liveness probe against `/health` and the readiness/traffic gate against `/ready`.

## HTTPS, proxy, CORS, and rate limiting

Terminate TLS at the selected platform and forward only trusted traffic to the backend. `FRONTEND_URL` must match the browser Origin exactly. Do not use wildcard credentialed CORS.

The application currently does not enable Express `trust proxy`. Before deployment behind a proxy, document the exact trusted hop count or subnet and add a separately tested configuration. Do not set `trust proxy=true` globally. Until then, deploy one backend instance with a direct platform ingress.

Auth rate limits are process-local memory. This is an accepted single-instance MVP limitation: restart resets counters and multiple instances would not share limits. Multi-instance deployment requires a shared limiter design in a later approved phase.

## Storage and email

Facility images use public Cloudinary delivery. Payment, bank QR, and refund proofs use authenticated/private delivery and short-lived signed URLs. Never expose stored private identifiers in public DTOs or logs. Confirm production Cloudinary credentials and signed delivery before go-live.

Forgot Password requires a verified Resend sender and an HTTPS `FRONTEND_URL`. Run only one controlled delivery smoke against an approved recipient during staging rehearsal.

## Backup and restore

Before migration or production release, obtain a Supabase backup appropriate to the plan and record its timestamp/identifier outside the repository. Define retention, RPO, and RTO with the deployment owner.

### Backup procedure

Backup and restore are operational tasks, never application migrations. Run them only with native PostgreSQL tooling (`pg_dump`, `pg_restore`, and `psql`) from a controlled operator workstation or CI runner. The required secrets stay in the operator environment and must never be printed, placed in a command history artifact, or committed.

1. Capture a read-only source fingerprint: the configured safe database fingerprint, `current_database()`, schema name, server version, applied migration names, and agreed non-PII table counts.
2. Create a complete custom-format native backup with `pg_dump`; store the artifact outside the repository in encrypted operator-controlled storage.
3. Verify the artifact has non-zero size and that `pg_restore --list` can read it before any restore attempt.
4. Record the backup timestamp, tool version, artifact location/retention reference, and source fingerprint outside Git. RPO/RTO remain deployment-owner decisions until a provider and topology are approved.

### Restore safety guard and rehearsal

Restore has not yet been rehearsed. A rehearsal is valid only when the target is a disposable, isolated PostgreSQL database. It must never be the development source, production database, or an ambiguous shared database.

Before restore, the operator must capture fingerprints from both endpoints and fail closed unless all are true:

- Source and target connection identities/fingerprints differ.
- The target is explicitly designated disposable and non-production.
- The target can be safely recreated by the target owner.
- The backup source is read-only for the rehearsal.
- No backup artifact, target URL, password, session value, private storage identifier, or dump is written to Git.

Restore with `pg_restore` into the isolated target and do not substitute `prisma migrate`, `db push`, `migrate reset`, seed, or ad-hoc fixture writes for an actual restore. Restore errors, ownership errors, and extension/privilege failures are release evidence and must not be ignored.

### Post-restore verification

On the restored target only, compare applied Prisma migrations, expected schemas/tables/constraints/indexes, and non-PII counts for `users`, `facilities`, `courts`, `bookings`, `booking_slots`, `court_slot_locks`, `booking_series`, `payment_proofs`, `refunds`, `owner_requests`, and `amenities`. Verify historical Booking #1119 without exposing Customer PII: status, proof/refund status, slot count, lock count, and monetary snapshots must match the source snapshot.

Then use Prisma only for `validate`, `migrate status`, and a read-only connection check against the isolated target. A temporary backend may point only to that target and may execute only health, readiness, Public Facility, Guest Search, and Recurring Search GET smoke checks. Do not run authenticated mutations, seeds, or cleanup against the source database.

Cleanup may remove only the explicitly disposable restore target after verification. Retain or delete the temporary backup according to the operator retention policy; never commit it. Application rollback remains a redeploy of a prior immutable application artifact and is not equivalent to database restore.

### Phase 4B evidence (2026-10-20)

The application-schema restore portion was rehearsed with PostgreSQL native clients 17.11. A custom-format public-schema archive was validated completely with `pg_restore --list` (exit 0), was non-empty (140,941 bytes), and had SHA-256 `0BD539842C93AF9D7D9708A32A3D6B03B637768B787C423601713961F5CB5B86`. Its TOC contained the expected application objects and no `auth`, `storage`, `realtime`, or `vault` schemas. The artifact remains outside Git in operator-controlled backup storage.

Read-only source evidence was PostgreSQL 17.6, database `postgres`, schema `public`, and migrations `20260922000000_init`, `20261015000000_booking_v2_foundation`, and `20261017000000_recurring_booking_foundation`. A distinct empty loopback PostgreSQL 17.11 rehearsal database was guarded before restore. `pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error` completed with exit 0 and no output warnings. The restored target matched source migration history, 26 public tables, 26 primary keys, 42 foreign keys, 284 checks, 75 indexes, agreed data counts, and Booking #1119's non-PII snapshot. A second read-only source fingerprint matched the pre-backup snapshot; no source mutation, migration, seed, or demo-data change occurred.

Prisma schema validation and client generation passed. The local target server had TLS disabled, while the application's runtime PostgreSQL adapter requires a trusted CA with certificate verification and receives its password from `DATABASE_URL`, not the native client credential file. The backend/Prisma connectivity and HTTP smoke portion was therefore not run against that target; no TLS verification was weakened to force it. The restored target is retained temporarily only for completing that remaining local-TLS rehearsal. This evidence is **partial**, not a production restore gate closure.

## Rollback

Application rollback means redeploying the previous known-good immutable frontend/backend artifacts with their documented environment contract. Keep the preceding artifact and release commit available.

Database rollback is separate. Prisma migrations have no assumed automatic down path. Current migrations are additive, so the preferred strategy is forward compatibility plus application rollback. Any future destructive migration requires an explicit recovery SQL/restore plan and a verified backup before approval.

If a release fails after migration, stop traffic, assess schema compatibility, redeploy the compatible previous application when safe, or restore into a controlled recovery environment. Do not edit applied migration files.

## Logging and monitoring

Capture structured platform request/error logs without credentials, session/reset tokens, proof identifiers, or database URLs. Configure uptime probes for liveness and readiness, HTTP 5xx alerting, process restart alerts, database connection saturation, and Cloudinary/Resend error monitoring. Retention and alert recipients must be decided before production.

## Release smoke checklist

1. `/api/v1/health` returns 200.
2. `/api/v1/ready` returns 200.
3. Public Facility list/detail, one-time Guest Search, and Recurring Search return valid strict DTOs.
4. Authoritative session bootstrap works with Secure cookies and credentialed CORS.
5. Isolated Customer creates a Booking V2 and sees transfer reference `CLDN <BOOKING_ID>`.
6. Isolated Owner can confirm/reject only owned records.
7. Admin protected navigation and implemented moderation routes load.
8. Private proof URLs require authorization and expire as designed.
9. No unexpected browser console/network error or horizontal overflow occurs in the release viewports.
10. All isolated fixtures and sessions are cleaned.

Production deployment remains blocked until the release baseline, provider topology, environment values, backup/restore rehearsal, monitoring, and Phase 3 authenticated release rehearsal are approved.
