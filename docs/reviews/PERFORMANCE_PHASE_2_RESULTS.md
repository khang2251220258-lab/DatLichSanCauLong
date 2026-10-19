# Performance Phase 2 Results

Ngày kiểm chứng: 2026-10-13. Số liệu chỉ đại diện localhost development.

## Thay đổi

- Thêm protected snapshot in-memory: TTL 30 giây, tối đa 40 entry, key gồm User ID, tập capability đã chuẩn hóa và full API path.
- Áp dụng cho Customer Booking list, Owner Booking list, Owner Facility list/court-count snapshot, Admin Facility list và Admin Amenity list.
- `/profile` render identity từ AuthContext ngay, sau đó revalidate `/users/me`; snapshot Profile được tái sử dụng khi revisit.
- Logout/account switch/session expiry và mọi mutation xóa protected snapshot của identity hiện tại.
- Không lưu browser storage; không cache Availability, Booking Detail lifecycle, CSRF, password state, signed proof URL hoặc binary asset.
- Admin reliable reads defer một microtask để discarded StrictMode mount không mở GET thừa. Booking/Owner hooks giữ khởi động read trực tiếp để không làm chậm lifecycle đã kiểm chứng.
- Admin Owner Request list dùng protected snapshot; Admin Owner Request detail dùng reliable read hook để loại duplicate StrictMode GET nhưng không cache lifecycle detail.

## Before / after

| Flow | Before | After |
| --- | --- | --- |
| Public SPA | baseline trước phase: Home FCP 204 ms, LCP 728 ms; public cache có sẵn | FCP 312 ms, LCP 788 ms, CLS 0; 4 API GET trong Home → List → Home; 1 session bootstrap. Không tuyên bố cải thiện vì dao động local. |
| Admin Facility revisit | khoảng 4.2 s trong sample baseline khi không có usable protected snapshot | 84 ms tới list usable trong final probe; snapshot hiện ngay rồi revalidate. Mục tiêu `<100 ms` đạt trong sample cuối. |
| Account Center revisit | Profile từng chờ GET `/users/me` để render | 63 ms tới identity/Profile shell trong final probe; `/users/me` tiếp tục revalidate nền. |
| Protected list failure | blocking state sau remount | snapshot gần nhất được giữ; refresh error là non-blocking theo hook hiện hành. |

Lặp GET trong probe là revalidation có chủ đích sau revisit, không phải hai request đồng thời cho cùng mount. Mutations không được deduplicate hoặc retry.

## API/database findings

- Health warm sample khoảng 10 ms; cold/wake sample 140 ms.
- Public endpoints giữ query budget đã duyệt. Không tìm thấy evidence schema/index mới.
- Owner Facility list vẫn có fixed fan-out Court-count theo số Facility visible. Requests chạy song song và kết quả count được snapshot; aggregate API chỉ nên cân nhắc sau production profiling.
- Không thay backend contract, query, schema hay migration trong phase này.

## Images and React

- Primary Facility image vẫn eager/high-priority; ảnh phụ lazy/async; private signed URL behavior giữ nguyên.
- Không thêm memoization hàng loạt. Chỉ phối hợp read lifecycle và cache nơi remount thực sự tạo blocking loader.

## Production work còn lại

- Đo CDN/hosting, TLS, cold start, Supabase region/pool và p50/p95 endpoint thật.
- Đo Customer/Owner authenticated routes bằng credential read-only hợp lệ.
- Nếu Owner Court-count fan-out chi phối critical path ở production, review DTO/aggregation riêng; chưa có căn cứ đổi API hiện tại.
- Route-code intent prefetch chưa được thêm vì route chunks nhỏ và chưa có evidence nó chi phối latency so với API.

## Expanded end-to-end results

Probe `end-to-end-performance.spec.js` chạy desktop, chỉ GET và không mutation:

| Route | Before | After / final |
| --- | --- | --- |
| Admin Owner Request list revisit | blocking read theo source cũ | 57 ms tới dữ liệu snapshot; revalidation tiếp tục nền. |
| Admin Owner Request detail | 2 GET cùng path trong sample StrictMode, một request bị abort | 1 GET; 1,274 ms endpoint và 1,364 ms data-visible trong final sample. |
| `/facilities` | API 2.9–3.6 s trong các sample | Không đổi backend; snapshot tiếp tục giải quyết revisit, initial load vẫn phụ thuộc API. |
| `/admin/amenities` | API khoảng 2.4 s | Snapshot xử lý revisit; initial load không bị che bằng delay giả. |

Final read-only probe: Public Home 673 ms, Facility List 4,067 ms, Facility Detail 2,429 ms; Admin Facility Detail 2,374 ms, Owner Request List 2,901 ms, Owner Request Detail 1,364 ms, Amenity List 2,940 ms, Profile 120 ms và Owner Request revisit 57 ms. Không có duplicate GET trong một route measurement sau sửa.

Source/query audit không thấy N+1 mới: list endpoints dùng pagination cùng count, Owner Request list chạy `findMany` và `count` trong transaction, detail dùng một ownership-filtered lookup. Vì cùng các query đơn giản vẫn dao động từ dưới 100 ms tới nhiều giây và health warm khoảng 10 ms, cần đo PostgreSQL/Supabase connection/RTT p50/p95 trước khi đề xuất index hoặc migration.
