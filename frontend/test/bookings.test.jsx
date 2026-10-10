import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { AppRoutes } from '../src/routes/AppRoutes';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { bookingLabels, estimate } from '../src/features/bookings/rules';

const now='2026-10-05T01:00:00.000Z';
const user={id:'1',full_name:'Customer fixture',capabilities:['CUSTOMER','OWNER']};
const slots=Array.from({length:3},(_,i)=>({start_at:new Date(Date.UTC(2026,9,5,2,i*30)).toISOString(),end_at:new Date(Date.UTC(2026,9,5,2,(i+1)*30)).toISOString(),state:'AVAILABLE',slot_amount:'40000.5'}));
const facility={id:'1',name:'Facility fixture',address:'Địa chỉ fixture',district:'Phường Hải Châu',opening_time:'06:00',closing_time:'22:00',gallery:[],amenities:[],price_rules:[],cancellation_policy:null,courts:[{id:'2',name:'Court fixture'}]};
const booking={id:'91',court_id:'2',status:'PENDING_PAYMENT',cancellation_cutoff_hours_snapshot:null,start_at:slots[0].start_at,end_at:slots[1].end_at,expires_at:'2026-10-05T01:05:00.000Z',created_at:now,total_amount:'80001',deposit_amount:'24000',remaining_amount:'56001',facility_name_snapshot:'Snapshot fixture',facility_address_snapshot:'Địa chỉ snapshot',court_name_snapshot:'Court snapshot',bank_name_snapshot:'Fixture Bank',account_number_snapshot:'00123456789',account_holder_snapshot:'NGUYEN VAN A',qr_image_url:null,qr_image_expires_at:null,refund:null,slots:slots.slice(0,2).map(s=>({...s,hourly_rate_snapshot:'80001'}))};
const ok=(data,meta={},status=200)=>new Response(JSON.stringify({data,meta:{server_time:now,...meta}}),{status});
const fail=(status,code)=>new Response(JSON.stringify({error:{code}}),{status});
function transport({create,detail,list,session,availability,cancel}={}) {
  const calls=[];
  vi.stubGlobal('fetch',vi.fn(async(url,options)=>{
    const u=new URL(url);calls.push({u,options});expect(options.credentials).toBe('include');
    if(u.pathname.endsWith('/auth/session'))return session?session():ok({user,csrf_token:'csrf-test'});
    if(u.pathname.endsWith('/auth/login'))return ok({user,csrf_token:'csrf-test'});
    if(u.pathname.endsWith('/facilities/1'))return ok(facility);
    if(u.pathname.endsWith('/availability'))return availability?availability():ok({court_id:'2',date:'2026-10-05',slots});
    if(u.pathname.endsWith('/facilities'))return ok([],{page:1,page_size:4,total:0});
    if(u.pathname==='/api/v1/bookings' && options.method==='POST')return create?create(options):ok(booking,{},201);
    if(u.pathname==='/api/v1/bookings')return list?list(u):ok([booking],{page:1,page_size:20,total:1});
    if(u.pathname==='/api/v1/bookings/91/cancel'&&options.method==='POST')return cancel?cancel(options):ok({booking:{id:'91',status:'CANCELLED',cancelled_by:'CUSTOMER',cancellation_reason:null,cancelled_at:now},refund:{id:'8',booking_id:'91',amount:'24000',status:'PENDING',requested_at:now}});
    if(u.pathname.startsWith('/api/v1/bookings/'))return detail?detail(u):ok(booking);
    throw new Error('Unexpected test request '+u.pathname);
  }));return calls;
}
function Location(){const loc=useLocation();return <output data-testid="location">{loc.pathname+loc.search}</output>;}
function mount(path='/facilities/1'){return render(<StrictMode><MemoryRouter initialEntries={[path]}><AuthProvider><Location/><AppRoutes/></AuthProvider></MemoryRouter></StrictMode>);}
async function confirm(){
  await screen.findByText('Customer fixture');
  fireEvent.click(await screen.findByRole('button',{name:/09:00–09:30/}));
  fireEvent.click(screen.getByRole('button',{name:/09:30–10:00/}));
  fireEvent.click(screen.getByRole('button',{name:'Tiếp tục đặt sân ›'}));
  await screen.findByRole('heading',{name:'Xác nhận đặt sân'});
}
const creates=calls=>calls.filter(c=>c.options.method==='POST' && c.u.pathname==='/api/v1/bookings');
afterEach(()=>vi.useRealTimers());

it('malformed Booking list shows error instead of empty state',async()=>{transport({list:()=>ok(null,{page:1,page_size:20,total:0})});mount('/bookings');expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText(/Bạn chưa có lịch đặt sân/)).toBeNull();});
it('malformed Booking detail required slots shows error instead of crashing',async()=>{transport({detail:()=>ok({...booking,slots:null})});mount('/bookings/91');expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('Chi tiết đặt sân')).toBeTruthy();});
it('confirmed booking renders cutoff deadline and cancels through accessible modal',async()=>{
  let cancelled=false;const confirmed={...booking,status:'CONFIRMED',start_at:'2026-10-06T02:00:00.000Z',end_at:'2026-10-06T03:00:00.000Z',cancellation_cutoff_hours_snapshot:2};
  const calls=transport({detail:()=>ok({...confirmed,status:cancelled?'CANCELLED':'CONFIRMED'}),cancel:()=>{cancelled=true;return ok({booking:{id:'91',status:'CANCELLED',cancelled_by:'CUSTOMER',cancellation_reason:null,cancelled_at:now},refund:{id:'8',booking_id:'91',amount:'24000',status:'PENDING',requested_at:now}})}});
  mount('/bookings/91');expect(await screen.findByText('Tiền cọc đã được xác nhận')).toBeTruthy();expect(screen.getByText('2 giờ')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Hủy đặt sân'}));expect(screen.getByRole('dialog',{name:'Xác nhận hủy đặt sân?'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));
  await screen.findByText('Booking đã được hủy.');expect(calls.filter(call=>call.options.method==='POST'&&call.u.pathname.endsWith('/cancel'))).toHaveLength(1);
});
it.each([[0,true],[null,false],[2,false]])('confirmed cutoff %s eligibility follows server time',async(cutoff,enabled)=>{
  const start=enabled?'2026-10-05T02:00:00.000Z':'2026-10-05T01:00:00.000Z';transport({detail:()=>ok({...booking,status:'CONFIRMED',start_at:start,end_at:'2026-10-05T03:00:00.000Z',cancellation_cutoff_hours_snapshot:cutoff})});mount('/bookings/91');await screen.findByText('Tiền cọc đã được xác nhận');
  const button=screen.queryByRole('button',{name:'Hủy đặt sân'});expect(Boolean(button&&!button.disabled)).toBe(enabled);
});
it('malformed cancellation success fails closed and refetches authoritative state',async()=>{let reads=0;transport({detail:()=>{reads++;return ok({...booking,status:'CONFIRMED',start_at:'2026-10-06T02:00:00.000Z',cancellation_cutoff_hours_snapshot:2});},cancel:()=>ok({booking:{id:'91',status:'CANCELLED'},refund:null})});mount('/bookings/91');fireEvent.click(await screen.findByRole('button',{name:'Hủy đặt sân'}));fireEvent.click(screen.getByRole('button',{name:'Xác nhận hủy'}));expect(await screen.findByRole('alert')).toBeTruthy();expect(reads).toBeGreaterThan(1);});

it('selection → confirmation shows exact estimates; POST is explicit, whitelist + CSRF, then real snapshot detail',async()=>{
  const calls=transport();mount();await confirm();expect(creates(calls)).toHaveLength(0);
  expect(screen.getByText('Tổng tiền dự kiến')).toBeTruthy();expect(screen.getByText('80.001 ₫')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Xác nhận đặt sân'}));
  await screen.findByRole('heading',{name:'Chi tiết đặt sân'});
  expect(screen.getByText('Snapshot fixture')).toBeTruthy();expect(screen.getByText('Chờ thanh toán')).toBeTruthy();
  expect(screen.queryByText('Đã xác nhận')).toBeNull();expect(creates(calls)).toHaveLength(1);
  const post=creates(calls)[0].options;expect(post.headers['X-CSRF-Token']).toBe('csrf-test');
  expect(JSON.parse(post.body)).toEqual({court_id:'2',start_at:slots[0].start_at,end_at:slots[1].end_at});
  expect(screen.getByTestId('location').textContent).toBe('/bookings/91');
});
it('back preserves valid memory selection, while remount/direct confirmation has no selection and never POSTs',async()=>{
  const calls=transport();const view=mount();await confirm();fireEvent.click(screen.getByRole('link',{name:'Quay lại'}));
  await screen.findByRole('button',{name:/09:00–09:30/});expect(screen.getAllByRole('button',{pressed:true}).filter(b=>b.classList.contains('fd-slot'))).toHaveLength(2);
  view.unmount();mount('/facilities/1/booking-confirm');await screen.findByText(/Thông tin khung giờ đã chọn không còn/);
  expect(screen.getByRole('link',{name:/Chọn lại khung giờ/}).getAttribute('href')).toBe('/facilities/1');expect(creates(calls)).toHaveLength(0);
});
it('returning to Detail revalidates saved selection against changed availability',async()=>{
  let blocked=false;transport({availability:()=>ok({court_id:'2',slots:slots.map(s=>({...s,state:blocked?'HELD':'AVAILABLE'}))})});mount();await confirm();blocked=true;
  fireEvent.click(screen.getByRole('link',{name:'Quay lại'}));await screen.findByRole('button',{name:/09:00–09:30/});expect(screen.getByRole('button',{name:'Tiếp tục đặt sân ›'}).disabled).toBe(true);
});
it('double submit sends only one POST while pending',async()=>{
  let finish;const calls=transport({create:()=>new Promise(resolve=>{finish=resolve;})});mount();await confirm();
  const button=screen.getByRole('button',{name:'Xác nhận đặt sân'});fireEvent.click(button);fireEvent.click(button);expect(creates(calls)).toHaveLength(1);expect(button.disabled).toBe(true);
  await act(async()=>finish(ok(booking,{},201)));await screen.findByText('Snapshot fixture');
});
it.each([[403,'FORBIDDEN'],[409,'SLOT_UNAVAILABLE'],[422,'BOOKING_TOO_FAR'],[422,'BOOKING_AMOUNT_TOO_LARGE']])('create %s %s is a visible error, no automatic retry',async(status,code)=>{
  const calls=transport({create:()=>fail(status,code)});mount();await confirm();fireEvent.click(screen.getByRole('button',{name:'Xác nhận đặt sân'}));
  await screen.findByRole('alert');expect(creates(calls)).toHaveLength(1);expect(screen.getByRole('button',{name:'Xác nhận đặt sân'}).disabled).toBe(true);
});
it('401 create clears session and returns to login, no restore/POST after login',async()=>{
  const calls=transport({create:()=>fail(401,'SESSION_EXPIRED')});mount();await confirm();fireEvent.click(screen.getByRole('button',{name:'Xác nhận đặt sân'}));
  await screen.findByRole('heading',{name:'Đăng nhập'});expect(screen.getByTestId('location').textContent).toBe('/login');expect(creates(calls)).toHaveLength(1);
});
it.each(['network',500])('unknown create %s locks retry and links history without claiming failure',async(kind)=>{
  const calls=transport({create:()=>kind===500?fail(500,'INTERNAL_ERROR'):Promise.reject(new TypeError(kind))});mount();await confirm();
  fireEvent.click(screen.getByRole('button',{name:'Xác nhận đặt sân'}));await screen.findByText(/Chưa xác định được kết quả tạo booking/);
  expect(screen.getByRole('link',{name:'Lịch đặt sân của tôi'}).getAttribute('href')).toBe('/bookings');
  fireEvent.click(screen.getByRole('button',{name:'Xác nhận đặt sân'}));expect(creates(calls)).toHaveLength(1);
  fireEvent.click(screen.getByRole('link',{name:'Quay lại'}));await screen.findByRole('button',{name:/09:00–09:30/});
  fireEvent.click(screen.getByRole('button',{name:'Tiếp tục đặt sân ›'}));expect(screen.getByText(/Yêu cầu trước chưa xác định/)).toBeTruthy();expect(creates(calls)).toHaveLength(1);
});
it('actual API timeout aborts once, locks POST retry and offers recovery',async()=>{
  const calls=transport({create:options=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))});
  mount();await confirm();vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});fireEvent.click(screen.getByRole('button',{name:'Xác nhận đặt sân'}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(20001);});vi.useRealTimers();await screen.findByText(/Chưa xác định được kết quả tạo booking/);expect(creates(calls)).toHaveLength(1);
});
it('navigation back while POST is in flight cannot issue a second create',async()=>{
  let finish;const calls=transport({create:()=>new Promise(resolve=>{finish=resolve;})});mount();await confirm();fireEvent.click(screen.getByRole('button',{name:'Xác nhận đặt sân'}));
  fireEvent.click(screen.getByRole('link',{name:'Quay lại'}));await screen.findByRole('button',{name:/09:00–09:30/});fireEvent.click(screen.getByRole('button',{name:'Tiếp tục đặt sân ›'}));
  expect(screen.getByText(/Yêu cầu trước chưa xác định/)).toBeTruthy();expect(creates(calls)).toHaveLength(1);await act(async()=>finish(ok(booking,{},201)));await screen.findByText('Snapshot fixture');
});
it('guest is told to reselect, login stays on existing home redirect without auto-create',async()=>{
  const calls=transport({session:()=>fail(401,'SESSION_EXPIRED')});mount();fireEvent.click(await screen.findByRole('button',{name:/09:00–09:30/}));
  expect(screen.getByText(/Vui lòng đăng nhập rồi quay lại cơ sở/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Tiếp tục đặt sân ›'}));
  await screen.findByRole('heading',{name:'Đăng nhập'});
  fireEvent.change(screen.getByLabelText('Email'),{target:{value:'test@example.com'}});fireEvent.change(screen.getByLabelText('Mật khẩu',{exact:true}),{target:{value:'TestPassword1'}});
  fireEvent.click(screen.getByRole('button',{name:'Đăng nhập'}));await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/'));expect(creates(calls)).toHaveLength(0);
});
it('Admin cannot access personal booking routes or call their API',async()=>{
  const calls=transport({session:()=>ok({user:{...user,capabilities:['ADMIN']},csrf_token:'test'})});mount('/bookings');await screen.findByText('Không có quyền truy cập');expect(calls.some(c=>c.u.pathname==='/api/v1/bookings')).toBe(false);
});
it('list uses snapshots, all seven statuses, real IDs and pagination without photos or fake code',async()=>{
  const calls=transport({list:u=>ok(Object.keys(bookingLabels).map((status,i)=>({...booking,id:String(i+1),status})),{page:Number(u.searchParams.get('page')||1),page_size:7,total:14})});mount('/bookings?page=1&page_size=7');
  await screen.findByText('Chờ thanh toán');for(const label of Object.values(bookingLabels))expect(screen.getByText(label)).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();expect(screen.queryByText(/BK202/)).toBeNull();expect(screen.getAllByRole('link',{name:'Xem chi tiết'})[0].getAttribute('href')).toBe('/bookings/1');
  expect(screen.getByRole('button',{name:'Trang trước'}).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Trang sau'}).disabled).toBe(true));expect(calls.some(c=>c.u.search==='?page=2&page_size=7')).toBe(true);
});
it('list distinguishes error and empty, explicit retry uses GET only',async()=>{
  let error=true;const calls=transport({list:()=>error?fail(503,'UNAVAILABLE'):ok([],{page:1,page_size:20,total:0})});mount('/bookings');await screen.findByRole('alert');expect(screen.queryByText(/Bạn chưa có lịch/)).toBeNull();error=false;fireEvent.click(screen.getByRole('button',{name:'Thử lại'}));await screen.findByText(/Bạn chưa có lịch/);expect(creates(calls)).toHaveLength(0);
});
it('ownership 404 hides detail and offers history recovery',async()=>{
  transport({detail:()=>fail(404,'RESOURCE_NOT_FOUND')});mount('/bookings/999');await screen.findByText(/Không tìm thấy booking hoặc/);expect(screen.queryByText('Snapshot fixture')).toBeNull();expect(screen.getByRole('link',{name:/Lịch đặt sân của tôi/}).getAttribute('href')).toBe('/bookings');
});
it('reload countdown uses server time, not client wall time or a fresh five minutes',async()=>{
  transport({detail:()=>ok(booking,{server_time:'2026-10-05T01:03:00.000Z'})});const view=mount('/bookings/91');
  expect((await screen.findByRole('timer')).textContent).toBe('02:00');view.unmount();mount('/bookings/91');expect((await screen.findByRole('timer')).textContent).toBe('02:00');
});
it('pending payment detail exposes payment CTA only while server-time hold remains',async()=>{
  transport();mount('/bookings/91');expect((await screen.findByRole('link',{name:'Thanh toán tiền cọc'})).getAttribute('href')).toBe('/bookings/91/payment');
});
it('focus refetch synchronizes server status and removes countdown',async()=>{
  let status='PENDING_PAYMENT';transport({detail:()=>ok({...booking,status})});mount('/bookings/91');await screen.findByRole('timer');status='EXPIRED';fireEvent(window,new Event('focus'));
  await screen.findByText('Đã hết hạn');expect(screen.queryByRole('timer')).toBeNull();
});
it('countdown zero refetches and uses server EXPIRED, with no mutation',async()=>{
  let tick=0;vi.spyOn(performance,'now').mockImplementation(()=>tick);
  let expired=false;const calls=transport({detail:()=>ok({...booking,status:expired?'EXPIRED':'PENDING_PAYMENT',expires_at:'2026-10-05T01:00:01.000Z'})});mount('/bookings/91');await screen.findByRole('timer');expired=true;
  tick=1500;await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));
  // Focus is not needed: the interval must initiate the read.
  await screen.findByText('Đã hết hạn');expect(creates(calls)).toHaveLength(0);
});
it('sync error does not invent EXPIRED; explicit recovery works',async()=>{
  let error=false;transport({detail:()=>error?fail(503,'UNAVAILABLE'):ok(booking)});mount('/bookings/91');await screen.findByRole('timer');error=true;fireEvent(window,new Event('focus'));
  await screen.findByText(/Chưa xác minh được trạng thái hiện tại/);expect(screen.queryByText('Hết hạn')).toBeNull();expect(screen.queryByRole('timer')).toBeNull();error=false;fireEvent.click(screen.getByRole('button',{name:'Đồng bộ lại'}));await screen.findByRole('timer');
});
it('zero and failed sync do not create a refetch loop or local expiry',async()=>{
  let count=0;const calls=transport({detail:()=>{count++;return count<=2?ok({...booking,expires_at:now}):fail(503,'UNAVAILABLE');}});mount('/bookings/91');
  await screen.findByText(/Chưa xác minh được trạng thái hiện tại/);const previous=calls.length;await act(async()=>new Promise(resolve=>setTimeout(resolve,350)));expect(calls).toHaveLength(previous);expect(screen.queryByText('Hết hạn')).toBeNull();
});
it.each([
  ['PENDING_CONFIRMATION','Minh chứng đã được gửi. Vui lòng chờ chủ sân xác nhận.'],
  ['CONFIRMED','Đặt sân đã được chủ sân xác nhận. Số tiền còn lại 70% thanh toán tại sân.'],
  ['REJECTED','Minh chứng thanh toán đã bị từ chối. Booking này không thể gửi lại minh chứng.'],
  ['CANCELLED','Booking đã được hủy.'],['EXPIRED','Booking đã hết thời gian thanh toán.'],['COMPLETED','Booking đã hoàn thành.'],
])('%s has friendly state and no countdown/payment action',async(status,text)=>{
  transport({detail:()=>ok({...booking,status})});mount('/bookings/91');await screen.findByText(bookingLabels[status]);expect(screen.queryByRole('timer')).toBeNull();expect(screen.getByText(text)).toBeTruthy();expect(screen.queryByText(/Bước thanh toán sẽ được hỗ trợ/)).toBeNull();expect(screen.queryByRole('button',{name:/chuyển khoản|proof|Hủy/i})).toBeNull();
});
it('estimate preserves decimal and applies half-up only to total and deposit',()=>{
  expect(estimate([{slot_amount:'0.5'},{slot_amount:'0.5'}])).toEqual({total_amount:'1',deposit_amount:'0',remaining_amount:'1'});
  expect(estimate([{slot_amount:'5'}])).toEqual({total_amount:'5',deposit_amount:'2',remaining_amount:'3'});
  expect(estimate([{slot_amount:'999999999999.5'}]).total_amount).toBe('1000000000000');expect(estimate([{slot_amount:null}])).toBeNull();
});
