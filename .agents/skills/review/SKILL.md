---
name: review
description: Review độc lập feature Cầu Lông ĐN bằng source, schema, UI reference, tests và evidence; mặc định read-only.
---

# REVIEW

## Workflow

1. Đọc actual source, không kết luận chỉ từ docs/status.
2. Đối chiếu schema/migration, routes, services, transaction/locking, validators, DTO và frontend API/UI.
3. Kiểm tra approved specs/references; PNG quyết định visual, không chứng minh backend capability.
4. Kiểm tra auth, capability, ownership, Origin/CSRF, malformed-response fail-closed và private path leakage.
5. Tìm state transition sai, race, hidden hard-code, partial implementation, stale docs, missing tests và false COMPLETE.
6. Đối chiếu regression evidence với command thật; chưa chạy không phải PASS.

Review-only MUST NOT sửa application source. Khi user yêu cầu audit, chỉ report issues.

## Output

Evidence, issues theo severity và file/vị trí, contract impact, test gaps, DB/migration impact, blockers, `PASS/ISSUES_FOUND`, `READY FOR NEXT PHASE`.

## Stop conditions

Không PASS khi còn issue hoặc thiếu evidence bắt buộc; không READY khi còn blocker. Nếu source mâu thuẫn approved contract, nêu hai phía và dừng phần phụ thuộc.
