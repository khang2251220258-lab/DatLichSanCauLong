import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../src/routes/AppRoutes';
import { AuthProvider } from '../src/features/auth/AuthContext';

const now='2026-10-10T01:00:00.000Z', future='2026-10-11T02:00:00.000Z';
const refund={id:'71',booking_id:'112',amount:'36000',status:'PENDING',reason:'Khách hủy đúng chính sách',requested_at:now,proof_submitted_at:null,confirmed_at:null,refunded_at:null};
const customerBooking={id:'112',court_id:'40',status:'CANCELLED',booking_flow_version:1,transfer_reference:null,confirmation_expires_at:null,confirmed_by_user_id:null,start_at:future,end_at:'2026-10-11T03:00:00.000Z',expires_at:'2026-10-10T01:05:00.000Z',created_at:now,total_amount:'120000',deposit_amount:'36000',remaining_amount:'84000',facility_name_snapshot:'Facility',facility_address_snapshot:'Address',court_name_snapshot:'Sân 1',cancellation_cutoff_hours_snapshot:2,cancelled_at:now,cancelled_by:'CUSTOMER',cancellation_reason:null,bank_name_snapshot:'Bank',account_number_snapshot:'123',account_holder_snapshot:'Owner',qr_image_url:null,qr_image_expires_at:null,refund,slots:[]};
const ownerBooking={id:'112',status:'CANCELLED',booking_flow_version:1,transfer_reference:null,confirmation_expires_at:null,confirmed_by_user_id:null,start_at:future,end_at:'2026-10-11T03:00:00.000Z',created_at:now,total_amount:'120000',deposit_amount:'36000',remaining_amount:'84000',confirmed_at:now,completed_at:null,rejected_at:null,rejection_reason:null,cancelled_at:now,cancelled_by:'CUSTOMER',cancellation_reason:null,customer:{id:'20',full_name:'Customer',phone:'0900000000'},facility:{id:'30',name:'Facility'},court:{id:'40',name:'Sân 1'},payment_proof:{id:'13',status:'APPROVED',submitted_at:now,reviewed_at:now,rejection_reason:null},refund,slots:[]};
const ok=(data,status=200)=>new Response(JSON.stringify({data,meta:{server_time:now}}),{status});
const fail=(status,code)=>new Response(JSON.stringify({error:{code}}),{status});
function mount(path,user,handler){const calls=[];vi.stubGlobal('fetch',vi.fn(async(url,options)=>{const p=new URL(url).pathname;calls.push({p,options});
  if(p.endsWith('/auth/session'))return ok({user,csrf_token:'csrf'});
  return handler(p,options,calls);
}));render(<MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes/></AuthProvider></MemoryRouter>);return calls;}

it('Owner uploads one validated refund proof and refreshes to PROOF_SUBMITTED',async()=>{let submitted=false;
  const calls=mount('/owner/bookings/112',{id:'10',full_name:'Owner',capabilities:['CUSTOMER','OWNER']},async(p)=>{
    if(p==='/api/v1/owner/bookings/112')return ok({...ownerBooking,refund:submitted?{...refund,status:'PROOF_SUBMITTED',proof_submitted_at:now}:refund});
    if(p==='/api/v1/owner/refunds/71/proof'){submitted=true;return ok({...refund,status:'PROOF_SUBMITTED',proof_submitted_at:now},201);}
    if(p==='/api/v1/owner/refunds/71')return ok({...refund,status:'PROOF_SUBMITTED',proof_submitted_at:now,proof_image_url:'https://private.invalid/refund',proof_image_expires_at:future});
    throw new Error('Unexpected '+p);
  });
  await screen.findByText('Tải ảnh bằng chứng hoàn tiền');const input=document.querySelector('#refund-proof');
  fireEvent.change(input,{target:{files:[new File(['png'],'proof.png',{type:'image/png'})]}});
  fireEvent.click(screen.getByRole('button',{name:'Gửi bằng chứng hoàn tiền'}));
  await screen.findByText('Chờ khách hàng xác nhận');
  const post=calls.find(call=>call.p.endsWith('/proof'));expect(post.options.method).toBe('POST');expect(post.options.body).toBeInstanceOf(FormData);
});

it('Owner rejects invalid refund file before request',async()=>{const calls=mount('/owner/bookings/112',{id:'10',full_name:'Owner',capabilities:['CUSTOMER','OWNER']},(p)=>p==='/api/v1/owner/bookings/112'?ok(ownerBooking):Promise.reject(new Error('unexpected')));
  await screen.findByText('Tải ảnh bằng chứng hoàn tiền');fireEvent.change(document.querySelector('#refund-proof'),{target:{files:[new File(['x'],'proof.gif',{type:'image/gif'})]}});
  expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.getByRole('button',{name:'Gửi bằng chứng hoàn tiền'}).disabled).toBe(true);expect(calls.some(call=>call.p.endsWith('/proof'))).toBe(false);
});

it('Customer views private proof and confirms through modal, then sees terminal state',async()=>{let confirmed=false;
  const submitted={...refund,status:'PROOF_SUBMITTED',proof_submitted_at:now};
  const calls=mount('/bookings/112',{id:'20',full_name:'Customer',capabilities:['CUSTOMER']},async(p,options)=>{
    if(p==='/api/v1/bookings/112')return ok({...customerBooking,refund:confirmed?{...submitted,status:'REFUNDED',confirmed_at:now,refunded_at:now}:submitted});
    if(p==='/api/v1/refunds/71'&&options.method==='GET')return ok({...submitted,proof_image_url:'https://private.invalid/refund',proof_image_expires_at:future});
    if(p==='/api/v1/refunds/71/confirm'){confirmed=true;return ok({...submitted,status:'REFUNDED',confirmed_at:now,refunded_at:now});}
    throw new Error('Unexpected '+p);
  });
  expect(await screen.findByAltText('Bằng chứng hoàn tiền')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Xác nhận đã nhận tiền'}));
  expect(screen.queryByText('Booking đã được hủy.')).toBeNull();expect(screen.queryByRole('heading',{name:'Cập nhật trạng thái'})).toBeNull();
  expect(screen.getByRole('dialog')).toBeTruthy();fireEvent.click(screen.getAllByRole('button',{name:'Xác nhận đã nhận tiền'}).at(-1));
  await screen.findByText('Đã hoàn tiền');expect(screen.queryByText('Booking đã được hủy.')).toBeNull();expect(screen.queryByRole('heading',{name:'Cập nhật trạng thái'})).toBeNull();expect(calls.filter(call=>call.p.endsWith('/confirm'))).toHaveLength(1);
});

it('Customer confirmation 409 refetches and keeps action protected',async()=>{let reads=0;
  const submitted={...refund,status:'PROOF_SUBMITTED',proof_submitted_at:now};
  const calls=mount('/bookings/112',{id:'20',full_name:'Customer',capabilities:['CUSTOMER']},async(p,options)=>{
    if(p==='/api/v1/bookings/112'){reads++;return ok({...customerBooking,refund:submitted});}
    if(p==='/api/v1/refunds/71'&&options.method==='GET')return ok({...submitted,proof_image_url:'https://private.invalid/refund',proof_image_expires_at:future});
    if(p==='/api/v1/refunds/71/confirm')return fail(409,'INVALID_REFUND_STATE');
    throw new Error('Unexpected '+p);
  });
  await screen.findByAltText('Bằng chứng hoàn tiền');fireEvent.click(screen.getByRole('button',{name:'Xác nhận đã nhận tiền'}));fireEvent.click(screen.getAllByRole('button',{name:'Xác nhận đã nhận tiền'}).at(-1));
  await screen.findByRole('alert');expect(reads).toBeGreaterThan(1);expect(calls.filter(call=>call.p.endsWith('/confirm'))).toHaveLength(1);
});

it('Customer PENDING is read-only and does not request a proof URL',async()=>{const calls=mount('/bookings/112',{id:'20',full_name:'Customer',capabilities:['CUSTOMER']},(p)=>p==='/api/v1/bookings/112'?ok(customerBooking):Promise.reject(new Error('unexpected')));
  expect(await screen.findByText('Chờ hoàn tiền')).toBeTruthy();expect(screen.queryByText('Booking đã được hủy.')).toBeNull();expect(screen.queryByRole('heading',{name:'Cập nhật trạng thái'})).toBeNull();expect(screen.queryByRole('button',{name:'Xác nhận đã nhận tiền'})).toBeNull();expect(calls.some(call=>call.p==='/api/v1/refunds/71')).toBe(false);
});

it('REFUNDED is immutable for Owner and Customer',async()=>{const terminal={...refund,status:'REFUNDED',proof_submitted_at:now,confirmed_at:now,refunded_at:now};
  const calls=mount('/owner/bookings/112',{id:'10',full_name:'Owner',capabilities:['CUSTOMER','OWNER']},(p)=>p==='/api/v1/owner/bookings/112'?ok({...ownerBooking,refund:terminal}):p==='/api/v1/owner/refunds/71'?ok({...terminal,proof_image_url:'https://private.invalid/refund',proof_image_expires_at:future}):Promise.reject(new Error('unexpected')));
  expect(await screen.findByText('Đã hoàn tiền')).toBeTruthy();expect(document.querySelector('#refund-proof')).toBeNull();expect(screen.queryByRole('button',{name:'Gửi bằng chứng hoàn tiền'})).toBeNull();expect(calls.some(call=>call.options.method==='POST')).toBe(false);
});

it('Owner rejects an oversized file before mutation',async()=>{const calls=mount('/owner/bookings/112',{id:'10',full_name:'Owner',capabilities:['CUSTOMER','OWNER']},(p)=>p==='/api/v1/owner/bookings/112'?ok(ownerBooking):Promise.reject(new Error('unexpected')));
  await screen.findByText('Tải ảnh bằng chứng hoàn tiền');fireEvent.change(document.querySelector('#refund-proof'),{target:{files:[new File([new Uint8Array(5_000_001)],'large.png',{type:'image/png'})]}});
  expect(await screen.findByRole('alert')).toBeTruthy();expect(calls.some(call=>call.p.endsWith('/proof'))).toBe(false);
});

it('Malformed Refund summary fails closed',async()=>{mount('/bookings/112',{id:'20',full_name:'Customer',capabilities:['CUSTOMER']},(p)=>p==='/api/v1/bookings/112'?ok({...customerBooking,refund:{...refund,status:'PENDING',confirmed_at:now}}):Promise.reject(new Error('unexpected')));
  expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('Chờ hoàn tiền')).toBeNull();
});

it('unknown confirmation stays fail-closed until a validated authoritative refresh succeeds',async()=>{let bookingReads=0;
  const submitted={...refund,status:'PROOF_SUBMITTED',proof_submitted_at:now};
  const calls=mount('/bookings/112',{id:'20',full_name:'Customer',capabilities:['CUSTOMER']},async(p,options)=>{
    if(p==='/api/v1/bookings/112'){bookingReads++;if(bookingReads===1||bookingReads>=4)return ok({...customerBooking,refund:submitted});throw new TypeError('offline');}
    if(p==='/api/v1/refunds/71'&&options.method==='GET')return ok({...submitted,proof_image_url:'https://private.invalid/refund',proof_image_expires_at:future});
    if(p==='/api/v1/refunds/71/confirm')throw new TypeError('unknown');
    throw new Error('Unexpected '+p);
  });
  await screen.findByAltText('Bằng chứng hoàn tiền');fireEvent.click(screen.getByRole('button',{name:'Xác nhận đã nhận tiền'}));fireEvent.click(screen.getAllByRole('button',{name:'Xác nhận đã nhận tiền'}).at(-1));
  const recover=await screen.findByRole('button',{name:'Kiểm tra lại trạng thái'});expect(screen.getByRole('button',{name:'Xác nhận đã nhận tiền'}).disabled).toBe(true);
  fireEvent.click(recover);await screen.findByText('Chưa thể xác minh trạng thái hoàn cọc. Vui lòng thử lại.');expect(screen.getByRole('button',{name:'Kiểm tra lại trạng thái'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Kiểm tra lại trạng thái'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'Kiểm tra lại trạng thái'})).toBeNull());expect(screen.getByRole('button',{name:'Xác nhận đã nhận tiền'})).toBeTruthy();expect(calls.filter(call=>call.p.endsWith('/confirm'))).toHaveLength(1);
});

it('authoritative REFUNDED recovery becomes terminal and malformed refresh stays fail-closed',async()=>{let bookingReads=0;
  const submitted={...refund,status:'PROOF_SUBMITTED',proof_submitted_at:now};
  mount('/bookings/112',{id:'20',full_name:'Customer',capabilities:['CUSTOMER']},async(p,options)=>{
    if(p==='/api/v1/bookings/112'){bookingReads++;if(bookingReads===1)return ok({...customerBooking,refund:submitted});if(bookingReads===2)return new Response(JSON.stringify({data:{status:'bad'},meta:{server_time:now}}),{status:200});return ok({...customerBooking,refund:{...submitted,status:'REFUNDED',confirmed_at:now,refunded_at:now}});}
    if(p==='/api/v1/refunds/71'&&options.method==='GET')return ok({...submitted,proof_image_url:'https://private.invalid/refund',proof_image_expires_at:future});
    if(p==='/api/v1/refunds/71/confirm')throw new TypeError('unknown');
    throw new Error('Unexpected '+p);
  });
  await screen.findByAltText('Bằng chứng hoàn tiền');fireEvent.click(screen.getByRole('button',{name:'Xác nhận đã nhận tiền'}));fireEvent.click(screen.getAllByRole('button',{name:'Xác nhận đã nhận tiền'}).at(-1));
  expect(await screen.findByRole('button',{name:'Kiểm tra lại trạng thái'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Kiểm tra lại trạng thái'}));await screen.findByText('Đã hoàn tiền');expect(screen.queryByRole('button',{name:'Xác nhận đã nhận tiền'})).toBeNull();
});

it('expired proof is hidden and one validated reload replaces it without duplicate requests',async()=>{let proofReads=0;
  const submitted={...refund,status:'PROOF_SUBMITTED',proof_submitted_at:now},soon=new Date(Date.parse(now)+80).toISOString();
  const calls=mount('/bookings/112',{id:'20',full_name:'Customer',capabilities:['CUSTOMER']},async(p,options)=>{
    if(p==='/api/v1/bookings/112')return ok({...customerBooking,refund:submitted});
    if(p==='/api/v1/refunds/71'&&options.method==='GET'){proofReads++;return ok({...submitted,proof_image_url:'https://private.invalid/refund-'+proofReads,proof_image_expires_at:proofReads===1?soon:future});}
    throw new Error('Unexpected '+p);
  });
  expect(await screen.findByAltText('Bằng chứng hoàn tiền')).toBeTruthy();await new Promise(resolve=>setTimeout(resolve,100));
  await waitFor(()=>expect(screen.getByAltText('Bằng chứng hoàn tiền').getAttribute('src')).toContain('refund-2'));expect(calls.filter(call=>call.p==='/api/v1/refunds/71')).toHaveLength(2);
});

it('failed expired-proof refresh keeps stale proof hidden and allows another safe attempt',async()=>{let proofReads=0;
  const submitted={...refund,status:'PROOF_SUBMITTED',proof_submitted_at:now},soon=new Date(Date.parse(now)+60).toISOString();
  mount('/bookings/112',{id:'20',full_name:'Customer',capabilities:['CUSTOMER']},async(p,options)=>{
    if(p==='/api/v1/bookings/112')return ok({...customerBooking,refund:submitted});
    if(p==='/api/v1/refunds/71'&&options.method==='GET'){proofReads++;if(proofReads===1)return ok({...submitted,proof_image_url:'https://private.invalid/stale',proof_image_expires_at:soon});throw new TypeError('offline');}
    throw new Error('Unexpected '+p);
  });
  await screen.findByAltText('Bằng chứng hoàn tiền');await new Promise(resolve=>setTimeout(resolve,80));
  expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByAltText('Bằng chứng hoàn tiền')).toBeNull();expect(screen.getByRole('button',{name:'Tải lại'})).toBeTruthy();
});
