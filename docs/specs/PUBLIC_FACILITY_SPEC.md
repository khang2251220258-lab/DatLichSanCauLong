# Public Facility Specification

## Implementation status — 2026-10-07

Backend Public List/Detail và frontend Home/List/Detail đã triển khai bằng dữ liệu thật. q/district/pagination, public DTO whitelist và visibility rule giữ nguyên. Advanced filter/sort/rating/popularity vẫn DEFERRED; các câu “frontend deferred” bên dưới là lịch sử của phase backend.

## Trạng thái và phạm vi

Public Facility Phase 1 — quyết định đã duyệt ngày 2026-09-29, Documentation baseline v1. Backend Phase 1 đã triển khai và kiểm chứng ngày 2026-10-01; xem FEATURE_STATUS. Nguồn nghiệp vụ: PROJECT_OVERVIEW; dùng API conventions hiện tại. Không thay rule Owner/Admin, booking hoặc Cloudinary.

Đối chiếu Facility Core, Court Core, Booking Configuration và Facility Presentation: không có xung đột. Điều kiện Owner ACTIVE làm rõ visibility còn thiếu; ACTIVE không đồng nghĩa booking-ready. Những yêu cầu search rộng hơn trong tài liệu tổng thể là phạm vi tương lai, không phải contract Phase 1.

## Public visibility

Guest không cần session. Chỉ Facility có status=ACTIVE và Owner User có status=ACTIVE được trả về, qua quan hệ Facility → OwnerProfile → User. Áp dụng cùng predicate cho list, count và detail. Owner LOCKED: loại khỏi list, detail trả 404 RESOURCE_NOT_FOUND giống tài nguyên không tồn tại. DRAFT/PENDING/REJECTED/SUSPENDED cũng không public.

Không thay Facility status trong request đọc. Không cần ảnh, amenity, Court, PriceRule, CancellationPolicy hoặc BankAccount để public. Không kiểm tra slot/availability/ngân hàng để quyết định visibility; không tính hoặc trả booking_ready. Không ảnh hưởng quyền đọc snapshot booking lịch sử.

## GET /api/v1/facilities

HTTP 200, data là array card; meta gồm server_time, page, page_size, total. Không có kết quả trả data=[] và total=0. Order id ASC.

| Query | Contract |
| --- | --- |
| page | Số nguyên >=1, mặc định 1 |
| page_size | Số nguyên 1–100, mặc định 20 |
| q | Một string, trim rồi Unicode NFC; rỗng sau trim coi như không truyền. Tìm contains case-insensitive trên Facility.name hoặc Court.name với Court ACTIVE của Facility đó; một Facility chỉ xuất hiện một lần |
| district | Một string, trim rồi Unicode NFC, so sánh chính xác với registry 94 đơn vị hiện tại; không alias/quận huyện cũ/case-fold. Ngoài registry, gồm giá trị rỗng, trả 422 INVALID_DISTRICT |

Không accent-insensitive hoặc full-text search. Contains là tìm chuỗi literal, không coi ký tự người dùng nhập là SQL wildcard; dùng truy vấn tham số hóa. Không tự áp password/email normalization cho q. Khi có q và district, cả hai điều kiện phải thỏa cùng visibility predicate.

Query sai kiểu, lặp thành array/object, pagination sai hoặc query không được định nghĩa: 422 VALIDATION_ERROR theo convention validation hiện có. Các filter/sort dự kiến nhưng deferred (amenity_ids, min_price, max_price, min_rating, date, start_time, end_time, sort) trả 422 FILTER_NOT_CONFIGURED khi được truyền, không silently ignore, kể cả yêu cầu sort theo id. Phase 1 chỉ dùng default order.

Card whitelist chính xác: id, name, district, address, cover_image_url, amenities. amenities là array {id, name} chỉ is_active=true, order name ASC, id ASC; rỗng trả []. cover_image_url là URL của ảnh đầu theo sort_order ASC, id ASC; thiếu ảnh trả null.

Không representative/min price, rating, Owner data, BankAccount, approval/suspension metadata, public_id/image_path hoặc booking_ready.

## GET /api/v1/facilities/:facility_id

ID theo positive BigInt convention hiện tại; sai định dạng/phạm vi trả 422 VALIDATION_ERROR. Không query; query ngoài contract trả 422 VALIDATION_ERROR. ID hợp lệ nhưng không public/không tồn tại trả 404 RESOURCE_NOT_FOUND. Thành công 200, data là object, meta.server_time.

Whitelist dữ liệu public được cụ thể hóa từ các trường UI hiện có:

| Field | Dữ liệu |
| --- | --- |
| id, name, district, address, phone | Core Facility; id dạng string |
| description | Plain text hoặc null, không render như HTML |
| opening_time, closing_time | HH:mm theo giờ cơ sở |
| latitude, longitude | Decimal string hoặc null từ dữ liệu hiện có; không thêm geocoding/map implementation |
| gallery | Array delivery URL string, order sort_order ASC, id ASC; không ảnh trả [] |
| amenities | Array {id, name}, chỉ ACTIVE, order name ASC, id ASC |
| courts | Array {id, name, description}, chỉ ACTIVE, id ASC; không pagination trong danh sách cơ bản này, rỗng trả [] |
| price_rules | Array {id, start_time, end_time, hourly_rate}, toàn bộ rule hiện hành; giờ HH:mm, giá VND decimal string; order start_time ASC, end_time ASC, id ASC; thiếu trả [] |
| cancellation_policy | {cutoff_hours} hoặc null; không tự đặt cutoff mặc định |

Gallery đầu tiên là cover; không cần trường cover trùng lặp trong detail. Không trả Owner data, BankAccount/QR, review/rating, metadata approval/rejection/suspension, timestamps nội bộ, public_id/image_path hoặc booking_ready. Không spread DTO Owner/Admin sang Public.

Bảng giá chỉ hiển thị cấu hình hiện hành; không tính giá đại diện trên card, không quote tổng/cọc và không bảo đảm mọi khung giờ đặt được. Policy null không được diễn giải là hủy tự do. Giá snapshot booking và tiền cọc 30% không đổi.

## Image delivery

Tái sử dụng adapter Cloudinary hiện có: HTTPS, resource_type=image, type=upload, public_id bất biến trong DB. Public DTO chỉ trả URL, không trả riêng public_id/image_path; URL delivery có thể chứa định danh asset theo cấu trúc Cloudinary. Không upload/destroy hoặc gọi Cloudinary API để dựng response đọc.

Giữ lỗi cấu hình adapter hiện tại: khi cần tạo URL mà storage chưa cấu hình, 503 IMAGE_STORAGE_NOT_CONFIGURED; không dựng URL giả. Gallery rỗng/cover null không cần tạo URL. Public URL đã biết không tự thu hồi khi Owner bị khóa hoặc Facility ngừng public; không thay kiến trúc delivery.

## Kiến trúc đọc và database

Giữ route/controller → service → Prisma trong module facilities; DTO Public riêng. Lọc visibility ở database, không lọc sau pagination. Dùng relation predicate cho tìm Court, tránh nhân bản Facility. Phân trang Facility trước, đọc relations theo batch/bounded query để tránh N+1; không join toàn bộ children rồi limit sai số Facility.

Count/items và các dữ liệu liên quan cần snapshot đọc nhất quán theo convention RepeatableRead hiện có; không row lock ghi hoặc cập nhật dữ liệu trong public GET. id ASC bảo đảm thứ tự xác định trong snapshot, không cam kết offset pagination bất biến giữa nhiều request khi dữ liệu thay đổi.

Schema hiện có đủ: Facility/OwnerProfile/User, FacilityImage, FacilityAmenity/Amenity, Court, PriceRule, CancellationPolicy. Không cần đọc BankAccount hoặc bảng slot cho phase này. Các PK/FK/index hiện hữu hỗ trợ quan hệ; index name không bảo đảm tối ưu mọi contains query. Chỉ cân nhắc index sau bằng chứng query plan khi implementation; hiện không migration/index mới, không sửa initial migration.

## Deferred

Amenity filter và public GET /api/v1/amenities; Owner/Admin Amenity API giữ nguyên. Price filter/sort/representative price, rating/reviews, popularity, date/time availability, advanced/full-text search, booking_ready, Availability/Booking và frontend đều deferred. Không thêm public Court endpoint riêng trong phase này; Court cơ bản được nhúng trong Facility detail. Endpoint dự kiến ở API_SPEC cho các phase sau không thuộc implementation này.

## Kiểm chứng khi implementation

Cần test guest; Facility từng state; Owner ACTIVE/LOCKED; list/count/detail cùng visibility; q trim/NFC/rỗng/case/contains literal và không bỏ dấu; match Court ACTIVE, không INACTIVE, không trùng Facility; district registry/sai/multiple; pagination/order và query deferred bị từ chối.

Kiểm tra whitelist không lộ Owner/bank/metadata/public_id; cover/gallery order và null/[]; chỉ amenities/Courts active; PriceRule order/decimal và []; policy null; ACTIVE thiếu module con vẫn public, không booking_ready. Integration dùng fixture riêng cleanup/rollback, fake image adapter và không email/upload thật. Chạy regression theo AGENTS khi implementation. Spec update không chứng minh test PASS hoặc feature DONE.

## Readiness

Không còn business decision blocker cho phạm vi Phase 1 đã giới hạn. DTO/order cụ thể bên trên là contract đọc cho implementation. Các TODO deferred không chặn phase này. Schema đủ; backend implementation và kiểm chứng đã hoàn tất ngày 2026-10-01. Frontend và các mục deferred chưa triển khai.

## Kết quả implementation — 2026-10-01

Code tại backend/src/modules/facilities/public/, app.js mount hai GET routes không auth. Cache-Control no-store để không giữ response visibility cũ; DTO whitelist, query validation và RepeatableRead theo spec. Nested Prisma relation selection không có loop query từng card. Không dependency/schema/migration mới.

Public local3/3 trong local32/32; Public PostgreSQL8/8; regression83/83 PASS, health200, fixture cleanup/rollback. Không email hoặc Cloudinary upload thật. Kế hoạch kiểm chứng bên trên đã được thực hiện cho Phase 1; xem FEATURE_STATUS. READY chỉ backend.
