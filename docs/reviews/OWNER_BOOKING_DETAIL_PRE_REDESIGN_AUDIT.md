# Owner Booking Detail — Pre-redesign audit

Ngày audit: 2026-10-12. Route: `/owner/bookings/:booking_id`. Đây là baseline contract cho redesign; không thay đổi API, state machine hay nghiệp vụ.

## Information architecture được duyệt cho redesign

1. Điều hướng quay lại danh sách, eyebrow vận hành, H1 **Chi tiết đặt sân**, Booking ID và badge trạng thái.
2. Khối chính: Customer; Facility/Court; ngày, khoảng giờ và các slot snapshot.
3. Khối tài chính: `total_amount`, `deposit_amount`, `remaining_amount`; không tự tính lại từ UI.
4. Khối PaymentProof theo trạng thái, gồm ảnh riêng tư khi `SUBMITTED` đang cần review; hành động Confirm/Reject chỉ trong tổ hợp hợp lệ.
5. Khối cancellation metadata khi đã hủy; action hủy chỉ cho `CONFIRMED` + proof `APPROVED`.
6. Khối Refund nằm trong cùng detail khi Booking `CANCELLED` và có Refund; không tạo Refund Center.

Owner Workspace Shell và Owner Booking List hiện hành được giữ nguyên. Title cũ “Xác nhận thanh toán” chỉ phù hợp một state và phải được thay bằng title tổng quát “Chi tiết đặt sân” trong redesign.

## State và action contract

| Booking | PaymentProof | Owner action |
| --- | --- | --- |
| `PENDING_PAYMENT` | `null` | Read-only; không review/hủy confirmed |
| `PENDING_CONFIRMATION` | `SUBMITTED` | Xem proof riêng tư; Confirm hoặc Reject |
| `CONFIRMED` | `APPROVED` | Có thể hủy với reason bắt buộc; không áp Customer cutoff |
| `COMPLETED` | `APPROVED` | Read-only |
| `REJECTED` | `REJECTED` | Read-only, hiển thị rejection reason |
| `EXPIRED` | `null` | Read-only |
| `CANCELLED` | theo lịch sử | Read-only booking; hiển thị cancellation metadata và Refund nếu có |

Confirm chuyển proof `SUBMITTED → APPROVED` và booking `PENDING_CONFIRMATION → CONFIRMED`, giữ slot locks. Reject chuyển proof `SUBMITTED → REJECTED` và booking sang `REJECTED`, lưu reason, nhả locks. Owner hủy chuyển `CONFIRMED → CANCELLED`, giữ BookingSlot/PaymentProof, nhả locks và tạo đúng một Refund `PENDING` bằng `deposit_amount` trong cùng transaction.

Refund state duy nhất: `PENDING → PROOF_SUBMITTED → REFUNDED`. Owner upload một proof JPEG/PNG hợp lệ khi `PENDING`; `PROOF_SUBMITTED` và `REFUNDED` immutable với Owner. Proof payment/refund dùng authenticated signed URL TTL 300 giây; frontend làm mới theo `meta.server_time`, ẩn URL hết hạn/lỗi và không expose storage identifier.

## Reliability và security

- OWNER capability, User/session ACTIVE và Facility ownership được backend enforce; cross-owner trả 404. Mutation dùng Origin + CSRF.
- Transaction lock order giữ User IDs tăng dần/deduplicate → Facility → Court → Booking → PaymentProof/Refund → slot locks liên quan; recheck state sau lock.
- 409, network/5xx và malformed mutation 2xx không được optimistic retry; frontend refetch authoritative Booking Detail. Unknown-result khóa hành động phụ thuộc cho đến khi xác minh được state.
- `useOwnerRead` hủy request cũ khi resource thay đổi và giữ snapshot trong background refresh. Blocking error chỉ thay page khi chưa có snapshot; refresh lỗi giữ detail gần nhất kèm cảnh báo/retry. Proof request có AbortController + generation guard; response cũ không ghi đè resource mới.
- Owner Booking Detail và proof DTO dùng exact whitelist, state/timestamp validation, resource ID matching và fail closed; không render internal path hoặc malformed response.

## Approved references

- `owner-payment-review-desktop.png`: historical presentation reference cho payment review.
- `owner-booking-confirmed-cancellation-desktop.png`: CURRENT/APPROVED cho state `CONFIRMED` và modal hủy.
- `owner-booking-refund-desktop.png`: CURRENT/APPROVED cho Refund trong Owner Booking Detail.

Các reference chỉ quyết định presentation. Source/spec/API hiện hành quyết định capability, dữ liệu và transition.

## Audit result

Schema và backend contract đủ; không cần migration. Audit phát hiện validator frontend của Owner Booking Detail/PaymentProof trước đây còn nông và render path che snapshot khi background refresh lỗi. Hai gap đã được đóng bằng exact response validation, snapshot-preserving error presentation và regression tests; không đổi response contract hay business logic. Visual redesign có thể bắt đầu từ baseline này.
