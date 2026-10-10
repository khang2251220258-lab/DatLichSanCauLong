import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import sharp from 'sharp';
import { amenityInput, idsInput, imageInput, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, catalogQuery } from '../src/modules/facilities/presentation/validation.js';
import { createImageStorage, storageErrorCode } from '../src/modules/facilities/presentation/storage.js';
import { createPresentationService } from '../src/modules/facilities/presentation/service.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=', 'base64');
test('Presentation normalization, strict bodies, IDs and pagination', () => {
  assert.equal(amenityInput({ name: '  Ca\u0300 phe\u0302  ' }).name, 'Cà phê');
  assert.deepEqual(amenityInput({ is_active: false }, true), { is_active: false });
  assert.deepEqual(idsInput({ amenity_ids: [] }, 'amenity_ids'), []);
  for (const value of [{}, { name: '' }, { name: 'a'.repeat(101) }, { name: 1 }, { name: 'x', is_active: true }]) assert.throws(() => amenityInput(value), { status: 422 });
  assert.throws(() => amenityInput({ is_active: 'false' }, true), { status: 422 });
  for (const value of [['1', '1'], ['0'], [1], ['01'], ['9223372036854775808']]) assert.throws(() => idsInput({ amenity_ids: value }, 'amenity_ids'), { status: 422 });
  assert.deepEqual(catalogQuery({}), { page: 1, page_size: 20 });
  for (const q of [{ page_size: '101' }, { page: '0' }, { status: 'ACTIVE' }]) assert.throws(() => catalogQuery(q), { status: 422 });
});
test('Image validation fully decodes JPEG, PNG and WebP', async () => {
  for (const [format, mimetype] of [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]) {
    const buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#16834f' } }).toFormat(format).toBuffer();
    assert.equal(await imageInput({ buffer, mimetype }), buffer);
  }
});
test('Image validation rejects spoofed, malformed, truncated, oversized and excessive-pixel inputs', async () => {
  await assert.rejects(imageInput({ buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1), mimetype: 'image/png' }), { status: 413 });
  for (const file of [{ buffer: png, mimetype: 'image/jpeg' }, { buffer: Buffer.from('<svg/>'), mimetype: 'image/png' }, { buffer: Buffer.from('no image'), mimetype: 'image/webp' }]) await assert.rejects(imageInput(file), { status: 415 });
  const valid = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#16834f' } }).png().toBuffer();
  await assert.rejects(imageInput({ buffer: valid.subarray(0, Math.floor(valid.length / 2)), mimetype: 'image/png' }), { status: 422, code: 'INVALID_IMAGE' });
  const tooManyPixels = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: '#fff' } }).png().toBuffer();
  assert.ok(5001 * 5000 > MAX_IMAGE_PIXELS);
  await assert.rejects(imageInput({ buffer: tooManyPixels, mimetype: 'image/png' }), { status: 422, code: 'INVALID_IMAGE' });
  await assert.rejects(imageInput(undefined), { status: 422 });
  await assert.rejects(imageInput({ buffer: png, mimetype: 'image/png' }, { public_id: 'x' }), { status: 422 });
});
test('Cloudinary adapter requires actual configuration and uses fixed image/upload, no overwrite', async () => {
  assert.throws(() => createImageStorage({}).ready(), { code: 'IMAGE_STORAGE_NOT_CONFIGURED' });
  let uploadOptions, destroyOptions, urlOptions;
  const sdk = {
    url: (id, opts) => { urlOptions = opts; return `https://test.invalid/${id}`; },
    uploader: {
      upload_stream: (opts, cb) => { uploadOptions = opts; const s = new PassThrough(); s.on('finish', () => cb(null, { public_id: opts.public_id, resource_type: 'image', type: 'upload' })); return s; },
      destroy: async (_id, opts) => { destroyOptions = opts; return { result: 'ok' }; },
    },
  };
  // Fake adapter configuration only; never sent over the network.
  const storage = createImageStorage({ CLOUDINARY_CLOUD_NAME: 'unit', CLOUDINARY_API_KEY: 'unit', CLOUDINARY_API_SECRET: 'unit' }, sdk);
  assert.equal(await storage.upload(png, 'facility-images/unit'), 'facility-images/unit');
  assert.equal(uploadOptions.overwrite, false); assert.equal(uploadOptions.resource_type, 'image'); assert.equal(uploadOptions.type, 'upload');
  assert.deepEqual(uploadOptions.allowed_formats, ['jpg', 'png', 'webp']);
  await storage.destroy('facility-images/unit'); assert.equal(destroyOptions.invalidate, true);
  assert.match(storage.url('facility-images/unit'), /^https:/); assert.equal(urlOptions.secure, true); assert.equal(urlOptions.api_secret, undefined);
  sdk.uploader.destroy = async () => ({ result: 'unexpected' }); await assert.rejects(storage.destroy('x'), { code: 'IMAGE_STORAGE_UNAVAILABLE' });
  sdk.uploader.upload_stream = (_opts, cb) => { const s = new PassThrough(); s.on('finish', () => cb({ message: 'sensitive-provider-message' })); return s; };
  await assert.rejects(storage.upload(png, 'x'), e => e.code === 'IMAGE_STORAGE_UNAVAILABLE' && !e.message.includes('sensitive'));
  assert.equal(storageErrorCode({ message: 'secret', code: 'secret' }), 'STORAGE_ERROR');
  assert.equal(storageErrorCode({ http_code: 503 }), 'HTTP_503');
});
test('Database error cleanup preserves original error and never destroys an uncertain/committed asset', async () => {
  for (const outcome of ['rollback', 'committed', 'unknown']) {
    const original = new Error('Original database error'), deleted = [], logged = [];
    const actor = { id: 1n, user: { id: '1' } };
    const tx = {
      $queryRaw: async () => [{ now: new Date() }],
      authSession: { findUnique: async () => ({ user_id: 1n, expires_at: new Date(Date.now() + 10000), user: { status: 'ACTIVE', role: 'CUSTOMER', ownerProfile: {} } }) },
      facility: { findFirst: async () => ({ id: 2n, owner_id: 1n, status: 'DRAFT' }) },
      facilityImage: { count: async () => 0, create: async () => { throw original; } },
    };
    const db = { ...tx, $transaction: fn => fn(tx), facilityImage: { count: async () => { if (outcome === 'unknown') throw new Error('Unavailable'); return outcome === 'committed' ? 1 : 0; } } };
    const storage = { ready() {}, upload: async (_buffer, id) => id, destroy: async id => { deleted.push(id); throw { http_code: 503 }; } };
    const service = createPresentationService(db, storage, { error: row => logged.push(row) });
    await assert.rejects(service.upload(actor, 2n, png), error => error === original);
    assert.equal(deleted.length, outcome === 'rollback' ? 1 : 0);
    if (outcome === 'rollback') assert.equal(logged[0].code, 'HTTP_503');
    if (outcome === 'unknown') assert.equal(logged[0].code, 'DB_COMMIT_OUTCOME_UNKNOWN');
    if (outcome === 'committed') assert.equal(logged.length, 0);
  }
});
