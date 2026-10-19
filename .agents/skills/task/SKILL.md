---
name: task
description: Chia approved implementation plan Cầu Lông ĐN thành các task nhỏ, độc lập và kiểm chứng được.
---

# TASK

Đọc approved spec và plan. Thứ tự thường dùng: shared/domain contract → backend service/routes → response DTO → frontend validator/API → frontend UI → targeted tests → integration/regression → docs; điều chỉnh theo dependency thật.

Mỗi task MUST có:

- `TASK NAME`
- `GOAL`
- `FILES/MODULES`
- `PRECONDITIONS`
- `IMPLEMENTATION REQUIREMENTS`
- `DO NOT`
- `TESTS`
- `PASS CRITERIA`
- `DEPENDENCIES`

Task phải đủ nhỏ để implement, test, review độc lập nhưng không chia vụn vô nghĩa. Gộp thay đổi cần nguyên tử về behavior/transaction. Nêu rõ quyền ghi source, DB, external service và docs; mặc định không được phép nếu plan không nói.

MUST NOT viết code, migration, seed hay thay contract.

## Output

Danh sách task theo thứ tự, evidence cần thu và rollback/cleanup nếu có.

## Stop conditions

Dừng nếu dependency vòng, pass criteria không đo được hoặc plan thiếu contract. Quay lại PLAN/SPEC, không lập task từ giả định.
