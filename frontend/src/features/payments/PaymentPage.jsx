import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../../services/api';
import { useAuth } from '../auth/useAuth';
import { money } from '../facilities/detailRules';
import { BookingBack, BookingInfo, BookingLayout, CostSummary, StatusBadge } from '../bookings/BookingUI';
import { bookingError, stampLabel } from '../bookings/rules';
import { ServerCountdown } from '../bookings/ServerCountdown';
import { useServerCountdown } from '../bookings/useServerCountdown';
import { useBookingRead } from '../bookings/useBookingRead';
import { bookingDetailResponse, customerProofResponse } from '../../services/responseValidators';
import { AccessibleModal } from '../../components/AccessibleModal';
import './payment.css';

const MAX_BYTES = 5_000_000;
const terminal = new Set(['CONFIRMED','REJECTED','CANCELLED','EXPIRED','COMPLETED']);
const definitive = new Set(['BOOKING_EXPIRED','PROOF_ALREADY_SUBMITTED','INVALID_BOOKING_STATE']);

function paymentError(error) {
  if (error?.status === 404) return 'Không tìm thấy booking hoặc bạn không có quyền xem booking này.';
  return errorMessage(error || {});
}
function validateFile(file) {
  if (!file) return 'Vui lòng chọn ảnh minh chứng.';
  if (!['image/jpeg','image/png'].includes(file.type)) return 'Chỉ chấp nhận ảnh JPG hoặc PNG.';
  if (file.size > MAX_BYTES) return 'Ảnh minh chứng không được vượt quá 5 MB.';
  return '';
}
const sizeLabel = bytes => bytes < 1_000_000 ? `${Math.max(1,Math.round(bytes/1000))} KB` : `${(bytes/1_000_000).toFixed(2)} MB`;

function CopyButton({ value, label, onFeedback }) {
  async function copy() {
    try { await navigator.clipboard.writeText(value); onFeedback(`Đã sao chép ${label}.`); }
    catch { onFeedback(`Không thể sao chép ${label}. Vui lòng sao chép thủ công.`); }
  }
  return <button type="button" className="pay-copy" onClick={copy} aria-label={'Sao chép '+label}>Sao chép</button>;
}

function ActivePayment({ booking, read }) {
  const auth=useAuth(), navigate=useNavigate();
  const [file,setFile]=useState(null),[preview,setPreview]=useState(''),[fileError,setFileError]=useState(''),[message,setMessage]=useState(''),[submitError,setSubmitError]=useState(''),[mode,setMode]=useState('idle'),[cancelOpen,setCancelOpen]=useState(false),[cancelBusy,setCancelBusy]=useState(false);
  const checkedExpiry=useRef(null), input=useRef(null), previewRef=useRef('');
  const refresh=read.refresh;
  const syncAtZero=useCallback(expiresAt=>{if(checkedExpiry.current===expiresAt)return;checkedExpiry.current=expiresAt;void refresh();},[refresh]);
  const remaining=useServerCountdown(booking.expires_at,read.value.meta.server_time,read.receivedAt,syncAtZero);
  const verified=Boolean(read.value)&&!read.error&&mode!=='unknown';
  useEffect(()=>()=>{if(previewRef.current)URL.revokeObjectURL(previewRef.current);},[]);
  function choose(event) {
    const next=event.target.files?.[0]||null, error=validateFile(next);
    if(previewRef.current)URL.revokeObjectURL(previewRef.current);
    previewRef.current=error||!next?'':URL.createObjectURL(next);
    setPreview(previewRef.current);setFile(error?null:next);setFileError(error);setSubmitError('');setMessage('');
    if(error)event.target.value='';
  }
  function remove(){if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current='';setPreview('');setFile(null);setFileError('');setMessage('');if(input.current)input.current.value='';}
  async function recover() {
    setMode('unknown');setSubmitError('Đang xác minh kết quả gửi minh chứng…');
    const result=await read.refresh();
    const state=result?.value?.data?.status;
    if(state==='PENDING_CONFIRMATION'){navigate('/bookings/'+booking.id,{replace:true});return;}
    if(state==='PENDING_PAYMENT'){
      setMode('idle');setSubmitError('Máy chủ chưa ghi nhận minh chứng. Bạn có thể chủ động gửi lại sau khi kiểm tra ảnh.');return;
    }
    if(state&&terminal.has(state)){setMode('terminal');setSubmitError('Booking đã chuyển sang trạng thái khác. Không thể gửi minh chứng.');return;}
    setMode('unknown');setSubmitError('Chưa xác minh được kết quả. Vui lòng kiểm tra lại trạng thái trước khi thao tác.');
  }
  async function submit(event) {
    event.preventDefault();
    if(mode==='uploading'||!file||!verified||remaining===0)return;
    setMode('uploading');setSubmitError('');
    const form=new FormData();form.append('image',file);
    try {
      const response=await auth.request('/payments/bookings/'+encodeURIComponent(booking.id)+'/proof',{method:'POST',body:form});
      if(response.data?.booking?.status!=='PENDING_CONFIRMATION')return await recover();
      const latest=await read.refresh();
      if(latest?.value?.data?.status==='PENDING_CONFIRMATION')navigate('/bookings/'+booking.id,{replace:true});
      else await recover();
    } catch(error) {
      if(error.status===0||error.status>=500){await recover();return;}
      setMode(definitive.has(error.code)?'terminal':'idle');setSubmitError(paymentError(error));
      if(definitive.has(error.code))await read.refresh();
    }
  }
  async function cancel(){
    if(cancelBusy)return;setCancelBusy(true);setSubmitError('');
    try{
      await auth.request('/bookings/'+encodeURIComponent(booking.id)+'/cancel',{method:'POST',body:{}});
      const latest=await read.refresh();setCancelOpen(false);
      if(latest?.value?.data?.status==='CANCELLED')navigate('/bookings/'+booking.id,{replace:true});
      else setSubmitError('Trạng thái booking đã thay đổi. Vui lòng kiểm tra lại chi tiết booking.');
    }catch(error){
      setCancelOpen(false);setSubmitError(paymentError(error));
      if(error.status===409||error.status===0)await read.refresh();
    }finally{setCancelBusy(false);}
  }
  return <>
    <div className="pay-heading"><div><p>Mã booking: {booking.id}</p><h1>Chi tiết đặt sân</h1></div><StatusBadge status={booking.status}/></div>
    {read.busy&&<p role="status">Đang đồng bộ trạng thái booking…</p>}
    {read.error&&mode!=='unknown'&&<div className="bk-error" role="alert"><p>Chưa xác minh được trạng thái hiện tại. Việc gửi minh chứng đã bị khóa.</p><button onClick={recover}>Kiểm tra lại trạng thái</button></div>}
    <div className="pay-overview"><div><BookingInfo booking={booking} slots={booking.slots}/><section className="bk-panel pay-deposit"><small>Thanh toán tiền cọc</small><strong>{money(booking.deposit_amount)}</strong><p>Vui lòng chuyển khoản tiền cọc 30% trước khi thời gian giữ sân kết thúc.</p></section></div><aside>
      <ServerCountdown key={read.receivedAt} expiresAt={booking.expires_at} serverTime={read.value.meta.server_time} receivedAt={read.receivedAt} sync={syncAtZero}/>
      <CostSummary amounts={booking}/><section className="bk-panel"><p className="bk-muted">Thời điểm tạo booking</p><strong>{stampLabel(booking.created_at)}</strong></section>
    </aside></div>
    <section className="bk-panel pay-bank"><div><h2>Thông tin chuyển khoản</h2><dl>
      <div><dt>Ngân hàng</dt><dd>{booking.bank_name_snapshot}</dd></div><div><dt>Chủ tài khoản</dt><dd>{booking.account_holder_snapshot}</dd></div>
      <div><dt>Số tài khoản</dt><dd><span>{booking.account_number_snapshot}</span><CopyButton value={booking.account_number_snapshot} label="số tài khoản" onFeedback={setMessage}/></dd></div>
      <div><dt>Số tiền cọc</dt><dd><span>{money(booking.deposit_amount)}</span><CopyButton value={money(booking.deposit_amount)} label="số tiền cọc" onFeedback={setMessage}/></dd></div>
      <div><dt>Nội dung</dt><dd><span>{'BOOKING '+booking.id}</span><CopyButton value={'BOOKING '+booking.id} label="nội dung chuyển khoản" onFeedback={setMessage}/></dd></div>
    </dl>{message&&<p className="pay-feedback" role="status">{message}</p>}</div><div className="pay-qr"><h3>Mã QR thanh toán</h3>{booking.qr_image_url?<img src={booking.qr_image_url} alt="Mã QR thanh toán"/>:<><span aria-hidden="true">▦</span><strong>QR thanh toán chưa khả dụng</strong><p>Vui lòng chuyển khoản theo thông tin bên cạnh.</p></>}</div></section>
    <form onSubmit={submit}><section className="bk-panel pay-upload"><h2>Minh chứng thanh toán</h2><p className="bk-muted">Chụp màn hình giao dịch thành công và tải lên để chủ sân kiểm tra.</p>
      <label className="pay-drop" aria-disabled={!verified||remaining===0}><span aria-hidden="true">⇧</span><strong>{file?'Chọn ảnh khác':'Chọn ảnh tải lên'}</strong><small>JPG hoặc PNG, tối đa 5 MB</small><input ref={input} type="file" accept="image/jpeg,image/png" onChange={choose} disabled={!verified||remaining===0||mode==='uploading'}/></label>
      {file&&<div className="pay-file">{preview&&<img src={preview} alt="Xem trước minh chứng thanh toán"/>}<span><strong>{file.name}</strong><small>{sizeLabel(file.size)}</small></span><div><button type="button" onClick={()=>input.current?.click()} disabled={mode==='uploading'}>Thay ảnh</button><button type="button" className="pay-delete" onClick={remove} disabled={mode==='uploading'}>Xóa</button></div></div>}
      {fileError&&<p className="pay-form-error" role="alert">{fileError}</p>}
    </section>
    {submitError&&<div className="bk-error" role="alert"><p>{submitError}</p>{mode==='unknown'&&<button type="button" onClick={recover} disabled={read.busy}>Kiểm tra lại trạng thái</button>}</div>}
    <div className="pay-actions"><button type="button" className="pay-cancel" onClick={()=>setCancelOpen(true)} disabled={!verified||remaining===0||mode==='uploading'}>Hủy đặt sân</button><button className="fl-primary pay-submit" disabled={!file||!verified||remaining===0||mode==='uploading'||mode==='terminal'}>{mode==='uploading'?'Đang gửi minh chứng…':'Gửi minh chứng'}</button></div></form>
    {cancelOpen&&<AccessibleModal title="Hủy đặt sân?" description="Yêu cầu đặt sân sẽ bị hủy, khung giờ sẽ được mở lại và thao tác này không thể hoàn tác." busy={cancelBusy} onClose={()=>setCancelOpen(false)} backdropClass="pay-modal-back" className="pay-modal"><div className="pay-modal-actions"><button autoFocus disabled={cancelBusy} onClick={()=>setCancelOpen(false)}>Không, giữ đặt sân</button><button className="pay-danger" disabled={cancelBusy} onClick={cancel}>{cancelBusy?'Đang hủy…':'Hủy đặt sân'}</button></div></AccessibleModal>}
  </>;
}

const proofStatusLabels={SUBMITTED:'Đã gửi, chờ kiểm tra',APPROVED:'Đã được xác nhận',REJECTED:'Đã bị từ chối'};

function ProofPanel({booking}){
  const validate=useCallback(envelope=>customerProofResponse(envelope)&&String(envelope.data.booking_id)===String(booking.id),[booking.id]);
  const read=useBookingRead('/payments/bookings/'+encodeURIComponent(booking.id)+'/proof',false,validate),proof=read.value?.data;
  const [failedUrl,setFailedUrl]=useState(''),[expiredUrl,setExpiredUrl]=useState('');
  const autoRetryUsed=useRef(false);
  const proofUrl=proof?.proof_image_url,proofExpiresAt=proof?.proof_image_expires_at,proofServerTime=read.value?.meta?.server_time;
  useEffect(()=>{
    if(!proofUrl)return undefined;
    const delay=Math.max(0,Date.parse(proofExpiresAt)-Date.parse(proofServerTime));
    const timer=setTimeout(()=>setExpiredUrl(proofUrl),delay);
    return()=>clearTimeout(timer);
  },[proofUrl,proofExpiresAt,proofServerTime]);
  async function refresh(manual=false){
    if(manual)autoRetryUsed.current=false;
    setFailedUrl('');setExpiredUrl('');
    const result=await read.refresh();
    if(result.error)setFailedUrl(proofUrl||'error');
  }
  async function imageError(){
    if(autoRetryUsed.current){setFailedUrl(proofUrl);return;}
    autoRetryUsed.current=true;
    await refresh();
  }
  const unavailable=read.error||failedUrl===(proofUrl||'error')||expiredUrl===proofUrl;
  return <section className="bk-panel pay-proof"><div className="pay-proof-title"><span aria-hidden="true">✓</span><div><h2>Đã gửi minh chứng</h2><p>Minh chứng thanh toán của bạn đã được gửi đến chủ sân.</p><p>Chủ sân đang kiểm tra khoản cọc. Bạn sẽ nhận được kết quả sau khi chủ sân xác nhận.</p></div></div>
    {read.loading?<p role="status">Đang tải minh chứng thanh toán…</p>:unavailable?<div className="pay-proof-error" role="alert"><p>Không thể tải ảnh minh chứng lúc này.</p><button type="button" onClick={()=>refresh(true)} disabled={read.busy}>{read.busy?'Đang tải lại…':'Tải lại'}</button></div>:proof?<>
      <img className="pay-proof-image" src={proof.proof_image_url} alt="Minh chứng thanh toán đã gửi" onError={imageError}/>
      <dl className="pay-proof-meta"><div><dt>Số tiền cọc</dt><dd>{money(booking.deposit_amount)}</dd></div><div><dt>Thời gian gửi</dt><dd>{stampLabel(proof.submitted_at)}</dd></div><div><dt>Trạng thái minh chứng</dt><dd>{proofStatusLabels[proof.status]}</dd></div><div><dt>Ngân hàng</dt><dd>{booking.bank_name_snapshot}</dd></div><div><dt>Nội dung chuyển khoản</dt><dd>{'BOOKING '+booking.id}</dd></div></dl>
    </>:null}
  </section>;
}

function BookingOverview({booking,children,note}){
  return <><div className="pay-heading"><div><p>Mã booking: {booking.id}</p><h1>Chi tiết đặt sân</h1></div><StatusBadge status={booking.status}/></div>
    <div className="pay-overview"><BookingInfo booking={booking} slots={booking.slots}/><aside><CostSummary amounts={booking}/><section className="bk-panel"><p className="bk-muted">Thời điểm tạo booking</p><strong>{stampLabel(booking.created_at)}</strong></section>{note&&<div className="pay-state-note">ⓘ {note}</div>}</aside></div>{children}</>;
}

function SubmittedPayment({booking,read}){
  return <BookingOverview booking={booking} note="Thông tin booking được cập nhật theo trạng thái xác nhận hiện tại.">
    {read.busy&&<p role="status">Đang đồng bộ trạng thái booking…</p>}
    {read.error&&<div className="bk-error" role="alert"><p>Chưa thể đồng bộ trạng thái mới nhất.</p><button onClick={read.refresh}>Thử lại</button></div>}
    <ProofPanel booking={booking}/>
  </BookingOverview>;
}

const terminalCopy={
  CONFIRMED:{title:'Đặt sân đã được xác nhận',body:'Tiền cọc đã được chủ sân xác nhận. Vui lòng thanh toán phần còn lại tại sân.'},
  REJECTED:{title:'Đặt sân bị từ chối',body:'Chủ sân đã từ chối minh chứng thanh toán. Booking này đã kết thúc và không thể gửi lại minh chứng.'},
  EXPIRED:{title:'Yêu cầu đặt sân đã hết hạn',body:'Thời gian giữ sân đã kết thúc trước khi minh chứng thanh toán được gửi thành công.'},
  CANCELLED:{title:'Đặt sân đã được hủy',body:'Booking này đã được hủy và không còn thao tác thanh toán.'},
  COMPLETED:{title:'Lịch đặt sân đã hoàn thành',body:'Lịch chơi này đã hoàn thành.'},
};
function PaymentState({booking}){
  const copy=terminalCopy[booking.status]||{title:'Trạng thái booking đã thay đổi',body:'Vui lòng xem chi tiết booking để biết thông tin mới nhất.'};
  return <BookingOverview booking={booking}><section className={'bk-panel pay-state '+booking.status}><h2>{copy.title}</h2><p>{copy.body}</p>{booking.status==='CONFIRMED'&&<p><strong>Tiền cọc đã xác nhận:</strong> {money(booking.deposit_amount)}<br/><strong>Còn lại tại sân:</strong> {money(booking.remaining_amount)}</p>}{booking.status==='EXPIRED'&&<Link className="bk-button" to="/facilities">Tìm sân khác</Link>}<Link className="bk-button secondary" to={'/bookings/'+booking.id}>Về chi tiết booking</Link></section></BookingOverview>;
}

export function PaymentPage(){
  const {id}=useParams(),read=useBookingRead('/bookings/'+encodeURIComponent(id),true,bookingDetailResponse),booking=read.value?.data;
  const inaccessible=[401,403,404,422].includes(read.error?.status)&&!booking;
  return <BookingLayout><BookingBack to="/bookings">Lịch đặt sân của tôi</BookingBack>
    {read.loading?<p role="status">Đang tải thông tin thanh toán…</p>:inaccessible||!booking?<div className="bk-error" role="alert"><h1>Thanh toán tiền cọc</h1><p>{bookingError(read.error||{})}</p><button onClick={read.refresh}>Thử lại</button></div>
      :booking.status==='PENDING_PAYMENT'?<ActivePayment booking={booking} read={read}/>
      :booking.status==='PENDING_CONFIRMATION'?<SubmittedPayment booking={booking} read={read}/>
      :<PaymentState booking={booking}/>}</BookingLayout>;
}
