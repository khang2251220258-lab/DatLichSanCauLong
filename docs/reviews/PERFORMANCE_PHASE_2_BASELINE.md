# Performance Phase 2 Baseline

Ngày đo: 2026-10-13. Môi trường: Vite/Express development trên localhost, Chromium, PostgreSQL Supabase development. Đây là số liệu so sánh local, không phải production SLA.

## Runtime baseline

| Route/flow | Useful content | GET/API behavior | Finding |
| --- | ---: | --- | --- |
| `/` → `/facilities` → `/` | Public audit trước phase: Home FCP 204 ms; Facility List FCP 68 ms | 1 session bootstrap; tối đa 3 Facility reads | Public snapshot 30 giây đã giữ content khi revisit. |
| `/admin/facilities` → `/profile` → `/admin/facilities` | sample đầu phase khoảng 4.2 s để list usable trở lại | Admin list và `/users/me` đọc lại sau remount | Protected list không có snapshot xuyên route. |
| `/profile` | chặn bởi `/users/me` khi chưa có component snapshot | session đã có nhưng identity shell chờ Profile GET | Waterfall presentation không cần thiết. |
| Owner Facility list | list trước, sau đó một Court GET cho mỗi Facility đang hiển thị | fixed fan-out chạy song song | Court count là phần chậm riêng; không phải Prisma N+1 trong một backend request. |

Health check sample: cold/wake request khoảng 140 ms; hai request ấm tiếp theo khoảng 10 ms. Điều này xác nhận local latency dao động và không đủ bằng chứng để quy lỗi cho PostgreSQL hoặc đề xuất index.

## Source audit

- Auth bootstrap đã deduplicate StrictMode bằng microtask và chỉ có một request trong SPA bình thường.
- Public list/detail có in-memory snapshot 30 giây và stale-while-revalidate.
- Booking, Owner và Admin giữ last-known-good trong cùng component, nhưng mất snapshot khi unmount.
- Các hook protected khởi động effect ngay, nên StrictMode có thể tạo request bị hủy không cần thiết.
- Booking Detail, Availability, PaymentProof và RefundProof có lifecycle nhạy thời gian/quyền truy cập nên không phù hợp với list snapshot chung.
- Không có evidence query/index mới đủ mạnh để sửa schema.

## Measurement limits

Chỉ Admin credential an toàn đã có. Không invent Customer/Owner credential và không mutate demo data. Customer/Owner được audit bằng source và component tests; runtime authenticated timing cần đo lại khi có credential read-only phù hợp.

## Expanded end-to-end baseline

Desktop Chromium audit bổ sung cho thấy critical path chủ yếu nằm ở API read thay vì React render:

| Route | Data visible | API duration chi phối | Requests | Nhận định |
| --- | ---: | ---: | ---: | --- |
| `/facilities` | 3.5–4.1 s | 2.9–3.6 s | 1 | Public list bị chi phối bởi API/Supabase round trip. |
| `/facilities/299` | 1.4–2.4 s | 1.1–2.0 s | 2 | Facility detail hoàn tất trước Availability; Availability tiếp tục độc lập. |
| `/admin/facilities/:id` | 2.4–4.0 s | 1.8–3.6 s | 1 | Detail query đơn nhưng latency môi trường dao động lớn. |
| `/admin/owner-requests` | 2.9 s | 2.5 s | 1 | Trước thay đổi route không giữ snapshot qua unmount. |
| `/admin/owner-requests/:id` | 4.0 s sample đầu | 3.8 s + một GET StrictMode bị abort | 2 | Có duplicate GET tránh được trong source hook cũ. |
| `/admin/amenities` | 2.9 s | 2.4 s | 1 | API latency chi phối initial load. |
| `/profile` | 120–150 ms | 73–85 ms | 1 | AuthContext identity loại bỏ blocking shell. |

Các con số là sample local, không phải production SLA. Customer/Owner/Payment/Refund runtime vẫn chưa đo vì không có credential read-only tương ứng.
