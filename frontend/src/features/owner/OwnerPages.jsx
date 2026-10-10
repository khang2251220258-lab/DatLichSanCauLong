import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { localTime, money } from '../facilities/detailRules';
import { bookingLabels, dayLabel } from '../bookings/rules';
import { OwnerLayout, OwnerPager as Pager, ownerError as message, useOwnerRead as useRead } from './OwnerShared';
import './owner.css';
import { detailResponse, ownerBookingListResponse, ownerBookingDetailResponse } from '../../services/responseValidators';
import { AccessibleModal } from '../../components/AccessibleModal';
import { OwnerRefundPanel } from '../refunds/RefundPanels';

const statuses=['PENDING_PAYMENT','PENDING_CONFIRMATION','CONFIRMED','COMPLETED','CANCELLED','REJECTED','EXPIRED'];
const ownerLabels=bookingLabels;
const proofLabels={SUBMITTED:'Chờ xác nhận',APPROVED:'Đã xác nhận',REJECTED:'Đã từ chối'};
const OwnerStatus=({status})=><span className={'bk-badge '+status}>{ownerLabels[status]||'Chưa xác định'}</span>;

export function OwnerBookingList(){
  const [params,setParams]=useSearchParams(),page=Math.max(1,Number(params.get('page'))||1),status=params.get('status')||'';
  const query=new URLSearchParams({page:String(page),page_size:'20'});if(status)query.set('status',status);
  const read=useRead('/owner/bookings?'+query,ownerBookingListResponse),rows=read.data?.data||[];
  const update=(next)=>{const p=new URLSearchParams(params);Object.entries(next).forEach(([k,v])=>v?p.set(k,String(v)):p.delete(k));setParams(p);};
  return <OwnerLayout><div className="ow-title"><h1>Quản lý đặt sân</h1><label>Trạng thái<select value={status} onChange={e=>update({status:e.target.value,page:1})}><option value="">Tất cả</option>{statuses.map(s=><option key={s} value={s}>{ownerLabels[s]}</option>)}</select></label></div>
    {read.loading?<p role="status">Đang tải danh sách đặt sân…</p>:read.error?<div className="ow-error" role="alert"><p>{message(read.error)}</p><button onClick={()=>read.refresh()}>Thử lại</button></div>:!rows.length?<div className="ow-empty"><h2>Chưa có đơn đặt sân</h2><p>Không có booking phù hợp với bộ lọc hiện tại.</p></div>:<><div className="ow-table" role="table"><div className="ow-row head" role="row"><span>ID</span><span>Khách hàng</span><span>Cơ sở / Sân</span><span>Ngày giờ</span><span>Tiền cọc</span><span>Trạng thái</span><span/></div>{rows.map(b=><div className="ow-row" role="row" key={b.id}><strong data-label="Booking">#{b.id}</strong><span data-label="Khách hàng">{b.customer.full_name}<small>{b.customer.phone||'Chưa có SĐT'}</small></span><span data-label="Cơ sở / Sân">{b.facility.name}<small>{b.court.name}</small></span><span data-label="Ngày giờ">{dayLabel(b.start_at)}<small>{localTime(b.start_at)}–{localTime(b.end_at)}</small></span><strong data-label="Tiền cọc" className="ow-money">{money(b.deposit_amount)}</strong><span data-label="Trạng thái"><OwnerStatus status={b.status}/></span><Link aria-label={'Xem chi tiết booking '+b.id} to={'/owner/bookings/'+b.id}>Xem chi tiết</Link></div>)}</div><Pager meta={read.data.meta} onPage={p=>update({page:p})}/></>}
  </OwnerLayout>;
}

function Modal({title,description,children,onClose,onSubmit,busy,submitLabel}){return <AccessibleModal title={title} description={description} busy={busy} onClose={onClose} backdropClass="ow-modal-back" className="ow-modal">{children}<div><button disabled={busy} onClick={onClose}>Hủy</button><button autoFocus className="primary" disabled={busy} onClick={onSubmit}>{busy?'Đang xử lý…':submitLabel}</button></div></AccessibleModal>;}

export function OwnerBookingDetail(){
  const {booking_id}=useParams(),auth=useAuth(),navigate=useNavigate(),read=useRead('/owner/bookings/'+encodeURIComponent(booking_id),ownerBookingDetailResponse);
  const booking=read.data?.data,proof=booking?.payment_proof,proofId=proof?.id,[proofState,setProofState]=useState({}),[modal,setModal]=useState(null),[reason,setReason]=useState(''),[reasonError,setReasonError]=useState(''),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
  const reviewable=booking?.status==='PENDING_CONFIRMATION'&&proof?.status==='SUBMITTED';
  const loadProof=useCallback(async()=>{if(!proofId)return;setProofState(s=>({...s,loading:true,error:null}));try{const value=await auth.request('/owner/payments/'+encodeURIComponent(proofId),{validate:detailResponse});setProofState({data:value.data,loading:false,error:null});}catch(error){setProofState({loading:false,error});}},[auth,proofId]);
  // Load the short-lived external proof resource when the reviewed entity changes.
  // oxlint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(reviewable)void loadProof();},[reviewable,loadProof]);
  useEffect(()=>{const expiry=proofState.data?.proof_image_expires_at;if(!expiry)return;const delay=Math.max(0,new Date(expiry).getTime()-Date.now());const timer=setTimeout(()=>setProofState(s=>({...s,expired:true})),delay);return()=>clearTimeout(timer);},[proofState.data?.proof_image_expires_at]);
  async function mutate(action){
    const trimmed=reason.trim();if(action==='reject'&&(!trimmed||[...trimmed].length>500)){setReasonError(!trimmed?'Vui lòng nhập lý do từ chối.':'Lý do không được vượt quá 500 ký tự.');return;}
    if(busy)return;setBusy(true);setActionError('');
    try{await auth.request(`/owner/payments/${proof.id}/${action}`,{method:'POST',body:action==='reject'?{reason:trimmed}:{}});setModal(null);await read.refresh();}
    catch(error){setModal(null);if(error.status===409||error.status===0||error.status>=500){try{await read.refresh();setActionError(error.status===409?'Trạng thái đã thay đổi. Dữ liệu mới nhất đã được tải lại.':'Kết quả chưa xác định; trạng thái mới nhất đã được đồng bộ từ máy chủ.');}catch{setActionError('Chưa xác minh được kết quả. Vui lòng tải lại trước khi thử tiếp.');}}else setActionError(message(error));}
    finally{setBusy(false);}
  }
  if(read.loading)return <OwnerLayout><p role="status">Đang tải chi tiết booking…</p></OwnerLayout>;
  if(read.error||!booking)return <OwnerLayout><div className="ow-error" role="alert"><h1>Chi tiết đặt sân</h1><p>{message(read.error)}</p><button onClick={()=>read.refresh()}>Thử lại</button></div></OwnerLayout>;
  return <OwnerLayout><button className="ow-back" onClick={()=>navigate('/owner/bookings')}>← Quản lý đặt sân</button><div className="ow-review-head"><div><h1>Xác nhận thanh toán</h1><p>Booking #{booking.id}</p></div><OwnerStatus status={booking.status}/></div>
    <section className="ow-card"><div className="ow-customer"><h2>{booking.customer.full_name}</h2><p>SĐT: {booking.customer.phone||'Chưa cập nhật'}</p></div><div className="ow-facts"><div><small>Cơ sở</small><strong>{booking.facility.name}</strong></div><div><small>Sân</small><strong>{booking.court.name}</strong></div><div><small>Ngày</small><strong>{dayLabel(booking.start_at)}</strong></div><div><small>Giờ</small><strong>{localTime(booking.start_at)}–{localTime(booking.end_at)}</strong></div><div><small>Tiền cọc</small><strong className="ow-money">{money(booking.deposit_amount)}</strong></div></div>
      <div className="ow-slots"><h3>Khung giờ</h3>{booking.slots.map(s=><span key={s.start_at}>{localTime(s.start_at)}–{localTime(s.end_at)} · {money(s.slot_amount)}</span>)}</div>
      {reviewable&&<div className="ow-proof"><h3>Ảnh minh chứng</h3>{proofState.error?<div className="ow-error" role="alert"><p>Không thể xem minh chứng thanh toán.</p><button onClick={loadProof}>Tải lại minh chứng</button></div>:proofState.loading||!proofState.data?<p role="status">Đang tải minh chứng…</p>:proofState.expired?<div className="ow-error"><p>Liên kết xem minh chứng đã hết hạn.</p><button onClick={loadProof}>Tạo liên kết xem mới</button></div>:<img src={proofState.data.proof_image_url} alt="Minh chứng thanh toán" onError={()=>setProofState(s=>({...s,error:new Error('IMAGE_LOAD')}))}/>}</div>}
      {actionError&&<p className="ow-error" role="alert">{actionError}</p>}
      {reviewable&&<div className="ow-actions"><button disabled={busy||proofState.loading||proofState.error||proofState.expired} className="confirm" onClick={()=>setModal('confirm')}>Xác nhận đã nhận tiền</button><button disabled={busy} className="reject" onClick={()=>{setReason('');setReasonError('');setModal('reject');}}>Từ chối minh chứng</button></div>}
      {!reviewable&&<p className="ow-finished">Trạng thái thanh toán hiện tại: <strong>{proofLabels[proof?.status]||'Chưa có minh chứng'}</strong>{booking.rejection_reason&&<> — {booking.rejection_reason}</>}</p>}
    </section>{booking.status==='CANCELLED'&&booking.refund&&<OwnerRefundPanel refund={booking.refund} refresh={read.refresh}/>} 
    {modal==='confirm'&&<Modal title="Xác nhận đã nhận tiền?" description="Hãy chắc chắn khoản cọc đã được nhận trước khi xác nhận." onClose={()=>setModal(null)} onSubmit={()=>mutate('confirm')} busy={busy} submitLabel="Xác nhận"/>}
    {modal==='reject'&&<Modal title="Từ chối minh chứng" onClose={()=>setModal(null)} onSubmit={()=>mutate('reject')} busy={busy} submitLabel="Từ chối"><label>Lý do<textarea autoFocus value={reason} onChange={e=>{setReason(e.target.value);setReasonError('');}} maxLength={501}/></label><small>{[...reason].length}/500</small>{reasonError&&<p role="alert">{reasonError}</p>}</Modal>}
  </OwnerLayout>;
}
