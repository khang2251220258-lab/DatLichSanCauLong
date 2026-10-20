# Deployment topology decision

**Status:** DESIGN READY, not provisioned or deployed
**Decision date:** 2026-10-20
**Scope:** topology, environment ownership, staging and future CD. This document does not create provider resources, DNS records, secrets, a deployment workflow, or an application-code change.

## Requirements established by the application

The application is a React/Vite SPA, a Node.js/Express API and Prisma PostgreSQL client. The SPA builds from `frontend` with `npm ci && npm run build`, publishes `frontend/dist`, and needs an SPA fallback to `index.html`. Its only browser deployment variable is the non-secret `VITE_API_BASE_URL`.

The backend starts from `backend` with `npm ci`, `npx prisma generate` and `npm start`. It accepts platform `PORT`, requires an explicit HTTPS `FRONTEND_URL` and `BOOKING_FLOW_VERSION=2` in production, and exposes `GET /api/v1/health` (liveness) plus `GET /api/v1/ready` (bounded PostgreSQL check). Local files are not runtime state: public Facility images and private proofs/QR use Cloudinary; email uses Resend.

Sessions, booking locks and business snapshots are PostgreSQL-backed. There are no workers, scheduled jobs, WebSockets, process-local booking state, local cache, or sticky-session requirement. The authentication rate limiter is process-local memory, so this MVP requires **one backend instance**. Restarting resets its buckets; multiple instances would weaken it until a shared-limiter design is approved.

The Prisma runtime adapter permits at most five PostgreSQL connections per backend instance and requires the tracked Supabase CA with `rejectUnauthorized: true`. The backend image must include `certs/supabase-ca.crt`; TLS must never be weakened.

## Cookie, CORS and origin model

`booking_session` is `HttpOnly`, `Secure` in production, `SameSite=Lax`, host-only and `Path=/`. React uses credentialed fetch. CORS permits exactly `FRONTEND_URL`, and every mutation additionally requires that exact `Origin` plus the session CSRF token.

The selected hostname model is:

```text
https://app.<registered-domain>       React SPA
https://api.<registered-domain>       Express API
```

Those are different origins but the same schemeful site. The browser can send the host-only API cookie to `api.<registered-domain>` while the API admits only `https://app.<registered-domain>`. No cookie `Domain` attribute is needed.

Unrelated provider hostnames such as `*.pages.dev` and `*.fly.dev` are public-preview-only. They cannot support authenticated staging or production under the current `SameSite=Lax` policy, because cross-site credentialed fetch does not carry that cookie. This project will not change to `SameSite=None` merely to fit provider preview URLs.

## Primary topology

| Layer | Selected design | Reason |
| --- | --- | --- |
| Frontend | Cloudflare Pages static site, global CDN, custom `app` subdomain | Native fit for Vite output, HTTPS and SPA routes without an application process. |
| Backend | One Fly.io Node/Express Machine in Sydney (`syd`), no volume, no auto-stop for release operation | Closest practical candidate to the current Supabase `ap-southeast-2` database region. One long-lived instance matches the limiter constraint. |
| Database | Supabase PostgreSQL | Existing managed database; the browser never connects directly. |
| Media/email | Existing Cloudinary and Resend accounts | Already integrated; no provider filesystem dependency. |

Cloudflare Pages documents SPA serving and custom domains. Fly.io documents managed TLS, health checks and regional Machines; Sydney availability must be confirmed from the provider's live region command when resources are provisioned. This remains a small two-service topology, not a cluster or microservice platform.

Cloudflare terminates SPA TLS. Fly terminates API TLS and forwards to the single Machine. PostgreSQL remains CA-verified TLS from API to Supabase. The current Node listener uses the supplied port and must be proven reachable on the provider during the first staging deployment, rather than changed speculatively.

### Trust-proxy staging gate

The application does not set Express `trust proxy`. Secure-cookie issuance does not depend on `req.secure`, but the auth limiter derives IP-based limits from `req.ip`. A blind `trust proxy=true` could make a spoofed forwarding header authoritative. Keep it disabled until staging captures the Fly proxy/header chain and a narrow provider-specific trust rule is reviewed and tested. Until then, deployment is possible but client-IP rate-limit quality is not release-ready. This is a high staging gate, not permission to disable rate limiting.

## Fallback topology

Use **Render Static Site plus one Render Web Service in Singapore** only if Fly Sydney is unavailable at provisioning time or the owner chooses provider-native Git deployment over database proximity. Render supports Node 24 selection, Git deploys, custom domains, HTTP health checks, logs and rollback. It still requires same-site custom domains (`app.<registered-domain>` and `api.<registered-domain>`). Its free web tier spins down after 15 minutes idle and can take about one minute to return, so it is preview/demo-capable but not the preferred final thesis demonstration. It is farther from the Sydney database.

## Staging and production separation

### Staging

- Frontend: `https://staging.app.<registered-domain>` on Cloudflare Pages.
- Backend: `https://staging.api.<registered-domain>` on one Fly Machine in Sydney.
- Database: a **separate Supabase staging project** in the same region where available, never the development or future production project.
- Runtime: `NODE_ENV=production`, explicit `BOOKING_FLOW_VERSION=2`, exact staging frontend origin and staging-only Cloudinary/Resend credentials where exercised.
- Data: staging-owned accounts/fixtures only. Reset through a documented staging restore/reseed procedure, never production data or credentials.

### Production

- Frontend: `https://app.<registered-domain>` on Cloudflare Pages.
- Backend: `https://api.<registered-domain>` on exactly one Fly Machine in Sydney.
- Database: a separate Supabase production project with verified TLS and operator-owned backups.
- Runtime: `BOOKING_FLOW_VERSION=2`; new single and recurring bookings use V2 while historical V1 records retain documented behavior.

## Environment ownership

Never place values in Git, Vite output, build logs, or this document.

| Variable | Backend staging/production | Frontend build | Secret | Notes |
| --- | --- | --- | --- | --- |
| `PORT` | required from platform | no | no | Express must honor it. |
| `NODE_ENV` | required: `production` | no | no | Staging uses production behavior. |
| `FRONTEND_URL` | required | no | no | Exact environment-specific app origin. |
| `BOOKING_FLOW_VERSION` | required: `2` | no | no | Production startup fails closed if absent. |
| `DATABASE_URL` | required | no | yes | Unique per environment. |
| `DATABASE_CA_PATH` | required/default tracked path | no | no | CA file must exist in the image. |
| `DIRECT_URL` | optional, migration operator only | no | yes | Never browser-visible. |
| `CLOUDINARY_CLOUD_NAME` | required for asset functions | no | no | Environment-specific setting. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | required for asset functions | no | yes | Server-side only. |
| `RESEND_API_KEY` | required when reset email enabled | no | yes | Server-side only. |
| `EMAIL_FROM` | required with Resend | no | no | Verified sender for the environment. |
| `VITE_API_BASE_URL` | no | required | no | HTTPS base ending in `/api/v1`; baked at build. |
| `E2E_*`, `DEMO_*` | no | no | yes | Never provision to runtime. |

Provider secrets belong to the owner. Future GitHub deployment credentials must be separate protected environment secrets, least-privilege, and scoped to staging or production.

## Migration ownership and future CD

The first release keeps migrations as a **manual, protected operator gate**: verify target/backup/commit, run `npx prisma migrate status`, run reviewed `npx prisma migrate deploy`, run status again, then deploy and require health/readiness/public smoke. Never use `prisma migrate dev`, `prisma db push` or `prisma migrate reset` in staging or production.

For the empty Supabase staging initialization gate, run `scripts/staging-migrate.ps1` from an operator PowerShell session that already has a process-scoped `STAGING_DATABASE_PASSWORD`. Its default `Preflight` mode verifies the fixed staging target, `verify-full` TLS using the ignored local staging CA, an empty public schema, the committed migration set, and Prisma's pending-migration state without writing to the database. `Apply` is a separate explicit mode and requires `-ConfirmApply APPLY_STAGING_MIGRATIONS`; it is the runner's only path to `prisma migrate deploy`. The runner process-overrides both CLI URL candidates and restores non-secret variables on exit, so `backend/.env` cannot become its migration target.

Future CD is design only:

```text
PR / main push -> existing zero-secret CI
CI-green main commit -> protected staging deployment
staging health/readiness/authenticated rehearsal -> manual production approval
manual migration gate -> protected production deployment -> smoke
```

GitHub Actions should own coordinated future deployment because it can gate both providers on one immutable commit and use GitHub Environment approval. Provider previews may be used only for public visual review. CD is not implemented here.

Application rollback means redeploying the prior known-good frontend/backend artifact if schema-compatible. Database recovery is separately approved; Prisma does not imply automatic down migrations. The completed isolated restore rehearsal is recovery evidence, not a production restore action.

## Monitoring ownership

The project owner owns operational response. Minimum responsibility:

| Concern | Model |
| --- | --- |
| Liveness/readiness | Provider check on `/api/v1/health`; release gate and external uptime monitor check `/api/v1/ready`. |
| API failures/restarts/logs | Fly logs, deploy history and notifications, reviewed by owner. |
| Frontend deploy | Cloudflare Pages and GitHub check status. |
| Database health/saturation | Supabase dashboard; the sole API pool is max five connections. |
| Domain/certificate | Registrar auto-renewal and provider domain/TLS status. |
| Cloudinary/Resend | Provider dashboards and application error logs without identifiers/secrets. |

## Cost and gates

Expected cost class: **MIXED**. Cloudflare Pages can be free; a continually available Fly Machine, registered domain, Supabase production capacity and external services can cost money. Do not rely on Render's free backend for the final demo because its documented idle spin-down conflicts with predictable booking/login behavior.

Before staging provision, the owner must own a parent domain, verify Fly Sydney capacity/billing, create isolated Supabase staging and external-service configuration, define/verify the narrow proxy trust rule, and only then add protected provider/GitHub credentials during CD implementation.

## Official provider evidence

- [Cloudflare Pages SPA serving](https://developers.cloudflare.com/pages/configuration/serving-pages/), [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/), and [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).
- [Fly networking and TLS](https://fly.io/networking/), [Node hosting](https://fly.io/learn/what-is-the-best-nodejs-hosting/), and [pricing](https://fly.io/pricing/). Verify `syd` live at provisioning.
- [Render Node version](https://render.com/docs/node-version), [regions](https://render.com/docs/regions), [free-tier limits](https://render.com/docs/free), and [rollback behavior](https://render.com/docs/rollbacks).
- [Supabase region immutability](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z).
