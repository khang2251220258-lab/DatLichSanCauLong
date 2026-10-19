import test from 'node:test';
import assert from 'node:assert/strict';
import { createProofStorage } from '../src/modules/payments/storage.js';
import { cancellationReasonInput, ownerListQuery, rejectInput, emptyBody } from '../src/modules/payments/owner-validation.js';

const code = value => error => error.code === value;

test('Owner booking query accepts only status and bounded pagination', () => {
  assert.deepEqual(ownerListQuery({}), { page: 1, page_size: 20 });
  assert.deepEqual(ownerListQuery({ page: '2', page_size: '100', status: 'PENDING_CONFIRMATION' }),
    { page: 2, page_size: 100, status: 'PENDING_CONFIRMATION' });
  for (const query of [{ page: '0' }, { page_size: '101' }, { status: 'UNKNOWN' }, { facility_id: '1' }]) {
    assert.throws(() => ownerListQuery(query), code('VALIDATION_ERROR'));
  }
});

test('Owner rejection reason trims Unicode and enforces 1..500 code points', () => {
  assert.equal(rejectInput({ reason: '  Không khớp  ' }), 'Không khớp');
  assert.equal([...rejectInput({ reason: '😀'.repeat(500) })].length, 500);
  assert.throws(() => rejectInput({}), code('REJECTION_REASON_REQUIRED'));
  assert.throws(() => rejectInput({ reason: '  ' }), code('REJECTION_REASON_REQUIRED'));
  assert.throws(() => rejectInput({ reason: 'x'.repeat(501) }), code('VALIDATION_ERROR'));
  assert.throws(() => rejectInput({ reason: 'x', status: 'REJECTED' }), code('VALIDATION_ERROR'));
  assert.doesNotThrow(() => emptyBody({}));
  assert.throws(() => emptyBody({ status: 'CONFIRMED' }), code('VALIDATION_ERROR'));
});

test('Owner cancellation reason requires exact body and 1..500 Unicode code points', () => {
  assert.equal(cancellationReasonInput({ reason: '  Bảo trì đột xuất  ' }), 'Bảo trì đột xuất');
  assert.equal([...cancellationReasonInput({ reason: '😀'.repeat(500) })].length, 500);
  for (const body of [{}, { reason: ' ' }, { reason: null }, { reason: [] },
    { reason: 'x'.repeat(501) }, { reason: 'x', status: 'CANCELLED' }]) {
    assert.throws(() => cancellationReasonInput(body));
  }
});

test('Private proof URL is authenticated, signed by SDK and uses exact expiry', () => {
  const calls = [];
  const sdk = { utils: { private_download_url(publicId, format, options) {
    calls.push({ publicId, format, options }); return 'https://private.example.invalid/signed';
  } } };
  const storage = createProofStorage({ CLOUDINARY_CLOUD_NAME: 'fixture', CLOUDINARY_API_KEY: 'fixture', CLOUDINARY_API_SECRET: 'fixture' }, sdk);
  assert.equal(storage.privateUrl('payment-proofs/id', 'image/png', 123456), 'https://private.example.invalid/signed');
  assert.equal(calls[0].publicId, 'payment-proofs/id');assert.equal(calls[0].format, 'png');
  assert.equal(calls[0].options.type, 'authenticated');assert.equal(calls[0].options.resource_type, 'image');
  assert.equal(calls[0].options.expires_at, 123456);assert.equal(calls[0].options.attachment, false);
  assert.throws(() => storage.privateUrl('id', 'image/webp', 123456), code('IMAGE_STORAGE_UNAVAILABLE'));
});
