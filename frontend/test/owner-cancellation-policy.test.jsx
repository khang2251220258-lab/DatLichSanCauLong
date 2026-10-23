import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { AppRoutes } from '../src/routes/AppRoutes';

const now = '2026-10-09T02:00:00.000Z';
const owner = { id: '10', full_name: 'Owner Fixture', capabilities: ['CUSTOMER','OWNER'] };
const facility = { id: '30', name: 'Cơ sở Fixture', address: '30 Bạch Đằng, Đà Nẵng', status: 'ACTIVE' };
const policy = cutoff_hours => ({ id: '7', facility_id: '30', cutoff_hours, created_at: now, updated_at: now });
const ok = data => new Response(JSON.stringify({ data, meta: { server_time: now } }), { status: 200 });
const fail = (status, code) => new Response(JSON.stringify({ error: { code }, meta: { server_time: now } }), { status });

function transport(overrides = {}) {
  const calls = []; let currentFacility = overrides.facility || facility;
  let currentPolicy = Object.hasOwn(overrides, 'policy') ? overrides.policy : policy(24), policyReads = 0, facilityReads = 0;
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = new URL(url).pathname; calls.push({ path, options });
    if (path.endsWith('/auth/session')) return ok({ user: overrides.user || owner, csrf_token: 'c'.repeat(64) });
    if (path === '/api/v1/owner/facilities/30' && options.method === 'GET') {
      facilityReads++;
      if (overrides.facilityRead) return overrides.facilityRead({ count: facilityReads, set: value => { currentFacility = value; } });
      return ok(currentFacility);
    }
    if (path === '/api/v1/owner/facilities/30/cancellation-policy' && options.method === 'GET') {
      policyReads++;
      if (overrides.policyRead) return overrides.policyRead({ count: policyReads, policy: currentPolicy });
      return ok(currentPolicy);
    }
    if (path === '/api/v1/owner/facilities/30/cancellation-policy' && options.method === 'PUT') {
      const body = JSON.parse(options.body);
      if (overrides.put) return overrides.put({ body, setFacility: value => { currentFacility = value; }, setPolicy: value => { currentPolicy = value; } });
      currentPolicy = policy(body.cutoff_hours); return ok(currentPolicy);
    }
    throw new Error(`Unexpected ${options.method} ${path}`);
  }));
  return calls;
}
function mount() { return render(<MemoryRouter initialEntries={['/owner/facilities/30/cancellation-policy']}><AuthProvider><AppRoutes/></AuthProvider></MemoryRouter>); }
const putCalls = calls => calls.filter(call => call.options.method === 'PUT');
// The labeled input exists before policy hydration commits its persisted value.
// Wait for that value so a pending hydration effect cannot overwrite a test edit.
const waitForPolicyHydration = value => screen.findByDisplayValue(String(value));

it('renders the approved Facility context, current sidebar, breadcrumb and active six-card hub', async () => {
  transport(); mount();
  expect(await screen.findByRole('heading', { name: 'Cơ sở Fixture' })).toBeTruthy();
  expect(screen.getByText('30 Bạch Đằng, Đà Nẵng')).toBeTruthy();
  expect(screen.getByText('Đang hoạt động')).toBeTruthy();
  expect(screen.getByLabelText('Quản lý chủ sân').querySelectorAll('a')).toHaveLength(3);
  const hub = screen.getByLabelText('Cấu hình cơ sở');
  expect(hub.querySelectorAll('a')).toHaveLength(6);
  expect(screen.getByRole('link', { name: 'Chính sách hủy' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByText('Cơ sở của tôi', { selector: '.oba-breadcrumb a' })).toBeTruthy();
});

it('shows loading until both Facility and policy are known', async () => {
  let release; const delayed = new Promise(resolve => { release = resolve; });
  transport({ policyRead: async () => { await delayed; return ok(policy(24)); } }); mount();
  expect(await screen.findByText('Đang tải dữ liệu…')).toBeTruthy();
  expect(screen.queryByLabelText('Cho phép hủy trước giờ chơi')).toBeNull();
  release(); expect(await screen.findByDisplayValue('24')).toBeTruthy();
});

it('renders an existing policy and updates with an exact numeric body and CSRF', async () => {
  const calls = transport(); mount(); expect(await screen.findByDisplayValue('24')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Cho phép hủy trước giờ chơi'), { target: { value: '36' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));
  expect(await screen.findByText('Đã lưu chính sách hủy.')).toBeTruthy();
  const request = putCalls(calls)[0];
  expect(JSON.parse(request.options.body)).toEqual({ cutoff_hours: 36 });
  expect(request.options.headers['X-CSRF-Token']).toBe('c'.repeat(64));
});

it('renders null as explicitly unconfigured, blank, without default or automatic PUT, then creates', async () => {
  const calls = transport({ policy: null }); mount();
  expect(await screen.findByText('Chưa thiết lập chính sách hủy. Chính sách mới chỉ áp dụng cho các đơn đặt sân được tạo sau khi lưu.')).toBeTruthy();
  const input = screen.getByLabelText('Cho phép hủy trước giờ chơi');
  expect(input.value).toBe(''); expect(input.placeholder).toContain('0 đến 168');
  expect(screen.queryByDisplayValue('24')).toBeNull(); expect(putCalls(calls)).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Lưu chính sách' }).disabled).toBe(true);
  fireEvent.change(input, { target: { value: '12' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));
  await waitFor(() => expect(putCalls(calls)).toHaveLength(1)); expect(JSON.parse(putCalls(calls)[0].options.body)).toEqual({ cutoff_hours: 12 });
});

it.each(['0','1','168'])('accepts boundary cutoff %s', async value => {
  const calls = transport(); mount(); const input = await waitForPolicyHydration(24);
  fireEvent.change(input, { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));
  await waitFor(() => expect(putCalls(calls)).toHaveLength(1)); expect(JSON.parse(putCalls(calls)[0].options.body).cutoff_hours).toBe(Number(value));
});

it.each([
  ['', null], ['-1', /số nguyên/], ['169', /0 đến 168/], ['1.5', /số nguyên/], ['1e2', /số nguyên/], ['abc', null],
])('rejects invalid cutoff %j locally', async (value, message) => {
  const calls = transport(); mount(); const input = await screen.findByDisplayValue('24');
  fireEvent.change(input, { target: { value } });
  const button = screen.getByRole('button', { name: 'Lưu chính sách' });
  if (value === '') expect(button.disabled).toBe(true); else fireEvent.click(button);
  if (message) expect((await screen.findByRole('alert')).textContent).toMatch(message);
  expect(putCalls(calls)).toHaveLength(0);
});

it('blocks double submit while saving', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const calls = transport({ put: async ({ body, setPolicy }) => { await pending; const next = policy(body.cutoff_hours); setPolicy(next); return ok(next); } });
  mount(); const input = await screen.findByDisplayValue('24'); fireEvent.change(input, { target: { value: '30' } });
  const button = screen.getByRole('button', { name: 'Lưu chính sách' }); fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(putCalls(calls)).toHaveLength(1)); expect(screen.getByRole('button', { name: 'Đang lưu…' }).disabled).toBe(true);
  release(); expect(await screen.findByText('Đã lưu chính sách hủy.')).toBeTruthy();
});

it.each([
  { ...policy(24), extra: true }, { ...policy(24), id: '0' }, { ...policy(24), cutoff_hours: 169 }, { ...policy(24), created_at: 'bad' },
])('fails closed on malformed GET policy %#', async malformed => {
  transport({ policy: malformed }); mount(); expect((await screen.findByRole('alert')).textContent).toMatch(/Dữ liệu máy chủ/);
  expect(screen.queryByLabelText('Cho phép hủy trước giờ chơi')).toBeNull();
});

it('fails closed on malformed PUT and never reports success', async () => {
  transport({ put: () => ok({ ...policy(30), secret: 'unexpected' }) }); mount();
  const input = await screen.findByDisplayValue('24'); fireEvent.change(input, { target: { value: '30' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/Dữ liệu máy chủ/); expect(screen.queryByText('Đã lưu chính sách hủy.')).toBeNull();
});

it('shows GET error and retries both resources', async () => {
  transport({ policyRead: ({ count }) => count === 1 ? fail(503, 'SERVICE_UNAVAILABLE') : ok(policy(48)) }); mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' })); expect(await screen.findByDisplayValue('48')).toBeTruthy();
});

it('shows PUT error, clears stale feedback on edit and allows retry', async () => {
  let writes = 0; const calls = transport({ put: ({ body, setPolicy }) => { writes++; if (writes === 1) return fail(422, 'VALIDATION_ERROR'); const next = policy(body.cutoff_hours); setPolicy(next); return ok(next); } });
  mount(); const input = await screen.findByDisplayValue('24'); fireEvent.change(input, { target: { value: '25' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));
  expect(await screen.findByRole('alert')).toBeTruthy(); fireEvent.change(input, { target: { value: '26' } }); expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' })); expect(await screen.findByText('Đã lưu chính sách hủy.')).toBeTruthy(); expect(putCalls(calls)).toHaveLength(2);
});

it('renders initial PENDING as read-only and never sends PUT', async () => {
  const calls = transport({ facility: { ...facility, status: 'PENDING' } }); mount();
  expect(await screen.findByText(/chỉ có thể xem chính sách hủy/)).toBeTruthy();
  expect(screen.getByLabelText('Cho phép hủy trước giờ chơi').disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Lưu chính sách' }).disabled).toBe(true); expect(putCalls(calls)).toHaveLength(0);
});

it('recovers a PUT 409 by refetching authoritative Facility and policy', async () => {
  const calls = transport({ put: ({ setFacility, setPolicy }) => { setFacility({ ...facility, status: 'PENDING' }); setPolicy(policy(72)); return fail(409, 'FACILITY_STATE_NOT_EDITABLE'); } });
  mount(); const input = await screen.findByDisplayValue('24'); fireEvent.change(input, { target: { value: '36' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));
  expect(await screen.findByText(/chỉ có thể xem chính sách hủy/)).toBeTruthy();
  await waitFor(() => expect(screen.getByLabelText('Cho phép hủy trước giờ chơi').value).toBe('72'));
  expect(screen.getByLabelText('Cho phép hủy trước giờ chơi').disabled).toBe(true); expect(putCalls(calls)).toHaveLength(1);
});

it('uses the safe not-found message for cross-owner resources', async () => {
  transport({ facilityRead: () => fail(404, 'RESOURCE_NOT_FOUND') }); mount();
  expect((await screen.findByRole('alert')).textContent).toMatch(/không có quyền truy cập/); expect(screen.queryByLabelText('Cho phép hủy trước giờ chơi')).toBeNull();
});

it('keeps the route protected from users without OWNER capability', async () => {
  transport({ user: { id: '11', full_name: 'Customer', capabilities: ['CUSTOMER'] } }); mount();
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeTruthy();
  expect(screen.queryByLabelText('Cho phép hủy trước giờ chơi')).toBeNull();
});
