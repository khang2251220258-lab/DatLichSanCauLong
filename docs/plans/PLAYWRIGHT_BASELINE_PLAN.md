# Playwright Baseline + Admin Workspace Shell Plan

Current scope is frontend-only. Playwright runs a read-only public smoke test on Chromium, Firefox, and WebKit. Authenticated Admin checks run on Chromium at 1440x900, 768x1024, and 390x844 only when `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are present.

Implementation order:

1. Replace the generated Playwright example and configure Vite web-server reuse, failure artifacts, browser projects, and responsive Admin projects.
2. Build the Admin workspace shell around existing pages without changing their validators, requests, mutations, or content composition.
3. Verify semantic landmarks, the three real Admin routes, nested active state, overflow, header/content separation, and logout access.
4. Run targeted Admin/Auth tests, full frontend regression, Playwright, lint, build, audit, and diff checks.

Safety: E2E tests never bypass authentication, commit credentials, call Admin mutations, seed data, or mutate Supabase. Missing Admin credentials skip only authenticated coverage with an explicit reason.
