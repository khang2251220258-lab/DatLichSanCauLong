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
  const [message,setMessage]=useState(''), [reason,setReason]=useState(''), [elapsed,setElapsed]=useState(0);
  const deadline=deadlineOf(booking);
  const deadlineStamp=deadline?.toISOString()||'';
  useEffect(()=>{if(!deadlineStamp)return undefined;const timer=setInterval(()=>setElapsed(value=>value+1000),1000);return()=>clearInterval(timer);},[deadlineStamp]);
  const serverNow=Date.parse(read.value.meta.server_time)+elapsed;
  const eligible=Boolean(deadline)&&serverNow<+deadline&&!read.error&&booking.status==='CONFIRMED';
  async function cancel(){
    if(busy||!eligible)return;setBusy(true);setMessage('');
    try{
      await auth.request(`/bookings/${encodeURIComponent(booking.id)}/cancel`,{method:'POST',body:reason.trim()?{reason:reason.trim()}:{},validate:bookingCancellationResponse});
      setModal(false);await read.refresh();
    }catch(error){
      setModal(false);
      if(error.status===409||error.status===0||error.status>=500){
        const synced=await read.refresh();
        setMessage(synced.value?.data?.status==='CANCELLED'?'Booking đã được hủy. Nghĩa vụ hoàn cọc đang chờ chủ sân xử lý.':error.status===409?bookingError(error):'Kết quả yêu cầu chưa rõ. Trạng thái mới nhất đã được đồng bộ; vui lòng kiểm tra trước khi thử lại.');
      }else setMessage(bookingError(error));
    }finally{setBusy(false);}
  }
  return <section className="bk-panel bk-cancellation"><h2>Chính sách hủy đặt sân</h2>
    {booking.cancellation_cutoff_hours_snapshot===null?<p>Booking này không có chính sách hủy đã lưu. Bạn không thể tự hủy booking đã xác nhận.</p>:<>
      <dl><div><dt>Thời hạn hủy trước giờ chơi</dt><dd>{booking.cancellation_cutoff_hours_snapshot} giờ</dd></div><div><dt>Hạn hủy</dt><dd>{stampLabel(deadline.toISOString())}</dd></div></dl>
      <p className={eligible?'bk-cancel-ok':'bk-cancel-stop'}>{eligible?'Booking vẫn còn trong thời hạn cho phép hủy.':'Đã qua thời hạn cho phép hủy booking.'}</p>
      <button className="bk-button bk-cancel-button" disabled={!eligible||busy||read.busy} onClick={()=>setModal(true)}>Hủy đặt sân</button>
    </>}{message&&<p role="alert" className="bk-cancel-stop">{message}</p>}
    {modal&&<AccessibleModal title="Xác nhận hủy đặt sân?" description="Booking sẽ chuyển sang Đã hủy, khung giờ được giải phóng và khoản hoàn cọc sẽ chờ chủ sân xử lý." busy={busy} onClose={()=>setModal(false)} backdropClass="bk-modal-back" className="bk-modal"><label htmlFor="cancel-reason">Lý do (không bắt buộc)</label><textarea id="cancel-reason" autoFocus maxLength="500" value={reason} onChange={event=>setReason(event.target.value)}/><div><button disabled={busy} onClick={()=>setModal(false)}>Quay lại</button><button className="danger" disabled={busy} onClick={cancel}>{busy?'Đang hủy…':'Xác nhận hủy'}</button></div></AccessibleModal>}
  </section>;
}

function DetailPage({id}){
  const read=useBookingRead('/bookings/'+encodeURIComponent(id),true,bookingDetailResponse),{refresh}=read,checkedExpiry=useRef(null);
  const syncAtZero=useCallback(expiresAt=>{if(checkedExpiry.current===expiresAt)return;checkedExpiry.current=expiresAt;void refresh();},[refresh]);
  const b=read.value?.data,inaccessible=[401,403,404,422].includes(read.error?.status);
  const messages={PENDING_CONFIRMATION:'Minh chứng đã được gửi. Vui lòng chờ chủ sân xác nhận.',CONFIRMED:'Đặt sân đã được chủ sân xác nhận. Số tiền còn lại 70% thanh toán tại sân.',REJECTED:'Minh chứng thanh toán đã bị từ chối. Booking này không thể gửi lại minh chứng.',CANCELLED:'Booking đã được hủy.',EXPIRED:'Booking đã hết thời gian thanh toán.',COMPLETED:'Booking đã hoàn thành.'};
  return <BookingLayout><BookingBack to="/bookings">Lịch đặt sân của tôi</BookingBack>{read.loading?<p role="status">Đang tải chi tiết đặt sân…</p>:inaccessible||!b?<div role="alert" className="bk-error"><h1>Chi tiết đặt sân</h1><p>{bookingError(read.error||{})}</p><button onClick={read.refresh}>Thử lại</button></div>:<><div className="bk-detail-heading"><div><p className="bk-muted">Mã booking: {b.id}</p><h1>Chi tiết đặt sân</h1></div><StatusBadge status={b.status}/></div>{read.error&&<div className="bk-error" role="alert"><p>Chưa xác minh được trạng thái hiện tại. Thông tin bên dưới là lần đọc thành công gần nhất.</p><button onClick={read.refresh} disabled={read.busy}>Đồng bộ lại</button></div>}{read.busy&&<p role="status">Đang đồng bộ trạng thái…</p>}<div className="bk-columns"><BookingInfo booking={b} slots={b.slots}/><aside>{b.status==='PENDING_PAYMENT'&&!read.error&&<ServerCountdown key={read.receivedAt} expiresAt={b.expires_at} serverTime={read.value.meta.server_time} receivedAt={read.receivedAt} sync={syncAtZero}><Link className="bk-button bk-full bk-pay-action" to={'/bookings/'+b.id+'/payment'}>Thanh toán tiền cọc</Link></ServerCountdown>}<CostSummary amounts={b}/>{b.status==='CONFIRMED'&&<><section className="bk-panel bk-deposit-confirmed"><h2>Tiền cọc đã được xác nhận</h2><p>Chủ sân đã duyệt minh chứng chuyển khoản của booking này.</p></section><CancellationPanel booking={b} read={read}/></>}<section className="bk-panel"><p className="bk-muted">Thời điểm tạo booking</p><strong>{stampLabel(b.created_at)}</strong></section>{messages[b.status]&&<p className="bk-notice">{messages[b.status]}</p>}</aside></div>{b.status==='CANCELLED'&&b.refund&&<CustomerRefundPanel refund={b.refund} refresh={read.refresh}/>}</>}</BookingLayout>;
}
export function BookingDetail(){const{id}=useParams();return <DetailPage key={id} id={id}/>;}
