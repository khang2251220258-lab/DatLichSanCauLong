import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyInput, validateCore, reasonInput, listQuery, time } from '../src/modules/facilities/validation.js';
import { supportedDistricts } from '../src/modules/facilities/districts.js';

const registry=supportedDistricts;
const core={name:'  Sân thử  ',address:' Địa chỉ thử ',district:'Phường Hải Châu',phone:' +84 (123) 456-789 ',opening_time:'06:00',closing_time:'22:30'};
test('Facility core trim, lengths, basic phone, nullable storage and strict allowlist',()=>{
  const value=bodyInput({...core,description:'  '});assert.equal(value.name,'Sân thử');assert.equal(value.description,null);
  assert.equal(validateCore(value,registry).description,null);
  assert.equal(bodyInput({name:'😀'.repeat(200)},true).name.length,400);
  for(const body of [{},{...core,name:' '},{...core,name:'x'.repeat(201)},{...core,address:'x'.repeat(501)},{...core,phone:'abc'},{...core,phone:'()'},{...core,phone:'1'.repeat(31)},{...core,description:null},{...core,description:'x'.repeat(2001)}])assert.throws(()=>bodyInput(body),{code:'VALIDATION_ERROR'});
  for(const key of ['owner_id','status','id','latitude','longitude','submitted_at','reviewed_by','reviewed_at','rejection_reason','suspended_at','suspension_reason','created_at','updated_at'])assert.throws(()=>bodyInput({...core,[key]:'x'}),{code:'VALIDATION_ERROR'});
  assert.throws(()=>bodyInput({},true));assert.throws(()=>bodyInput([]));
  assert.equal(bodyInput({description:'<b>literal</b>'},true).description,'<b>literal</b>');
});
test('Facility time boundaries and missing/invalid district fail closed',()=>{
  for(const value of ['6:00','24:00','06:15','06:00:00',' 06:00'])assert.throws(()=>time(value));
  for(const value of ['06:00','05:30'])assert.throws(()=>bodyInput({...core,closing_time:value}));
  assert.equal(supportedDistricts.length,94);
  assert.throws(()=>validateCore(bodyInput(core),[]),{code:'DISTRICT_NOT_CONFIGURED',status:503});
  assert.throws(()=>validateCore({...bodyInput(core),district:'NOT_SUPPORTED'},registry),{code:'INVALID_DISTRICT'});
});
test('Facility reason and pagination/status/owner filters',()=>{
  assert.equal(reasonInput({reason:'  Lý do  '}),'Lý do');
  for(const body of [{},{reason:' '},{reason:'x'.repeat(501)},{reason:'yes',status:'ACTIVE'}])assert.throws(()=>reasonInput(body));
  assert.equal(reasonInput({reason:'😀'.repeat(500)}).length,1000);
  assert.deepEqual(listQuery({}),{page:1,page_size:20});
  assert.equal(listQuery({owner_id:'1',status:'ACTIVE'},true).owner_id,1n);
  for(const query of [{page:'0'},{page_size:'101'},{page:'1.5'},{page:['1','2']},{owner_id:'1'},{status:'APPROVED'},{sort:'name'}])assert.throws(()=>listQuery(query));
});

test('Runtime registry: 94 unique immutable Unicode commune-level units, representatives',()=>{
  assert.equal(supportedDistricts.length,94);
  assert.equal(new Set(supportedDistricts).size,94);
  assert.ok(Object.isFrozen(supportedDistricts));
  assert.throws(()=>supportedDistricts.push('Invalid'),TypeError);
  assert.ok(supportedDistricts.every(v=>v.trim()===v&&v.length>0&&v.normalize('NFC')===v));
  assert.equal(supportedDistricts.filter(v=>v.startsWith('Phường ')).length,23);
  assert.equal(supportedDistricts.filter(v=>v.startsWith('Xã ')).length,70);
  assert.equal(supportedDistricts.filter(v=>v.startsWith('Đặc khu ')).length,1);
  for(const district of ['Phường Hải Châu','Xã Hòa Vang','Đặc khu Hoàng Sa','Xã Tam Hải','Xã Tân Hiệp'])assert.equal(validateCore({...core,district}).district,district);
  for(const district of ['Quận Hải Châu','Huyện Hòa Vang','Không tồn tại'])assert.throws(()=>validateCore({...core,district}),{status:422,code:'INVALID_DISTRICT'});
});
