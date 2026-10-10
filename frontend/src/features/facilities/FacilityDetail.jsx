import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { useBookingDraft } from '../bookings/useBookingDraft';
import { api, errorMessage } from '../../services/api';
import { availabilityResponse, facilityDetailResponse } from '../../services/responseValidators';
import { Header, Footer } from './PublicLayout';
import { labels, localDate, localTime, money, selectionFrom } from './detailRules';
import './facilities.css';
import './detail.css';

function useRead(path, validate) {
  const [attempt, setAttempt] = useState(0), [finished, setFinished] = useState(null);
  const key = path + ':' + attempt;
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    api(path, { signal:controller.signal, validate }).then(value => { if(current) setFinished({ key, value }); })
      .catch(error => { if(current) setFinished({ key, error }); });
    return () => { current = false; controller.abort(); };
  }, [path, key, validate]);
  return { loading:finished?.key !== key, value:finished?.key === key ? finished.value : null, error:finished?.key === key ? finished.error : null, retry:() => setAttempt(n=>n+1), key };
}
function Failure({ error, retry, availability=false }) {
  let message = errorMessage(error);
  if(error.status === 404) message = availability ? 'Sân hoặc cơ sở không còn khả dụng. Vui lòng chọn lại hoặc tải lại trang.' : 'Không tìm thấy cơ sở hoặc cơ sở không còn công khai.';
  if(availability && error.status === 409) message = error.code === 'PRICE_NOT_CONFIGURED' ? 'Bảng giá chưa hợp lệ. Chưa thể hiển thị lịch trống.' : 'Giờ hoạt động chưa được cấu hình hợp lệ.';
  if(error.status === 422) message = availability ? 'Ngày hoặc thông tin sân không hợp lệ. Vui lòng chọn lại ngày.' : 'Mã cơ sở không hợp lệ.';
  return <div role="alert" className="fl-state"><p>{message}</p><button onClick={retry}>Thử lại</button>{!availability && <Link to="/facilities">Về danh sách sân</Link>}</div>;
}
function Photo({ url, name }) {
  const [failed,setFailed] = useState(false);
  return failed ? <div className="fd-no-image">Không tải được ảnh</div> : <img src={url} alt={name} onError={()=>setFailed(true)} />;
}
function SlotPicker({ data, date, facility, court }) {
  const auth = useAuth(), navigate = useNavigate(), {draft,setDraft} = useBookingDraft();
  const [indices,setIndices] = useState(() => {
    if (draft?.facility.id !== facility.id || draft.restore === false || draft.selection.court_id !== court.id) return [];
    const restored = data.slots.flatMap((s,i) => s.start_at >= draft.selection.start_at && s.end_at <= draft.selection.end_at ? [i] : []);
    const range = selectionFrom(data.slots, restored, court.id, date);
    return range?.start_at === draft.selection.start_at && range?.end_at === draft.selection.end_at ? restored : [];
  }), [error,setError] = useState('');
  const selection = selectionFrom(data.slots, indices, data.court_id, date);
  const allowed = auth.status === 'guest' || (auth.status === 'authenticated' && auth.user.capabilities.includes('CUSTOMER'));
  function proceed() {
    if (!selection || !allowed) return;
    if (auth.status === 'guest') { navigate('/login'); return; }
    if (['unknown','pending'].includes(draft?.outcome)) { setError('Yêu cầu trước chưa xác định kết quả. Hãy kiểm tra Lịch đặt sân của tôi trước khi đặt tiếp.'); return; }
    setDraft({ facility:{id:facility.id,name:facility.name,address:facility.address}, court:{id:court.id,name:court.name}, selection, slots:[...indices].sort((a,b)=>a-b).map(i=>data.slots[i]) });
    navigate('/facilities/'+facility.id+'/booking-confirm');
  }
  function toggle(i) {
    const next = indices.includes(i) ? indices.filter(v=>v!==i) : [...indices,i];
    if(next.length && !selectionFrom(data.slots,next,data.court_id,date)) { setError('Chỉ chọn 1–6 khung giờ liên tiếp cùng sân và cùng ngày; không để khoảng hở.'); return; }
    if (!['unknown','pending'].includes(draft?.outcome)) setDraft(null);
    setIndices(next); setError('');
  }
  return <><div className="fd-legend">{Object.entries(labels).map(([state,label])=><span key={state}><i className={'fd-dot '+state} />{label}</span>)}</div>
    {!data.slots.length ? <p role="status">Không có khung giờ trong ngày này.</p> : <div className="fd-slots">{data.slots.map((slot,i)=><button key={slot.start_at} className={'fd-slot '+slot.state+(indices.includes(i)?' selected':'')} disabled={slot.state!=='AVAILABLE'} aria-pressed={indices.includes(i)} aria-label={`${localTime(slot.start_at)}–${localTime(slot.end_at)}, ${labels[slot.state]}, ${money(slot.slot_amount)}`} onClick={()=>toggle(i)}><strong>{localTime(slot.start_at)}</strong><span>{money(slot.slot_amount)}</span><small>{labels[slot.state]}</small></button>)}</div>}
    {error && <p role="alert">{error}</p>}
    {selection && <p role="status">Đang chọn: {localTime(selection.start_at)}–{localTime(selection.end_at)} ({indices.length} slot). Chưa giữ chỗ.</p>}
    {!!indices.length && <button onClick={()=>{setIndices([]);setError('');if(!['unknown','pending'].includes(draft?.outcome))setDraft(null);}}>Bỏ chọn</button>}
    <p className="fd-hint">Lịch chỉ phản ánh thời điểm kiểm tra, không bảo đảm đặt sân thành công.</p>
    <button className="fl-primary" disabled={!selection || !allowed} onClick={proceed}>Tiếp tục đặt sân ›</button>
    {auth.status === 'guest' && <p>Vui lòng đăng nhập rồi quay lại cơ sở để chọn lại khung giờ. Không tự tạo booking sau đăng nhập.</p>}
    {auth.status === 'authenticated' && !allowed && <p>Tài khoản không có quyền đặt sân cá nhân.</p>}
    {draft?.outcome === 'unknown' && <p><Link to="/bookings">Lịch đặt sân của tôi</Link> · <button onClick={()=>{setDraft(null);setIndices([]);setError('');}}>Đã kiểm tra lịch, chọn lại</button></p>}
  </>;
}
function Availability({ court, date, facility }) {
  const request = useRead('/courts/'+encodeURIComponent(court.id)+'/availability?'+new URLSearchParams({date}), availabilityResponse);
  return <><div aria-busy={request.loading}>{request.loading ? <p role="status">Đang tải lịch trống…</p> : request.error ? <Failure error={request.error} retry={request.retry} availability /> : <SlotPicker key={request.key} data={request.value.data} date={date} facility={facility} court={court}/>}</div>{(request.loading || request.error) && <button className="fl-primary" disabled>Tiếp tục đặt sân ›</button>}</>;
}
function DetailContent({ envelope }) {
  const f = envelope.data;
  const {draft,setDraft} = useBookingDraft();
  function clearSavedSelection() {
    setDraft(['unknown','pending'].includes(draft?.outcome) ? {...draft,restore:false} : null);
  }
  const courts = [...f.courts].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0);
  const saved = draft?.facility.id === f.id ? draft : null;
  const [courtId,setCourtId] = useState(courts.some(c=>c.id===saved?.court.id) ? saved.court.id : courts[0]?.id || '');
  const today = localDate(envelope.meta.server_time);
  const [date,setDate] = useState(saved && localDate(saved.selection.start_at) >= today ? localDate(saved.selection.start_at) : today);
  const court = courts.find(c=>c.id===courtId);
  return <><h1>{f.name}</h1><div className="fd-summary"><span className="fl-district">⌖ {f.district}</span><span>{f.address}</span><span>{f.opening_time} – {f.closing_time}</span></div>
    <div className="fd-gallery">{f.gallery.length ? f.gallery.map((url,i)=><Photo key={url} url={url} name={`${f.name} — ảnh ${i+1}`}/>) : <div className="fd-no-image">Chưa có ảnh cơ sở</div>}</div>
    <div className="fd-columns"><div><section className="fd-panel"><h2>Chọn sân</h2><p>Chọn sân con để xem lịch tương ứng.</p><div className="fd-courts">{courts.map(c=><button key={c.id} aria-pressed={courtId===c.id} onClick={()=>{if(c.id!==courtId)clearSavedSelection();setCourtId(c.id);}}>{c.name}{courtId===c.id?' ✓':' ›'}</button>)}</div>{!courts.length && <p role="status">Chưa có sân đang hoạt động.</p>}</section>
      {court && <section className="fd-panel"><div className="fd-calendar-heading"><div><h2>Lịch trống</h2><p>Sân đang chọn: {court.name}</p></div><label>Chọn ngày<input type="date" value={date} min={today} onChange={e=>{clearSavedSelection();setDate(e.target.value);}}/></label></div>{date ? <Availability key={courtId+date} court={court} date={date} facility={f}/> : <p role="alert">Vui lòng chọn ngày.</p>}</section>}
    </div><aside><section className="fd-panel"><h2>Tiện ích</h2>{f.amenities.length ? <ul className="fd-amenities">{f.amenities.map(a=><li key={a.id}>{a.name}</li>)}</ul> : <p>Chưa có tiện ích được công bố.</p>}</section>
      <section className="fd-panel"><h2>Bảng giá</h2>{f.price_rules.length ? <ul className="fd-prices">{f.price_rules.map(r=><li key={r.id}><span>{r.start_time} – {r.end_time}</span><strong>{money(r.hourly_rate)}/giờ</strong></li>)}</ul> : <p>Chưa có bảng giá.</p>}</section>
      <section className="fd-panel"><h2>Chính sách hủy</h2><p className="fd-policy">{f.cancellation_policy ? `Với booking đã xác nhận, khách chỉ được hủy trước mốc ${f.cancellation_policy.cutoff_hours} giờ so với giờ chơi (không gồm đúng mốc), theo chính sách được lưu khi đặt. Các trạng thái khác áp dụng quy định riêng.` : 'Chưa có chính sách hủy được công bố; không có nghĩa là được hủy tự do.'}</p></section>
    </aside></div></>;
}
export function FacilityDetail() {
  const {facility_id} = useParams();
  const request = useRead('/facilities/'+encodeURIComponent(facility_id), facilityDetailResponse);
  return <div className="fl-page"><Header/><main className="fl-main fd-main"><Link className="fd-back" to="/facilities">← Danh sách sân</Link>{request.loading ? <p role="status">Đang tải cơ sở…</p> : request.error ? <Failure error={request.error} retry={request.retry}/> : <DetailContent key={request.key} envelope={request.value}/>}</main><Footer/></div>;
}
