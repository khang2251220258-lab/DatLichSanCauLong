import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api, errorMessage } from '../../services/api';
import { useAuth } from './useAuth';
import { AuthLayout, BackToLogin, Field, Notice } from './AuthUI';
import { passwordHint, validateFields } from './validation';
import { authResponse } from '../../services/responseValidators';
import { authorizedReturnPath } from './returnPath';

function useForm(mode, action) {
  const [values, setValues] = useState({ email: '', password: '', full_name: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const active = useRef(null);
  useEffect(() => () => active.current?.abort(), []);
  const change = event => {
    const { name, value } = event.target;
    setValues(previous => ({ ...previous, [name]: value }));
    setErrors(previous => ({ ...previous, [name]: undefined }));
    setError('');
  };
  const submit = async event => {
    event.preventDefault();
    if (active.current) return;
    const nextErrors = validateFields(values, mode);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      event.currentTarget.querySelector('[name="' + Object.keys(nextErrors)[0] + '"]')?.focus();
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setPending(true); setError('');
    try { await action(values, controller.signal); }
    catch (failure) { if (!controller.signal.aborted) setError(errorMessage(failure)); }
    finally {
      active.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  const field = name => ({ name, value: values[name], onChange: change, error: errors[name], disabled: pending });
  return { field, submit, pending, error };
}
function Submit({ pending, children }) {
  return <button className="primary" type="submit" disabled={pending}>{pending ? 'Đang xử lý…' : children}</button>;
}
export function LoginPage() {
  const auth = useAuth(), navigate = useNavigate(), location = useLocation();
  const [requestedDestination] = useState(location.state?.from);
  const [registered] = useState(location.state?.registered === true);
  const [passwordNotice] = useState(location.state?.passwordChanged ? 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' : location.state?.passwordChangeUnknown ? 'Không thể xác minh kết quả đổi mật khẩu. Hãy thử đăng nhập lại bằng mật khẩu mới.' : '');
  useEffect(() => {
    if (location.state?.registered || location.state?.passwordChanged || location.state?.passwordChangeUnknown) navigate('/login', { replace: true, state: null });
  }, [location.state, navigate]);
  const form = useForm('login', async (values, signal) => {
    await api('/auth/login', { method: 'POST', body: { email: values.email.trim().toLowerCase(), password: values.password }, signal, validate:authResponse });
    if (signal.aborted) return;
    const session = await auth.confirmLogin(signal);
    if (signal.aborted) return;
    if (session.status !== 'authenticated') throw session.error || new Error('SESSION_NOT_ESTABLISHED');
    const destination = authorizedReturnPath(auth.hasLogoutIntent() ? undefined : requestedDestination, session.user);
    auth.consumeLogoutIntent();
    navigate(destination, { replace: true, state: null });
  });
  return <AuthLayout title="Đăng nhập" subtitle="Chào mừng trở lại!">
    <Notice success>{registered ? 'Đăng ký thành công. Vui lòng đăng nhập.' : ''}</Notice>
    <Notice success={Boolean(location.state?.passwordChanged)}>{passwordNotice}</Notice>
    <form onSubmit={form.submit} noValidate aria-busy={form.pending}>
      <Field {...form.field('email')} label="Email" autoComplete="username" placeholder="email@example.com" />
      <Field {...form.field('password')} label="Mật khẩu" password autoComplete="current-password" placeholder="Nhập mật khẩu" />
      <div className="forgot-link"><Link to="/forgot-password">Quên mật khẩu?</Link></div>
      <Notice>{form.error}</Notice><Submit pending={form.pending}>Đăng nhập</Submit>
    </form>
    <p className="auth-footer">Chưa có tài khoản? <Link to="/register" state={requestedDestination?{from:requestedDestination}:null}>Đăng ký ngay</Link></p>
  </AuthLayout>;
}
export function RegisterPage() {
  const navigate = useNavigate(), location=useLocation();
  const [requestedDestination]=useState(location.state?.from);
  const form = useForm('register', async (values, signal) => {
    await api('/auth/register', { method: 'POST', body: { full_name: values.full_name.trim(), email: values.email.trim().toLowerCase(), password: values.password }, signal });
    if (!signal.aborted) navigate('/login', { replace: true, state: { registered: true, ...(requestedDestination?{from:requestedDestination}:{}) } });
  });
  return <AuthLayout title="Tạo tài khoản" subtitle="Đăng ký để đặt sân dễ dàng">
    <form onSubmit={form.submit} noValidate aria-busy={form.pending}>
      <Field {...form.field('full_name')} label="Họ và tên" autoComplete="name" placeholder="Nguyễn Văn A" />
      <Field {...form.field('email')} label="Email" autoComplete="email" placeholder="email@example.com" />
      <Field {...form.field('password')} label="Mật khẩu" password autoComplete="new-password" placeholder="Nhập mật khẩu" />
      <p className="password-hint">{passwordHint}</p>
      <Notice>{form.error}</Notice><Submit pending={form.pending}>Tạo tài khoản</Submit>
    </form>
    <p className="auth-footer">Đã có tài khoản? <Link to="/login" state={requestedDestination?{from:requestedDestination}:null}>Đăng nhập</Link></p>
  </AuthLayout>;
}
export function ForgotPage() {
  const [sent, setSent] = useState(false);
  const form = useForm('forgot', async (values, signal) => {
    await api('/auth/forgot-password', { method: 'POST', body: { email: values.email.trim().toLowerCase() }, signal });
    if (!signal.aborted) setSent(true);
  });
  if (sent) return <AuthLayout title="Đã nhận yêu cầu!" brand={false} icon="mail" className="sent-state"
    subtitle="Nếu tài khoản đủ điều kiện, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email của bạn."><BackToLogin /></AuthLayout>;
  return <AuthLayout title="Quên mật khẩu" subtitle="Nhập email để nhận link đặt lại mật khẩu">
    <form onSubmit={form.submit} noValidate aria-busy={form.pending}>
      <Field {...form.field('email')} label="Email" autoComplete="email" placeholder="email@example.com" />
      <Notice>{form.error}</Notice><Submit pending={form.pending}>Gửi link đặt lại</Submit>
    </form><BackToLogin />
  </AuthLayout>;
}
export function ResetPage({ tokenVault }) {
  const token = useRef(tokenVault.read());
  const [invalid, setInvalid] = useState(() => !tokenVault.read());
  const [success, setSuccess] = useState(false);
  const auth = useAuth();
  useEffect(() => { tokenVault.clear(); }, [tokenVault]);
  const form = useForm('reset', async (values, signal) => {
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token: token.current, new_password: values.password }, signal });
      token.current = null;
      if (signal.aborted) return;
      auth.clearSession(); setSuccess(true);
    } catch (error) {
      if (error.code === 'INVALID_RESET_TOKEN') {
        token.current = null;
        if (!signal.aborted) setInvalid(true);
      }
      throw error;
    }
  });
  if (success) return <AuthLayout title="Đặt lại mật khẩu thành công!" subtitle="Bạn có thể đăng nhập bằng mật khẩu mới." icon="success" className="success-state">
    <Link className="primary" to="/login">Đăng nhập ngay</Link>
  </AuthLayout>;
  return <AuthLayout title="Đặt lại mật khẩu" subtitle="Nhập mật khẩu mới cho tài khoản của bạn">
    {invalid ? <><Notice>Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.</Notice><Link className="primary" to="/forgot-password">Yêu cầu liên kết mới</Link><BackToLogin /></>
      : <form onSubmit={form.submit} noValidate aria-busy={form.pending}>
        <Field {...form.field('password')} label="Mật khẩu mới" password autoComplete="new-password" placeholder="Nhập mật khẩu mới" />
        <Field {...form.field('confirm')} label="Xác nhận mật khẩu" password autoComplete="new-password" placeholder="Nhập lại mật khẩu" />
        <p className="password-hint">{passwordHint}</p>
        <Notice>{form.error}</Notice><Submit pending={form.pending}>Đặt lại mật khẩu</Submit>
      </form>}
  </AuthLayout>;
}
