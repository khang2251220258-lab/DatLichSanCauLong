import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBody, requestId, rejection, pagination } from '../src/modules/users/owner-requests/validation.js';
import { spawnSync } from 'node:child_process';
test('Owner Request validation: empty bodies, ID bounds, reason Unicode 1..500', () => {
  emptyBody(undefined); emptyBody({});
  for (const body of [null, [], { user_id: '1' }, { role: 'ADMIN' }, '']) assert.throws(() => emptyBody(body), { status: 422 });
  assert.equal(requestId('9223372036854775807'), 9223372036854775807n);
  for (const id of ['0','-1','1.2','9223372036854775808','1e2']) assert.throws(() => requestId(id), { status: 422 });
  assert.equal(rejection({ rejection_reason: '  a  ' }), 'a');
  assert.equal([...rejection({ rejection_reason: '😀'.repeat(500) })].length, 500);
  for (const body of [{},{rejection_reason:' \n\t '},{rejection_reason:'a'.repeat(501)},{rejection_reason:1},{rejection_reason:'ok',status:'REJECTED'}]) assert.throws(() => rejection(body), { status: 422 });
});
test('Owner Request pagination/filter validation', () => {
  assert.deepEqual(pagination({}), { page: 1, page_size: 20 });
  assert.deepEqual(pagination({page:'2',page_size:'100',status:'PENDING'},true),{page:2,page_size:100,status:'PENDING'});
  for (const query of [{page:'0'},{page:'1.2'},{page_size:'101'},{page:['1','2']},{page:'99999999999999999999'},{status:'UNKNOWN'},{sort:'id'}]) assert.throws(() => pagination(query,true), {status:422});
  assert.throws(() => pagination({status:'PENDING'}), {status:422});
});
test('Admin CLI refuses non-interactive execution without credentials', () => {
  const result = spawnSync(process.execPath, ['scripts/bootstrap-admin.js'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status,1); assert.ok(result.stderr.includes('INTERACTIVE_TERMINAL_REQUIRED'));
});
