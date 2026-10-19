import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../../services/api';
import { facilityListResponse } from '../../services/responseValidators';
import { useAuth } from '../auth/useAuth';
import { Header, Footer } from '../facilities/PublicLayout';
import { FacilityCard } from '../facilities/FacilityCard';
import districts from '../../generated/districts.json';
import '../facilities/facilities.css';
import './home.css';
import { usePublicRead } from '../facilities/usePublicRead';
import { addDays, localSearchDate, timeOptions, validateSearchInterval } from '../facilities/guestSearch';

const areaLink = district => '/facilities' + (district ? '?' + new URLSearchParams({district}) : '');
function Facilities() {
  const read=usePublicRead('/facilities?page=1&page_size=4',facilityListResponse);
  const loading=read.loading, finished={value:read.value,error:read.error};
  return <section className="home-section home-facilities"><div className="home-section-inner"><div className="home-section-heading"><div><p className="home-kicker">KHÁM PHÁ SÂN CHƠI</p><h2>Sân cầu lông tại Đà Nẵng</h2><p>Thông tin cơ sở rõ ràng để bạn chọn nơi chơi phù hợp.</p></div><Link to="/facilities">Xem tất cả <span aria-hidden="true">→</span></Link></div>
    {read.busy&&read.value&&<p role="status">Đang cập nhật danh sách sân…</p>}{read.refreshError&&read.value&&<div className="fl-state home-showcase-state" role="alert"><p>Không thể cập nhật dữ liệu mới nhất. Danh sách gần nhất vẫn được giữ lại.</p><button onClick={()=>void read.refresh()}>Thử lại</button></div>}<div aria-busy={loading}>{loading ? <><p className="sr-only" role="status">Đang tải danh sách sân…</p><div className="home-grid" aria-hidden="true">{[1,2,3,4].map(i=><div className="home-card-skeleton" key={i}><span/><div><i/><i/><i/><b/></div></div>)}</div></> : finished.error ? <div className="fl-state home-showcase-state" role="alert"><p>{errorMessage(finished.error)}</p><button onClick={()=>void read.refresh()}>Thử lại danh sách</button></div> : !finished.value.data.length ? <div className="fl-state home-showcase-state" role="status"><strong>Chưa có cơ sở để giới thiệu</strong><p>Hãy quay lại sau hoặc xem toàn bộ danh sách sân hiện có.</p><Link to="/facilities">Xem danh sách sân</Link></div> : <div className="home-grid">{finished.value.data.map((f,index)=><FacilityCard key={f.id+(f.cover_image_url||'')} facility={f} variant="home" eager={index===0}/>)}</div>}</div>
  </div></section>;
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
  return <section className="home-owner"><div className="home-owner-lines" aria-hidden="true"/><div><p className="home-kicker">DÀNH CHO CHỦ SÂN</p><h2>Đưa cơ sở của bạn<br/>đến gần người chơi hơn</h2></div><div>{content}</div></section>;
}
const steps=[['⌕','Tìm sân','Tìm cơ sở theo khu vực.'],['▦','Chọn lịch','Xem lịch và chọn các slot 30 phút liên tiếp.'],['₫','Đặt cọc','Chuyển khoản cọc và gửi minh chứng.'],['🏸','Đến sân và chơi','Chờ chủ sân xác nhận rồi đến sân.']];
const benefits=[['⌖','Theo khu vực','Khám phá cơ sở theo phường, xã hoặc đặc khu.'],['▤','Thông tin cơ sở','Xem địa chỉ và giờ hoạt động được công bố.'],['▧','Hình ảnh cơ sở','Tham khảo hình ảnh do cơ sở cung cấp.'],['✓','Tiện ích được công bố','Xem các tiện ích hiện có của cơ sở.'],['♙','Tài khoản cá nhân','Đăng ký và đăng nhập bằng tài khoản của bạn.'],['▣','Trải nghiệm trên nhiều thiết bị','Giao diện thích ứng với máy tính, tablet và điện thoại.']];
export function Home() {
  const today=localSearchDate(), [district,setDistrict]=useState(''), [date,setDate]=useState(today), [startTime,setStartTime]=useState('18:00'), [endTime,setEndTime]=useState('19:00'), [searchError,setSearchError]=useState('');const navigate=useNavigate();
  function submitSearch(event) {
    event.preventDefault();
    const interval={date,start_time:startTime,end_time:endTime}, error=validateSearchInterval(interval,today);
    if(error){setSearchError(error);return;}
    const params=new URLSearchParams(interval);if(district)params.set('district',district);
    navigate('/facilities?'+params);setSearchError('');
  }
  return <div className="fl-page home-page"><Header/><main className="fl-main">
    <section className="home-hero"><div className="home-hero-inner"><div className="home-hero-content"><p className="home-hero-kicker">CẦU LÔNG ĐÀ NẴNG</p><h1>Đặt sân cầu lông<br/><span>tại Đà Nẵng</span><br/>dễ dàng hơn</h1><p>Khám phá các cơ sở cầu lông theo khu vực và chủ động chọn lịch chơi phù hợp.</p>
      <form className="home-search" onSubmit={submitSearch} noValidate><label><span><i aria-hidden="true">⌖</i>Khu vực</span><select aria-label="Khu vực" value={district} onChange={e=>setDistrict(e.target.value)}><option value="">Tất cả khu vực</option>{districts.map(d=><option key={d}>{d}</option>)}</select></label><label><span><i aria-hidden="true">▣</i>Ngày chơi</span><input aria-label="Ngày chơi" type="date" value={date} min={today} max={addDays(today,30)} onChange={e=>setDate(e.target.value)}/></label><label><span><i aria-hidden="true">◷</i>Giờ bắt đầu</span><select aria-label="Giờ bắt đầu" value={startTime} onChange={e=>setStartTime(e.target.value)}>{timeOptions.map(value=><option key={value}>{value}</option>)}</select></label><label><span><i aria-hidden="true">◷</i>Giờ kết thúc</span><select aria-label="Giờ kết thúc" value={endTime} onChange={e=>setEndTime(e.target.value)}>{timeOptions.map(value=><option key={value}>{value}</option>)}</select></label><button className="fl-primary" type="submit">⌕ Tìm sân</button></form>{searchError&&<p role="alert" className="home-search-note">{searchError}</p>}
    </div><div className="home-court-visual" aria-hidden="true"><div className="home-court"><span className="court-net"/><span className="court-center"/><span className="court-service one"/><span className="court-service two"/></div><span className="home-shuttle">✦</span><p>ĐÀ NẴNG<br/><strong>PLAY LOCAL</strong></p></div></div></section>
    <Facilities/>
    <section className="home-areas home-section"><div className="home-section-inner"><div className="home-section-heading"><div><p className="home-kicker">KHÁM PHÁ ĐÀ NẴNG</p><h2>Tìm sân theo khu vực</h2><p>Chọn nhanh phường, xã hoặc đặc khu bạn quan tâm.</p></div></div><div className="home-area-grid">{districts.slice(0,6).map(d=><Link to={areaLink(d)} key={d}><span aria-hidden="true">⌖</span><strong>{d}</strong><i aria-hidden="true">→</i></Link>)}</div></div></section>
    <section className="home-section home-how"><div className="home-section-inner"><div className="home-centered-heading"><p className="home-kicker">ĐẶT SÂN ĐƠN GIẢN</p><h2>Cách đặt sân</h2><p>Từ tìm kiếm đến lúc ra sân trong bốn bước rõ ràng.</p></div><div className="home-steps">{steps.map(([icon,title,text],i)=><div key={title}><span className="home-step-icon" aria-hidden="true">{icon}</span><small>0{i+1}</small><h3>{title}</h3><p>{text}</p></div>)}</div></div></section>
    <section className="home-section home-benefits"><div className="home-section-inner home-benefits-layout"><div className="home-benefits-intro"><p className="home-kicker">TRẢI NGHIỆM RÕ RÀNG</p><h2>Vì sao nên dùng<br/>Cầu Lông ĐN?</h2><p>Thông tin cần thiết được trình bày đúng lúc, giúp bạn tự tin chọn sân và theo dõi lịch chơi.</p></div><div className="home-benefit-grid">{benefits.map(([icon,title,text])=><article key={title}><span aria-hidden="true">{icon}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></div></section>
    <div className="home-section home-owner-wrap"><div className="home-section-inner"><OwnerCTA/></div></div>
  </main><Footer/></div>;
}
