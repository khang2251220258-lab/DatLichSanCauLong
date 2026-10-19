/* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AdminLayout } from './AdminShared';
import { useAuth } from '../auth/useAuth';
import { errorMessage } from '../../services/api';
import './admin-facilities.css';
import { adminFacilityDetailResponse, adminFacilityListResponse, adminFacilityMutationResponse } from '../../services/responseValidators';
import { AccessibleModal } from '../../components/AccessibleModal';
import { facilityStatusLabels } from '../../domain/statusLabels';
import { AdminReadStatus, AdminUnresolved, isUnknownMutationResult, useReliableAdminRead } from './useReliableAdminRead.jsx';

const labels=facilityStatusLabels;
const statuses=['','DRAFT','PENDING','ACTIVE','REJECTED','SUSPENDED'];
const message=e=>e?.status===404?'Không tìm thấy cơ sở.':errorMessage(e||{});
const displayTime=value=>value?new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value)):'Chưa gửi duyệt';
function Badge({status}){return <span className={'af-badge '+status}>{labels[status]||status}</span>}
function LoadState({read,children,empty,loading}){if(read.loading)return loading||<p role="status" className="af-state">Đang tải dữ liệu…</p>;if(read.error)return <div role="alert" className="af-state error"><p>{message(read.error)}</p><button onClick={read.refresh}>Thử lại</button></div>;if(empty)return <div className="af-state"><h2>Chưa có cơ sở</h2><p>Không có cơ sở phù hợp với bộ lọc hiện tại.</p></div>;return children}
export function AdminFacilityList(){
  const [params,setParams]=useSearchParams();
  const page=Math.max(1,Number(params.get('page'))||1),status=params.get('status')||'';
  const query=new URLSearchParams({page:String(page),page_size:'20'});if(status)query.set('status',status);
  const read=useReliableAdminRead('/admin/facilities?'+query,adminFacilityListResponse,{cache:true});
  const rows=read.value?.data||[],meta=read.value?.meta||{page:1,page_size:20,total:0},pages=Math.max(1,Math.ceil(meta.total/meta.page_size));
  const update=(nextStatus,nextPage=1)=>{const next={};if(nextStatus)next.status=nextStatus;if(nextPage>1)next.page=String(nextPage);setParams(next)};
  return <AdminLayout>
    <header className="af-list-heading">
      <span className="af-eyebrow">VẬN HÀNH CƠ SỞ</span>
      <h1>Quản lý cơ sở</h1>
      <p>Theo dõi hồ sơ duyệt và trạng thái vận hành của các cơ sở trên hệ thống.</p>
    </header>
    <section className="af-list-controls" aria-label="Bộ lọc danh sách cơ sở">
      <div className="af-list-context">
        <strong>{status?labels[status]:'Tất cả cơ sở'}</strong>
        {read.value&&<span>{meta.total} kết quả</span>}
      </div>
      <nav className="af-filters" aria-label="Lọc trạng thái">{statuses.map(value=><button type="button" key={value||'all'} aria-pressed={status===value} className={status===value?'active':''} onClick={()=>update(value)}>{value?labels[value]:'Tất cả'}</button>)}</nav>
    </section>
    <AdminReadStatus read={read} message="Không thể đồng bộ danh sách mới nhất. Dữ liệu gần nhất vẫn được giữ lại."/>
    <LoadState read={read} empty={!rows.length}>
      <div className="af-table-frame">
        <table className="af-facility-table">
          <thead><tr><th scope="col">Cơ sở</th><th scope="col">Khu vực</th><th scope="col">Giờ hoạt động</th><th scope="col">Trạng thái</th><th scope="col">Gửi duyệt</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
          <tbody>{rows.map(f=><tr key={f.id}>
            <td data-label="Cơ sở"><div className="af-facility-identity"><strong>{f.name}</strong><span>Mã #{f.id}</span></div></td>
            <td data-label="Khu vực"><div className="af-location"><strong>{f.district}</strong><span>{f.address}</span></div></td>
            <td data-label="Giờ hoạt động"><span className="af-hours">{f.opening_time} – {f.closing_time}</span></td>
            <td data-label="Trạng thái"><Badge status={f.status}/></td>
            <td data-label="Gửi duyệt"><span className="af-submitted">{displayTime(f.submitted_at)}</span></td>
            <td className="af-row-action"><Link to={`/admin/facilities/${f.id}`}>Xem chi tiết <span aria-hidden="true">→</span></Link></td>
          </tr>)}</tbody>
        </table>
      </div>
      <nav className="af-pager" aria-label="Phân trang"><button type="button" disabled={page<=1||read.busy} onClick={()=>update(status,page-1)}>Trước</button><span>Trang {page}/{pages}</span><button type="button" disabled={page>=pages||read.busy} onClick={()=>update(status,page+1)}>Sau</button></nav>
    </LoadState>
  </AdminLayout>
}

function ReasonModal({title,facilityName,busy,onClose,onConfirm}){const [reason,setReason]=useState(''),[error,setError]=useState('');const confirm=()=>{const clean=reason.trim(),length=[...clean].length;if(length<1||length>500){setError('Lý do phải có từ 1 đến 500 ký tự.');return}onConfirm(clean)};return <AccessibleModal title={title} description={facilityName} busy={busy} onClose={onClose} backdropClass="af-modal-back" className="af-modal"><button className="close" aria-label="Đóng" disabled={busy} onClick={onClose}>×</button><label>Lý do *<textarea autoFocus maxLength="501" value={reason} onChange={e=>{setReason(e.target.value);setError('')}}/></label><div className="counter"><span>Từ 1–500 ký tự</span><span>{[...reason].length}/500</span></div>{error&&<p role="alert" className="af-error">{error}</p>}<div className="actions"><button disabled={busy} onClick={onClose}>Hủy</button><button className="danger" disabled={busy} onClick={confirm}>{busy?'Đang xử lý…':'Xác nhận'}</button></div></AccessibleModal>}

const reviewCopy={
  DRAFT:'Hồ sơ vẫn đang được chủ sân hoàn thiện và chưa gửi duyệt.',
  PENDING:'Hồ sơ đang chờ quản trị viên kiểm tra và ra quyết định.',
  ACTIVE:'Cơ sở đã được phê duyệt và đang hiển thị theo quy tắc công khai.',
  REJECTED:'Hồ sơ đã bị từ chối. Chủ sân có thể chỉnh sửa trước khi gửi duyệt lại.',
  SUSPENDED:'Cơ sở đang tạm ngưng và có thể được kích hoạt lại sau khi xử lý lý do.',
};

function DetailSkeleton(){return <div className="af-detail-skeleton" role="status" aria-label="Đang tải chi tiết cơ sở"><div className="af-skeleton-line short"/><div className="af-skeleton-line title"/><div className="af-detail-skeleton-grid"><div className="af-skeleton-card tall"/><div className="af-skeleton-card"/></div><span className="sr-only">Đang tải dữ liệu…</span></div>}

function FacilityDetailContent({facility,busy,unresolved,onConfirm,onReason}){return <>
  <Link className="af-back" to="/admin/facilities"><span aria-hidden="true">←</span> Quản lý cơ sở</Link>
  <header className="af-detail-hero">
    <div className="af-detail-heading">
      <span className="af-eyebrow">KIỂM DUYỆT CƠ SỞ</span>
      <h1>Chi tiết cơ sở</h1>
      <div className="af-detail-identity"><h2>{facility.name}</h2><span>Mã cơ sở #{facility.id}</span></div>
    </div>
    <Badge status={facility.status}/>
  </header>
  <div className="af-detail-layout">
    <div className="af-detail-primary">
      <section className="af-card af-detail-card" aria-labelledby="facility-information-title">
        <div className="af-section-heading"><span className="af-section-icon" aria-hidden="true">⌂</span><div><h2 id="facility-information-title">Thông tin cơ sở</h2><p>Thông tin chủ sân đã cung cấp trong hồ sơ.</p></div></div>
        <dl className="af-detail-list"><div><dt>Tên cơ sở</dt><dd>{facility.name}</dd></div><div><dt>Khu vực</dt><dd>{facility.district}</dd></div><div className="wide"><dt>Địa chỉ</dt><dd>{facility.address}</dd></div><div><dt>Số điện thoại</dt><dd>{facility.phone}</dd></div><div><dt>Giờ hoạt động</dt><dd>{facility.opening_time} – {facility.closing_time}</dd></div><div className="wide"><dt>Mô tả</dt><dd>{facility.description||'Chưa cập nhật'}</dd></div></dl>
      </section>
      {facility.status==='REJECTED'&&<section className="af-reason af-reason-rejected" aria-labelledby="rejection-title"><h2 id="rejection-title">Lý do từ chối</h2><p>{facility.rejection_reason}</p></section>}
      {facility.status==='SUSPENDED'&&<section className="af-reason af-reason-suspended" aria-labelledby="suspension-title"><h2 id="suspension-title">Lý do tạm ngưng</h2><p>{facility.suspension_reason}</p></section>}
    </div>
    <aside className="af-detail-sidebar" aria-label="Thông tin và thao tác kiểm duyệt">
      <section className="af-card af-detail-card" aria-labelledby="owner-information-title">
        <div className="af-section-heading"><span className="af-section-icon" aria-hidden="true">○</span><div><h2 id="owner-information-title">Thông tin chủ sân</h2><p>Người sở hữu hồ sơ cơ sở này.</p></div></div>
        <dl className="af-owner-list"><div><dt>Họ và tên</dt><dd>{facility.owner.full_name}</dd></div><div><dt>Email</dt><dd>{facility.owner.email}</dd></div><div><dt>Số điện thoại</dt><dd>{facility.owner.phone||'Chưa cập nhật'}</dd></div><div><dt>Mã chủ sân</dt><dd>#{facility.owner.id}</dd></div></dl>
      </section>
      <section className="af-card af-review" aria-labelledby="review-status-title">
        <div className="af-review-heading"><div><span className="af-eyebrow">TRẠNG THÁI HỒ SƠ</span><h2 id="review-status-title">Kiểm duyệt</h2></div><Badge status={facility.status}/></div>
        <p className="af-review-copy">{reviewCopy[facility.status]}</p>
        <dl className="af-review-meta"><div><dt>Ngày gửi duyệt</dt><dd>{displayTime(facility.submitted_at)}</dd></div>{facility.reviewed_at&&<div><dt>Cập nhật kiểm duyệt</dt><dd>{displayTime(facility.reviewed_at)}</dd></div>}{facility.suspended_at&&<div><dt>Ngày tạm ngưng</dt><dd>{displayTime(facility.suspended_at)}</dd></div>}</dl>
        <div className="af-review-actions">
          {facility.status==='PENDING'&&<><button className="reject" disabled={busy||Boolean(unresolved)} onClick={()=>onReason('reject')}>Từ chối</button><button className="approve" disabled={busy||Boolean(unresolved)} onClick={()=>onConfirm('approve')}>Phê duyệt</button></>}
          {facility.status==='ACTIVE'&&<button className="suspend" disabled={busy||Boolean(unresolved)} onClick={()=>onReason('suspend')}>Tạm ngưng</button>}
          {facility.status==='SUSPENDED'&&<button className="approve" disabled={busy||Boolean(unresolved)} onClick={()=>onConfirm('activate')}>Kích hoạt lại</button>}
          {(facility.status==='DRAFT'||facility.status==='REJECTED')&&<p className="af-readonly-note">Trạng thái này chỉ cho phép theo dõi; hiện không có thao tác kiểm duyệt.</p>}
        </div>
      </section>
    </aside>
  </div>
</>}

export function AdminFacilityDetail(){const {facility_id}=useParams(),auth=useAuth(),read=useReliableAdminRead('/admin/facilities/'+encodeURIComponent(facility_id),adminFacilityDetailResponse(facility_id)),facility=read.value?.data;const [modal,setModal]=useState(null),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false),[mutationError,setMutationError]=useState(''),[unresolved,setUnresolved]=useState('');const target={approve:'ACTIVE',reject:'REJECTED',suspend:'SUSPENDED',activate:'ACTIVE'};async function recover(action,error){try{const result=await read.refresh();const current=result.value?.data;if(current?.status===target[action]){setModal(null);setConfirm(null);setMutationError('');setUnresolved('');return}setModal(null);setConfirm(null);setUnresolved('');setMutationError(error?.status===409?'Trạng thái cơ sở đã thay đổi. Dữ liệu mới nhất đã được tải lại.':'Thao tác chưa được áp dụng theo trạng thái mới nhất từ máy chủ.')}catch{setUnresolved('Kết quả thao tác chưa được xác minh. Dữ liệu gần nhất được giữ lại; hãy thử đồng bộ lại trước khi thao tác tiếp.')}}async function retryUnresolved(){try{await read.refresh();setUnresolved('')}catch{}}async function mutate(action,reason){if(busy)return;setBusy(true);setMutationError('');setUnresolved('');try{await auth.request(`/admin/facilities/${facility_id}/${action}`,{method:'POST',body:reason?{reason}:{},validate:adminFacilityMutationResponse(target[action])});await recover(action)}catch(error){if(error?.status===409||isUnknownMutationResult(error))await recover(action,error);else if(error?.code!=='REQUEST_CANCELLED')setMutationError(message(error))}finally{setBusy(false)}}return <AdminLayout><AdminReadStatus read={read} message="Không thể đồng bộ chi tiết mới nhất. Dữ liệu đã xác minh gần nhất vẫn được giữ lại."/>{unresolved&&<AdminUnresolved message={unresolved} onRetry={retryUnresolved}/>}<LoadState read={read} loading={<DetailSkeleton/>}>{facility&&<><FacilityDetailContent facility={facility} busy={busy} unresolved={unresolved} onConfirm={setConfirm} onReason={setModal}/>{mutationError&&<p className="af-error" role="alert">{mutationError}</p>}{modal&&<ReasonModal title={modal==='reject'?'Từ chối cơ sở':'Tạm ngưng cơ sở'} facilityName={facility.name} busy={busy} onClose={()=>setModal(null)} onConfirm={reason=>mutate(modal,reason)}/>} {confirm&&<AccessibleModal title={confirm==='approve'?'Phê duyệt cơ sở?':'Kích hoạt lại cơ sở?'} description="Trạng thái sẽ được cập nhật theo dữ liệu mới nhất từ máy chủ." busy={busy} onClose={()=>setConfirm(null)} backdropClass="af-modal-back" className="af-modal"><div className="actions"><button disabled={busy} onClick={()=>setConfirm(null)}>Hủy</button><button autoFocus className="approve" disabled={busy} onClick={()=>mutate(confirm)}>{busy?'Đang xử lý…':'Xác nhận'}</button></div></AccessibleModal>}</>}</LoadState></AdminLayout>}
