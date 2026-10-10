# Booking Frontend Phase 1

## Refund in Booking Detail — implemented 2026-10-10

Refund UI dùng route Booking Detail hiện có, không tạo route Refund. Owner reference `owner-booking-refund-desktop.png` bao phủ Refund `PENDING`; Customer reference `customer-booking-refund-desktop.png` bao phủ `PROOF_SUBMITTED`. Cả hai UI phải hỗ trợ presentation `PENDING`, `PROOF_SUBMITTED`, `REFUNDED` theo server state. Booking Detail lấy Refund summary; proof URL tạm được lấy bằng Refund detail API theo `refund_id`.

Owner chỉ upload ở `PENDING`. Customer chỉ confirm ở `PROOF_SUBMITTED` qua modal accessible. `REFUNDED` terminal/read-only. File/proof chỉ giữ trong memory, chống double submit, 409/unknown result refetch authoritative state, response malformed fail closed. Không hard-code presentation data từ PNG và không thêm Refund Center.
## Customer CONFIRMED cancellation — 2026-10-10

`/bookings/:booking_id` đã triển khai reference `customer-booking-confirmed-cancellation-desktop.png`: hiển thị cọc xác nhận, cutoff snapshot, deadline và eligibility dựa trên server-time snapshot. Snapshot null không có default; cutoff 0 dùng deadline=start_at; đúng/quá deadline khóa action. Mutation dùng endpoint cancel hiện có qua cookie/Origin/CSRF, modal accessible, chống double submit; 409 và kết quả network/5xx chưa rõ đều refetch Booking authoritative, response 2xx sai DTO bị từ chối. Thành công `CONFIRMED → CANCELLED`, backend tạo Refund PENDING; UI Refund tiếp tục ngay trong cùng Booking Detail.

## Implementation đã kiểm chứng

Ngày2026-10-05: Confirmation/create/list/detail/countdown đã triển khai, frontend80/80 test/lint/build PASS; Booking27 và regression53. Edge1440/800/390 cho4 màn hình không overflow. Chi tiết bằng chứng/giới hạn tại FEATURE_STATUS: HTTP fixtures cô lập, chưa live Supabase E2E, không DB write. Không Payment.

## Quyết định approved — 2026-10-05

Nguồn nghiệp vụ: BOOKING_SPEC/API_SPEC; visual là bốn PNG booking-confirm-desktop, booking-list-desktop, booking-detail-desktop, booking-detail-pending-payment-desktop trong docs/ui-reference. Không thay backend contract.

## Selection và Confirmation

- Detail chọn 1–6 slot AVAILABLE liên tiếp, cùng Court/ngày Asia/Ho_Chi_Minh. Selection và thông tin hiển thị chỉ trong React memory, không browser storage/history state; reload không phục hồi.
- Bước trung gian dùng route `/facilities/:facility_id/booking-confirm`. Chưa POST khi điều hướng. Mất selection/reload/direct access: giải thích khung giờ không còn, link về đúng Facility Detail để chọn lại; không dữ liệu giả hoặc mutation.
- Quay lại Detail trong phiên có thể phục hồi lựa chọn từ memory, nhưng phải đối chiếu Availability mới. Đổi Court/ngày hoặc dữ liệu không còn AVAILABLE thì bỏ lựa chọn không hợp lệ.
- Guest phải đăng nhập và chọn lại; giữ Login redirect `/`, không return-to mới, không tự restore hoặc POST sau login. Chỉ CUSTOMER capability, bao gồm Approved Owner. ADMIN không kế thừa.
- Tiền Confirmation là DỰ KIẾN từ slot_amount thật: cộng decimal chính xác, tổng làm tròn half-up đến VND, cọc round half-up(total*30/100), remaining=total-deposit. Không tính bằng floating point. Backend luôn tính lại; sau POST mọi tiền dùng snapshot backend.
- Thay thế giới hạn Detail phase cũ CTA disabled/no total quote CHỈ tại bước handoff/Confirmation mới. Availability vẫn không total quote/readiness và không giữ chỗ.

## Create và lỗi

Chỉ nút Xác nhận mới POST `/api/v1/bookings` với `{court_id,start_at,end_at}` UTC Z. Không customer/price/status/expiry/snapshot. Dùng Auth request/credentials include/Origin/CSRF hiện tại; chặn double-submit cả trong và sau request kết quả không xác định.

HTTP201 chuyển `/bookings/:id`, booking mới PENDING_PAYMENT. Không tự gọi CONFIRMED. 401 yêu cầu đăng nhập/chọn lại; 403 báo quyền/phiên bảo mật; 409 yêu cầu kiểm tra lại sân/giá/ngân hàng; 422 giải thích thời gian/dữ liệu theo error code. Network/timeout/5xx hoặc response không xác định: khóa submit của draft này, không retry POST; link `/bookings` để kiểm tra, không kết luận chưa tạo. Quay lại không được biến draft chưa xác định thành request lặp ngầm.

Draft đang gửi vẫn chặn mutation khi điều hướng quay lại. Với unknown, người dùng được chủ động xác nhận đã kiểm tra lịch rồi bỏ selection cũ để chọn lại; không tự retry hoặc tự kết luận request trước thất bại.

## List và Detail

`/bookings`: GET cá nhân, URL page/page_size mặc định1/20 max100, order created_at DESC/id DESC; loading/error/empty riêng, không retry tự động. Card chỉ summary DTO, không ảnh, mã BK, rating hoặc data giả. Detail link `/bookings/:id`.

Detail GET dùng snapshot Facility/address/Court, UTC hiển thị Asia/Ho_Chi_Minh, slots/giá, total/deposit/remaining/created_at. ID thật. 404 không tìm thấy/không sở hữu; không gọi Facility hiện tại thay lịch sử. Không hiển thị bank/payment actions trong Phase1.

| Status | Nhãn |
| --- | --- |
| PENDING_PAYMENT | Chờ thanh toán |
| PENDING_CONFIRMATION | Chờ chủ sân xác nhận |
| CONFIRMED | Đã xác nhận |
| COMPLETED | Hoàn thành |
| CANCELLED | Đã hủy |
| REJECTED | Bị từ chối |
| EXPIRED | Hết hạn |

## Countdown

Chỉ PENDING_PAYMENT: expires_at trừ meta.server_time và thời gian client trôi qua (monotonic). Không lấy đồng hồ máy làm authority, không reset5 phút. Chạm0 hoặc focus/visible lại thì GET detail, không local EXPIRED. Không vòng lặp refetch khi server vẫn trả PENDING_PAYMENT/đồng bộ lỗi. Lỗi sync phải ghi chưa xác minh được trạng thái và cho thử GET lại; không giả EXPIRED. Response cũ không ghi đè response mới. Reload đọc server mới. PENDING_CONFIRMATION không countdown/auto-expire.

## Visual, scope và kiểm chứng

Giữ bố cục hai cột/card trắng/nền nhạt từ PNG; tablet/mobile xếp dọc và wrap, focus rõ. Tái sử dụng Header/Footer/API/Auth/formatter. Header Customer có lối tới lịch đặt sân. Không notification/contact/social giả. Bỏ ảnh list do DTO không có, dùng ID thật; sửa tiền cọc sai minh họa bằng DTO, thêm nhãn dự kiến. Pending chỉ thông báo bước thanh toán sẽ hỗ trợ sau, không yêu cầu chuyển tiền chưa có flow.

HISTORICAL/SUPERSEDED — Booking Frontend Phase 1 chưa bao gồm QR/upload proof/Owner confirm-reject/refund/cancel. Các phase sau đã triển khai QR, Customer proof upload/read và Owner confirm/reject; Refund và cancel CONFIRMED vẫn chưa hoàn tất. Test HTTP của phase này dùng fixture cô lập, không production DB write; trạng thái hiện tại theo `FEATURE_STATUS.md` và `PAYMENT_SPEC.md`.
