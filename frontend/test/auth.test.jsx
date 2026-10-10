import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { useAuth } from '../src/features/auth/useAuth';
import { AppRoutes } from '../src/routes/AppRoutes';
import { RequireAuth } from '../src/features/auth/guards';
import { captureResetToken } from '../src/features/auth/resetToken';
import { api, ApiError } from '../src/services/api';
const user = { id: '1', full_name: 'Test', capabilities: ['CUSTOMER'], has_local_password: true };
const session = { user, csrf_token: 'a'.repeat(64) };
const response = (status, data, code) => new Response(status === 204 ? null : JSON.stringify(code ? { error: { code } } : { data }), { status, headers: { 'Content-Type': 'application/json' } });
const guest = () => response(401, null, 'SESSION_EXPIRED');
function mockFetch(handler) {
  const mock = vi.fn(async (url, options) => {
    expect(options.credentials).toBe('include');
    if (new URL(url).pathname === '/api/v1/facilities') return response(200, []);
    return handler(new URL(url).pathname, options);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
function Probe() {
  const auth = useAuth();
  return <><output data-testid="auth">{auth.status}</output><button onClick={() => void auth.refresh()}>Refresh session</button><button onClick={() => void auth.request('/auth/logout', { method: 'POST' })}>Protected request</button></>;
}
function mount(path = '/login', vault = { read: () => null, clear() {} }) {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}><AuthProvider><Location /><Probe /><AppRoutes tokenVault={vault} /></AuthProvider></MemoryRouter></StrictMode>);
}
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
async function loginInputs() {
  await screen.findByLabelText('Email');
  fill('Email', ' Test@Example.com ');
  fill('Mật khẩu', 'Password123');
}
describe('Auth UI with mocked HTTP transport only', () => {
  it('bootstrap authenticated redirects login to existing root', async () => {
    mockFetch(() => response(200, session)); mount();
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    expect(screen.getByTestId('auth').textContent).toBe('authenticated');
  });
  it.each([503, 'network'])('bootstrap %s stays error, retry can become guest', async failure => {
    let failed = true;
    mockFetch(() => { if (failed) { if (failure === 'network') throw new TypeError('offline'); return response(503, null, 'SERVICE_UNAVAILABLE'); } return guest(); });
    mount(); await screen.findByText('Chưa thể kiểm tra phiên');
    expect(screen.getByTestId('auth').textContent).toBe('error');
    failed = false; fireEvent.click(screen.getByText('Thử lại'));
    await screen.findByLabelText('Email'); expect(screen.getByTestId('auth').textContent).toBe('guest');
  });
  it('login posts normalized fields once, preserves password and redirects', async () => {
    let finish;
    const fetch = mockFetch((path, options) => path.endsWith('/session') ? guest() : new Promise(resolve => {
      expect(JSON.parse(options.body)).toEqual({ email: 'test@example.com', password: 'Password123' });
      finish = () => resolve(response(200, session));
    }));
    mount(); await loginInputs();
    const form = screen.getByLabelText('Email').closest('form');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(screen.getByRole('button', { name: 'Đang xử lý…' }).disabled).toBe(true);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/login'))).toHaveLength(1);
    await act(async () => finish());
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  });
  it('login invalid credentials stay inline, password toggle works, navigation links work', async () => {
    mockFetch(path => path.endsWith('/session') ? guest() : response(401, null, 'INVALID_CREDENTIALS'));
    mount(); await loginInputs();
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(screen.getByLabelText('Mật khẩu').type).toBe('text');
    fireEvent.submit(screen.getByLabelText('Email').closest('form'));
    await screen.findByText('Email hoặc mật khẩu không đúng.');
    fireEvent.click(screen.getByText('Quên mật khẩu?'));
    expect(screen.getByTestId('location').textContent).toBe('/forgot-password');
    fireEvent.click(screen.getByText('← Quay lại đăng nhập'));
    await screen.findByText('Đăng ký ngay');
    fireEvent.click(screen.getByText('Đăng ký ngay'));
    expect(screen.getByTestId('location').textContent).toBe('/register');
  });
  it('register sends only backend fields, no auto-login, notice on login', async () => {
    const fetch = mockFetch((path, options) => {
      if (path.endsWith('/session')) return guest();
      expect(path).toBe('/api/v1/auth/register');
      expect(JSON.parse(options.body)).toEqual({ full_name: 'Test User', email: 'test@example.com', password: 'Password123' });
      return response(201, { user });
    });
    mount('/register'); await screen.findByLabelText('Họ và tên');
    expect(screen.queryByLabelText('Số điện thoại')).toBeNull();
    expect(screen.queryByText('Tiếp tục với Google')).toBeNull();
    fill('Họ và tên', ' Test User '); fill('Email', 'Test@Example.com'); fill('Mật khẩu', 'Password123');
    fireEvent.submit(screen.getByLabelText('Email').closest('form'));
    await screen.findByText('Đăng ký thành công. Vui lòng đăng nhập.');
    expect(screen.getByTestId('location').textContent).toBe('/login');
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/login'))).toBe(false);
    expect(screen.getByTestId('auth').textContent).toBe('guest');
  });
  it('invalid registration password does not call API', async () => {
    const fetch = mockFetch(() => guest()); mount('/register'); await screen.findByLabelText('Họ và tên');
    fill('Họ và tên', 'User'); fill('Email', 'test@example.com'); fill('Mật khẩu', 'short1');
    fireEvent.submit(screen.getByLabelText('Email').closest('form'));
    expect(screen.getByLabelText('Mật khẩu').getAttribute('aria-invalid')).toBe('true');
    expect(fetch.mock.calls.every(([url]) => url.endsWith('/session'))).toBe(true);
  });
  it('forgot generic success stays on route; does not claim delivery or reflect recipient', async () => {
    mockFetch((path, options) => {
      if (path.endsWith('/session')) return guest();
      expect(JSON.parse(options.body)).toEqual({ email: 'unknown@example.invalid' });
      return response(202, { message: 'Generic backend message' });
    });
    mount('/forgot-password'); await screen.findByLabelText('Email'); fill('Email', 'unknown@example.invalid');
    fireEvent.submit(screen.getByLabelText('Email').closest('form'));
    await screen.findByText('Đã nhận yêu cầu!');
    expect(screen.getByText(/Nếu tài khoản đủ điều kiện/)).toBeTruthy();
    expect(screen.queryByText('Đã gửi email!')).toBeNull();
    expect(document.body.textContent).not.toContain('unknown@example.invalid');
    expect(screen.getByTestId('location').textContent).toBe('/forgot-password');
  });
  it('forgot failure stays in form; no fake success', async () => {
    mockFetch(path => path.endsWith('/session') ? guest() : response(429, null, 'RATE_LIMITED'));
    mount('/forgot-password'); await screen.findByLabelText('Email'); fill('Email', 'test@example.com');
    fireEvent.submit(screen.getByLabelText('Email').closest('form'));
    await screen.findByText(/Bạn đã thử quá nhiều lần/);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.queryByText('Đã nhận yêu cầu!')).toBeNull();
  });
  it('reset strips fragment before router, survives StrictMode and posts only required fields', async () => {
    window.history.replaceState(null, '', '/reset-password#token=test-reset-token');
    const vault = captureResetToken();
    expect(window.location.hash).toBe('');
    mockFetch((path, options) => {
      if (path.endsWith('/session')) return guest();
      expect(JSON.parse(options.body)).toEqual({ token: 'test-reset-token', new_password: 'NewPassword123' });
      return response(200, { message: 'OK' });
    });
    render(<StrictMode><BrowserRouter><AuthProvider><AppRoutes tokenVault={vault} /></AuthProvider></BrowserRouter></StrictMode>);
    expect(vault.read()).toBeNull();
    fill('Mật khẩu mới', 'NewPassword123'); fill('Xác nhận mật khẩu', 'NewPassword123');
    fireEvent.submit(screen.getByLabelText('Mật khẩu mới').closest('form'));
    await screen.findByText('Đặt lại mật khẩu thành công!');
    expect(window.location.pathname).toBe('/reset-password');
    expect(document.body.innerHTML).not.toContain('test-reset-token');
    fireEvent.click(screen.getByText('Đăng nhập ngay'));
    await screen.findByLabelText('Email');
    expect(window.location.pathname).toBe('/login');
  });
  it.each(['missing', 'expired'])('reset %s token presents safe recovery', async mode => {
    mockFetch(path => path.endsWith('/session') ? guest() : response(422, null, 'INVALID_RESET_TOKEN'));
    mount('/reset-password', { read: () => mode === 'missing' ? null : 'old-token', clear() {} });
    if (mode === 'expired') {
      fill('Mật khẩu mới', 'Password123'); fill('Xác nhận mật khẩu', 'Password123');
      fireEvent.submit(screen.getByLabelText('Mật khẩu mới').closest('form'));
    }
    await screen.findByText('Yêu cầu liên kết mới');
    expect(screen.queryByLabelText('Mật khẩu mới')).toBeNull();
  });
  it('reset confirm mismatch blocks request, network error permits deliberate retry', async () => {
    const fetch = mockFetch(path => { if (path.endsWith('/session')) return guest(); throw new TypeError('offline'); });
    mount('/reset-password', { read: () => 'token', clear() {} });
    fill('Mật khẩu mới', 'Password123'); fill('Xác nhận mật khẩu', 'Other1234');
    fireEvent.submit(screen.getByLabelText('Mật khẩu mới').closest('form'));
    await screen.findByText('Mật khẩu xác nhận chưa khớp.');
    expect(fetch.mock.calls.every(([url]) => url.endsWith('/session'))).toBe(true);
    fill('Xác nhận mật khẩu', 'Password123');
    fireEvent.submit(screen.getByLabelText('Mật khẩu mới').closest('form'));
    await screen.findByText(/Không thể kết nối máy chủ/);
    expect(screen.getByLabelText('Mật khẩu mới')).toBeTruthy();
  });
  it('authenticated mutation attaches CSRF; 204 is supported', async () => {
    mockFetch((path, options) => {
      if (path.endsWith('/session')) return response(200, session);
      expect(options.headers['X-CSRF-Token']).toBe(session.csrf_token);
      return response(204);
    });
    mount('/'); await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('authenticated'));
    fireEvent.click(screen.getByText('Protected request'));
    await waitFor(() => expect(globalThis.fetch.mock.calls.filter(([url]) => new URL(url).pathname.startsWith('/api/v1/auth/'))).toHaveLength(3)); // StrictMode bootstrap twice + mutation; Home reads are independent.
  });
  it.each([['CUSTOMER', ['CUSTOMER', 'OWNER'], true], ['OWNER', ['ADMIN'], false]])('capability guard %s checks backend capabilities', async (capability, capabilities, allowed) => {
    mockFetch(() => response(200, { ...session, user: { ...user, capabilities } }));
    render(<MemoryRouter><AuthProvider><RequireAuth capability={capability}><p>Protected content</p></RequireAuth></AuthProvider></MemoryRouter>);
    await screen.findByText(allowed ? 'Protected content' : 'Không có quyền truy cập');
  });
  it('guest guard redirects to login', async () => {
    mockFetch(() => guest());
    render(<MemoryRouter initialEntries={['/private']}><AuthProvider><Routes><Route path="/private" element={<RequireAuth><p>Secret</p></RequireAuth>} /><Route path="/login" element={<p>Login destination</p>} /></Routes></AuthProvider></MemoryRouter>);
    await screen.findByText('Login destination'); expect(screen.queryByText('Secret')).toBeNull();
  });
  it.each([
    ['/bookings',['CUSTOMER']],
    ['/owner/facilities',['CUSTOMER','OWNER']],
    ['/admin/facilities',['ADMIN']],
  ])('login restores safe protected destination %s',async(destination,capabilities)=>{
    let authenticated=false;
    mockFetch((path)=>{
      if(path.endsWith('/session'))return guest();
      if(path.endsWith('/login')){authenticated=true;return response(200,{...session,user:{...user,capabilities}});}
      if(authenticated&&path.includes('/bookings'))return new Response(JSON.stringify({data:[],meta:{page:1,page_size:20,total:0,server_time:'2026-10-07T00:00:00Z'}}),{status:200});
      if(authenticated&&path.includes('/facilities'))return new Response(JSON.stringify({data:[],meta:{page:1,page_size:20,total:0}}),{status:200});
      throw new Error('Unexpected '+path);
    });
    mount(destination);await loginInputs();fireEvent.submit(screen.getByLabelText('Email').closest('form'));
    await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe(destination));
  });
  it('restored Owner destination cannot bypass capability guard',async()=>{mockFetch(path=>path.endsWith('/session')?guest():path.endsWith('/login')?response(200,session):response(200,[],null));mount('/owner/facilities');await loginInputs();fireEvent.submit(screen.getByLabelText('Email').closest('form'));expect(await screen.findByText('Không có quyền truy cập')).toBeTruthy();expect(screen.getByTestId('location').textContent).toBe('/owner/facilities');});
  it.each(['https://evil.example','//evil.example','javascript:alert(1)','data:text/html,bad'])('unsafe return destination %s falls back to root',async from=>{mockFetch(path=>path.endsWith('/session')?guest():path.endsWith('/login')?response(200,session):response(200,[]));render(<MemoryRouter initialEntries={[{pathname:'/login',state:{from}}]}><AuthProvider><Location/><AppRoutes/></AuthProvider></MemoryRouter>);await loginInputs();fireEvent.submit(screen.getByLabelText('Email').closest('form'));await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/'));});
  it('protected route waits for bootstrap before redirecting',async()=>{let finish;mockFetch(path=>path.endsWith('/session')?new Promise(resolve=>{finish=()=>resolve(response(200,session));}):response(200,[]));render(<MemoryRouter initialEntries={['/bookings']}><AuthProvider><Location/><AppRoutes/></AuthProvider></MemoryRouter>);expect(screen.getByText('Đang kiểm tra phiên')).toBeTruthy();expect(screen.getByTestId('location').textContent).toBe('/bookings');await act(async()=>finish());await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/bookings'));});
  it.each(['/login','/register','/forgot-password'])('authenticated user is redirected away from %s',async path=>{mockFetch(()=>response(200,session));mount(path);await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/'));});
  it('authenticated reset-password preserves token-driven route',async()=>{mockFetch(()=>response(200,session));mount('/reset-password',{read:()=> 'reset-token',clear(){}});expect(await screen.findByLabelText('Mật khẩu mới')).toBeTruthy();expect(screen.getByTestId('location').textContent).toBe('/reset-password');});
});
describe('API boundary', () => {
  it('rejects 5xx and malformed success without exposing server body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(500, null, 'INTERNAL_ERROR')).mockResolvedValueOnce(new Response('html', { status: 200 })));
    await expect(api('/auth/session')).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    await expect(api('/auth/session')).rejects.toBeInstanceOf(ApiError);
  });
  it('missing API config fails clearly, without a relative fallback request', async () => {
    vi.stubEnv('VITE_API_BASE_URL', ''); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(api('/auth/session')).rejects.toMatchObject({ code: 'API_NOT_CONFIGURED' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('duplicate reset token is rejected and fragment removed', () => {
    window.history.replaceState(null, '', '/reset-password#token=one&token=two');
    const vault = captureResetToken(); expect(vault.read()).toBeNull(); expect(window.location.hash).toBe('');
  });
});
