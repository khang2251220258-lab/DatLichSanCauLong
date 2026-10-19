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
test('Public interval query accepts a complete valid range', () => {
  assert.deepEqual(listQuery({ date: '2030-01-01', start_time: '18:00', end_time: '20:00' }), {
    page: 1, page_size: 20, interval: { date: '2030-01-01', start_time: '18:00', end_time: '20:00' },
  });
});
test('Public query rejects unsupported, invalid, repeated and unsafe pagination', () => {
  for (const key of ['sort', 'amenity_ids', 'min_price', 'max_price', 'min_rating'])
    assert.throws(() => listQuery({ [key]: '' }), { status: 422, code: 'FILTER_NOT_CONFIGURED' });
  for (const input of [{ x: '1' }, { q: ['a', 'b'] }, { district: {} }, { page: '0' }, { page_size: '101' }, { page: '1.5' }, { page: '9007199254740991', page_size: '100' }])
    assert.throws(() => listQuery(input), { status: 422, code: 'VALIDATION_ERROR' });
  for (const district of ['', 'Unknown', 'phường hải châu']) assert.throws(() => listQuery({ district }), { code: 'INVALID_DISTRICT' });
});
test('Public interval query rejects incomplete, malformed, unaligned and excessive ranges', () => {
  for (const input of [
    { date: '2030-01-01' },
    { date: '2030-01-01', start_time: '18:00' },
    { date: '2030-01-01', start_time: '18:15', end_time: '19:00' },
    { date: '2030-01-01', start_time: '18:00', end_time: '18:00' },
    { date: '2030-01-01', start_time: '19:00', end_time: '18:00' },
    { date: '2030-01-01', start_time: '18:00', end_time: '21:30' },
    { date: '2030-01-01', start_time: 'x', end_time: '19:00' },
  ]) assert.throws(() => listQuery(input), { status: 422, code: 'INVALID_SEARCH_RANGE' });
  for (const date of ['2030-02-30', '01-01-2030', '0000-01-01'])
    assert.throws(() => listQuery({ date, start_time: '18:00', end_time: '19:00' }), { status: 422, code: 'INVALID_DATE' });
});
test('Public detail path and no-query contract', () => {
  assert.equal(requestId('1'), 1n); noQuery({});
  for (const id of ['0', '-1', 'abc', '9223372036854775808']) assert.throws(() => requestId(id), { status: 422 });
  assert.throws(() => noQuery({ q: '' }), { status: 422 });
});
