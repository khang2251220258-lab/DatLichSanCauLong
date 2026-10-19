# Owner Workspace Shell Redesign Plan

## Scope

Phase 1 chỉ thay presentation của shell áp dụng cho các route `/owner/*`: header Owner, sidebar hai mục, workspace container và responsive. Nội dung Facility/Booking, API, state machine và reliability behavior giữ nguyên.

## Existing reuse

- `OwnerLayout`, `useOwnerRead` và Owner route guards hiện hành.
- Shared Header/Auth logout và role-switch behavior.
- Product tokens trong `frontend/src/styles/tokens.css`.
- Owner feature pages và tests hiện có.

## Implementation order

1. Thêm presentation variant Owner cho shared Header mà không đổi session/logout.
2. Cập nhật `OwnerLayout`: đúng hai navigation item, route-derived active state, `aria-current`, workspace landmark.
3. Chuyển shell-level CSS sang product tokens và responsive desktop/tablet/mobile.
4. Bổ sung regression cho shell/navigation/logout; chạy targeted, full frontend, lint, build và diff check.

## Risks and safety

- Không thay `useOwnerRead`, API client, route guards hay return-path security.
- Không thay markup/action riêng của Facility, Booking, Payment, cancellation hoặc Refund.
- Không thêm route, API, data, dependency, backend hoặc database change.

## Blockers

Không có.
