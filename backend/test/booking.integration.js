import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createBookingService } from '../src/modules/bookings/service.js';
import { input } from '../src/modules/bookings/rules.js';
import { createAuthService } from '../src/modules/auth/service.js';

test('Booking PostgreSQL HTTP, races, rollback and fixture cleanup', {timeout:900000}, async t => {
  const tag='booking-'+randomUUID(), users=[], sessions=[], facilities=[], courts=[];
  const config={nodeEnv:'development',frontendUrl:'http://localhost:5173'}, time=s=>new Date(`1970-01-01T${s}:00Z`);
  const qrStorage={ready(){},privateUrl(id,mime,expiresAt){assert.equal(mime,'image/png');return `https://private.example.invalid/${encodeURIComponent(id)}?expires=${expiresAt}`;},async upload(){throw new Error('EXTERNAL_CALL_FORBIDDEN');},async destroy(){throw new Error('EXTERNAL_CALL_FORBIDDEN');}};
  let server, date, clock, saved;
  const cases=(name,fn)=>t.test(name,async()=>{try{await fn();}catch(e){if(e.code==='ERR_ASSERTION')throw e;throw new Error('BOOKING_TEST_FAILED: '+(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'UNEXPECTED_ERROR'));}});
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
      await prisma.bankAccount.create({data:{facility_id:f.id,bank_name:'Fixture Bank',account_number:'123',account_holder:'Fixture',created_at:clock}});
    }
    const forbid=()=>{throw new Error('EXTERNAL_CALL_FORBIDDEN');};
    server=createApp(prisma,config,undefined,{ready:forbid,send:forbid},undefined,{url:forbid,upload:forbid,destroy:forbid},undefined,qrStorage).listen(0,'127.0.0.1');
    await new Promise(r=>server.once('listening',r));
    const body=(hour=9,court=0,d=date,duration=60)=>({court_id:String(courts[court].id),start_at:new Date(`${d}T${String(hour).padStart(2,'0')}:00:00+07:00`).toISOString(),end_at:new Date(+new Date(`${d}T${String(hour).padStart(2,'0')}:00:00+07:00`)+duration*60000).toISOString()});
    async function req(path,who=2,method='GET',data,extra={}) {
      const s=sessions[who], r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{Origin:config.frontendUrl,...(s?{Cookie:`booking_session=${s.token}`,'X-CSRF-Token':s.csrf_token}:{}),...(data?{'Content-Type':'application/json'}:{}),...extra},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(60000)});
      return {status:r.status,body:await r.json()};
    }
    const create=(b=body(),who=2)=>req('/bookings',who,'POST',b);
    const expectError=async(p,code,status)=>{const r=await p;assert.equal(r.body.error?.code,code);if(status)assert.equal(r.status,status);};
    const auth=createAuthService(prisma), actors=[];
    for(const s of sessions) actors.push(await auth.session(s.token));
    await cases('Create exact snapshots, two slots,30/70,5minute hold and DTO',async()=>{
      const r=await create(); assert.equal(r.status,201); saved=r.body.data;
      assert.equal(saved.status,'PENDING_PAYMENT'); assert.equal(saved.slots.length,2);
      assert.equal(saved.total_amount,'80001'); assert.equal(saved.deposit_amount,'24000'); assert.equal(saved.remaining_amount,'56001');
      assert.equal(saved.slots[0].slot_amount,'40000.5'); assert.equal(saved.cancellation_cutoff_hours_snapshot,null);
      assert.equal(Date.parse(saved.expires_at)-Date.parse(saved.created_at),300000);
      assert.equal(saved.created_at,r.body.meta.server_time); assert.equal(saved.bank_name_snapshot,'Fixture Bank');
      assert.equal(saved.facility_name_snapshot,tag);
      for(const k of ['customer_id','owner','customer','qr_image_path_snapshot','paymentProof','updated_at']) assert.ok(!(k in saved));
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:BigInt(saved.id)}}}),2);
    });
    await cases('Ownership, guest/admin, CSRF/Origin, strict input and pagination',async()=>{
      assert.equal((await req('/bookings',-1)).status,401); assert.equal((await req('/bookings',3)).status,403);
      for(const headers of [{Origin:'https://evil.invalid'},{'X-CSRF-Token':''}]) assert.equal((await req('/bookings',2,'POST',body(),headers)).status,403);
      await expectError(req(`/bookings/${saved.id}`,1),'RESOURCE_NOT_FOUND',404);
      assert.equal((await req(`/bookings/${saved.id}`)).body.data.id,saved.id);
      const list=await req('/bookings'); assert.equal(list.body.meta.total,1); assert.equal(list.body.meta.page_size,20);
      assert.ok(!('bank_name_snapshot' in list.body.data[0]));
      assert.equal((await req('/bookings',1)).body.meta.total,0);
      for(const q of ['?status=EXPIRED','?page_size=101','?page=1&page=2']) assert.equal((await req('/bookings'+q)).status,422);
      for(const key of ['customer_id','total_amount','expires_at']) assert.equal((await create({...body(),[key]:'1'})).status,422);
      assert.equal((await req(`/bookings/${saved.id}?x=1`)).status,422);
    });
    await cases('Time range, max3hours, horizon and past booking',async()=>{
      await expectError(create(body(12,0,date,210)),'BOOKING_TOO_LONG',422);
      await expectError(create(body(9,0,'2000-01-01')),'BOOKING_IN_PAST',422);
      const far=new Date(+clock+32*86400000).toISOString().slice(0,10);
      await expectError(create(body(9,0,far)),'BOOKING_TOO_FAR',422);
      await expectError(create(body(5)),'INVALID_TIME_RANGE',422);
      await expectError(create({...body(),start_at:body().start_at.replace('Z','+00:00')}),'INVALID_TIME_RANGE',422);
    });
    await cases('List effective expiry is read-only; detail expires and releases all locks keeping history',async()=>{
      await prisma.booking.update({where:{id:BigInt(saved.id)},data:{expires_at:new Date(+clock-1)}});
      assert.equal((await req('/bookings')).body.data[0].status,'EXPIRED');
      assert.equal((await prisma.booking.findUnique({where:{id:BigInt(saved.id)}})).status,'PENDING_PAYMENT');
      assert.equal((await req(`/bookings/${saved.id}`)).body.data.status,'EXPIRED');
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:BigInt(saved.id)}}}),0);
      assert.equal(await prisma.bookingSlot.count({where:{booking_id:BigInt(saved.id)}}),2);
      assert.ok((await prisma.booking.findUnique({where:{id:BigInt(saved.id)}})).expired_at);
    });
    await cases('Create lazy expiry reuses slot and releases entire expired booking',async()=>{
      const first=await create(); assert.equal(first.status,201);
      await prisma.booking.update({where:{id:BigInt(first.body.data.id)},data:{expires_at:new Date(+clock-1)}});
      assert.equal((await create(body(9,0,date,30))).status,201);
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:BigInt(first.body.data.id)}}}),0);
      assert.equal((await prisma.booking.findUnique({where:{id:BigInt(first.body.data.id)}})).status,'EXPIRED');
    });
    await cases('CourtBlock overlap; missing/overlapping price; missing bank; overflow',async()=>{
      const b=body(12), block=await prisma.courtBlock.create({data:{court_id:courts[0].id,start_at:new Date(b.start_at),end_at:new Date(b.end_at),created_by:users[0].id,reason:'Fixture',created_at:clock}});
      try {await expectError(create(b),'SLOT_UNAVAILABLE',409);}finally{await prisma.courtBlock.delete({where:{id:block.id}});}
      const rule=await prisma.priceRule.findFirst({where:{facility_id:facilities[0].id}});
      await prisma.priceRule.update({where:{id:rule.id},data:{end_time:time('11:00')}});
      try{await expectError(create(b),'PRICE_NOT_CONFIGURED');}finally{await prisma.priceRule.update({where:{id:rule.id},data:{end_time:time('22:00')}});}
      const overlap=await prisma.priceRule.create({data:{facility_id:facilities[0].id,start_time:time('12:00'),end_time:time('13:00'),hourly_rate:100,created_at:clock}});
      try{await expectError(create(b),'PRICE_NOT_CONFIGURED');}finally{await prisma.priceRule.delete({where:{id:overlap.id}});}
      const bank=await prisma.bankAccount.findUnique({where:{facility_id:facilities[0].id}});
      await prisma.bankAccount.delete({where:{id:bank.id}});
      try{await expectError(create(b),'BANK_ACCOUNT_NOT_CONFIGURED');}finally{await prisma.bankAccount.create({data:bank});}
      await prisma.priceRule.update({where:{id:rule.id},data:{hourly_rate:'999999999999'}});
      try{await expectError(create(body(12,0,date,180)),'BOOKING_AMOUNT_TOO_LARGE',422);}finally{await prisma.priceRule.update({where:{id:rule.id},data:{hourly_rate:'80001'}});}
    });
    await cases('Facility/Court/Owner states rechecked; history stays readable',async()=>{
      for(const [model,id,data,restore,code] of [
        ['facility',facilities[0].id,{status:'PENDING'},{status:'ACTIVE'},'FACILITY_UNAVAILABLE'],
        ['court',courts[0].id,{status:'INACTIVE'},{status:'ACTIVE'},'COURT_UNAVAILABLE'],
        ['user',users[0].id,{status:'LOCKED',locked_at:clock,locked_reason:'Fixture'},{status:'ACTIVE',locked_at:null,locked_reason:null},'FACILITY_UNAVAILABLE'],
      ]) {await prisma[model].update({where:{id},data});try{await expectError(create(body(12)),code);assert.equal((await req(`/bookings/${saved.id}`)).status,200);}finally{await prisma[model].update({where:{id},data:restore});}}
    });
    await cases('Two customers same slot: one201/one409; self-booking and crossed Owners no deadlock',async()=>{
      const results=await Promise.all([create(body(14),1),create(body(14),2)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]); assert.equal(results.find(r=>r.status===409).body.error.code,'SLOT_UNAVAILABLE');
      assert.equal((await create(body(16),0)).status,201);
      const crossed=await Promise.all([create(body(18,0),1),create(body(18,1),0)]);
      assert.ok(crossed.every(r=>r.status===201));
    });
    await cases('State/config race after stale pre-read uses committed value under locks',async()=>{
      for(const kind of ['state','price','bank','owner']) {
        let seen,release,attempt;
        const observed=new Promise(r=>seen=r), gate=new Promise(r=>release=r), attempted=new Promise(r=>attempt=r);
        const db=new Proxy(prisma,{get(target,key){
          if(key==='court')return new Proxy(target.court,{get(model,k){if(k==='findUnique')return async args=>{const row=await model.findUnique(args);seen();await gate;return row;};return model[k];}});
          if(key==='$transaction')return (fn,opts)=>target.$transaction(tx=>fn(new Proxy(tx,{get(model,k){
            if(k==='$queryRaw')return (...args)=>{if(args[0].join(' ').includes('FROM users'))attempt();return model.$queryRaw(...args);};
            return model[k];
          }})),opts);
          return target[key];
        }});
        const pending=createBookingService(db).create(actors[2],input(body(20))).then(v=>({v}),e=>({e}));
        await observed;
        try {
          await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${users[0].id} FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${facilities[0].id} FOR UPDATE`;
            if(kind==='state') {await tx.$queryRaw`SELECT id FROM courts WHERE id = ${courts[0].id} FOR UPDATE`;await tx.court.update({where:{id:courts[0].id},data:{status:'INACTIVE'}});}
            if(kind==='price')await tx.priceRule.updateMany({where:{facility_id:facilities[0].id},data:{hourly_rate:100000}});
            if(kind==='bank')await tx.bankAccount.update({where:{facility_id:facilities[0].id},data:{account_number:'456'}});
            if(kind==='owner')await tx.user.update({where:{id:users[0].id},data:{status:'LOCKED',locked_at:clock,locked_reason:'Fixture'}});
            release();
            await attempted; // Booking has reached User locking while this writer still holds it.
          },{timeout:20000});
        }finally{release();}
        const result=await pending;
        try {
          if(kind==='state'||kind==='owner')assert.equal(result.e?.code,kind==='state'?'COURT_UNAVAILABLE':'FACILITY_UNAVAILABLE');
          else {assert.ok(result.v); if(kind==='price')assert.equal(result.v.data.total_amount,'100000');else assert.equal(result.v.data.account_number_snapshot,'456');await prisma.booking.update({where:{id:BigInt(result.v.data.id)},data:{expires_at:new Date(+clock-1)}});}
        } finally {
          await prisma.court.update({where:{id:courts[0].id},data:{status:'ACTIVE'}});
          await prisma.user.update({where:{id:users[0].id},data:{status:'ACTIVE',locked_at:null,locked_reason:null}});
          await prisma.priceRule.updateMany({where:{facility_id:facilities[0].id},data:{hourly_rate:80001}});
          await prisma.bankAccount.update({where:{facility_id:facilities[0].id},data:{account_number:'123'}});
        }
      }
    });
    await cases('Injected failure after slot locks rolls back booking,slots,locks and expiry',async()=>{
      const before=await prisma.booking.count({where:{court_id:courts[0].id}}), locks=await prisma.courtSlotLock.count({where:{court_id:courts[0].id}});
      const slotsBefore=await prisma.bookingSlot.count({where:{booking:{court_id:courts[0].id}}});
      const historyBefore=await prisma.booking.findMany({where:{court_id:courts[0].id},orderBy:{id:'asc'}});
      const db=new Proxy(prisma,{get(target,key){if(key==='$transaction')return (fn,opts)=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k==='courtSlotLock')return new Proxy(t.courtSlotLock,{get(m,p){if(p==='createMany')return async args=>{await m.createMany(args);throw Object.assign(new Error('Injected'),{code:'TEST_FAILURE'});};return m[p];}});return t[k];}})),opts);return target[key];}});
      await assert.rejects(createBookingService(db).create(actors[2],input(body(20))),e=>e.code==='TEST_FAILURE');
      assert.equal(await prisma.booking.count({where:{court_id:courts[0].id}}),before);
      assert.equal(await prisma.courtSlotLock.count({where:{court_id:courts[0].id}}),locks);
      assert.equal(await prisma.bookingSlot.count({where:{booking:{court_id:courts[0].id}}}),slotsBefore);
      assert.deepEqual(await prisma.booking.findMany({where:{court_id:courts[0].id},orderBy:{id:'asc'}}),historyBefore);
      assert.equal((await req('/health')).status,200);
    });
    await cases('Six-slot maximum succeeds; snapshot stays unchanged after configuration edits',async()=>{
      const r=await create(body(7,1,date,180));assert.equal(r.status,201);
      assert.equal(r.body.data.slots.length,6);assert.equal(r.body.data.total_amount,'240003');
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:BigInt(r.body.data.id)}}}),6);
      await prisma.bankAccount.update({where:{facility_id:facilities[1].id},data:{account_number:'999'}});
      await prisma.priceRule.updateMany({where:{facility_id:facilities[1].id},data:{hourly_rate:120000}});
      const detail=await req(`/bookings/${r.body.data.id}`);
      assert.equal(detail.body.data.account_number_snapshot,'123');assert.equal(detail.body.data.total_amount,'240003');
    });
    await cases('QR signed DTO hides raw path and preserves old/new/null Booking snapshots',async()=>{
      const bank=await prisma.bankAccount.findUnique({where:{facility_id:facilities[1].id}});
      const qr='authenticated-qr/old-fixture';
      await prisma.bankAccount.update({where:{id:bank.id},data:{qr_image_path:qr}});
      try {
        const qrDate=new Date(+new Date(`${date}T00:00:00Z`)+17*86400000).toISOString().slice(0,10);
        const made=await create(body(9,1,qrDate,30));assert.equal(made.status,201);
        const id=BigInt(made.body.data.id);
        assert.match(made.body.data.qr_image_url,/^https:\/\/private\.example\.invalid\//);assert.equal(Date.parse(made.body.data.qr_image_expires_at)-Date.parse(made.body.meta.server_time),300000);assert.equal('qr_image_path_snapshot' in made.body.data,false);
        assert.equal((await prisma.booking.findUnique({where:{id}})).qr_image_path_snapshot,qr);
        const nextQr='authenticated-qr/new-fixture';await prisma.bankAccount.update({where:{id:bank.id},data:{qr_image_path:nextQr}});
        const newer=await create(body(10,1,qrDate,30));assert.equal(newer.status,201);assert.equal((await prisma.booking.findUnique({where:{id:BigInt(newer.body.data.id)}})).qr_image_path_snapshot,nextQr);
        await prisma.bankAccount.update({where:{id:bank.id},data:{qr_image_path:null}});
        const without=await create(body(11,1,qrDate,30));assert.equal(without.status,201);assert.equal(without.body.data.qr_image_url,null);assert.equal(without.body.data.qr_image_expires_at,null);assert.equal((await prisma.booking.findUnique({where:{id:BigInt(without.body.data.id)}})).qr_image_path_snapshot,null);
        const detail=await req(`/bookings/${id}`);assert.match(detail.body.data.qr_image_url,/^https:\/\/private\.example\.invalid\//);
        assert.equal('qr_image_path_snapshot' in detail.body.data,false);
        assert.equal((await prisma.booking.findUnique({where:{id}})).qr_image_path_snapshot,qr);
      } finally {await prisma.bankAccount.update({where:{id:bank.id},data:{qr_image_path:null}});}
    });
    await cases('Effective bookings block even without physical locks; pending confirmation never expires',async()=>{
      const r=await create(body(12,1,date,30));assert.equal(r.status,201);const id=BigInt(r.body.data.id);
      await prisma.courtSlotLock.deleteMany({where:{bookingSlot:{booking_id:id}}});
      await expectError(create(body(12,1,date,30)),'SLOT_UNAVAILABLE');
      for(const status of ['PENDING_CONFIRMATION','CONFIRMED']) {
        await prisma.booking.update({where:{id},data:{status,expires_at:new Date(+clock-1)}});
        await expectError(create(body(12,1,date,30)),'SLOT_UNAVAILABLE');
        assert.equal((await req(`/bookings/${id}`)).body.data.status,status);
      }
      for(const status of ['CANCELLED','REJECTED','EXPIRED','COMPLETED']) {
        await prisma.booking.update({where:{id},data:{status,cancelled_by:status==='CANCELLED'?'CUSTOMER':null,cancelled_at:status==='CANCELLED'?clock:null,rejection_reason:status==='REJECTED'?'Fixture':null}});
        const next=await create(body(12,1,date,30));assert.equal(next.status,201);
        await prisma.booking.update({where:{id:BigInt(next.body.data.id)},data:{expires_at:new Date(+clock-1)}});
      }
    });
    await cases('Physical slot PK collision maps safely and rolls back new booking',async()=>{
      const r=await create(body(14,1,date,30));assert.equal(r.status,201);
      const id=BigInt(r.body.data.id);
      // Deliberately inconsistent fixture: a terminal booking still has a physical lock.
      await prisma.booking.update({where:{id},data:{status:'REJECTED',rejection_reason:'Fixture'}});
      const count=await prisma.booking.count({where:{court_id:courts[1].id}});
      await expectError(create(body(14,1,date,30)),'SLOT_UNAVAILABLE',409);
      assert.equal(await prisma.booking.count({where:{court_id:courts[1].id}}),count);
      await prisma.courtSlotLock.deleteMany({where:{bookingSlot:{booking_id:id}}});
    });
    await cases('Customer cancellation enforces ownership/state/proof, releases locks and serializes with expiry',async()=>{
      const dayAt=n=>new Date(+new Date(`${date}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
      const cancellable=await create(body(9,0,dayAt(10),30));assert.equal(cancellable.status,201);
      const cid=BigInt(cancellable.body.data.id);
      assert.equal((await req(`/bookings/${cid}/cancel`,1,'POST',{})).status,404);
      for(const forged of [{status:'CANCELLED'},{amount:'0'},{facility_id:'1'}]) assert.equal((await req(`/bookings/${cid}/cancel`,2,'POST',forged)).status,422);
      const cancelled=await req(`/bookings/${cid}/cancel`,2,'POST',{reason:'  Đổi lịch  '});
      assert.equal(cancelled.status,200);assert.equal(cancelled.body.data.booking.status,'CANCELLED');
      assert.equal(cancelled.body.data.booking.cancelled_by,'CUSTOMER');assert.equal(cancelled.body.data.booking.cancellation_reason,'Đổi lịch');
      assert.equal(cancelled.body.data.refund,null);assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:cid}}}),0);
      assert.equal(await prisma.bookingSlot.count({where:{booking_id:cid}}),1);
      assert.equal((await req(`/bookings/${cid}/cancel`,2,'POST',{})).body.error.code,'INVALID_BOOKING_STATE');

      for(const [status,code,offset] of [['PENDING_CONFIRMATION','CANCELLATION_NOT_ALLOWED',11],['REJECTED','INVALID_BOOKING_STATE',13],['CANCELLED','INVALID_BOOKING_STATE',14]]) {
        const made=await create(body(9,0,dayAt(offset),30)), id=BigInt(made.body.data.id);
        await prisma.booking.update({where:{id},data:{status,...(status==='REJECTED'?{rejection_reason:'Fixture'}:{}),...(status==='CANCELLED'?{cancelled_at:clock,cancelled_by:'CUSTOMER'}:{})}});
        assert.equal((await req(`/bookings/${id}/cancel`,2,'POST',{})).body.error.code,code);
      }
      const withProof=await create(body(9,0,dayAt(15),30)), proofId=BigInt(withProof.body.data.id);
      await prisma.paymentProof.create({data:{booking_id:proofId,image_path:`${tag}/proof`,mime_type:'image/png',size_bytes:1,status:'SUBMITTED',submitted_at:clock,created_at:clock,updated_at:clock}});
      assert.equal((await req(`/bookings/${proofId}/cancel`,2,'POST',{})).body.error.code,'CANCELLATION_NOT_ALLOWED');

      const expiring=await create(body(9,0,dayAt(16),30)), eid=BigInt(expiring.body.data.id);
      await prisma.booking.update({where:{id:eid},data:{expires_at:new Date(+clock-1)}});
      const [cancelResult,detailResult]=await Promise.all([req(`/bookings/${eid}/cancel`,2,'POST',{}),req(`/bookings/${eid}`,2)]);
      assert.equal(cancelResult.body.error.code,'BOOKING_EXPIRED');assert.equal(detailResult.body.data.status,'EXPIRED');
      assert.equal((await prisma.booking.findUnique({where:{id:eid}})).status,'EXPIRED');
      assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:eid}}}),0);
    });
    await cases('Confirmed cancellation uses snapshot cutoff, approved proof, creates one refund and releases only locks',async()=>{
      const dayAt=n=>new Date(+new Date(`${date}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
      async function confirmed(offset,cutoff=2){
        const made=await create(body(9,0,dayAt(offset),30)),id=BigInt(made.body.data.id);
        await prisma.booking.update({where:{id},data:{status:'CONFIRMED',cancellation_cutoff_hours_snapshot:cutoff}});
        await prisma.paymentProof.create({data:{booking_id:id,image_path:`${tag}/approved-${id}`,mime_type:'image/png',size_bytes:1,status:'APPROVED',submitted_at:clock,reviewed_by:users[0].id,reviewed_at:clock,created_at:clock,updated_at:clock}});
        return id;
      }
      const id=await confirmed(17,2),beforeSlots=await prisma.bookingSlot.count({where:{booking_id:id}});
      const response=await req(`/bookings/${id}/cancel`,2,'POST',{reason:' Đổi kế hoạch '});assert.equal(response.status,200);
      assert.equal(response.body.data.booking.status,'CANCELLED');assert.equal(response.body.data.refund.status,'PENDING');assert.equal(response.body.data.refund.amount,response.body.data.booking.id?String((await prisma.booking.findUnique({where:{id}})).deposit_amount):'');
      assert.equal((await prisma.paymentProof.findUnique({where:{booking_id:id}})).status,'APPROVED');assert.equal(await prisma.bookingSlot.count({where:{booking_id:id}}),beforeSlots);assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:id}}}),0);assert.equal(await prisma.refund.count({where:{booking_id:id}}),1);
      const repeat=await req(`/bookings/${id}/cancel`,2,'POST',{reason:'Khác'});assert.equal(repeat.body.error.code,'INVALID_BOOKING_STATE');assert.equal(await prisma.refund.count({where:{booking_id:id}}),1);
      const nullPolicy=await confirmed(18,null);assert.equal((await req(`/bookings/${nullPolicy}/cancel`,2,'POST',{})).body.error.code,'CANCELLATION_POLICY_NOT_CONFIGURED');assert.equal(await prisma.refund.count({where:{booking_id:nullPolicy}}),0);
      const missingProof=await create(body(10,0,dayAt(19),30)),missingId=BigInt(missingProof.body.data.id);await prisma.booking.update({where:{id:missingId},data:{status:'CONFIRMED',cancellation_cutoff_hours_snapshot:2}});assert.equal((await req(`/bookings/${missingId}/cancel`,2,'POST',{})).body.error.code,'INCONSISTENT_PAYMENT_STATE');
      assert.equal((await req(`/bookings/${await confirmed(20,0)}/cancel`,1,'POST',{})).status,404);
      const raceId=await confirmed(21,0),race=await Promise.all([req(`/bookings/${raceId}/cancel`,2,'POST',{}),req(`/bookings/${raceId}/cancel`,2,'POST',{})]);assert.deepEqual(race.map(item=>item.status).sort(),[200,409]);assert.equal(await prisma.refund.count({where:{booking_id:raceId}}),1);
    });
    await cases('Confirmed cancellation rolls back when refund creation or slot release fails',async()=>{
      const dayAt=n=>new Date(+new Date(`${date}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
      async function fixture(hour){const made=await create(body(hour,0,dayAt(21),30)),id=BigInt(made.body.data.id);await prisma.booking.update({where:{id},data:{status:'CONFIRMED',cancellation_cutoff_hours_snapshot:0}});await prisma.paymentProof.create({data:{booking_id:id,image_path:`${tag}/rollback-${id}`,mime_type:'image/png',size_bytes:1,status:'APPROVED',submitted_at:clock,reviewed_by:users[0].id,reviewed_at:clock,created_at:clock,updated_at:clock}});return id;}
      function injected(kind){return new Proxy(prisma,{get(target,key){if(key==='$transaction')return(fn,opts)=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k===kind.model)return new Proxy(t[k],{get(m,p){if(p===kind.method)return async args=>{await m[p](args);throw Object.assign(new Error('Injected'),{code:'TEST_FAILURE'});};return m[p];}});return t[k];}})),opts);return target[key];}});}
      for(const [hour,kind] of [[11,{model:'refund',method:'create'}],[12,{model:'courtSlotLock',method:'deleteMany'}]]){
        const id=await fixture(hour),beforeLocks=await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:id}}});
        await assert.rejects(createBookingService(injected(kind)).cancel(actors[2],id,null),error=>error.code==='TEST_FAILURE');
        const row=await prisma.booking.findUnique({where:{id}});assert.equal(row.status,'CONFIRMED');assert.equal(row.cancelled_at,null);assert.equal(await prisma.refund.count({where:{booking_id:id}}),0);assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:id}}}),beforeLocks);assert.equal((await prisma.paymentProof.findUnique({where:{booking_id:id}})).status,'APPROVED');
      }
    });
    await cases('Stable list tie ordering, pagination, Customer locked/revoked sessions and health',async()=>{
      const customer_id=users[2].id;
      await prisma.booking.updateMany({where:{customer_id,court_id:{in:courts.map(c=>c.id)}},data:{created_at:clock}});
      const expected=await prisma.booking.findMany({where:{customer_id},select:{id:true},orderBy:{id:'desc'},take:2});
      const first=await req('/bookings?page_size=1'),second=await req('/bookings?page=2&page_size=1');
      assert.equal(first.body.data[0].id,String(expected[0].id));assert.equal(second.body.data[0].id,String(expected[1].id));
      await prisma.user.update({where:{id:customer_id},data:{status:'LOCKED',locked_at:clock,locked_reason:'Fixture'}});
      try{assert.equal((await create(body(21))).status,401);}finally{await prisma.user.update({where:{id:customer_id},data:{status:'ACTIVE',locked_at:null,locked_reason:null}});}
      await prisma.authSession.updateMany({where:{user_id:customer_id},data:{revoked_at:clock}});
      assert.equal((await req('/bookings')).status,401);
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
        await tx.bankAccount.deleteMany({where:{facility_id:{in:fids}}});
        await tx.facility.deleteMany({where:{id:{in:fids}}});
        await tx.ownerProfile.deleteMany({where:{user_id:{in:ids}}});
        await tx.ownerRequest.deleteMany({where:{user_id:{in:ids}}});
        await tx.authSession.deleteMany({where:{user_id:{in:ids}}});
        await tx.user.deleteMany({where:{id:{in:ids}}});
      },{maxWait:20000,timeout:30000});
      assert.equal(await prisma.user.count({where:{id:{in:users.map(u=>u.id)}}}),0);
      assert.equal(await prisma.booking.count({where:{court_id:{in:courts.map(c=>c.id)}}}),0);
      assert.equal(await prisma.courtSlotLock.count({where:{court_id:{in:courts.map(c=>c.id)}}}),0);
      console.log('BOOKING FIXTURE CLEANUP: PASS');
    } finally {await prisma.$disconnect();}
  }
});
