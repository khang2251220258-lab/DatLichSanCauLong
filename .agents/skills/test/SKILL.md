---
name: test
description: Kiểm chứng Cầu Lông ĐN bằng targeted tests, PostgreSQL integration, regression, lint và build với evidence chính xác.
---

# TEST

NEVER làm yếu test để code pass: không bỏ assertion quan trọng, skip failure, đổi expected sang behavior sai hoặc mock mất boundary cần integration.

## Workflow

1. Đọc `package.json` và test files; trên Windows dùng `npm.cmd`, chạy đúng `backend/` hoặc `frontend/`.
2. Chạy targeted unit/component và backend tests.
3. Chạy PostgreSQL integration khi liên quan DB/transaction.
4. Chạy regressions liên quan, rồi full frontend/backend khi phạm vi/rủi ro yêu cầu.
5. Chạy frontend lint/build khi frontend thay đổi.
6. Dùng fake/mock cho Cloudinary, Resend và external services; không gọi dịch vụ thật.
7. Dùng isolation/fixture hiện hành, cleanup bắt buộc; không seed/mutate demo data.

Lệnh nền: frontend `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`; backend `npm.cmd test`, các `test:*:db` trong `backend/package.json`, hoặc `node --test test/<name>.integration.js` khi không có script.

## Output

Báo từng command/suite và `n/n PASS`; suite chưa chạy ghi `NOT RUN`. Phân biệt unit, DB integration, regression, lint, build, cleanup và external calls.

## Stop conditions

Không báo PASS nếu fail/timeout/chưa chạy. Với Supabase integration chạy lâu, poll và xác minh cleanup trước kết luận. Failure contract/security/cleanup chặn COMPLETE.
