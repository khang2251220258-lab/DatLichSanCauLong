import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { AppRoutes } from '../src/routes/AppRoutes';

const now = '2026-10-09T01:00:00.000Z';
const owner = { id: '10', full_name: 'Owner Fixture', capabilities: ['CUSTOMER','OWNER'] };
const facility = { id: '30', name: 'Cơ sở Fixture', status: 'ACTIVE' };
const image = (id, order) => ({ id: String(id), facility_id: '30', url: `https://images.example.invalid/${id}.jpg`, sort_order: order, created_at: now, updated_at: now });
const amenity = (id, name, active = true) => ({ id: String(id), name, is_active: active, created_at: now, updated_at: now });
const ok = (data, status = 200) => new Response(JSON.stringify({ data, meta: { server_time: now } }), { status });
function transport(overrides = {}) {
  const calls = []; let images = overrides.images ?? [image(1, 0), image(2, 1)], assigned = overrides.assigned ?? [amenity(11, 'Wi-Fi')];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = new URL(url).pathname; calls.push({ path, options });
    if (path.endsWith('/auth/session')) return ok({ user: owner, csrf_token: 'c'.repeat(64) });
    if (path === '/api/v1/owner/facilities/30' && options.method === 'GET') return ok(overrides.facility || facility);
    if (path === '/api/v1/owner/amenities' && options.method === 'GET') return ok(overrides.catalog ?? [amenity(11, 'Wi-Fi'), amenity(12, 'Bãi đỗ xe')]);
    if (path === '/api/v1/owner/facilities/30/amenities' && options.method === 'GET') return overrides.badAmenities ? ok([{ id: '11', name: 'Wi-Fi', image_path: 'private' }]) : ok(assigned);
    if (path === '/api/v1/owner/facilities/30/amenities' && options.method === 'PUT') { const ids = JSON.parse(options.body).amenity_ids; assigned = (overrides.catalog ?? [amenity(11, 'Wi-Fi'), amenity(12, 'Bãi đỗ xe')]).filter(item => ids.includes(item.id)); return ok(assigned); }
    if (path === '/api/v1/owner/facilities/30/images' && options.method === 'GET') return overrides.badImages ? ok([{ ...image(1, 0), image_path: 'secret' }]) : ok(images);
    if (path === '/api/v1/owner/facilities/30/images' && options.method === 'POST') { const created = image(3, images.length); images = [...images, created]; return ok(created, 201); }
    if (path === '/api/v1/owner/facilities/30/images/order' && options.method === 'PUT') { const ids = JSON.parse(options.body).image_ids; images = ids.map((id, index) => ({ ...images.find(item => item.id === id), sort_order: index })); return ok(images); }
    if (path.endsWith('/images/1') && options.method === 'DELETE') { images = images.filter(item => item.id !== '1').map((item, index) => ({ ...item, sort_order: index })); return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected ${options.method} ${path}`);
  })); return calls;
}
function mount() { return render(<MemoryRouter initialEntries={['/owner/facilities/30/images-amenities']}><AuthProvider><AppRoutes/></AuthProvider></MemoryRouter>); }

it('renders real images, cover, amenities and shared facility navigation', async () => {
  transport(); mount();
  expect(await screen.findByRole('heading', { name: 'Cơ sở Fixture' })).toBeTruthy();
  expect(screen.getByText('Ảnh đại diện')).toBeTruthy();
  expect(screen.getByLabelText('Cấu hình cơ sở').querySelectorAll('a')).toHaveLength(6);
  expect(screen.getByRole('link', { name: 'Hình ảnh & tiện ích' }).getAttribute('aria-current')).toBe('page');
  await waitFor(() => expect(screen.getByLabelText('Wi-Fi').checked).toBe(true));
});

it('uploads one valid image with multipart and rejects invalid input locally', async () => {
  const calls = transport(); mount(); await screen.findByText('2/10 ảnh');
  const invalid = new File(['x'], 'bad.gif', { type: 'image/gif' });
  fireEvent.change(screen.getByLabelText('Chọn ảnh cơ sở'), { target: { files: [invalid] } });
  expect((await screen.findByRole('alert')).textContent).toMatch(/JPEG, PNG hoặc WebP/);
  const valid = new File(['png'], 'court.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Chọn ảnh cơ sở'), { target: { files: [valid] } });
  fireEvent.click(screen.getByRole('button', { name: 'Tải ảnh lên' }));
  await screen.findByText('3/10 ảnh');
  const call = calls.find(row => row.options.method === 'POST');
  expect(call.options.body).toBeInstanceOf(FormData); expect(call.options.body.get('image')).toBe(valid);
});

it('reorders with a full ID list and updates the authoritative cover', async () => {
  const calls = transport(); mount(); await screen.findByText('Ảnh đại diện');
  fireEvent.click(screen.getByLabelText('Chuyển ảnh 2 sang trái'));
  await waitFor(() => expect(JSON.parse(calls.find(row => row.path.endsWith('/images/order')).options.body).image_ids).toEqual(['2','1']));
  expect(screen.getByAltText('Ảnh cơ sở 1').getAttribute('src')).toContain('/2.jpg');
});

it('uses accessible delete confirmation then refetches compacted images', async () => {
  const calls = transport(); mount(); await screen.findByText('2/10 ảnh');
  fireEvent.click(screen.getByLabelText('Xóa ảnh 1'));
  expect(screen.getByRole('dialog').textContent).toContain('Xóa ảnh cơ sở?');
  fireEvent.click(screen.getByRole('button', { name: 'Xóa ảnh' }));
  await screen.findByText('1/10 ảnh');
  expect(calls.some(row => row.options.method === 'DELETE')).toBe(true);
});

it('replace-all saves selected active amenities with CSRF', async () => {
  const calls = transport(); mount(); await screen.findByLabelText('Bãi đỗ xe');
  fireEvent.click(screen.getByLabelText('Bãi đỗ xe'));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu tiện ích' }));
  await screen.findByText('Đã lưu tiện ích của cơ sở.');
  const call = calls.find(row => row.path.endsWith('/amenities') && row.options.method === 'PUT');
  expect(JSON.parse(call.options.body).amenity_ids).toEqual(['11','12']);
  expect(call.options.headers['X-CSRF-Token']).toBe('c'.repeat(64));
});

it('preserves inactive assignment until Owner explicitly removes it', async () => {
  const inactive = amenity(13, 'Tiện ích cũ', false), calls = transport({ assigned: [amenity(11, 'Wi-Fi'), inactive] }); mount();
  const old = await screen.findByLabelText(/Tiện ích cũ/); await waitFor(() => expect(old.checked).toBe(true));
  fireEvent.click(screen.getByLabelText('Bãi đỗ xe'));
  expect(screen.getByRole('button', { name: 'Lưu tiện ích' }).disabled).toBe(true);
  fireEvent.click(old); expect(screen.getByRole('button', { name: 'Lưu tiện ích' }).disabled).toBe(false);
  expect(calls.some(row => row.options.method === 'PUT')).toBe(false);
});

it('PENDING Facility is read-only and max ten images hides upload', async () => {
  const calls = transport({ facility: { ...facility, status: 'PENDING' }, images: Array.from({ length: 10 }, (_, i) => image(i + 1, i)) }); mount();
  expect(await screen.findByText(/chỉ có thể xem/)).toBeTruthy();
  expect(screen.queryByLabelText('Chọn ảnh cơ sở')).toBeNull();
  expect(screen.getByLabelText('Xóa ảnh 1').disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Lưu tiện ích' })).toBeNull();
  expect(calls.every(row => !['POST','PUT','DELETE'].includes(row.options.method))).toBe(true);
});

it.each([{ badImages: true }, { badAmenities: true }])('fails closed on malformed presentation response', async override => {
  transport(override); mount(); expect((await screen.findByRole('alert')).textContent).toMatch(/Dữ liệu máy chủ/);
  expect(screen.queryByRole('button', { name: 'Tải ảnh lên' })).toBeNull();
});
