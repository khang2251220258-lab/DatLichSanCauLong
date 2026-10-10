import { NavLink } from 'react-router';
import { Header } from '../facilities/PublicLayout';

export function AdminLayout({ children }) {
  return <div className="af-page"><Header/><div className="af-shell">
    <aside className="af-admin-nav" aria-label="Điều hướng quản trị">
      <strong>Quản trị viên</strong>
      <NavLink to="/admin/facilities">Quản lý cơ sở</NavLink>
      <NavLink to="/admin/owner-requests">Yêu cầu chủ sân</NavLink>
      <NavLink to="/admin/amenities">Tiện ích</NavLink>
    </aside>
    <main className="af-main">{children}</main>
  </div></div>;
}

