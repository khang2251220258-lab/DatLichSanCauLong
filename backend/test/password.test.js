import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createResetEmail } from '../src/modules/auth/email.js';
import { authRoutes, apiError } from '../src/modules/auth/routes.js';
import { validatePasswordAction } from '../src/modules/auth/validation.js';

test('Resend adapter: config, sender, fragment link, no provider error leakage', async () => {
  assert.throws(() => createResetEmail({apiKey:'',from:'',frontendUrl:'https://example.com',nodeEnv:'production'}).assertConfigured(),{status:503,code:'AUTH_EMAIL_UNAVAILABLE'});
  assert.throws(() => createResetEmail({apiKey:'test-only',from:'onboarding@resend.dev',frontendUrl:'https://example.com',nodeEnv:'production'}).assertConfigured(),{status:503});
  let sent;
  class FakeResend { emails={send:async payload=>{sent=payload;return {data:{id:'test'}};}}; }
  const adapter=createResetEmail({apiKey:'test-only',from:'sender@example.com',frontendUrl:'https://example.com',nodeEnv:'production'},FakeResend);
  await adapter.send({email:'receiver@example.invalid',token:'a'.repeat(43)});
  assert.equal(sent.from,'Đặt sân cầu lông Đà Nẵng <sender@example.com>');assert.ok(sent.text.includes('/reset-password#token='));assert.ok(!sent.text.includes('?token='));
  class BrokenResend { emails={send:async()=>({error:{message:'SECRET_PROVIDER_DETAIL'}})}; }
  await assert.rejects(()=>createResetEmail({apiKey:'test-only',from:'sender@example.com',frontendUrl:'https://example.com',nodeEnv:'production'},BrokenResend).send({email:'receiver@example.invalid',token:'a'.repeat(43)}),{message:'EMAIL_DELIVERY_FAILED'});
});
test('Password action validation preserves policy and rejects unknown fields',()=>{
  assert.equal(validatePasswordAction({email:' U.Name+tag@Example.com '},'forgot').email,'u.name+tag@example.com');
  for(const body of [{token:'x',new_password:'short1'},{token:'x',new_password:'abcdefgh'},{token:'x',new_password:'Password1',role:'ADMIN'}])assert.throws(()=>validatePasswordAction(body,'reset'),{status:422});
  assert.equal(validatePasswordAction({current_password:'wrong',new_password:'Newpass123'},'change').current_password,'wrong');
});
test('Forgot acknowledges before account processing/email completes',async()=>{
  let release, delivered=false;
  const gate=new Promise(resolve=>{release=resolve;});
  const service={assertEmailConfigured(){},async forgot(){await gate;return async()=>{delivered=true;};}};
  const app=express();app.use(express.json());const router=authRoutes(service,{frontendUrl:'http://localhost:5173',nodeEnv:'development'});app.use(router);app.use(apiError);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try {
    const r=await fetch(`http://127.0.0.1:${server.address().port}/forgot-password`,{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/json'},body:JSON.stringify({email:'test@example.invalid'}),signal:AbortSignal.timeout(3000)});
    assert.equal(r.status,202);assert.equal(delivered,false);release();await Promise.all([...router.passwordTasks]);assert.equal(delivered,true);
  } finally {release();await new Promise(resolve=>server.close(resolve));}
});
test('Forgot/reset HTTP limits and uniform configuration failure',async()=>{
  const app=express();app.use(express.json());
  const unavailable=createResetEmail({apiKey:'',from:'',frontendUrl:'http://localhost:5173'});
  const service={assertEmailConfigured:()=>unavailable.assertConfigured(),reset:async()=>{}};
  app.use(authRoutes(service,{frontendUrl:'http://localhost:5173',nodeEnv:'development'}));app.use(apiError);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const post=async(path,body)=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    for(let i=0;i<3;i++){const r=await post('/forgot-password',{email:i%2?' SAME@Example.com ':'same@example.com'});assert.equal(r.status,503);assert.equal((await r.json()).error.code,'AUTH_EMAIL_UNAVAILABLE');}
    assert.equal((await post('/forgot-password',{email:'same@example.com'})).status,429);
    assert.equal((await post('/forgot-password',{email:'different@example.com'})).status,503);
    assert.equal((await post('/forgot-password',{email:'third@example.com'})).status,429);
    for(let i=0;i<10;i++)assert.equal((await post('/reset-password',{token:'a'.repeat(43),new_password:'Password123'})).status,200);
    assert.equal((await post('/reset-password',{token:'a'.repeat(43),new_password:'Password123'})).status,429);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
