import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { profileUpdate } from '../src/modules/users/profile/validation.js';
import { createProfileService } from '../src/modules/users/profile/service.js';
import { profileRoutes } from '../src/modules/users/profile/routes.js';
import { apiError } from '../src/modules/auth/routes.js';

const baseUser = { id: 7n, email:'member@example.test', email_normalized:'member@example.test', password_hash:'hidden', google_subject:null, full_name:'Member Name', phone:null, avatar_path:null, role:'CUSTOMER', status:'ACTIVE', locked_at:null, locked_reason:null, created_at:new Date(), updated_at:new Date(), ownerProfile:null };
const actor = { id: 9n, user:{id:'7'}, csrf_token:'a'.repeat(64) };

test('Profile validation accepts partial safe fields and normalizes whitespace/empty phone', () => {
  assert.deepEqual(profileUpdate({full_name:'  Tên mới  '}),{full_name:'Tên mới'});
  assert.deepEqual(profileUpdate({phone:'  090 123  '}),{phone:'090 123'});
  assert.deepEqual(profileUpdate({phone:'  '}),{phone:null});
  assert.deepEqual(profileUpdate({phone:null}),{phone:null});
});

test('Profile validation rejects empty/oversized values and mass assignment', () => {
  for (const body of [{},{full_name:'  '},{full_name:'x'.repeat(151)},{phone:'1'.repeat(31)},{email:'new@example.test'},{role:'ADMIN'},{capabilities:['ADMIN']},{user_id:'8'},{status:'LOCKED'}])
    assert.throws(()=>profileUpdate(body),{status:422,code:'VALIDATION_ERROR'});
});

test('Profile service returns a strict self DTO and updates only the session user', async () => {
  let updated;
  const db = {
    user:{findUnique:async({where})=>{assert.equal(where.id,7n);return {...baseUser};}},
    $transaction:async fn=>fn({
      $queryRaw:async()=>[{now:new Date('2026-10-13T00:00:00Z')}],
      authSession:{findUnique:async()=>({id:9n,user_id:7n,revoked_at:null,expires_at:new Date('2026-10-14T00:00:00Z')})},
      user:{findUnique:async()=>({...baseUser}),update:async({where,data})=>{assert.equal(where.id,7n);updated=data;}},
    }),
  };
  const service=createProfileService(db);
  const dto=await service.get(actor);
  assert.deepEqual(Object.keys(dto).sort(),['capabilities','email','full_name','has_local_password','id','phone'].sort());
  assert.equal(JSON.stringify(dto).includes('password_hash'),false);
  const result=await service.update(actor,{full_name:'New Name',phone:'090'});
  assert.deepEqual(updated,{full_name:'New Name',phone:'090'});assert.equal(result.full_name,'New Name');assert.equal(result.phone,'090');
});

test('Profile HTTP enforces auth, Origin, CSRF and exposes whitelist only', async t => {
  const profile={id:'7',full_name:'Member Name',email:'member@example.test',phone:null,capabilities:['CUSTOMER'],has_local_password:true};
  let active=true, updates=0;
  const auth={session:async token=>active&&token==='token'?actor:null};
  const service={get:async()=>profile,update:async(_actor,input)=>{updates++;return{...profile,...input}}};
  const app=express();app.use(express.json());app.use('/api/v1/users/me',profileRoutes(service,auth,{frontendUrl:'http://localhost:5173'}));app.use(apiError);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const send=(method='GET',body,headers={})=>fetch(`http://127.0.0.1:${server.address().port}/api/v1/users/me`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
  assert.equal((await send()).status,401);
  const good={Cookie:'booking_session=token',Origin:'http://localhost:5173','X-CSRF-Token':'a'.repeat(64)};
  const get=await send('GET',null,good);assert.equal(get.status,200);assert.deepEqual((await get.json()).data,profile);
  assert.equal((await send('PATCH',{full_name:'New'}, {...good,Origin:'https://evil.invalid'})).status,403);
  assert.equal((await send('PATCH',{full_name:'New'}, {...good,'X-CSRF-Token':''})).status,403);
  assert.equal((await send('PATCH',{email:'other@example.test'},good)).status,422);
  const patch=await send('PATCH',{full_name:'  New Name  ',phone:''},good);assert.equal(patch.status,200);assert.equal((await patch.json()).data.full_name,'New Name');assert.equal(updates,1);
  active=false;assert.equal((await send('GET',null,good)).status,401);
});
