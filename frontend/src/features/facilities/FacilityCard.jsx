import { useState } from 'react';
import { Link } from 'react-router';
const weekdayLabels=['','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];
export function FacilityCard({ facility, variant = '', eager = false, detailPath, recurring, onRecurringCourt }) {
  const [failed, setFailed] = useState(false);
  const initial = facility.name.trim().slice(0, 1).toLocaleUpperCase('vi-VN');
  const home = variant === 'home';
  const visibleAmenities = home ? facility.amenities.slice(0, 3) : facility.amenities;
  const hiddenAmenityCount = facility.amenities.length - visibleAmenities.length;
  return <article className={'fl-card' + (variant ? ' fl-card-' + variant : '')}>
    <div className="fl-card-media">{facility.cover_image_url && !failed ? <img src={facility.cover_image_url} alt={facility.name} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" onError={() => setFailed(true)} /> : <div className="fl-cover-placeholder"><strong aria-hidden="true">{initial}</strong><span>Chưa có ảnh</span></div>}</div>
    <div className="fl-card-body"><h3>{facility.name}</h3><div className="fl-location"><p className="fl-district"><span aria-hidden="true">⌖ </span>{facility.district}</p><p className="fl-address">{facility.address}</p></div>
      <ul className="fl-amenities" aria-label="Tiện ích">{visibleAmenities.map(a => <li key={a.id}>{a.name}</li>)}{hiddenAmenityCount > 0 && <li className="fl-amenity-more">+{hiddenAmenityCount} tiện ích</li>}</ul>
      {facility.matching_courts && <div className="fl-matching"><strong>{recurring?'Phù hợp toàn bộ lịch':'Phù hợp với thời gian đã chọn'}</strong>{recurring&&<p>{weekdayLabels[Number(recurring.weekday)]} · {recurring.start_time}–{recurring.end_time}<br/>{recurring.start_date} → {recurring.end_date} · {recurring.occurrence_count} buổi</p>}<ul>{facility.matching_courts.map(court=><li key={court.id}><span>{court.name}</span>{recurring&&<button type="button" onClick={()=>onRecurringCourt(court)}>Chọn lịch cố định</button>}</li>)}</ul><small>Kết quả tại thời điểm tìm kiếm; hệ thống sẽ kiểm tra lại khi đặt.</small></div>}
      <Link className="fl-detail" to={detailPath || '/facilities/'+facility.id}>{home ? 'Xem sân' : 'Xem chi tiết'} <span aria-hidden="true">›</span></Link>
    </div></article>;
}
