import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { errorMessage } from '../../services/api';
import { useAuth } from '../auth/useAuth';
import './public-layout.css';
function Brand() { return <Link className="fl-brand" to="/"><span aria-hidden="true">🏸</span> Cầu Lông <b>ĐN</b></Link>; }
export function Header({ variant = 'public' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function logout() {
    if (busy) return;
    setBusy(true); setError('');
    try { await auth.request('/auth/logout', { method: 'POST' }); auth.clearSession('logout'); navigate('/login', { replace: true, state: null }); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  const workspace = variant === 'owner' || variant === 'admin';
  const context = variant === 'admin' ? 'Không gian quản trị' : 'Không gian chủ sân';
  return <header className={`fl-header${variant === 'owner' ? ' ow-header' : ''}${variant === 'admin' ? ' aw-header' : ''}`}><div className="ow-header-brand"><Brand />{workspace && <span className={variant === 'admin' ? 'aw-context' : 'ow-context'}>{context}</span>}</div>{!workspace && <nav aria-label="Điều hướng chính"><NavLink to="/" end>Trang chủ</NavLink><NavLink to="/facilities">Tìm sân</NavLink>{auth.status === 'authenticated' && auth.user.capabilities.includes('CUSTOMER') && <NavLink to="/bookings">Lịch đặt sân</NavLink>}{auth.status === 'authenticated' && auth.user.capabilities.includes('OWNER') && <NavLink to="/owner/bookings">Quản lý đặt sân</NavLink>}{auth.status === 'authenticated' && auth.user.capabilities.includes('ADMIN') && <NavLink to="/admin/facilities">Quản lý cơ sở</NavLink>}</nav>}
    <div className="fl-account">
      {auth.status === 'guest' && <><Link to="/login">Đăng nhập</Link><Link to="/register">Đăng ký</Link></>}
      {auth.status === 'loading' && <span role="status">Đang kiểm tra phiên…</span>}
      {auth.status === 'error' && <><span role="alert">Chưa thể kiểm tra phiên</span><button onClick={auth.refresh}>Thử lại phiên</button></>}
      {auth.status === 'authenticated' && <AccountMenu user={auth.user} busy={busy} logout={logout}/>}
      {error && <span role="alert">{error}</span>}
    </div></header>;
}
function AccountMenu({user,busy,logout}) {
  const [open,setOpen]=useState(false), root=useRef(null), trigger=useRef(null);
  useEffect(()=>{if(!open)return;const outside=e=>{if(!root.current?.contains(e.target))setOpen(false)};const key=e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key)}},[open]);
  const admin=user.capabilities.includes('ADMIN'), owner=user.capabilities.includes('OWNER');
  const workspace=admin?['/admin/facilities','Trang quản trị']:owner?['/owner/facilities','Quản lý sân']:['/owner-request','Đăng ký chủ sân'];
  return <div className="fl-account-menu" ref={root}><button ref={trigger} type="button" className="fl-profile-trigger" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><span className="fl-avatar" aria-hidden="true">{user.full_name?.trim().slice(0,1)}</span><span>{user.full_name}</span><span aria-hidden="true">⌄</span></button>{open&&<div className="fl-account-popover" role="menu"><Link role="menuitem" to="/profile" onClick={()=>setOpen(false)}>Hồ sơ cá nhân</Link><Link role="menuitem" to={workspace[0]} onClick={()=>setOpen(false)}>{workspace[1]}</Link><button role="menuitem" disabled={busy} onClick={()=>{setOpen(false);logout()}}>{busy?'Đang đăng xuất…':'Đăng xuất'}</button></div>}</div>;
}
export function Footer() {
  return <footer className="fl-footer"><div className="fl-footer-grid"><div><Brand /><p>Khám phá các cơ sở cầu lông<br />tại Đà Nẵng.</p></div><div><h2>Liên kết nhanh</h2><Link to="/">Trang chủ</Link><Link to="/facilities">Tìm sân</Link></div><div><h2>Hỗ trợ</h2><p>Nội dung hướng dẫn sẽ được bổ sung.</p></div><div><h2>Liên hệ</h2><p>Thông tin liên hệ sẽ được cập nhật.</p></div></div><div className="fl-footer-bottom">Cầu Lông ĐN<span>Website sân cầu lông tại Đà Nẵng</span></div></footer>;
}
