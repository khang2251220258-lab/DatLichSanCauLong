import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { AppRoutes } from '../src/routes/AppRoutes';

const now = '2026-10-08T01:00:00.000Z';
const expiry = '2026-10-08T01:05:00.000Z';
const owner = { id: '10', full_name: 'Owner Fixture', capabilities: ['CUSTOMER','OWNER'] };
const facility = { id: '30', name: 'Cơ sở Fixture', status: 'ACTIVE' };
const bank = { bank_name: 'Fixture Bank', account_number: '001234', account_holder: 'NGUYEN VAN A', has_qr_image: false, qr_image_url: null, qr_image_expires_at: null };
const ok = (data, meta = {}, status = 200) => new Response(JSON.stringify({ data, meta: { server_time: now, ...meta } }), { status });
function transport(overrides = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = new URL(url).pathname; calls.push({ path, options });
    if (path.endsWith('/auth/session')) return ok({ user: owner, csrf_token: 'c'.repeat(64) });
    if (path === '/api/v1/owner/facilities/30' && options.method === 'GET') return ok(overrides.facility || facility);
    if (path === '/api/v1/owner/facilities/30/bank-account' && options.method === 'GET') return overrides.read?.() || ok(overrides.bank === undefined ? bank : overrides.bank);
    if (path === '/api/v1/owner/facilities/30/bank-account' && options.method === 'PUT') return ok(bank);
    if (path === '/api/v1/owner/facilities/30/bank-account/qr' && options.method === 'POST') return ok({ ...bank, has_qr_image: true, qr_image_url: 'https://private.example.invalid/qr', qr_image_expires_at: expiry });
    if (path === '/api/v1/owner/facilities/30/bank-account/qr' && options.method === 'DELETE') return ok(bank);
    throw new Error(`Unexpected ${options.method} ${path}`);
  }));
  return calls;
}
function mount() { return render(<MemoryRouter initialEntries={['/owner/facilities/30/bank-account']}><AuthProvider><AppRoutes/></AuthProvider></MemoryRouter>); }

it('loads safe bank data and saves exact text fields with CSRF', async () => {
  const calls = transport(); mount();
  expect(await screen.findByDisplayValue('Fixture Bank')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Ngân hàng'), { target: { value: ' New Bank ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  await waitFor(() => expect(calls.some(call => call.options.method === 'PUT')).toBe(true));
  const request = calls.find(call => call.options.method === 'PUT');
  expect(JSON.parse(request.options.body)).toEqual({ bank_name: 'New Bank', account_number: '001234', account_holder: 'NGUYEN VAN A' });
  expect(request.options.headers['X-CSRF-Token']).toBe('c'.repeat(64));
  expect(JSON.stringify(request)).not.toContain('qr_image_path');
});

it('renders empty account/QR state and validates text without mutation', async () => {
  const calls = transport({ bank: null }); mount();
  expect(await screen.findByText('Chưa có mã QR')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  expect(await screen.findAllByRole('alert')).toHaveLength(3);
  expect(calls.some(call => call.options.method === 'PUT')).toBe(false);
});

it('previews and uploads one valid image through multipart without exposing storage path', async () => {
  const calls = transport(); mount(); await screen.findByDisplayValue('Fixture Bank');
  const image = new File([new Uint8Array([137,80,78,71])], 'qr.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Chọn ảnh QR'), { target: { files: [image] } });
  expect(await screen.findByAltText('Xem trước mã QR mới')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ảnh QR' }));
  await waitFor(() => expect(calls.some(call => call.options.method === 'POST')).toBe(true));
  const request = calls.find(call => call.options.method === 'POST');
  expect(request.options.body).toBeInstanceOf(FormData);
  expect(request.options.body.get('image')).toBe(image);
  expect(request.options.headers['Content-Type']).toBeUndefined();
});

it('rejects invalid file locally and blocks mutations for PENDING Facility', async () => {
  const calls = transport({ facility: { ...facility, status: 'PENDING' } }); mount();
  await screen.findByText(/chỉ có thể xem cấu hình/i);
  expect(screen.getByRole('button', { name: 'Lưu thay đổi' }).disabled).toBe(true);
  expect(screen.getByLabelText('Chọn ảnh QR').disabled).toBe(true);
  expect(calls.every(call => !['POST','PUT','DELETE'].includes(call.options.method))).toBe(true);
});

it('shows private QR, confirms deletion and refreshes a failed URL at most once', async () => {
  let reads = 0;
  const current = { ...bank, has_qr_image: true, qr_image_url: 'https://private.example.invalid/qr', qr_image_expires_at: expiry };
  const calls = transport({ read: () => { reads++; return ok(current); } }); mount();
  const image = await screen.findByAltText('Mã QR tài khoản nhận cọc');
  fireEvent.error(image); fireEvent.error(image);
  await waitFor(() => expect(reads).toBe(2));
  fireEvent.click(screen.getByRole('button', { name: 'Xóa mã QR' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
  await waitFor(() => expect(calls.some(call => call.options.method === 'DELETE')).toBe(true));
});

it('fails closed on malformed owner bank response', async () => {
  transport({ read: () => ok({ ...bank, qr_image_path: 'secret/path' }) }); mount();
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByDisplayValue('Fixture Bank')).toBeNull();
});
