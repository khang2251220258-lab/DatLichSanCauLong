import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { errorMessage } from '../../services/api';
import { useAuth } from '../auth/useAuth';
function Brand() { return <Link className="fl-brand" to="/"><span aria-hidden="true">🏸</span> Cầu Lông <b>ĐN</b></Link>; }
export function Header() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function logout() {
    if (busy) return;
    setBusy(true); setError('');
    try { await auth.request('/auth/logout', { method: 'POST' }); auth.clearSession(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <header className="fl-header"><Brand /><nav aria-label="Điều hướng chính"><NavLink to="/" end>Trang chủ</NavLink><NavLink to="/facilities">Tìm sân</NavLink>{auth.status === 'authenticated' && auth.user.capabilities.includes('CUSTOMER') && <NavLink to="/bookings">Lịch đặt sân</NavLink>}{auth.status === 'authenticated' && auth.user.capabilities.includes('OWNER') && <NavLink to="/owner/bookings">Quản lý đặt sân</NavLink>}{auth.status === 'authenticated' && auth.user.capabilities.includes('ADMIN') && <NavLink to="/admin/facilities">Quản lý cơ sở</NavLink>}</nav>
    <div className="fl-account">
      {auth.status === 'guest' && <><Link to="/login">Đăng nhập</Link><Link to="/register">Đăng ký</Link></>}
      {auth.status === 'loading' && <span role="status">Đang kiểm tra phiên…</span>}
      {auth.status === 'error' && <><span role="alert">Chưa thể kiểm tra phiên</span><button onClick={auth.refresh}>Thử lại phiên</button></>}
      {auth.status === 'authenticated' && <><span className="fl-avatar" aria-hidden="true">{auth.user.full_name?.trim().slice(0, 1)}</span><span>{auth.user.full_name}</span><button disabled={busy} onClick={logout}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></>}
      {error && <span role="alert">{error}</span>}
    </div></header>;
}
export function Footer() {
  return <footer className="fl-footer"><div className="fl-footer-grid"><div><Brand /><p>Khám phá các cơ sở cầu lông<br />tại Đà Nẵng.</p></div><div><h2>Liên kết nhanh</h2><Link to="/">Trang chủ</Link><Link to="/facilities">Tìm sân</Link></div><div><h2>Hỗ trợ</h2><p>Nội dung hướng dẫn sẽ được bổ sung.</p></div><div><h2>Liên hệ</h2><p>Thông tin liên hệ sẽ được cập nhật.</p></div></div><div className="fl-footer-bottom">Cầu Lông ĐN<span>Website sân cầu lông tại Đà Nẵng</span></div></footer>;
}
