# Release Baseline Plan

## Current decision

The repository is **ready to be split into reviewable commits**, but this stabilization phase does not create a catch-all commit. The working tree contains the accumulated implementation history above one initial commit, so committing all entries at once would weaken review and rollback safety.

## Files that belong in the baseline

- Application source for backend and frontend.
- Prisma schema and all reviewed migration directories.
- Package manifests and lockfiles.
- Tests, read-only profiling tools, fixture tooling, and project agent skills.
- `.env.example` files and the public Supabase CA certificate.
- Current specifications, runbooks, review evidence, architecture artifacts, and approved/current UI references.
- Deterministically generated source imported by the build, including the frontend district registry.

## Files that must stay out

- Real `.env` and `.env.local` files or any local credential file.
- `node_modules`, `dist`, `build`, coverage, logs, temp files, Playwright reports/results/cache/auth state, and local runtime artifacts.
- Any unreviewed secret, connection string, session token, reset token, private proof identifier, or password.

The current ignore rules cover the known local environment, dependency, build, log, and Playwright artifact paths. The tracked database CA file is a public trust certificate, not a private key.

## Proposed commit sequence

1. **Database and backend foundation** — Prisma schema/migrations, backend modules, package manifests/lockfile, public CA, unit and PostgreSQL integration tests.
2. **Frontend application** — routes, features, shared components, styles, deterministic generated registry, frontend tests and build configuration.
3. **E2E and developer tooling** — Playwright configuration/specs, isolated fixture tools, read-only profilers, seed verification guards, and `.agents` workflow files.
4. **Specifications and operational documentation** — current specs, feature status, deployment runbook, master handoff, architecture/review artifacts, and UI-reference registry/assets.

For each commit: review its staged diff, run a staged secret/artifact scan, run `git diff --cached --check`, execute the relevant targeted verification, then record the evidence in the commit message. Create the release tag only after the complete commit stack and staging rehearsal pass.

## Release branch guard

Do not deploy from the present uncommitted tree. Deployment must reference an immutable reviewed commit. The isolated local three-role rehearsal passed on 2026-10-19; provider/domain selection, proxy trust configuration, an isolated backup/restore rehearsal, monitoring ownership, and staging deployment validation remain production go-live gates.
