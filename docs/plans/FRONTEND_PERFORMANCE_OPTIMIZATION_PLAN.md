# Frontend Performance Optimization Plan

1. Ghi baseline build và Chromium local metrics; inventory request waterfall, auth bootstrap, read hooks và image behavior.
2. Chia route bundle theo nhóm feature với một Suspense fallback có nội dung, giữ guards ở boundary hiện tại.
3. Thêm bounded public-only snapshot cache: full-path key, TTL 30 giây, max 24; luôn background revalidate; không cache protected data.
4. Giữ last-known-good public content khi refresh và hiển thị warning/retry không blocking.
5. Đặt ưu tiên tải ảnh đầu tiên và lazy/async cho ảnh ngoài critical path; giữ private signed URL lifecycle.
6. Thêm unit tests cho TTL/bounds/resource isolation và Playwright probe read-only cho request count, SPA navigation, loading settlement và browser metrics.
7. Chạy targeted reliability/auth tests, full frontend suite tuần tự, public/Admin read-only Playwright, lint, build và diff check.

Không thay backend, schema, migration, seed, business rules hoặc dữ liệu demo.
