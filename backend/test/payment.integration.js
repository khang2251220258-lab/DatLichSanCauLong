import test from 'node:test';
import sharp from 'sharp';
import { createPaymentService } from '../src/modules/payments/service.js';
import { createOwnerPaymentService } from '../src/modules/payments/owner-service.js';
import { proofInput } from '../src/modules/payments/validation.js';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createBookingService } from '../src/modules/bookings/service.js';
import { input } from '../src/modules/bookings/rules.js';
import { createAuthService } from '../src/modules/auth/service.js';

test('Payment PostgreSQL HTTP, expiry/concurrency, rollback and cleanup', {timeout:2400000}, async t => {
  const tag='payment-'+randomUUID(), users=[], sessions=[], facilities=[], courts=[];
  const config={nodeEnv:'development',frontendUrl:'http://localhost:5173'}, time=s=>new Date(`1970-01-01T${s}:00Z`);
  let server, date, clock;
  const objects=new Set(), uploads=[], destroyed=[];
  const privateUrls=[];
  const storage={ready(){},async upload(_buffer,id){objects.add(id);uploads.push(id);return id;},async destroy(id){objects.delete(id);destroyed.push(id);},
    privateUrl(id,mime,expiresAt){privateUrls.push({id,mime,expiresAt});return `https://private.example.invalid/proof?expires=${expiresAt}`;}};
  const cases=(name,fn)=>t.test(name,async()=>{try{await fn();}catch(e){if(e.code==='ERR_ASSERTION')throw e;throw new Error('PAYMENT_TEST_FAILED: '+(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'UNEXPECTED_ERROR'));}});
  try {
    clock=(await prisma.$queryRaw`SELECT clock_timestamp() AS now`)[0].now;
    date=new Date(+clock+86400000+7*3600000).toISOString().slice(0,10);
    for(let i=0;i<4;i++) {
      const email=`${tag}-${i}@example.invalid`, token=randomBytes(32).toString('base64url'), csrf_token=randomBytes(32).toString('hex');
      const u=await prisma.user.create({data:{email,email_normalized:email,full_name:tag,google_subject:email,role:i===3?'ADMIN':'CUSTOMER',status:'ACTIVE',created_at:clock}}); users.push(u);
      await prisma.authSession.create({data:{user_id:u.id,token_hash:createHash('sha256').update(token).digest(),csrf_token,created_at:clock,expires_at:new Date(+clock+86400000)}});
      sessions.push({token,csrf_token});
    }
    for(const i of [0,1]) {
      const r=await prisma.ownerRequest.create({data:{user_id:users[i].id,status:'APPROVED',applicant_name_snapshot:tag,applicant_email_snapshot:users[i].email,reviewed_by:users[3].id,reviewed_at:clock,created_at:clock}});
      await prisma.ownerProfile.create({data:{user_id:users[i].id,approved_request_id:r.id,created_at:clock}});
      const f=await prisma.facility.create({data:{owner_id:users[i].id,name:tag,address:'Fixture',district:'Phường Hải Châu',phone:'0123456789',opening_time:time('06:00'),closing_time:time('22:00'),status:'ACTIVE',created_at:clock}}); facilities.push(f);
      const c=await prisma.court.create({data:{facility_id:f.id,name:'Fixture',status:'ACTIVE',created_at:clock}}); courts.push(c);
      await prisma.priceRule.create({data:{facility_id:f.id,start_time:time('06:00'),end_time:time('22:00'),hourly_rate:'80001',created_at:clock}});
      await prisma.cancellationPolicy.create({data:{facility_id:f.id,cutoff_hours:0,created_at:clock}});
      await prisma.bankAccount.create({data:{facility_id:f.id,bank_name:'Fixture Bank',account_number:'123',account_holder:'Fixture',created_at:clock}});
    }
    const forbid=()=>{throw new Error('EXTERNAL_CALL_FORBIDDEN');};
    server=createApp(prisma,config,undefined,{ready:forbid,send:forbid},undefined,{url:forbid,upload:forbid,destroy:forbid},console,storage).listen(0,'127.0.0.1');
    await new Promise(r=>server.once('listening',r));
    const body=(hour=9,court=0,d=date,duration=60)=>({court_id:String(courts[court].id),start_at:new Date(`${d}T${String(hour).padStart(2,'0')}:00:00+07:00`).toISOString(),end_at:new Date(+new Date(`${d}T${String(hour).padStart(2,'0')}:00:00+07:00`)+duration*60000).toISOString()});
    async function req(path,who=2,method='GET',data,extra={}) {
      const s=sessions[who], r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{Origin:config.frontendUrl,...(s?{Cookie:`booking_session=${s.token}`,'X-CSRF-Token':s.csrf_token}:{}),...(data?{'Content-Type':'application/json'}:{}),...extra},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(60000)});
      return {status:r.status,body:await r.json()};
    }
    const create=(b=body(),who=2)=>req('/bookings',who,'POST',b);
    const auth=createAuthService(prisma), actors=[];
    for(const s of sessions) actors.push(await auth.session(s.token));

    const png=await sharp({create:{width:4,height:4,channels:3,background:'#123456'}}).png().toBuffer();
    const image=await proofInput({buffer:png,mimetype:'image/png'});
    let day=0;
    async function fresh(who=2) {
      const sequence=day++, d=new Date(+new Date(`${date}T00:00:00Z`)+(sequence%28)*86400000).toISOString().slice(0,10);
      const result=await create(body(9+Math.floor(sequence/28)*3,0,d),who);assert.equal(result.status,201);return result.body.data;
    }
    async function proof(id,who=2,extra={}) {
      const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'../../ignored.jpg');
      const s=sessions[who], response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/payments/bookings/${id}/proof`,{
        method:'POST',headers:{Origin:config.frontendUrl,...(s?{Cookie:`booking_session=${s.token}`,'X-CSRF-Token':s.csrf_token}:{}),...extra},body:form,signal:AbortSignal.timeout(60000)});
      return {status:response.status,body:await response.json()};
    }
    async function refundProof(id,who=0,extra={}) {
      const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'refund-proof.png');
      const s=sessions[who], response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/owner/refunds/${id}/proof`,{
        method:'POST',headers:{Origin:config.frontendUrl,...(s?{Cookie:`booking_session=${s.token}`,'X-CSRF-Token':s.csrf_token}:{}),...extra},body:form,signal:AbortSignal.timeout(60000)});
      return {status:response.status,body:await response.json()};
    }
    const payment=createPaymentService(prisma,storage);
    const assertCode=(promise,expected)=>assert.rejects(promise,e=>e.code===expected);
    await cases('HTTP201 proof whitelist, private identifier, DB clock, state and locks preserved',async()=>{
      const b=await fresh(), id=BigInt(b.id), before=await prisma.courtSlotLock.findMany({where:{bookingSlot:{booking_id:id}}});
      const r=await proof(b.id);assert.equal(r.status,201);assert.equal(r.body.data.booking.status,'PENDING_CONFIRMATION');
      assert.equal(r.body.data.booking.expires_at,b.expires_at);
      assert.deepEqual(Object.keys(r.body.data.proof).sort(),['id','status','submitted_at']);
      assert.deepEqual(Object.keys(r.body.data.booking).sort(),['expires_at','id','status']);
      const row=await prisma.paymentProof.findUnique({where:{booking_id:id}});
      assert.match(row.image_path,/^payment-proofs\/[a-f0-9-]{36}$/);assert.ok(objects.has(row.image_path));
      assert.equal(row.mime_type,'image/png');assert.equal(row.size_bytes,BigInt(png.length));assert.equal(row.status,'SUBMITTED');
      assert.equal(row.submitted_at.toISOString(),r.body.meta.server_time);
      assert.equal(row.submitted_at.toISOString(),row.created_at.toISOString());
      assert.equal(row.updated_at.toISOString(),row.submitted_at.toISOString());
      assert.equal((await prisma.booking.findUnique({where:{id}})).status,'PENDING_CONFIRMATION');
      assert.deepEqual(await prisma.courtSlotLock.findMany({where:{bookingSlot:{booking_id:id}}}),before);
      const count=uploads.length;assert.equal((await proof(b.id)).body.error.code,'PROOF_ALREADY_SUBMITTED');assert.equal(uploads.length,count);
      await prisma.booking.update({where:{id},data:{expires_at:new Date(+clock-1000)}});
      assert.equal((await req(`/bookings/${b.id}`)).body.data.status,'PENDING_CONFIRMATION');
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:id}}}),2);
      const view=await req(`/payments/bookings/${b.id}/proof`);assert.equal(view.status,200);
      assert.equal(view.body.data.booking_id,b.id);assert.equal(view.body.data.status,'SUBMITTED');
      assert.match(view.body.data.proof_image_url,/^https:\/\/private\.example\.invalid/);
      assert.equal(new Date(view.body.data.proof_image_expires_at)-new Date(view.body.meta.server_time),300000);
      assert.equal('image_path' in view.body.data,false);
      assert.equal((await req(`/payments/bookings/${b.id}/proof`,1)).status,404);
      assert.equal((await req(`/payments/bookings/${b.id}/proof`,3)).status,403);
      const none=await fresh();assert.equal((await req(`/payments/bookings/${none.id}/proof`)).status,404);
      assert.equal((await req(`/payments/bookings/${b.id}/proof?x=1`)).status,422);
    });
    await cases('Owner list/detail ownership, pagination, status filter, sort and private proof TTL',async()=>{
      privateUrls.length=0;
      const first=await fresh(), second=await fresh();
      assert.equal((await proof(first.id)).status,201);assert.equal((await proof(second.id)).status,201);
      const list=await req('/owner/bookings?page=1&page_size=1&status=PENDING_CONFIRMATION',0);
      assert.equal(list.status,200);assert.equal(list.body.data.length,1);assert.ok(list.body.meta.total>=2);
      assert.equal(list.body.data[0].id,second.id);assert.equal(list.body.data[0].customer.id,String(users[2].id));
      assert.equal('email' in list.body.data[0].customer,false);assert.equal('image_path' in list.body.data[0].payment_proof,false);
      assert.equal((await req('/owner/bookings?facility_id=1',0)).status,422);
      assert.equal((await req(`/owner/bookings/${first.id}`,1)).status,404);
      const detail=await req(`/owner/bookings/${first.id}`,0);assert.equal(detail.status,200);assert.equal(detail.body.data.slots.length,2);
      const proofRow=await prisma.paymentProof.findUnique({where:{booking_id:BigInt(first.id)}});
      assert.equal((await req(`/owner/payments/${proofRow.id}`,1)).status,404);assert.equal(privateUrls.length,0);
      const view=await req(`/owner/payments/${proofRow.id}`,0);assert.equal(view.status,200);
      assert.equal('image_path' in view.body.data,false);assert.match(view.body.data.proof_image_url,/^https:\/\/private\.example\.invalid/);
      assert.equal(new Date(view.body.data.proof_image_expires_at)-new Date(view.body.meta.server_time),300000);
      assert.equal(privateUrls.length,1);assert.equal(privateUrls[0].id,proofRow.image_path);assert.equal(privateUrls[0].mime,'image/png');
    });
    await cases('Owner confirm is atomic, records reviewer and preserves slots and locks',async()=>{
      const b=await fresh();await proof(b.id);const bid=BigInt(b.id),p=await prisma.paymentProof.findUnique({where:{booking_id:bid}});
      const before=await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}});
      const r=await req(`/owner/payments/${p.id}/confirm`,0,'POST',{});assert.equal(r.status,200);
      assert.equal(r.body.data.booking.status,'CONFIRMED');assert.equal(r.body.data.proof.status,'APPROVED');
      const [booking,proofRow]=await Promise.all([prisma.booking.findUnique({where:{id:bid}}),prisma.paymentProof.findUnique({where:{id:p.id}})]);
      assert.equal(booking.status,'CONFIRMED');assert.ok(booking.confirmed_at);assert.equal(proofRow.status,'APPROVED');
      assert.equal(proofRow.reviewed_by,users[0].id);assert.ok(proofRow.reviewed_at);assert.equal(proofRow.rejection_reason,null);
      assert.equal(await prisma.bookingSlot.count({where:{booking_id:bid}}),2);
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}}),before);
      assert.equal((await req(`/owner/payments/${p.id}/confirm`,0,'POST',{})).status,409);
    });
    await cases('Owner completion enforces ownership, CSRF, ended CONFIRMED state and preserves history',async()=>{
      const b=await fresh();await proof(b.id);const bid=BigInt(b.id),p=await prisma.paymentProof.findUnique({where:{booking_id:bid}});
      assert.equal((await req(`/owner/payments/${p.id}/confirm`,0,'POST',{})).status,200);
      assert.equal((await req(`/owner/bookings/${b.id}/complete`,2,'POST',{})).status,403);
      assert.equal((await req(`/owner/bookings/${b.id}/complete`,1,'POST',{})).status,404);
      assert.equal((await req(`/owner/bookings/${b.id}/complete`,0,'POST',{}, {Origin:'https://evil.invalid'})).status,403);
      assert.equal((await req(`/owner/bookings/${b.id}/complete`,0,'POST',{}, {'X-CSRF-Token':''})).status,403);
      assert.equal((await req(`/owner/bookings/${b.id}/complete`,0,'POST',{status:'COMPLETED'})).status,422);
      const early=await req(`/owner/bookings/${b.id}/complete`,0,'POST',{});assert.equal(early.status,409);assert.equal(early.body.error.code,'BOOKING_NOT_ENDED');
      const beforeSlots=await prisma.bookingSlot.count({where:{booking_id:bid}}),beforeLocks=await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}});
      const beforeProof=await prisma.paymentProof.findUnique({where:{booking_id:bid}});
      const endedAt=new Date(Math.floor(+clock/1800000)*1800000),startedAt=new Date(+endedAt-3600000);
      await prisma.booking.update({where:{id:bid},data:{start_at:startedAt,end_at:endedAt}});
      const response=await req(`/owner/bookings/${b.id}/complete`,0,'POST',{});assert.equal(response.status,200);
      assert.deepEqual(Object.keys(response.body.data.booking).sort(),['completed_at','id','status']);assert.equal(response.body.data.booking.status,'COMPLETED');
      const [booking,proofRow]=await Promise.all([prisma.booking.findUnique({where:{id:bid}}),prisma.paymentProof.findUnique({where:{booking_id:bid}})]);
      assert.equal(booking.status,'COMPLETED');assert.equal(booking.completed_at.toISOString(),response.body.meta.server_time);
      assert.equal(proofRow.status,'APPROVED');assert.equal(proofRow.image_path,beforeProof.image_path);
      assert.equal(await prisma.bookingSlot.count({where:{booking_id:bid}}),beforeSlots);assert.ok(beforeLocks>0);assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}}),0);
      const customer=await req(`/bookings/${b.id}`,2);assert.equal(customer.body.data.status,'COMPLETED');assert.equal(customer.body.data.completed_at,response.body.data.booking.completed_at);
      assert.equal((await req(`/owner/bookings/${b.id}/complete`,0,'POST',{})).status,409);
    });
    await cases('Owner completion supports V2 and serializes competing terminal actions',async()=>{
      const v2=await fresh(),v2id=BigInt(v2.id);
      const v2EndedAt=new Date(Math.floor(+clock/1800000)*1800000),v2StartedAt=new Date(+v2EndedAt-3600000);
      await prisma.booking.update({where:{id:v2id},data:{booking_flow_version:2,status:'CONFIRMED',confirmation_expires_at:new Date(+clock+3600000),confirmed_at:clock,confirmed_by_user_id:users[0].id,start_at:v2StartedAt,end_at:v2EndedAt}});
      assert.equal((await req(`/owner/bookings/${v2.id}/complete`,0,'POST',{})).status,200);
      assert.equal((await prisma.booking.findUnique({where:{id:v2id}})).status,'COMPLETED');

      const raced=await fresh();await proof(raced.id);const rid=BigInt(raced.id),rp=await prisma.paymentProof.findUnique({where:{booking_id:rid}});await req(`/owner/payments/${rp.id}/confirm`,0,'POST',{});
      const raceEndedAt=new Date(Math.floor(+clock/1800000)*1800000),raceStartedAt=new Date(+raceEndedAt-3600000);
      await prisma.booking.update({where:{id:rid},data:{start_at:raceStartedAt,end_at:raceEndedAt}});
      const results=await Promise.all([req(`/owner/bookings/${raced.id}/complete`,0,'POST',{}),req(`/owner/bookings/${raced.id}/cancel`,0,'POST',{reason:'Race'})]);
      assert.deepEqual(results.map(item=>item.status).sort(),[200,409]);
      const terminal=await prisma.booking.findUnique({where:{id:rid}});assert.ok(['COMPLETED','CANCELLED'].includes(terminal.status));assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:rid}}}),0);
      assert.equal(await prisma.refund.count({where:{booking_id:rid}}),terminal.status==='CANCELLED'?1:0);
    });
    await cases('Owner completion rolls back status and locks when lock release fails',async()=>{
      const b=await fresh();await proof(b.id);const bid=BigInt(b.id),p=await prisma.paymentProof.findUnique({where:{booking_id:bid}});await req(`/owner/payments/${p.id}/confirm`,0,'POST',{});
      const rollbackEndedAt=new Date(Math.floor(+clock/1800000)*1800000),rollbackStartedAt=new Date(+rollbackEndedAt-3600000);
      await prisma.booking.update({where:{id:bid},data:{start_at:rollbackStartedAt,end_at:rollbackEndedAt}});
      const before=await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}});
      const injected=new Proxy(prisma,{get(target,key){if(key==='$transaction')return(fn,opts)=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k==='courtSlotLock')return new Proxy(t[k],{get(m,p){if(p==='deleteMany')return async args=>{await m[p](args);throw Object.assign(new Error('Injected'),{code:'TEST_FAILURE'});};return m[p];}});return t[k];}})),opts);return target[key];}});
      await assert.rejects(createOwnerPaymentService(injected,storage).completeBooking(actors[0],bid),error=>error.code==='TEST_FAILURE');
      const unchanged=await prisma.booking.findUnique({where:{id:bid}});assert.equal(unchanged.status,'CONFIRMED');assert.equal(unchanged.completed_at,null);assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}}),before);
    });
    await cases('Owner confirmed cancellation validates, owns, creates one exact refund and reopens availability',async()=>{
      const b=await fresh();await proof(b.id);const bid=BigInt(b.id),p=await prisma.paymentProof.findUnique({where:{booking_id:bid}});
      assert.equal((await req(`/owner/payments/${p.id}/confirm`,0,'POST',{})).status,200);
      for(const value of [undefined,'   ',null,[], 'x'.repeat(501)]) {
        const data=value===undefined?{}:{reason:value};assert.equal((await req(`/owner/bookings/${b.id}/cancel`,0,'POST',data)).status,422);
      }
      assert.equal((await req(`/owner/bookings/${b.id}/cancel`,0,'POST',{reason:'x',status:'CANCELLED'})).status,422);
      assert.equal((await req(`/owner/bookings/${b.id}/cancel`,1,'POST',{reason:'Không thuộc quyền'})).status,404);
      assert.equal((await req(`/owner/bookings/${b.id}/cancel`,0,'POST',{reason:'Bảo trì'},{Origin:'https://evil.invalid'})).status,403);
      assert.equal((await req(`/owner/bookings/${b.id}/cancel`,0,'POST',{reason:'Bảo trì'},{'X-CSRF-Token':''})).status,403);
      const beforeSlots=await prisma.bookingSlot.count({where:{booking_id:bid}});
      const response=await req(`/owner/bookings/${b.id}/cancel`,0,'POST',{reason:'  Bảo trì đột xuất  '});assert.equal(response.status,200);
      assert.deepEqual(Object.keys(response.body.data).sort(),['booking','refund']);
      assert.equal(response.body.data.booking.cancelled_by,'OWNER');assert.equal(response.body.data.booking.cancellation_reason,'Bảo trì đột xuất');
      assert.equal(response.body.data.refund.status,'PENDING');assert.equal(response.body.data.refund.amount,b.deposit_amount);
      const [booking,proofRow,refund]=await Promise.all([prisma.booking.findUnique({where:{id:bid}}),prisma.paymentProof.findUnique({where:{booking_id:bid}}),prisma.refund.findUnique({where:{booking_id:bid}})]);
      assert.equal(booking.status,'CANCELLED');assert.equal(booking.cancelled_by,'OWNER');assert.equal(booking.cancellation_reason,'Bảo trì đột xuất');assert.ok(booking.cancelled_at);
      assert.equal(proofRow.status,'APPROVED');assert.equal(refund.status,'PENDING');assert.equal(refund.amount.toString(),booking.deposit_amount.toString());
      assert.equal(await prisma.bookingSlot.count({where:{booking_id:bid}}),beforeSlots);assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}}),0);
      const availabilityDate=new Date(+booking.start_at+7*3600000).toISOString().slice(0,10),availability=await req(`/courts/${booking.court_id}/availability?date=${availabilityDate}`,0);
      assert.equal(availability.status,200);assert.equal(availability.body.data.slots.find(slot=>slot.start_at===booking.start_at.toISOString()).state,'AVAILABLE');
      const repeat=await req(`/owner/bookings/${b.id}/cancel`,0,'POST',{reason:'Ghi đè'});assert.equal(repeat.status,409);
      const unchanged=await prisma.booking.findUnique({where:{id:bid}});assert.equal(unchanged.cancellation_reason,'Bảo trì đột xuất');assert.equal(await prisma.refund.count({where:{booking_id:bid}}),1);
    });
    await cases('Owner cancellation serializes cancel/cancel and Owner/Customer races',async()=>{
      async function confirmed(){const b=await fresh();await proof(b.id);const p=await prisma.paymentProof.findUnique({where:{booking_id:BigInt(b.id)}});await req(`/owner/payments/${p.id}/confirm`,0,'POST',{});return b;}
      const one=await confirmed(),same=await Promise.all([
        req(`/owner/bookings/${one.id}/cancel`,0,'POST',{reason:'Owner A'}),
        req(`/owner/bookings/${one.id}/cancel`,0,'POST',{reason:'Owner B'}),
      ]);assert.deepEqual(same.map(item=>item.status).sort(),[200,409]);assert.equal(await prisma.refund.count({where:{booking_id:BigInt(one.id)}}),1);
      const two=await confirmed(),mixed=await Promise.all([
        req(`/owner/bookings/${two.id}/cancel`,0,'POST',{reason:'Owner race'}),
        req(`/bookings/${two.id}/cancel`,2,'POST',{reason:'Customer race'}),
      ]);assert.deepEqual(mixed.map(item=>item.status).sort(),[200,409]);
      const row=await prisma.booking.findUnique({where:{id:BigInt(two.id)}});assert.ok(['OWNER','CUSTOMER'].includes(row.cancelled_by));assert.equal(await prisma.refund.count({where:{booking_id:BigInt(two.id)}}),1);
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:BigInt(two.id)}}}),0);
    });
    await cases('Owner cancellation rejects inconsistent payment and invalid state without writes',async()=>{
      const pending=await fresh();assert.equal((await req(`/owner/bookings/${pending.id}/cancel`,0,'POST',{reason:'Không hợp lệ'})).status,409);
      const inconsistent=await fresh(),iid=BigInt(inconsistent.id);await prisma.booking.update({where:{id:iid},data:{status:'CONFIRMED'}});
      const result=await req(`/owner/bookings/${inconsistent.id}/cancel`,0,'POST',{reason:'Thiếu proof'});assert.equal(result.status,409);assert.equal(result.body.error.code,'INCONSISTENT_PAYMENT_STATE');
      assert.equal((await prisma.booking.findUnique({where:{id:iid}})).status,'CONFIRMED');assert.equal(await prisma.refund.count({where:{booking_id:iid}}),0);assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:iid}}}),2);
    });
    await cases('Owner cancellation rolls back booking, refund and locks on mutation failure',async()=>{
      function injected(kind){return new Proxy(prisma,{get(target,key){if(key==='$transaction')return(fn,opts)=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k===kind.model)return new Proxy(t[k],{get(m,p){if(p===kind.method)return async args=>{await m[p](args);throw Object.assign(new Error('Injected'),{code:'TEST_FAILURE'});};return m[p];}});return t[k];}})),opts);return target[key];}});}
      for(const kind of [{model:'refund',method:'create'},{model:'courtSlotLock',method:'deleteMany'}]){
        const b=await fresh();await proof(b.id);const bid=BigInt(b.id),payment=await prisma.paymentProof.findUnique({where:{booking_id:bid}});await req(`/owner/payments/${payment.id}/confirm`,0,'POST',{});
        const beforeLocks=await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}});
        await assert.rejects(createOwnerPaymentService(injected(kind),storage).cancelBooking(actors[0],bid,'Bảo trì'),error=>error.code==='TEST_FAILURE');
        const [booking,proofRow]=await Promise.all([prisma.booking.findUnique({where:{id:bid}}),prisma.paymentProof.findUnique({where:{booking_id:bid}})]);
        assert.equal(booking.status,'CONFIRMED');assert.equal(booking.cancelled_at,null);assert.equal(await prisma.refund.count({where:{booking_id:bid}}),0);
        assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}}),beforeLocks);assert.equal(proofRow.status,'APPROVED');assert.equal(await prisma.bookingSlot.count({where:{booking_id:bid}}),2);
      }
    });
    await cases('Refund lifecycle is private, owned, atomic and terminal',async()=>{
      const b=await fresh();await proof(b.id);const bid=BigInt(b.id),payment=await prisma.paymentProof.findUnique({where:{booking_id:bid}});
      assert.equal((await req(`/owner/payments/${payment.id}/confirm`,0,'POST',{})).status,200);
      const cancelled=await req(`/bookings/${b.id}/cancel`,2,'POST',{});assert.equal(cancelled.status,200);
      const refundId=cancelled.body.data.refund.id;
      assert.equal(cancelled.body.data.refund.amount,b.deposit_amount);assert.equal(cancelled.body.data.refund.status,'PENDING');
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}}),0);
      assert.equal(await prisma.bookingSlot.count({where:{booking_id:bid}}),2);
      const ownerBooking=await req(`/owner/bookings/${b.id}`,0);assert.equal(ownerBooking.body.data.refund.id,refundId);
      const customerBooking=await req(`/bookings/${b.id}`,2);assert.equal(customerBooking.body.data.refund.id,refundId);
      assert.equal((await req(`/owner/refunds/${refundId}`,1)).status,404);
      assert.equal((await req(`/refunds/${refundId}`,1)).status,404);
      const pending=await req(`/owner/refunds/${refundId}`,0);assert.equal(pending.status,200);assert.equal(pending.body.data.proof_image_url,null);
      assert.equal((await refundProof(refundId,1)).status,404);
      assert.equal((await refundProof(refundId,0,{Origin:'https://evil.invalid'})).status,403);
      assert.equal((await refundProof(refundId,0,{'X-CSRF-Token':''})).status,403);
      const submitted=await refundProof(refundId);assert.equal(submitted.status,201);assert.equal(submitted.body.data.status,'PROOF_SUBMITTED');
      const refundRow=await prisma.refund.findUnique({where:{id:BigInt(refundId)}});
      assert.match(refundRow.proof_image_path,/^refund-proofs\/[a-f0-9-]{36}$/);assert.equal(refundRow.proof_mime_type,'image/png');
      assert.equal(refundRow.proof_size_bytes,BigInt(png.length));assert.ok(objects.has(refundRow.proof_image_path));
      assert.equal((await refundProof(refundId)).status,409);
      const customerView=await req(`/refunds/${refundId}`,2);assert.equal(customerView.status,200);
      assert.equal(customerView.body.data.status,'PROOF_SUBMITTED');assert.equal('proof_image_path' in customerView.body.data,false);
      assert.match(customerView.body.data.proof_image_url,/^https:\/\/private\.example\.invalid/);
      assert.equal(new Date(customerView.body.data.proof_image_expires_at)-new Date(customerView.body.meta.server_time),300000);
      assert.equal((await req(`/refunds/${refundId}/confirm`,1,'POST',{})).status,404);
      assert.equal((await req(`/refunds/${refundId}/confirm`,2,'POST',{}, {Origin:'https://evil.invalid'})).status,403);
      const confirmed=await req(`/refunds/${refundId}/confirm`,2,'POST',{});assert.equal(confirmed.status,200);
      assert.equal(confirmed.body.data.status,'REFUNDED');assert.equal(confirmed.body.data.confirmed_at,confirmed.body.data.refunded_at);
      assert.equal((await req(`/refunds/${refundId}/confirm`,2,'POST',{})).status,409);
      const terminal=await prisma.refund.findUnique({where:{id:BigInt(refundId)}});assert.equal(terminal.status,'REFUNDED');
      assert.equal(terminal.confirmed_at.toISOString(),terminal.refunded_at.toISOString());
    });
    await cases('Concurrent refund proof and confirmation allow one winner and clean loser asset',async()=>{
      const b=await fresh();await proof(b.id);const bid=BigInt(b.id),payment=await prisma.paymentProof.findUnique({where:{booking_id:bid}});
      await req(`/owner/payments/${payment.id}/confirm`,0,'POST',{});const cancel=await req(`/bookings/${b.id}/cancel`,2,'POST',{}),refundId=cancel.body.data.refund.id;
      const before=uploads.length, submissions=await Promise.all([refundProof(refundId),refundProof(refundId)]);
      assert.deepEqual(submissions.map(x=>x.status).sort(),[201,409]);
      const keys=uploads.slice(before);assert.equal(keys.length,2);assert.equal(keys.filter(k=>objects.has(k)).length,1);
      const confirms=await Promise.all([req(`/refunds/${refundId}/confirm`,2,'POST',{}),req(`/refunds/${refundId}/confirm`,2,'POST',{})]);
      assert.deepEqual(confirms.map(x=>x.status).sort(),[200,409]);
    });
    await cases('Owner reject validates reason, records both histories, releases locks and creates no refund',async()=>{
      const b=await fresh();await proof(b.id);const bid=BigInt(b.id),p=await prisma.paymentProof.findUnique({where:{booking_id:bid}});
      for(const value of [undefined,'   ','x'.repeat(501)]) {
        const r=await req(`/owner/payments/${p.id}/reject`,0,'POST',value===undefined?{}:{reason:value});assert.equal(r.status,422);
      }
      assert.equal((await req(`/owner/payments/${p.id}/reject`,1,'POST',{reason:'No'})).status,404);
      const r=await req(`/owner/payments/${p.id}/reject`,0,'POST',{reason:'  Minh chứng không hợp lệ  '});assert.equal(r.status,200);
      const [booking,proofRow]=await Promise.all([prisma.booking.findUnique({where:{id:bid}}),prisma.paymentProof.findUnique({where:{id:p.id}})]);
      assert.equal(booking.status,'REJECTED');assert.ok(booking.rejected_at);assert.equal(booking.rejection_reason,'Minh chứng không hợp lệ');
      assert.equal(proofRow.status,'REJECTED');assert.equal(proofRow.reviewed_by,users[0].id);assert.equal(proofRow.rejection_reason,'Minh chứng không hợp lệ');
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:bid}}}),0);
      assert.equal(await prisma.bookingSlot.count({where:{booking_id:bid}}),2);assert.equal(await prisma.refund.count({where:{booking_id:bid}}),0);
    });
    await cases('Owner review auth, capability, Origin/CSRF and concurrent confirm/reject serialize',async()=>{
      const b=await fresh();await proof(b.id);const p=await prisma.paymentProof.findUnique({where:{booking_id:BigInt(b.id)}});
      assert.equal((await req('/owner/bookings',-1)).status,401);assert.equal((await req('/owner/bookings',2)).status,403);
      assert.equal((await req(`/owner/payments/${p.id}/confirm`,0,'POST',{}, {Origin:'https://evil.invalid'})).status,403);
      assert.equal((await req(`/owner/payments/${p.id}/confirm`,0,'POST',{}, {'X-CSRF-Token':''})).status,403);
      const results=await Promise.all([
        req(`/owner/payments/${p.id}/confirm`,0,'POST',{}),
        req(`/owner/payments/${p.id}/reject`,0,'POST',{reason:'Race'}),
      ]);
      assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
      const row=await prisma.booking.findUnique({where:{id:BigInt(b.id)}});assert.ok(['CONFIRMED','REJECTED'].includes(row.status));
      assert.equal((await prisma.paymentProof.findUnique({where:{id:p.id}})).status,row.status==='CONFIRMED'?'APPROVED':'REJECTED');
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:BigInt(b.id)}}}),row.status==='CONFIRMED'?2:0);
      const b2=await fresh();await proof(b2.id);const p2=await prisma.paymentProof.findUnique({where:{booking_id:BigInt(b2.id)}});
      const double=await Promise.all([req(`/owner/payments/${p2.id}/confirm`,0,'POST',{}),req(`/owner/payments/${p2.id}/confirm`,0,'POST',{})]);
      assert.deepEqual(double.map(x=>x.status).sort(),[200,409]);
      await prisma.user.update({where:{id:users[0].id},data:{status:'LOCKED',locked_at:clock,locked_reason:'Fixture'}});
      try {assert.equal((await req('/owner/bookings',0)).status,401);}
      finally {await prisma.user.update({where:{id:users[0].id},data:{status:'ACTIVE',locked_at:null,locked_reason:null}});}
    });
    await cases('Ownership/session/capability/Origin/CSRF before storage; Owner has Customer capability',async()=>{
      const b=await fresh(), count=uploads.length;
      assert.equal((await proof(b.id,1)).status,404);assert.equal((await proof('9223372036854775807')).status,404);
      assert.equal((await proof(b.id,-1)).status,401);assert.equal((await proof(b.id,3)).status,403);
      assert.equal((await proof(b.id,2,{Origin:'https://evil.invalid'})).status,403);
      assert.equal((await proof(b.id,2,{'X-CSRF-Token':''})).status,403);assert.equal(uploads.length,count);
      const own=await fresh(0);assert.equal((await proof(own.id,0)).status,201);
    });
    await cases('Expired precheck commits EXPIRED, releases locks, preserves slots without uploading',async()=>{
      const b=await fresh(),id=BigInt(b.id),count=uploads.length;
      await prisma.booking.update({where:{id},data:{expires_at:new Date(+clock-1000)}});
      const r=await proof(b.id);assert.equal(r.status,409);assert.equal(r.body.error.code,'BOOKING_EXPIRED');assert.equal(uploads.length,count);
      const row=await prisma.booking.findUnique({where:{id}});assert.equal(row.status,'EXPIRED');assert.ok(row.expired_at);
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:id}}}),0);
      assert.equal(await prisma.bookingSlot.count({where:{booking_id:id}}),2);
      assert.equal(await prisma.paymentProof.count({where:{booking_id:id}}),0);
    });
    await cases('Final DB clock equality with expiry rejects uploaded image and commits release',async()=>{
      const b=await fresh(), id=BigInt(b.id),expiry=new Date(b.expires_at);let uploadedId;
      const adapter={...storage,async upload(buffer,key){uploadedId=key;return storage.upload(buffer,key);}};
      let round=0;
      const db=new Proxy(prisma,{get(target,key){if(key==='$transaction')return (fn,opts)=>{round++;return target.$transaction(tx=>fn(new Proxy(tx,{get(obj,k){
        if(k==='$queryRaw')return (strings,...values)=>strings.join('').includes('clock_timestamp')&&round===2?Promise.resolve([{now:expiry}]):obj.$queryRaw(strings,...values);
        return obj[k];}})),opts);};return target[key];}});
      await assertCode(createPaymentService(db,adapter).submit(actors[2],id,image),'BOOKING_EXPIRED');
      assert.equal((await prisma.booking.findUnique({where:{id}})).status,'EXPIRED');
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:id}}}),0);assert.ok(destroyed.includes(uploadedId));
    });
    await cases('Concurrent uploads both reach provider: exactly one proof, loser asset cleaned',async()=>{
      const b=await fresh(),id=BigInt(b.id),before=uploads.length;let arrivals=0,release;
      const gate=new Promise(r=>release=r), adapter={...storage,async upload(buffer,key){await storage.upload(buffer,key);if(++arrivals===2)release();await gate;return key;}};
      const service=createPaymentService(prisma,adapter);
      const results=await Promise.allSettled([service.submit(actors[2],id,image),service.submit(actors[2],id,image)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'PROOF_ALREADY_SUBMITTED');
      assert.equal(await prisma.paymentProof.count({where:{booking_id:id}}),1);
      const keys=uploads.slice(before);assert.equal(keys.length,2);assert.equal(new Set(keys).size,2);assert.equal(keys.filter(k=>objects.has(k)).length,1);
    });
    await cases('Expiry wins during upload; new booking reuses released slots, old proof rejected',async()=>{
      const b=await fresh(),id=BigInt(b.id);let replacement;
      const adapter={...storage,async upload(buffer,key){
        await storage.upload(buffer,key);await prisma.booking.update({where:{id},data:{expires_at:new Date(+clock-1000)}});
        await createBookingService(prisma).detail(actors[2],id);
        replacement=await createBookingService(prisma).create(actors[1],input({court_id:String(courts[0].id),start_at:b.start_at,end_at:b.end_at}));return key;
      }};
      await assertCode(createPaymentService(prisma,adapter).submit(actors[2],id,image),'BOOKING_EXPIRED');
      assert.equal(await prisma.paymentProof.count({where:{booking_id:id}}),0);
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:BigInt(replacement.data.id)}}}),2);
    });
    await cases('Facility/Court/Owner changes during upload do not invalidate existing booking',async()=>{
      const b=await fresh(),id=BigInt(b.id);
      const adapter={...storage,async upload(buffer,key){
        await storage.upload(buffer,key);
        await prisma.$transaction(async tx=>{
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${users[0].id} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${facilities[0].id} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM courts WHERE id = ${courts[0].id} FOR UPDATE`;
          await tx.user.update({where:{id:users[0].id},data:{status:'LOCKED',locked_at:clock,locked_reason:'Fixture'}});
          await tx.facility.update({where:{id:facilities[0].id},data:{status:'SUSPENDED',suspension_reason:'Fixture'}});
          await tx.court.update({where:{id:courts[0].id},data:{status:'INACTIVE'}});
        });return key;
      }};
      try {assert.equal((await createPaymentService(prisma,adapter).submit(actors[2],id,image)).data.booking.status,'PENDING_CONFIRMATION');}
      finally {
        await prisma.user.update({where:{id:users[0].id},data:{status:'ACTIVE',locked_at:null,locked_reason:null}});
        await prisma.facility.update({where:{id:facilities[0].id},data:{status:'ACTIVE',suspension_reason:null}});
        await prisma.court.update({where:{id:courts[0].id},data:{status:'ACTIVE'}});
      }
    });
    await cases('Customer locked or session revoked during upload is rechecked with cleanup',async()=>{
      for(const kind of ['locked','revoked']) {
        const b=await fresh(),id=BigInt(b.id),adapter={...storage,async upload(buffer,key){await storage.upload(buffer,key);
          if(kind==='locked')await prisma.user.update({where:{id:users[2].id},data:{status:'LOCKED',locked_at:clock,locked_reason:'Fixture'}});
          else await prisma.authSession.update({where:{id:actors[2].id},data:{revoked_at:clock}});return key;
        }};
        try {await assertCode(createPaymentService(prisma,adapter).submit(actors[2],id,image),'SESSION_EXPIRED');assert.equal(await prisma.paymentProof.count({where:{booking_id:id}}),0);}
        finally {
          await prisma.user.update({where:{id:users[2].id},data:{status:'ACTIVE',locked_at:null,locked_reason:null}});
          await prisma.authSession.update({where:{id:actors[2].id},data:{revoked_at:null}});
        }
      }
    });
    await cases('Storage failure preserves booking; post-insert DB failure rolls back proof/state and cleans object',async()=>{
      const b=await fresh(),id=BigInt(b.id),broken={...storage,async upload(){throw Object.assign(new Error('fixture'),{code:'IMAGE_STORAGE_UNAVAILABLE'});}};
      await assertCode(createPaymentService(prisma,broken).submit(actors[2],id,image),'IMAGE_STORAGE_UNAVAILABLE');
      const db=new Proxy(prisma,{get(target,key){if(key==='$transaction')return (fn,opts)=>target.$transaction(tx=>fn(new Proxy(tx,{get(obj,k){
        if(k==='booking')return new Proxy(obj.booking,{get(model,method){if(method==='update')return async()=>{throw Object.assign(new Error('fixture'),{code:'TEST_ROLLBACK'});};return model[method];}});return obj[k];}})),opts);return target[key];}});
      const before=uploads.length;await assertCode(createPaymentService(db,storage).submit(actors[2],id,image),'TEST_ROLLBACK');
      assert.ok(destroyed.includes(uploads[before]));assert.equal(await prisma.paymentProof.count({where:{booking_id:id}}),0);
      assert.equal((await prisma.booking.findUnique({where:{id}})).status,'PENDING_PAYMENT');
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:id}}}),2);
    });
    await cases('Unknown COMMIT error after successful commit preserves referenced asset',async()=>{
      const b=await fresh(),id=BigInt(b.id);let round=0;
      const db=new Proxy(prisma,{get(target,key){if(key==='$transaction')return async(fn,opts)=>{round++;const result=await target.$transaction(fn,opts);if(round===2)throw Object.assign(new Error('fixture'),{code:'P1017'});return result;};return target[key];}});
      await assertCode(createPaymentService(db,storage).submit(actors[2],id,image),'P1017');
      const p=await prisma.paymentProof.findUnique({where:{booking_id:id}});assert.ok(objects.has(p.image_path));assert.ok(!destroyed.includes(p.image_path));
      assert.equal((await req(`/bookings/${id}`)).body.data.status,'PENDING_CONFIRMATION');
    });
    await cases('Other booking states reject without uploading; health200',async()=>{
      const b=await fresh(),id=BigInt(b.id);
      for(const status of ['PENDING_CONFIRMATION','CONFIRMED','COMPLETED','CANCELLED','REJECTED']) {
        await prisma.booking.update({where:{id},data:{status,...(status==='CANCELLED'?{cancelled_at:clock,cancelled_by:'CUSTOMER'}:{}),...(status==='REJECTED'?{rejection_reason:'Fixture'}:{})}});
        const n=uploads.length;assert.equal((await proof(id)).body.error.code,'INVALID_BOOKING_STATE');assert.equal(uploads.length,n);
      }
      assert.equal((await req('/health')).status,200);
    });
  } finally {
    if(server)await new Promise(r=>server.close(r));
    try {
      await prisma.$transaction(async tx=>{
        const ids=users.map(u=>u.id), fids=facilities.map(f=>f.id), cids=courts.map(c=>c.id);
        await tx.courtSlotLock.deleteMany({where:{court_id:{in:cids}}});
        await tx.courtBlock.deleteMany({where:{court_id:{in:cids}}});
        await tx.refund.deleteMany({where:{booking:{court_id:{in:cids}}}});
        await tx.paymentProof.deleteMany({where:{booking:{court_id:{in:cids}}}});
        await tx.bookingSlot.deleteMany({where:{booking:{court_id:{in:cids}}}});
        await tx.booking.deleteMany({where:{court_id:{in:cids},customer_id:{in:ids}}});
        await tx.court.deleteMany({where:{id:{in:cids}}});
        await tx.priceRule.deleteMany({where:{facility_id:{in:fids}}});
        await tx.cancellationPolicy.deleteMany({where:{facility_id:{in:fids}}});
        await tx.bankAccount.deleteMany({where:{facility_id:{in:fids}}});
        await tx.facility.deleteMany({where:{id:{in:fids}}});
        await tx.ownerProfile.deleteMany({where:{user_id:{in:ids}}});
        await tx.ownerRequest.deleteMany({where:{user_id:{in:ids}}});
        await tx.authSession.deleteMany({where:{user_id:{in:ids}}});
        await tx.user.deleteMany({where:{id:{in:ids}}});
      },{maxWait:20000,timeout:30000});
      assert.equal(await prisma.user.count({where:{id:{in:users.map(u=>u.id)}}}),0);
      assert.equal(await prisma.facility.count({where:{id:{in:facilities.map(f=>f.id)}}}),0);
      assert.equal(await prisma.ownerProfile.count({where:{user_id:{in:users.map(u=>u.id)}}}),0);
      assert.equal(await prisma.booking.count({where:{court_id:{in:courts.map(c=>c.id)}}}),0);
      assert.equal(await prisma.courtSlotLock.count({where:{court_id:{in:courts.map(c=>c.id)}}}),0);
      for(const id of [...objects]) await storage.destroy(id);
      assert.equal(objects.size,0);
      assert.equal(await prisma.paymentProof.count({where:{booking:{court_id:{in:courts.map(c=>c.id)}}}}),0);
      console.log('PAYMENT FIXTURE CLEANUP: PASS');
    } finally {await prisma.$disconnect();}
  }
});
