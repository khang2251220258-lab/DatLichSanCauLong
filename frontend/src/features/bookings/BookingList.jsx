import { Link, useSearchParams } from 'react-router';
import { localTime, money } from '../facilities/detailRules';
import { BookingLayout, StatusBadge } from './BookingUI';
import { bookingError, dayLabel, stampLabel } from './rules';
import { useBookingRead } from './useBookingRead';
import { bookingListResponse } from '../../services/responseValidators';
import '../recurring/recurring.css';

export function BookingList() {
  const [params, setParams] = useSearchParams();
  const read = useBookingRead('/bookings' + (params.size ? '?' + params : ''), false, bookingListResponse, { cache:true });
  const meta = read.value?.meta;
  const pages = meta ? Math.ceil(meta.total / meta.page_size) : 0;
  const loading = read.loading;
  function turn(page) {
    if (read.busy || page < 1 || page > pages) return;
    const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next);
  }
  return <BookingLayout>
    <nav className="rc-tabs" aria-label="Loại lịch đặt"><Link className="active" aria-current="page" to="/bookings">Đơn đặt sân</Link><Link to="/booking-series">Lịch cố định</Link></nav>
    <header className="bk-history-header"><p className="bk-eyebrow">TÀI KHOẢN KHÁCH HÀNG</p><div className="bk-history-title"><h1>Lịch đặt sân</h1>{meta && <p className="bk-history-count"><strong>{meta.total}</strong><span>lượt đặt sân</span></p>}</div><p className="bk-subtitle">Theo dõi các lượt đặt sân và trạng thái thanh toán của bạn.</p></header>
    {loading ? <div className="bk-history-state" role="status" aria-label="Đang tải lịch đặt sân"><span className="bk-state-spinner" aria-hidden="true"/><div><strong>Đang tải lịch đặt sân</strong><p>Vui lòng chờ trong giây lát…</p></div></div>
      : read.error && !read.value ? <div role="alert" className="bk-history-state bk-history-error"><span className="bk-state-icon" aria-hidden="true">!</span><div><strong>Chưa thể tải lịch đặt sân</strong><p>{bookingError(read.error)}</p><button className="bk-button" onClick={read.refresh}>Thử lại</button></div></div>
        : !read.value.data.length ? <div className="bk-history-state bk-history-empty"><span className="bk-state-icon" aria-hidden="true">⌁</span><div><strong>Bạn chưa có lịch đặt sân trong trang này.</strong><p>Khám phá các cơ sở cầu lông và chọn khung giờ phù hợp với bạn.</p><Link className="bk-button bk-button-primary" to="/facilities">Tìm sân</Link></div></div>
          : <>{read.busy&&<p role="status">Đang cập nhật lịch đặt sân…</p>}{read.error&&<div role="alert" className="bk-error"><p>Không thể cập nhật dữ liệu mới nhất. Danh sách gần nhất vẫn được giữ lại.</p><button onClick={read.refresh}>Thử lại</button></div>}<section className="bk-list" aria-label="Danh sách lịch đặt sân">{read.value.data.map(b => <article className="bk-list-card" key={b.id}>
            <div className="bk-list-primary"><div className="bk-list-heading"><div><p className="bk-booking-code">BOOKING #{b.id}</p><h2>{b.facility_name_snapshot}</h2><p className="bk-court-name">{b.court_name_snapshot}</p></div><StatusBadge status={b.status}/></div>
              <dl className="bk-list-schedule"><div><dt>Ngày chơi</dt><dd><span aria-hidden="true">▣</span>{dayLabel(b.start_at)}</dd></div><div><dt>Khung giờ</dt><dd><span aria-hidden="true">◷</span>{localTime(b.start_at)} – {localTime(b.end_at)}</dd></div></dl>
            </div>
            <div className="bk-list-summary"><dl><div><dt>Tổng tiền</dt><dd>{money(b.total_amount)}</dd></div><div><dt>Tiền cọc 30%</dt><dd className="bk-deposit">{money(b.deposit_amount)}</dd></div></dl><p>Tạo lúc {stampLabel(b.created_at)}</p><Link className="bk-button bk-detail-action" to={'/bookings/' + b.id}>Xem chi tiết <span aria-hidden="true">→</span></Link></div>
          </article>)}</section></>}
    {!loading && pages > 0 && <nav className="bk-pagination" aria-label="Phân trang booking"><button aria-label="Trang trước" disabled={meta.page <= 1} onClick={() => turn(meta.page - 1)}>←</button><span>Trang <strong aria-current="page">{meta.page}</strong> / {pages}</span><button aria-label="Trang sau" disabled={meta.page >= pages} onClick={() => turn(meta.page + 1)}>→</button></nav>}
  </BookingLayout>;
}
