import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { useBookingDraft } from '../bookings/useBookingDraft';
import { errorMessage } from '../../services/api';
import { availabilityResponse, facilityDetailResponse } from '../../services/responseValidators';
import { Header, Footer } from './PublicLayout';
import { labels, localDate, localTime, money, selectionFrom } from './detailRules';
import './facilities.css';
import './detail.css';
import { usePublicRead } from './usePublicRead';
import { listReturnPath, matchingCourtIds, searchContext } from './guestSearch';
function Failure({ error, retry, availability=false }) {
  let message = errorMessage(error);
  if(error.status === 404) message = availability ? 'Sân hoặc cơ sở không còn khả dụng. Vui lòng chọn lại hoặc tải lại trang.' : 'Không tìm thấy cơ sở hoặc cơ sở không còn công khai.';
  if(availability && error.status === 409) message = error.code === 'PRICE_NOT_CONFIGURED' ? 'Bảng giá chưa hợp lệ. Chưa thể hiển thị lịch trống.' : 'Giờ hoạt động chưa được cấu hình hợp lệ.';
  if(error.status === 422) message = availability ? 'Ngày hoặc thông tin sân không hợp lệ. Vui lòng chọn lại ngày.' : 'Mã cơ sở không hợp lệ.';
  return <div role="alert" className="fl-state"><p>{message}</p><button onClick={retry}>Thử lại</button>{!availability && <Link to="/facilities">Về danh sách sân</Link>}</div>;
}
function Photo({ url, name, eager = false }) {
  const [failed,setFailed] = useState(false);
  return failed ? <div className="fd-no-image">Không tải được ảnh</div> : <img src={url} alt={name} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={()=>setFailed(true)} />;
}
function Gallery({ images, name }) {
  if (!images.length) return <div className="fd-gallery fd-gallery-empty"><div className="fd-no-image">Chưa có ảnh cơ sở</div></div>;
  const visible = images.slice(0, 5), remaining = images.length - visible.length;
  return <section className={`fd-gallery fd-gallery-count-${Math.min(images.length, 5)}`} aria-label={`Hình ảnh ${name}`}>
    <div className="fd-gallery-primary"><Photo url={visible[0]} eager name={`${name} — ảnh chính`}/></div>
    {visible.length > 1 && <div className="fd-gallery-secondary">{visible.slice(1).map((url,index)=><div className="fd-gallery-cell" key={url}>
      <Photo url={url} name={`${name} — ảnh ${index+2}`}/>
      {remaining > 0 && index === visible.length-2 && <span className="fd-gallery-more">+{remaining} ảnh</span>}
    </div>)}</div>}
  </section>;
}
function SlotPicker({ data, date, facility, court, context, returnPath }) {
  const auth = useAuth(), navigate = useNavigate(), {draft,setDraft} = useBookingDraft();
  const [indices,setIndices] = useState(() => {
    const source = draft?.facility.id === facility.id && draft.restore !== false && draft.selection.court_id === court.id ? {start_at:draft.selection.start_at,end_at:draft.selection.end_at} : context && context.date === date ? context : null;
    if(!source)return [];
    const restored = data.slots.flatMap((slot,index) => {
      const matches = source.start_at ? slot.start_at >= source.start_at && slot.end_at <= source.end_at : localTime(slot.start_at) >= source.start_time && localTime(slot.end_at) <= source.end_time;
      return matches && slot.state === 'AVAILABLE' ? [index] : [];
    });
    const range = selectionFrom(data.slots, restored, court.id, date);
    if(!range)return [];
    return source.start_at ? range.start_at===source.start_at&&range.end_at===source.end_at?restored:[] : localTime(range.start_at)===source.start_time&&localTime(range.end_at)===source.end_time?restored:[];
  }), [error,setError] = useState('');
  const selection = selectionFrom(data.slots, indices, data.court_id, date);
  const allowed = auth.status === 'guest' || (auth.status === 'authenticated' && auth.user.capabilities.includes('CUSTOMER'));
  function proceed() {
    if (!selection || !allowed) return;
    if (['unknown','pending'].includes(draft?.outcome)) { setError('Yêu cầu trước chưa xác định kết quả. Hãy kiểm tra Lịch đặt sân của tôi trước khi đặt tiếp.'); return; }
    const confirmation='/facilities/'+facility.id+'/booking-confirm';
    setDraft({ facility:{id:facility.id,name:facility.name,address:facility.address}, court:{id:court.id,name:court.name}, selection, slots:[...indices].sort((a,b)=>a-b).map(i=>data.slots[i]), return_path:returnPath });
    if (auth.status === 'guest') { navigate('/login',{state:{from:confirmation}}); return; }
    navigate(confirmation);
  }
  function toggle(i) {
    const next = indices.includes(i) ? indices.filter(v=>v!==i) : [...indices,i];
    if(next.length && !selectionFrom(data.slots,next,data.court_id,date)) { setError('Chỉ chọn 1–6 khung giờ liên tiếp cùng sân và cùng ngày; không để khoảng hở.'); return; }
    if (!['unknown','pending'].includes(draft?.outcome)) setDraft(null);
    setIndices(next); setError('');
  }
  return <><div className="fd-legend" aria-label="Chú thích trạng thái khung giờ">{Object.entries(labels).map(([state,label])=><span key={state}><i className={'fd-dot '+state} aria-hidden="true"/>{label}</span>)}<span><i className="fd-dot selected" aria-hidden="true"/>Đang chọn</span></div>
    {!data.slots.length ? <p role="status" className="fd-empty-slots">Không có khung giờ trong ngày này.</p> : <div className="fd-slots">{data.slots.map((slot,i)=><button key={slot.start_at} className={'fd-slot '+slot.state+(indices.includes(i)?' selected':'')} disabled={slot.state!=='AVAILABLE'} aria-pressed={indices.includes(i)} aria-label={`${localTime(slot.start_at)}–${localTime(slot.end_at)}, ${labels[slot.state]}, ${money(slot.slot_amount)}`} onClick={()=>toggle(i)}><strong>{localTime(slot.start_at)}</strong><span>{money(slot.slot_amount)}</span><small>{labels[slot.state]}</small></button>)}</div>}
    {error && <p role="alert" className="fd-selection-error">{error}</p>}
    <div className="fd-selection-summary">
      <div>{selection ? <p role="status"><strong>Đang chọn {localTime(selection.start_at)}–{localTime(selection.end_at)}</strong><span>{indices.length} slot · Chưa giữ chỗ</span></p> : <p><strong>Chọn khung giờ muốn đặt</strong><span>Tối đa 6 slot liên tiếp trên cùng sân.</span></p>}</div>
      {!!indices.length && <button className="fd-clear-selection" onClick={()=>{setIndices([]);setError('');if(!['unknown','pending'].includes(draft?.outcome))setDraft(null);}}>Bỏ chọn</button>}
    </div>
    <div className="fd-booking-action"><p className="fd-hint">Lịch chỉ phản ánh thời điểm kiểm tra, không bảo đảm đặt sân thành công.</p>
    <button className="fl-primary fd-booking-cta" disabled={!selection || !allowed} onClick={proceed}>Tiếp tục đặt sân ›</button></div>
    {auth.status === 'guest' && <p>Đăng nhập để tiếp tục với sân và khung giờ đang chọn. Hệ thống vẫn kiểm tra lại lịch khi tạo booking.</p>}
    {auth.status === 'authenticated' && !allowed && <p>Tài khoản không có quyền đặt sân cá nhân.</p>}
    {draft?.outcome === 'unknown' && <p><Link to="/bookings">Lịch đặt sân của tôi</Link> · <button onClick={()=>{setDraft(null);setIndices([]);setError('');}}>Đã kiểm tra lịch, chọn lại</button></p>}
  </>;
}
function Availability({ court, date, facility, context, returnPath, provisional }) {
  const path='/courts/'+encodeURIComponent(court.id)+'/availability?'+new URLSearchParams({date});
  // A provisional request may already be in flight from an interval-search
  // hint. The Detail response has validated the Court before this component is
  // rendered, so the result cannot be exposed for an unverified URL value.
  const fallback = usePublicRead(provisional ? null : path, availabilityResponse, { cache:false });
  const request = provisional || fallback;
  return <>{request.busy&&request.value&&<p role="status" className="fd-availability-status">Đang cập nhật lịch trống…</p>}{request.refreshError&&request.value&&<div className="fl-state" role="alert"><p>Không thể cập nhật lịch mới nhất. Lịch gần nhất vẫn được hiển thị để tham khảo.</p><button onClick={()=>void request.refresh()}>Thử lại</button></div>}<div aria-busy={request.loading}>{request.loading ? <p role="status" className="fd-availability-status">Đang tải lịch trống…</p> : request.error ? <Failure error={request.error} retry={request.retry} availability /> : <SlotPicker key={request.key} data={request.value.data} date={date} facility={facility} court={court} context={context} returnPath={returnPath}/>}</div>{(request.loading || request.error) && <div className="fd-booking-action"><button className="fl-primary fd-booking-cta" disabled>Tiếp tục đặt sân ›</button></div>}</>;
}
function DetailContent({ envelope, params, provisional, discardProvisional }) {
  const f = envelope.data;
  const {draft,setDraft} = useBookingDraft();
  function clearSavedSelection() {
    setDraft(['unknown','pending'].includes(draft?.outcome) ? {...draft,restore:false} : null);
  }
  const courts = [...f.courts].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0);
  const context=searchContext(params), matched=matchingCourtIds(params,courts);
  const returnPath=`/facilities/${encodeURIComponent(f.id)}${params.size?`?${params}`:''}`;
  const saved = draft?.facility.id === f.id ? draft : null;
  const [courtId,setCourtId] = useState(courts.some(c=>c.id===saved?.court.id) ? saved.court.id : matched[0] || courts[0]?.id || '');
  const today = localDate(envelope.meta.server_time);
  const [date,setDate] = useState(saved && localDate(saved.selection.start_at) >= today ? localDate(saved.selection.start_at) : context?.date || today);
  const court = courts.find(c=>c.id===courtId);
  function changeCourt(nextCourtId) {
    if(nextCourtId===courtId)return;
    discardProvisional();
    clearSavedSelection();
    setCourtId(nextCourtId);
  }
  function changeDate(nextDate) {
    discardProvisional();
    clearSavedSelection();
    setDate(nextDate);
  }
  const acceptedProvisional=provisional?.hint.courtId===courtId&&provisional.hint.date===date&&matched.includes(courtId)?provisional.read:null;
  return <><h1>{f.name}</h1><div className="fd-summary"><span className="fl-district">⌖ {f.district}</span><span>{f.address}</span><span>{f.opening_time} – {f.closing_time}</span></div>
    {context&&<p className="fd-search-context" role="status">Đang kiểm tra lại lịch cho {context.date}, {context.start_time}–{context.end_time}. Các sân được đánh dấu đã phù hợp tại thời điểm tìm kiếm.</p>}<Gallery images={f.gallery} name={f.name}/>
    <div className="fd-columns"><div><section className="fd-panel"><h2>Chọn sân</h2><p>Chọn sân con để xem lịch tương ứng.</p><div className="fd-courts">{courts.map(c=><button key={c.id} aria-pressed={courtId===c.id} onClick={()=>changeCourt(c.id)}>{c.name}{matched.includes(c.id)?<small>Phù hợp theo tìm kiếm</small>:null}{courtId===c.id?' ✓':' ›'}</button>)}</div>{!courts.length && <p role="status">Chưa có sân đang hoạt động.</p>}</section>
      {court && <section className="fd-panel fd-availability-panel"><div className="fd-calendar-heading"><div className="fd-calendar-title"><span className="fd-section-kicker">Chọn thời gian</span><h2>Lịch trống</h2><p><span>Sân đang chọn</span><strong>{court.name}</strong></p></div><label><span>Chọn ngày</span><input type="date" value={date} min={today} onChange={e=>changeDate(e.target.value)}/></label></div>{date ? <Availability key={courtId+date} court={court} date={date} facility={f} context={context} returnPath={returnPath} provisional={acceptedProvisional}/> : <p role="alert">Vui lòng chọn ngày.</p>}</section>}
    </div><aside><section className="fd-panel fd-side-panel"><h2>Tiện ích</h2>{f.amenities.length ? <ul className="fd-amenities">{f.amenities.map(a=><li key={a.id}>{a.name}</li>)}</ul> : <p>Chưa có tiện ích được công bố.</p>}</section>
      <section className="fd-panel fd-side-panel"><h2>Bảng giá</h2>{f.price_rules.length ? <ul className="fd-prices">{f.price_rules.map(r=><li key={r.id}><span>{r.start_time} – {r.end_time}</span><strong>{money(r.hourly_rate)}/giờ</strong></li>)}</ul> : <p>Chưa có bảng giá.</p>}</section>
      <section className="fd-panel fd-side-panel"><h2>Chính sách hủy</h2><p className="fd-policy">{f.cancellation_policy ? `Với booking đã xác nhận, khách chỉ được hủy trước mốc ${f.cancellation_policy.cutoff_hours} giờ so với giờ chơi (không gồm đúng mốc), theo chính sách được lưu khi đặt. Các trạng thái khác áp dụng quy định riêng.` : 'Chưa có chính sách hủy được công bố; không có nghĩa là được hủy tự do.'}</p></section>
    </aside></div></>;
}
export function FacilityDetail() {
  const {facility_id} = useParams(), [params]=useSearchParams();
  return <FacilityDetailScreen key={facility_id+'?'+params.toString()} facilityId={facility_id} params={params}/>;
}
function FacilityDetailScreen({ facilityId, params }) {
  const request = usePublicRead('/facilities/'+encodeURIComponent(facilityId), facilityDetailResponse);
  const context=searchContext(params), rawHint=params.get('matching_courts')?.split(',').find(id=>/^[1-9]\d*$/.test(id));
  const hint=context&&rawHint?{courtId:rawHint,date:context.date}:null;
  const detail= request.value?.data;
  const hintStillValid=Boolean(hint)&&!(request.error&&!detail)&&(!detail||detail.courts.some(court=>court.id===hint.courtId));
  const [provisionalEnabled,setProvisionalEnabled] = useState(true);
  const provisionalPath=hint&&hintStillValid&&provisionalEnabled?'/courts/'+encodeURIComponent(hint.courtId)+'/availability?'+new URLSearchParams({date:hint.date}):null;
  const provisionalRead=usePublicRead(provisionalPath, availabilityResponse, {cache:false});
  const discardProvisional=()=>setProvisionalEnabled(false);
  return <div className="fl-page"><Header/><main className="fl-main fd-main"><Link className="fd-back" to={listReturnPath(params)}>← Danh sách sân</Link>{request.busy&&request.value&&<p role="status">Đang cập nhật thông tin cơ sở…</p>}{request.refreshError&&request.value&&<div className="fl-state" role="alert"><p>Không thể cập nhật dữ liệu mới nhất. Thông tin gần nhất vẫn được giữ lại.</p><button onClick={()=>void request.refresh()}>Thử lại</button></div>}{request.loading ? <p role="status">Đang tải cơ sở…</p> : request.error ? <Failure error={request.error} retry={request.retry}/> : <DetailContent key={request.key+params.toString()} envelope={request.value} params={params} provisional={hintStillValid&&provisionalEnabled?{hint,read:provisionalRead}:null} discardProvisional={discardProvisional}/>}</main><Footer/></div>;
}
