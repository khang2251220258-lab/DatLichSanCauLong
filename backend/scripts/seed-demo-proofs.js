import 'dotenv/config';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { prisma } from '../src/config/prisma.js';
import { createProofStorage } from '../src/modules/payments/storage.js';

const CONFIRMATION = 'BOOKING_DEVELOPMENT_ONLY';
const PAYMENT_PREFIX = 'demo-fixtures/payment-proofs/';
const REFUND_PREFIX = 'demo-fixtures/refund-proofs/';
const MAX_BYTES = 5_000_000;

export function targetFingerprint(env = process.env) {
  if (!env.DATABASE_URL) throw Error('DATABASE_URL_MISSING');
  const url = new URL(env.DATABASE_URL);
  return createHash('sha256').update(`${url.protocol}//${url.hostname}:${url.port || 'default'}${url.pathname}`).digest('hex').slice(0, 16);
}

export function assertDemoProofGuard(env = process.env) {
  const fingerprint = targetFingerprint(env);
  if (env.NODE_ENV !== 'development') throw Error('NODE_ENV_MUST_BE_DEVELOPMENT');
  if (env.DEMO_SEED_CONFIRM !== CONFIRMATION) throw Error('DEMO_SEED_CONFIRM_REQUIRED');
  if (env.DEMO_SEED_TARGET_FINGERPRINT !== fingerprint) throw Error('DEMO_SEED_TARGET_FINGERPRINT_MISMATCH');
  for (const name of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
    if (typeof env[name] !== 'string' || !env[name].trim()) throw Error(`${name}_MISSING`);
  }
  return fingerprint;
}

export async function createSyntheticProof(kind) {
  const payment = kind === 'payment';
  const title = payment ? 'PAYMENT PROOF' : 'REFUND PROOF';
  const accent = payment ? '#15803d' : '#b45309';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
    <rect width="1200" height="760" fill="#f8fafc"/>
    <rect x="70" y="60" width="1060" height="640" rx="34" fill="#ffffff" stroke="#dbe4df" stroke-width="4"/>
    <rect x="70" y="60" width="1060" height="118" rx="34" fill="${accent}"/>
    <rect x="70" y="144" width="1060" height="34" fill="${accent}"/>
    <text x="600" y="137" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#ffffff">DEMO</text>
    <text x="600" y="292" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#17211c">${title}</text>
    <text x="600" y="374" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#526159">NOT A REAL TRANSACTION</text>
    <line x1="190" y1="440" x2="1010" y2="440" stroke="#dbe4df" stroke-width="3"/>
    <text x="190" y="516" font-family="Arial, sans-serif" font-size="28" fill="#64748b">Synthetic asset for development and UI verification only</text>
    <text x="190" y="574" font-family="Arial, sans-serif" font-size="28" fill="#64748b">No real person, bank account, QR code or transaction data</text>
    <rect x="190" y="618" width="820" height="10" rx="5" fill="${accent}" opacity="0.22"/>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  const metadata = await sharp(buffer).metadata();
  if (metadata.format !== 'png' || metadata.width !== 1200 || metadata.height !== 760 || buffer.length > MAX_BYTES) throw Error('INVALID_SYNTHETIC_PROOF');
  return buffer;
}

export function validateManagedRows(paymentProofs, refunds) {
  const errors = [];
  for (const proof of paymentProofs) {
    if (!proof.image_path.startsWith(PAYMENT_PREFIX) || proof.mime_type !== 'image/png') errors.push(`payment:${proof.id}`);
    if (!['SUBMITTED', 'APPROVED', 'REJECTED'].includes(proof.status)) errors.push(`payment-state:${proof.id}`);
  }
  for (const refund of refunds) {
    if (!refund.proof_image_path?.startsWith(REFUND_PREFIX) || refund.proof_mime_type !== 'image/png') errors.push(`refund:${refund.id}`);
    if (!['PROOF_SUBMITTED', 'REFUNDED'].includes(refund.status)) errors.push(`refund-state:${refund.id}`);
  }
  return errors;
}

async function managedRows() {
  const [paymentProofs, refunds] = await Promise.all([
    prisma.paymentProof.findMany({ where: { image_path: { startsWith: PAYMENT_PREFIX } }, select: { id: true, image_path: true, mime_type: true, size_bytes: true, status: true }, orderBy: { id: 'asc' } }),
    prisma.refund.findMany({ where: { proof_image_path: { startsWith: REFUND_PREFIX } }, select: { id: true, proof_image_path: true, proof_mime_type: true, proof_size_bytes: true, status: true }, orderBy: { id: 'asc' } }),
  ]);
  const errors = validateManagedRows(paymentProofs, refunds);
  if (errors.length) throw Error(`DEMO_PROOF_DATA_INVALID:${errors.join(',')}`);
  if (!paymentProofs.some(row => row.status === 'SUBMITTED') || !paymentProofs.some(row => row.status === 'APPROVED') || !paymentProofs.some(row => row.status === 'REJECTED')) throw Error('DEMO_PAYMENT_PROOF_COVERAGE_INCOMPLETE');
  if (!refunds.some(row => row.status === 'PROOF_SUBMITTED') || !refunds.some(row => row.status === 'REFUNDED')) throw Error('DEMO_REFUND_PROOF_COVERAGE_INCOMPLETE');
  return { paymentProofs, refunds };
}

async function fetchAsset(storage, publicId, expiresAt) {
  const response = await fetch(storage.privateUrl(publicId, 'image/png', expiresAt), { cache: 'no-store' });
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_BYTES || !response.headers.get('content-type')?.toLowerCase().includes('image/')) return null;
  const metadata = await sharp(buffer).metadata();
  return metadata.format === 'png' && metadata.width === 1200 && metadata.height === 760 ? buffer : null;
}

async function listManaged(prefix) {
  const ids = [];
  let nextCursor;
  do {
    const page = await cloudinary.api.resources({ resource_type: 'image', type: 'authenticated', prefix, max_results: 100, next_cursor: nextCursor });
    ids.push(...(page.resources || []).map(row => row.public_id));
    nextCursor = page.next_cursor;
  } while (nextCursor);
  return ids;
}

async function ensureAsset(storage, publicId, buffer, expiresAt) {
  const current = await fetchAsset(storage, publicId, expiresAt);
  if (current) return { uploaded: false, size: current.length };
  await storage.upload(buffer, publicId);
  const uploaded = await fetchAsset(storage, publicId, expiresAt);
  if (!uploaded) throw Error('DEMO_PROOF_UPLOAD_NOT_DELIVERABLE');
  return { uploaded: true, size: uploaded.length };
}

async function verifyAssets(storage, rows) {
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  let available = 0;
  for (const row of rows.paymentProofs) if (await fetchAsset(storage, row.image_path, expiresAt)) available++;
  for (const row of rows.refunds) if (await fetchAsset(storage, row.proof_image_path, expiresAt)) available++;
  const expected = rows.paymentProofs.length + rows.refunds.length;
  if (available !== expected) throw Error('DEMO_PROOF_ASSET_MISSING');
  return { payment: rows.paymentProofs.length, refund: rows.refunds.length, available };
}

async function main() {
  const fingerprint = assertDemoProofGuard();
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
  const storage = createProofStorage();
  storage.ready();
  const rows = await managedRows();
  if (process.argv.includes('--verify')) {
    const assets = await verifyAssets(storage, rows);
    console.log(JSON.stringify({ mode: 'VERIFY_DEMO_PROOFS', target_fingerprint: fingerprint, assets }));
    return;
  }
  const [paymentBuffer, refundBuffer] = await Promise.all([createSyntheticProof('payment'), createSyntheticProof('refund')]);
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  let uploaded = 0;
  const paymentSizes = new Map();
  const refundSizes = new Map();
  for (const row of rows.paymentProofs) { const result = await ensureAsset(storage, row.image_path, paymentBuffer, expiresAt); uploaded += Number(result.uploaded); paymentSizes.set(row.id, result.size); }
  for (const row of rows.refunds) { const result = await ensureAsset(storage, row.proof_image_path, refundBuffer, expiresAt); uploaded += Number(result.uploaded); refundSizes.set(row.id, result.size); }
  let metadataUpdated = 0;
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261013)`;
    for (const row of rows.paymentProofs) {
      const size = BigInt(paymentSizes.get(row.id));
      if (row.mime_type !== 'image/png' || row.size_bytes !== size) { await tx.paymentProof.update({ where: { id: row.id }, data: { mime_type: 'image/png', size_bytes: size } }); metadataUpdated++; }
    }
    for (const row of rows.refunds) {
      const size = BigInt(refundSizes.get(row.id));
      if (row.proof_mime_type !== 'image/png' || row.proof_size_bytes !== size) { await tx.refund.update({ where: { id: row.id }, data: { proof_mime_type: 'image/png', proof_size_bytes: size } }); metadataUpdated++; }
    }
  }, { maxWait: 20000, timeout: 300000 });
  const desired = new Set([...rows.paymentProofs.map(row => row.image_path), ...rows.refunds.map(row => row.proof_image_path)]);
  const managed = [...await listManaged(PAYMENT_PREFIX), ...await listManaged(REFUND_PREFIX)];
  let removed = 0;
  for (const publicId of managed) if (!desired.has(publicId)) { await storage.destroy(publicId); removed++; }
  const assets = await verifyAssets(storage, await managedRows());
  console.log(JSON.stringify({ mode: 'SEEDED_DEMO_PROOFS', target_fingerprint: fingerprint, uploaded, metadata_updated: metadataUpdated, removed, assets }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await main(); } catch (error) { console.error(`DEMO PROOF SEED FAILED: ${error?.message || 'UNKNOWN_ERROR'}`); process.exitCode = 1; } finally { await prisma.$disconnect(); }
}
