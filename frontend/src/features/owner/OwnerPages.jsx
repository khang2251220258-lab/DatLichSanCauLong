import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { localTime, money } from '../facilities/detailRules';
import { bookingLabels, dayLabel } from '../bookings/rules';
import { OwnerLayout, OwnerPager as Pager, ownerError as message, useOwnerRead as useRead } from './OwnerShared';
import './owner.css';
import { ownerBookingCancellationResponse, ownerBookingListResponse, ownerBookingDetailResponse, ownerPaymentProofDetailResponse, ownerV2BookingActionResponse } from '../../services/responseValidators';
import { AccessibleModal } from '../../components/AccessibleModal';
import { OwnerRefundPanel } from '../refunds/RefundPanels';
import '../recurring/recurring.css';

const statuses=['PENDING_PAYMENT','PENDING_CONFIRMATION','CONFIRMED','COMPLETED','CANCELLED','REJECTED','EXPIRED'];
const ownerLabels=bookingLabels;
const proofLabels={SUBMITTED:'Chờ xác nhận',APPROVED:'Đã xác nhận',REJECTED:'Đã từ chối'};
const OwnerStatus=({status})=><span className={'bk-badge '+status}>{ownerLabels[status]||'Chưa xác định'}</span>;

export function OwnerBookingList(){
  const auth=useAuth(),[params,setParams]=useSearchParams(),page=Math.max(1,Number(params.get('page'))||1),status=params.get('status')||'';
  const query=new URLSearchParams({page:String(page),page_size:'20'});if(status)query.set('status',status);
  const read=useRead('/owner/bookings?'+query,ownerBookingListResponse,{cache:true}),rows=read.data?.data||[];
  const [action,setAction]=useState(null),[reason,setReason]=useState(''),[reasonError,setReasonError]=useState(''),[actionError,setActionError]=useState(''),[unknownId,setUnknownId]=useState(null),[busy,setBusy]=useState(false),[tick,setTick]=useState(()=>Date.now()),[serverOffset,setServerOffset]=useState(0);
  const mutationLock=useRef(false),expiredRefresh=useRef('');
  const update=(next)=>{const p=new URLSearchParams(params);Object.entries(next).forEach(([k,v])=>v?p.set(k,String(v)):p.delete(k));setParams(p);};
  useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const serverTime=read.data?.meta?.server_time;
  // oxlint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(serverTime)setServerOffset(Date.parse(serverTime)-Date.now());},[serverTime]);
  const serverNow=serverTime&&serverOffset===0?Date.parse(serverTime):tick+serverOffset;
  const remaining=b=>b.confirmation_expires_at?Math.max(0,Date.parse(b.confirmation_expires_at)-serverNow):0;
  const expired=rows.filter(b=>b.booking_flow_version===2&&b.status==='PENDING_CONFIRMATION'&&remaining(b)===0).map(b=>b.id).join(',');
  useEffect(()=>{if(expired&&expiredRefresh.current!==expired){expiredRefresh.current=expired;void read.refresh();}},[expired,read]);
  async function mutate(){
    if(!action||mutationLock.current)return;
    const trimmed=reason.trim();
    if(action.kind==='reject'&&(!trimmed||[...trimmed].length>500)){setReasonError(!trimmed?'Vui lòng nhập lý do từ chối.':'Lý do không được vượt quá 500 ký tự.');return;}
    mutationLock.current=true;setBusy(true);setActionError('');
    try{
      await auth.request('/owner/bookings/'+encodeURIComponent(action.booking.id)+'/'+action.kind,{method:'POST',body:action.kind==='reject'?{reason:trimmed}:{},validate:ownerV2BookingActionResponse(action.booking.id)});
      setAction(null);await read.refresh();
    }catch(error){
      setAction(null);
      if(error.status===409||error.status===0||error.status>=500){
        try{const latest=await read.refresh();const current=latest.data.find(row=>row.id===action.booking.id);if(error.status!==409&&current?.status==='PENDING_CONFIRMATION')setUnknownId(action.booking.id);setActionError(error.status===409?'Trạng thái booking đã thay đổi. Dữ liệu mới nhất đã được tải lại.':'Kết quả chưa xác định; dữ liệu mới nhất đã được đồng bộ từ máy chủ.');}
        catch{setActionError('Chưa xác minh được kết quả. Vui lòng tải lại trước khi thử tiếp.');}
      }else setActionError(message(error));
    }finally{mutationLock.current=false;setBusy(false);}
  }
  const hasSnapshot=Boolean(read.data);
  return <OwnerLayout><nav className="rc-tabs" aria-label="Loại lịch đặt"><Link className="active" aria-current="page" to="/owner/bookings">Đơn đặt sân</Link><Link to="/owner/booking-series">Lịch cố định</Link></nav><header className="obl-heading"><div><span className="obl-eyebrow">Vận hành đặt sân</span><h1>Quản lý đặt sân</h1><p>Theo dõi khách hàng, lịch chơi và trạng thái xử lý của từng đơn đặt sân.</p></div><label className="obl-filter"><span>Trạng thái</span><select value={status} onChange={e=>update({status:e.target.value,page:1})}><option value="">Tất cả trạng thái</option>{statuses.map(s=><option key={s} value={s}>{ownerLabels[s]}</option>)}</select></label></header>
    {actionError&&<p className="ow-error" role="alert">{actionError}</p>}
    {read.loading&&!hasSnapshot?<div className="obl-loading" role="status"><span className="obl-spinner" aria-hidden="true"/><div><strong>Đang tải danh sách đặt sân</strong><p>Vui lòng chờ trong giây lát…</p></div></div>
      :read.error&&!hasSnapshot?<div className="obl-state obl-state-error" role="alert"><span className="obl-state-icon" aria-hidden="true">!</span><div><h2>Chưa thể tải danh sách đặt sân</h2><p>{message(read.error)}</p></div><button className="om-outline" onClick={()=>read.refresh()}>Thử lại</button></div>
        :!rows.length?<div className="obl-state obl-state-empty"><span className="obl-state-icon" aria-hidden="true">□</span><div><h2>{status?'Không có đơn ở trạng thái này':'Chưa có đơn đặt sân'}</h2><p>{status?'Hãy chọn trạng thái khác để xem các đơn còn lại.':'Các đơn đặt sân thuộc cơ sở của bạn sẽ xuất hiện tại đây.'}</p></div></div>
          :<><div className="obl-list-head"><div><h2>Danh sách đơn đặt sân</h2><p>{read.data.meta.total} đơn phù hợp</p></div>{read.busy&&<span className="obl-sync" role="status">Đang cập nhật…</span>}</div>
            {read.error&&<div className="obl-refresh-error" role="alert">Không thể cập nhật dữ liệu mới nhất. Danh sách gần nhất vẫn được giữ lại.</div>}
            <div className="ow-table obl-table" role="table"><div className="ow-row head" role="row"><span>Booking / Khách hàng</span><span>Cơ sở / Sân</span><span>Lịch chơi</span><span>Tiền cọc</span><span>Trạng thái</span><span>Thao tác</span></div><div role="rowgroup">{rows.map(b=>{const actionable=b.booking_flow_version===2&&b.status==='PENDING_CONFIRMATION'&&remaining(b)>0&&unknownId!==b.id;const seconds=Math.ceil(remaining(b)/1000);return <article className="ow-row obl-row" role="row" key={b.id}><div className="obl-customer" role="cell" data-label="Booking / Khách hàng"><small>BOOKING <span>#{b.id}</span></small><strong>{b.customer.full_name}</strong>{b.customer.phone&&<span>{b.customer.phone}</span>}</div><div className="obl-facility" role="cell" data-label="Cơ sở / Sân"><strong>{b.facility.name}</strong><span>{b.court.name}</span></div><div className="obl-schedule" role="cell" data-label="Lịch chơi"><strong>{dayLabel(b.start_at)}</strong><span>{localTime(b.start_at)}–{localTime(b.end_at)}</span>{b.booking_flow_version===2&&<small>{b.transfer_reference} · {seconds>0?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'Đang đồng bộ'}</small>}</div><strong role="cell" data-label="Tiền cọc" className="ow-money obl-deposit">{money(b.deposit_amount)}</strong><div role="cell" data-label="Trạng thái"><OwnerStatus status={b.status}/></div><div className="obl-action" role="cell">{actionable&&<div className="obl-quick-actions"><button className="confirm" disabled={busy} onClick={()=>setAction({kind:'confirm',booking:b})}>Xác nhận</button><button className="reject" disabled={busy} onClick={()=>{setReason('');setReasonError('');setAction({kind:'reject',booking:b});}}>Từ chối</button></div>}<Link className="om-outline" aria-label={'Xem chi tiết booking '+b.id} to={'/owner/bookings/'+b.id}>Xem chi tiết <span aria-hidden="true">→</span></Link></div></article>;})}</div></div><Pager meta={read.data.meta} onPage={p=>update({page:p})}/></>}
    {action?.kind==='confirm'&&<Modal title="Xác nhận đặt sân" description="Bạn đã kiểm tra giao dịch chuyển khoản và muốn xác nhận đặt sân này?" busy={busy} onClose={()=>setAction(null)} onSubmit={mutate} submitLabel="Xác nhận đặt sân"><p>Booking #{action.booking.id} · Cọc {money(action.booking.deposit_amount)} · {action.booking.transfer_reference}</p></Modal>}
    {action?.kind==='reject'&&<Modal title="Từ chối đặt sân" description="Booking sẽ kết thúc và khung giờ được giải phóng." busy={busy} onClose={()=>setAction(null)} onSubmit={mutate} submitLabel="Xác nhận từ chối" destructive><p>Booking #{action.booking.id} · {action.booking.customer.full_name} · {action.booking.transfer_reference}</p><label>Lý do từ chối *<textarea value={reason} maxLength={500} onChange={e=>{setReason(e.target.value);setReasonError('');}}/></label><small>{[...reason].length}/500</small>{reasonError&&<p role="alert">{reasonError}</p>}</Modal>}
  </OwnerLayout>;
}

function Modal({title,description,children,onClose,onSubmit,busy,submitLabel,cancelLabel='Hủy',destructive=false}){return <AccessibleModal title={title} description={description} busy={busy} onClose={onClose} backdropClass="ow-modal-back" className="ow-modal">{children}<div><button disabled={busy} onClick={onClose}>{cancelLabel}</button><button autoFocus className={destructive?'destructive':'primary'} disabled={busy} onClick={onSubmit}>{busy?'Đang xử lý…':submitLabel}</button></div></AccessibleModal>;}

const ownerBookingGuidance={
  PENDING_PAYMENT:['Chờ khách thanh toán','Booking đang giữ lịch trong thời hạn thanh toán. Chưa có minh chứng để xét duyệt.'],
  PENDING_CONFIRMATION:['Cần kiểm tra minh chứng','Khách hàng đã gửi minh chứng tiền cọc. Hãy đối chiếu trước khi xác nhận hoặc từ chối.'],
  CONFIRMED:['Đã xác nhận tiền cọc','Lịch sân đã được xác nhận. Khoản còn lại được thanh toán trực tiếp tại sân.'],
  COMPLETED:['Booking đã hoàn thành','Thông tin booking và minh chứng được giữ lại để đối chiếu.'],
  REJECTED:['Minh chứng đã bị từ chối','Booking đã kết thúc và khung giờ đã được giải phóng.'],
  EXPIRED:['Booking đã hết hạn','Khách hàng không hoàn tất thanh toán trong thời hạn giữ chỗ.'],
  CANCELLED:['Booking đã bị hủy','Lịch sân đã được giải phóng. Theo dõi nghĩa vụ hoàn cọc bên dưới nếu có.'],
};

function OwnerBookingOverview({booking}){
  return <>
    <section className="obd-card obd-customer-card"><div className="obd-section-head"><span className="obd-section-icon" aria-hidden="true">♙</span><div><span className="obd-kicker">Khách hàng</span><h2>Thông tin khách đặt sân</h2></div></div><dl className="obd-customer-grid"><div><dt>Họ và tên</dt><dd>{booking.customer.full_name}</dd></div><div><dt>Số điện thoại</dt><dd>{booking.customer.phone||'Chưa cập nhật'}</dd></div></dl></section>
    <section className="obd-card"><div className="obd-section-head"><span className="obd-section-icon" aria-hidden="true">▣</span><div><span className="obd-kicker">Lịch chơi</span><h2>Thông tin đặt sân</h2></div></div><dl className="obd-booking-grid"><div><dt>Cơ sở</dt><dd>{booking.facility.name}</dd></div><div><dt>Sân</dt><dd>{booking.court.name}</dd></div><div><dt>Ngày chơi</dt><dd>{dayLabel(booking.start_at)}</dd></div><div><dt>Thời gian</dt><dd>{localTime(booking.start_at)}–{localTime(booking.end_at)}</dd></div></dl><div className="obd-slots"><h3>Chi tiết khung giờ</h3><div>{booking.slots.map((slot,index)=><article key={slot.start_at}><span>Slot {index+1}</span><strong>{localTime(slot.start_at)}–{localTime(slot.end_at)}</strong><small>{money(slot.slot_amount)}</small></article>)}</div></div></section>
  </>;
}

function OwnerFinancialSummary({booking}){
  return <section className="obd-card obd-financial"><div className="obd-section-head"><span className="obd-section-icon" aria-hidden="true">₫</span><div><span className="obd-kicker">Tài chính</span><h2>Tổng quan thanh toán</h2></div></div><dl><div><dt>Tổng tiền</dt><dd>{money(booking.total_amount)}</dd></div><div className="deposit"><dt>Tiền cọc đã ghi nhận</dt><dd>{money(booking.deposit_amount)}</dd></div><div><dt>Còn lại tại sân</dt><dd>{money(booking.remaining_amount)}</dd></div></dl></section>;
}

function OwnerLifecycleSummary({booking,proof}){
  const guidance=booking.status==='PENDING_CONFIRMATION'&&booking.booking_flow_version===2
    ? ['Chờ chủ sân xác nhận','Booking V2 đang giữ lịch trong thời hạn xác nhận. Phase hiện tại chỉ hiển thị trạng thái đọc.']
    : ownerBookingGuidance[booking.status]||['Trạng thái booking','Theo dõi dữ liệu mới nhất từ máy chủ.'];
  return <section className={'obd-state-card '+booking.status.toLowerCase()} aria-live="polite"><div className="obd-state-mark" aria-hidden="true">{['CONFIRMED','COMPLETED'].includes(booking.status)?'✓':['REJECTED','EXPIRED','CANCELLED'].includes(booking.status)?'!':'…'}</div><div><span className="obd-kicker">Trạng thái xử lý</span><h2>{guidance[0]}</h2><p>{guidance[1]}</p>{proof&&<p className="obd-proof-state">Minh chứng: <strong>{proofLabels[proof.status]}</strong>{proof.reviewed_at&&<> · Xử lý lúc {dayLabel(proof.reviewed_at)} {localTime(proof.reviewed_at)}</>}</p>}{booking.confirmed_at&&<p className="obd-meta">Xác nhận lúc {dayLabel(booking.confirmed_at)} {localTime(booking.confirmed_at)}</p>}{booking.rejected_at&&<p className="obd-meta">Từ chối lúc {dayLabel(booking.rejected_at)} {localTime(booking.rejected_at)}</p>}{booking.rejection_reason&&<p className="obd-reason"><strong>Lý do:</strong> {booking.rejection_reason}</p>}</div></section>;
}

export function OwnerBookingDetail(){
  const {booking_id}=useParams(),auth=useAuth(),navigate=useNavigate(),read=useRead('/owner/bookings/'+encodeURIComponent(booking_id),ownerBookingDetailResponse);
  const booking=read.data?.data,proof=booking?.payment_proof,proofId=proof?.id,[proofState,setProofState]=useState({}),proofRequest=useRef(null),proofGeneration=useRef(0),proofImageRetry=useRef(false),requestRef=useRef(auth.request),mutationLock=useRef(false),[modal,setModal]=useState(null),[reason,setReason]=useState(''),[reasonError,setReasonError]=useState(''),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[cancelUnknown,setCancelUnknown]=useState(false);
  useEffect(()=>{requestRef.current=auth.request;},[auth.request]);
  const reviewable=booking?.booking_flow_version===1&&booking?.status==='PENDING_CONFIRMATION'&&proof?.status==='SUBMITTED';
  const v2Reviewable=booking?.booking_flow_version===2&&booking?.status==='PENDING_CONFIRMATION';
  const loadProof=useCallback(async()=>{if(!proofId)return;const version=++proofGeneration.current;proofRequest.current?.abort();const controller=new AbortController();proofRequest.current=controller;setProofState(s=>({...s,resource:String(proofId),loading:true,error:null}));try{const value=await requestRef.current('/owner/payments/'+encodeURIComponent(proofId),{validate:ownerPaymentProofDetailResponse(proofId,booking.id),signal:controller.signal});if(!controller.signal.aborted&&version===proofGeneration.current)setProofState({resource:String(proofId),data:value.data,meta:value.meta,receivedAt:performance.now(),loading:false,error:null});}catch(error){if(!controller.signal.aborted&&version===proofGeneration.current)setProofState(s=>({...s,loading:false,error}));}finally{if(proofRequest.current===controller)proofRequest.current=null;}},[proofId,booking?.id]);
  // Load the short-lived external proof resource when the reviewed entity changes.
  // oxlint-disable-next-line react-hooks/set-state-in-effect
  // The cleanup intentionally aborts whichever proof request is current at unmount/resource change.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(reviewable)void loadProof();return()=>{proofGeneration.current++;proofRequest.current?.abort();proofRequest.current=null;};},[reviewable,loadProof]);
  useEffect(()=>{const expiry=proofState.data?.proof_image_expires_at,server=proofState.meta?.server_time;if(!expiry||!server||!Number.isFinite(proofState.receivedAt))return;const elapsed=Math.max(0,performance.now()-proofState.receivedAt),delay=Math.max(0,Date.parse(expiry)-Date.parse(server)-elapsed);const timer=setTimeout(()=>void loadProof(),delay);return()=>clearTimeout(timer);},[proofState.data?.proof_image_expires_at,proofState.meta?.server_time,proofState.receivedAt,loadProof]);
  const proofImageError=()=>{if(proofImageRetry.current){setProofState(s=>({...s,error:new Error('IMAGE_LOAD')}));return;}proofImageRetry.current=true;void loadProof();};
  async function mutate(action){
    const trimmed=reason.trim();if(action==='reject'&&(!trimmed||[...trimmed].length>500)){setReasonError(!trimmed?'Vui lòng nhập lý do từ chối.':'Lý do không được vượt quá 500 ký tự.');return;}
    if(busy||mutationLock.current)return;mutationLock.current=true;setBusy(true);setActionError('');
    const endpoint=v2Reviewable?`/owner/bookings/${booking.id}/${action}`:`/owner/payments/${proof.id}/${action}`;
    try{await auth.request(endpoint,{method:'POST',body:action==='reject'?{reason:trimmed}:{},...(v2Reviewable?{validate:ownerV2BookingActionResponse(booking.id)}:{})});setModal(null);await read.refresh();}
    catch(error){setModal(null);if(error.status===409||error.status===0||error.status>=500){try{await read.refresh();setActionError(error.status===409?'Trạng thái đã thay đổi. Dữ liệu mới nhất đã được tải lại.':'Kết quả chưa xác định; trạng thái mới nhất đã được đồng bộ từ máy chủ.');}catch{setActionError('Chưa xác minh được kết quả. Vui lòng tải lại trước khi thử tiếp.');}}else setActionError(message(error));}
    finally{mutationLock.current=false;setBusy(false);}
  }
  async function cancelBooking(){
    const trimmed=reason.trim();
    if(!trimmed||[...trimmed].length>500){setReasonError(!trimmed?'Vui lòng nhập lý do hủy đặt sân.':'Lý do không được vượt quá 500 ký tự.');return;}
    if(busy||cancelUnknown)return;setBusy(true);setActionError('');
    try{
      await auth.request(`/owner/bookings/${encodeURIComponent(booking.id)}/cancel`,{method:'POST',body:{reason:trimmed},validate:ownerBookingCancellationResponse(booking.deposit_amount)});
      setModal(null);await read.refresh();
    }catch(error){
      const recover=error.status===409||error.status===0||error.status>=500;
      if(recover){setModal(null);try{await read.refresh();setActionError(error.status===409?'Trạng thái đã thay đổi. Dữ liệu mới nhất đã được tải lại.':'Kết quả chưa xác định; trạng thái mới nhất đã được đồng bộ từ máy chủ.');}catch{setCancelUnknown(true);setActionError('Chưa xác minh được kết quả hủy. Vui lòng tải lại trang trước khi thử tiếp.');}}
      else setActionError(message(error));
    }finally{setBusy(false);}
  }
  if(read.loading)return <OwnerLayout><div className="obd-loading" role="status"><span className="obl-spinner" aria-hidden="true"/><div><strong>Đang tải chi tiết đặt sân</strong><p>Thông tin booking đang được đồng bộ từ máy chủ.</p></div></div></OwnerLayout>;
  if(!booking)return <OwnerLayout><div className="obd-error" role="alert"><span aria-hidden="true">!</span><div><h1>Chi tiết đặt sân</h1><p>{message(read.error)}</p></div><button className="om-outline" onClick={()=>read.refresh()}>Thử lại</button></div></OwnerLayout>;
  return <OwnerLayout><button className="ow-back obd-back" onClick={()=>navigate('/owner/bookings')}>← Đơn đặt sân</button><header className="obd-heading"><div><span className="obd-eyebrow">Vận hành đặt sân</span><h1>Chi tiết đặt sân</h1><p><strong>Booking #{booking.id}</strong></p></div><OwnerStatus status={booking.status}/></header>
    {read.error&&<div className="obd-refresh-error" role="alert"><span>Không thể cập nhật dữ liệu mới nhất. Chi tiết gần nhất vẫn được giữ lại.</span><button onClick={()=>read.refresh()} disabled={read.busy}>Thử lại</button></div>}{read.busy&&<span className="obd-sync" role="status"><i aria-hidden="true"/>Đang cập nhật dữ liệu mới nhất…</span>}{actionError&&<p className="ow-error obd-action-error" role="alert">{actionError}</p>}
    <div className="obd-layout"><div className="obd-main"><OwnerBookingOverview booking={booking}/>
      {reviewable&&<section className="obd-card obd-proof-card"><div className="obd-section-head"><span className="obd-section-icon" aria-hidden="true">▧</span><div><span className="obd-kicker">Tiền cọc</span><h2>Minh chứng thanh toán</h2></div></div><p>Đối chiếu ảnh chuyển khoản trước khi xác nhận. Mọi quyết định được máy chủ kiểm tra lại.</p><div className="ow-proof">{proofState.error?<div className="ow-error" role="alert"><p>Không thể xem minh chứng thanh toán.</p><button onClick={()=>{proofImageRetry.current=false;void loadProof();}}>Tải lại minh chứng</button></div>:proofState.loading&&!proofState.data?<p role="status">Đang tải minh chứng…</p>:proofState.data?<img src={proofState.data.proof_image_url} alt="Minh chứng thanh toán" loading="lazy" decoding="async" onError={proofImageError} onLoad={()=>{proofImageRetry.current=false;}}/>:null}</div><div className="ow-actions"><button disabled={busy||proofState.loading||proofState.error||proofState.expired} className="confirm" onClick={()=>setModal('confirm')}>Xác nhận đã nhận tiền</button><button disabled={busy} className="reject" onClick={()=>{setReason('');setReasonError('');setModal('reject');}}>Từ chối minh chứng</button></div></section>}
      {v2Reviewable&&<section className="obd-card obd-v2-review"><div className="obd-section-head"><span className="obd-section-icon" aria-hidden="true">₫</span><div><span className="obd-kicker">Chuyển khoản cọc</span><h2>Xác nhận giao dịch</h2></div></div><p>Đối chiếu khoản cọc tại ngân hàng bằng nội dung chuyển khoản trước khi xử lý.</p><dl><div><dt>Tiền cọc</dt><dd>{money(booking.deposit_amount)}</dd></div><div><dt>Nội dung chuyển khoản</dt><dd>{booking.transfer_reference}</dd></div><div><dt>Hạn xác nhận</dt><dd>{dayLabel(booking.confirmation_expires_at)} · {localTime(booking.confirmation_expires_at)}</dd></div></dl><div className="ow-actions"><button disabled={busy} className="confirm" onClick={()=>setModal('confirm')}>Xác nhận đặt sân</button><button disabled={busy} className="reject" onClick={()=>{setReason('');setReasonError('');setModal('reject');}}>Từ chối đặt sân</button></div></section>}
      {booking.status==='CONFIRMED'&&proof?.status==='APPROVED'&&<section className="obd-card obd-cancel-card"><div className="obd-section-head"><span className="obd-section-icon danger" aria-hidden="true">!</span><div><span className="obd-kicker">Thao tác booking</span><h2>Hủy đặt sân</h2></div></div><p>Chỉ hủy khi không thể tiếp tục phục vụ booking. Lịch sân sẽ được giải phóng và toàn bộ tiền cọc đã xác nhận cần được hoàn lại.</p><button className="reject" disabled={busy||cancelUnknown} onClick={()=>{setReason('');setReasonError('');setModal('cancel');}}>Hủy đặt sân</button></section>}
      {booking.status==='CANCELLED'&&<section className="obd-card obd-cancelled"><div className="obd-section-head"><span className="obd-section-icon danger" aria-hidden="true">!</span><div><span className="obd-kicker">Lịch sử booking</span><h2>Thông tin hủy đặt sân</h2></div></div><dl><div><dt>Thời điểm hủy</dt><dd>{booking.cancelled_at?dayLabel(booking.cancelled_at)+' '+localTime(booking.cancelled_at):'Chưa ghi nhận'}</dd></div><div><dt>Người hủy</dt><dd>{booking.cancelled_by==='OWNER'?'Chủ sân':booking.cancelled_by==='CUSTOMER'?'Khách hàng':'Chưa ghi nhận'}</dd></div><div className="reason"><dt>Lý do</dt><dd>{booking.cancellation_reason||'Không có lý do được ghi nhận.'}</dd></div></dl></section>}
      {booking.status==='CANCELLED'&&booking.refund&&<OwnerRefundPanel refund={booking.refund} refresh={read.refresh}/>}
    </div><aside className="obd-aside"><OwnerFinancialSummary booking={booking}/><OwnerLifecycleSummary booking={booking} proof={proof}/><section className="obd-card obd-created"><span>Booking được tạo lúc</span><strong>{dayLabel(booking.created_at)} · {localTime(booking.created_at)}</strong></section></aside></div>
    {modal==='confirm'&&<Modal title={v2Reviewable?'Xác nhận đặt sân':'Xác nhận đã nhận tiền?'} description={v2Reviewable?'Bạn đã kiểm tra giao dịch chuyển khoản và muốn xác nhận đặt sân này?':'Hãy chắc chắn khoản cọc đã được nhận trước khi xác nhận.'} onClose={()=>setModal(null)} onSubmit={()=>mutate('confirm')} busy={busy} submitLabel={v2Reviewable?'Xác nhận đặt sân':'Xác nhận'}/>}
    {modal==='reject'&&<Modal title={v2Reviewable?'Từ chối đặt sân':'Từ chối minh chứng'} onClose={()=>setModal(null)} onSubmit={()=>mutate('reject')} busy={busy} submitLabel="Từ chối" destructive><label>Lý do<textarea autoFocus value={reason} onChange={e=>{setReason(e.target.value);setReasonError('');}} maxLength={500}/></label><small>{[...reason].length}/500</small>{reasonError&&<p role="alert">{reasonError}</p>}</Modal>}
    {modal==='cancel'&&<Modal title="Hủy đặt sân" description="Booking đã xác nhận sẽ được hủy và lịch sân được giải phóng." onClose={()=>setModal(null)} onSubmit={cancelBooking} busy={busy} submitLabel="Xác nhận hủy" cancelLabel="Quay lại" destructive><div className="ow-refund-readonly"><small>Số tiền cọc cần hoàn</small><strong>{money(booking.deposit_amount)}</strong><p>Số tiền được lấy từ booking và không thể chỉnh sửa.</p></div><label>Lý do hủy *<textarea autoFocus value={reason} onChange={e=>{setReason(e.target.value);setReasonError('');}} maxLength={501}/></label><small className="ow-counter">{[...reason].length}/500</small>{reasonError&&<p role="alert">{reasonError}</p>}</Modal>}
  </OwnerLayout>;
}
