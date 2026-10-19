/* oxlint-disable react/only-export-components, react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Header } from '../facilities/PublicLayout';
import { useAuth } from '../auth/useAuth';
import { errorMessage } from '../../services/api';
import { protectedIdentity, readProtectedSnapshot, writeProtectedSnapshot } from '../../services/protectedReadCache';
import './owner.css';

export const ownerError = error => error?.status === 404
  ? 'Không tìm thấy dữ liệu hoặc bạn không có quyền truy cập.'
  : errorMessage(error || {});

export function OwnerLayout({ children }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith('/owner/analytics') ? 'analytics'
    : pathname.startsWith('/owner/bookings') || pathname.startsWith('/owner/booking-series') ? 'bookings'
    : pathname.startsWith('/owner/facilities') || pathname.startsWith('/owner/courts') ? 'facilities' : '';
  return <div className="ow-page"><Header variant="owner"/><div className="ow-shell">
    <aside className="ow-side"><div className="ow-owner"><span>Quản lý vận hành</span><small>Không gian chủ sân</small></div><nav aria-label="Quản lý chủ sân">
      <Link className={active === 'facilities' ? 'active' : ''} aria-current={active === 'facilities' ? 'page' : undefined} to="/owner/facilities"><span className="ow-nav-icon" aria-hidden="true">⌂</span><span>Cơ sở của tôi</span></Link>
      <Link className={active === 'bookings' ? 'active' : ''} aria-current={active === 'bookings' ? 'page' : undefined} to="/owner/bookings"><span className="ow-nav-icon" aria-hidden="true">▤</span><span>Đơn đặt sân</span></Link>
      <Link className={active === 'analytics' ? 'active' : ''} aria-current={active === 'analytics' ? 'page' : undefined} to="/owner/analytics"><span className="ow-nav-icon" aria-hidden="true">▥</span><span>Thống kê</span></Link>
    </nav></aside><main className="ow-main" id="owner-workspace">{children}</main>
  </div></div>;
}

export function useOwnerRead(path, validate, { cache = false } = {}) {
  const auth = useOwnerApi(), { request } = auth, identity = protectedIdentity(auth.user);
  const requestRef = useRef(request), [state, setState] = useState(() => {
    const data = cache ? readProtectedSnapshot(identity, path) : null;
    return data ? { data, loading:false, busy:false, error:null } : { loading:true };
  }), generation = useRef(0), active = useRef(null);
  useEffect(() => { requestRef.current = request; }, [request]);
  const refresh = useCallback(async () => {
    if (!path) { setState({ loading: false, busy: false, error: null, data: null }); return null; }
    const version = ++generation.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState(current => ({ ...current, loading: !current.data, busy: true, error: null }));
    try {
      const value = await requestRef.current(path, { validate, signal: controller.signal });
      if (!controller.signal.aborted && version === generation.current) {
        if (cache) writeProtectedSnapshot(identity, path, value);
        setState({ data: value, loading: false, busy: false, error: null });
      }
      return value;
    } catch (error) {
      if (!controller.signal.aborted && version === generation.current) setState(current => ({ ...current, loading: false, busy: false, error }));
      throw error;
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [path, validate, cache, identity]);
  useEffect(() => {
    const cached = cache ? readProtectedSnapshot(identity, path) : null;
    if (cached) setState({ data:cached, loading:false, busy:true, error:null });
    // React StrictMode mounts, cleans up, then mounts again in development.
    // Defer the initial read so the discarded probe never reaches the API.
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void refresh().catch(() => {}); });
    return () => { disposed = true; generation.current++; active.current?.abort(); active.current = null; };
  }, [refresh, cache, identity, path]);
  return { ...state, refresh };
}

// Isolates the auth dependency so Owner pages share one API/session boundary.
export function useOwnerApi() { return useAuth(); }

export function OwnerPager({ meta, onPage }) {
  const pages = Math.max(1, Math.ceil(meta.total / meta.page_size));
  return <nav className="ow-pager" aria-label="Phân trang"><button disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Trước</button><span>Trang {meta.page}/{pages}</span><button disabled={meta.page >= pages} onClick={() => onPage(meta.page + 1)}>Sau</button></nav>;
}

const facilitySections = [
  ['details', 'Thông tin cơ sở', id => `/owner/facilities/${id}`],
  ['presentation', 'Hình ảnh & tiện ích', id => `/owner/facilities/${id}/images-amenities`],
  ['courts', 'Quản lý sân', id => `/owner/facilities/${id}/courts`],
  ['pricing', 'Bảng giá', id => `/owner/facilities/${id}/pricing`],
  ['cancellation', 'Chính sách hủy', id => `/owner/facilities/${id}/cancellation-policy`],
  ['bank', 'Tài khoản nhận cọc', id => `/owner/facilities/${id}/bank-account`],
];
export function OwnerFacilityNav({ facilityId, active }) {
  return <nav className="oba-tabs" aria-label="Cấu hình cơ sở">{facilitySections.map(([key, label, route]) => route
    ? <Link key={key} className={active === key ? 'active' : ''} aria-current={active === key ? 'page' : undefined} to={route(facilityId)}>{label}</Link>
    : <span key={key} aria-disabled="true">{label}</span>)}</nav>;
}
