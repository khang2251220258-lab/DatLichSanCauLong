# Frontend Reliability Hardening Tasks

## 1. Request classification

- **Goal:** map external abort, internal timeout và network failure thành mã riêng.
- **Files:** `frontend/src/services/api.js`, targeted tests.
- **Pass:** timeout 20 giây giữ nguyên; ba loại lỗi có test độc lập.

## 2. Read-state and stale protection

- **Goal:** initial loading riêng với background refetch; giữ snapshot; abort khi unmount/resource đổi.
- **Files:** Booking/Owner/Admin read hooks và Booking List.
- **Pass:** stale response không overwrite, abort không tạo visible error, background failure giữ data.

## 3. Private proof recovery

- **Goal:** TTL theo server-time + elapsed monotonic; một lần auto refresh cho image error; fallback ổn định và manual retry.
- **Files:** shared private-asset hook, Payment và Refund panels.
- **Pass:** không loop, không render malformed URL, không lộ identifier.

## 4. Owner proof race

- **Goal:** booking A không thể overwrite proof của booking B.
- **Files:** Owner Booking Detail và tests.
- **Pass:** generation/resource key + AbortController được kiểm chứng.

## 5. Verification and docs

- **Tests:** targeted Payment/Refund/Booking/Auth/Owner, full frontend, lint, build, `git diff --check`.
- **Do not:** gọi dịch vụ thật, ghi Supabase, sửa backend/schema/migration/seed.
- **Pass:** toàn bộ command bắt buộc pass trước khi ghi trạng thái implementation vào docs.
