import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage } from '../../services/api';
import { facilityListResponse } from '../../services/responseValidators';
import { useAuth } from '../auth/useAuth';
import { Header, Footer } from '../facilities/PublicLayout';
import { FacilityCard } from '../facilities/FacilityCard';
import districts from '../../generated/districts.json';
import '../facilities/facilities.css';
import './home.css';

const areaLink = district => '/facilities' + (district ? '?' + new URLSearchParams({district}) : '');
function Facilities() {
  const [attempt,setAttempt] = useState(0), [finished,setFinished] = useState(null);
  useEffect(()=>{
    const controller=new AbortController();let current=true;
    api('/facilities?page=1&page_size=4',{signal:controller.signal,validate:facilityListResponse})
      .then(value=>{if(current)setFinished({attempt,value});})
      .catch(error=>{if(current)setFinished({attempt,error});});
    return ()=>{current=false;controller.abort();};
  },[attempt]);
  const loading=finished?.attempt!==attempt;
  return <section className="home-section"><div className="home-section-heading"><div><h2>Sân cầu lông</h2><p>Khám phá các cơ sở tại Đà Nẵng.</p></div><Link to="/facilities">Xem tất cả ›</Link></div>
    <div aria-busy={loading}>{loading ? <><p role="status">Đang tải danh sách sân…</p><div className="home-grid" aria-hidden="true">{[1,2,3,4].map(i=><div className="fl-skeleton" key={i}/>)}</div></> : finished.error ? <div className="fl-state" role="alert"><p>{errorMessage(finished.error)}</p><button onClick={()=>setAttempt(n=>n+1)}>Thử lại danh sách</button></div> : !finished.value.data.length ? <p className="fl-state" role="status">Chưa có cơ sở để hiển thị.</p> : <div className="home-grid">{finished.value.data.map(f=><FacilityCard key={f.id+(f.cover_image_url||'')} facility={f}/>)}</div>}</div>
  </section>;
}
function OwnerCTA() {
  const auth=useAuth();
  let content;
  if(auth.status==='guest')content=<><p>Đăng nhập bằng tài khoản của bạn để gửi yêu cầu trở thành chủ sân.</p><Link className="home-owner-link" to="/login" state={{from:'/owner-request'}}>Đăng nhập ›</Link></>;
  else if(auth.status==='loading')content=<p>Đang kiểm tra phiên…</p>;
  else if(auth.status==='error')content=<p>Chưa thể kiểm tra phiên. Vui lòng thử lại ở phần đầu trang.</p>;
  else if(auth.user.capabilities.includes('OWNER'))content=<><p>Bạn có thể quản lý cơ sở, sân, bảng giá và đơn đặt sân của mình.</p><Link className="home-owner-link" to="/owner/facilities">Quản lý cơ sở ›</Link></>;
  else if(auth.user.capabilities.includes('CUSTOMER'))content=<><p>Gửi yêu cầu để bắt đầu quản lý cơ sở và sân của bạn.</p><Link className="home-owner-link" to="/owner-request">Đăng ký trở thành chủ sân ›</Link></>;
  else return null;
  return <section className="home-owner"><div><p>Dành cho chủ sân</p><h2>Bạn đang kinh doanh<br/>sân cầu lông?</h2></div><div>{content}</div></section>;
}
const steps=[['⌕','Tìm sân','Tìm cơ sở theo khu vực.'],['▦','Chọn lịch','Xem lịch và chọn các slot 30 phút liên tiếp.'],['₫','Đặt cọc','Chuyển khoản cọc và gửi minh chứng.'],['🏸','Đến sân và chơi','Chờ chủ sân xác nhận rồi đến sân.']];
const benefits=[['⌖','Theo khu vực','Khám phá cơ sở theo phường, xã hoặc đặc khu.'],['▤','Thông tin cơ sở','Xem địa chỉ và giờ hoạt động được công bố.'],['▧','Hình ảnh cơ sở','Tham khảo hình ảnh do cơ sở cung cấp.'],['✓','Tiện ích được công bố','Xem các tiện ích hiện có của cơ sở.'],['♙','Tài khoản cá nhân','Đăng ký và đăng nhập bằng tài khoản của bạn.'],['▣','Trải nghiệm trên nhiều thiết bị','Giao diện thích ứng với máy tính, tablet và điện thoại.']];
export function Home() {
  const [district,setDistrict]=useState('');const navigate=useNavigate();
  return <div className="fl-page home-page"><Header/><main className="fl-main">
    <section className="home-hero"><div className="home-hero-art" aria-hidden="true">🏸</div><div className="home-hero-content"><h1>Đặt sân cầu lông<br/><span>tại Đà Nẵng</span><br/>dễ dàng hơn</h1><p>Khám phá các cơ sở cầu lông tại Đà Nẵng theo khu vực.</p>
      <form className="home-search" onSubmit={e=>{e.preventDefault();navigate(areaLink(district));}}><label>Khu vực<select value={district} onChange={e=>setDistrict(e.target.value)}><option value="">Tất cả khu vực</option>{districts.map(d=><option key={d}>{d}</option>)}</select></label><label>Ngày chơi<input disabled placeholder="Chưa hỗ trợ" aria-describedby="home-search-note"/></label><label>Giờ bắt đầu<input disabled placeholder="Chưa hỗ trợ" aria-describedby="home-search-note"/></label><button className="fl-primary" type="submit">⌕ Tìm sân</button></form><p id="home-search-note" className="home-search-note">Chưa hỗ trợ lọc theo ngày/giờ. Tìm sân chỉ áp dụng khu vực.</p>
    </div></section>
    <Facilities/>
    <section className="home-areas home-section"><h2>Tìm sân theo khu vực</h2><p>Khám phá theo phường/xã/đặc khu</p><div className="home-area-grid">{districts.slice(0,6).map(d=><Link to={areaLink(d)} key={d}><span aria-hidden="true">⌖</span>{d}</Link>)}</div></section>
    <section className="home-section home-how"><h2>Cách đặt sân</h2><p>Tìm cơ sở, chọn khung giờ, đặt sân và theo dõi trạng thái trực tuyến.</p><div className="home-steps">{steps.map(([icon,title,text],i)=><div key={title}><span className="home-step-icon" aria-hidden="true">{icon}<small>{i+1}</small></span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
    <section className="home-section home-benefits"><h2>Vì sao nên dùng Cầu Lông ĐN?</h2><p>Thông tin rõ ràng, trải nghiệm thuận tiện.</p><div className="home-benefit-grid">{benefits.map(([icon,title,text])=><article key={title}><span aria-hidden="true">{icon}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <div className="home-section"><OwnerCTA/></div>
  </main><Footer/></div>;
}
