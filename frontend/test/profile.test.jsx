import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { AppRoutes } from '../src/routes/AppRoutes';

const now='2026-10-13T00:00:00.000Z', csrf='c'.repeat(64);
const users={
  customer:{id:'20',full_name:'Khách hàng',email:'customer@example.test',phone:null,avatar_path:null,role:'CUSTOMER',capabilities:['CUSTOMER'],has_local_password:true},
  owner:{id:'21',full_name:'Chủ sân',email:'owner@example.test',phone:'0901',avatar_path:null,role:'CUSTOMER',capabilities:['CUSTOMER','OWNER'],has_local_password:true},
  admin:{id:'22',full_name:'Quản trị',email:'admin@example.test',phone:null,avatar_path:null,role:'ADMIN',capabilities:['ADMIN'],has_local_password:true},
};
const profile=user=>({id:user.id,full_name:user.full_name,email:user.email,phone:user.phone,capabilities:user.capabilities,has_local_password:user.has_local_password});
const ok=data=>new Response(JSON.stringify({data,meta:{server_time:now}}),{status:200});
const session=user=>ok({user,csrf_token:csrf});
const fail=(status,code)=>new Response(JSON.stringify({error:{code}}),{status});
function mount(user=users.customer,{strict=false}={}) {
  const tree=<MemoryRouter initialEntries={['/profile']}><AuthProvider><AppRoutes/></AuthProvider></MemoryRouter>;
  return render(strict?<StrictMode>{tree}</StrictMode>:tree);
}
function mock(user=users.customer, handler) {
  const calls=[];
  vi.stubGlobal('fetch',vi.fn(async(url,options)=>{
    const path=new URL(url).pathname;calls.push({path,options});
    if(path.endsWith('/auth/session'))return session(user);
    if(path.endsWith('/auth/change-password'))return handler?.(options,calls)||ok({message:'Đã đổi mật khẩu. Vui lòng đăng nhập lại.'});
    if(path.endsWith('/auth/logout'))return new Response(null,{status:204});
    if(path.endsWith('/users/me'))return handler?.(options,calls)||ok(profile(user));
    throw new Error('Unexpected '+options.method+' '+path);
  }));
  return calls;
}

it.each([users.customer,users.owner,users.admin])('shared profile renders authoritative data for $full_name',async user=>{
  mock(user);mount(user);expect(await screen.findByRole('heading',{name:'Tài khoản của tôi'})).toBeTruthy();expect(screen.getByDisplayValue(user.email).readOnly).toBe(true);expect(screen.getByDisplayValue(user.full_name)).toBeTruthy();
});

it('renders section navigation, capabilities and local password form',async()=>{mock(users.owner);mount(users.owner);await screen.findByRole('heading',{name:'Tài khoản của tôi'});expect(screen.getByRole('navigation',{name:'Cài đặt tài khoản'})).toBeTruthy();expect(screen.getAllByText('Chủ sân').length).toBeGreaterThan(0);expect(screen.getByLabelText('Mật khẩu hiện tại')).toBeTruthy();expect(screen.getByRole('link',{name:/không gian chủ sân/i})).toBeTruthy()});

it('no-local-password account gets a read-only security state',async()=>{const user={...users.customer,has_local_password:false};mock(user);mount(user);expect(await screen.findByText('Không có mật khẩu cục bộ')).toBeTruthy();expect(screen.queryByLabelText('Mật khẩu hiện tại')).toBeNull()});

it('validates password fields and submits change exactly once',async()=>{let resolvePassword;const calls=mock(users.customer,(options)=>{if(options.method==='GET')return ok(profile(users.customer));return new Promise(resolve=>{resolvePassword=()=>resolve(ok({message:'Đã đổi mật khẩu. Vui lòng đăng nhập lại.'}))})});mount();await screen.findByLabelText('Mật khẩu hiện tại');fireEvent.click(screen.getByRole('button',{name:'Đổi mật khẩu'}));expect(await screen.findByText('Vui lòng nhập mật khẩu hiện tại.')).toBeTruthy();fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'),{target:{value:'OldPassword1'}});fireEvent.change(screen.getByLabelText('Mật khẩu mới'),{target:{value:'NewPassword2'}});fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'),{target:{value:'NewPassword2'}});const button=screen.getByRole('button',{name:'Đổi mật khẩu'});fireEvent.click(button);fireEvent.click(button);expect(calls.filter(call=>call.path.endsWith('/change-password'))).toHaveLength(1);resolvePassword();await screen.findByRole('heading',{name:'Đăng nhập'})});

it('profile route requires authentication',async()=>{vi.stubGlobal('fetch',vi.fn(()=>fail(401,'SESSION_EXPIRED')));mount();expect(await screen.findByRole('heading',{name:'Đăng nhập'})).toBeTruthy()});

it('validates, cancels edits, saves once and reconciles Header identity',async()=>{
  let current=users.customer, pendingResolve;
  const calls=mock(current,options=>{if(options.method==='GET')return ok(profile(current));return new Promise(resolve=>{pendingResolve=()=>{current={...current,full_name:'Tên mới',phone:'090 123'};resolve(ok(profile(current)))};});});
  mount();await screen.findByDisplayValue('Khách hàng');const save=screen.getByRole('button',{name:'Lưu thay đổi'});expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Họ và tên'),{target:{value:'   '}});fireEvent.click(save);expect(await screen.findByText('Họ và tên phải từ 1–150 ký tự.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Họ và tên'),{target:{value:'Tên mới'}});fireEvent.change(screen.getByLabelText('Số điện thoại'),{target:{value:'090 123'}});fireEvent.click(save);fireEvent.click(save);
  expect(calls.filter(call=>call.options.method==='PATCH')).toHaveLength(1);expect(screen.getByRole('button',{name:'Đang lưu…'}).disabled).toBe(true);pendingResolve();
  expect(await screen.findByText('Đã cập nhật hồ sơ.')).toBeTruthy();expect(screen.getAllByText('Tên mới').length).toBeGreaterThan(1);
  expect(JSON.parse(calls.find(call=>call.options.method==='PATCH').options.body)).toEqual({full_name:'Tên mới',phone:'090 123'});
});

it('empty phone is sent and reconciled as null',async()=>{let current=users.owner;const calls=mock(current,options=>{if(options.method==='GET')return ok(profile(current));current={...current,phone:null};return ok(profile(current))});mount(current);await screen.findByDisplayValue('0901');fireEvent.change(screen.getByLabelText('Số điện thoại'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));await screen.findByText('Đã cập nhật hồ sơ.');expect(JSON.parse(calls.find(c=>c.options.method==='PATCH').options.body).phone).toBe('')});

it('malformed 2xx mutation fails closed and recovers authoritative state',async()=>{let reads=0;const user=users.customer;const calls=mock(user,options=>options.method==='PATCH'?ok({...profile(user),unexpected:true}):(reads++,ok(profile({...user,full_name:reads>1?'Recovered Name':user.full_name}))));mount();await screen.findByDisplayValue(user.full_name);fireEvent.change(screen.getByLabelText('Họ và tên'),{target:{value:'Attempt'}});fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));expect(await screen.findByText('Hồ sơ đã được đồng bộ theo dữ liệu mới nhất.')).toBeTruthy();expect(screen.getByDisplayValue('Recovered Name')).toBeTruthy();expect(calls.filter(c=>c.options.method==='PATCH')).toHaveLength(1)});

it('unknown mutation result recovers with GET and does not retry PATCH',async()=>{let reads=0;const user=users.customer;const calls=mock(user,options=>{if(options.method==='PATCH')throw new TypeError('connection lost');return ok(profile({...user,full_name:++reads>1?'Server Name':user.full_name}))});mount();await screen.findByDisplayValue(user.full_name);fireEvent.change(screen.getByLabelText('Họ và tên'),{target:{value:'Attempt'}});fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));expect(await screen.findByDisplayValue('Server Name')).toBeTruthy();expect(calls.filter(c=>c.options.method==='PATCH')).toHaveLength(1)});

it('failed authoritative recovery preserves last-known-good snapshot',async()=>{let reads=0;const user=users.customer;mock(user,options=>{if(options.method==='PATCH')throw new TypeError('lost');if(++reads>1)throw new TypeError('offline');return ok(profile(user))});mount();await screen.findByDisplayValue(user.full_name);fireEvent.change(screen.getByLabelText('Họ và tên'),{target:{value:'Unsaved Name'}});fireEvent.click(screen.getByRole('button',{name:'Lưu thay đổi'}));expect(await screen.findByText(/Kết quả cập nhật chưa được xác minh/)).toBeTruthy();expect(screen.getByText(user.email)).toBeTruthy();expect(screen.getByDisplayValue('Unsaved Name')).toBeTruthy()});

it('read failure preserves the session identity shell and retries authoritative profile data',async()=>{let attempt=0;mock(users.customer,()=>++attempt===1?fail(503,'SERVICE_UNAVAILABLE'):ok(profile(users.customer)));mount();expect(await screen.findByRole('heading',{name:'Tài khoản của tôi'})).toBeTruthy();expect(await screen.findByText(/Không thể đồng bộ dữ liệu mới nhất/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Thử lại'}));await waitFor(()=>expect(attempt).toBe(2));expect(screen.getByDisplayValue(users.customer.full_name)).toBeTruthy()});

it('StrictMode deduplicates discarded profile read and unmount aborts active request',async()=>{let signal,resolve;const calls=mock(users.customer,options=>new Promise(done=>{signal=options.signal;resolve=done}));const view=mount(users.customer,{strict:true});await waitFor(()=>expect(calls.filter(c=>c.path.endsWith('/users/me'))).toHaveLength(1));view.unmount();expect(signal.aborted).toBe(true);resolve(ok(profile(users.customer)))});
