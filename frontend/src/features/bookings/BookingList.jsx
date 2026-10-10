import { Link, useSearchParams } from 'react-router';
import { localTime, money } from '../facilities/detailRules';
import { BookingLayout, StatusBadge } from './BookingUI';
import { bookingError, dayLabel, stampLabel } from './rules';
import { useBookingRead } from './useBookingRead';
import { bookingListResponse } from '../../services/responseValidators';

export function BookingList() {
  const [params, setParams] = useSearchParams();
  const read = useBookingRead('/bookings' + (params.size ? '?' + params : ''), false, bookingListResponse);
  const meta = read.value?.meta;
  const pages = meta ? Math.ceil(meta.total / meta.page_size) : 0;
  function turn(page) {
    if (read.busy || page < 1 || page > pages) return;
    const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next);
  }
  return <BookingLayout><h1>Lịch đặt sân của tôi</h1><p className="bk-subtitle">Theo dõi các yêu cầu đặt sân và trạng thái xử lý.</p>
    {read.loading || read.busy ? <p role="status">Đang tải lịch đặt sân…</p> : read.error ? <div role="alert" className="bk-error"><p>{bookingError(read.error)}</p><button onClick={read.refresh}>Thử lại</button></div> : !read.value.data.length ? <div className="bk-panel"><p role="status">Bạn chưa có lịch đặt sân trong trang này.</p><Link to="/facilities">Tìm sân</Link></div> : <div className="bk-list">{read.value.data.map(b=><article className="bk-panel bk-list-card" key={b.id}>
      <div className="bk-list-heading"><div><h2>{b.facility_name_snapshot}</h2><p>{b.court_name_snapshot} · Mã booking: {b.id}</p></div><StatusBadge status={b.status}/></div>
      <div className="bk-list-time"><span>▦ {dayLabel(b.start_at)}</span><span>◷ {localTime(b.start_at)} – {localTime(b.end_at)}</span><span>Tạo lúc {stampLabel(b.created_at)}</span></div>
      <div className="bk-list-bottom"><span>Tổng tiền: <strong>{money(b.total_amount)}</strong></span><span>Tiền cọc: <strong className="bk-deposit">{money(b.deposit_amount)}</strong></span><Link className="bk-button" to={'/bookings/'+b.id}>Xem chi tiết</Link></div>
    </article>)}</div>}
    {!read.loading && !read.busy && !read.error && pages > 0 && <nav className="fl-pagination" aria-label="Phân trang booking"><button aria-label="Trang trước" disabled={meta.page<=1} onClick={()=>turn(meta.page-1)}>‹</button><span aria-current="page">{meta.page}</span><span>/ {pages}</span><button aria-label="Trang sau" disabled={meta.page>=pages} onClick={()=>turn(meta.page+1)}>›</button></nav>}
  </BookingLayout>;
}
