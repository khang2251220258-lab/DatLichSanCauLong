import { Link } from 'react-router';
import { Header, Footer } from '../facilities/PublicLayout';
import { localTime, money } from '../facilities/detailRules';
import { bookingLabels, dayLabel } from './rules';
import '../facilities/facilities.css';
import './bookings.css';

export function BookingLayout({ children }) {
  return <div className="fl-page"><Header/><main className="fl-main bk-main">{children}</main><Footer/></div>;
}
export function StatusBadge({ status }) {
  return <span className={'bk-badge ' + status}>{bookingLabels[status] || 'Chưa xác định'}</span>;
}
export function BookingInfo({ booking, slots, confirming = false }) {
  return <div className="bk-info"><section className="bk-panel"><h2>Thông tin sân</h2>
    <div className="bk-place"><span aria-hidden="true">⌖</span><div><h3>{booking.facility_name_snapshot}</h3><p>{booking.facility_address_snapshot}</p></div></div>
    <dl className="bk-facts"><div><dt>Sân con</dt><dd>{booking.court_name_snapshot}</dd></div><div><dt>Ngày chơi</dt><dd>{dayLabel(booking.start_at)}</dd></div><div><dt>Khung giờ</dt><dd>{localTime(booking.start_at)} – {localTime(booking.end_at)}</dd></div></dl>
  </section><section className="bk-panel"><div className="bk-section-heading"><h2>{confirming ? 'Các khung giờ đã chọn' : 'Chi tiết khung giờ'}</h2><small>Mỗi slot 30 phút</small></div>
    <ul className="bk-slots">{slots.map(s=><li key={s.start_at}><span><i aria-hidden="true">◷ </i>{localTime(s.start_at)} – {localTime(s.end_at)}</span><strong>{money(s.slot_amount)}</strong></li>)}</ul>
  </section></div>;
}
export function CostSummary({ amounts, estimated = false, children }) {
  return <section className="bk-panel"><h2>{estimated ? 'Chi phí đặt sân dự kiến' : 'Tổng quan chi phí'}</h2>
    <dl className="bk-costs"><div><dt>Tổng tiền{estimated ? ' dự kiến' : ''}</dt><dd>{money(amounts.total_amount)}</dd></div><div><dt>Tiền cọc 30%</dt><dd className="bk-deposit">{money(amounts.deposit_amount)}</dd></div><div><dt>Còn lại 70%</dt><dd>{money(amounts.remaining_amount)}</dd></div></dl>
    <p className="bk-muted">Phần còn lại được thanh toán tại sân.</p>{children}
  </section>;
}
export function BookingBack({ to, children }) { return <Link className="bk-back" to={to}>← {children}</Link>; }
