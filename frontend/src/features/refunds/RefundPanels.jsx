import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibleModal } from '../../components/AccessibleModal';
import { refundDetailResponse, refundMutationResponse } from '../../services/responseValidators';
import { useAuth } from '../auth/useAuth';
import { money } from '../facilities/detailRules';
import { stampLabel } from '../bookings/rules';
import { useBookingRead } from '../bookings/useBookingRead';
import { useSignedImage } from '../privateAssets/useSignedImage';
import './refunds.css';

const MAX_BYTES=5_000_000;
const labels={PENDING:'Chờ hoàn tiền',PROOF_SUBMITTED:'Chờ bạn xác nhận',REFUNDED:'Đã hoàn tiền'};
const fileError=file=>!file?'Vui lòng chọn ảnh minh chứng.':!['image/jpeg','image/png'].includes(file.type)?'Chỉ chấp nhận ảnh JPEG hoặc PNG.':file.size>MAX_BYTES?'Ảnh không được vượt quá 5 MB.':'';

function Proof({refund,owner}){
  const validate=useCallback(value=>refundDetailResponse(value)&&value.data.id===refund.id,[refund.id]);
  const read=useBookingRead((owner?'/owner/refunds/':'/refunds/')+encodeURIComponent(refund.id),false,validate),data=read.value?.data;
  const image=useSignedImage(read,data);
  if(read.loading)return <p role="status">Đang tải bằng chứng hoàn tiền…</p>;
  if((read.error&&!read.value)||image.expired||image.failed||image.refreshError||!data?.proof_image_url)return <div className="rf-error" role="alert"><p>{image.failed?'Ảnh bằng chứng tạm thời không thể hiển thị.':image.expired?'Liên kết bằng chứng đã hết hạn.':'Không thể tải bằng chứng hoàn tiền.'}</p><button onClick={image.manualRetry} disabled={read.busy}>{read.busy?'Đang tải lại…':'Tải lại'}</button></div>;
  return <div className="rf-proof"><p>Thời điểm gửi: <strong>{stampLabel(data.proof_submitted_at)}</strong></p><img src={data.proof_image_url} alt="Bằng chứng hoàn tiền" loading="lazy" decoding="async" onError={image.onError} onLoad={image.onLoad}/><a href={data.proof_image_url} target="_blank" rel="noreferrer">Xem ảnh</a></div>;
}

export function OwnerRefundPanel({refund,refresh}){
  const auth=useAuth(),input=useRef(null),previewRef=useRef(''),[file,setFile]=useState(null),[preview,setPreview]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false);
  useEffect(()=>()=>{if(previewRef.current)URL.revokeObjectURL(previewRef.current);},[]);
  function choose(event){const next=event.target.files?.[0]||null,issue=fileError(next);if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current=!issue&&next?URL.createObjectURL(next):'';setPreview(previewRef.current);setFile(issue?null:next);setError(issue);if(issue)event.target.value='';}
  async function submit(event){event.preventDefault();if(!file||busy||unknown)return;setBusy(true);setError('');const form=new FormData();form.append('image',file);
    try{await auth.request('/owner/refunds/'+encodeURIComponent(refund.id)+'/proof',{method:'POST',body:form,validate:refundMutationResponse});await refresh();}
    catch(e){if(e.status===409||e.status===0||e.status>=500){setUnknown(true);const result=await refresh();if(result?.value?.data?.refund?.status==='PENDING'){setUnknown(false);setError(e.status===409?'Trạng thái hoàn cọc đã thay đổi.':'Kết quả chưa xác định; máy chủ chưa ghi nhận proof. Vui lòng kiểm tra trước khi thử lại.');}}else setError(e.message||'Không thể gửi bằng chứng hoàn tiền.');}
    finally{setBusy(false);}}
  return <section className="rf-card owner"><header><div><h2>Hoàn cọc</h2><span className={'rf-status '+refund.status}>{refund.status==='PENDING'?'Chờ hoàn tiền':refund.status==='PROOF_SUBMITTED'?'Chờ khách hàng xác nhận':'Đã hoàn tiền'}</span></div><strong>{money(refund.amount)}</strong></header>
    <p>Việc chuyển tiền được thực hiện ngoài hệ thống. Website dùng bằng chứng bên dưới để ghi nhận quá trình hoàn cọc.</p>
    {refund.status==='PENDING'?<form onSubmit={submit}><label className="rf-drop" htmlFor="refund-proof"><strong>Tải ảnh bằng chứng hoàn tiền</strong><small>JPEG hoặc PNG, tối đa 5 MB</small></label><input id="refund-proof" ref={input} type="file" accept="image/jpeg,image/png" onChange={choose} disabled={busy||unknown}/>{preview&&<img className="rf-preview" src={preview} alt="Xem trước bằng chứng hoàn tiền"/>}{file&&<p>{file.name}</p>}{error&&<p id="refund-error" className="rf-error" role="alert">{error}</p>}<button className="rf-primary" disabled={!file||busy||unknown}>{busy?'Đang gửi…':'Gửi bằng chứng hoàn tiền'}</button>{unknown&&<button type="button" onClick={async()=>{const result=await refresh();if(result?.value?.data?.refund?.status==='PENDING')setUnknown(false);}}>Kiểm tra lại trạng thái</button>}</form>:<Proof refund={refund} owner/>}
  </section>;
}

export function CustomerRefundPanel({refund,refresh}){
  const auth=useAuth(),[modal,setModal]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[unknown,setUnknown]=useState(false);
  async function confirm(){if(busy||unknown)return;setBusy(true);setError('');try{await auth.request('/refunds/'+encodeURIComponent(refund.id)+'/confirm',{method:'POST',body:{},validate:refundMutationResponse});setModal(false);await refresh();}
    catch(e){setModal(false);if(e.status===409||e.status===0||e.status>=500){setUnknown(true);const result=await refresh();if(result?.value?.data?.refund?.status==='PROOF_SUBMITTED'){setUnknown(false);setError(e.status===409?'Trạng thái hoàn cọc đã thay đổi.':'Kết quả chưa xác định; vui lòng kiểm tra trước khi thử lại.');}}else setError(e.message||'Không thể xác nhận hoàn tiền.');}finally{setBusy(false);}}
  async function recover(){const result=await refresh(),status=result.value?.data?.refund?.status;if(!result.value||!['PROOF_SUBMITTED','REFUNDED'].includes(status)){setUnknown(true);setError('Chưa thể xác minh trạng thái hoàn cọc. Vui lòng thử lại.');return;}setUnknown(false);setError('');}
  return <section className="rf-card customer"><header><div><h2>Hoàn cọc</h2><span className={'rf-status '+refund.status}>{labels[refund.status]}</span></div><strong>{money(refund.amount)}</strong></header>
    {refund.status==='PENDING'?<p>Chủ sân đang xử lý hoàn tiền. Chưa có bằng chứng hoàn tiền để xác nhận.</p>:<><Proof refund={refund}/>{refund.status==='PROOF_SUBMITTED'&&<><p className="rf-warning">Chỉ xác nhận sau khi bạn đã kiểm tra và thực sự nhận được khoản tiền hoàn.</p><button className="rf-primary" disabled={busy||unknown} onClick={()=>setModal(true)}>Xác nhận đã nhận tiền</button></>}{refund.status==='REFUNDED'&&<p>Khoản hoàn cọc đã được bạn xác nhận lúc {stampLabel(refund.refunded_at)}.</p>}</>}
    {error&&<p className="rf-error" role="alert">{error}</p>}{unknown&&<button onClick={recover}>Kiểm tra lại trạng thái</button>}
    {modal&&<AccessibleModal title="Xác nhận đã nhận tiền?" description="Chỉ xác nhận khi khoản hoàn cọc đã thực sự vào tài khoản của bạn. Thao tác này không thể hoàn tác." busy={busy} onClose={()=>setModal(false)} backdropClass="bk-modal-back" className="bk-modal"><div><button disabled={busy} onClick={()=>setModal(false)}>Quay lại</button><button autoFocus className="rf-primary" disabled={busy} onClick={confirm}>{busy?'Đang xác nhận…':'Xác nhận đã nhận tiền'}</button></div></AccessibleModal>}
  </section>;
}
