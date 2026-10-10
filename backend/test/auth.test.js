import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, normalizeEmail } from '../src/modules/auth/validation.js';
import { createRateLimits } from '../src/modules/auth/rate-limit.js';
import { authConfig } from '../src/modules/auth/config.js';
import express from 'express';
import { authRoutes, apiError } from '../src/modules/auth/routes.js';
test('Validation: email normalization, password boundaries, forbidden fields', () => {
  assert.equal(normalizeEmail('  User.Name+tag@Example.com '), 'user.name+tag@example.com');
  const input = { full_name: ' User ', email: ' USER@Example.com ', password: 'abcdefg1' };
  assert.equal(validate(input, true).full_name, 'User');
  assert.equal(validate(input, true).email, 'user@example.com');
  assert.equal(validate({ ...input, password: 'a'.repeat(127)+'1' }, true).password.length, 128);
  for (const change of [{ password:'abcdef1' },{ password:'a'.repeat(128)+'1' },{ password:'abcdefgh' },{ password:'12345678' },{ email:'invalid' },{ full_name:' ' },{ role:'ADMIN' },{ password:42 }]) assert.throws(() => validate({ ...input,...change }, true), { code:'VALIDATION_ERROR' });
  assert.equal(validate({ ...input,password:' abcde1 ' },true).password,' abcde1 ');
});
test('Rate limits: exact thresholds, normalized email, fixed window resets', () => {
  let time=0; const limits=createRateLimits(()=>time);
  for(const [scope,count] of [['register',5],['login',20]]) {
    for(let i=0;i<count;i++)limits.check(scope,'ip',count);
    assert.throws(()=>limits.check(scope,'ip',count),{status:429,code:'RATE_LIMITED'});
  }
  for(let i=0;i<5;i++){limits.check('failed','a@example.com',5,false);limits.fail('a@example.com');}
  assert.throws(()=>limits.check('failed',normalizeEmail(' A@Example.com '),5,false),{status:429});
  limits.check('failed','b@example.com',5,false);
  time=authConfig.windowMs; limits.check('register','ip',5); limits.check('login','ip',20);limits.check('failed','a@example.com',5,false);
});
test('Concurrent failed logins cannot bypass email limit', async () => {
  const limits=createRateLimits();
  const outcomes=await Promise.allSettled(Array.from({length:8},()=>limits.login('same@example.com',async()=>{
    limits.check('failed','same@example.com',5,false);await new Promise(resolve=>setImmediate(resolve));limits.fail('same@example.com');
  })));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,5);
  assert.equal(outcomes.filter(x=>x.status==='rejected'&&x.reason.status===429).length,3);
});
test('HTTP IP limits, error contract, production cookie and CORS Origin guard',async()=>{
  const app=express();app.use(express.json());
  const service={register:async()=>({id:'1'}),login:async()=>({user:{id:'1'},csrf_token:'a'.repeat(64),token:'x'.repeat(43),expires_at:new Date(Date.now()+authConfig.lifetimeMs)})};
  app.use('/auth',authRoutes(service,{nodeEnv:'production',frontendUrl:'https://booking.example'}));app.use(apiError);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/auth`;
    for(const [path,count] of [['register',5],['login',20]]){
      for(let i=0;i<=count;i++){
        const r=await fetch(`${url}/${path}`,{method:'POST',headers:{Origin:'https://booking.example','Content-Type':'application/json'},body:JSON.stringify({email:'user@example.com',password:'Password1',...(path==='register'?{full_name:'User'}:{})})});
        if(i<count){assert.equal(r.status,path==='register'?201:200);if(path==='login'){const c=r.headers.get('set-cookie');assert.ok(c.includes('Secure'));assert.ok(c.includes('HttpOnly'));assert.ok(c.includes('SameSite=Lax'));}}
        else{assert.equal(r.status,429);const body=await r.json();assert.equal(body.error.code,'RATE_LIMITED');assert.ok(body.meta.request_id);assert.ok(r.headers.get('retry-after'));}
      }
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});
