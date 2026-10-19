import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AccessibleModal } from '../../components/AccessibleModal';
import { bookingCancellationResponse, bookingDetailResponse } from '../../services/responseValidators';
import { useAuth } from '../auth/useAuth';
import { BookingBack, BookingInfo, BookingLayout, CostSummary, StatusBadge } from './BookingUI';
import { bookingError, stampLabel } from './rules';
import { useBookingRead } from './useBookingRead';
import { ServerCountdown } from './ServerCountdown';
import { CustomerRefundPanel } from '../refunds/RefundPanels';

const deadlineOf = booking => booking.cancellation_cutoff_hours_snapshot === null ? null
  : new Date(Date.parse(booking.start_at) - booking.cancellation_cutoff_hours_snapshot * 3600000);

function CancellationPanel({ booking, read }) {
  const auth=useAuth(), [modal,setModal]=useState(false), [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''), [uncertainSince,setUncertainSince]=useState(null), [reason,setReason]=useState(''), [elapsed,setElapsed]=useState(0);
  const deadline=deadlineOf(booking);
  const deadlineStamp=deadline?.toISOString()||'';
  useEffect(()=>{if(!deadlineStamp)return undefined;const timer=setInterval(()=>setElapsed(value=>value+1000),1000);return()=>clearInterval(timer);},[deadlineStamp]);
  const serverNow=Date.parse(read.value.meta.server_time)+elapsed;
  const uncertain=uncertainSince!==null&&!(read.revision>uncertainSince);
  const eligible=Boolean(deadline)&&serverNow<+deadline&&!read.error&&!uncertain&&booking.status==='CONFIRMED';
  async function cancel(){
    if(busy||!eligible)return;setBusy(true);setMessage('');
    try{
      await auth.request(`/bookings/${encodeURIComponent(booking.id)}/cancel`,{method:'POST',body:reason.trim()?{reason:reason.trim()}:{},validate:bookingCancellationResponse});
      setModal(false);setUncertainSince(read.revision||0);
      const synced=await read.refresh();
      if(synced.verified){setUncertainSince(null);setMessage('');}
      else setMessage('Booking đã được hủy nhưng chưa thể đồng bộ chi tiết mới nhất. Vui lòng kiểm tra lại trạng thái trước khi thao tác tiếp.');
    }catch(error){
      setModal(false);
      if(error.status===409||error.status===0||error.status>=500){
        setUncertainSince(read.revision||0);
        const synced=await read.refresh();
        if(synced.verified){setUncertainSince(null);setMessage('');}
        else setMessage(error.status===409?'Trạng thái có thể đã thay đổi nhưng chưa thể đồng bộ dữ liệu mới nhất. Vui lòng kiểm tra lại trước khi thao tác.':'Kết quả yêu cầu chưa rõ và chưa thể xác minh trạng thái mới nhất. Vui lòng kiểm tra lại trước khi thao tác.');
      }else setMessage(bookingError(error));
    }finally{setBusy(false);}
  }
  return <section className="bk-panel bk-cancellation"><h2>Chính sách hủy đặt sân</h2>
    {booking.cancellation_cutoff_hours_snapshot===null?<p>Booking này không có chính sách hủy đã lưu. Bạn không thể tự hủy booking đã xác nhận.</p>:<>
      <dl><div><dt>Thời hạn hủy trước giờ chơi</dt><dd>{booking.cancellation_cutoff_hours_snapshot} giờ</dd></div><div><dt>Hạn hủy</dt><dd>{stampLabel(deadline.toISOString())}</dd></div></dl>
      <p className={eligible?'bk-cancel-ok':'bk-cancel-stop'}>{eligible?'Booking vẫn còn trong thời hạn cho phép hủy.':'Đã qua thời hạn cho phép hủy booking.'}</p>
      <button className="bk-button bk-cancel-button" disabled={!eligible||busy||read.busy} onClick={()=>setModal(true)}>Hủy đặt sân</button>
    </>}{message&&(uncertainSince===null||uncertain)&&<p role="alert" className="bk-cancel-stop">{message}</p>}
    {modal&&<AccessibleModal title="Xác nhận hủy đặt sân?" description="Booking sẽ chuyển sang Đã hủy, khung giờ được giải phóng và khoản hoàn cọc sẽ chờ chủ sân xử lý." busy={busy} onClose={()=>setModal(false)} backdropClass="bk-modal-back" className="bk-modal"><label htmlFor="cancel-reason">Lý do (không bắt buộc)</label><textarea id="cancel-reason" autoFocus maxLength="500" value={reason} onChange={event=>setReason(event.target.value)}/><div><button disabled={busy} onClick={()=>setModal(false)}>Quay lại</button><button className="danger" disabled={busy} onClick={cancel}>{busy?'Đang hủy…':'Xác nhận hủy'}</button></div></AccessibleModal>}
  </section>;
}

const cancellationActor={CUSTOMER:'Bạn',OWNER:'Chủ sân'};
function CancellationMetadata({booking}){
  return <section className="bk-panel bk-cancelled-meta"><div className="bk-section-kicker">Lịch sử booking</div><h2>Thông tin hủy đặt sân</h2>
    <dl><div><dt>Trạng thái</dt><dd>Đã hủy booking</dd></div><div><dt>Thời điểm hủy</dt><dd>{booking.cancelled_at?stampLabel(booking.cancelled_at):'Chưa ghi nhận'}</dd></div><div><dt>Người hủy</dt><dd>{cancellationActor[booking.cancelled_by]||'Chưa ghi nhận'}</dd></div><div><dt>Lý do</dt><dd>{booking.cancellation_reason?.trim()||'Không có lý do được ghi nhận.'}</dd></div></dl>
  </section>;
}

function DetailPage({id}){
  const validate=useCallback(envelope=>bookingDetailResponse(envelope)&&String(envelope.data.id)===String(id),[id]);
  const read=useBookingRead('/bookings/'+encodeURIComponent(id),true,validate),{refresh}=read,checkedExpiry=useRef(null);
  const syncAtZero=useCallback(expiresAt=>{if(checkedExpiry.current===expiresAt)return;checkedExpiry.current=expiresAt;void refresh();},[refresh]);
  const b=read.value?.data,inaccessible=[401,403,404,422].includes(read.error?.status);
  const messages={PENDING_CONFIRMATION:b?.booking_flow_version===2?'Yêu cầu đặt sân đang chờ chủ sân xác nhận.':'Minh chứng đã được gửi. Vui lòng chờ chủ sân xác nhận.',CONFIRMED:'Đặt sân đã được chủ sân xác nhận. Số tiền còn lại 70% thanh toán tại sân.',REJECTED:'Minh chứng thanh toán đã bị từ chối. Booking này không thể gửi lại minh chứng.',EXPIRED:b?.booking_flow_version===2?'Booking đã hết thời gian xác nhận.':'Booking đã hết thời gian thanh toán.',COMPLETED:'Booking đã hoàn thành.'};
  return <BookingLayout><BookingBack to="/bookings">Lịch đặt sân của tôi</BookingBack>{read.loading?<div className="bk-detail-state" role="status"><span className="bk-state-spinner"/><div><strong>Đang tải chi tiết đặt sân</strong><p>Thông tin booking đang được đồng bộ từ máy chủ.</p></div></div>:inaccessible||!b?<div role="alert" className="bk-error bk-detail-error"><h1>Chi tiết đặt sân</h1><p>{bookingError(read.error||{})}</p><button className="bk-button" onClick={read.refresh}>Thử lại</button></div>:<><header className="bk-detail-heading"><div><p className="bk-eyebrow">BOOKING #{b.id}</p><h1>Chi tiết đặt sân</h1><p className="bk-detail-intro">Theo dõi lịch chơi, chi phí và các bước cần thực hiện cho booking này.</p></div><StatusBadge status={b.status}/></header>{read.error&&<div className="bk-error" role="alert"><p>Chưa xác minh được trạng thái hiện tại. Thông tin bên dưới là lần đọc thành công gần nhất.</p><button className="bk-button" onClick={read.refresh} disabled={read.busy}>Đồng bộ lại</button></div>}{read.busy&&<p className="bk-syncing" role="status">Đang đồng bộ trạng thái mới nhất…</p>}<div className="bk-columns"><div className="bk-detail-main"><BookingInfo booking={b} slots={b.slots}/>{b.status==='CONFIRMED'&&<CancellationPanel booking={b} read={read}/>} {b.status==='CANCELLED'&&<CancellationMetadata booking={b}/>} {b.status==='CANCELLED'&&b.refund&&<CustomerRefundPanel refund={b.refund} refresh={read.refresh}/>}</div><aside className="bk-detail-summary">{b.status==='PENDING_PAYMENT'&&!read.error&&<ServerCountdown key={read.receivedAt} expiresAt={b.expires_at} serverTime={read.value.meta.server_time} receivedAt={read.receivedAt} sync={syncAtZero}><Link className="bk-button bk-full bk-pay-action" to={'/bookings/'+b.id+'/payment'}>Thanh toán tiền cọc</Link></ServerCountdown>}{b.status==='PENDING_CONFIRMATION'&&b.booking_flow_version===2&&!read.error&&<ServerCountdown key={read.receivedAt} expiresAt={b.confirmation_expires_at} serverTime={read.value.meta.server_time} receivedAt={read.receivedAt} sync={syncAtZero}/>}<CostSummary amounts={b}><div className="bk-created"><span>Thời điểm tạo booking</span><strong>{stampLabel(b.created_at)}</strong></div></CostSummary>{b.status==='CONFIRMED'&&<section className="bk-state-surface bk-state-success"><span aria-hidden="true">✓</span><div><h2>Tiền cọc đã được xác nhận</h2><p>Chủ sân đã duyệt minh chứng chuyển khoản của booking này.</p></div></section>}{messages[b.status]&&<section className={'bk-state-surface bk-state-'+b.status.toLowerCase()} aria-live="polite"><span aria-hidden="true">{['CONFIRMED','COMPLETED'].includes(b.status)?'✓':b.status==='PENDING_CONFIRMATION'?'…':'!'}</span><div><h2>Cập nhật trạng thái</h2><p>{messages[b.status]}</p></div></section>}</aside></div></>}</BookingLayout>;
}
export function BookingDetail(){const{id}=useParams();return <DetailPage key={id} id={id}/>;}
