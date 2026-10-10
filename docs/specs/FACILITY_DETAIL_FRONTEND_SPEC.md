# Facility Detail + Availability Frontend Specification

## Current status — 2026-10-07

Facility Detail/Availability frontend và Booking handoff thực đã triển khai ở các phase kế tiếp. Các đoạn pre-implementation/CTA-disabled bên dưới được giữ làm lịch sử quyết định; contract hiện tại theo `BOOKING_FRONTEND_SPEC.md` và `FEATURE_STATUS.md`.

## Booking handoff được duyệt — 2026-10-05

Handoff đã implementation và kiểm chứng trong Booking Frontend Phase1:80/80 frontend tests/lint/build PASS, regression Detail14. Bằng chứng tại FEATURE_STATUS; các ghi nhận CTA disabled/no quote/chưa handoff bên dưới chỉ mô tả phase Detail trước khi Booking được duyệt.

Booking Frontend Phase1 thay boundary cũ bên dưới: CTA hợp lệ chuyển selection React memory sang Confirmation, được hiển thị tiền DỰ KIẾN tại Confirmation; chỉ nút Xác nhận mới POST. Guest đăng nhập rồi chọn lại; không persistence hoặc tự POST. Reload mất selection có thông báo/link chọn lại. Availability vẫn read-only và không total quote. Contract đầy đủ tại [BOOKING_FRONTEND_SPEC.md](BOOKING_FRONTEND_SPEC.md); giữ các kiểm tra slot/Court/ngày và dữ liệu thật.

## Implementation — 2026-10-05

Detail/Availability frontend đã triển khai và kiểm chứng; các ghi nhận “chưa implementation” phía dưới là trạng thái khi duyệt spec. Route `/facilities/:facility_id`, link từ List hoạt động. Default Court ACTIVE đầu theo id số ASC; date lấy ngày Asia/Ho_Chi_Minh của meta.server_time Detail, API Availability quyết định ngày/state hợp lệ. Dùng PublicLayout chung, API client/Auth Context hiện có.

Chọn slot bằng toggle: chỉ thêm ở đầu/cuối dải liên tiếp tối đa6; bỏ slot ở giữa gây khoảng hở bị từ chối, có Bỏ chọn toàn bộ. Đổi Court/ngày remount selection; retry không giữ selection cũ. Giá chuỗi decimal, không total quote. CTA luôn disabled đúng boundary đã chốt. 44 frontend tests/lint/build PASS; responsive Edge1440/800/390 không overflow; chi tiết và giới hạn tại FEATURE_STATUS. Booking handoff thực sự chưa triển khai.

## Trạng thái và nguồn chuẩn

Quyết định được duyệt ngày 2026-10-05. Specification sẵn sàng cho implementation; chưa triển khai frontend Detail/Availability và không đánh dấu feature DONE.

Route dự kiến `/facilities/:facility_id`. Visual theo [facility-detail-desktop.png](../ui-reference/facility-detail-desktop.png). Dữ liệu/behavior theo [PUBLIC_FACILITY_SPEC.md](PUBLIC_FACILITY_SPEC.md), [AVAILABILITY_SPEC.md](AVAILABILITY_SPEC.md), [BOOKING_SPEC.md](BOOKING_SPEC.md) và [API_SPEC.md](../API_SPEC.md). Backend tiếp tục quyết định visibility, availability và điều kiện tạo Booking.

## Phạm vi đọc

Frontend dùng GET `/api/v1/facilities/:facility_id` cho core public fields, gallery, active amenities, ACTIVE Courts, price_rules và cancellation_policy. Dùng GET `/api/v1/courts/:court_id/availability?date=YYYY-MM-DD` cho lịch một Court/ngày. Giữ response whitelist và error contract hiện tại; không thêm API hoặc sửa backend.

Không hard-code dữ liệu PNG. Gallery/amenities/Courts/PriceRules rỗng và policy null cần trạng thái phù hợp; không tự điền ảnh, sân, giá hoặc chính sách. Policy hiện hành không bảo đảm quyền hủy mọi Booking; tuân cutoff nghiêm ngặt và ma trận trạng thái theo BOOKING_SPEC. Tái sử dụng Auth Context/API client; Header/Footer có thể tách từ Facility List khi implementation, không sao chép session logic. Không notification/contact/social/menu giả.

## Availability và selection

- Slot 30 phút, `[start_at,end_at)`, hiển thị theo Asia/Ho_Chi_Minh, giữ timestamps UTC có Z từ API.
- Mapping: AVAILABLE → Có thể chọn; HELD → Đang được giữ; BOOKED → Đã đặt; BLOCKED → Bị khóa; UNPRICED → Chưa có giá; PAST → Đã qua. Chỉ AVAILABLE được chọn. SELECTED là state cục bộ, không sửa state API.
- Selection hợp lệ gồm 1–6 slot AVAILABLE liên tiếp, cùng Court và cùng ngày địa phương. Slot sau bắt đầu đúng lúc slot trước kết thúc. Không chọn xuyên slot không AVAILABLE, không tự ghép khoảng hở hoặc thay giờ cho người dùng.
- Đổi Court/ngày phải bỏ selection cũ. Response đến muộn không được ghi đè lịch/selection mới. Khi tải lại hoặc lỗi, không dùng selection cũ như dữ liệu đã được xác minh; nếu response mới không còn đáp ứng điều kiện thì vô hiệu lựa chọn liên quan.
- Frontend chuẩn bị selection trong memory: `{court_id, start_at, end_at}`; lấy start của slot đầu và end của slot cuối. Không gửi selection trong phase này, không lưu thành Booking, không giữ chỗ.
- Giá từng slot chỉ dùng slot_amount từ API, giữ decimal chính xác; null là chưa có giá, không phải 0. Không tự tính hoặc hiển thị total quote/cọc/remaining. Bảng giá giờ từ Detail không thay thế slot_amount.
- HELD không có countdown; Availability là snapshot chỉ đọc, không bảo đảm Booking sau đó thành công. Giới hạn tạo Booking 30 ngày và các điều kiện khác vẫn do backend kiểm tra ở phase Booking; không biến giới hạn này thành giới hạn đọc Availability.

## Booking handoff — quyết định APPROVED

Phase này dừng ở lựa chọn slot. **Không gọi POST /api/v1/bookings**, không mutation Booking/Payment, không tạo Booking route/page giả, không tự điều hướng sang bước chưa triển khai.

Giữ visual “Tiếp tục đặt sân”, nhưng CTA disabled trong toàn bộ phase này:

| Selection | Hành vi |
| --- | --- |
| Chưa chọn hoặc không hợp lệ | Disabled; hướng dẫn chọn 1–6 slot AVAILABLE liên tiếp cùng Court/ngày |
| Hợp lệ | Selection được chuẩn bị trong memory; CTA vẫn disabled, không request hoặc điều hướng |
| Đang tải/lỗi/lựa chọn không còn hợp lệ | Disabled; không sử dụng dữ liệu cũ để tiếp tục |

Hiển thị chú thích đọc được cạnh CTA: “Bước đặt sân chưa được bật trong giai đoạn này.” Dùng disabled thực sự và liên kết mô tả accessible; không chỉ thay màu hoặc tooltip. Không thông báo đã giữ chỗ/đã đặt thành công. Guest và authenticated đều không tạo Booking từ trang này; không dùng login redirect để kích hoạt mutation ngầm.

BOOKING HANDOFF CONTRACT READY chỉ có nghĩa boundary tạm thời đã chốt; handoff thực sự sang Booking frontend được hoãn sang phase tiếp theo. Khi đó backend phải recheck availability, state, thời gian, giá và BankAccount; selection frontend không phải bằng chứng cho phép Booking.

## Kiểm chứng khi implementation

Ngoài các test đọc Detail/Availability, phải kiểm tra: chọn 1 và 6 slot; từ chối 7 slot, khoảng hở, khác Court/ngày và mọi state ngoài AVAILABLE; đổi Court/ngày hoặc response thay đổi làm selection không còn hợp lệ; CTA luôn disabled kể cả chọn đúng; không POST Booking, không navigation tới Booking giả, không total quote. Giữ Auth regression, responsive và accessibility. Task cập nhật spec này không chạy test implementation hoặc ghi database.

## Readiness

Không phát hiện conflict mới với Public Facility/Availability/Booking contract. Backend/schema không cần thay đổi cho phạm vi này. Blocker Booking handoff trong review đã được giải quyết; không còn decision required. Facility Detail + Availability frontend implementation READY, nhưng implementation chỉ bắt đầu khi có yêu cầu tiếp theo.
