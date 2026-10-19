import 'dotenv/config';
import app from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';
import { authConfig } from '../src/modules/auth/config.js';
import { tokenHash } from '../src/modules/auth/service.js';
import { assertDemoProofGuard } from './seed-demo-proofs.js';

const CUSTOMER_PREFIX = 'demo.state.customer';

async function request(base, path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers };
}

async function imageAvailable(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('image/')) return false;
  return (await response.arrayBuffer()).byteLength > 0;
}

function noStorageIdentifier(value) {
  const body = JSON.stringify(value);
  return !body.includes('image_path') && !body.includes('proof_image_path') && !body.includes('demo-fixtures/');
}

async function matrix() {
  const owned = { customer: { email_normalized: { startsWith: CUSTOMER_PREFIX } } };
  const pendingConfirmation = await prisma.booking.findFirst({ where: { status: 'PENDING_CONFIRMATION', ...owned }, include: { paymentProof: true }, orderBy: { id: 'asc' } });
  const confirmed = await prisma.booking.findFirst({ where: { status: 'CONFIRMED', ...owned }, include: { paymentProof: true }, orderBy: { id: 'asc' } });
  const refundPending = await prisma.booking.findFirst({ where: { status: 'CANCELLED', refund: { status: 'PENDING' }, ...owned }, include: { refund: true }, orderBy: { id: 'asc' } });
  const refundSubmitted = await prisma.booking.findFirst({ where: { status: 'CANCELLED', refund: { status: 'PROOF_SUBMITTED' }, ...owned }, include: { refund: true }, orderBy: { id: 'asc' } });
  const refunded = await prisma.booking.findFirst({ where: { status: 'CANCELLED', refund: { status: 'REFUNDED' }, ...owned }, include: { refund: true }, orderBy: { id: 'asc' } });
  if (!pendingConfirmation?.paymentProof || !confirmed?.paymentProof || !refundPending?.refund || !refundSubmitted?.refund || !refunded?.refund) throw Error('DEMO_RUNTIME_MATRIX_INCOMPLETE');
  return { pendingConfirmation, confirmed, refundPending, refundSubmitted, refunded };
}

async function main() {
  assertDemoProofGuard();
  const rows = await matrix();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  let rawToken;
  try {
    const login = await request(base, '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.frontendUrl }, body: JSON.stringify({ email: 'demo.owner@booking.invalid', password: process.env.DEMO_OWNER_PASSWORD }) });
    if (login.status !== 200) throw Error(`OWNER_LOGIN_HTTP_${login.status}`);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    rawToken = cookie?.slice(`${authConfig.cookieName}=`.length);
    if (!cookie || !rawToken || !login.data?.data?.csrf_token) throw Error('OWNER_LOGIN_RESPONSE_INVALID');
    const headers = { Cookie: cookie };
    const anonymous = await request(base, `/owner/payments/${rows.pendingConfirmation.paymentProof.id}`);
    if (anonymous.status !== 401) throw Error('UNAUTHENTICATED_PRIVATE_PROOF_NOT_REJECTED');
    const paymentResults = [];
    for (const booking of [rows.pendingConfirmation, rows.confirmed]) {
      const detail = await request(base, `/owner/bookings/${booking.id}`, { headers });
      const proof = await request(base, `/owner/payments/${booking.paymentProof.id}`, { headers });
      if (detail.status !== 200 || proof.status !== 200 || !noStorageIdentifier(detail.data) || !noStorageIdentifier(proof.data) || !await imageAvailable(proof.data.data.proof_image_url)) throw Error(`PAYMENT_RUNTIME_FAILED:${booking.status}`);
      paymentResults.push({ booking_id: String(booking.id), state: booking.status, route: `/owner/bookings/${booking.id}` });
    }
    const refundResults = [];
    for (const booking of [rows.refundPending, rows.refundSubmitted, rows.refunded]) {
      const detail = await request(base, `/owner/bookings/${booking.id}`, { headers });
      const refund = await request(base, `/owner/refunds/${booking.refund.id}`, { headers });
      const expectsImage = booking.refund.status !== 'PENDING';
      const imageOk = expectsImage ? await imageAvailable(refund.data?.data?.proof_image_url) : refund.data?.data?.proof_image_url === null;
      if (detail.status !== 200 || refund.status !== 200 || !noStorageIdentifier(detail.data) || !noStorageIdentifier(refund.data) || !imageOk) throw Error(`REFUND_RUNTIME_FAILED:${booking.refund.status}`);
      refundResults.push({ booking_id: String(booking.id), state: booking.refund.status, route: `/owner/bookings/${booking.id}` });
    }
    const logout = await request(base, '/auth/logout', { method: 'POST', headers: { ...headers, Origin: env.frontendUrl, 'X-CSRF-Token': login.data.data.csrf_token, 'Content-Type': 'application/json' }, body: '{}' });
    if (logout.status !== 204) throw Error(`OWNER_LOGOUT_HTTP_${logout.status}`);
    console.log(JSON.stringify({ mode: 'VERIFY_DEMO_PROOF_RUNTIME', payment: paymentResults, refunds: refundResults, anonymous_rejected: true, storage_identifier_safe: true }));
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (rawToken) await prisma.authSession.deleteMany({ where: { token_hash: tokenHash(rawToken) } });
    await prisma.$disconnect();
  }
}

try { await main(); } catch (error) { console.error(`DEMO PROOF RUNTIME FAILED: ${error?.message || 'UNKNOWN_ERROR'}`); process.exitCode = 1; }
