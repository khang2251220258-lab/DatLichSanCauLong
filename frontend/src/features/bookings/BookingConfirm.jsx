import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { useBookingDraft } from './useBookingDraft';
import { bookingError, estimate, validDraft } from './rules';
import { BookingBack, BookingInfo, BookingLayout, CostSummary } from './BookingUI';
import { bookingCreateResponse } from '../../services/responseValidators';

export function BookingConfirm() {
  const { facility_id } = useParams(), navigate = useNavigate();
  const auth = useAuth(), { draft, setDraft } = useBookingDraft();
  const inFlight = useRef(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const back = '/facilities/' + encodeURIComponent(facility_id);
  if (!validDraft(draft, facility_id)) return <BookingLayout><h1>Xác nhận đặt sân</h1><p role="alert">Thông tin khung giờ đã chọn không còn. Vui lòng quay lại cơ sở để chọn lại.</p><BookingBack to={back}>Chọn lại khung giờ</BookingBack></BookingLayout>;
  const unknown = draft.outcome === 'unknown';
  const pending = draft.outcome === 'pending';
  async function submit() {
    if (inFlight.current || unknown || pending) return;
    inFlight.current = true; setBusy(true); setError(null);
    setDraft({ ...draft, outcome:'pending' });
    try {
      const { court_id, start_at, end_at } = draft.selection;
      const result = await auth.request('/bookings', { method:'POST', body:{court_id,start_at,end_at}, validate:bookingCreateResponse });
      setDraft(null);
      navigate('/bookings/' + result.data.id, { replace:true });
    } catch (e) {
      setDraft({ ...draft, outcome:!e.status || e.status >= 500 ? 'unknown' : 'failed' });
      setError(e);
    } finally { inFlight.current = false; setBusy(false); }
  }
  const booking = { ...draft.selection, facility_name_snapshot:draft.facility.name, facility_address_snapshot:draft.facility.address, court_name_snapshot:draft.court.name };
  return <BookingLayout><BookingBack to={back}>Quay lại</BookingBack><h1>Xác nhận đặt sân</h1><p className="bk-subtitle">Kiểm tra kỹ thông tin trước khi tạo yêu cầu đặt sân.</p>
    <div className="bk-columns"><BookingInfo booking={booking} slots={draft.slots} confirming/><aside><CostSummary amounts={estimate(draft.slots)} estimated>
      <p className="bk-notice">Yêu cầu chỉ được tạo sau khi bạn nhấn “Xác nhận đặt sân”. Giá và lịch trống sẽ được máy chủ kiểm tra lại.</p>
      {unknown ? <div role="alert" className="bk-error"><p>Chưa xác định được kết quả tạo booking. Không gửi lại yêu cầu này; hãy kiểm tra Lịch đặt sân của tôi trước khi đặt tiếp.</p><Link to="/bookings">Lịch đặt sân của tôi</Link></div> : error && <p className="bk-error" role="alert">{bookingError(error)}</p>}
      {pending && !busy && <p role="status">Yêu cầu đang được xử lý. Vui lòng kiểm tra <Link to="/bookings">Lịch đặt sân của tôi</Link>, không gửi lại.</p>}
      <button className="fl-primary bk-full" disabled={busy || pending || unknown || !!error} onClick={submit}>{busy || pending ? 'Đang tạo yêu cầu…' : 'Xác nhận đặt sân'}</button>
      <Link className="bk-button bk-full" to={back}>Quay lại</Link>
    </CostSummary></aside></div>
  </BookingLayout>;
}
