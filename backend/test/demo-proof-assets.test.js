import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { assertDemoProofGuard, createSyntheticProof, validateManagedRows } from '../scripts/seed-demo-proofs.js';

test('synthetic payment and refund proofs are safe PNG fixtures within upload limits', async () => {
  for (const kind of ['payment', 'refund']) {
    const buffer = await createSyntheticProof(kind);
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 760);
    assert.ok(buffer.length > 0 && buffer.length <= 5_000_000);
  }
});

test('managed proof rows accept only current private namespaces and lifecycle states', () => {
  const payment = [{ id: 1n, image_path: 'demo-fixtures/payment-proofs/pending_confirmation-1', mime_type: 'image/png', status: 'SUBMITTED' }];
  const refunds = [{ id: 2n, proof_image_path: 'demo-fixtures/refund-proofs/cancelled-3', proof_mime_type: 'image/png', status: 'PROOF_SUBMITTED' }];
  assert.deepEqual(validateManagedRows(payment, refunds), []);
  assert.deepEqual(validateManagedRows([{ ...payment[0], image_path: 'public/demo.png' }], refunds), ['payment:1']);
  assert.deepEqual(validateManagedRows(payment, [{ ...refunds[0], status: 'PENDING' }]), ['refund-state:2']);
});

test('write guard is development-only and requires exact target plus Cloudinary configuration', () => {
  const url = 'postgresql://demo:secret@db.example.invalid:5432/demo';
  const base = { DATABASE_URL: url, NODE_ENV: 'development', DEMO_SEED_CONFIRM: 'BOOKING_DEVELOPMENT_ONLY', CLOUDINARY_CLOUD_NAME: 'configured', CLOUDINARY_API_KEY: 'configured', CLOUDINARY_API_SECRET: 'configured' };
  const fingerprint = (() => { try { return assertDemoProofGuard({ ...base, DEMO_SEED_TARGET_FINGERPRINT: 'wrong' }); } catch { return null; } })();
  assert.equal(fingerprint, null);
  const expected = createHashForTest(url);
  assert.equal(assertDemoProofGuard({ ...base, DEMO_SEED_TARGET_FINGERPRINT: expected }), expected);
  assert.throws(() => assertDemoProofGuard({ ...base, NODE_ENV: 'production', DEMO_SEED_TARGET_FINGERPRINT: expected }), /NODE_ENV/);
  assert.throws(() => assertDemoProofGuard({ ...base, CLOUDINARY_API_SECRET: '', DEMO_SEED_TARGET_FINGERPRINT: expected }), /CLOUDINARY_API_SECRET_MISSING/);
});

function createHashForTest(value) {
  const url = new URL(value);
  return createHash('sha256').update(`${url.protocol}//${url.hostname}:${url.port || 'default'}${url.pathname}`).digest('hex').slice(0, 16);
}
