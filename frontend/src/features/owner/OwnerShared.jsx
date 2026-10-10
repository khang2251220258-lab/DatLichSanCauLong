/* oxlint-disable react/only-export-components, react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Header } from '../facilities/PublicLayout';
import { useAuth } from '../auth/useAuth';
import { errorMessage } from '../../services/api';
import './owner.css';

export const ownerError = error => error?.status === 404
  ? 'Không tìm thấy dữ liệu hoặc bạn không có quyền truy cập.'
  : errorMessage(error || {});

export function OwnerLayout({ children }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith('/owner/bookings') ? 'bookings'
    : pathname.startsWith('/owner/facilities') || pathname.startsWith('/owner/courts') ? 'facilities' : '';
  return <div className="ow-page"><Header/><div className="ow-shell">
    <aside className="ow-side"><div className="ow-owner">Chủ sân</div><nav aria-label="Quản lý chủ sân">
      <Link className={active === 'facilities' ? 'active' : ''} to="/owner/facilities">Cơ sở của tôi</Link>
      <Link className={active === 'bookings' ? 'active' : ''} to="/owner/bookings">Đơn đặt sân</Link>
    </nav></aside><main className="ow-main">{children}</main>
  </div></div>;
}

export function useOwnerRead(path, validate) {
  const { request } = useOwnerApi(), [state, setState] = useState({ loading: true }), generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!path) { setState({ loading: false, busy: false, error: null, data: null }); return null; }
    const version = ++generation.current;
    setState(current => ({ ...current, loading: !current.data, busy: true, error: null }));
    try {
      const value = await request(path, { validate });
      if (version === generation.current) setState({ data: value, loading: false, busy: false, error: null });
      return value;
    } catch (error) {
      if (version === generation.current) setState(current => ({ ...current, loading: false, busy: false, error }));
      throw error;
    }
  }, [path, request, validate]);
  useEffect(() => { void refresh().catch(() => {}); return () => { generation.current++; }; }, [refresh]);
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
