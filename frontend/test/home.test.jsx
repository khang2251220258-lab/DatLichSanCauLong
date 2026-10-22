import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { AppRoutes } from '../src/routes/AppRoutes';
import districts from '../src/generated/districts.json';

const ok = data => new Response(JSON.stringify({ data, meta: { server_time: '2026-10-21T00:00:00Z' } }), { status: 200 });
function setup({ capabilities = null, sessionFailure = false } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    const parsed = new URL(url);
    calls.push(parsed);
    expect(options.method).toBe('GET');
    if (parsed.pathname.endsWith('/auth/session')) {
      return Promise.resolve(sessionFailure
        ? new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }), { status: 503 })
        : capabilities ? ok({ user: { full_name: 'Tên thật fixture', capabilities }, csrf_token: 'test' })
          : new Response(JSON.stringify({ error: { code: 'SESSION_EXPIRED' } }), { status: 401 }));
    }
    return Promise.reject(new Error('Home must not fetch facility showcase data.'));
  }));
  return calls;
}
function Location() {
  const location = useLocation();
  return <output data-testid="home-location">{location.pathname + location.search}</output>;
}
function mount() {
  render(<MemoryRouter initialEntries={['/']}><AuthProvider><Location /><AppRoutes /></AuthProvider></MemoryRouter>);
}

it('renders a search-first Home without promotional facility requests or sections', async () => {
  const calls = setup();
  mount();
  await screen.findByRole('heading', { name: /Tìm sân cầu lông/i });
  expect(screen.getByLabelText('Tên sân hoặc cơ sở')).toBeTruthy();
  expect(screen.getByLabelText('Khu vực')).toBeTruthy();
  expect(screen.getByLabelText('Ngày chơi')).toBeTruthy();
  expect(screen.getByLabelText('Giờ bắt đầu')).toBeTruthy();
  expect(screen.getByLabelText('Giờ kết thúc')).toBeTruthy();
  expect(calls.filter(call => call.pathname.endsWith('/facilities'))).toHaveLength(0);
  expect(screen.queryByRole('heading', { name: 'Sân cầu lông tại Đà Nẵng' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Cách đặt sân' })).toBeNull();
  expect(screen.queryByRole('heading', { name: /Vì sao nên dùng/i })).toBeNull();
  expect(screen.queryByText('DÀNH CHO CHỦ SÂN')).toBeNull();
  const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
  expect(within(nav).getByText('Trang chủ').getAttribute('aria-current')).toBe('page');
});

it('submits normalized supported query parameters into the existing Facility List route', async () => {
  setup();
  mount();
  await screen.findByRole('heading', { name: /Tìm sân cầu lông/i });
  fireEvent.change(screen.getByLabelText('Tên sân hoặc cơ sở'), { target: { value: '  Sân A  ' } });
  fireEvent.change(screen.getByLabelText('Khu vực'), { target: { value: districts[25] } });
  fireEvent.change(screen.getByLabelText('Ngày chơi'), { target: { value: '2026-10-25' } });
  fireEvent.change(screen.getByLabelText('Giờ bắt đầu'), { target: { value: '18:00' } });
  fireEvent.change(screen.getByLabelText('Giờ kết thúc'), { target: { value: '19:00' } });
  fireEvent.click(screen.getByRole('button', { name: /Tìm sân/i }));
  await waitFor(() => {
    const location = new URL(screen.getByTestId('home-location').textContent, 'http://app.local');
    expect(location.pathname).toBe('/facilities');
    expect(location.searchParams.get('q')).toBe('Sân A');
    expect(location.searchParams.get('district')).toBe(districts[25]);
    expect(location.searchParams.get('date')).toBe('2026-10-25');
    expect(location.searchParams.get('start_time')).toBe('18:00');
    expect(location.searchParams.get('end_time')).toBe('19:00');
  });
});

it('supports Enter submit and omits empty keyword and district values', async () => {
  setup();
  mount();
  await screen.findByRole('heading', { name: /Tìm sân cầu lông/i });
  fireEvent.submit(screen.getByRole('button', { name: /Tìm sân/i }).closest('form'));
  await waitFor(() => {
    const location = new URL(screen.getByTestId('home-location').textContent, 'http://app.local');
    expect(location.pathname).toBe('/facilities');
    expect(location.searchParams.has('q')).toBe(false);
    expect(location.searchParams.has('district')).toBe(false);
    expect(location.searchParams.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

it('rejects an invalid time range before navigation', async () => {
  setup();
  mount();
  await screen.findByRole('heading', { name: /Tìm sân cầu lông/i });
  fireEvent.change(screen.getByLabelText('Giờ kết thúc'), { target: { value: '18:00' } });
  fireEvent.click(screen.getByRole('button', { name: /Tìm sân/i }));
  expect((await screen.findByRole('alert')).textContent).toContain('30 phút');
  expect(screen.getByTestId('home-location').textContent).toBe('/');
});

it('uses canonical district quick filters and preserves public header session states', async () => {
  setup({ sessionFailure: true });
  mount();
  await screen.findByRole('heading', { name: /Tìm sân cầu lông/i });
  const link = screen.getByRole('link', { name: districts[4] });
  expect(link.getAttribute('href')).toBe('/facilities?' + new URLSearchParams({ district: districts[4] }));
  fireEvent.click(link);
  await waitFor(() => expect(screen.getByTestId('home-location').textContent).toBe('/facilities?' + new URLSearchParams({ district: districts[4] })));
  expect(screen.getByText('Chưa thể kiểm tra phiên')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();
});
