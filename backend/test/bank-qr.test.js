import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { qrInput, MAX_QR_BYTES } from '../src/modules/facilities/booking-configuration/qr-validation.js';

const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
const jpeg = await sharp(png).jpeg().toBuffer();
const file = (buffer, mimetype) => ({ buffer, mimetype, originalname: 'untrusted.bin' });
const code = value => error => error.code === value;

test('Bank QR accepts genuine JPEG/PNG and always normalizes to one PNG', async () => {
  for (const input of [file(png, 'image/png'), file(jpeg, 'image/jpeg')]) {
    const value = await qrInput(input, {});
    assert.equal(value.mime_type, 'image/png');
    assert.equal((await sharp(value.buffer).metadata()).format, 'png');
    assert.equal(value.size_bytes, BigInt(value.buffer.length));
  }
});

test('Bank QR rejects MIME/signature mismatch, malformed input, extra fields and byte limit', async () => {
  await assert.rejects(qrInput(file(png, 'image/jpeg'), {}), code('INVALID_FILE_TYPE'));
  await assert.rejects(qrInput(file(Buffer.from('not-image'), 'image/png'), {}), code('INVALID_FILE_TYPE'));
  await assert.rejects(qrInput(file(png.subarray(0, 20), 'image/png'), {}), code('INVALID_IMAGE'));
  await assert.rejects(qrInput(file(png, 'image/png'), { status: 'ACTIVE' }), code('VALIDATION_ERROR'));
  await assert.rejects(qrInput(file(Buffer.alloc(MAX_QR_BYTES + 1), 'image/png'), {}), code('PROOF_TOO_LARGE'));
});
