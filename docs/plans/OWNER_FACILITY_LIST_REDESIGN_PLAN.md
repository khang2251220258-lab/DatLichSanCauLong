# Owner Facility List Visual Redesign — Implementation Plan

Ngày: 2026-10-11

## Phạm vi

Chỉ redesign vùng nội dung của `/owner/facilities`. Owner workspace shell, API, DTO, capability/ownership, routing và cơ chế đọc dữ liệu đã xác minh được giữ nguyên.

## Kế hoạch

1. Giữ contract `GET /api/v1/owner/facilities` và các request đếm Court hiện hành; không tạo dữ liệu phân tích mới.
2. Tạo hierarchy mới cho eyebrow, H1, mô tả và CTA thêm cơ sở.
3. Chuyển bảng CRUD thành management list: Facility là thông tin chính; địa điểm, vận hành, số sân, trạng thái và action được nhóm rõ ràng.
4. Giữ tổng Facility authoritative từ `meta.total`; không tạo summary cards từ dữ liệu trang hiện tại.
5. Tách initial loading, background refresh, empty, blocking error và populated state; background failure phải giữ snapshot gần nhất.
6. Chuyển list thành card ở tablet/mobile, giữ keyboard focus, nhãn trạng thái và reduced-motion.
7. Cập nhật targeted tests, chạy Auth/role regression, full frontend, lint, build và `git diff --check`.

## Rủi ro và kiểm soát

- Pagination khiến status/court totals trên trang không đại diện toàn bộ tài khoản: không hiển thị analytics đó.
- Request court count là fan-out hiện hành: không thay API hoặc reliability semantics trong phase visual.
- Working tree có thay đổi từ phase trước: chỉ sửa file thuộc màn hình, test và tài liệu của phase này.
