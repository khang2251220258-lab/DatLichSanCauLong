import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';

test('Recurring Search PostgreSQL strict all-occurrence semantics', { timeout: 600000 }, async t => {
  const tag = `TEST_RECURRING_${randomUUID()}`, time = value => new Date(`1970-01-01T${value}:00.000Z`);
  const storage = { url: id => `https://images.example.invalid/${id}` };
  let server, owner, customer, facility, court, rule, booking, block;
  try {
    const [{ now, start_date, end_date }]=await prisma.$queryRaw`SELECT clock_timestamp() now,
      to_char((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 2, 'YYYY-MM-DD') start_date,
      to_char((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 16, 'YYYY-MM-DD') end_date`;
    const weekday = new Date(`${start_date}T00:00:00Z`).getUTCDay() || 7;
    const occurrence1 = new Date(`${start_date}T18:00:00+07:00`), occurrence2 = new Date(+occurrence1 + 7 * 86400000), end2 = new Date(+occurrence2 + 3600000);
    const user = suffix => prisma.user.create({data:{email:`${tag}-${suffix}@example.invalid`,email_normalized:`${tag}-${suffix}@example.invalid`.toLowerCase(),full_name:tag,google_subject:`${tag}-${suffix}`,role:'CUSTOMER',status:'ACTIVE',created_at:now}});
    owner=await user('owner'); customer=await user('customer');
    const request=await prisma.ownerRequest.create({data:{user_id:owner.id,status:'APPROVED',applicant_name_snapshot:tag,applicant_email_snapshot:owner.email,reviewed_by:owner.id,reviewed_at:now,created_at:now}});
    await prisma.ownerProfile.create({data:{user_id:owner.id,approved_request_id:request.id,created_at:now}});
    facility=await prisma.facility.create({data:{owner_id:owner.id,name:tag,address:'Fixture',district:'Phường Hải Châu',phone:'0123456789',opening_time:time('06:00'),closing_time:time('22:00'),status:'ACTIVE',created_at:now}});
    court=await prisma.court.create({data:{facility_id:facility.id,name:`${tag}-A`,status:'ACTIVE',created_at:now}});
    rule=await prisma.priceRule.create({data:{facility_id:facility.id,start_time:time('06:00'),end_time:time('22:00'),hourly_rate:'100000',created_at:now}});
    server=createApp(prisma,{nodeEnv:'development',frontendUrl:'http://localhost:5173'},undefined,undefined,undefined,storage).listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const search=async()=>{const qs=new URLSearchParams({q:tag,weekday:String(weekday),start_date,end_date,start_time:'18:00',end_time:'19:00'});const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/facilities/recurring-search?${qs}`,{signal:AbortSignal.timeout(60000)});return {status:response.status,body:await response.json()}};
    const createBooking=async data=>{booking=await prisma.booking.create({data:{customer_id:customer.id,court_id:court.id,status:data.status,booking_flow_version:data.version??1,start_at:occurrence2,end_at:end2,expires_at:data.expires??new Date(+now+3600000),confirmation_expires_at:data.confirmation??null,total_amount:'100000',deposit_amount:'30000',remaining_amount:'70000',bank_name_snapshot:'Fixture',account_number_snapshot:'1',account_holder_snapshot:'Fixture',facility_name_snapshot:tag,facility_address_snapshot:'Fixture',court_name_snapshot:court.name,rejected_at:data.status==='REJECTED'?now:null,rejection_reason:data.status==='REJECTED'?'Fixture':null,created_at:now}})};
    const clearBooking=async()=>{if(booking){await prisma.booking.delete({where:{id:booking.id}});booking=null}};
    await t.test('all occurrences free and priced match with public DTO and count',async()=>{const r=await search();assert.equal(r.status,200);assert.equal(r.body.meta.total,1);assert.equal(r.body.meta.occurrence_count,3);assert.deepEqual(r.body.data[0].matching_courts,[{id:String(court.id),name:court.name}]);for(const key of ['owner_id','account_number','booking_id','image_path'])assert.ok(!JSON.stringify(r.body).includes(key))});
    await t.test('BookingSeries additive model accepts valid foundation and enforces DB checks',async()=>{const data={customer_id:customer.id,facility_id:facility.id,court_id:court.id,weekday,start_time:time('18:00'),end_time:time('19:00'),starts_on:new Date(`${start_date}T00:00:00Z`),ends_on:new Date(`${end_date}T00:00:00Z`),occurrence_count:3,status:'PENDING_CONFIRMATION',confirmation_expires_at:new Date(+now+1800000),total_amount:'300000',deposit_amount:'90000',remaining_amount:'210000',bank_name_snapshot:'Fixture',account_number_snapshot:'1',account_holder_snapshot:'Fixture',facility_name_snapshot:tag,facility_address_snapshot:'Fixture',court_name_snapshot:court.name,created_at:now};const series=await prisma.bookingSeries.create({data});assert.equal(series.status,'PENDING_CONFIRMATION');await assert.rejects(prisma.bookingSeries.create({data:{...data,weekday:8}}),error=>error.code==='P2004'||String(error.message).includes('check constraint'));await prisma.bookingSeries.delete({where:{id:series.id}})});
    await t.test('one booked occurrence and one overlapping block remove the Court; touching boundary does not',async()=>{await createBooking({status:'CONFIRMED'});assert.equal((await search()).body.meta.total,0);await clearBooking();block=await prisma.courtBlock.create({data:{court_id:court.id,start_at:new Date(+occurrence2+1800000),end_at:end2,reason:'Fixture',created_by:owner.id,created_at:now}});assert.equal((await search()).body.meta.total,0);await prisma.courtBlock.delete({where:{id:block.id}});block=null;block=await prisma.courtBlock.create({data:{court_id:court.id,start_at:end2,end_at:new Date(+end2+1800000),reason:'Fixture',created_by:owner.id,created_at:now}});assert.equal((await search()).body.meta.total,1);await prisma.courtBlock.delete({where:{id:block.id}});block=null});
    await t.test('effective V2 hold blocks; stale V2 hold is read-only and does not block',async()=>{await createBooking({status:'PENDING_CONFIRMATION',version:2,confirmation:new Date(+now+3600000)});assert.equal((await search()).body.meta.total,0);await clearBooking();await createBooking({status:'PENDING_CONFIRMATION',version:2,confirmation:new Date(+now-1000)});assert.equal((await search()).body.meta.total,1);assert.equal((await prisma.booking.findUnique({where:{id:booking.id}})).status,'PENDING_CONFIRMATION');await clearBooking()});
    await t.test('V1 effective holds block while stale payment hold and terminal state do not',async()=>{await createBooking({status:'PENDING_CONFIRMATION'});assert.equal((await search()).body.meta.total,0);await clearBooking();await createBooking({status:'PENDING_PAYMENT',expires:new Date(+now+3600000)});assert.equal((await search()).body.meta.total,0);await clearBooking();await createBooking({status:'PENDING_PAYMENT',expires:new Date(+now-1000)});assert.equal((await search()).body.meta.total,1);assert.equal((await prisma.booking.findUnique({where:{id:booking.id}})).status,'PENDING_PAYMENT');await clearBooking();await createBooking({status:'REJECTED'});assert.equal((await search()).body.meta.total,1);await clearBooking()});
    await t.test('missing price and inactive resource remove results',async()=>{await prisma.priceRule.delete({where:{id:rule.id}});assert.equal((await search()).body.meta.total,0);rule=await prisma.priceRule.create({data:{facility_id:facility.id,start_time:time('06:00'),end_time:time('22:00'),hourly_rate:'100000',created_at:now}});await prisma.court.update({where:{id:court.id},data:{status:'INACTIVE'}});assert.equal((await search()).body.meta.total,0);await prisma.court.update({where:{id:court.id},data:{status:'ACTIVE'}});await prisma.user.update({where:{id:owner.id},data:{status:'LOCKED',locked_at:now,locked_reason:'Fixture'}});assert.equal((await search()).body.meta.total,0)});
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    if(block)await prisma.courtBlock.deleteMany({where:{id:block.id}}); if(booking)await prisma.booking.deleteMany({where:{id:booking.id}});
    if(facility){await prisma.priceRule.deleteMany({where:{facility_id:facility.id}});await prisma.court.deleteMany({where:{facility_id:facility.id}});await prisma.facility.deleteMany({where:{id:facility.id}})}
    if(owner){await prisma.ownerProfile.deleteMany({where:{user_id:owner.id}});await prisma.ownerRequest.deleteMany({where:{user_id:owner.id}})}
    await prisma.user.deleteMany({where:{id:{in:[owner?.id,customer?.id].filter(Boolean)}}});
    assert.equal(await prisma.user.count({where:{email_normalized:{startsWith:tag.toLowerCase()}}}),0);assert.equal(await prisma.bookingSeries.count(),0);
    await prisma.$disconnect(); console.log('RECURRING SEARCH FIXTURE CLEANUP: PASS');
  }
});
