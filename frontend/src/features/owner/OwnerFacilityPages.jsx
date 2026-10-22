/* oxlint-disable react/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import districts from '../../generated/districts.json';
import { OwnerFacilityNav, OwnerLayout, OwnerPager, ownerError, useOwnerApi, useOwnerRead } from './OwnerShared';
import './owner-management.css';
import { arrayResponse, detailResponse, listResponse, ownerFacilityListResponse } from '../../services/responseValidators';
import { AccessibleModal } from '../../components/AccessibleModal';
import { facilityStatusLabels } from '../../domain/statusLabels';

const facilityLabels = facilityStatusLabels;
const courtLabels = { ACTIVE: 'Đang hoạt động', INACTIVE: 'Tạm ngưng' };
const editableFacility = status => ['DRAFT', 'REJECTED'].includes(status);
const blankFacility = { name: '', address: '', district: '', phone: '', opening_time: '06:00', closing_time: '22:00', description: '' };
const blankCourt = { name: '', description: '', status: 'ACTIVE' };
const timeMinutes = value => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
const validHalfHour = value => /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value);
const pendingCourtMessage = 'Cơ sở đang chờ duyệt. Bạn chưa thể thay đổi sân lúc này.';
const pendingPricingMessage = 'Cơ sở đang chờ duyệt. Bạn chưa thể thay đổi bảng giá lúc này.';
const codePointLength = value => [...value].length;
function validateFacilityForm(form) {
  const errors = {}, name = form.name.trim(), address = form.address.trim(), phone = form.phone.trim();
  if (!name || codePointLength(name) > 200) errors.name = 'Tên cơ sở phải có từ 1 đến 200 ký tự.';
  if (!address || codePointLength(address) > 500) errors.address = 'Địa chỉ phải có từ 1 đến 500 ký tự.';
  if (!districts.includes(form.district.trim().normalize('NFC'))) errors.district = 'Vui lòng chọn khu vực hợp lệ.';
  if (!phone || codePointLength(phone) > 30 || !/^\+?[0-9 ().-]+$/.test(phone) || !/[0-9]/.test(phone)) errors.phone = 'Số điện thoại phải có 1–30 ký tự và chỉ gồm số, khoảng trắng, +, (, ), dấu chấm hoặc gạch nối.';
  if (!validHalfHour(form.opening_time)) errors.opening_time = 'Giờ mở cửa phải theo mốc 30 phút.';
  if (!validHalfHour(form.closing_time)) errors.closing_time = 'Giờ đóng cửa phải theo mốc 30 phút.';
  if (!errors.opening_time && !errors.closing_time && form.opening_time >= form.closing_time) errors.closing_time = 'Giờ đóng cửa phải sau giờ mở cửa.';
  if (codePointLength(form.description.trim()) > 2000) errors.description = 'Mô tả không được vượt quá 2.000 ký tự.';
  return errors;
}
const FieldError = ({ id, children }) => children ? <span id={id} className="om-field-error" role="alert">{children}</span> : null;

function State({ loading, error, empty, children, retry }) {
  if (loading) return <p role="status">Đang tải dữ liệu…</p>;
  if (error) return <div className="ow-error" role="alert"><p>{ownerError(error)}</p><button onClick={retry}>Thử lại</button></div>;
  if (empty) return <div className="ow-empty"><h2>Chưa có dữ liệu</h2><p>Hãy tạo dữ liệu đầu tiên để bắt đầu quản lý.</p></div>;
  return children;
}
function StatusBadge({ status, type = 'facility' }) { const labels = type === 'court' ? courtLabels : facilityLabels; return <span className={'om-status '+status}>{labels[status] || status}</span>; }

export function OwnerFacilityList() {
  const [params, setParams] = useSearchParams(), page = Math.max(1, Number(params.get('page')) || 1);
  const read = useOwnerRead(`/owner/facilities?page=${page}&page_size=20`, ownerFacilityListResponse, { cache:true }), rows = read.data?.data || [];
  const hasSnapshot = Boolean(read.data);
  return <OwnerLayout><header className="ofl-heading"><div><span className="ofl-eyebrow">Quản lý cơ sở</span><h1>Cơ sở của tôi</h1><p>Theo dõi thông tin, trạng thái duyệt và cấu hình vận hành của từng cơ sở.</p></div><Link className="om-primary ofl-create" to="/owner/facilities/new"><span aria-hidden="true">＋</span> Thêm cơ sở</Link></header>
    {read.loading && !hasSnapshot ? <div className="ofl-loading" role="status" aria-label="Đang tải danh sách cơ sở"><div className="ofl-loading-head"><span/><span/></div>{[0,1,2].map(item => <div className="ofl-skeleton" key={item} aria-hidden="true"><span/><span/><span/><span/></div>)}</div>
      : read.error && !hasSnapshot ? <div className="ofl-state ofl-state-error" role="alert"><span className="ofl-state-icon" aria-hidden="true">!</span><div><h2>Chưa thể tải danh sách cơ sở</h2><p>{ownerError(read.error)}</p></div><button className="om-outline" onClick={read.refresh}>Thử lại</button></div>
      : !rows.length ? <div className="ofl-state ofl-state-empty"><span className="ofl-state-icon" aria-hidden="true">⌂</span><div><h2>Chưa có cơ sở</h2><p>Tạo cơ sở đầu tiên để bắt đầu thiết lập sân và thông tin vận hành.</p></div><Link className="om-primary" to="/owner/facilities/new">Thêm cơ sở</Link></div>
      : <><div className="ofl-list-head"><div><h2>Danh sách cơ sở</h2><p>{read.data.meta.total} cơ sở trong tài khoản của bạn</p></div>{read.busy && <span className="ofl-sync" role="status"><i aria-hidden="true"/>Đang cập nhật…</span>}</div>
        {read.error && <div className="ofl-refresh-error" role="alert"><span>Không thể cập nhật dữ liệu mới nhất. Danh sách gần nhất vẫn được giữ lại.</span><button onClick={read.refresh}>Thử lại</button></div>}
        <div className="om-table facility ofl-table" role="table" aria-label="Danh sách cơ sở"><div className="om-row om-head" role="row"><span role="columnheader">Cơ sở</span><span role="columnheader">Địa điểm</span><span role="columnheader">Vận hành</span><span role="columnheader">Trạng thái</span><span role="columnheader" className="ofl-action-label">Thao tác</span></div>
          <div role="rowgroup">{rows.map(f => <article className="om-row ofl-row" role="row" key={f.id}><div className="ofl-facility" role="cell" data-label="Cơ sở"><span className="ofl-mark" aria-hidden="true">⌂</span><div><strong>{f.name}</strong><small>Mã cơ sở #{f.id}</small></div></div><div className="ofl-location" role="cell" data-label="Địa điểm"><strong>{f.district}</strong><span>{f.address}</span></div><div className="ofl-operation" role="cell" data-label="Vận hành"><span><small>Giờ hoạt động</small><strong>{f.opening_time}–{f.closing_time}</strong></span><span><small>Số sân</small><strong>{f.court_count}</strong></span></div><div role="cell" data-label="Trạng thái"><StatusBadge status={f.status}/></div><div className="ofl-action" role="cell"><Link className="om-outline" aria-label={`Xem chi tiết ${f.name}`} to={`/owner/facilities/${f.id}`}>Xem chi tiết <span aria-hidden="true">→</span></Link></div></article>)}</div>
        </div><OwnerPager meta={read.data.meta} onPage={next => setParams(next > 1 ? { page: String(next) } : {})}/></>}
  </OwnerLayout>;
}

export function OwnerFacilityDetail() {
  const { facility_id } = useParams(), read = useOwnerRead('/owner/facilities/'+encodeURIComponent(facility_id), detailResponse), facility = read.data?.data, auth = useOwnerApi();
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [mutationError, setMutationError] = useState('');
  async function submitForReview() {
    if (busy) return;
    setBusy(true); setMutationError('');
    try { await auth.request(`/owner/facilities/${facility_id}/submit`, { method: 'POST', body: {} }); setConfirming(false); await read.refresh(); }
    catch (failure) { setMutationError(ownerError(failure)); if (failure?.status === 409) await read.refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  return <OwnerLayout><State loading={read.loading} error={read.error} retry={read.refresh}>
    {facility && <><div className="om-heading"><div><Link className="om-back" to="/owner/facilities">← Cơ sở của tôi</Link><h1>{facility.name}</h1></div><div className="om-actions">
      {facility.status === 'DRAFT' && <button className="om-primary" onClick={() => setConfirming(true)}>Gửi duyệt</button>}
      {editableFacility(facility.status) ? <Link className="om-primary" to={`/owner/facilities/${facility.id}/edit`}>Chỉnh sửa</Link> : <span className="om-disabled" title="Trạng thái hiện tại không cho phép sửa thông tin cơ bản">Chỉnh sửa</span>}
      <Link className="om-outline" to={`/owner/facilities/${facility.id}/courts`}>Quản lý sân</Link><Link className="om-outline" to={`/owner/facilities/${facility.id}/pricing`}>Cấu hình giá</Link><Link className="om-outline" to={`/owner/facilities/${facility.id}/bank-account`}>Tài khoản nhận cọc</Link>
    </div></div><OwnerFacilityNav facilityId={facility.id} active="details"/><section className="om-card om-detail">
      <div><small>Tên cơ sở</small><strong>{facility.name}</strong></div><div><small>Giờ mở cửa</small><strong>{facility.opening_time}</strong></div>
      <div><small>Địa chỉ</small><strong>{facility.address}</strong></div><div><small>Giờ đóng cửa</small><strong>{facility.closing_time}</strong></div>
      <div><small>Khu vực</small><strong>{facility.district}</strong></div><div><small>Mô tả</small><strong>{facility.description || 'Chưa cập nhật'}</strong></div>
      <div><small>Số điện thoại</small><strong>{facility.phone}</strong></div><div><small>Trạng thái</small><StatusBadge status={facility.status}/></div>
    </section>
    {facility.status === 'PENDING' && <p className="om-state-note pending" role="status">Đang chờ quản trị viên duyệt cơ sở.</p>}
    {facility.status === 'REJECTED' && facility.rejection_reason && <section className="om-state-note rejected"><strong>Lý do từ chối</strong><p>{facility.rejection_reason}</p></section>}
    {facility.status === 'SUSPENDED' && facility.suspension_reason && <section className="om-state-note suspended"><strong>Cơ sở đã bị tạm ngưng</strong><p>Lý do: {facility.suspension_reason}</p></section>}
    {mutationError && <p className="om-form-error" role="alert">{mutationError}</p>}
    {confirming && <AccessibleModal title="Gửi cơ sở để duyệt?" description="Sau khi gửi, thông tin cơ bản sẽ chỉ được xem cho đến khi quản trị viên xử lý." busy={busy} onClose={() => setConfirming(false)} backdropClass="ow-modal-back" className="ow-modal"><div><button disabled={busy} onClick={() => setConfirming(false)}>Hủy</button><button autoFocus className="primary" disabled={busy} onClick={submitForReview}>{busy ? 'Đang gửi…' : 'Xác nhận gửi duyệt'}</button></div></AccessibleModal>}
    </>}
  </State></OwnerLayout>;
}

function FacilityForm({ mode }) {
  const { facility_id } = useParams(), navigate = useNavigate(), auth = useOwnerApi();
  const read = useOwnerRead(mode === 'edit' ? '/owner/facilities/'+encodeURIComponent(facility_id) : null, detailResponse);
  const [form, setForm] = useState(blankFacility), [busy, setBusy] = useState(false), [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState({});
  useEffect(() => { if (read?.data?.data) { const f = read.data.data; setForm(Object.fromEntries(Object.keys(blankFacility).map(key => [key, f[key] ?? '']))); } }, [read?.data]);
  const set = (key, value) => { setForm(current => ({ ...current, [key]: value })); setFieldErrors(current => ({ ...current, [key]: undefined })); setError(''); };
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const validation = validateFacilityForm(form); setFieldErrors(validation);
    if (Object.keys(validation).length) { event.currentTarget.querySelector(`[name="${Object.keys(validation)[0]}"]`)?.focus(); return; }
    setBusy(true); setError('');
    try { const result = await auth.request(mode === 'edit' ? `/owner/facilities/${facility_id}` : '/owner/facilities', { method: mode === 'edit' ? 'PATCH' : 'POST', body: form }); navigate('/owner/facilities/'+result.data.id); }
    catch (failure) { if (failure?.code === 'INVALID_DISTRICT') setFieldErrors(current => ({ ...current, district: 'Khu vực không được hỗ trợ.' })); else setError(failure?.status === 422 ? 'Thông tin cơ sở không hợp lệ. Vui lòng kiểm tra lại các trường.' : ownerError(failure)); } finally { setBusy(false); }
  }
  if (read?.loading) return <OwnerLayout><p role="status">Đang tải dữ liệu…</p></OwnerLayout>;
  if (read?.error) return <OwnerLayout><div role="alert" className="ow-error">{ownerError(read.error)}</div></OwnerLayout>;
  if (mode === 'edit' && read?.data?.data && !editableFacility(read.data.data.status)) return <OwnerLayout><div role="alert" className="ow-error"><h1>Không thể chỉnh sửa cơ sở</h1><p>Trạng thái {facilityLabels[read.data.data.status]} không cho phép sửa thông tin cơ bản.</p><Link to={`/owner/facilities/${facility_id}`}>Về chi tiết cơ sở</Link></div></OwnerLayout>;
  return <OwnerLayout><h1>{mode === 'edit' ? 'Chỉnh sửa cơ sở' : 'Thêm cơ sở'}</h1><form className="om-card om-form" onSubmit={submit}>
    <label>Tên cơ sở<input name="name" required maxLength="200" value={form.name} onChange={e => set('name', e.target.value)} aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name?'facility-name-error':undefined}/><FieldError id="facility-name-error">{fieldErrors.name}</FieldError></label>
    <label>Địa chỉ<input name="address" required maxLength="500" value={form.address} onChange={e => set('address', e.target.value)} aria-invalid={!!fieldErrors.address} aria-describedby={fieldErrors.address?'facility-address-error':undefined}/><FieldError id="facility-address-error">{fieldErrors.address}</FieldError></label>
    <label>Khu vực<select name="district" required value={form.district} onChange={e => set('district', e.target.value)} aria-invalid={!!fieldErrors.district} aria-describedby={fieldErrors.district?'facility-district-error':undefined}><option value="">Chọn khu vực</option>{districts.map(d => <option key={d}>{d}</option>)}</select><FieldError id="facility-district-error">{fieldErrors.district}</FieldError></label>
    <label>Số điện thoại<input name="phone" required maxLength="30" value={form.phone} onChange={e => set('phone', e.target.value)} aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone?'facility-phone-error':undefined}/><FieldError id="facility-phone-error">{fieldErrors.phone}</FieldError></label>
    <label>Giờ mở cửa<input name="opening_time" required type="time" step="1800" value={form.opening_time} onChange={e => set('opening_time', e.target.value)} aria-invalid={!!fieldErrors.opening_time} aria-describedby={fieldErrors.opening_time?'facility-opening-error':undefined}/><FieldError id="facility-opening-error">{fieldErrors.opening_time}</FieldError></label>
    <label>Giờ đóng cửa<input name="closing_time" required type="time" step="1800" value={form.closing_time} onChange={e => set('closing_time', e.target.value)} aria-invalid={!!fieldErrors.closing_time} aria-describedby={fieldErrors.closing_time?'facility-closing-error':undefined}/><FieldError id="facility-closing-error">{fieldErrors.closing_time}</FieldError></label>
    <label className="wide">Mô tả (tùy chọn)<textarea name="description" maxLength="2000" value={form.description} onChange={e => set('description', e.target.value)} aria-invalid={!!fieldErrors.description} aria-describedby={fieldErrors.description?'facility-description-error':undefined}/><FieldError id="facility-description-error">{fieldErrors.description}</FieldError></label>
    {error && <p className="om-form-error wide" role="alert">{error}</p>}<div className="om-form-actions wide"><Link className="om-cancel" to={mode === 'edit' ? `/owner/facilities/${facility_id}` : '/owner/facilities'}>Hủy</Link><button className="om-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button></div>
  </form></OwnerLayout>;
}
export const OwnerFacilityCreate = () => <FacilityForm mode="create"/>;
export const OwnerFacilityEdit = () => <FacilityForm mode="edit"/>;

export function OwnerCourtList() {
  const { facility_id } = useParams(), [params, setParams] = useSearchParams(), page = Math.max(1, Number(params.get('page')) || 1);
  const facilityRead = useOwnerRead('/owner/facilities/'+encodeURIComponent(facility_id), detailResponse);
  const read = useOwnerRead(`/owner/facilities/${encodeURIComponent(facility_id)}/courts?page=${page}&page_size=20`, listResponse), rows = read.data?.data || [];
  const pending = facilityRead.data?.data?.status === 'PENDING';
  return <OwnerLayout><div className="om-heading"><div><h1>Quản lý sân</h1><p>{facilityRead.data?.data?.name || 'Cơ sở'}</p></div>{pending?<span className="om-disabled">+ Thêm sân</span>:<Link className="om-primary" to={`/owner/facilities/${facility_id}/courts/new`}>+ Thêm sân</Link>}</div>
    <OwnerFacilityNav facilityId={facility_id} active="courts"/>
    {pending && <p className="om-state-note pending" role="status">{pendingCourtMessage}</p>}
    <State loading={read.loading || facilityRead.loading} error={read.error || facilityRead.error} empty={!rows.length} retry={() => { void read.refresh(); void facilityRead.refresh(); }}>
      <div className="om-table courts"><div className="om-row om-head"><span>Tên sân</span><span>Mô tả</span><span>Trạng thái</span><span>Thao tác</span></div>{rows.map(c => <div className="om-row" key={c.id}><strong data-label="Sân">{c.name}</strong><span data-label="Mô tả">{c.description || 'Chưa có mô tả'}</span><span data-label="Trạng thái"><StatusBadge type="court" status={c.status}/></span>{pending?<span className="om-disabled">Chỉnh sửa</span>:<Link className="om-outline" to={`/owner/courts/${c.id}/edit`}>Chỉnh sửa</Link>}</div>)}</div>
      <OwnerPager meta={read.data?.meta || { page: 1, page_size: 20, total: 0 }} onPage={next => setParams(next > 1 ? { page: String(next) } : {})}/>
    </State>
  </OwnerLayout>;
}

function CourtForm({ mode }) {
  const { facility_id, court_id } = useParams(), navigate = useNavigate(), auth = useOwnerApi();
  const read = useOwnerRead(mode === 'edit' ? '/owner/courts/'+encodeURIComponent(court_id) : null, detailResponse);
  const [form, setForm] = useState(blankCourt), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (read?.data?.data) setForm({ name: read.data.data.name, description: read.data.data.description || '', status: read.data.data.status }); }, [read?.data]);
  const actualFacility = facility_id || read?.data?.data?.facility_id;
  const facilityRead = useOwnerRead(actualFacility ? '/owner/facilities/'+encodeURIComponent(actualFacility) : null, detailResponse);
  const pending = facilityRead.data?.data?.status === 'PENDING';
  async function submit(event) { event.preventDefault(); if (busy || pending) return; setBusy(true); setError('');
    const body = mode === 'edit' ? form : { name: form.name, description: form.description };
    try { await auth.request(mode === 'edit' ? `/owner/courts/${court_id}` : `/owner/facilities/${facility_id}/courts`, { method: mode === 'edit' ? 'PATCH' : 'POST', body }); navigate(`/owner/facilities/${actualFacility}/courts`); }
    catch (failure) { setError(ownerError(failure)); } finally { setBusy(false); }
  }
  if (read?.loading || facilityRead.loading) return <OwnerLayout><p role="status">Đang tải dữ liệu…</p></OwnerLayout>;
  if (read?.error || facilityRead.error) return <OwnerLayout><div role="alert" className="ow-error">{ownerError(read?.error || facilityRead.error)}</div></OwnerLayout>;
  if (pending) return <OwnerLayout><h1>{mode === 'edit' ? 'Chỉnh sửa sân' : 'Thêm sân'}</h1><div className="ow-error" role="status"><p>{pendingCourtMessage}</p><Link to={`/owner/facilities/${actualFacility}/courts`}>Về danh sách sân</Link></div></OwnerLayout>;
  return <OwnerLayout><h1>{mode === 'edit' ? 'Chỉnh sửa sân' : 'Thêm sân'}</h1><form className="om-card om-form single" onSubmit={submit}>
    <label className="wide">Tên sân<input required maxLength="100" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
    <label className="wide">Mô tả (tùy chọn)<textarea maxLength="2000" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
    {mode === 'edit' && <label className="wide">Trạng thái<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Tạm ngưng</option></select></label>}
    {error && <p className="om-form-error wide" role="alert">{error}</p>}<div className="om-form-actions wide"><Link className="om-cancel" to={actualFacility ? `/owner/facilities/${actualFacility}/courts` : '/owner/facilities'}>Hủy</Link><button className="om-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button></div>
  </form></OwnerLayout>;
}
export const OwnerCourtCreate = () => <CourtForm mode="create"/>;
export const OwnerCourtEdit = () => <CourtForm mode="edit"/>;

function validateRules(rules, facility) {
  if (rules.length > 48) return 'Chỉ được cấu hình tối đa 48 khung giờ.';
  const normalized = [];
  for (const rule of rules) {
    if (!validHalfHour(rule.start_time) || !validHalfHour(rule.end_time)) return 'Thời gian phải theo bước 30 phút.';
    const start = timeMinutes(rule.start_time), end = timeMinutes(rule.end_time);
    if (start >= end) return 'Giờ kết thúc phải sau giờ bắt đầu và không được qua đêm.';
    if (start < timeMinutes(facility.opening_time) || end > timeMinutes(facility.closing_time)) return 'Khung giờ phải nằm trong giờ hoạt động của cơ sở.';
    if (!/^\d+$/.test(rule.hourly_rate) || Number(rule.hourly_rate) <= 0 || Number(rule.hourly_rate) > 999999999999) return 'Giá/giờ phải là số nguyên dương hợp lệ.';
    normalized.push({ start_time: rule.start_time, end_time: rule.end_time, hourly_rate: Number(rule.hourly_rate) });
  }
  const sorted = [...normalized].sort((a, b) => timeMinutes(a.start_time) - timeMinutes(b.start_time));
  if (sorted.some((rule, index) => index && timeMinutes(rule.start_time) < timeMinutes(sorted[index - 1].end_time))) return 'Các khung giờ không được chồng lấn.';
  return normalized;
}
export function OwnerPricing() {
  const { facility_id } = useParams(), auth = useOwnerApi(), facilityRead = useOwnerRead('/owner/facilities/'+encodeURIComponent(facility_id), detailResponse), read = useOwnerRead(`/owner/facilities/${encodeURIComponent(facility_id)}/price-rules`, arrayResponse);
  const [rules, setRules] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => { if (read.data) setRules(read.data.data.map(rule => ({ start_time: rule.start_time, end_time: rule.end_time, hourly_rate: String(rule.hourly_rate) }))); }, [read.data]);
  const facility = facilityRead.data?.data, validation = useMemo(() => facility ? validateRules(rules, facility) : null, [rules, facility]);
  const pending = facility?.status === 'PENDING';
  const change = (index, key, value) => setRules(current => current.map((rule, i) => i === index ? { ...rule, [key]: value } : rule));
  async function save() { if (pending) return; if (!Array.isArray(validation)) { setError(validation); return; } setBusy(true); setError(''); setSaved(false); try { const result = await auth.request(`/owner/facilities/${facility_id}/price-rules`, { method: 'PUT', body: { rules: validation } }); setRules(result.data.map(rule => ({ start_time: rule.start_time, end_time: rule.end_time, hourly_rate: String(rule.hourly_rate) }))); setSaved(true); } catch (failure) { setError(ownerError(failure)); } finally { setBusy(false); } }
  return <OwnerLayout><State loading={read.loading || facilityRead.loading} error={read.error || facilityRead.error} retry={() => { void read.refresh(); void facilityRead.refresh(); }}>
    <div className="om-heading"><div><h1>Cấu hình giá</h1><p>{facility?.name}</p><p>Giá được áp dụng chung cho tất cả sân của cơ sở.</p></div></div>
    <OwnerFacilityNav facilityId={facility_id} active="pricing"/>
    {pending && <p className="om-state-note pending" role="status">{pendingPricingMessage}</p>}
    <section className="om-card om-pricing"><div className="om-price-head"><span>Từ giờ</span><span>Đến giờ</span><span>Giá/giờ</span><span>Thao tác</span></div>
      {rules.map((rule, index) => <div className="om-price-row" key={index}><input aria-label={`Từ giờ ${index + 1}`} disabled={pending} type="time" step="1800" value={rule.start_time} onChange={e => change(index, 'start_time', e.target.value)}/><input aria-label={`Đến giờ ${index + 1}`} disabled={pending} type="time" step="1800" value={rule.end_time} onChange={e => change(index, 'end_time', e.target.value)}/><input aria-label={`Giá/giờ ${index + 1}`} disabled={pending} inputMode="numeric" value={rule.hourly_rate} onChange={e => change(index, 'hourly_rate', e.target.value)}/><button className="om-delete" disabled={pending} onClick={() => setRules(current => current.filter((_, i) => i !== index))}>Xóa</button></div>)}
      {!rules.length && <p className="om-price-empty">Chưa có khung giá. Có thể lưu danh sách rỗng hoặc thêm khung giờ mới.</p>}
      <button className="om-outline add" disabled={pending || rules.length >= 48} onClick={() => setRules(current => [...current, { start_time: facility?.opening_time || '06:00', end_time: facility?.closing_time || '22:00', hourly_rate: '' }])}>+ Thêm khung giờ</button>
      {(error || (!Array.isArray(validation) && rules.length > 0)) && <p className="om-form-error" role="alert">{error || validation}</p>}{saved && <p className="om-success" role="status">Đã lưu cấu hình giá.</p>}
      <div className="om-form-actions"><Link className="om-cancel" to={`/owner/facilities/${facility_id}`}>Hủy</Link><button className="om-primary" disabled={busy || pending} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button></div>
    </section>
  </State></OwnerLayout>;
}
