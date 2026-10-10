// Opt-in PostgreSQL integration. Uses the real static administrative registry; empty registry is injected only for failure tests.
// Independent connections need committed fixtures; finally removes only this run's UUID users/children.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { createOwnerRequestService } from '../src/modules/users/owner-requests/service.js';
import { bootstrapAdmin } from '../scripts/admin-bootstrap-service.js';

test('Facility HTTP/state/concurrency with runtime registry and scoped cleanup',{timeout:600000},async t=>{
  const prefix='facility-'+randomUUID(),emails=['owner-a','owner-b','admin-a','admin-b','customer'].map(n=>`${prefix}-${n}@example.invalid`);
  const password='Test'+randomBytes(20).toString('hex')+'1';
  const config={nodeEnv:'development',frontendUrl:'http://localhost:5173'};
  const core={name:'  Cơ sở thử  ',address:'  Địa chỉ fixture  ',district:'Phường Hải Châu',phone:' 0123456789 ',opening_time:'06:00',closing_time:'22:00',description:' mô tả '};
  const auth=createAuthService(prisma),requests=createOwnerRequestService(prisma),sessions=[];
  let server,unconfigured,ids=[],started=false;
  const cases=async(name,fn)=>t.test(name,async()=>{try{await fn();}catch(e){if(e.code==='ERR_ASSERTION')throw e;throw new Error('FACILITY_TEST_FAILED: '+(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'UNEXPECTED_ERROR'));}});
  try {
    assert.equal(await prisma.user.count({where:{email_normalized:{in:emails}}}),0);started=true;
    for(let i=0;i<5;i++) {
      const input={email:emails[i],password,full_name:'Facility fixture '+i};
      if(i===2||i===3)await bootstrapAdmin(prisma,input);else await auth.register(input);
    }
    const rows=await prisma.user.findMany({where:{email_normalized:{in:emails}},select:{id:true,email_normalized:true}});ids=emails.map(e=>rows.find(u=>u.email_normalized===e).id);
    for(const email of emails)sessions.push(await auth.login({email,password}));
    for(const i of [0,1]) {
      const row=await requests.create(await auth.session(sessions[i].token));
      await requests.decide(await auth.session(sessions[2].token),BigInt(row.id),true);
      sessions[i]=await auth.login({email:emails[i],password});
    }
    async function listen(app){const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));return s;}
    server=await listen(createApp(prisma,config));
    unconfigured=await listen(createApp(prisma,config,undefined,undefined,[]));
    async function req(path,who,method='GET',body,headers={},target=server) {
      const session=sessions[who];
      const response=await fetch(`http://127.0.0.1:${target.address().port}/api/v1${path}`,{method,headers:{Origin:config.frontendUrl,...(session?{Cookie:`booking_session=${session.token}`,'X-CSRF-Token':session.csrf_token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
      const text=await response.text();assert.ok(!text.includes('password_hash'));assert.ok(!text.includes('token_hash'));
      return {status:response.status,data:response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):null};
    }
    const own='/owner/facilities',admin='/admin/facilities';let a,b;
    const create=async(who=0)=>{const r=await req(own,who,'POST',core);assert.equal(r.status,201);return r.data.data.id;};
    const action=(id,name,who=2,body={})=>req(`${who<2?own:admin}/${id}/${name}`,who,'POST',body);
    await cases('No registry: create fails closed without inserting; auth/capability/Origin/CSRF',async()=>{
      assert.equal((await req(own,undefined)).status,401);
      for(const who of [2,4])assert.equal((await req(own,who,'POST',core)).status,403);
      for(const who of [0,4])assert.equal((await req(admin,who)).status,403);
      assert.equal((await req(own,0,'POST',core,{Origin:'https://evil.invalid'})).status,403);
      assert.equal((await req(own,0,'POST',core,{'X-CSRF-Token':''})).status,403);
      const r=await req(own,0,'POST',core,{},unconfigured);assert.equal(r.status,503);assert.equal(r.data.error.code,'DISTRICT_NOT_CONFIGURED');
      assert.equal(await prisma.facility.count({where:{owner_id:ids[0]}}),0);
    });
    await cases('Create trims, derives owner, remains DRAFT; invalid inputs cannot insert',async()=>{
      a=await create();b=await create(1);
      const r=await req(`${own}/${a}`,0),row=r.data.data;assert.equal(row.owner_id,String(ids[0]));assert.equal(row.name,'Cơ sở thử');assert.equal(row.status,'DRAFT');assert.equal(row.opening_time,'06:00');assert.equal(row.latitude,null);
      for(const body of [{...core,owner_id:String(ids[1])},{...core,status:'ACTIVE'},{...core,latitude:1},{...core,name:''},{...core,phone:'letters'},{...core,opening_time:'06:15'},{...core,closing_time:'05:30'},{...core,district:'INVALID_AREA'}])assert.equal((await req(own,0,'POST',body)).status,422);
    });
    await cases('Own lists/details, stable pagination/order, admin owner/status filters',async()=>{
      const extra=await create();
      const list=await req(`${own}?page_size=1`,0);assert.equal(list.data.meta.total,2);assert.equal(list.data.data[0].id,extra);
      assert.equal((await req(`${own}?page=2&page_size=1`,0)).data.data[0].id,a);
      assert.equal((await req(`${own}?status=ACTIVE`,0)).data.meta.total,0);
      assert.equal((await req(`${own}/${b}`,0)).status,404);
      const result=await req(`${admin}?owner_id=${ids[0]}&status=DRAFT&page_size=1`,2);assert.equal(result.data.meta.total,2);assert.equal(result.data.data[0].id,extra);
      assert.equal((await req(`${admin}/${a}`,2)).data.data.owner.id,String(ids[0]));
      assert.equal((await req(`${own}?page_size=101`,0)).status,422);
      assert.equal((await req(`${admin}?owner_id=0`,2)).status,422);
    });
    await cases('PATCH merged times, empty/null fields, ownership and CSRF; submit fails with no registry',async()=>{
      assert.equal((await req(`${own}/${a}`,0,'PATCH',{name:' Đã sửa ',description:''})).status,200);
      assert.equal((await req(`${own}/${a}`,0)).data.data.description,null);
      for(const body of [{},{status:'ACTIVE'},{description:null},{closing_time:'05:30'}])assert.equal((await req(`${own}/${a}`,0,'PATCH',body)).status,422);
      assert.equal((await req(`${own}/${b}`,0,'PATCH',{name:'x'})).status,404);
      assert.equal((await req(`${own}/${a}`,0,'PATCH',{name:'x'},{'X-CSRF-Token':''})).status,403);
      const r=await req(`${own}/${a}/submit`,0,'POST',{}, {},unconfigured);assert.equal(r.status,503);
      assert.equal((await req(`${own}/${a}`,0)).data.data.status,'DRAFT');
    });
    await cases('Concurrent submit: one PENDING, other 409; pending cannot edit',async()=>{
      const results=await Promise.all([action(a,'submit',0),action(a,'submit',0)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      const row=(await req(`${own}/${a}`,0)).data.data;assert.equal(row.status,'PENDING');assert.ok(row.submitted_at);assert.equal(row.reviewed_at,null);
      assert.equal((await req(`${own}/${a}`,0,'PATCH',{name:'x'})).status,409);
      assert.equal((await action(a,'submit',0,{status:'ACTIVE'})).status,422);
    });
    await cases('Reject validation and metadata; REJECTED edit clears current review and resubmits',async()=>{
      for(const reason of ['', ' ', 'x'.repeat(501),null])assert.equal((await action(a,'reject',2,{reason})).status,422);
      assert.equal((await action(a,'reject',2,{reason:'  Cần sửa  '})).status,200);
      let row=(await req(`${own}/${a}`,0)).data.data;assert.equal(row.rejection_reason,'Cần sửa');assert.equal(row.reviewed_by,String(ids[2]));
      assert.equal((await req(`${own}/${a}`,0,'PATCH',{address:' Địa chỉ mới '})).status,200);
      row=(await req(`${own}/${a}`,0)).data.data;assert.equal(row.status,'DRAFT');for(const field of ['submitted_at','reviewed_by','reviewed_at','rejection_reason'])assert.equal(row[field],null);
      assert.equal((await action(a,'submit',0)).status,200);
    });
    await cases('Approve rejects locked owner/missing registry then approves core with zero children',async()=>{
      await prisma.user.update({where:{id:ids[0]},data:{status:'LOCKED',locked_at:new Date(),locked_reason:'Fixture only'}});
      assert.equal((await action(a,'approve')).data.error.code,'FACILITY_OWNER_UNAVAILABLE');
      await prisma.user.update({where:{id:ids[0]},data:{status:'ACTIVE',locked_at:null,locked_reason:null}});
      assert.equal((await req(`${admin}/${a}/approve`,2,'POST',{}, {},unconfigured)).status,503);
      assert.equal((await action(a,'approve')).status,200);
      const row=(await req(`${own}/${a}`,0)).data.data;assert.equal(row.status,'ACTIVE');assert.equal(row.reviewed_by,String(ids[2]));assert.equal(row.rejection_reason,null);
      assert.equal((await req(`${own}/${a}`,0,'PATCH',{name:'x'})).status,409);
      assert.equal((await action(a,'approve')).status,409);
    });
    await cases('Concurrent Admin approve/reject: one commit, one invalid-state conflict',async()=>{
      const id=await create();await action(id,'submit',0);
      const results=await Promise.all([action(id,'approve',2),action(id,'reject',3,{reason:'Review'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(results.find(r=>r.status===409).data.error.code,'INVALID_FACILITY_STATE');
      assert.ok(['ACTIVE','REJECTED'].includes((await req(`${own}/${id}`,0)).data.data.status));
    });
    await cases('Concurrent suspend, suspended edit denied; activate checks owner and clears metadata',async()=>{
      assert.equal((await action(a,'suspend',2,{reason:' '})).status,422);
      const results=await Promise.all([action(a,'suspend',2,{reason:' Tạm dừng '}),action(a,'suspend',3,{reason:'Khác'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal((await req(`${own}/${a}`,0,'PATCH',{name:'x'})).status,409);
      let row=(await req(`${own}/${a}`,0)).data.data;assert.ok(row.suspended_at);assert.ok(row.suspension_reason);
      await prisma.user.update({where:{id:ids[0]},data:{status:'LOCKED',locked_at:new Date(),locked_reason:'Fixture only'}});
      assert.equal((await action(a,'activate')).data.error.code,'FACILITY_OWNER_UNAVAILABLE');
      await prisma.user.update({where:{id:ids[0]},data:{status:'ACTIVE',locked_at:null,locked_reason:null}});
      assert.equal((await req(`${admin}/${a}/activate`,2,'POST',{}, {},unconfigured)).status,503);
      const activated=await Promise.all([action(a,'activate',2),action(a,'activate',3)]);assert.deepEqual(activated.map(r=>r.status).sort(),[200,409]);
      row=(await req(`${own}/${a}`,0)).data.data;assert.equal(row.status,'ACTIVE');assert.equal(row.suspended_at,null);assert.equal(row.suspension_reason,null);
    });
    await cases('PATCH versus submit and Admin review observes locked state; no lost state',async()=>{
      const id=await create();
      const results=await Promise.all([req(`${own}/${id}`,0,'PATCH',{name:'Race update'}),action(id,'submit',0)]);
      assert.equal(results[1].status,200);assert.ok([200,409].includes(results[0].status));
      let row=(await req(`${own}/${id}`,0)).data.data;assert.equal(row.status,'PENDING');assert.equal(row.name,results[0].status===200?'Race update':'Cơ sở thử');
      const pair=await Promise.all([req(`${own}/${id}`,0,'PATCH',{name:'Forbidden update'}),action(id,'approve')]);assert.equal(pair[0].status,409);assert.equal(pair[1].status,200);
      row=(await req(`${own}/${id}`,0)).data.data;assert.equal(row.status,'ACTIVE');assert.notEqual(row.name,'Forbidden update');
      await action(id,'suspend',2,{reason:'Fixture'});
      const mixed=await Promise.all([action(id,'activate',2),action(id,'reject',3,{reason:'Invalid'})]);assert.equal(mixed[0].status,200);assert.equal(mixed[1].status,409);
    });
    await cases('Runtime accepts ward/commune/special zone; invalid area returns 422',async()=>{
      for(const district of ['Phường Hải Châu','Xã Hòa Vang','Đặc khu Hoàng Sa']) {
        const created=await req(own,0,'POST',{...core,district});assert.equal(created.status,201);assert.equal(created.data.data.district,district);
        const id=created.data.data.id;
        const patched=await req(`${own}/${id}`,0,'PATCH',{district:'Xã Tam Hải'});assert.equal(patched.status,200);assert.equal(patched.data.data.district,'Xã Tam Hải');
      }
      const bad=await req(own,0,'POST',{...core,district:'Quận Hải Châu'});assert.equal(bad.status,422);assert.equal(bad.data.error.code,'INVALID_DISTRICT');
      const badPatch=await req(`${own}/${a}`,0,'PATCH',{district:'Không tồn tại'});assert.equal(badPatch.status,409); // ACTIVE: state guard wins.
    });
    await cases('No module children or notification, public guest read and no delete, health 200',async()=>{
      const facilities=await prisma.facility.findMany({where:{owner_id:{in:ids}},select:{id:true}}),facilityIds=facilities.map(f=>f.id);
      for(const model of ['court','facilityImage','facilityAmenity','priceRule','cancellationPolicy','bankAccount'])assert.equal(await prisma[model].count({where:{facility_id:{in:facilityIds}}}),0);
      assert.equal(await prisma.notification.count({where:{recipient_id:{in:ids}}}),0);
      // Public Phase 1 now provides guest reads; core mutation restrictions remain unchanged.
      const publicList=await req('/facilities',undefined);assert.equal(publicList.status,200);
      for(const card of publicList.data.data)assert.deepEqual(Object.keys(card).sort(),['id','name','district','address','cover_image_url','amenities'].sort());
      assert.equal((await req(`${own}/${a}`,0,'DELETE')).status,404);
      const health=await req('/health');assert.equal(health.status,200);assert.deepEqual(health.data,{success:true,message:'API is running'});
    });
  }catch(e){throw new Error('FACILITY_SETUP_FAILED: '+(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'CHECK_FAILED'));}
  finally {
    for(const s of [server,unconfigured])if(s?.listening)await new Promise(r=>s.close(r));
    try {
      if(started) {
        const fixtures=await prisma.user.findMany({where:{email_normalized:{in:emails}},select:{id:true,email_normalized:true}}),fixtureIds=fixtures.map(u=>u.id);
        assert.ok(fixtures.every(u=>u.email_normalized.startsWith(prefix+'-')));
        await prisma.$transaction(async tx=>{
          await tx.facility.deleteMany({where:{owner_id:{in:fixtureIds}}});
          await tx.authSession.deleteMany({where:{user_id:{in:fixtureIds}}});
          await tx.ownerProfile.deleteMany({where:{user_id:{in:fixtureIds}}});
          await tx.ownerRequest.deleteMany({where:{user_id:{in:fixtureIds}}});
          await tx.user.deleteMany({where:{id:{in:fixtureIds},email_normalized:{in:emails}}});
        },{maxWait:20000,timeout:30000});
        assert.equal(await prisma.user.count({where:{email_normalized:{in:emails}}}),0);
        assert.equal(await prisma.facility.count({where:{owner_id:{in:fixtureIds}}}),0);
        for(const model of ['authSession','ownerProfile','ownerRequest'])assert.equal(await prisma[model].count({where:{user_id:{in:fixtureIds}}}),0);
        console.log('FACILITY FIXTURE CLEANUP: PASS');
      }
    }finally{await prisma.$disconnect();}
  }
});
