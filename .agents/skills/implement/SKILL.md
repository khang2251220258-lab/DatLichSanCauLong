---
name: implement
description: Triển khai application source Cầu Lông ĐN theo approved spec, plan và task; dùng khi người dùng yêu cầu code hoặc feature.
---

# IMPLEMENT

Đây là skill duy nhất mặc định được sửa application source.

## Workflow

1. Đọc `AGENTS.md`, approved spec/plan/task và actual source trước khi patch.
2. Kiểm tra contract phù hợp schema/source; tái sử dụng module, validator, API client, layout và test pattern.
3. Thực hiện change nhỏ nhất đủ contract; không đổi business rule hay mở rộng scope.
4. Backend MUST enforce authentication, capability, ownership, validation, DTO whitelist, Origin/CSRF và server-managed fields. Mutation trạng thái/tiền/slot dùng DB time, transaction và lock order đã duyệt.
5. Private media đi qua authorized delivery; không trả storage identifier/path nội bộ.
6. Frontend dùng strict response validation, backend là authority, bám approved PNG, giữ accessibility/responsive và không hard-code presentation data.
7. Không migration nếu task không cho phép và chưa chứng minh schema thiếu. Không seed/mutate demo data.
8. Chuyển sang TEST; build riêng lẻ không đủ để tuyên bố COMPLETE.

## Output

Behavior, files thay đổi, security/transaction decisions, tests cần chạy và giới hạn thực tế.

## Stop conditions

STOP nếu source/schema làm contract không khả thi, lock order mâu thuẫn, cần migration ngoài scope hoặc thiếu quyết định. Báo blocker, không tự sửa contract.
