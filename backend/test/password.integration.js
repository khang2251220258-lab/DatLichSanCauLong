import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createAuthService, tokenHash } from '../src/modules/auth/service.js';

test('Password Phase 2 HTTP/Prisma, fake email only, transaction rollback', {timeout:300000}, async t=>{
  const email=`password-${randomUUID()}@example.invalid`;const stop=new Error('ROLLBACK_FIXTURE');let userId;
  try {
    await prisma.$transaction(async tx=>{
      const db=new Proxy(tx,{get(target,key){return key==='$transaction'?async fn=>{
        await tx.$executeRawUnsafe('SAVEPOINT service_action');
        try {const result=await fn(tx);await tx.$executeRawUnsafe('RELEASE SAVEPOINT service_action');return result;}
        catch(error){await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT service_action');await tx.$executeRawUnsafe('RELEASE SAVEPOINT service_action');throw error;}
      }:target[key];}});
      const messages=[];const mail={assertConfigured(){},async send(message){messages.push(message);}};
      const service=createAuthService(db,mail);
      const user=await service.register({email,password:'Original123',full_name:'Password Test'});userId=BigInt(user.id);
      const old=await service.login({email,password:'Original123'});
      const app=createApp(db,{nodeEnv:'development',frontendUrl:'http://localhost:5173'},undefined,mail);
      const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
      async function request(path,body,session){
        const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/${path}`,{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/json',...(session?{Cookie:`booking_session=${session.token}`,'X-CSRF-Token':session.csrf_token}:{})},body:JSON.stringify(body)});
        const data=await r.json();
        await Promise.all([...app.locals.passwordTasks]);
        assert.ok(!JSON.stringify(data).includes('token_hash'));assert.ok(!JSON.stringify(data).includes('password_hash'));
        return {status:r.status,data,cookie:r.headers.get('set-cookie')};
      }
      async function waitMail(n){for(let i=0;i<100&&messages.length<n;i++)await new Promise(r=>setTimeout(r,10));assert.equal(messages.length,n);}
      let token, firstToken;
      try {
        await t.test('A/B/C uniform forgot response and normalization',async()=>{
          const yes=await request('forgot-password',{email:` ${email.toUpperCase()} `});await waitMail(1);
          const no=await request('forgot-password',{email:`missing-${email}`});assert.equal(yes.status,202);assert.equal(no.status,202);assert.deepEqual(yes.data.data,no.data.data);assert.equal(messages.length,1);firstToken=messages[0].token;
        });
        await t.test('D/E hash only, random token and exact 15-minute TTL',async()=>{
          const stored=await tx.passwordResetToken.findUnique({where:{token_hash:tokenHash(firstToken)}});assert.equal(stored.token_hash.length,32);assert.equal(stored.expires_at-stored.created_at,900000);assert.ok(/^[A-Za-z0-9_-]{43}$/.test(firstToken));assert.ok(!Object.values(stored).includes(firstToken));
        });
        await t.test('New request invalidates old; J invalidated token rejected',async()=>{
          assert.equal((await request('forgot-password',{email})).status,202);await waitMail(2);token=messages[1].token;assert.notEqual(token,firstToken);
          assert.equal((await request('reset-password',{token:firstToken,new_password:'Changed123'})).data.error.code,'INVALID_RESET_TOKEN');
        });
        await t.test('G unknown, H expired, I used token rejected',async()=>{
          assert.equal((await request('reset-password',{token:randomBytes(32).toString('base64url'),new_password:'Changed123'})).status,422);
          const stored=await tx.passwordResetToken.findUnique({where:{token_hash:tokenHash(token)}});
          await tx.passwordResetToken.update({where:{id:stored.id},data:{expires_at:new Date(0)}});
          assert.equal((await request('reset-password',{token,new_password:'Changed123'})).data.error.code,'INVALID_RESET_TOKEN');
          await tx.passwordResetToken.update({where:{id:stored.id},data:{expires_at:stored.expires_at,used_at:new Date()}});
          assert.equal((await request('reset-password',{token,new_password:'Changed123'})).status,422);
          await tx.passwordResetToken.update({where:{id:stored.id},data:{used_at:null}});
        });
        await t.test('K invalid new password leaves token unused',async()=>{
          assert.equal((await request('reset-password',{token,new_password:'short'})).status,422);
          assert.equal((await tx.passwordResetToken.findUnique({where:{token_hash:tokenHash(token)}})).used_at,null);
        });
        await t.test('F/L/M/N/O reset success, one use, old sessions/password denied',async()=>{
          const r=await request('reset-password',{token,new_password:'Changed123'});assert.equal(r.status,200);assert.ok(r.cookie.includes('Expires=Thu, 01 Jan 1970'));
          assert.equal((await request('reset-password',{token,new_password:'Otherpass123'})).status,422);
          assert.equal(await service.session(old.token),null);
          await assert.rejects(()=>service.login({email,password:'Original123'}),{code:'INVALID_CREDENTIALS'});
          assert.ok((await service.login({email,password:'Changed123'})).token);
        });
        const current=await service.login({email,password:'Changed123'});
        await t.test('Q/R/S wrong current password, bad policy, missing session',async()=>{
          assert.equal((await request('change-password',{current_password:'Wrong123',new_password:'Nextpass123'},current)).data.error.code,'INVALID_CURRENT_PASSWORD');
          assert.equal((await request('change-password',{current_password:'Changed123',new_password:'short'},current)).status,422);
          assert.equal((await request('change-password',{current_password:'Changed123',new_password:'Nextpass123'})).status,401);
        });
        const deliver=await service.forgot({email});await deliver();const pendingToken=messages.at(-1).token;
        await t.test('P/T change success revokes all sessions and reset tokens',async()=>{
          const r=await request('change-password',{current_password:'Changed123',new_password:'Nextpass123'},current);assert.equal(r.status,200);assert.ok(r.cookie.includes('Expires=Thu, 01 Jan 1970'));
          assert.equal(await service.session(current.token),null);assert.equal(await tx.authSession.count({where:{user_id:userId,revoked_at:null}}),0);
          assert.ok((await tx.passwordResetToken.findUnique({where:{token_hash:tokenHash(pendingToken)}})).invalidated_at);
          await assert.rejects(()=>service.login({email,password:'Changed123'}),{code:'INVALID_CREDENTIALS'});assert.ok((await service.login({email,password:'Nextpass123'})).token);
        });
        await t.test('U Google-only cannot acquire password; forgot sends nothing',async()=>{
          const googleSession=await service.login({email,password:'Nextpass123'});await tx.user.update({where:{id:userId},data:{password_hash:null}});
          const count=messages.length;
          assert.equal((await request('change-password',{current_password:'Nextpass123',new_password:'Another123'},googleSession)).data.error.code,'PASSWORD_NOT_CONFIGURED');
          assert.equal(await service.forgot({email}),null);assert.equal(messages.length,count);assert.equal((await tx.user.findUnique({where:{id:userId}})).password_hash,null);
        });
      }finally{await new Promise(resolve=>server.close(resolve));}
      throw stop;
    },{maxWait:20000,timeout:270000});
  }catch(error){if(error!==stop)throw new Error('Password integration failed; sensitive details suppressed');}
  finally{
    try{assert.equal(await prisma.user.count({where:{email_normalized:email}}),0);if(userId){assert.equal(await prisma.authSession.count({where:{user_id:userId}}),0);assert.equal(await prisma.passwordResetToken.count({where:{user_id:userId}}),0);}}
    finally{await prisma.$disconnect();}
  }
});
