import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './useAuth';
import { AuthLayout, Notice } from './AuthUI';
import { errorMessage } from '../../services/api';
import { safeReturnPath } from './returnPath';
export function SessionBoundary({ children }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <AuthLayout title="Đang kiểm tra phiên"><p role="status" className="center">Vui lòng chờ…</p></AuthLayout>;
  if (auth.status === 'error') return <AuthLayout title="Chưa thể kiểm tra phiên"><Notice>{errorMessage(auth.error)}</Notice><button className="primary" onClick={() => void auth.refresh()}>Thử lại</button></AuthLayout>;
  return children;
}
export function GuestOnly({ children }) {
  const auth = useAuth(), location = useLocation();
  return <SessionBoundary>{auth.status === 'authenticated' ? <Navigate to={safeReturnPath(location.state?.from)} replace /> : children}</SessionBoundary>;
}
export function RequireAuth({ capability, children }) {
  const auth = useAuth(), location = useLocation();
  return <SessionBoundary>{auth.status !== 'authenticated' ? <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />
    : capability && !auth.user.capabilities.includes(capability)
      ? <AuthLayout title="Không có quyền truy cập"><Notice>Tài khoản không có quyền truy cập trang này.</Notice></AuthLayout>
      : children || <Outlet />}</SessionBoundary>;
}
