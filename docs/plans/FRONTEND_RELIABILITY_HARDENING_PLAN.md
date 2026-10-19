# Frontend Reliability Hardening Plan

## SCOPE

Triển khai P0/P1 đã duyệt cho phân loại request, read state, private proof và stale-request protection; không đổi backend, database hay nghiệp vụ.

## EXISTING REUSE

- Giữ `api`, `useBookingRead`, `useOwnerRead`, Auth Context và response validators hiện có.
- Dùng DTO `server_time` cùng `performance.now()` để theo dõi TTL URL riêng tư.

## IMPLEMENTATION ORDER

1. Phân biệt cancel, timeout, network và response/API error.
2. Giữ snapshot khi background refetch; thêm abort/generation cho Owner/Admin reads.
3. Dùng helper TTL/delivery chung cho PaymentProof và Refund proof.
4. Chặn stale Owner proof khi đổi booking nhanh.
5. Bổ sung targeted tests, chạy full regression/lint/build/diff check.
6. Chỉ cập nhật documentation sau khi toàn bộ validation pass.

## VALIDATION/SECURITY

Giữ session, capability, ownership, CSRF/Origin, private Cloudinary delivery, TTL và fail-closed validation. Không retry mutation hoặc lộ URL/path nội bộ trong lỗi.

## RISKS/SAFETY

- Không tạo refresh loop khi URL lỗi lặp lại.
- Request cũ/đã abort không được commit UI.
- Không che initial error; background error phải giữ snapshot và có retry.

## BLOCKERS

Không có blocker contract hoặc schema.
