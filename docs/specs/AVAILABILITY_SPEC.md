# Availability Specification

## Implementation status — 2026-10-07

Backend và frontend Availability một Court/một ngày đã triển khai với sáu state và selection 1–6 slot liên tiếp. Reader vẫn read-only; multi-court/multi-day, realtime, CourtBlock CRUD và expiry worker DEFERRED.

## Trạng thái và phạm vi

Availability Phase 1 — quyết định ngày 2026-10-01, Documentation baseline v1. Backend Phase 1 đã triển khai và kiểm chứng ngày 2026-10-01: local, PostgreSQL Availability và regression PASS. Nguồn nghiệp vụ PROJECT_OVERVIEW, BOOKING_SPEC; schema hiện có đủ, không migration. Không thay Booking state machine, giá/cọc, public Facility hoặc quyền Owner/Admin.

Các quyết định này hoàn thiện contract dự kiến cũ: không đọc ngày quá khứ; PENDING_CONFIRMATION hiển thị HELD; không kiểm tra BankAccount. Không có xung đột với quy tắc slot, expiry và chống double booking đã duyệt.

## API và visibility

GET /api/v1/courts/:court_id/availability?date=YYYY-MM-DD — public/guest, không yêu cầu session. Chỉ đọc khi Court ACTIVE, Facility ACTIVE và Owner User ACTIVE qua Court → Facility → OwnerProfile → User. Không tồn tại hoặc không đạt visibility đều trả 404 RESOURCE_NOT_FOUND; không tiết lộ nguyên nhân nội bộ.

Input chỉ court_id trong path và date trong query. Không facility_id, start/end, pagination, timezone client hoặc bộ lọc khác. Không có thao tác tạo/giữ chỗ khi GET.

## Validation và error contract

| HTTP / code | Điều kiện |
| --- | --- |
| 422 VALIDATION_ERROR | court_id không phải chuỗi số nguyên dương trong PostgreSQL BIGINT theo convention hiện có; unknown query, gồm query ngoài Phase 1 |
| 422 INVALID_DATE | Thiếu date; nhiều giá trị/array/object; không đúng chính xác YYYY-MM-DD; ngày lịch không tồn tại hoặc trước ngày hôm nay tại Asia/Ho_Chi_Minh |
| 404 RESOURCE_NOT_FOUND | ID hợp lệ nhưng Court/Facility/Owner không public hoặc không tồn tại |
| 409 FACILITY_NOT_CONFIGURED | Giờ Facility không hợp lệ theo cấu hình core: biên 30 phút, closing > opening, cùng ngày |
| 409 PRICE_NOT_CONFIGURED | Nhiều PriceRule cùng phủ toàn bộ một slot được sinh; không tự chọn một rule hoặc trả giá giả |
| 503 SERVICE_UNAVAILABLE / 500 INTERNAL_ERROR | Theo error handler hiện có; không lộ SQL, stack, credential hoặc record nội bộ |

date là một string không khoảng trắng, năm bốn chữ số 0001–9999, tháng/ngày có zero-padding, kiểm tra ngày thật và năm nhuận, không cho parser tự rollover (ví dụ ngày 31/02). Chỉ date hôm nay hoặc tương lai theo cùng DB-time snapshot; không đặt giới hạn đặt trước tùy ý cho endpoint đọc một ngày. Booking create giới hạn6slot/3giờ và30ngày theo BOOKING_SPEC; các giới hạn đó không áp dụng cho reader này.

Thứ tự kiểm tra: cấu trúc query/path/date và ngày theo DB time → visibility → cấu hình giờ/giá → response. Query sai phải bị từ chối, không silently ignore. Error envelope giữ API_SPEC: error.code/message/details và meta.server_time/request_id; details không chứa dữ liệu nhạy cảm.

## Time và slot model

- Timezone cố định Asia/Ho_Chi_Minh; date là ngày địa phương cơ sở, không phải ngày UTC hoặc timezone máy khách.
- Lấy đúng một clock_timestamp() từ DB trong snapshot đọc nhất quán; dùng cùng giá trị cho ngày hôm nay, so sánh PAST, expiry và meta.server_time. Không lấy now riêng cho từng slot, không dùng đồng hồ browser.
- Mỗi slot đúng 30 phút, khoảng nửa mở [start_at,end_at), ranh giới :00/:30, giây/millisecond bằng 0.
- Kết hợp date với opening_time/closing_time của Facility theo timezone trên. Chỉ sinh slot nằm hoàn toàn trong khoảng mở cửa, order start_at ASC; không slot ngoài giờ, không qua đêm. Giờ core hiện tại 00:00–23:30, phút 00/30, closing > opening.
- start_at/end_at trả ISO 8601 UTC có Z. Không dùng ngày neo 1970 trong biểu diễn Prisma TIME như ngày đặt thực tế. Chuyển timezone bằng quy tắc zone đã chốt, không dựa timezone tiến trình.
- Với hôm nay, start_at <= DB snapshot time → PAST, gồm đúng thời điểm bắt đầu và slot đang diễn ra. Ngày hôm nay đã đóng cửa vẫn trả các slot của ngày với state PAST. Ngày quá khứ bị từ chối, không trả lịch sử PAST.

## Occupancy và state priority

State chỉ gồm PAST, BLOCKED, BOOKED, HELD, UNPRICED, AVAILABLE. Chọn state theo thứ tự ưu tiên:

PAST > BLOCKED > BOOKED > HELD > UNPRICED > AVAILABLE.

| Điều kiện | State ứng viên |
| --- | --- |
| start_at <= DB time cho hôm nay | PAST |
| Bất kỳ CourtBlock overlap slot | BLOCKED |
| Booking CONFIRMED overlap slot | BOOKED |
| Booking PENDING_CONFIRMATION overlap slot | HELD, không xét expires_at |
| Booking PENDING_PAYMENT overlap slot và DB time < expires_at | HELD |
| Không có PriceRule phủ toàn slot | UNPRICED |
| Không điều kiện ưu tiên nào ở trên | AVAILABLE |

Overlap: a.start_at < b.end_at AND b.start_at < a.end_at. Chạm biên không overlap; block không cần căn biên nửa giờ. Nhiều block overlap vẫn BLOCKED. Priority không cấp quyền writer tạo block đè booking: quy tắc chống xung đột khi ghi giữ nguyên.

PENDING_PAYMENT với DB time >= expires_at không chặn, kể cả lock vật lý còn. CANCELLED/REJECTED/EXPIRED/COMPLETED không chặn. PENDING_CONFIRMATION không countdown 5 phút, không tự expire; HELD ở đây không hứa một thời hạn tự giải phóng.

## Nguồn đọc và giới hạn read-only

Booking.status/expires_at và khoảng Booking là nguồn điều kiện chiếm dụng hiệu lực của Court. Đọc Booking liên quan khoảng ngày/slot và CourtBlock theo Court trong cùng snapshot; có thể truy quan hệ CourtSlotLock → BookingSlot → Booking nhưng không dùng sự tồn tại/thiếu lock đơn thuần thay kiểm tra Booking hiệu lực. Không được trả AVAILABLE cho booking giữ chỗ chỉ vì thiếu lock; không coi lock của booking hết hạn/kết thúc là còn hiệu lực. Đây là logic đọc, không sửa dữ liệu bất nhất.

BookingSlot giữ lịch sử và giá snapshot, không phải bảng lịch trống. CourtSlotLock là lớp bảo vệ uniqueness vật lý ở writer; không được tạo khi xem Availability. Reader không tạo Booking/BookingSlot/lock, không cleanup/expire/delete hoặc cập nhật timestamp. Việc cấp/nhả lock và sửa state thuộc transaction Booking/expiry sau này.

## Price và AVAILABLE

Giá hiện hành lấy từ PriceRule của Facility, chung Court và lặp hằng ngày. Rule phủ toàn slot khi start_time <= slot local start và end_time >= slot local end.

- Đúng một rule: slot_amount = hourly_rate / 2, decimal chính xác, không làm tròn từng slot. DTO là decimal string, ví dụ "40000" hoặc "40000.5" khi hourly_rate lẻ; không JSON float.
- Không rule: slot_amount=null; state UNPRICED nếu không có state ưu tiên cao hơn. Không dùng giá0.
- State PAST/BLOCKED/BOOKED/HELD vẫn trả slot_amount nếu xác định duy nhất được, ngược lại null khi không có rule.
- Nhiều rule phủ cùng một slot: từ chối toàn response bằng409 PRICE_NOT_CONFIGURED, kể cả slot đó có state ưu tiên cao hơn. Không trả response thành công từng phần hoặc chọn giá tùy ý.

Không trả total quote/cọc/remaining trong Phase 1. Giá Availability chỉ dự kiến, không ghi snapshot; Booking tự đọc/tính và chụp giá lúc tạo. Không thay công thức tổng/cọc30%/remaining70% đã chốt.

Không kiểm tra BankAccount hoặc CancellationPolicy để quyết định availability. AVAILABLE chỉ mô tả slot theo lịch, giá và trạng thái ở thời điểm đọc; không bảo đảm đủ điều kiện tạo Booking hoặc giữ chỗ. Booking phải kiểm tra ngân hàng, Customer và toàn bộ điều kiện lại. Không thêm field/enum BOOKABLE hoặc booking_ready.

## Response whitelist

HTTP200, envelope {data,meta}. data chỉ gồm court_id (string), date (YYYY-MM-DD), timezone="Asia/Ho_Chi_Minh", slot_minutes=30, slots (array start_at ASC). meta.server_time là DB-time snapshot ISO UTC có Z dùng để tính toàn response.

Mỗi slot chỉ có start_at, end_at, state, slot_amount (decimal string hoặc null, luôn hiện diện). Không trả booking/customer/proof/BookingSlot/lock/block/PriceRule IDs, owner_id, lý do block, metadata nội bộ, BankAccount hoặc credential. court_id là định danh public bắt buộc đã có trong request. Không kèm hold expires_at hoặc countdown cho HELD vì state này bao gồm PENDING_CONFIRMATION không expiry.

## Concurrency và database

Implementation dùng transaction PostgreSQL READ ONLY, isolation RepeatableRead, một DB-time snapshot, đọc cấu hình/Booking/blocks theo batch cho một Court/ngày; không query từng slot, không row lock ghi, không gọi dịch vụ ngoài. Response no-store, không cache availability như dữ liệu tĩnh.

A xem AVAILABLE, B đặt trước rồi A đặt: Booking của A phải recheck dưới khóa User IDs tăng dần, loại trùng → Facility → Court → Booking liên quan, dọn expiry ở writer và dùng PK CourtSlotLock(court_id,start_at) để chặn double booking; thất bại trả SLOT_UNAVAILABLE. Không chuyển logic này vào GET và không triển khai writer ở Phase 1.

Schema hiện có đủ: Facility/Court/Owner/User, PriceRule, CourtBlock, Booking, BookingSlot, CourtSlotLock. Index CourtBlock/Booking(court_id,start_at,end_at), PriceRule(facility_id,start_time), PK lock(court_id,start_at), UNIQUE booking_slot_id, BookingSlot(booking_id,start_at)/(booking_id,end_at) đã có. Không index/migration mới khi chưa có bằng chứng query plan cần; không sửa initial migration.

## Deferred và kiểm chứng

Deferred: total quote, multi-court/multi-day search, CourtBlock CRUD, Booking creation, expiry worker, realtime, frontend. Giới hạn Booking tối đa và các TODO vận hành không được suy thành giới hạn Availability Phase 1.

Local/integration tests bao phủ: guest/visibility404; date thiếu/sai/lặp/quá khứ/năm nhuận; local midnight/UTC mapping; slot boundaries/PAST equality; mọi Booking state và đúng expires_at; CourtBlock chạm biên/overlap; priority; rule0/1/nhiều và giá slot lẻ; DTO không leak; một mốc DB time; không ghi/cleanup dù expired lock tồn tại; trạng thái live và historical slots. Fixture riêng cleanup/rollback, regression theo AGENTS; không network/email thật. Availability local 5/5 và PostgreSQL 6/6 PASS; kết quả regression tổng hợp tại FEATURE_STATUS.

## Liên kết Booking Phase 1 — 2026-10-04

Booking create/list/detail và lazy expiry đã triển khai theo BOOKING_SPEC. Không thay implementation Availability: endpoint này tiếp tục READ ONLY và bỏ hold hết hiệu lực, không cleanup/expire/delete lock. Giới hạn create 6 slot/30 ngày không giới hạn ngày được đọc qua Availability. Worker vẫn deferred.
