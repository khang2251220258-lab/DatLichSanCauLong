import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, errorMessage } from '../../services/api';
import { facilityListResponse } from '../../services/responseValidators';
import { Header, Footer } from './PublicLayout';
import districts from '../../generated/districts.json';
import './facilities.css';
import { FacilityCard } from './FacilityCard';

function Search({ params, apply, clear }) {
  const [q, setQ] = useState(params.get('q') || '');
  const [district, setDistrict] = useState(params.get('district') || '');
  return <form className="fl-search" onSubmit={e => { e.preventDefault(); apply(q, district); }}>
    <label>Tên sân<input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên sân..." /></label>
    <label>Khu vực<select value={district} onChange={e => setDistrict(e.target.value)}><option value="">Tất cả khu vực</option>{district && !districts.includes(district) && <option value={district}>{district} (không hợp lệ)</option>}{districts.map(d => <option key={d}>{d}</option>)}</select></label>
    <button className="fl-primary" type="submit">⌕ Tìm kiếm</button><button type="button" onClick={() => { setQ(''); setDistrict(''); clear(); }}>× Xóa bộ lọc</button>
  </form>;
}
export function FacilityList() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const [attempt, setAttempt] = useState(0);
  const [completed, setCompleted] = useState(null);
  const requestKey = query + ':' + attempt;
  const loading = completed?.key !== requestKey;
  const result = completed?.value;
  const error = loading ? null : completed?.error;
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const request = new URLSearchParams(query);
    if (!request.get('q')?.trim() && request.getAll('q').length <= 1) request.delete('q');
    if (request.get('district') === '' && request.getAll('district').length === 1) request.delete('district');
    api('/facilities' + (request.size ? '?' + request : ''), { signal: controller.signal, validate:facilityListResponse })
      .then(value => { if (current) setCompleted({ key: requestKey, value }); })
      .catch(error => { if (current) setCompleted({ key: requestKey, error }); });
    return () => { current = false; controller.abort(); };
  }, [query, requestKey]);
  function apply(q, district) {
    const next = new URLSearchParams();
    if (q.trim()) next.set('q', q.trim().normalize('NFC'));
    if (district) next.set('district', district.trim().normalize('NFC'));
    next.set('page', '1');
    if (params.has('page_size')) next.set('page_size', params.get('page_size'));
    setParams(next);
    if (next.toString() === query) setAttempt(v => v + 1);
  }
  const meta = result?.meta;
  const pages = meta ? Math.ceil(meta.total / meta.page_size) : 0;
  function turn(page) {
    if (loading || page < 1 || page > pages) return;
    const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next);
  }
  return <div className="fl-page"><Header /><main className="fl-main"><section className="fl-intro"><h1>Tìm sân cầu lông</h1><p>Khám phá các sân cầu lông tại Đà Nẵng</p></section>
    <section className="fl-content"><Search key={query} params={params} apply={apply} clear={() => apply('', '')} />
      <h2>Danh sách sân</h2><div aria-busy={loading}>
        {loading ? <><p role="status">{result ? 'Đang cập nhật kết quả…' : 'Đang tải danh sách sân…'}</p><div className="fl-grid" aria-hidden="true">{[1, 2, 3].map(n => <div key={n} className="fl-skeleton" />)}</div></> : error ? <div className="fl-state" role="alert"><p>{error.code === 'INVALID_DISTRICT' ? 'Khu vực không hợp lệ.' : error.code === 'VALIDATION_ERROR' || error.code === 'FILTER_NOT_CONFIGURED' ? 'Tham số tìm kiếm không hợp lệ hoặc chưa được hỗ trợ.' : errorMessage(error)}</p><button onClick={() => setAttempt(v => v + 1)}>Thử lại</button><button onClick={() => setParams({})}>Xóa bộ lọc</button></div> : !result?.data.length ? <div className="fl-state"><p role="status">Không tìm thấy sân phù hợp</p><button onClick={() => apply('', '')}>Xóa bộ lọc</button></div> : <div className="fl-grid">{result.data.map(f => <FacilityCard key={f.id + (f.cover_image_url || '')} facility={f} />)}</div>}
      </div>
      {!loading && !error && meta && pages > 0 && <nav className="fl-pagination" aria-label="Phân trang"><button aria-label="Trang trước" disabled={meta.page <= 1} onClick={() => turn(meta.page - 1)}>‹</button><span aria-current="page">{meta.page}</span><span>/ {pages}</span><button aria-label="Trang sau" disabled={meta.page >= pages} onClick={() => turn(meta.page + 1)}>›</button></nav>}
    </section></main><Footer /></div>;
}
