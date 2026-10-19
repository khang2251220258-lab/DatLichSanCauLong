import { afterEach, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { AppRoutes } from '../src/routes/AppRoutes';
import { AuthProvider } from '../src/features/auth/AuthContext';

const now='2026-10-06T01:00:00.000Z';
const user={id:'1',full_name:'Customer fixture',capabilities:['CUSTOMER','OWNER']};
const booking={id:'91',status:'PENDING_PAYMENT',booking_flow_version:1,confirmation_expires_at:null,confirmed_by_user_id:null,cancellation_cutoff_hours_snapshot:null,expires_at:'2026-10-06T01:05:00.000Z',created_at:now,
  start_at:'2026-10-07T02:00:00.000Z',end_at:'2026-10-07T03:00:00.000Z',total_amount:'80001',deposit_amount:'24000',remaining_amount:'56001',
  facility_name_snapshot:'Snapshot fixture',facility_address_snapshot:'Địa chỉ snapshot',court_name_snapshot:'Court snapshot',
  bank_name_snapshot:'Fixture Bank',account_number_snapshot:'00123456789',account_holder_snapshot:'NGUYEN VAN A',qr_image_url:null,qr_image_expires_at:null,refund:null,slots:[
    {start_at:'2026-10-07T02:00:00.000Z',end_at:'2026-10-07T02:30:00.000Z',hourly_rate_snapshot:'80001',slot_amount:'40000.5'},
    {start_at:'2026-10-07T02:30:00.000Z',end_at:'2026-10-07T03:00:00.000Z',hourly_rate_snapshot:'80001',slot_amount:'40000.5'}]};
const ok=(data,meta={},status=200)=>new Response(JSON.stringify({data,meta:{server_time:now,...meta}}),{status});
const fail=(status,code)=>new Response(JSON.stringify({error:{code}}),{status});
function transport({detail,proof,proofRead,cancel,session}={}){
  let submitted=false,cancelled=false;
  const calls=[];vi.stubGlobal('fetch',vi.fn(async(url,options)=>{const u=new URL(url);calls.push({u,options});expect(options.credentials).toBe('include');
    if(u.pathname.endsWith('/auth/session'))return session?session():ok({user,csrf_token:'csrf-test'});
    if(u.pathname==='/api/v1/payments/bookings/91/proof'&&options.method==='POST'){const response=await (proof?proof(options):ok({proof:{id:'7',status:'SUBMITTED',submitted_at:now},booking:{id:'91',status:'PENDING_CONFIRMATION',expires_at:booking.expires_at}}, {},201));if(response.status===201)submitted=true;return response;}
    if(u.pathname==='/api/v1/payments/bookings/91/proof'&&options.method==='GET')return proofRead?proofRead():ok({id:'7',booking_id:'91',status:'SUBMITTED',submitted_at:now,proof_image_url:'https://private.example.invalid/proof-1',proof_image_expires_at:'2026-10-06T01:05:00.000Z'});
    if(u.pathname==='/api/v1/bookings/91/cancel'){const response=await(cancel?cancel(options):ok({booking:{id:'91',status:'CANCELLED'},refund:null}));if(response.status===200)cancelled=true;return response;}
    if(u.pathname==='/api/v1/bookings/91')return detail?detail():ok({...booking,status:cancelled?'CANCELLED':submitted?'PENDING_CONFIRMATION':booking.status});
    throw new Error('Unexpected test request '+u.pathname);
  }));return calls;
}
function Location(){const location=useLocation();return <output data-testid="location">{location.pathname}</output>;}
function mount(path='/bookings/91/payment'){return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Location/><AppRoutes/></AuthProvider></MemoryRouter>);}
function mountStrict(path='/bookings/91/payment'){return render(<StrictMode><MemoryRouter initialEntries={[path]}><AuthProvider><Location/><AppRoutes/></AuthProvider></MemoryRouter></StrictMode>);}
const proofCalls=calls=>calls.filter(c=>c.u.pathname==='/api/v1/payments/bookings/91/proof'&&c.options.method==='POST');
const png=()=>new File([new Uint8Array([137,80,78,71])],'proof.png',{type:'image/png'});
async function select(file=png()) {const input=await screen.findByLabelText(/Chọn ảnh (tải lên|khác)/);fireEvent.change(input,{target:{files:[file]}});return input;}
async function submit(file=png()){await select(file);fireEvent.click(screen.getByRole('button',{name:'Gửi minh chứng'}));}
afterEach(()=>vi.useRealTimers());

it('renders real bank snapshot, transfer content, QR fallback and server countdown',async()=>{
  transport();mount();expect((await screen.findByRole('timer')).textContent).toBe('05:00');
  for(const text of ['Snapshot fixture','Court snapshot','80.001 ₫','56.001 ₫','Fixture Bank','00123456789','NGUYEN VAN A','BOOKING 91','QR thanh toán chưa khả dụng'])expect(screen.getByText(text)).toBeTruthy();expect(screen.getAllByText('24.000 ₫').length).toBeGreaterThan(1);
  for(const fake of ['Vietcombank','1234567890','BK20260917001','0236 123 4567'])expect(screen.queryByText(fake)).toBeNull();
});
it('renders only a validated secure QR URL and otherwise keeps the approved fallback',async()=>{
  transport({detail:()=>ok({...booking,qr_image_url:'https://private.example.invalid/qr',qr_image_expires_at:'2026-10-05T01:05:00.000Z'})});mount();
  const image=await screen.findByRole('img',{name:'Mã QR thanh toán'});expect(image.getAttribute('src')).toBe('https://private.example.invalid/qr');expect(screen.queryByText(/QR thanh toán chưa khả dụng/)).toBeNull();
});
it('copy uses only real account, amount and transfer values; clipboard failure is safe',async()=>{
  const writeText=vi.fn().mockResolvedValue();vi.stubGlobal('navigator',{...navigator,clipboard:{writeText}});transport();mount();await screen.findByText('Fixture Bank');
  fireEvent.click(screen.getByRole('button',{name:'Sao chép số tài khoản'}));await screen.findByText(/Đã sao chép số tài khoản/);expect(writeText).toHaveBeenCalledWith('00123456789');
  writeText.mockRejectedValueOnce(new Error('blocked'));fireEvent.click(screen.getByRole('button',{name:'Sao chép nội dung chuyển khoản'}));await screen.findByText(/Không thể sao chép nội dung/);
});
it.each([['image/jpeg','proof.jpg'],['image/png','proof.png']])('accepts %s without auto upload',async(type,name)=>{
  const calls=transport();mount();await select(new File(['ok'],name,{type}));expect(screen.getByText(name)).toBeTruthy();expect(screen.getByRole('img',{name:'Xem trước minh chứng thanh toán'})).toBeTruthy();expect(proofCalls(calls)).toHaveLength(0);
});
it('revokes object URLs when replacing, deleting and unmounting previews',async()=>{
  transport();const view=mount();await select();expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  await select(new File(['x'],'next.jpg',{type:'image/jpeg'}));expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:payment-preview');
  fireEvent.click(screen.getByRole('button',{name:'Xóa'}));expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  await select();view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
});
it('rejects MIME and >5,000,000 bytes, allows replace/remove',async()=>{
  const calls=transport();mount();await select(new File(['bad'],'proof.webp',{type:'image/webp'}));expect((await screen.findByRole('alert')).textContent).toContain('JPG hoặc PNG');
  await select(new File([new Uint8Array(5_000_001)],'large.png',{type:'image/png'}));expect((await screen.findByRole('alert')).textContent).toContain('5 MB');
  await select();expect(screen.getByText('proof.png')).toBeTruthy();await select(new File(['x'],'new.jpg',{type:'image/jpeg'}));expect(screen.queryByText('proof.png')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Xóa'}));expect(screen.queryByText('new.jpg')).toBeNull();expect(proofCalls(calls)).toHaveLength(0);
});
it('submits one FormData image with CSRF, no Content-Type, blocks duplicate and navigates after 201',async()=>{
  let finish;const calls=transport({proof:()=>new Promise(resolve=>{finish=resolve;})});mount();await submit();const button=screen.getByRole('button',{name:'Đang gửi minh chứng…'});fireEvent.click(button);
  expect(proofCalls(calls)).toHaveLength(1);const request=proofCalls(calls)[0].options;expect(request.body).toBeInstanceOf(FormData);expect([...request.body.keys()]).toEqual(['image']);expect(request.headers['Content-Type']).toBeUndefined();expect(request.headers['X-CSRF-Token']).toBe('csrf-test');
  await act(async()=>finish(ok({proof:{id:'7',status:'SUBMITTED'},booking:{id:'91',status:'PENDING_CONFIRMATION',expires_at:booking.expires_at}}, {},201)));
  await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/bookings/91'));
});
it('rapid same-tick submits create exactly one POST before React can rerender',async()=>{
  let finish;const calls=transport({proof:()=>new Promise(resolve=>{finish=resolve;})});const view=mount();await select();
  const form=view.container.querySelector('form');fireEvent.submit(form);fireEvent.submit(form);
  expect(proofCalls(calls)).toHaveLength(1);
  await act(async()=>finish(ok({proof:{id:'7',status:'SUBMITTED'},booking:{id:'91',status:'PENDING_CONFIRMATION',expires_at:booking.expires_at}}, {},201)));
  await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/bookings/91'));
});
it('StrictMode rerenders never create a mutation without one explicit submit',async()=>{
  const calls=transport();mountStrict();await screen.findByText('Fixture Bank');expect(proofCalls(calls)).toHaveLength(0);
  await submit();await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/bookings/91'));expect(proofCalls(calls)).toHaveLength(1);
});
it('409 reconciles to authoritative submitted state without a retry or false error',async()=>{
  let reads=0;const calls=transport({proof:()=>fail(409,'PROOF_ALREADY_SUBMITTED'),detail:()=>ok({...booking,status:++reads===1?'PENDING_PAYMENT':'PENDING_CONFIRMATION'})});mount();await submit();
  await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/bookings/91'));expect(proofCalls(calls)).toHaveLength(1);expect(screen.queryByText(/Booking đã có minh chứng/)).toBeNull();
});
it('409 preserves conflict when authoritative read still has no proof',async()=>{
  const calls=transport({proof:()=>fail(409,'PROOF_ALREADY_SUBMITTED'),detail:()=>ok(booking)});mount();await submit();
  expect(await screen.findByText(/Booking đã nhận một minh chứng thanh toán/)).toBeTruthy();expect(proofCalls(calls)).toHaveLength(1);expect(screen.getByRole('button',{name:'Gửi minh chứng'}).disabled).toBe(false);
});
it('malformed mutation success is verified by GET and never trusted directly',async()=>{
  const calls=transport({proof:()=>ok({unexpected:true}, {},201),detail:()=>ok(booking)});mount();await submit();
  expect(await screen.findByText(/chưa ghi nhận minh chứng/i)).toBeTruthy();expect(proofCalls(calls)).toHaveLength(1);expect(screen.getByTestId('location').textContent).toBe('/bookings/91/payment');
});
it('an in-flight result is ignored after the payment component unmounts',async()=>{
  let finish;const calls=transport({proof:()=>new Promise(resolve=>{finish=resolve;})});const view=mount();await submit();expect(proofCalls(calls)).toHaveLength(1);view.unmount();
  await act(async()=>finish(ok({proof:{id:'7',status:'SUBMITTED'},booking:{id:'91',status:'PENDING_CONFIRMATION',expires_at:booking.expires_at}}, {},201)));
  expect(proofCalls(calls)).toHaveLength(1);
});
it('cancel uses an accessible confirmation, authoritative refetch and navigates to detail',async()=>{
  const calls=transport();mount();fireEvent.click(await screen.findByRole('button',{name:'Hủy đặt sân'}));
  const dialog=screen.getByRole('dialog',{name:'Hủy đặt sân?'});expect(dialog.getAttribute('aria-modal')).toBe('true');expect(screen.getByText(/không thể hoàn tác/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Không, giữ đặt sân'}));expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Hủy đặt sân'}));fireEvent.click(screen.getAllByRole('button',{name:'Hủy đặt sân'}).at(-1));
  await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/bookings/91'));
  const cancelCalls=calls.filter(c=>c.u.pathname==='/api/v1/bookings/91/cancel');expect(cancelCalls).toHaveLength(1);expect(cancelCalls[0].options.method).toBe('POST');expect(cancelCalls[0].options.headers['X-CSRF-Token']).toBe('csrf-test');
});
it('cancel expiry conflict refetches authority and never reports cancellation success',async()=>{
  let reads=0;transport({cancel:()=>fail(409,'BOOKING_EXPIRED'),detail:()=>ok({...booking,status:++reads===1?'PENDING_PAYMENT':'EXPIRED'})});mount();
  fireEvent.click(await screen.findByRole('button',{name:'Hủy đặt sân'}));fireEvent.click(screen.getAllByRole('button',{name:'Hủy đặt sân'}).at(-1));
  await screen.findByText('Yêu cầu đặt sân đã hết hạn');expect(screen.queryByText(/Hủy thành công/)).toBeNull();expect(screen.queryByRole('button',{name:'Hủy đặt sân'})).toBeNull();
});
it.each([[409,'BOOKING_EXPIRED'],[409,'PROOF_ALREADY_SUBMITTED'],[409,'INVALID_BOOKING_STATE'],[413,'PROOF_TOO_LARGE'],[415,'INVALID_FILE_TYPE'],[422,'INVALID_IMAGE']])('handles %s %s without automatic POST retry',async(status,code)=>{
  const calls=transport({proof:()=>fail(status,code)});mount();await submit();await screen.findByRole('alert');expect(proofCalls(calls)).toHaveLength(1);
});
it('unknown network result recovers PENDING_CONFIRMATION through GET and navigates',async()=>{
  let lost=false,reads=0;const calls=transport({proof:()=>{lost=true;return Promise.reject(new TypeError('lost response'));},detail:()=>{reads++;return ok({...booking,status:lost?'PENDING_CONFIRMATION':'PENDING_PAYMENT'});}});mount();await submit();
  await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/bookings/91'));expect(proofCalls(calls)).toHaveLength(1);expect(reads).toBeGreaterThan(1);
});
it('unknown result recovered as pending payment allows only user-initiated retry',async()=>{
  const calls=transport({proof:()=>Promise.reject(new TypeError('lost response'))});mount();await submit();await screen.findByText(/chưa ghi nhận minh chứng/i);
  expect(proofCalls(calls)).toHaveLength(1);expect(screen.getByRole('button',{name:'Gửi minh chứng'}).disabled).toBe(false);
});
it('failed verification locks submit and offers explicit status check',async()=>{
  let lost=false;const calls=transport({proof:()=>{lost=true;return Promise.reject(new TypeError('lost response'));},detail:()=>lost?fail(503,'SERVICE_UNAVAILABLE'):ok(booking)});mount();await submit();await screen.findByText(/Chưa xác minh được kết quả/);
  expect(screen.getByRole('button',{name:'Gửi minh chứng'}).disabled).toBe(true);expect(screen.getByRole('button',{name:'Kiểm tra lại trạng thái'})).toBeTruthy();expect(proofCalls(calls)).toHaveLength(1);
});
it('renders submitted proof read-only from private API with backend metadata',async()=>{
  const calls=transport({detail:()=>ok({...booking,status:'PENDING_CONFIRMATION'})});mount();
  expect(await screen.findByText('Chờ chủ sân xác nhận')).toBeTruthy();expect((await screen.findByRole('img',{name:'Minh chứng thanh toán đã gửi'})).getAttribute('src')).toBe('https://private.example.invalid/proof-1');
  for(const text of ['Đã gửi minh chứng','24.000 ₫','Fixture Bank','BOOKING 91','06/10/2026 08:00'])expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  expect(calls.some(c=>c.options.method==='GET'&&c.u.pathname.endsWith('/proof'))).toBe(true);
  expect(screen.queryByRole('timer')).toBeNull();expect(screen.queryByRole('button',{name:'Hủy đặt sân'})).toBeNull();expect(screen.queryByLabelText(/Chọn ảnh/)).toBeNull();expect(screen.queryByRole('button',{name:'Gửi minh chứng'})).toBeNull();
});
it.each([[403,'FORBIDDEN'],[404,'RESOURCE_NOT_FOUND'],[503,'SERVICE_UNAVAILABLE']])('proof API %s fails safely',async(status,code)=>{
  transport({detail:()=>ok({...booking,status:'PENDING_CONFIRMATION'}),proofRead:()=>fail(status,code)});mount();expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.getByRole('button',{name:'Tải lại'})).toBeTruthy();
});
it('malformed or cross-booking proof response fails safely without rendering URL',async()=>{
  transport({detail:()=>ok({...booking,status:'PENDING_CONFIRMATION'}),proofRead:()=>ok({id:'7',booking_id:'999',status:'SUBMITTED',submitted_at:now,proof_image_url:'https://private.example.invalid/leak',proof_image_expires_at:'2026-10-06T01:05:00.000Z'})});mount();
  expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByRole('img',{name:'Minh chứng thanh toán đã gửi'})).toBeNull();
});
it('refreshes a failed private URL once, then offers a manual retry without looping',async()=>{
  let proofReads=0;transport({detail:()=>ok({...booking,status:'PENDING_CONFIRMATION'}),proofRead:()=>ok({id:'7',booking_id:'91',status:'SUBMITTED',submitted_at:now,proof_image_url:`https://private.example.invalid/proof-${++proofReads}`,proof_image_expires_at:'2026-10-06T01:05:00.000Z'})});mount();
  const first=await screen.findByRole('img',{name:'Minh chứng thanh toán đã gửi'});fireEvent.error(first);await waitFor(()=>expect(proofReads).toBe(2));
  const second=screen.getByRole('img',{name:'Minh chứng thanh toán đã gửi'});expect(second.getAttribute('src')).toContain('proof-2');fireEvent.error(second);
  expect(await screen.findByRole('alert')).toBeTruthy();expect(proofReads).toBe(2);
  fireEvent.click(screen.getByRole('button',{name:'Tải lại'}));await waitFor(()=>expect(proofReads).toBe(3));expect(screen.getByRole('img',{name:'Minh chứng thanh toán đã gửi'}).getAttribute('src')).toContain('proof-3');
});
it.each([
  ['CONFIRMED','Đặt sân đã được xác nhận'],['REJECTED','Đặt sân bị từ chối'],['EXPIRED','Yêu cầu đặt sân đã hết hạn'],['CANCELLED','Đặt sân đã được hủy'],['COMPLETED','Lịch đặt sân đã hoàn thành']
])('renders specialized %s state without payment mutations',async(status,title)=>{
  const calls=transport({detail:()=>ok({...booking,status})});mount();expect(await screen.findByText(title)).toBeTruthy();expect(screen.queryByRole('timer')).toBeNull();expect(screen.queryByLabelText(/Chọn ảnh/)).toBeNull();expect(screen.queryByRole('button',{name:/Gửi minh chứng|Hủy đặt sân/})).toBeNull();expect(calls.some(c=>c.u.pathname.endsWith('/proof'))).toBe(false);
});
it.each([['CONFIRMED','Đặt sân đã được xác nhận'],['REJECTED','Đặt sân bị từ chối']])('focus refresh changes submitted state to %s',async(next,title)=>{
  let reads=0;transport({detail:()=>ok({...booking,status:++reads===1?'PENDING_CONFIRMATION':next})});mount();await screen.findByText('Đã gửi minh chứng');fireEvent(window,new Event('focus'));expect(await screen.findByText(title)).toBeTruthy();expect(screen.queryByText('Đã gửi minh chứng')).toBeNull();
});
it('404 is generic and no bank/upload leaks',async()=>{
  transport({detail:()=>fail(404,'RESOURCE_NOT_FOUND')});mount();await screen.findByText(/Không tìm thấy booking hoặc/);expect(screen.queryByText('Fixture Bank')).toBeNull();expect(screen.queryByLabelText(/Chọn ảnh/)).toBeNull();
});
it('loading is distinct from error and does not render upload',async()=>{
  transport({detail:()=>new Promise(()=>{})});mount();expect(await screen.findByText('Đang tải thông tin thanh toán…')).toBeTruthy();expect(screen.queryByLabelText(/Chọn ảnh/)).toBeNull();
});
it('countdown zero refetches, disables submit and never invents EXPIRED',async()=>{
  let tick=0,reads=0;vi.spyOn(performance,'now').mockImplementation(()=>tick);transport({detail:()=>++reads===1?ok({...booking,expires_at:'2026-10-06T01:00:01.000Z'}):new Promise(()=>{})});mount();await select();tick=1500;
  await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));expect(screen.getByRole('button',{name:'Gửi minh chứng'}).disabled).toBe(true);expect(screen.queryByText('Hết hạn')).toBeNull();expect(reads).toBeGreaterThan(1);
});
it('focus sync error disables upload/submit without local expiry',async()=>{
  let failed=false;transport({detail:()=>failed?fail(503,'SERVICE_UNAVAILABLE'):ok(booking)});mount();await select();failed=true;fireEvent(window,new Event('focus'));
  await screen.findByText(/Chưa xác minh được trạng thái hiện tại/);expect(screen.getByRole('button',{name:'Gửi minh chứng'}).disabled).toBe(true);expect(screen.queryByText('Hết hạn')).toBeNull();
});
it('keeps a valid file and enables submit while focus refresh is pending',async()=>{
  let reads=0,releaseRefresh;const pendingRefresh=new Promise(resolve=>{releaseRefresh=resolve;});
  const calls=transport({detail:()=>++reads===1?ok(booking):pendingRefresh});mount();await select();
  fireEvent(window,new Event('focus'));await waitFor(()=>expect(reads).toBe(2));
  expect(screen.getByText('proof.png')).toBeTruthy();
  const button=screen.getByRole('button',{name:'Gửi minh chứng'});expect(button.disabled).toBe(false);
  fireEvent.click(button);await waitFor(()=>expect(proofCalls(calls)).toHaveLength(1));
  releaseRefresh(ok({...booking,status:'PENDING_CONFIRMATION'}));
  await waitFor(()=>expect(screen.getByTestId('location').textContent).toBe('/bookings/91'));
});
it('terminal state returned by focus refresh removes the active upload',async()=>{
  let reads=0;transport({detail:()=>ok({...booking,status:++reads===1?'PENDING_PAYMENT':'EXPIRED'})});mount();await select();
  fireEvent(window,new Event('focus'));await screen.findByText('Yêu cầu đặt sân đã hết hạn');
  expect(screen.queryByText('proof.png')).toBeNull();expect(screen.queryByRole('button',{name:'Gửi minh chứng'})).toBeNull();
});
it('non-customer is blocked before booking/payment API',async()=>{
  const calls=transport({session:()=>ok({user:{...user,capabilities:['ADMIN']},csrf_token:'csrf-test'})});mount();await screen.findByText('Không có quyền truy cập');expect(calls.some(c=>c.u.pathname.includes('/bookings/91'))).toBe(false);
});

it('V2 pending confirmation payment route is read-only and never requests a V1 proof',async()=>{
  const calls=transport({detail:()=>ok({...booking,status:'PENDING_CONFIRMATION',booking_flow_version:2,confirmation_expires_at:'2026-10-06T01:30:00.000Z',transfer_reference:'CLDN 91'})});mount();
  await screen.findByText('Đang chờ chủ sân xác nhận');
  expect(calls.filter(call=>call.u.pathname.includes('/proof'))).toHaveLength(0);
  expect(screen.queryByRole('button',{name:'Gửi minh chứng'})).toBeNull();
  expect(screen.getByText('Fixture Bank')).toBeTruthy();
  expect(screen.getAllByText('CLDN 91')).toHaveLength(2);
  expect(screen.getAllByText(/24\.000/).length).toBeGreaterThan(0);
  expect(screen.getByRole('button',{name:'Sao chép số tài khoản'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Sao chép nội dung chuyển khoản'})).toBeTruthy();
});

it.each([
  ['CONFIRMED','Đã được chủ sân xác nhận'],
  ['EXPIRED','Thời gian chờ xác nhận đã hết.'],
])('V2 %s renders an authoritative read-only state without proof upload',async(status,text)=>{
  const calls=transport({detail:()=>ok({...booking,status,booking_flow_version:2,confirmation_expires_at:'2026-10-06T01:30:00.000Z',transfer_reference:'CLDN 91'})});mount();
  await screen.findByText(text);
  expect(calls.filter(call=>call.u.pathname.includes('/proof'))).toHaveLength(0);
  expect(screen.queryByRole('button',{name:'Gửi minh chứng'})).toBeNull();
});

it('V2 countdown reaching zero performs one authoritative refetch and renders server EXPIRED',async()=>{
  let tick=0,reads=0;vi.spyOn(performance,'now').mockImplementation(()=>tick);
  const pending={...booking,status:'PENDING_CONFIRMATION',booking_flow_version:2,confirmation_expires_at:'2026-10-06T01:00:01.000Z',transfer_reference:'CLDN 91'};
  const calls=transport({detail:()=>ok({...pending,status:++reads===1?'PENDING_CONFIRMATION':'EXPIRED'})});mount();
  await screen.findByText('Đang chờ chủ sân xác nhận');tick=1500;
  await act(async()=>new Promise(resolve=>setTimeout(resolve,350)));
  expect(await screen.findByText('Thời gian chờ xác nhận đã hết.')).toBeTruthy();
  expect(reads).toBe(2);expect(calls.filter(call=>call.u.pathname==='/api/v1/bookings/91')).toHaveLength(2);
  expect(calls.filter(call=>call.u.pathname.includes('/proof'))).toHaveLength(0);
});
