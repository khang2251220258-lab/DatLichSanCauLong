import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyInput, listQuery, requestId } from '../src/modules/courts/validation.js';
import { isCourtNameConflict } from '../src/modules/courts/service.js';

test('Court create: Unicode NFC/trim, boundary lengths, description plain text', () => {
  assert.deepEqual(bodyInput({ name: ' Sân 1 ', description: '  ' }), { name: 'Sân 1', description: null });
  assert.deepEqual(bodyInput({ name: 'Sân' }), { name: 'Sân' });
  assert.equal([...bodyInput({ name: '😀'.repeat(100) }).name].length, 100);
  assert.equal(bodyInput({ name: 'Sân', description: '<b>plain</b>' }).description, '<b>plain</b>');
  assert.equal(bodyInput({ name: 'Sân', description: 'x'.repeat(2000) }).description.length, 2000);
});
test('Court create rejects malformed/empty/oversize/server fields', () => {
  for (const body of [undefined, null, [], {}, { description: 'x' }, { name: '' }, { name: ' ' }, { name: 1 }, { name: 'x'.repeat(101) }, { name: 'x', description: null }, { name: 'x', description: 1 }, { name: 'x', description: 'x'.repeat(2001) }])
    assert.throws(() => bodyInput(body), { code: 'VALIDATION_ERROR', status: 422 });
  for (const key of ['id', 'facility_id', 'owner_id', 'status', 'created_at', 'updated_at', 'other'])
    assert.throws(() => bodyInput({ name: 'x', [key]: 'x' }), { status: 422 });
});
test('Court PATCH allowlist, omitted description, null and status handling', () => {
  assert.deepEqual(bodyInput({ name: ' Sân ' }, true), { name: 'Sân' });
  assert.deepEqual(bodyInput({ description: '' }, true), { description: null });
  for (const status of ['ACTIVE', 'INACTIVE']) assert.deepEqual(bodyInput({ status }, true), { status });
  for (const body of [{}, { facility_id: '1' }, { owner_id: '1' }, { unknown: true }, { status: 'DRAFT' }, { status: ' ACTIVE' }, { description: null }])
    assert.throws(() => bodyInput(body, true), { status: 422 });
});
test('Court list pagination/status and positive IDs', () => {
  assert.deepEqual(listQuery({}), { page: 1, page_size: 20 });
  for (const status of ['ACTIVE', 'INACTIVE']) assert.deepEqual(listQuery({ page: '2', page_size: '100', status }), { page: 2, page_size: 100, status });
  for (const query of [{ page: '0' }, { page: '-1' }, { page: '1.5' }, { page: ['1'] }, { page_size: '101' }, { page_size: '0' }, { page: '9007199254740991', page_size: '100' }, { status: 'DRAFT' }, { status: ['ACTIVE'] }, { sort: 'name' }])
    assert.throws(() => listQuery(query), { status: 422 });
  assert.equal(requestId('1'), 1n);
  for (const id of ['0', '-1', 'abc', '9223372036854775808']) assert.throws(() => requestId(id), { status: 422 });
});
test('Only exact Court name unique violation maps to conflict', () => {
  assert.equal(isCourtNameConflict({ code: 'P2002', meta: { modelName: 'Court', target: ['facility_id', 'name'] } }), true);
  assert.equal(isCourtNameConflict({ code: 'P2002', meta: { target: 'courts_facility_id_name_key' } }), true);
  assert.equal(isCourtNameConflict({ code: 'P2002', meta: { modelName: 'Court', driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', table: 'courts', constraint: { index: 'courts_facility_id_name_key' } } } } }), true);
  assert.equal(isCourtNameConflict({ code: 'P2002', meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', table: 'courts', constraint: { index: 'courts_pkey' } } } } }), false);
  for (const error of [{ code: 'P2002', meta: { target: ['id'] } }, { code: 'P2002', meta: { modelName: 'Other', target: ['facility_id', 'name'] } }, { code: 'P2003' }, { code: 'P2002' }, { code: 'P2002', meta: { target: ['facility_id', 'name', 'id'] } }]) assert.equal(isCourtNameConflict(error), false);
});
