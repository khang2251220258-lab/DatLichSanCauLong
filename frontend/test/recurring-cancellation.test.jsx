import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { AppRoutes } from '../src/routes/AppRoutes';

const now='2026-10-18T01:00:00.000Z',future='2026-10-25T11:00:00.000Z',customer={id:'10',full_name:'Khách định kỳ',capabilities:['CUSTOMER']};
const refund=(status='PENDING')=>({id:'71',booking_id:'501',amount:'30000',status,reason:'Khách hủy đúng chính sách',requested_at:now,proof_submitted_at:status==='PENDING'?null:now,confirmed_at:status==='REFUNDED'?now:null,refunded_at:status==='REFUNDED'?now:null});
const occurrence=(overrides={})=>({booking_id:'501',start_at:future,end_at:'2026-10-25T12:00:00.000Z',total_amount:'100000',deposit_amount:'30000',remaining_amount:'70000',status:'CONFIRMED',can_cancel:true,cancellation_deadline:'2026-10-25T09:00:00.000Z',cancellation_block_reason:null,cancelled_at:null,cancelled_by:null,cancellation_reason:null,refund:null,...overrides});
const cancelled=(status='PENDING')=>occurrence({status:'CANCELLED',can_cancel:false,cancellation_block_reason:'INVALID_BOOKING_STATE',cancelled_at:now,cancelled_by:'CUSTOMER',refund:refund(status)});
const blocked=occurrence({booking_id:'502',start_at:'2026-11-01T11:00:00.000Z',end_at:'2026-11-01T12:00:00.000Z',can_cancel:false,cancellation_block_reason:'CANCELLATION_DEADLINE_PASSED'});
const base={id:'41',status:'CONFIRMED',weekday:7,start_date:'2026-10-25',end_date:'2026-11-01',start_time:'18:00',end_time:'19:00',occurrence_count:2,total_amount:'200000',deposit_amount:'60000',remaining_amount:'140000',confirmation_expires_at:'2026-10-17T01:30:00.000Z',transfer_reference:'CLDNS 41',created_at:'2026-10-17T01:00:00.000Z',facility:{id:'1',name:'Cơ sở định kỳ',address:'Địa chỉ demo'},court:{id:'2',name:'Sân 1'},bank:{bank_name:'Demo Bank',account_number:'00112233',account_holder:'DEMO OWNER',has_qr_image:false,qr_image_url:null,qr_image_expires_at:null},confirmed_at:now,confirmed_by_user_id:'20',rejected_at:null,rejection_reason:null,occurrences:[occurrence(),blocked]};
const ok=(data,status=200)=>new Response(JSON.stringify({data,meta:{server_time:now}}),{status});
const fail=(status,code)=>new Response(JSON.stringify({error:{code}}),{status});
function mount(handler){const calls=[];vi.stubGlobal('fetch',vi.fn(async(url,options={})=>{const path=new URL(url).pathname;calls.push({path,options});if(path.endsWith('/auth/session'))return ok({user:customer,csrf_token:'csrf'});return handler(path,options,calls);}));render(<MemoryRouter initialEntries={['/booking-series/41']}><AuthProvider><AppRoutes/></AuthProvider></MemoryRouter>);return calls;}

it('shows mixed occurrence eligibility without PaymentProof or eager Refund requests',async()=>{
  const calls=mount(path=>path==='/api/v1/booking-series/41'?ok(base):Promise.reject(new Error('Unexpected '+path)));
  expect(await screen.findByRole('button',{name:'Hủy buổi này'})).toBeTruthy();
  expect(screen.getByText('Đã quá thời hạn hủy buổi.')).toBeTruthy();
  expect(screen.getAllByText('30.000 ₫')).toHaveLength(2);
  expect(calls.some(call=>call.path.includes('/refunds/'))).toBe(false);
  expect(calls.some(call=>call.path.includes('/proof'))).toBe(false);
});

it('cancels exactly one occurrence once, refetches, and preserves the confirmed series and sibling',async()=>{
  let resolvePost,mutated=false;const pending=new Promise(resolve=>{resolvePost=resolve;});
  const calls=mount(path=>{
    if(path==='/api/v1/booking-series/41')return ok(mutated?{...base,occurrences:[cancelled(),blocked]}:base);
    if(path==='/api/v1/booking-series/41/occurrences/501/cancel'){mutated=true;return pending;}
    throw new Error('Unexpected '+path);
  });
  fireEvent.click(await screen.findByRole('button',{name:'Hủy buổi này'}));
  expect(screen.getByRole('dialog').textContent).toContain('30.000 ₫');
  const confirm=screen.getByRole('dialog').querySelector('.destructive');fireEvent.click(confirm);fireEvent.click(confirm);
  expect(calls.filter(call=>call.path.endsWith('/cancel'))).toHaveLength(1);
  const post=calls.find(call=>call.path.endsWith('/cancel'));expect(post.options.method).toBe('POST');expect(JSON.parse(post.options.body)).toEqual({});
  resolvePost(ok({series:{id:'41',status:'CONFIRMED'},occurrence:cancelled()}));
  expect(await screen.findByText('Đang chờ chủ sân hoàn cọc')).toBeTruthy();
  expect(screen.getByText('Đã quá thời hạn hủy buổi.')).toBeTruthy();
  expect(screen.getAllByText('Đã xác nhận').length).toBeGreaterThan(0);
});

it('recovers a 409 from the authoritative cancelled occurrence',async()=>{
  let phase='initial',reads=0;
  const calls=mount((path)=>{
    if(path==='/api/v1/booking-series/41'){reads++;return ok(phase==='conflict'?{...base,occurrences:[cancelled(),blocked]}:base);}
    if(path.endsWith('/cancel')){phase='conflict';return fail(409,'INVALID_BOOKING_STATE');}
    throw new Error('Unexpected '+path);
  });
  fireEvent.click(await screen.findByRole('button',{name:'Hủy buổi này'}));fireEvent.click(screen.getByRole('dialog').querySelector('.destructive'));
  expect(await screen.findByText('Đang chờ chủ sân hoàn cọc')).toBeTruthy();expect(reads).toBeGreaterThan(1);
  expect(calls.filter(call=>call.path.endsWith('/cancel'))).toHaveLength(1);
});

it('keeps cancellation fail-closed when an unknown result cannot be verified',async()=>{
  let initial=true;const calls=mount(path=>{
    if(path==='/api/v1/booking-series/41'){if(initial){initial=false;return ok(base);}throw new TypeError('offline');}
    if(path.endsWith('/cancel'))throw new TypeError('offline');
    throw new Error('Unexpected '+path);
  });
  fireEvent.click(await screen.findByRole('button',{name:'Hủy buổi này'}));fireEvent.click(screen.getByRole('dialog').querySelector('.destructive'));
  expect(await screen.findByText(/Kết quả thao tác chưa xác định/)).toBeTruthy();
  expect(calls.filter(call=>call.path.endsWith('/cancel'))).toHaveLength(1);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button',{name:'Hủy buổi này'}).disabled).toBe(true);
});

it('loads private refund proof only on demand and confirms receipt once',async()=>{
  let confirmed=false;const submitted=cancelled('PROOF_SUBMITTED');
  const calls=mount((path,options)=>{
    if(path==='/api/v1/booking-series/41')return ok({...base,occurrences:[confirmed?cancelled('REFUNDED'):submitted,blocked]});
    if(path==='/api/v1/refunds/71'&&options.method==='GET')return ok({...refund(confirmed?'REFUNDED':'PROOF_SUBMITTED'),proof_image_url:'https://private.invalid/refund',proof_image_expires_at:'2026-10-18T02:00:00.000Z'});
    if(path==='/api/v1/refunds/71/confirm'){confirmed=true;return ok(refund('REFUNDED'));}
    throw new Error('Unexpected '+path);
  });
  const show=await screen.findByRole('button',{name:'Xem minh chứng hoàn tiền'});expect(calls.some(call=>call.path==='/api/v1/refunds/71')).toBe(false);fireEvent.click(show);
  expect(await screen.findByAltText('Bằng chứng hoàn tiền')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Xác nhận đã nhận tiền'}));
  const confirmButtons=screen.getAllByRole('button',{name:'Xác nhận đã nhận tiền'});fireEvent.click(confirmButtons.at(-1));fireEvent.click(confirmButtons.at(-1));
  await waitFor(()=>expect(calls.filter(call=>call.path.endsWith('/confirm'))).toHaveLength(1));
  expect(await screen.findByText('Đã hoàn cọc')).toBeTruthy();
});

it('rejects a malformed cancelled/refund combination before rendering actions',async()=>{
  mount(path=>path==='/api/v1/booking-series/41'?ok({...base,occurrences:[{...cancelled(),refund:{...refund(),amount:'1'}},blocked]}):Promise.reject(new Error('Unexpected '+path)));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('Đang chờ chủ sân hoàn cọc')).toBeNull();
});
