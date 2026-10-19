---
name: plan
description: Chuyển approved spec Cầu Lông ĐN thành implementation plan tối thiểu, có thứ tự, rủi ro và kiểm chứng.
---

# PLAN

MUST có contract đã duyệt, không còn blocker. Đọc actual source, tests, package scripts và module tương tự.

## Workflow

1. Xác định behavior cần đạt và phần hiện có cần tái sử dụng.
2. Liệt kê files/modules dự kiến thay đổi; không tạo layer/dependency mới nếu kiến trúc hiện tại đủ dùng.
3. Sắp thứ tự backend contract/service/route/DTO, frontend validator/API/UI, tests và docs theo dependency.
4. Nêu validation, auth/ownership/CSRF, transaction/locking, private media, responsive/accessibility nếu liên quan.
5. Chọn targeted tests, PostgreSQL integration, regressions, full suites, lint/build từ scripts hiện hành.
6. Ghi risk, cleanup, rollback/safety và điều kiện dừng.

MUST NOT sửa application source, implement, chạy migration, seed hoặc mutate demo data. Giữ nguyên approved contract.

## Output

`SCOPE`, `EXISTING REUSE`, `FILES/MODULES`, `IMPLEMENTATION ORDER`, `VALIDATION/SECURITY`, `TEST ORDER`, `DOCUMENTATION`, `RISKS/SAFETY`, `DEPENDENCIES`, `BLOCKERS`.

## Stop conditions

Dừng nếu spec chưa duyệt, còn decision bắt buộc hoặc plan cần schema/API ngoài contract. Trả lại SPEC thay vì tự quyết.
