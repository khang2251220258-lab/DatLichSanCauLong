import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Header, Footer } from '../facilities/PublicLayout';
import districts from '../../generated/districts.json';
import { addDays, localSearchDate, timeOptions, validateSearchInterval } from '../facilities/guestSearch';
import './home.css';

const quickDistricts = districts.slice(0, 6);
const districtPath = district => `/facilities?${new URLSearchParams({ district })}`;

export function Home() {
  const today = localSearchDate(), navigate = useNavigate();
  const [q, setQ] = useState(''), [district, setDistrict] = useState(''), [date, setDate] = useState(today), [startTime, setStartTime] = useState('18:00'), [endTime, setEndTime] = useState('19:00'), [searchError, setSearchError] = useState('');
  function submitSearch(event) {
    event.preventDefault();
    const interval = { date, start_time: startTime, end_time: endTime }, error = validateSearchInterval(interval, today);
    if (error) { setSearchError(error); return; }
    const params = new URLSearchParams(interval), normalizedQuery = q.trim().normalize('NFC'), normalizedDistrict = district.trim().normalize('NFC');
    if (normalizedQuery) params.set('q', normalizedQuery);
    if (normalizedDistrict) params.set('district', normalizedDistrict);
    setSearchError('');
    navigate(`/facilities?${params}`);
  }
  return <div className="home-page"><Header /><main>
    <section className="home-hero" aria-labelledby="home-search-title"><div className="home-hero-inner">
      <div className="home-hero-copy"><p className="home-kicker">TÌM SÂN TẠI ĐÀ NẴNG</p><h1 id="home-search-title">Tìm sân cầu lông<br /><span>tại Đà Nẵng</span></h1><p>Tìm sân phù hợp và kiểm tra khung giờ nhanh chóng.</p></div>
      <form className="home-search" onSubmit={submitSearch} noValidate>
        <div className="home-search-heading"><span aria-hidden="true">⌕</span><div><strong>Tìm sân phù hợp</strong><p>Chọn khu vực, ngày và khung giờ bạn muốn chơi.</p></div></div>
        <div className="home-search-fields">
          <label>Tên sân hoặc cơ sở<input aria-label="Tên sân hoặc cơ sở" value={q} onChange={event => setQ(event.target.value)} placeholder="Nhập tên sân hoặc cơ sở" /></label>
          <label>Khu vực<select aria-label="Khu vực" value={district} onChange={event => setDistrict(event.target.value)}><option value="">Tất cả khu vực</option>{districts.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Ngày chơi<input aria-label="Ngày chơi" type="date" value={date} min={today} max={addDays(today, 30)} onChange={event => setDate(event.target.value)} /></label>
          <label>Giờ bắt đầu<select aria-label="Giờ bắt đầu" value={startTime} onChange={event => setStartTime(event.target.value)}>{timeOptions.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Giờ kết thúc<select aria-label="Giờ kết thúc" value={endTime} onChange={event => setEndTime(event.target.value)}>{timeOptions.map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        {searchError && <p role="alert" className="home-search-error">{searchError}</p>}
        <div className="home-search-actions"><button type="submit">Tìm sân <span aria-hidden="true">→</span></button></div>
      </form>
    </div></section>
    <section className="home-quick-filters" aria-labelledby="quick-filters-title"><div className="home-content">
      <div className="home-quick-heading"><div><p className="home-kicker">TRUY CẬP NHANH</p><h2 id="quick-filters-title">Tìm theo khu vực</h2></div><p>Chọn phường, xã hoặc đặc khu để xem các cơ sở đang hoạt động.</p></div>
      <nav className="home-districts" aria-label="Khu vực phổ biến">{quickDistricts.map(value => <Link to={districtPath(value)} key={value}><span aria-hidden="true">⌖</span>{value}<i aria-hidden="true">→</i></Link>)}</nav>
    </div></section>
  </main><Footer /></div>;
}
