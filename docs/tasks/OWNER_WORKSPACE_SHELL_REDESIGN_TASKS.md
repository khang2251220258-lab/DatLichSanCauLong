# Owner Workspace Shell Redesign Tasks

## Task 1 — Owner header and shell

- **Goal:** tạo workspace shell thống nhất, giữ Auth behavior.
- **Files:** `PublicLayout.jsx`, `OwnerShared.jsx`, `owner.css`.
- **Requirements:** compact header; sidebar chỉ Facility/Booking; nested route active; semantic navigation và focus; responsive không permanent sidebar trên mobile.
- **Do not:** sửa API, routing, business content hoặc `useOwnerRead`.
- **Pass:** shell render đúng trên toàn bộ Owner routes và logout còn khả dụng.

## Task 2 — Regression tests

- **Goal:** khóa navigation, accessibility, capability và Auth behavior.
- **Files:** Owner frontend tests.
- **Tests:** đúng hai links; `aria-current` cho Facility/nested Facility/Booking/detail; logout; CUSTOMER bị guard.
- **Pass:** targeted suites và role-switch regression pass.

## Task 3 — Validation and documentation

- **Goal:** xác minh không regression và ghi nhận Phase 1 thực tế.
- **Tests:** full frontend, lint, production build, `git diff --check`.
- **Pass:** toàn bộ command pass; không backend/database/migration/seed/external call.
