import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { AppRoutes } from '../src/routes/AppRoutes';
import districts from '../src/generated/districts.json';
import { supportedDistricts } from '../../backend/src/modules/facilities/districts.js';

const facility = { id:'1', name:'Cơ sở fixture', district:districts[0], address:'Địa chỉ fixture', cover_image_url:null, amenities:[] };
const response = (data=[facility], meta={page:1,page_size:20,total:1}) => new Response(JSON.stringify({data,meta}), {status:200});
function transport(handler=()=>response(), session=null) {
  const calls=[];
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    expect(options.credentials).toBe('include');
    const u=new URL(url);
    if(u.pathname.endsWith('/auth/session')) return Promise.resolve(session ? new Response(JSON.stringify({data:session}),{status:200}) : new Response(JSON.stringify({error:{code:'SESSION_EXPIRED'}}),{status:401}));
    calls.push(u);
    return Promise.resolve(handler(u,options));
  }));
  return calls;
}
function Probe() {
  const location=useLocation(), navigate=useNavigate();
  return <><output data-testid="url">{location.pathname+location.search}</output><button onClick={()=>navigate(-1)}>Back test</button><button onClick={()=>navigate(1)}>Forward test</button></>;
}
function mount(path='/facilities') { return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Probe/><AppRoutes /></AuthProvider></MemoryRouter>); }
const submit=()=>fireEvent.click(screen.getByRole('button',{name:'⌕ Tìm kiếm'}));
it('registry equals canonical 94 nonempty unique names',()=>{
  expect(districts).toEqual(supportedDistricts); expect(districts).toHaveLength(94); expect(new Set(districts).size).toBe(94); expect(districts.every(d=>d.trim()===d&&d.length)).toBe(true);
});
it('renders real DTO, guest header, missing cover, empty amenities and detail link',async()=>{
  transport();mount();
  await screen.findByRole('heading',{name:facility.name});
  expect(screen.getByText('Chưa có ảnh')).toBeTruthy();
  expect(screen.getByRole('list',{name:'Tiện ích'}).children).toHaveLength(0);
  expect(screen.getByRole('link',{name:'Xem chi tiết'}).getAttribute('href')).toBe('/facilities/1');
  expect(screen.getByRole('link',{name:'Đăng nhập'}).getAttribute('href')).toBe('/login');
  expect(screen.queryByText(/Còn sân|rating|80k/)).toBeNull();
});
it('malformed successful list DTO shows retryable error, not empty state',async()=>{transport(()=>new Response(JSON.stringify({data:{},meta:{page:1,page_size:20,total:0}}),{status:200}));mount();expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('Không tìm thấy sân phù hợp')).toBeNull();expect(screen.getByRole('button',{name:'Thử lại'})).toBeTruthy();});
it('restores URL fields, search normalization, district and clears filters',async()=>{
  const calls=transport();mount('/facilities?q=old&district='+encodeURIComponent(districts[1])+'&page=2&page_size=10');
  await screen.findByRole('heading',{name:facility.name});
  expect(screen.getByLabelText('Tên sân').value).toBe('old');expect(screen.getByLabelText('Khu vực').value).toBe(districts[1]);
  fireEvent.change(screen.getByLabelText('Tên sân'),{target:{value:'  mới  '}});
  fireEvent.change(screen.getByLabelText('Khu vực'),{target:{value:districts[2]}});submit();
  await waitFor(()=>expect(calls.at(-1).searchParams.get('q')).toBe('mới'));
  expect(calls.at(-1).searchParams.get('district')).toBe(districts[2]);expect(calls.at(-1).searchParams.get('page')).toBe('1');expect(calls.at(-1).searchParams.get('page_size')).toBe('10');
  fireEvent.click(screen.getByRole('button',{name:'× Xóa bộ lọc'}));
  await waitFor(()=>expect(calls.at(-1).searchParams.has('q')).toBe(false));expect(calls.at(-1).searchParams.has('district')).toBe(false);
});
it('pagination uses meta and Back/Forward restores state',async()=>{
  const calls=transport(u=>response([facility],{page:Number(u.searchParams.get('page')||1),page_size:20,total:21}));mount();
  await screen.findByRole('heading',{name:facility.name});expect(screen.getByRole('button',{name:'Trang trước'}).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Trang sau'}).disabled).toBe(true));
  expect(calls.at(-1).searchParams.get('page')).toBe('2');
  fireEvent.click(screen.getByText('Back test'));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Trang trước'}).disabled).toBe(true));
  fireEvent.click(screen.getByText('Forward test'));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Trang sau'}).disabled).toBe(true));
});
it('empty is distinct from server failure and retry recovers',async()=>{
  let fail=true;transport(()=>fail?new Response(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE'}}),{status:503}):response([],{page:1,page_size:20,total:0}));mount();
  await screen.findByRole('alert');expect(screen.queryByText('Không tìm thấy sân phù hợp')).toBeNull();
  fail=false;fireEvent.click(screen.getByRole('button',{name:'Thử lại'}));await screen.findByText('Không tìm thấy sân phù hợp');
  expect(screen.queryByRole('navigation',{name:'Phân trang'})).toBeNull();
});
it('network error does not become empty',async()=>{
  transport(()=>Promise.reject(new TypeError('offline')));mount();await screen.findByRole('alert');expect(screen.queryByText('Không tìm thấy sân phù hợp')).toBeNull();
});
it('late old response cannot overwrite new filter result',async()=>{
  let resolveOld;transport(u=>u.searchParams.get('q')==='new'?response([{...facility,name:'Kết quả mới'}]):new Promise(resolve=>{resolveOld=resolve;}));mount();
  expect(screen.getByText('Đang tải danh sách sân…')).toBeTruthy();
  await waitFor(()=>expect(resolveOld).toBeTypeOf('function'));
  fireEvent.change(screen.getByLabelText('Tên sân'),{target:{value:'new'}});submit();await screen.findByText('Kết quả mới');
  await act(async()=>resolveOld(response()));expect(screen.queryByText(facility.name)).toBeNull();
});
it('authenticated header reuses context and logout sends CSRF then becomes guest',async()=>{
  const session={user:{full_name:'Người kiểm thử',capabilities:['CUSTOMER']},csrf_token:'test-csrf'};
  transport((u,options)=>{
    if(u.pathname.endsWith('/logout')){expect(options.method).toBe('POST');expect(options.headers['X-CSRF-Token']).toBe('test-csrf');return new Response(null,{status:204});}
    return response();
  },session);mount();await screen.findByText('Người kiểm thử');fireEvent.click(screen.getByRole('button',{name:'Người kiểm thử'}));fireEvent.click(screen.getByRole('menuitem',{name:'Đăng xuất'}));await screen.findByRole('link',{name:'Đăng nhập'});
});
it('approved Owner keeps Customer navigation and gets Owner booking entry',async()=>{
  const session={user:{full_name:'Owner fixture',capabilities:['CUSTOMER','OWNER']},csrf_token:'test-csrf'};
  transport(()=>response(),session);mount();await screen.findByText('Owner fixture');
  expect(screen.getByRole('link',{name:'Lịch đặt sân'}).getAttribute('href')).toBe('/bookings');
  expect(screen.getByRole('link',{name:'Quản lý đặt sân'}).getAttribute('href')).toBe('/owner/bookings');
});
it('cover failure falls back and supplied amenities are shown',async()=>{
  transport(()=>response([{...facility,cover_image_url:'https://example.invalid/image.png',amenities:[{id:'3',name:'Tiện ích fixture'}]}]));mount();
  const image=await screen.findByRole('img',{name:facility.name});fireEvent.error(image);expect(screen.getByText('Chưa có ảnh')).toBeTruthy();expect(screen.getByText('Tiện ích fixture')).toBeTruthy();
});
it('unsupported URL query shows API error instead of silently dropping filter',async()=>{
  const calls=transport(()=>new Response(JSON.stringify({error:{code:'FILTER_NOT_CONFIGURED'}}),{status:422}));mount('/facilities?date=2026-10-04');await screen.findByRole('alert');expect(calls[0].searchParams.get('date')).toBe('2026-10-04');
});
it('hydrates interval URL, preserves it through pagination, renders strict matching courts and detail context',async()=>{
  const matching={...facility,matching_courts:[{id:'2',name:'Sân phù hợp'}]};
  const calls=transport(u=>response([matching],{page:Number(u.searchParams.get('page')||1),page_size:20,total:21}));
  mount('/facilities?date=2026-10-20&start_time=18%3A00&end_time=19%3A00');
  await screen.findByText('Sân phù hợp');expect(screen.getByText('Phù hợp với thời gian đã chọn')).toBeTruthy();
  const href=screen.getByRole('link',{name:'Xem chi tiết'}).getAttribute('href');expect(href).toContain('/facilities/1?');expect(href).toContain('matching_courts=2');
  fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));await waitFor(()=>expect(calls.at(-1).searchParams.get('page')).toBe('2'));
  expect(calls.at(-1).searchParams.get('start_time')).toBe('18:00');expect(calls.at(-1).searchParams.get('end_time')).toBe('19:00');
});
it('fails closed when interval matching_courts is malformed',async()=>{transport(()=>response([{...facility,matching_courts:[{id:'2',name:'Sân',extra:true}]}]));mount('/facilities?date=2026-10-20&start_time=18%3A00&end_time=19%3A00');expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText(facility.name)).toBeNull();});
