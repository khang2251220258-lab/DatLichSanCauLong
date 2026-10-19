import { NavLink } from 'react-router';
import { Header } from '../facilities/PublicLayout';
import './admin-reliability.css';
import './admin-shell.css';

const navigation = [
  { to: '/admin/facilities', label: 'Quản lý cơ sở', icon: '▦' },
  { to: '/admin/owner-requests', label: 'Yêu cầu chủ sân', icon: '◇' },
  { to: '/admin/amenities', label: 'Tiện ích', icon: '✦' },
];

export function AdminLayout({ children }) {
  return <div className="af-page"><Header variant="admin"/><div className="af-shell">
    <aside className="af-admin-nav"><div className="af-admin-identity"><span>Điều hành hệ thống</span><small>Không gian quản trị</small></div>
      <nav aria-label="Điều hướng quản trị">{navigation.map(item => <NavLink key={item.to} to={item.to}>
        <span className="af-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
      </NavLink>)}</nav>
    </aside>
    <main className="af-main" id="admin-workspace">{children}</main>
  </div></div>;
}

