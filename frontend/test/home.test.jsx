import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { AppRoutes } from '../src/routes/AppRoutes';
import districts from '../src/generated/districts.json';
const fixture={id:'72',name:'Home fixture',district:districts[0],address:'Fixture address',cover_image_url:null,amenities:[]};
const ok=data=>new Response(JSON.stringify({data,meta:{page:1,page_size:4,total:data.length,server_time:'2026-10-05T00:00:00Z'}}),{status:200});
function setup({capabilities=null,list=()=>ok([fixture]),sessionFailure=false}={}){
  const calls=[];vi.stubGlobal('fetch',vi.fn((url,options)=>{
    const u=new URL(url);calls.push(u);expect(options.method).toBe('GET');
    if(u.pathname.endsWith('/auth/session'))return Promise.resolve(sessionFailure?new Response(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE'}}),{status:503}):capabilities?ok({user:{full_name:'Tên thật fixture',capabilities},csrf_token:'test'}):new Response(JSON.stringify({error:{code:'SESSION_EXPIRED'}}),{status:401}));
    return Promise.resolve(list(u));
  }));return calls;
}
function Location(){return <output data-testid="home-location">{useLocation().pathname+useLocation().search}</output>;}
function mount(){render(<MemoryRouter initialEntries={['/']}><AuthProvider><Location/><AppRoutes/></AuthProvider></MemoryRouter>);}
it('Home replaces scaffold with real list DTO, correct query, header active, no fake claims',async()=>{
  const calls=setup();mount();await screen.findByRole('heading',{name:'Home fixture'});
  expect(calls.find(u=>u.pathname.endsWith('/facilities')).search).toBe('?page=1&page_size=4');
  const nav=screen.getByRole('navigation',{name:'Điều hướng chính'});expect(within(nav).getByText('Trang chủ').getAttribute('aria-current')).toBe('page');expect(within(nav).getByText('Tìm sân').getAttribute('aria-current')).toBeNull();
  expect(screen.getByRole('link',{name:'Xem chi tiết'}).getAttribute('href')).toBe('/facilities/72');
  expect(screen.getByRole('link',{name:'Đăng nhập'}).getAttribute('href')).toBe('/login');
  expect(screen.queryByText(/Khung ứng dụng|Sân nổi bật|42\+|180\+|3.800\+|Còn sân|realtime|số 1/)).toBeNull();
  expect(screen.getByLabelText('Ngày chơi').disabled).toBe(true);expect(screen.getByLabelText('Giờ bắt đầu').disabled).toBe(true);
});
it.each(['',districts[25]])('district search navigates with only supported query %s',async district=>{
  setup();mount();await screen.findByRole('heading',{name:'Home fixture'});fireEvent.change(screen.getByLabelText('Khu vực'),{target:{value:district}});fireEvent.click(screen.getByRole('button',{name:'⌕ Tìm sân'}));
  await waitFor(()=>expect(screen.getByTestId('home-location').textContent).toBe('/facilities'+(district?'?'+new URLSearchParams({district}):'')));
  const nav=screen.getByRole('navigation',{name:'Điều hướng chính'});expect(within(nav).getByText('Tìm sân').getAttribute('aria-current')).toBe('page');
});
it('area uses canonical registry and navigates',async()=>{
  setup();mount();await screen.findByRole('heading',{name:'Home fixture'});const link=screen.getByRole('link',{name:districts[4]});fireEvent.click(link);await waitFor(()=>expect(screen.getByTestId('home-location').textContent).toBe('/facilities?'+new URLSearchParams({district:districts[4]})));
});
it('loading, error and empty are separate and retry works',async()=>{
  let resolve;setup({list:()=>new Promise(r=>{resolve=r;})});mount();expect(screen.getByText('Đang tải danh sách sân…')).toBeTruthy();
  resolve(new Response(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE'}}),{status:503}));await screen.findByRole('alert');expect(screen.queryByText('Chưa có cơ sở để hiển thị.')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Thử lại danh sách'}));await waitFor(()=>expect(screen.getByText('Đang tải danh sách sân…')).toBeTruthy());resolve(ok([]));await screen.findByText('Chưa có cơ sở để hiển thị.');
});
it.each([{capabilities:['CUSTOMER']},{capabilities:['CUSTOMER','OWNER']},{capabilities:['ADMIN']}])('Owner CTA respects capabilities $capabilities without mutation',async({capabilities})=>{
  const calls=setup({capabilities});mount();await screen.findByText('Tên thật fixture');
  if(capabilities.includes('OWNER')){expect(screen.getByText(/Bạn có thể quản lý cơ sở/)).toBeTruthy();expect(screen.getByRole('link',{name:'Quản lý cơ sở ›'}).getAttribute('href')).toBe('/owner/facilities');}
  else if(capabilities.includes('CUSTOMER'))expect(screen.getByRole('link',{name:'Đăng ký trở thành chủ sân ›'}).getAttribute('href')).toBe('/owner-request');
  else expect(screen.queryByText('Dành cho chủ sân')).toBeNull();
  expect(calls.some(u=>u.pathname.includes('owner-requests'))).toBe(false);
  expect(screen.queryByText(/giao diện đặt sân và thanh toán chưa có|Giao diện quản lý sẽ được bổ sung sau/i)).toBeNull();
});
it('session error does not become guest or prevent public list',async()=>{
  setup({sessionFailure:true});mount();await screen.findByRole('heading',{name:'Home fixture'});expect(screen.getByText('Chưa thể kiểm tra phiên')).toBeTruthy();expect(screen.queryByRole('link',{name:'Đăng nhập'})).toBeNull();
});
it('malformed successful Facility list becomes an error instead of empty or crash',async()=>{setup({list:()=>new Response(JSON.stringify({data:null,meta:{page:1,page_size:4,total:0}}),{status:200})});mount();expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('Chưa có cơ sở để hiển thị.')).toBeNull();});
