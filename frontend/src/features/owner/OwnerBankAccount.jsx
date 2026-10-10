/* oxlint-disable react/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AccessibleModal } from '../../components/AccessibleModal';
import { detailResponse, ownerBankAccountResponse } from '../../services/responseValidators';
import { OwnerFacilityNav, OwnerLayout, ownerError, useOwnerApi, useOwnerRead } from './OwnerShared';
import './owner-management.css';

const MAX_BYTES = 5_000_000;
const blank = { bank_name: '', account_number: '', account_holder: '' };
function validate(form) {
  const errors = {};
  if (!form.bank_name.trim() || [...form.bank_name.trim()].length > 150) errors.bank_name = 'Tên ngân hàng phải có từ 1 đến 150 ký tự.';
  if (!/^[A-Za-z0-9]{1,50}$/.test(form.account_number.trim())) errors.account_number = 'Số tài khoản chỉ gồm chữ và số, tối đa 50 ký tự.';
  if (!form.account_holder.trim() || [...form.account_holder.trim()].length > 150) errors.account_holder = 'Tên chủ tài khoản phải có từ 1 đến 150 ký tự.';
  return errors;
}
export function OwnerBankAccount() {
  const { facility_id } = useParams(), api = useOwnerApi();
  const facilityRead = useOwnerRead(`/owner/facilities/${encodeURIComponent(facility_id)}`, detailResponse);
  const read = useOwnerRead(`/owner/facilities/${encodeURIComponent(facility_id)}/bank-account`, ownerBankAccountResponse);
  const [form, setForm] = useState(blank), [errors, setErrors] = useState({}), [busy, setBusy] = useState('');
  const [message, setMessage] = useState(''), [failure, setFailure] = useState(''), [file, setFile] = useState(null);
  const [preview, setPreview] = useState(''), [confirmDelete, setConfirmDelete] = useState(false), refreshedUrl = useRef('');
  const bank = read.data?.data, facility = facilityRead.data?.data, pending = facility?.status === 'PENDING';
  const refreshBank = read.refresh, refreshFacility = facilityRead.refresh;
  useEffect(() => { if (bank) setForm({ bank_name: bank.bank_name, account_number: bank.account_number, account_holder: bank.account_holder }); }, [bank]);
  useEffect(() => { if (!file) { setPreview(''); return; } const value = URL.createObjectURL(file); setPreview(value); return () => URL.revokeObjectURL(value); }, [file]);
  useEffect(() => {
    if (!bank?.qr_image_expires_at || !bank.qr_image_url) return;
    const server = Date.parse(read.data.meta?.server_time || new Date().toISOString());
    const delay = Math.max(0, Date.parse(bank.qr_image_expires_at) - server - 5000);
    const timer = setTimeout(() => { if (refreshedUrl.current !== bank.qr_image_url) { refreshedUrl.current = bank.qr_image_url; void refreshBank().catch(() => {}); } }, delay);
    return () => clearTimeout(timer);
  }, [bank?.qr_image_expires_at, bank?.qr_image_url, read.data?.meta?.server_time, refreshBank]);
  const invalidFile = useMemo(() => file && (!['image/jpeg','image/png'].includes(file.type) || file.size > MAX_BYTES), [file]);
  function choose(event) { const selected = event.target.files?.[0] || null; setFile(selected); setFailure(selected && (!['image/jpeg','image/png'].includes(selected.type) || selected.size > MAX_BYTES) ? 'Chỉ nhận ảnh JPG/PNG không quá 5 MB.' : ''); event.target.value = ''; }
  async function save(event) { event.preventDefault(); if (busy || pending) return; const next = validate(form); setErrors(next); if (Object.keys(next).length) return;
    setBusy('save'); setFailure(''); setMessage(''); try { const result = await api.request(`/owner/facilities/${facility_id}/bank-account`, { method: 'PUT', body: { bank_name: form.bank_name.trim(), account_number: form.account_number.trim(), account_holder: form.account_holder.trim() }, validate: ownerBankAccountResponse }); setForm({ bank_name: result.data.bank_name, account_number: result.data.account_number, account_holder: result.data.account_holder }); setMessage('Đã lưu thông tin tài khoản.'); await refreshBank(); } catch (error) { setFailure(ownerError(error)); if (error.status === 409) await Promise.allSettled([refreshBank(), refreshFacility()]); } finally { setBusy(''); }
  }
  async function upload() { if (!file || invalidFile || busy || pending || !bank) return; setBusy('upload'); setFailure(''); setMessage(''); const body = new FormData(); body.append('image', file);
    try { await api.request(`/owner/facilities/${facility_id}/bank-account/qr`, { method: 'POST', body, validate: ownerBankAccountResponse }); setFile(null); refreshedUrl.current = ''; setMessage('Đã cập nhật mã QR.'); await refreshBank(); } catch (error) { setFailure(ownerError(error)); if (error.status === 409) await Promise.allSettled([refreshBank(), refreshFacility()]); } finally { setBusy(''); }
  }
  async function remove() { if (busy || pending) return; setBusy('delete'); setFailure(''); try { await api.request(`/owner/facilities/${facility_id}/bank-account/qr`, { method: 'DELETE', validate: ownerBankAccountResponse }); setConfirmDelete(false); refreshedUrl.current = ''; setMessage('Đã xóa mã QR khỏi cấu hình hiện tại.'); await refreshBank(); } catch (error) { setFailure(ownerError(error)); if (error.status === 409) await Promise.allSettled([refreshBank(), refreshFacility()]); } finally { setBusy(''); }
  }
  const loading = read.loading || facilityRead.loading, error = read.error || facilityRead.error;
  return <OwnerLayout><div className="oba-breadcrumb"><Link to="/owner/facilities">Cơ sở của tôi</Link><span>›</span><Link to={`/owner/facilities/${facility_id}`}>Chi tiết cơ sở</Link><span>›</span><strong>Tài khoản nhận cọc</strong></div>
    {loading ? <p role="status">Đang tải dữ liệu…</p> : error ? <div className="ow-error" role="alert"><p>{ownerError(error)}</p><button onClick={() => { void refreshBank(); void refreshFacility(); }}>Thử lại</button></div> : <>
      <div className="om-heading"><div><h1>Tài khoản nhận cọc</h1><p>Thiết lập thông tin tài khoản để khách hàng chuyển khoản tiền cọc khi đặt sân.</p><strong className="oba-facility">{facility.name}</strong></div></div>
      <OwnerFacilityNav facilityId={facility_id} active="bank"/>
      {pending && <p className="om-state-note pending" role="status">Cơ sở đang chờ duyệt. Bạn chỉ có thể xem cấu hình tài khoản lúc này.</p>}
      <form onSubmit={save} className="oba-form"><section className="om-card oba-section"><h2>Thông tin ngân hàng</h2><p>Nhập chính xác thông tin tài khoản nhận tiền cọc.</p>
        <label>Ngân hàng <b>*</b><input aria-label="Ngân hàng" disabled={pending} maxLength="150" value={form.bank_name} onChange={event => setForm({...form,bank_name:event.target.value})}/>{errors.bank_name&&<small role="alert">{errors.bank_name}</small>}</label>
        <label>Số tài khoản <b>*</b><input aria-label="Số tài khoản" disabled={pending} maxLength="50" value={form.account_number} onChange={event => setForm({...form,account_number:event.target.value})}/>{errors.account_number&&<small role="alert">{errors.account_number}</small>}</label>
        <label>Tên chủ tài khoản <b>*</b><input aria-label="Tên chủ tài khoản" disabled={pending} maxLength="150" value={form.account_holder} onChange={event => setForm({...form,account_holder:event.target.value})}/>{errors.account_holder&&<small role="alert">{errors.account_holder}</small>}</label>
      </section>
      <section className="om-card oba-section"><h2>Mã QR thanh toán</h2><p>Khách hàng có thể quét mã QR này để chuyển khoản tiền cọc.</p>
        <div className="oba-qr">{preview || bank?.qr_image_url ? <img src={preview || bank.qr_image_url} alt={preview ? 'Xem trước mã QR mới' : 'Mã QR tài khoản nhận cọc'} onError={() => { if (!preview && bank?.qr_image_url && refreshedUrl.current !== bank.qr_image_url) { refreshedUrl.current = bank.qr_image_url; void refreshBank().catch(() => {}); } }}/>:<><span aria-hidden="true">⇧</span><strong>Chưa có mã QR</strong><p>Thêm ảnh QR tài khoản ngân hàng để khách hàng chuyển khoản thuận tiện hơn.</p></>}
          <label className="om-primary oba-upload">{bank?.has_qr_image ? 'Thay ảnh QR' : 'Tải mã QR lên'}<input aria-label="Chọn ảnh QR" type="file" accept="image/jpeg,image/png" disabled={pending || Boolean(busy)} onChange={choose}/></label>
          {file && !invalidFile && <><small>{file.name}</small><button type="button" className="om-outline" disabled={Boolean(busy)||!bank} onClick={upload}>{busy==='upload'?'Đang tải…':'Lưu ảnh QR'}</button></>}
          {bank?.has_qr_image && <button type="button" className="om-delete" disabled={pending||Boolean(busy)} onClick={() => setConfirmDelete(true)}>Xóa mã QR</button>}
        </div><small>Định dạng hỗ trợ: JPG, PNG. Tối đa 5 MB.</small>
      </section>
      <p className="oba-note">Thông tin tài khoản và mã QR được lưu tại thời điểm khách hàng tạo đơn đặt sân. Thay đổi tại đây không ảnh hưởng đến các đơn đã tạo trước đó.</p>
      {failure&&<p className="om-form-error" role="alert">{failure}</p>}{message&&<p className="om-success" role="status">{message}</p>}
      <div className="om-form-actions"><Link className="om-cancel" to={`/owner/facilities/${facility_id}`}>Hủy</Link><button className="om-primary" disabled={pending||Boolean(busy)}>{busy==='save'?'Đang lưu…':'Lưu thay đổi'}</button></div></form>
      {confirmDelete&&<AccessibleModal title="Xóa mã QR?" description="QR sẽ không còn dùng cho các booking mới. Booking đã tạo vẫn giữ bản chụp QR của mình." busy={busy==='delete'} onClose={()=>setConfirmDelete(false)} backdropClass="ow-modal-back" className="ow-modal"><div><button disabled={Boolean(busy)} onClick={()=>setConfirmDelete(false)}>Hủy</button><button className="primary" disabled={Boolean(busy)} onClick={remove}>{busy==='delete'?'Đang xóa…':'Xác nhận xóa'}</button></div></AccessibleModal>}
    </>}
  </OwnerLayout>;
}
