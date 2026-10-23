# Authentication Specification

## Implementation status — 2026-10-07

Backend register/login/session/logout/forgot/reset/change và frontend login/register/forgot/reset/change-password trong Account Center đã triển khai. Google Login dùng OAuth authorization-code qua backend; Google-only account không được dùng reset/change để tạo local password.

## Phạm vi và mô hình phiên

Documentation baseline: v1. Tuân [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md). Approved Owner = Customer capabilities + Owner capabilities; User status ACTIVE/LOCKED.

Thiết kế đơn giản: users.role là CUSTOMER hoặc ADMIN; với CUSTOMER, có owner_profiles được tạo qua request APPROVED thì bổ sung capability OWNER. API trả role và capabilities do backend suy ra: [CUSTOMER], [CUSTOMER, OWNER] hoặc [ADMIN]. Không thay CUSTOMER thành OWNER, không cần bảng role/permission tổng quát. Cả hai capability dùng cùng user_id và cùng phiên; xem PERMISSION_SPEC.

Session phía server dùng opaque token trong cookie HttpOnly, Secure khi deploy, SameSite=Lax; DB lưu token_hash, user_id, expires_at, revoked_at. Thời hạn phiên cố định 7 ngày, không gia hạn tự động. Không JWT/localStorage token. Request ghi dùng CSRF/Origin, GET /auth/session trả user + capabilities + has_local_password + csrf_token. has_local_password là boolean suy ra từ password_hash khác NULL, chỉ trả cho chính User đã đăng nhập để UI biết có form đổi mật khẩu cục bộ. Backend đọc trạng thái User và OwnerProfile, không tin quyền được gửi từ client hoặc cache quyền cũ trong UI.

## Registration

Nhận full_name, email, password; tạo CUSTOMER ACTIVE, không OwnerProfile. Email chuẩn hóa và UNIQUE email_normalized. Hash password bằng Argon2id theo ARCHITECTURE. Không nhận role/capabilities/status, không log mật khẩu. Đăng ký trả user công khai, chưa tự login. Password policy và tham số hash đã chốt dưới đây; Booking Phase 1 không yêu cầu phone. Không tự thêm xác thực email đăng ký hoặc đổi email vì email reset không tự mở rộng các flow đó.

## Login và Logout

Login nhận email/password, kiểm tra hash và ACTIVE, trả user (role, capabilities), csrf_token và set cookie. Thông tin sai trả INVALID_CREDENTIALS chung. Rate limit theo IP/tài khoản chuẩn hóa; ngưỡng đã chốt dưới đây.

Frontend sau login phải đọc lại `GET /auth/session` và dùng User/capabilities authoritative của phiên mới trước khi điều hướng. Destination trong Router state chỉ được phục hồi khi là route cấp collection/public phù hợp capability mới; URL resource-scoped có ownership như Booking/Facility detail không được mang qua lần đổi tài khoản. Nếu destination không phù hợp, landing là `/admin/facilities` cho ADMIN, `/owner/facilities` cho OWNER và `/` cho CUSTOMER.

Logout revoke phiên hiện tại và clear cookie; 204 kể cả đã hết phiên. Frontend xóa session/capability state, thay route hiện tại bằng `/login` và xóa Router state để protected URL của tài khoản cũ không trở thành redirect của lần login sau. Khóa User thu hồi tất cả phiên; không tự hủy booking. GET /auth/session không trả password_hash, token_hash hoặc Google tokens.

## Google Login và Google-only Account

Google OAuth authorization code qua backend với scopes `openid email profile`; backend trao đổi code và dùng `google-auth-library` xác minh signature, issuer, audience, expiry, `sub`, email normalized và `email_verified=true`. State là CSPRNG, ký, HttpOnly, SameSite=Lax, hạn 10 phút và single-use trong backend process; callback luôn clear state cookie. Không đưa code, ID/access/refresh token hoặc client secret về frontend/log/query redirect.

Lưu `google_subject` UNIQUE. Subject đã có → đăng nhập đúng User ACTIVE, không ghi đè profile/capabilities. Subject mới/email chưa có → tạo CUSTOMER ACTIVE với `password_hash=NULL`; dùng `name` đã xác minh nếu trim 1–150 ký tự, còn thiếu/không hợp lệ thì dùng local-part đã normalize của email verified (cắt tối đa 150 ký tự) rồi tạo AuthSession hiện hữu. Không tạo OWNER/ADMIN qua Google.

Google-only account tiếp tục dùng Google Login trong MVP: không phát token tạo mật khẩu cục bộ qua Forgot Password, không dùng Reset/Change Password để thêm mật khẩu. Change Password trả 409 PASSWORD_NOT_CONFIGURED và UI hướng dẫn Google Login. Forgot Password vẫn trả 202 cùng thông báo chung như mọi email hợp lệ, không tiết lộ đó là tài khoản Google.

Email Google trùng bất kỳ User khác nhưng subject chưa liên kết → không tự gộp, redirect an toàn về `/login?google=account_exists` và hướng dẫn dùng phương thức đăng nhập đã có. Callback chỉ dùng mã allow-list `success`, `google_cancelled`, `google_failed`, `account_exists`, `account_inactive`; không có redirect tùy ý hoặc lỗi Google thô. Không xây account-linking, màn hình liên kết hoặc API liên kết trong MVP. Không lưu Google access/refresh token khi không cần ngoài đăng nhập.

## Forgot Password — reset qua email

POST /auth/forgot-password nhận email. Response cho mọi email đúng định dạng là 202 với cùng message: “Nếu tài khoản đủ điều kiện, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email của bạn.” Áp dụng cho email không tồn tại, Google-only, tài khoản khóa hoặc có mật khẩu cục bộ; không trả cờ exists, phương thức login hay reset token.

Với tài khoản ACTIVE có password_hash: sinh token bằng bộ sinh số ngẫu nhiên an toàn mật mã, 32 byte ngẫu nhiên mã hóa URL-safe. Token dùng một lần, expires_at = created_at + 15 phút theo DB time. Chỉ lưu SHA-256 token_hash, không raw token trong database/log/response/API analytics. Raw token chỉ tồn tại tạm trong bộ nhớ và liên kết HTTPS gửi tới email của tài khoản.

Khóa User rồi các password_reset_tokens liên quan: vô hiệu token chưa dùng cũ bằng invalidated_at và tạo token mới trong transaction. Gửi email sau commit, ngoài transaction; không lưu raw token vào bảng email/queue để retry. Mất tiến trình/lỗi gửi thì người dùng có thể yêu cầu lại; ghi lỗi vận hành đã loại thông tin nhạy cảm. Không trả lỗi gửi khác nhau theo email có tồn tại. Nếu cấu hình email toàn hệ thống chưa sẵn sàng, 503 AUTH_EMAIL_UNAVAILABLE phải áp dụng đồng nhất trước tra cứu tài khoản, không làm lộ từng email.

Giảm khác biệt thời gian phản hồi: không để request public chờ Resend API chỉ cho email tồn tại; tách gửi email sau khi nhận yêu cầu, rate limit và không log token. Không trả 404/email-not-found. 422 chỉ cho email sai định dạng; 429 theo rate limit, không biểu thị email tồn tại.

Email reset là ngoại lệ auth được cho phép; booking/payment/refund notification vẫn chỉ trong website. Provider đã chốt: Resend API qua official Node.js SDK; không SMTP. Cấu hình RESEND_API_KEY và EMAIL_FROM vẫn cần cung cấp cho môi trường gửi thật.

## Reset Password

POST /auth/reset-password nhận token và new_password. Backend hash token đầu vào để tìm bản ghi, kiểm tra used_at=NULL, invalidated_at=NULL và DB now < expires_at sau khi lấy khóa. Đúng mốc 15 phút cũng hết hạn; token sai/hết hạn/đã dùng/bị vô hiệu hoặc tài khoản không đủ điều kiện đều trả 422 INVALID_RESET_TOKEN, không tiết lộ email.

Khóa User → password_reset_tokens theo cùng thứ tự với forgot/change. Trong một transaction: kiểm tra lại token/User ACTIVE/có password_hash, hash mật khẩu mới, đánh dấu used_at cho token đã dùng, invalidated_at cho các token chưa dùng khác và revoke toàn bộ auth_sessions. Hai request dùng cùng token đồng thời chỉ một request thành công. Rollback không được tiêu thụ token nếu mật khẩu chưa đổi.

Response 200 thông báo đặt lại thành công, clear cookie nếu có và yêu cầu login lại; không tự mở khóa tài khoản, không cấp Owner capability và không đăng nhập tự động. Token chỉ có trong email/link và body reset; không lưu ở localStorage. Trang reset loại token khỏi URL sau khi đọc, không gửi vào telemetry/referrer hay tải tài nguyên bên thứ ba mang token.

## Change Password

POST /auth/change-password cần phiên ACTIVE và CSRF, nhận current_password/new_password. User có password_hash phải xác minh current_password, validate mật khẩu mới, hash rồi transaction đổi hash, revoke toàn bộ session và vô hiệu token reset còn lại. Thành công 200, clear cookie, login lại. Sai mật khẩu cũ trả 422 INVALID_CURRENT_PASSWORD; Google-only trả 409 PASSWORD_NOT_CONFIGURED, tiếp tục Google Login.

## Profile

Shared `/profile` và GET/PATCH `/users/me` đã triển khai cho mọi User ACTIVE. DTO chỉ có id/full_name/email/phone/capabilities/has_local_password. PATCH chỉ cho `full_name` trim 1–150 và `phone` nullable trim tối đa 30 (rỗng thành null), yêu cầu Origin/CSRF và không revoke session. Email hiển thị read-only; đổi email và avatar upload vẫn ngoài contract. Không cho client sửa role/capabilities/status/owner_id. Owner sử dụng cùng hồ sơ Customer, không tạo tài khoản thứ hai.

## Owner Request

Customer ACTIVE chưa có OwnerProfile gọi POST /users/me/owner-requests với body rỗng. MVP sử dụng snapshot full_name/email/phone từ hồ sơ hiện có; không tự yêu cầu giấy tờ hoặc thông tin pháp lý bổ sung. Backend tạo request PENDING cho session.user_id, timestamp server.

Một User tối đa một PENDING cùng lúc: khóa User, kiểm tra chưa có OwnerProfile/PENDING, insert với partial UNIQUE(user_id) WHERE status = 'PENDING' có điều kiện theo DATABASE. Request đồng thời trả 409 REQUEST_ALREADY_PENDING; đã có Owner capability trả 409 ALREADY_OWNER.

GET danh sách/chi tiết request chỉ dữ liệu của chính User, gồm snapshot, status, created_at, reviewed_at và rejection_reason. Admin dùng route admin để đọc/duyệt.

Admin approve chỉ PENDING: khóa User → OwnerRequest, kiểm tra User CUSTOMER ACTIVE chưa có profile, chuyển APPROVED, ghi reviewed_by/reviewed_at, tạo owner_profiles liên kết request. users.role vẫn CUSTOMER, thêm capability OWNER. Giữ nguyên mọi booking/favorite/review/refund của user. Revoke phiên cũ để đăng nhập lại nạp quyền mới; không cấp quyền dựa vào body.

Admin reject chỉ PENDING, bắt buộc rejection_reason dài 1–500 ký tự sau trim. Ghi reviewer/time/reason, giữ bản ghi REJECTED làm lịch sử. Customer được tạo request mới với id mới; không sửa REJECTED về PENDING, không xóa lịch sử. Approve/reject lặp hoặc đồng thời: chỉ một quyết định commit, lần còn lại 409 INVALID_REQUEST_STATE.

Owner approval không tạo hoặc duyệt Facility. Approved Owner có thể tạo Facility DRAFT rồi gửi Facility PENDING để Admin duyệt riêng. Facility REJECTED/SUSPENDED không tự bỏ OwnerProfile hoặc Customer capability. Tạo ADMIN ban đầu bằng CLI nội bộ chủ động `npm run bootstrap:admin` trong backend; không public API đăng ký Admin. CLI nhập password ẩn, từ chối email trùng và không tự chạy lúc startup/deploy.

## Authorization và Security Rules

Backend kiểm tra capability + quyền sở hữu + state. Owner dùng API Customer vẫn scope booking.customer_id=session.user_id; Owner dùng owner/* scope Facility.owner_id=session.user_id. Không dùng users.role === OWNER vì OWNER là capability bổ sung.

cancelled_by lấy từ ngữ cảnh route: Customer cancel route → CUSTOMER, kể cả User có thêm Owner capability; owner cancel route → OWNER. Refund Customer confirmation được Owner thực hiện với tư cách Customer của booking chính mình, không phải xác nhận thay người khác.

Hash password, validate input, query tham số hóa, cookie/CSRF/Origin, HTTPS và rate limiting. Không log token/email reset link/password, không commit secrets. Frontend không phải security boundary.

## Baseline Authentication giai đoạn 1 — 2026-09-23

- Password: 8–128 ký tự Unicode, ít nhất một chữ cái và một chữ số. Không bắt buộc chữ hoa/ký tự đặc biệt; không trim password. Backend validate, không log/lưu raw password.
- Argon2id: memoryCost=19456 KiB, timeCost=2, parallelism=1, hashLength=32. Salt ngẫu nhiên do thư viện tạo; cấu hình tập trung. Benchmark trên hosting trước production nếu cần.
- Session cố định 7 ngày, không tự gia hạn; logout revoke phiên hiện tại ngay.
- Register 5 request/15 phút/IP; login 20 request/15 phút/IP; login thất bại 5 lần/15 phút/email normalized. Request vượt giới hạn trả 429 RATE_LIMITED, không khóa tài khoản. Counter thất bại không reset khi login thành công trong cửa sổ.
- Email trim+lowercase; giữ dấu chấm/+tag, không Gmail normalization. Dùng nhất quán cho register/login/duplicate/rate limit và auth sau này.
- Rate limit memory một process, cửa sổ cố định từ request/lần thất bại đầu tiên; restart reset counter. Login cùng email được tuần tự hóa. Deployment nhiều instance cần shared store; trusted proxy phải cấu hình chính xác trước khi nhận IP qua proxy.

## Phase 2 — Resend và mật khẩu

- Official SDK resend 6.28.1, adapter backend/src/modules/auth/email.js; test inject fake adapter, không gửi ra ngoài. EMAIL_FROM chứa riêng địa chỉ email; backend gắn tên “Đặt sân cầu lông Đà Nẵng”. Development dùng sender hợp lệ theo giới hạn Resend; production phải là domain đã verify, không tự đặt domain hoặc fallback sender.
- Link: FRONTEND_URL/reset-password#token=<RAW_RESET_TOKEN>. HTTPS ở production; development cho localhost HTTP. Không token trong query/log/DB; frontend đọc fragment vào memory rồi xóa khỏi URL.
- Thiếu/sai định dạng cấu hình trả 503 AUTH_EMAIL_UNAVAILABLE trước truy vấn tài khoản, đồng nhất cho mọi email hợp lệ chưa bị rate limit. API key/domain hợp lệ thực tế phải xác minh với provider khi vận hành.
- Forgot: 5 request/15 phút/IP và 3 request/15 phút/email normalized, cùng limiter memory của Phase 1, áp dụng cả email không tồn tại/Google-only/LOCKED. Reset: 10 request/15 phút/IP. HTTP 429 RATE_LIMITED + Retry-After.
- Forgot tạo token trong transaction khóa User, vô hiệu token cũ chưa dùng rồi lưu hash mới. Sau commit và sau response 202 mới gọi Resend; lỗi delivery chỉ log mã AUTH_PASSWORD_RESET_REQUEST_FAILED, không recipient/token/credential/provider payload. Không persistent queue/raw-token retry. Nếu process dừng hoặc gửi lỗi, User yêu cầu lại.
- Reset hash password ngoài transaction để giảm thời gian giữ khóa; transaction khóa User → token, đọc lại eligibility/time bằng clock_timestamp(), đổi password + used_at + invalidated_at các token khác + revoke toàn bộ session. Replay/expired/used/invalidated/Google-only/LOCKED bị từ chối.
- Change cần Origin, session và CSRF; transaction khóa User rồi kiểm tra lại session còn hiệu lực, password hiện tại và trạng thái User. Đổi hash + vô hiệu reset tokens + revoke toàn bộ phiên cùng transaction; clear cookie, yêu cầu login lại. Google-only trả 409 PASSWORD_NOT_CONFIGURED.
- Ngày 2026-09-23: code Phase 2 đã triển khai; tại thời điểm đó thiếu RESEND_API_KEY/EMAIL_FROM, chưa kiểm chứng gửi email thật. Không coi delivery production đã sẵn sàng.

Forgot trả 202 trước khi lookup tài khoản/xử lý token/email để response không phụ thuộc tài khoản tồn tại hoặc độ trễ provider. Sau response, tác vụ memory tạo token trong transaction; chỉ sau commit mới gửi email. Lỗi tác vụ log mã cố định AUTH_PASSWORD_RESET_REQUEST_FAILED. Process dừng có thể mất tác vụ; không lưu queue/raw token, User cần yêu cầu lại. Missing config vẫn trả 503 trước lookup.

## Delivery development đã xác minh — 2026-09-24

Người dùng xác nhận nhận email thật qua Resend sau ACCEPTED. Nội dung single-use, hết hạn 15 phút và link FRONTEND_URL/reset-password#token=... đã được xác nhận. Token lộ trong ảnh đã invalidated an toàn; không gọi Reset bằng token đó, không xóa User test, không gửi lại email. Backend Forgot hoàn tất; không coi frontend reset hoặc delivery production đã hoàn tất.

## Owner Request baseline — 2026-09-25

- Reject bắt buộc rejection_reason là string sau trim dài 1–500 ký tự; rỗng/chỉ whitespace/sai loại/quá 500 trả 422. Không thêm field ngoài contract.
- List Customer/Admin: page integer >=1 mặc định 1; page_size integer 1–100 mặc định 20; thứ tự created_at DESC, id DESC. Admin status tùy chọn PENDING/APPROVED/REJECTED.
- Admin bootstrap là CLI nội bộ chủ động, không HTTP, không tự chạy startup/deploy. Nhập họ tên/email và password ẩn; dùng password policy/Argon2id Auth hiện tại. Email trùng bị từ chối, không promote CUSTOMER; tạo ADMIN ACTIVE, không OwnerProfile/request. Không hard-code/log/commit password/hash.
- Approve khóa Applicant User → OwnerRequest, chỉ PENDING và CUSTOMER ACTIVE chưa có profile; tạo profile, ghi reviewer/DB time, revoke toàn bộ phiên applicant cùng transaction; giữ role CUSTOMER. Login lại nhận CUSTOMER + OWNER.
- Reject chỉ PENDING, ghi lý do đã trim/reviewer/DB time, giữ lịch sử, không tạo profile. Request mới được phép sau reject. Không notification delivery hoặc Facility trong phase này.

## Frontend Auth F1 — 2026-10-02

Đã triển khai /login, /register, /forgot-password, /reset-password theo 6 PNG approved tại docs/ui-reference. React Router, fetch, React Context, system-ui và branding icon + “Cầu Lông ĐN”. PNG quyết định visual; validation/security tiếp tục theo backend.

- Login và session đã authenticated vào /login chuyển về /. Trang / giữ scaffold hiện tại; chưa Home nghiệp vụ.
- Register chỉ full_name/email/password, không phone/Google/auto-login; thành công về /login với thông báo. Email trim+lowercase, password Unicode8–128 có chữ và số, không trim.
- Forgot Sent là state cùng route, thông báo có điều kiện cho mọi response202, không khẳng định delivery. Google ẩn.
- Reset đọc fragment vào memory trước khi router khởi tạo, loại fragment khỏi URL; không storage/log. Confirm password chỉ kiểm tra UI; token thiếu/INVALID_RESET_TOKEN có lối yêu cầu lại. Success cùng route, clear auth state, nút về Login. Reload sau khi fragment bị xóa cần mở lại link còn hiệu lực; không lưu token để phục hồi qua browser storage.
- Session bootstrap GET /auth/session: loading/authenticated/guest/error, chỉ401 thành guest; network/5xx là error có retry chủ động. Request credentials include; API client hỗ trợ204/envelope/error, không retry mutation tự động. CSRF trong memory, request có phiên gửi X-CSRF-Token; bốn public form chỉ theo Origin contract hiện tại. Guard theo capabilities phục vụ UI, không thay backend.
- Loading/error inline, khóa submit đang chạy, password visibility accessible. Không triển khai Change Password/Google hoặc frontend nghiệp vụ khác.

Kiểm chứng: 20 test frontend PASS với HTTP transport giả chỉ trong test; lint không cảnh báo, production build PASS. Browser Edge thật kiểm tra guest session qua backend hiện tại và layout desktop/mobile, không gọi mutation thật/Resend. Không sửa backend/database/.env. Cấu hình VITE_API_BASE_URL phải được cấp cho tiến trình dev/build; thiếu cấu hình hiển thị lỗi, không fallback API giả.
