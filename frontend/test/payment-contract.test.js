import { expect, it } from 'vitest';
import { bookingDetailResponse, customerProofResponse } from '../src/services/responseValidators';

const now='2026-10-08T01:00:00.000Z';
const booking={data:{id:'1',status:'PENDING_PAYMENT',cancellation_cutoff_hours_snapshot:null,expires_at:'2026-10-08T01:05:00.000Z',
  total_amount:'100000',deposit_amount:'30000',remaining_amount:'70000',bank_name_snapshot:'Bank',
  account_number_snapshot:'001',account_holder_snapshot:'A',qr_image_url:null,qr_image_expires_at:null,refund:null,slots:[]},meta:{server_time:now}};
const proof={data:{id:'2',booking_id:'1',status:'SUBMITTED',submitted_at:now,
  proof_image_url:'https://private.example.invalid/proof',proof_image_expires_at:'2026-10-08T01:05:00.000Z'},meta:{server_time:now}};

it('validates the customer payment Booking whitelist and nullable QR URL',()=>{
  expect(bookingDetailResponse(booking)).toBe(true);
  expect(bookingDetailResponse({...booking,data:{...booking.data,qr_image_url:'https://image.example.invalid/qr',qr_image_expires_at:'2026-10-05T01:05:00.000Z'}})).toBe(true);
  for(const patch of [{status:'UNKNOWN'},{total_amount:1},{deposit_amount:'x'},{expires_at:'bad'},
    {bank_name_snapshot:null},{qr_image_url:'javascript:bad'}])
    expect(bookingDetailResponse({...booking,data:{...booking.data,...patch}})).toBe(false);
});

it('validates private proof metadata and rejects raw paths or malformed URLs',()=>{
  expect(customerProofResponse(proof)).toBe(true);
  for(const patch of [{status:'UNKNOWN'},{submitted_at:'bad'},{proof_image_url:'http://insecure.invalid'},
    {proof_image_expires_at:'bad'},{image_path:'payment-proofs/raw'}])
    expect(customerProofResponse({...proof,data:{...proof.data,...patch}})).toBe(false);
});
