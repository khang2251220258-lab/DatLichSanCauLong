// Explicit opt-in: npm run test:auth:db. All application writes share an outer rollback transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { tokenHash } from '../src/modules/auth/service.js';

test('Auth HTTP + Prisma integration, all fixture data rolled back', { timeout: 240000 }, async t => {
  const email=`auth-${randomUUID()}@example.invalid`;
  const rollback=new Error('TEST_ROLLBACK');
  let userId;
  try {
    await prisma.$transaction(async tx => {
      const db=new Proxy(tx,{get(target,key){return key==='$transaction'?async fn=>fn(tx):target[key];}});
      const app=createApp(db,{nodeEnv:'development',frontendUrl:'http://localhost:5173'});
      const server=app.listen(0,'127.0.0.1');
      await new Promise(resolve=>server.once('listening',resolve));
      const base=`http://127.0.0.1:${server.address().port}/api/v1`;
      async function request(path,method='GET',body,headers={}) {
        await tx.$executeRawUnsafe('SAVEPOINT http_case');
        const res=await fetch(base+path,{method,headers:{Origin:'http://localhost:5173',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
        const data=res.status===204?null:await res.json();
        if(res.status>=400)await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT http_case');
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT http_case');
        // Never include response bodies/cookies in assertion messages.
        assert.ok(!JSON.stringify(data).includes('password_hash'));
        assert.ok(!JSON.stringify(data).includes('token_hash'));
        return {status:res.status,data,cookie:res.headers.get('set-cookie'),headers:res.headers};
      }
      let cookie,csrf;
      const input={email,password:'Testpass123',full_name:'Auth Test'};
      try {
        await t.test('A register valid, hash and no auto login',async()=>{
          const r=await request('/auth/register','POST',{...input,email:` ${email.toUpperCase()} `});assert.equal(r.status,201);assert.equal(r.cookie,null);userId=BigInt(r.data.data.user.id);
          const u=await tx.user.findUnique({where:{id:userId}});assert.equal(u.email_normalized,email);assert.ok(u.password_hash.startsWith('$argon2id$v=19$'));assert.deepEqual(u.password_hash.split('$')[3].split(',').sort(),['m=19456','p=1','t=2']);assert.notEqual(u.password_hash,input.password);
        });
        await t.test('B duplicate normalized email',async()=>{const r=await request('/auth/register','POST',input);assert.equal(r.status,409);assert.equal(r.data.error.code,'EMAIL_ALREADY_EXISTS');});
        await t.test('C invalid input and forbidden role',async()=>{assert.equal((await request('/auth/register','POST',{...input,role:'ADMIN'})).status,422);});
        await t.test('D login success and secure cookie attributes',async()=>{
          const r=await request('/auth/login','POST',{email:email.toUpperCase(),password:input.password});assert.equal(r.status,200);cookie=r.cookie.split(';')[0];csrf=r.data.data.csrf_token;
          assert.ok(r.cookie.includes('HttpOnly'));assert.ok(r.cookie.includes('SameSite=Lax'));assert.ok(!r.cookie.includes('Domain='));
          const s=await tx.authSession.findUnique({where:{token_hash:tokenHash(cookie.split('=')[1])}});assert.equal(s.token_hash.length,32);assert.equal(s.expires_at-s.created_at,7*86400000);
        });
        await t.test('E wrong password, F unknown email: same safe error',async()=>{
          for(const address of [email,`missing-${email}`]){const r=await request('/auth/login','POST',{email:address,password:'Wrongpass1'});assert.equal(r.status,401);assert.equal(r.data.error.code,'INVALID_CREDENTIALS');}
        });
        await t.test('G current user, H missing session',async()=>{assert.equal((await request('/auth/session','GET',undefined,{Cookie:cookie})).status,200);assert.equal((await request('/auth/session')).status,401);});
        await t.test('Origin and CSRF rejected',async()=>{
          assert.equal((await request('/auth/login','POST',{email,password:input.password},{Origin:'https://evil.invalid'})).status,403);
          assert.equal((await request('/auth/logout','POST',{}, {Cookie:cookie})).status,403);
        });
        await t.test('I logout, J revoked session cannot replay, idempotent logout',async()=>{
          assert.equal((await request('/auth/logout','POST',{}, {Cookie:cookie,'X-CSRF-Token':csrf})).status,204);
          assert.equal((await request('/auth/session','GET',undefined,{Cookie:cookie})).status,401);
          assert.equal((await request('/auth/logout','POST',{}, {Cookie:cookie})).status,204);
        });
        await t.test('K expired session denied',async()=>{
          const r=await request('/auth/login','POST',{email,password:input.password});assert.equal(r.status,200);const c=r.cookie.split(';')[0];
          await tx.authSession.updateMany({where:{user_id:userId},data:{expires_at:new Date(0)}});
          assert.equal((await request('/auth/session','GET',undefined,{Cookie:c})).status,401);
        });
        await t.test('Locked account and generic incorrect password',async()=>{
          await tx.user.update({where:{id:userId},data:{status:'LOCKED'}});
          assert.equal((await request('/auth/login','POST',{email,password:input.password})).status,403);
          assert.equal((await request('/auth/login','POST',{email,password:'Wrongpass1'})).status,401);
        });
        await t.test('Failed email limit returns 429',async()=>{
          // Three failures for this email above; next two reach five.
          for(let i=0;i<2;i++)assert.equal((await request('/auth/login','POST',{email,password:'Wrongpass1'})).status,401);
          const r=await request('/auth/login','POST',{email:` ${email.toUpperCase()} `,password:'Wrongpass1'});assert.equal(r.status,429);assert.ok(r.headers.get('retry-after'));
        });
        await t.test('Health response unchanged',async()=>{const r=await request('/health');assert.equal(r.status,200);assert.deepEqual(r.data,{success:true,message:'API is running'});});
      } finally {await new Promise(resolve=>server.close(resolve));}
      throw rollback;
    },{maxWait:20000,timeout:210000});
  } catch(error) { if(error!==rollback)throw new Error('Auth integration failed; credentials suppressed'); }
  finally {
    try {assert.equal(await prisma.user.count({where:{email_normalized:email}}),0);if(userId)assert.equal(await prisma.authSession.count({where:{user_id:userId}}),0);}
    finally {await prisma.$disconnect();}
  }
});
