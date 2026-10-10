// Opt-in, real concurrent connections require committed fixtures.
// Cleanup is restricted to unique, preselected fixture emails and their records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { bootstrapAdmin } from '../scripts/admin-bootstrap-service.js';

test('Owner Request HTTP + real PostgreSQL concurrency, scoped cleanup', {timeout:360000}, async t => {
  const prefix = 'owner-' + randomUUID();
  const emails = ['customer-a','customer-b','admin-a','admin-b'].map(n=>`${prefix}-${n}@example.invalid`);
  const password = 'Test' + randomBytes(20).toString('hex') + '1';
  const config = {nodeEnv:'development',frontendUrl:'http://localhost:5173'};
  const auth = createAuthService(prisma);
  let server, ids=[], initialized=false;
  const cases = async (name, fn) => t.test(name, async()=>{try{await fn();}catch(e){if(e.code==='ERR_ASSERTION')throw e;throw new Error('OWNER_TEST_FAILED: '+(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'UNEXPECTED_ERROR'));}});
  try {
    assert.equal(await prisma.user.count({where:{email_normalized:{in:emails}}}),0);
    initialized=true;
    for (let i=0;i<2;i++) await auth.register({email:emails[i],full_name:`Fixture ${i}`,password});
    for (let i=2;i<4;i++) await bootstrapAdmin(prisma,{email:emails[i],full_name:`Fixture ${i}`,password});
    const users=await prisma.user.findMany({where:{email_normalized:{in:emails}},select:{id:true,email_normalized:true,role:true,status:true}});
    ids=emails.map(e=>users.find(u=>u.email_normalized===e).id);
    const sessions=[];for(const email of emails)sessions.push(await auth.login({email,password}));
    const app=createApp(prisma,config);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    async function request(path, who, method='GET', body, extra={}) {
      const session=typeof who==='number'?sessions[who]:who;
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`,{method,headers:{Origin:config.frontendUrl,...(session?{Cookie:`booking_session=${session.token}`,'X-CSRF-Token':session.csrf_token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
      const data=await response.json();assert.ok(!JSON.stringify(data).includes('password_hash'));assert.ok(!JSON.stringify(data).includes('token_hash'));
      return {status:response.status,data};
    }
    const own='/users/me/owner-requests',admin='/admin/owner-requests';let aId,bId;
    await cases('Bootstrap creates ADMIN; duplicate cannot promote CUSTOMER',async()=>{
      assert.equal(users.filter(u=>u.role==='ADMIN'&&u.status==='ACTIVE').length,2);
      await assert.rejects(()=>bootstrapAdmin(prisma,{email:emails[0].toUpperCase(),full_name:'Other',password}),{code:'EMAIL_ALREADY_EXISTS'});
      assert.equal((await prisma.user.findUnique({where:{id:ids[0]}})).role,'CUSTOMER');
      assert.equal(await prisma.ownerProfile.count({where:{user_id:{in:ids}}}),0);
    });
    await cases('Auth, role, Origin, CSRF, extra fields required',async()=>{
      assert.equal((await request(own,null)).status,401);
      assert.equal((await request(admin,0)).status,403);
      assert.equal((await request(own,2)).status,403);
      assert.equal((await request(own,0,'POST',{}, {'X-CSRF-Token':''})).status,403);
      assert.equal((await request(own,0,'POST',{}, {Origin:'https://evil.invalid'})).status,403);
      assert.equal((await request(own,0,'POST',{user_id:String(ids[1])})).status,422);
    });
    await cases('Concurrent create: exactly one 201 and one pending conflict',async()=>{
      const results=await Promise.all([request(own,0,'POST',{}),request(own,0,'POST',{})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
      assert.equal(results.find(r=>r.status===409).data.error.code,'REQUEST_ALREADY_PENDING');
      const row=results.find(r=>r.status===201).data.data;aId=row.id;
      assert.equal(row.status,'PENDING');assert.equal(row.user_id,String(ids[0]));assert.equal(row.applicant_email_snapshot,emails[0]);assert.equal(row.applicant_name_snapshot,'Fixture 0');assert.equal(row.applicant_phone_snapshot,null);
      assert.equal(await prisma.ownerRequest.count({where:{user_id:ids[0],status:'PENDING'}}),1);
    });
    await cases('Own detail/history, cross-user detail hidden, pagination',async()=>{
      assert.equal((await request(`${own}/${aId}`,0)).status,200);
      assert.equal((await request(`${own}/${aId}`,1)).status,404);
      const r=await request(`${own}?page=1&page_size=1`,0);assert.equal(r.data.meta.total,1);assert.equal(r.data.meta.page_size,1);assert.equal(r.data.data[0].id,aId);
      assert.equal((await request(`${own}?page=0`,0)).status,422);
      assert.equal((await request(`${own}?page_size=101`,0)).status,422);
      assert.equal((await request(`${own}/0`,0)).status,422);
    });
    await cases('Admin list/status filter/detail and rejection validation',async()=>{
      const list=await request(`${admin}?status=PENDING&page_size=100`,2);assert.equal(list.status,200);assert.ok(list.data.data.every(row=>row.status==='PENDING'));assert.ok(list.data.data.some(row=>row.id===aId));
      assert.equal((await request(`${admin}/${aId}`,2)).status,200);
      assert.equal((await request(`${admin}?status=BAD`,2)).status,422);
      for(const body of [{},{rejection_reason:' \t '},{rejection_reason:'x'.repeat(501)}])assert.equal((await request(`${admin}/${aId}/reject`,2,'POST',body)).status,422);
      assert.equal((await request(`${admin}/${aId}/approve`,2,'POST',{role:'OWNER'})).status,422);
    });
    await cases('Reject preserves history; customer creates a new request',async()=>{
      const r=await request(`${admin}/${aId}/reject`,2,'POST',{rejection_reason:'  Cần xem xét lại  '});assert.equal(r.status,200);assert.equal(r.data.data.request.rejection_reason,'Cần xem xét lại');assert.equal(r.data.data.request.reviewed_by,String(ids[2]));
      assert.equal(await prisma.ownerProfile.count({where:{user_id:ids[0]}}),0);
      const next=await request(own,0,'POST',{});assert.equal(next.status,201);const oldId=aId;aId=next.data.data.id;assert.notEqual(aId,oldId);
      const history=await request(own,0);assert.equal(history.data.meta.total,2);assert.deepEqual(history.data.data.map(row=>row.id),[aId,oldId]);
      assert.equal((await request(`${own}?page=2&page_size=1`,0)).data.data[0].id,oldId);
    });
    await cases('Approve creates profile atomically, revokes sessions, retains CUSTOMER',async()=>{
      const r=await request(`${admin}/${aId}/approve`,2,'POST',{});assert.equal(r.status,200);assert.equal(r.data.data.request.rejection_reason,null);
      const profile=await prisma.ownerProfile.findUnique({where:{user_id:ids[0]}});assert.equal(profile.approved_request_id,BigInt(aId));
      assert.equal((await prisma.user.findUnique({where:{id:ids[0]}})).role,'CUSTOMER');
      assert.equal(await prisma.authSession.count({where:{user_id:ids[0],revoked_at:null}}),0);
      assert.equal((await request('/auth/session',0)).status,401);
      sessions[0]=await auth.login({email:emails[0],password});assert.deepEqual(sessions[0].user.capabilities,['CUSTOMER','OWNER']);
      const current=await request('/auth/session',0);assert.deepEqual(current.data.data.user.capabilities,['CUSTOMER','OWNER']);
      assert.equal((await request(own,0)).status,200);
      assert.equal((await request(own,0,'POST',{})).data.error.code,'ALREADY_OWNER');
      assert.equal((await request(admin,0)).status,403);
      assert.equal(await prisma.facility.count({where:{owner_id:ids[0]}}),0);
    });
    await cases('Two Admins concurrently approve/reject: exactly one decision',async()=>{
      const created=await request(own,1,'POST',{});assert.equal(created.status,201);bId=created.data.data.id;
      const results=await Promise.all([request(`${admin}/${bId}/approve`,2,'POST',{}),request(`${admin}/${bId}/reject`,3,'POST',{rejection_reason:'Không phù hợp'})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(results.find(r=>r.status===409).data.error.code,'INVALID_REQUEST_STATE');
      const row=await prisma.ownerRequest.findUnique({where:{id:BigInt(bId)}}),profile=await prisma.ownerProfile.findUnique({where:{user_id:ids[1]}});
      assert.ok(['APPROVED','REJECTED'].includes(row.status));assert.equal(!!profile,row.status==='APPROVED');
      assert.equal((await request(`${admin}/${bId}/approve`,3,'POST',{})).data.error.code,'INVALID_REQUEST_STATE');
    });
    await cases('No notification delivery/facility and health remains unchanged',async()=>{
      assert.equal(await prisma.notification.count({where:{recipient_id:{in:ids}}}),0);
      assert.equal(await prisma.facility.count({where:{owner_id:{in:ids}}}),0);
      const r=await request('/health');assert.equal(r.status,200);assert.deepEqual(r.data,{success:true,message:'API is running'});
    });
  } catch(e){throw new Error('OWNER_INTEGRATION_SETUP_FAILED: '+(/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'CHECK_FAILED'));}
  finally {
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
    try {
      if(initialized){
        const fixtures=await prisma.user.findMany({where:{email_normalized:{in:emails}},select:{id:true,email_normalized:true}});
        assert.ok(fixtures.every(u=>u.email_normalized.startsWith(prefix+'-')&&u.email_normalized.endsWith('@example.invalid')));
        const fixtureIds=fixtures.map(u=>u.id);
        await prisma.$transaction(async tx=>{
          await tx.authSession.deleteMany({where:{user_id:{in:fixtureIds}}});
          await tx.ownerProfile.deleteMany({where:{user_id:{in:fixtureIds}}});
          await tx.ownerRequest.deleteMany({where:{user_id:{in:fixtureIds}}});
          await tx.user.deleteMany({where:{id:{in:fixtureIds},email_normalized:{in:emails}}});
        },{maxWait:20000,timeout:30000});
        assert.equal(await prisma.user.count({where:{email_normalized:{in:emails}}}),0);
        assert.equal(await prisma.ownerRequest.count({where:{user_id:{in:fixtureIds}}}),0);
        assert.equal(await prisma.ownerProfile.count({where:{user_id:{in:fixtureIds}}}),0);
        assert.equal(await prisma.authSession.count({where:{user_id:{in:fixtureIds}}}),0);
        console.log('OWNER FIXTURE CLEANUP: PASS');
      }
    }finally{await prisma.$disconnect();}
  }
});
