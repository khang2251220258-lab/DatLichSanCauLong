# Owner Booking List Visual Redesign — Implementation Plan

Ngày: 2026-10-12

## Phạm vi

Chỉ redesign nội dung `/owner/bookings`. Giữ Owner workspace shell, Booking Detail, API, DTO, status/filter/pagination semantics, auth/ownership và reliability behavior hiện hành.

## Kế hoạch

1. Tái sử dụng `useOwnerRead`, validator và status mapping hiện hành.
2. Tổ chức header với eyebrow, H1, mô tả và status filter có nhãn truy cập được.
3. Nhóm mỗi row theo thứ tự Booking/Customer → Facility/Court → lịch chơi → tiền cọc → status → detail action.
4. Chỉ render phone khi backend cung cấp; không tạo fallback như dữ liệu thật.
5. Giữ snapshot trong background refresh/error; tách loading, blocking error, empty và filtered-empty.
6. Chuyển desktop list thành card hai cột ở tablet và một cột ở mobile, không horizontal overflow.
7. Chạy Owner Booking, Payment/Refund, Auth/role-switch, Owner Facility regression, rồi full frontend, lint, build và diff check.

## An toàn

- Không đổi backend, response validator, query/status contract hoặc state machine.
- Không thêm search/filter/sort/analytics.
- Không sửa Owner Facility List, Owner shell hoặc Booking Detail.
