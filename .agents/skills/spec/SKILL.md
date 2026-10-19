---
name: spec
description: Phân tích và chốt contract feature Cầu Lông ĐN trước implementation; dùng cho spec và pre-implementation review.
---

# SPEC

MUST đọc `AGENTS.md`, `docs/PROJECT_OVERVIEW.md`, spec và actual source liên quan. Đọc `docs/DATABASE.md` cùng Prisma schema/migration khi có persistence; `docs/API_SPEC.md` khi có API; `docs/UI_UX_SPEC.md` và approved PNG khi có frontend.

## Workflow

1. Tách `IMPLEMENTED`, `DOCUMENTED ONLY`, `MISSING`.
2. Xác định actors/capabilities, ownership, state machine, validation, DTO/error contract.
3. Với mutation, xác định Origin/CSRF, transaction, lock order, DB time, atomicity và race.
4. Kiểm tra schema impact, test gaps, documentation drift và blocker.
5. Không suy behavior từ PNG; PNG chỉ quyết định visual.

MUST NOT sửa application source, tạo migration, seed hay triển khai feature. Chỉ sửa spec/docs khi task yêu cầu rõ việc sync/approval.

## Output

`FEATURE REVIEW`, `DATABASE MODEL`, `STATE MACHINE`, `API CONTRACT`, `AUTH/OWNERSHIP`, `CSRF/ORIGIN`, `CONCURRENCY`, `FRONTEND`, `UI REFERENCES`, `TEST GAPS`, `DATABASE CHANGE REQUIRED`, `MIGRATION REQUIRED`, `BLOCKERS`, `READY FOR IMPLEMENTATION`.

## Stop conditions

Dừng phần phụ thuộc khi rule còn thiếu, source mâu thuẫn contract, schema không đáp ứng hoặc reference bắt buộc chưa có. Không báo READY khi còn blocker.
