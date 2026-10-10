/* oxlint-disable react/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AccessibleModal } from '../../components/AccessibleModal';
import { detailResponse, ownerAmenityArrayResponse, ownerFacilityImageResponse, ownerFacilityImagesResponse } from '../../services/responseValidators';
import { OwnerFacilityNav, OwnerLayout, ownerError, useOwnerApi, useOwnerRead } from './OwnerShared';
import './owner-management.css';

const MAX_BYTES = 5_000_000;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function OwnerFacilityPresentation() {
  const { facility_id } = useParams(), api = useOwnerApi(), encodedId = encodeURIComponent(facility_id);
  const facilityRead = useOwnerRead(`/owner/facilities/${encodedId}`, detailResponse);
  const imagesRead = useOwnerRead(`/owner/facilities/${encodedId}/images`, ownerFacilityImagesResponse);
  const catalogRead = useOwnerRead('/owner/amenities', ownerAmenityArrayResponse);
  const assignedRead = useOwnerRead(`/owner/facilities/${encodedId}/amenities`, ownerAmenityArrayResponse);
  const [selected, setSelected] = useState(new Set()), [initialized, setInitialized] = useState(false);
  const [file, setFile] = useState(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(''), [failure, setFailure] = useState(''), [message, setMessage] = useState('');
  const [deleteImage, setDeleteImage] = useState(null);
  const facility = facilityRead.data?.data, images = useMemo(() => imagesRead.data?.data || [], [imagesRead.data]);
  const catalog = useMemo(() => catalogRead.data?.data || [], [catalogRead.data]);
  const assigned = useMemo(() => assignedRead.data?.data || [], [assignedRead.data]), pending = facility?.status === 'PENDING';
  const inactiveAssigned = useMemo(() => assigned.filter(item => !item.is_active), [assigned]);
  const originalIds = useMemo(() => new Set(assigned.map(item => String(item.id))), [assigned]);
  const dirty = initialized && (selected.size !== originalIds.size || [...selected].some(id => !originalIds.has(id)));
  const containsInactive = inactiveAssigned.some(item => selected.has(String(item.id)));
  useEffect(() => { if (assignedRead.data) { setSelected(new Set(assigned.map(item => String(item.id)))); setInitialized(true); } }, [assignedRead.data, assigned]);
  useEffect(() => { if (!file) { setPreview(''); return; } const value = URL.createObjectURL(file); setPreview(value); return () => URL.revokeObjectURL(value); }, [file]);
  function chooseFile(event) {
    const next = event.target.files?.[0] || null; event.target.value = ''; setMessage('');
    if (next && (!ACCEPTED.has(next.type) || next.size > MAX_BYTES)) { setFile(null); setFailure('Chỉ nhận ảnh JPEG, PNG hoặc WebP không quá 5 MB.'); return; }
    setFile(next); setFailure('');
  }
  async function refreshImages() { return imagesRead.refresh(); }
  async function upload() {
    if (!file || pending || busy || images.length >= 10) return;
    const body = new FormData(); body.append('image', file); setBusy('upload'); setFailure(''); setMessage('');
    try { await api.request(`/owner/facilities/${facility_id}/images`, { method: 'POST', body, validate: ownerFacilityImageResponse }); setFile(null); await refreshImages(); setMessage('Đã thêm ảnh cơ sở.'); }
    catch (error) { setFailure(ownerError(error)); if (error.status === 409) await Promise.allSettled([refreshImages(), facilityRead.refresh()]); }
    finally { setBusy(''); }
  }
  async function reorder(from, to) {
    if (pending || busy || to < 0 || to >= images.length) return;
    const next = images.map(item => item.id); [next[from], next[to]] = [next[to], next[from]];
    setBusy('order'); setFailure(''); setMessage('');
    try { await api.request(`/owner/facilities/${facility_id}/images/order`, { method: 'PUT', body: { image_ids: next }, validate: ownerFacilityImagesResponse }); await refreshImages(); setMessage('Đã cập nhật thứ tự ảnh.'); }
    catch (error) { setFailure(ownerError(error)); await Promise.allSettled([refreshImages(), facilityRead.refresh()]); }
    finally { setBusy(''); }
  }
  async function remove() {
    if (!deleteImage || pending || busy) return; setBusy('delete'); setFailure(''); setMessage('');
    try { await api.request(`/owner/facilities/${facility_id}/images/${deleteImage.id}`, { method: 'DELETE' }); setDeleteImage(null); await refreshImages(); setMessage('Đã xóa ảnh cơ sở.'); }
    catch (error) { setFailure(ownerError(error)); await Promise.allSettled([refreshImages(), facilityRead.refresh()]); }
    finally { setBusy(''); }
  }
  function toggleAmenity(item) {
    if (pending || busy || (!item.is_active && !selected.has(String(item.id)))) return;
    setSelected(current => { const next = new Set(current), id = String(item.id); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setMessage(''); setFailure('');
  }
  async function saveAmenities() {
    if (pending || busy || !dirty || containsInactive) return; setBusy('amenities'); setFailure(''); setMessage('');
    try { await api.request(`/owner/facilities/${facility_id}/amenities`, { method: 'PUT', body: { amenity_ids: [...selected] }, validate: ownerAmenityArrayResponse }); await Promise.all([catalogRead.refresh(), assignedRead.refresh()]); setMessage('Đã lưu tiện ích của cơ sở.'); }
    catch (error) { setFailure(ownerError(error)); if (error.status === 409 || error.status === 422) await Promise.allSettled([catalogRead.refresh(), assignedRead.refresh(), facilityRead.refresh()]); }
    finally { setBusy(''); }
  }
  const loading = facilityRead.loading || imagesRead.loading || catalogRead.loading || assignedRead.loading;
  const readError = facilityRead.error || imagesRead.error || catalogRead.error || assignedRead.error;
  const allAmenities = [...catalog, ...inactiveAssigned.filter(item => !catalog.some(active => String(active.id) === String(item.id)))];
  return <OwnerLayout><div className="oba-breadcrumb"><Link to="/owner/facilities">Cơ sở của tôi</Link><span>›</span><Link to={`/owner/facilities/${facility_id}`}>Chi tiết cơ sở</Link><span>›</span><strong>Hình ảnh & tiện ích</strong></div>
    {loading ? <p role="status">Đang tải dữ liệu…</p> : readError ? <div className="ow-error" role="alert"><p>{ownerError(readError)}</p><button onClick={() => void Promise.allSettled([facilityRead.refresh(), imagesRead.refresh(), catalogRead.refresh(), assignedRead.refresh()])}>Thử lại</button></div> : <>
      <div className="om-heading"><div><h1>{facility.name}</h1><p>Quản lý hình ảnh và tiện ích hiển thị của cơ sở.</p></div></div>
      <OwnerFacilityNav facilityId={facility_id} active="presentation"/>
      {pending && <p className="om-state-note pending" role="status">Cơ sở đang chờ duyệt. Hình ảnh và tiện ích hiện chỉ có thể xem.</p>}
      <section className="om-card ofp-section"><div className="ofp-section-head"><div><h2>Hình ảnh cơ sở</h2><p>Tối đa 10 ảnh. Ảnh đầu tiên là ảnh đại diện.</p></div><span>{images.length}/10 ảnh</span></div>
        {!images.length ? <div className="ofp-empty">Chưa có ảnh cơ sở.</div> : <div className="ofp-grid">{images.map((image, index) => <article className="ofp-image" key={image.id}><div className="ofp-photo"><img src={image.url} alt={`Ảnh cơ sở ${index + 1}`}/>{index === 0 && <strong>Ảnh đại diện</strong>}</div><div className="ofp-image-actions"><button aria-label={`Chuyển ảnh ${index + 1} sang trái`} disabled={pending || Boolean(busy) || index === 0} onClick={() => void reorder(index, index - 1)}>←</button><button aria-label={`Chuyển ảnh ${index + 1} sang phải`} disabled={pending || Boolean(busy) || index === images.length - 1} onClick={() => void reorder(index, index + 1)}>→</button><button className="om-delete" aria-label={`Xóa ảnh ${index + 1}`} disabled={pending || Boolean(busy)} onClick={() => setDeleteImage(image)}>Xóa</button></div></article>)}</div>}
        {!pending && images.length < 10 && <div className="ofp-upload"><label className="om-outline">Chọn ảnh<input aria-label="Chọn ảnh cơ sở" type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={chooseFile}/></label>{preview && <img src={preview} alt="Xem trước ảnh sắp tải lên"/>}{file && <><span>{file.name}</span><button className="om-primary" disabled={Boolean(busy)} onClick={() => void upload()}>{busy === 'upload' ? 'Đang tải…' : 'Tải ảnh lên'}</button></>}</div>}
      </section>
      <section className="om-card ofp-section"><div className="ofp-section-head"><div><h2>Tiện ích</h2><p>Chọn các tiện ích có tại cơ sở.</p></div></div>
        {!allAmenities.length ? <div className="ofp-empty">Chưa có tiện ích trong danh mục.</div> : <div className="ofp-amenities">{allAmenities.map(item => <label key={item.id} className={!item.is_active ? 'inactive' : ''}><input type="checkbox" checked={selected.has(String(item.id))} disabled={pending || Boolean(busy) || (!item.is_active && !selected.has(String(item.id)))} onChange={() => toggleAmenity(item)}/><span>{item.name}{!item.is_active && ' (đã ngừng hoạt động)'}</span></label>)}</div>}
        {containsInactive && !pending && <p className="ofp-warning" role="status">Bỏ chọn tiện ích đã ngừng hoạt động trước khi lưu. Dữ liệu hiện tại sẽ không bị tự động xóa.</p>}
        {!pending && <div className="om-form-actions"><button className="om-primary" disabled={Boolean(busy) || !dirty || containsInactive} onClick={() => void saveAmenities()}>{busy === 'amenities' ? 'Đang lưu…' : 'Lưu tiện ích'}</button></div>}
      </section>
      {failure && <p className="om-form-error" role="alert">{failure}</p>}{message && <p className="om-success" role="status">{message}</p>}
      {deleteImage && <AccessibleModal title="Xóa ảnh cơ sở?" description="Ảnh sẽ bị xóa khỏi cơ sở. Nếu đây là ảnh đại diện, ảnh tiếp theo sẽ trở thành ảnh đại diện." busy={busy === 'delete'} onClose={() => setDeleteImage(null)} backdropClass="ow-modal-back" className="ow-modal"><div><button disabled={Boolean(busy)} onClick={() => setDeleteImage(null)}>Hủy</button><button className="primary" disabled={Boolean(busy)} onClick={() => void remove()}>{busy === 'delete' ? 'Đang xóa…' : 'Xóa ảnh'}</button></div></AccessibleModal>}
    </>}
  </OwnerLayout>;
}
