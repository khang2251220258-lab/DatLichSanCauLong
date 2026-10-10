import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import express from 'express';
import sharp from 'sharp';
import { proofInput, MAX_PROOF_BYTES } from '../src/modules/payments/validation.js';
import { createProofStorage } from '../src/modules/payments/storage.js';
import { createPaymentService } from '../src/modules/payments/service.js';
import { paymentRoutes } from '../src/modules/payments/routes.js';
import { apiError } from '../src/modules/auth/routes.js';

const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#227744' } }).png().toBuffer();
const jpeg = await sharp(png).jpeg().toBuffer();
const file = (buffer=png,mimetype='image/png') => ({ buffer, mimetype, originalname: '../../untrusted.svg' });
const code = value => error => error.code === value;
function chunk(type,data) {
  const raw=Buffer.concat([Buffer.from(type),data]); let crc=0xffffffff;
  for(const byte of raw) {crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const size=Buffer.alloc(4), checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([size,raw,checksum]);
}
const insertChunk = c => Buffer.concat([png.subarray(0,33),c,png.subarray(33)]);

test('Payment JPEG/PNG real decoding, MIME signature and filename independence',async()=>{
  assert.equal((await proofInput(file())).mime_type,'image/png');
  assert.equal((await proofInput(file(jpeg,'image/jpeg'))).mime_type,'image/jpeg');
  const progressive=await sharp(png).jpeg({progressive:true}).toBuffer();
  assert.equal((await proofInput(file(progressive,'image/jpeg'))).size_bytes,BigInt(progressive.length));
  await assert.rejects(proofInput(file(png,'image/jpeg')),code('INVALID_FILE_TYPE'));
  await assert.rejects(proofInput(file(png,'image/webp')),code('INVALID_FILE_TYPE'));
  await assert.rejects(proofInput(file(Buffer.from('<svg/>'))),code('INVALID_FILE_TYPE'));
  await assert.rejects(proofInput(undefined),code('VALIDATION_ERROR'));
  await assert.rejects(proofInput(file(),{status:'APPROVED'}),code('VALIDATION_ERROR'));
});
test('Payment rejects truncated/corrupt PNG/JPEG, APNG, MPO and concatenated frames',async()=>{
  for(const buffer of [png.subarray(0,png.length-4),insertChunk(chunk('acTL',Buffer.alloc(8))),insertChunk(chunk('fcTL',Buffer.alloc(26)))])
    await assert.rejects(proofInput(file(buffer)),code('INVALID_IMAGE'));
  const corrupted=Buffer.from(png); corrupted[corrupted.length-18]^=0xff;
  await assert.rejects(proofInput(file(corrupted)),code('INVALID_IMAGE'));
  for(const buffer of [jpeg.subarray(0,jpeg.length-2),Buffer.concat([jpeg,jpeg]),Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,226,0,6,77,80,70,0]),jpeg.subarray(2)])])
    await assert.rejects(proofInput(file(buffer,'image/jpeg')),code('INVALID_IMAGE'));
});
test('Payment byte and pixel boundaries are inclusive',async()=>{
  const exact=insertChunk(chunk('npAD',Buffer.alloc(MAX_PROOF_BYTES-png.length-12)));
  assert.equal((await proofInput(file(exact))).size_bytes,5000000n);
  await assert.rejects(proofInput(file(Buffer.alloc(MAX_PROOF_BYTES+1))),code('PROOF_TOO_LARGE'));
  const atLimit=await sharp({create:{width:5000,height:5000,channels:3,background:'#fff'}}).png().toBuffer();
  assert.ok(await proofInput(file(atLimit)));
  const over=await sharp({create:{width:5001,height:5000,channels:3,background:'#fff'}}).png().toBuffer();
  await assert.rejects(proofInput(file(over)),code('INVALID_IMAGE'));
});
test('Payment storage uses authenticated image, overwrite false, no URL and sanitized provider errors',async()=>{
  const calls=[];let fail=false;
  const sdk={uploader:{upload_stream(options,callback){calls.push(options);return new Writable({write(_b,_e,done){done();},final(done){callback(fail?new Error('SECRET_PROVIDER_RESPONSE'):null,{public_id:options.public_id,resource_type:'image',type:'authenticated'});done();}});},
    async destroy(id,options){calls.push({id,...options});return {result:'ok'};}}};
  const storage=createProofStorage({CLOUDINARY_CLOUD_NAME:'fixture',CLOUDINARY_API_KEY:'fixture',CLOUDINARY_API_SECRET:'fixture'},sdk);
  assert.equal(await storage.upload(png,'payment-proofs/fixture'),'payment-proofs/fixture');
  assert.equal(calls[0].type,'authenticated');assert.equal(calls[0].resource_type,'image');assert.equal(calls[0].overwrite,false);
  assert.deepEqual(calls[0].allowed_formats,['jpg','png']);assert.equal(storage.url,undefined);
  await storage.destroy('payment-proofs/fixture');assert.equal(calls[1].type,'authenticated');
  fail=true;await assert.rejects(storage.upload(png,'fixture'),e=>e.code==='IMAGE_STORAGE_UNAVAILABLE'&&!e.message.includes('SECRET'));
  assert.throws(()=>createProofStorage({},sdk).ready(),code('IMAGE_STORAGE_NOT_CONFIGURED'));
});

test('Payment multipart and security guard reject before storage',async()=>{
  const actor={id:1n,csrf_token:'a'.repeat(64),user:{id:'1',capabilities:['CUSTOMER']}};
  let submitted=0,checked=0;
  const service={async precheck(){checked++;},async submit(){submitted++;return {data:{ok:true}};}};
  const auth={async session(token){return token==='ok'?actor:token==='admin'?{...actor,user:{...actor.user,capabilities:['ADMIN']}}:null;}};
  const app=express(); app.use('/api/v1/payments',paymentRoutes(service,auth,{frontendUrl:'http://localhost:5173'}));app.use(apiError);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  async function request(body,headers={},suffix='1/proof') {
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/payments/bookings/${suffix}`,{method:'POST',headers:{Origin:'http://localhost:5173',Cookie:'booking_session=ok','X-CSRF-Token':actor.csrf_token,...headers},body});
    return {status:r.status,body:await r.json()};
  }
  const form=(buffer=png,name='image',mime='image/png')=>{const f=new FormData();f.append(name,new Blob([buffer],{type:mime}),'anything.bin');return f;};
  try {
    assert.equal((await request(form(),{Cookie:''})).status,401);
    assert.equal((await request(form(),{Cookie:'booking_session=admin'})).status,403);
    assert.equal((await request(form(),{Origin:'https://evil.invalid'})).status,403);
    assert.equal((await request(form(),{'X-CSRF-Token':''})).status,403);assert.equal(checked,0);
    assert.equal((await request(form(),{},'0/proof')).status,422);
    assert.equal((await request(form(),{},'1/proof?x=1')).status,422);
    assert.equal((await request('{}',{'Content-Type':'application/json'})).status,422);
    assert.equal((await request(form(png,'other'))).status,422);
    const text=form();text.append('status','SUBMITTED');assert.equal((await request(text)).status,422);
    const duplicate=form();duplicate.append('image',new Blob([png],{type:'image/png'}),'two.png');assert.equal((await request(duplicate)).status,422);
    assert.equal((await request(new FormData())).status,422);
    assert.equal((await request(form(Buffer.alloc(MAX_PROOF_BYTES+1)))).body.error.code,'PROOF_TOO_LARGE');
    assert.equal((await request(form(png,'image','image/jpeg'))).status,415);
    assert.equal(submitted,0);
    const exact=insertChunk(chunk('npAD',Buffer.alloc(MAX_PROOF_BYTES-png.length-12)));
    assert.equal((await request(form(exact))).status,201);assert.equal(submitted,1);
  } finally {await new Promise(r=>server.close(r));}
});

test('Payment cleanup checks references on uncertain commit, preserves original errors and never deletes committed object',async()=>{
  const actor={id:1n,user:{id:'1'}}, now=new Date(), booking={id:1n,customer_id:1n,court_id:2n,status:'PENDING_PAYMENT',expires_at:new Date(+now+60000),court:{id:2n,facility_id:3n,facility:{owner_id:4n}}};
  for(const outcome of ['no-reference','referenced','unknown','destroy-failed']) {
    let uploaded=0,destroyed=0,transactions=0;const logs=[];
    const tx={$queryRaw:async()=>[{now}],court:{findUnique:async()=>booking.court},authSession:{findUnique:async()=>({user_id:1n,expires_at:new Date(+now+60000),user:{status:'ACTIVE',role:'CUSTOMER'}})},booking:{findFirst:async()=>booking},paymentProof:{findUnique:async()=>null}};
    const original=new Error('ORIGINAL');
    tx.paymentProof.count=async()=>{if(outcome==='unknown')throw original;return outcome==='referenced'?1:0;};
    const db={booking:tx.booking,$transaction:async fn=>{transactions++;if(transactions===2)throw original;return fn(tx);}};
    const storage={ready(){},async upload(_b,id){uploaded++;assert.match(id,/^payment-proofs\/[a-f0-9-]{36}$/);},async destroy(){destroyed++;if(outcome==='destroy-failed')throw Object.assign(new Error('secret'),{http_code:503});}};
    await assert.rejects(createPaymentService(db,storage,{error:v=>logs.push(v)}).submit(actor,1n,await proofInput(file())),e=>e===original);
    assert.equal(uploaded,1);assert.equal(destroyed,['no-reference','destroy-failed'].includes(outcome)?1:0);
    assert.equal(logs.length,['unknown','destroy-failed'].includes(outcome)?1:0);
    assert.ok(!JSON.stringify(logs).includes('secret'));
  }
});
