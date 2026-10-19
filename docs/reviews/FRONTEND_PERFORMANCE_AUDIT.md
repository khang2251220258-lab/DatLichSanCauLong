# Frontend Performance Audit

Ngày đo: 2026-10-13. Môi trường: localhost, Vite development server, Chromium, backend development kết nối Supabase. Các số liệu dưới đây chỉ dùng để so sánh cục bộ, không phải production SLA.

## Baseline

- Production build tạo một JS bundle eager: 471.62 kB, gzip 130.35 kB; CSS 128.70 kB, gzip 23.38 kB.
- Toàn bộ Public, Customer, Owner, Admin và Auth pages được import đồng bộ từ `AppRoutes`.
- Home hard load gọi `GET /auth/session` và `GET /facilities?page=1&page_size=4`. Facility List hard load gọi session và `GET /facilities`. Không có duplicate GET đồng nhất trong một mount production.
- Snapshot của Booking/Admin đã được giữ trong component khi background refresh. Public list/detail mất snapshot khi unmount, nên Back/revisit quay lại blocking loading.
- AuthProvider nằm trên router và chỉ bootstrap session một lần trong SPA. Session chỉ bị gọi lại khi hard reload, login confirmation hoặc explicit refresh.
- Local Chromium sample trước thay đổi: Home FCP 588 ms, LCP 588 ms, CLS 0.00006; Facility List FCP 196 ms, LCP 1336 ms, CLS 0.00006. Số đo chịu ảnh hưởng DB/network/image cache.

## Bottlenecks và rủi ro

1. Eager route imports buộc guest tải code Owner/Admin/Payment/Refund không cần cho route đầu tiên.
2. Public list/detail không có last-known-good snapshot giữa các lần SPA revisit.
3. Một số QR/proof images thiếu `loading`/`decoding`; Facility cover đầu tiên cũng bị lazy dù có thể là LCP candidate.
4. Owner Facility screens hiện cần nhiều endpoint theo cấu hình trang. Đây là fixed frontend fan-out theo contract; thay đổi backend aggregation cần phase riêng và evidence query/runtime, không thuộc task này.

## Reliability review

AbortController, generation guard, stale-response protection, strict DTO validation, unknown-result/409 recovery, signed URL refresh và private authenticated delivery được giữ nguyên. Cache mới chỉ chứa response public, key bằng toàn bộ API path, TTL 30 giây, tối đa 24 entry; protected Customer/Owner/Admin data không được cache.

## After

- Main JS: 290.34 kB, gzip 90.81 kB. Route chunks được chia theo feature, không tạo micro-chunk cho từng route instance.
- Local Chromium sample sau thay đổi: Home FCP 204 ms, LCP 728 ms, CLS 0; Facility List FCP 68 ms, LCP 1584 ms, CLS 0. LCP dao động do ảnh/network nên không kết luận cải thiện production từ hai sample.
- Public Facility list/detail revisit hiển thị snapshot hợp lệ ngay, revalidate nền và giữ snapshot khi refresh lỗi. Availability luôn đọc mới và không dùng cache vì slot state nhạy thời gian.
- First facility cover dùng eager/high priority; các cover còn lại lazy/async. Gallery primary giữ eager; gallery phụ và private proof/QR dùng lazy/async. Private URL contract không đổi.

## Deferred

- Không đưa TanStack Query/SWR vào vì sẽ là migration kiến trúc rộng.
- Không cache protected resources trong phase này; tránh rủi ro isolation/invalidation khi role switch/logout.
- Không đổi API/backend để aggregate Owner Facility configuration hoặc Court counts.
- Cần đo production/CDN/hosting riêng trước khi đặt performance budget hoặc SLA.
