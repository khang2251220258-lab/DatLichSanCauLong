# Demo Image Sources

Các ảnh dưới đây là illustrative demo images cho dataset academic/development. Chúng không phải ảnh thật của Facility demo. Seed tải bản Wikimedia Commons, resize/crop về WebP 1600×1000 chất lượng 82 và upload vào Cloudinary public image storage. Việc resize/crop là modification theo điều kiện license tương ứng.

| Source page | Author | License |
|---|---|---|
| https://commons.wikimedia.org/wiki/File:SBA_Badminton_Hall.jpg | Vano111ru | CC BY-SA 4.0 |
| https://commons.wikimedia.org/wiki/File:Indoor_badminton_court.jpg | Alanands3 | CC BY-SA 4.0 |
| https://commons.wikimedia.org/wiki/File:Overhead_view_of_indoor_badminton_courts_and_skylight_atrium_at_Universiti_Malaya_Cyberjaya_(250423).jpg | angys | CC BY-SA 4.0 |
| https://commons.wikimedia.org/wiki/File:Paroi_Badminton_Courts.jpg | PulauKakatua19 | CC BY-SA 3.0 |
| https://commons.wikimedia.org/wiki/File:AFMC_Badminton_Court.png | AFMC Official | CC BY 4.0 |
| https://commons.wikimedia.org/wiki/File:Badminton_Court_at_IITD.jpg | Ruturajpol | CC BY-SA 4.0 |
| https://commons.wikimedia.org/wiki/File:Badminton_court_view.jpg | Darakshanehaluddin | CC0 |
| https://commons.wikimedia.org/wiki/File:Badminton_Court_at_IIT_Kharagpur.jpg | AnushkaG2509 | CC BY-SA 4.0 |
| https://commons.wikimedia.org/wiki/File:Badminton_courts.jpg | Wengh | CC BY-SA 4.0 |
| https://commons.wikimedia.org/wiki/File:Kai_Yuet_Court_Badminton_Court.jpg | Knowledge Era | CC BY-SA 4.0 |

## Mapping

Public IDs hiện hành dùng namespace `facility-images/demo-gallery-v2/`. Image seed nhận diện Facility bằng owner demo + exact name, không dùng database ID để tìm hoặc liên kết Facility.

Quality set v2 chỉ sử dụng bốn source indoor rõ ràng, không có caption/watermark lớn và chịu được `object-fit: cover`: `Indoor badminton court.jpg`, `Badminton court view.jpg`, `Badminton Court at IITD.jpg` và `Badminton Court at IIT Kharagpur.jpg`. Các source còn lại trong bảng được giữ để bảo toàn attribution của quality set v1 lịch sử nhưng không còn được image seed hiện hành sử dụng.

- 299: 3 ảnh
- 300: 2 ảnh
- 301: 2 ảnh
- 312: 2 ảnh
- 508: 3 ảnh
- 509: 2 ảnh
- 510: 2 ảnh
- 511: 4 ảnh
- 512: 4 ảnh
- 513: 2 ảnh
- 514–517: mỗi Facility 1 ảnh

Facility 313 có tên E2E/test và không thuộc managed visual demo registry, nên không được image seed thay đổi.

FacilityImage là contract duy nhất hiện có. Court không có image field/relation/API/DTO nên không có Court image seed.
