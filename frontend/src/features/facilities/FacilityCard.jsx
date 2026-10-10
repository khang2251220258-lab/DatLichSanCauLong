import { useState } from 'react';
import { Link } from 'react-router';
export function FacilityCard({ facility }) {
  const [failed, setFailed] = useState(false);
  return <article className="fl-card">
    {facility.cover_image_url && !failed ? <img src={facility.cover_image_url} alt={facility.name} onError={() => setFailed(true)} /> : <div className="fl-cover-placeholder">Chưa có ảnh</div>}
    <div className="fl-card-body"><h3>{facility.name}</h3><p className="fl-district"><span aria-hidden="true">⌖ </span>{facility.district}</p><p className="fl-address">{facility.address}</p>
      <ul className="fl-amenities" aria-label="Tiện ích">{facility.amenities.map(a => <li key={a.id}>{a.name}</li>)}</ul>
      <Link className="fl-detail" to={'/facilities/'+facility.id}>Xem chi tiết <span aria-hidden="true">›</span></Link>
    </div></article>;
}
