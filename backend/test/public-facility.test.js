import test from 'node:test';
import assert from 'node:assert/strict';
import { listQuery, noQuery, requestId } from '../src/modules/facilities/public/validation.js';

test('Public query defaults, normalization and district registry', () => {
  assert.deepEqual(listQuery({}), { page: 1, page_size: 20 });
  assert.equal(listQuery({ q: '  Ca\u0300 phe\u0302  ' }).q, 'Cà phê');
  assert.equal(listQuery({ q: '  ' }).q, '');
  for (const district of ['Phường Hải Châu', 'Xã Hòa Vang', 'Đặc khu Hoàng Sa'])
    assert.equal(listQuery({ district: ` ${district.normalize('NFD')} ` }).district, district);
});
test('Public query rejects unsupported, invalid, repeated and unsafe pagination', () => {
  for (const key of ['sort', 'amenity_ids', 'min_price', 'max_price', 'min_rating', 'date', 'start_time', 'end_time'])
    assert.throws(() => listQuery({ [key]: '' }), { status: 422, code: 'FILTER_NOT_CONFIGURED' });
  for (const input of [{ x: '1' }, { q: ['a', 'b'] }, { district: {} }, { page: '0' }, { page_size: '101' }, { page: '1.5' }, { page: '9007199254740991', page_size: '100' }])
    assert.throws(() => listQuery(input), { status: 422, code: 'VALIDATION_ERROR' });
  for (const district of ['', 'Unknown', 'phường hải châu']) assert.throws(() => listQuery({ district }), { code: 'INVALID_DISTRICT' });
});
test('Public detail path and no-query contract', () => {
  assert.equal(requestId('1'), 1n); noQuery({});
  for (const id of ['0', '-1', 'abc', '9223372036854775808']) assert.throws(() => requestId(id), { status: 422 });
  assert.throws(() => noQuery({ q: '' }), { status: 422 });
});
