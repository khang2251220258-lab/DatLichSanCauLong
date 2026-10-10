/* oxlint-disable react/set-state-in-effect */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { facilityStatusLabels } from '../../domain/statusLabels';
import { detailResponse, ownerCancellationPolicyResponse } from '../../services/responseValidators';
import { OwnerFacilityNav, OwnerLayout, ownerError, useOwnerApi, useOwnerRead } from './OwnerShared';
import './owner-management.css';

function validateCutoff(value) {
  if (value === '') return 'Vui lòng nhập thời hạn hủy từ 0 đến 168 giờ.';
  if (!/^\d+$/.test(value)) return 'Thời hạn hủy phải là số nguyên từ 0 đến 168 giờ.';
  const cutoff = Number(value);
  if (!Number.isSafeInteger(cutoff) || cutoff < 0 || cutoff > 168) return 'Thời hạn hủy phải từ 0 đến 168 giờ.';
  return '';
}

export function OwnerCancellationPolicy() {
  const { facility_id } = useParams(), api = useOwnerApi(), encodedId = encodeURIComponent(facility_id);
  const facilityRead = useOwnerRead(`/owner/facilities/${encodedId}`, detailResponse);
  const policyRead = useOwnerRead(`/owner/facilities/${encodedId}/cancellation-policy`, ownerCancellationPolicyResponse);
  const [cutoff, setCutoff] = useState(''), [validation, setValidation] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [message, setMessage] = useState('');
  const facility = facilityRead.data?.data, policy = policyRead.data?.data;
  const pending = facility?.status === 'PENDING';

  useEffect(() => {
    if (policyRead.data) {
      setCutoff(policy === null ? '' : String(policy.cutoff_hours));
      setValidation('');
    }
  }, [policyRead.data, policy]);

  function edit(value) {
    setCutoff(value);
    setValidation('');
    setFailure('');
    setMessage('');
  }

  async function save(event) {
    event.preventDefault();
    if (busy || pending || !facility) return;
    const invalid = validateCutoff(cutoff);
    setValidation(invalid);
    if (invalid) return;
    setBusy(true); setFailure(''); setMessage('');
    try {
      await api.request(`/owner/facilities/${facility_id}/cancellation-policy`, {
        method: 'PUT', body: { cutoff_hours: Number(cutoff) }, validate: ownerCancellationPolicyResponse,
      });
      await policyRead.refresh();
      setMessage('Đã lưu chính sách hủy.');
    } catch (error) {
      setFailure(ownerError(error));
      if (error.status === 409) await Promise.allSettled([facilityRead.refresh(), policyRead.refresh()]);
    } finally { setBusy(false); }
  }

  const loading = facilityRead.loading || policyRead.loading;
  const readError = facilityRead.error || policyRead.error;
  return <OwnerLayout><div className="oba-breadcrumb"><Link to="/owner/facilities">Cơ sở của tôi</Link><span>›</span><Link to={`/owner/facilities/${facility_id}`}>{facility?.name || 'Chi tiết cơ sở'}</Link><span>›</span><strong>Chính sách hủy</strong></div>
    {loading ? <p role="status">Đang tải dữ liệu…</p> : readError ? <div className="ow-error" role="alert"><p>{ownerError(readError)}</p><button onClick={() => { void facilityRead.refresh(); void policyRead.refresh(); }}>Thử lại</button></div> : <>
      <div className="ocp-facility-head"><div><h1>{facility.name}</h1><p>{facility.address}</p></div><span className={`om-status ${facility.status}`}>{facilityStatusLabels[facility.status] || facility.status}</span></div>
      <OwnerFacilityNav facilityId={facility_id} active="cancellation"/>
      {pending && <p className="om-state-note pending" role="status">Cơ sở đang chờ duyệt. Bạn chỉ có thể xem chính sách hủy lúc này.</p>}
      <form className="om-card ocp-card" onSubmit={save} noValidate><h2>Chính sách hủy</h2><p>Thiết lập thời hạn khách hàng được phép hủy đặt sân.</p>
        {policy === null && <p className="ocp-empty" role="status">Chưa thiết lập chính sách hủy. Chính sách mới chỉ áp dụng cho các đơn đặt sân được tạo sau khi lưu.</p>}
        <label htmlFor="cutoff-hours">Cho phép hủy trước giờ chơi</label>
        <div className="ocp-input-row"><input id="cutoff-hours" type="number" inputMode="numeric" min="0" max="168" step="1" placeholder="Nhập số giờ từ 0 đến 168" disabled={pending || busy} value={cutoff} aria-invalid={Boolean(validation)} aria-describedby={validation ? 'cutoff-error' : 'cutoff-help'} onChange={event => edit(event.target.value)}/><span>giờ</span></div>
        <small id="cutoff-help">Nhập số nguyên từ 0 đến 168. Thay đổi không ảnh hưởng các booking đã tạo.</small>
        {validation && <p id="cutoff-error" className="om-form-error" role="alert">{validation}</p>}
        {failure && <p className="om-form-error" role="alert">{failure}</p>}{message && <p className="om-success" role="status">{message}</p>}
        <div className="om-form-actions"><button className="om-primary" formNoValidate disabled={pending || busy || cutoff === ''}>{busy ? 'Đang lưu…' : 'Lưu chính sách'}</button></div>
      </form>
    </>}
  </OwnerLayout>;
}
