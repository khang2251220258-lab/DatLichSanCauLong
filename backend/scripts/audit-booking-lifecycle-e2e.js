import 'dotenv/config';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import app from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';

const CUSTOMER_EMAIL = 'demo.customer@booking.invalid';
const OTHER_CUSTOMER_EMAIL = 'demo.state.customer01@booking.invalid';
const OWNER_EMAIL = 'demo.owner@booking.invalid';
const EXPECTED_FINGERPRINT = '70d7a1b8f31f0e92';
const ORIGIN = env.frontendUrl;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fingerprint() {
  assert(process.env.DATABASE_URL, 'DATABASE_URL_MISSING');
  const url = new URL(process.env.DATABASE_URL);
  return createHash('sha256').update(`${url.protocol}//${url.hostname}:${url.port || 'default'}${url.pathname}`).digest('hex').slice(0, 16);
}

function assertEnvironment() {
  assert(process.env.NODE_ENV === 'development', 'NODE_ENV_MUST_BE_DEVELOPMENT');
  assert(fingerprint() === EXPECTED_FINGERPRINT, 'DATABASE_FINGERPRINT_MISMATCH');
  assert(process.env.DEMO_SEED_TARGET_FINGERPRINT === EXPECTED_FINGERPRINT, 'DEMO_TARGET_FINGERPRINT_MISMATCH');
  for (const key of ['DEMO_CUSTOMER_PASSWORD', 'DEMO_OWNER_PASSWORD', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
    assert(typeof process.env[key] === 'string' && process.env[key].trim(), `${key}_MISSING`);
  }
}

async function json(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function client(base) {
  let cookie = null;
  let csrf = null;
  return {
    async request(path, options = {}) {
      const headers = new Headers(options.headers || {});
      if (cookie) headers.set('Cookie', cookie);
      if (options.mutation !== false && options.method && options.method !== 'GET') {
        headers.set('Origin', ORIGIN);
        if (csrf) headers.set('X-CSRF-Token', csrf);
      }
      if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      const response = await fetch(base + path, { ...options, headers, body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined });
      return { status: response.status, body: await json(response), headers: response.headers };
    },
    async login(email, password) {
      const response = await this.request('/auth/login', { method: 'POST', body: { email, password } });
      assert(response.status === 200, `LOGIN_FAILED:${email}:${response.status}`);
      const setCookie = response.headers.get('set-cookie');
      assert(setCookie && response.body?.data?.csrf_token, `LOGIN_RESPONSE_INVALID:${email}`);
      cookie = setCookie.split(';')[0];
      csrf = response.body.data.csrf_token;
      return response.body.data.user;
    },
    async logout() {
      if (!cookie || !csrf) return;
      await this.request('/auth/logout', { method: 'POST', body: {} });
      cookie = null;
      csrf = null;
    },
    get cookie() { return cookie; },
    get csrf() { return csrf; },
  };
}

async function makeProof(color) {
  return sharp({ create: { width: 96, height: 64, channels: 3, background: color } }).png().toBuffer();
}

async function uploadProof(api, path, buffer) {
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: 'image/png' }), 'e2e-proof.png');
  return api.request(path, { method: 'POST', body: form });
}

function localDate(days) {
  const date = new Date(Date.now() + days * 86400000 + 7 * 3600000);
  return date.toISOString().slice(0, 10);
}

async function findCandidate(base, ownerId) {
  const facilities = await prisma.facility.findMany({
    where: { owner_id: ownerId, status: 'ACTIVE', bankAccount: { isNot: null }, cancellationPolicy: { isNot: null } },
    select: { id: true, name: true, cancellationPolicy: { select: { cutoff_hours: true } }, courts: { where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { id: 'asc' } } },
    orderBy: { id: 'asc' },
  });
  for (let days = 7; days <= 25; days += 1) {
    const date = localDate(days);
    for (const facility of facilities) for (const court of facility.courts) {
      const response = await fetch(`${base}/courts/${court.id}/availability?date=${date}`);
      if (!response.ok) continue;
      const payload = await json(response);
      const slots = payload?.data?.slots || [];
      for (let index = 0; index < slots.length - 1; index += 1) {
        const first = slots[index], second = slots[index + 1];
        if (first.state === 'AVAILABLE' && second.state === 'AVAILABLE' && first.slot_amount != null && second.slot_amount != null && first.end_at === second.start_at) {
          return { facility, court, date, slots: [first, second], serverTime: payload.meta.server_time };
        }
      }
    }
  }
  throw new Error('NO_TWO_CONTIGUOUS_AVAILABLE_SLOTS');
}

function noPrivateIdentifier(payload) {
  const text = JSON.stringify(payload);
  return !text.includes('image_path') && !text.includes('proof_image_path') && !text.includes('payment-proofs/') && !text.includes('refund-proofs/');
}

async function fetchImage(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const bytes = response.ok ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
  return response.ok && response.headers.get('content-type')?.startsWith('image/') && bytes.length > 0;
}

async function databaseSnapshot(bookingId) {
  return prisma.booking.findUnique({
    where: { id: BigInt(bookingId) },
    include: { slots: { orderBy: { start_at: 'asc' } }, paymentProof: true, refund: true, court: { include: { facility: true } } },
  });
}

async function main() {
  assertEnvironment();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const customer = client(base), owner = client(base), otherCustomer = client(base);
  const report = { fingerprint: fingerprint(), state_trace: [], payment_trace: ['null'], refund_trace: ['null'], checks: {}, rejected_mutations: {} };
  let bookingId = process.env.E2E_BOOKING_ID || null;
  try {
    const health = await fetch(`${base}/health`);
    assert(health.status === 200, `HEALTH_HTTP_${health.status}`);
    const customerUser = await customer.login(CUSTOMER_EMAIL, process.env.DEMO_CUSTOMER_PASSWORD);
    const ownerUser = await owner.login(OWNER_EMAIL, process.env.DEMO_OWNER_PASSWORD);
    const otherUser = await otherCustomer.login(OTHER_CUSTOMER_EMAIL, process.env.DEMO_CUSTOMER_PASSWORD);
    assert(customerUser.capabilities.includes('CUSTOMER'), 'CUSTOMER_CAPABILITY_MISSING');
    assert(ownerUser.capabilities.includes('OWNER'), 'OWNER_CAPABILITY_MISSING');
    assert(otherUser.capabilities.includes('CUSTOMER'), 'OTHER_CUSTOMER_CAPABILITY_MISSING');

    let candidate;
    let db;
    if (bookingId) {
      db = await databaseSnapshot(bookingId);
      assert(db && String(db.customer_id) === customerUser.id && String(db.court.facility.owner_id) === ownerUser.id, 'RESUME_BOOKING_OWNERSHIP_INVALID');
      assert(db.status === 'PENDING_CONFIRMATION' && db.paymentProof?.status === 'SUBMITTED' && !db.refund, 'RESUME_BOOKING_STATE_INVALID');
      candidate = { facility: { id: db.court.facility.id, name: db.court.facility.name }, court: { id: db.court.id, name: db.court.name },
        date: new Date(+db.start_at + 7 * 3600000).toISOString().slice(0, 10), slots: db.slots.map(slot => ({ start_at: slot.start_at.toISOString(), end_at: slot.end_at.toISOString(), slot_amount: slot.slot_amount.toString() })) };
      report.state_trace.push('PENDING_PAYMENT', 'PENDING_CONFIRMATION');
      report.payment_trace.push('SUBMITTED');
    } else candidate = await findCandidate(base, BigInt(ownerUser.id));
    const publicList = await fetch(`${base}/facilities?page=1&page_size=100`).then(async r => ({ status: r.status, body: await json(r) }));
    assert(publicList.status === 200 && publicList.body.data.some(row => row.id === String(candidate.facility.id)), 'FACILITY_NOT_PUBLIC');
    const publicDetail = await fetch(`${base}/facilities/${candidate.facility.id}`).then(async r => ({ status: r.status, body: await json(r) }));
    assert(publicDetail.status === 200 && publicDetail.body.data.courts.some(row => row.id === String(candidate.court.id)), 'PUBLIC_DETAIL_INVALID');
    report.discovery = { customer_id: customerUser.id, facility_id: String(candidate.facility.id), facility: candidate.facility.name, court_id: String(candidate.court.id), court: candidate.court.name, date: candidate.date, start_at: candidate.slots[0].start_at, end_at: candidate.slots[1].end_at };

    const expectedTotal = candidate.slots.reduce((sum, slot) => sum + BigInt(slot.slot_amount), 0n);
    const expectedDeposit = (expectedTotal * 30n + 50n) / 100n;
    if (!bookingId) {
      const created = await customer.request('/bookings', { method: 'POST', body: { court_id: String(candidate.court.id), start_at: candidate.slots[0].start_at, end_at: candidate.slots[1].end_at } });
      assert(created.status === 201 && created.body?.data?.status === 'PENDING_PAYMENT', `BOOKING_CREATE_FAILED:${created.status}`);
      bookingId = created.body.data.id;
      report.state_trace.push('PENDING_PAYMENT');
      assert(BigInt(created.body.data.total_amount) === expectedTotal, 'CREATE_TOTAL_MISMATCH');
      assert(BigInt(created.body.data.deposit_amount) === expectedDeposit, 'CREATE_DEPOSIT_MISMATCH');
      assert(BigInt(created.body.data.remaining_amount) === expectedTotal - expectedDeposit, 'CREATE_REMAINING_MISMATCH');
      db = await databaseSnapshot(bookingId);
      assert(db.slots.length === 2 && !db.paymentProof && !db.refund, 'CREATE_DB_RELATIONS_INVALID');
      assert(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: db.id } } }) === 2, 'CREATE_LOCKS_INVALID');
      const paymentUpload = await uploadProof(customer, `/payments/bookings/${bookingId}/proof`, await makeProof('#15803d'));
      assert(paymentUpload.status === 201 && paymentUpload.body.data.proof?.status === 'SUBMITTED' && paymentUpload.body.data.booking?.status === 'PENDING_CONFIRMATION', `PAYMENT_UPLOAD_FAILED:${paymentUpload.status}`);
      report.state_trace.push('PENDING_CONFIRMATION'); report.payment_trace.push('SUBMITTED');
      db = await databaseSnapshot(bookingId);
    }
    assert(BigInt(db.total_amount.toString()) === expectedTotal && BigInt(db.deposit_amount.toString()) === expectedDeposit && BigInt(db.remaining_amount.toString()) === expectedTotal - expectedDeposit, 'BOOKING_MONEY_MISMATCH');
    assert(db.status === 'PENDING_CONFIRMATION' && db.paymentProof?.status === 'SUBMITTED', 'PAYMENT_DB_STATE_INVALID');
    assert(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: db.id } } }) === 2, 'PAYMENT_LOCKS_INVALID');
    const proofId = String(db.paymentProof.id);

    const ownerList = await owner.request('/owner/bookings?page=1&page_size=100');
    assert(ownerList.status === 200 && ownerList.body.data.some(row => row.id === bookingId), 'OWNER_LIST_MISSING_BOOKING');
    const ownerBooking = await owner.request(`/owner/bookings/${bookingId}`);
    assert(ownerBooking.status === 200 && ownerBooking.body.data.status === 'PENDING_CONFIRMATION', 'OWNER_BOOKING_INVALID');
    const ownerProof = await owner.request(`/owner/payments/${proofId}`);
    assert(ownerProof.status === 200 && ownerProof.body.data.booking?.id === bookingId && noPrivateIdentifier(ownerProof.body), 'OWNER_PROOF_DTO_INVALID');
    assert(new Date(ownerProof.body.data.proof_image_expires_at) - new Date(ownerProof.body.meta.server_time) === 300000, 'PAYMENT_SIGNED_URL_TTL_INVALID');
    assert(await fetchImage(ownerProof.body.data.proof_image_url), 'PAYMENT_SIGNED_URL_UNAVAILABLE');
    report.checks.owner_proof = true;

    const crossCustomerRead = await otherCustomer.request(`/bookings/${bookingId}`);
    const crossCustomerProof = await otherCustomer.request(`/payments/bookings/${bookingId}/proof`);
    assert(crossCustomerRead.status === 404 && crossCustomerProof.status === 404, 'CROSS_CUSTOMER_PROTECTION_FAILED');
    report.checks.cross_customer = true;
    const noCsrf = await fetch(`${base}/owner/payments/${proofId}/confirm`, { method: 'POST', headers: { Cookie: owner.cookie, Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{}' });
    const badOrigin = await fetch(`${base}/owner/payments/${proofId}/confirm`, { method: 'POST', headers: { Cookie: owner.cookie, Origin: 'https://evil.invalid', 'X-CSRF-Token': owner.csrf, 'Content-Type': 'application/json' }, body: '{}' });
    assert(noCsrf.status === 403 && badOrigin.status === 403, 'CSRF_ORIGIN_PROTECTION_FAILED');
    report.checks.csrf_origin = true;

    const confirmed = await owner.request(`/owner/payments/${proofId}/confirm`, { method: 'POST', body: {} });
    assert(confirmed.status === 200, `OWNER_CONFIRM_FAILED:${confirmed.status}`);
    report.state_trace.push('CONFIRMED'); report.payment_trace.push('APPROVED');
    db = await databaseSnapshot(bookingId);
    assert(db.status === 'CONFIRMED' && db.paymentProof.status === 'APPROVED' && db.confirmed_at, 'CONFIRM_DB_STATE_INVALID');
    assert(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: db.id } } }) === 2, 'CONFIRM_LOCKS_INVALID');
    const customerConfirmed = await customer.request(`/bookings/${bookingId}`);
    assert(customerConfirmed.status === 200 && customerConfirmed.body.data.status === 'CONFIRMED', 'CUSTOMER_CONFIRMED_REFETCH_FAILED');

    const cancelled = await customer.request(`/bookings/${bookingId}/cancel`, { method: 'POST', body: { reason: 'E2E lifecycle audit cancellation' } });
    assert(cancelled.status === 200 && cancelled.body.data.booking.status === 'CANCELLED' && cancelled.body.data.refund.status === 'PENDING', `CUSTOMER_CANCEL_FAILED:${cancelled.status}`);
    report.state_trace.push('CANCELLED'); report.refund_trace.push('PENDING');
    const refundId = cancelled.body.data.refund.id;
    db = await databaseSnapshot(bookingId);
    assert(db.status === 'CANCELLED' && db.cancelled_by === 'CUSTOMER' && db.cancellation_reason === 'E2E lifecycle audit cancellation', 'CANCELLATION_METADATA_INVALID');
    assert(db.paymentProof.status === 'APPROVED' && db.refund?.status === 'PENDING', 'CANCELLATION_RELATIONS_INVALID');
    assert(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: db.id } } }) === 0, 'CANCELLATION_LOCK_RELEASE_FAILED');

    const ownerRefundPending = await owner.request(`/owner/refunds/${refundId}`);
    assert(ownerRefundPending.status === 200 && ownerRefundPending.body.data.status === 'PENDING' && ownerRefundPending.body.data.proof_image_url === null, 'OWNER_REFUND_PENDING_INVALID');
    const refundUpload = await uploadProof(owner, `/owner/refunds/${refundId}/proof`, await makeProof('#2563eb'));
    assert(refundUpload.status === 201 && refundUpload.body.data.status === 'PROOF_SUBMITTED', `REFUND_UPLOAD_FAILED:${refundUpload.status}`);
    report.refund_trace.push('PROOF_SUBMITTED');
    const customerRefund = await customer.request(`/refunds/${refundId}`);
    assert(customerRefund.status === 200 && customerRefund.body.data.status === 'PROOF_SUBMITTED' && noPrivateIdentifier(customerRefund.body), 'CUSTOMER_REFUND_DTO_INVALID');
    assert(new Date(customerRefund.body.data.proof_image_expires_at) - new Date(customerRefund.body.meta.server_time) === 300000, 'REFUND_SIGNED_URL_TTL_INVALID');
    assert(await fetchImage(customerRefund.body.data.proof_image_url), 'REFUND_SIGNED_URL_UNAVAILABLE');

    const refundConfirmed = await customer.request(`/refunds/${refundId}/confirm`, { method: 'POST', body: {} });
    assert(refundConfirmed.status === 200 && refundConfirmed.body.data.status === 'REFUNDED', `REFUND_CONFIRM_FAILED:${refundConfirmed.status}`);
    report.refund_trace.push('REFUNDED');

    const invalid = {};
    invalid.refund_confirm_again = (await customer.request(`/refunds/${refundId}/confirm`, { method: 'POST', body: {} })).status;
    invalid.payment_confirm_again = (await owner.request(`/owner/payments/${proofId}/confirm`, { method: 'POST', body: {} })).status;
    invalid.payment_reject_again = (await owner.request(`/owner/payments/${proofId}/reject`, { method: 'POST', body: { reason: 'Không hợp lệ sau terminal' } })).status;
    invalid.cancel_again = (await customer.request(`/bookings/${bookingId}/cancel`, { method: 'POST', body: { reason: 'Không được hủy lại' } })).status;
    invalid.refund_upload_again = (await uploadProof(owner, `/owner/refunds/${refundId}/proof`, await makeProof('#dc2626'))).status;
    assert(Object.values(invalid).every(status => status >= 400 && status < 500), 'TERMINAL_IMMUTABILITY_FAILED');
    report.rejected_mutations = invalid;

    db = await databaseSnapshot(bookingId);
    const lockCount = await prisma.courtSlotLock.count({ where: { bookingSlot: { booking_id: db.id } } });
    const [proofCount, refundCount] = await Promise.all([prisma.paymentProof.count({ where: { booking_id: db.id } }), prisma.refund.count({ where: { booking_id: db.id } })]);
    const slotHalfUnits = db.slots.reduce((sum, slot) => {
      const value = slot.slot_amount.toString();
      return sum + (value.endsWith('.5') ? BigInt(value.slice(0, -2)) * 2n + 1n : BigInt(value) * 2n);
    }, 0n);
    const exactSlotTotal = (slotHalfUnits + 1n) / 2n;
    assert(db.status === 'CANCELLED' && db.paymentProof.status === 'APPROVED' && db.refund.status === 'REFUNDED', 'FINAL_STATE_INVALID');
    assert(proofCount === 1 && refundCount === 1 && lockCount === 0 && db.slots.length === 2, 'FINAL_CARDINALITY_INVALID');
    assert(BigInt(db.total_amount.toString()) === exactSlotTotal, 'FINAL_SLOT_TOTAL_INVALID');
    assert(BigInt(db.deposit_amount.toString()) === (BigInt(db.total_amount.toString()) * 30n + 50n) / 100n, 'FINAL_DEPOSIT_INVALID');
    assert(BigInt(db.remaining_amount.toString()) === BigInt(db.total_amount.toString()) - BigInt(db.deposit_amount.toString()), 'FINAL_REMAINING_INVALID');
    assert(db.refund.amount.toString() === db.deposit_amount.toString(), 'FINAL_REFUND_AMOUNT_INVALID');
    assert(db.refund.proof_image_path && db.refund.proof_submitted_at && db.refund.confirmed_at && db.refund.refunded_at, 'FINAL_REFUND_METADATA_INVALID');
    report.final = { booking_id: bookingId, proof_id: proofId, refund_id: refundId, status: db.status, payment_status: db.paymentProof.status, refund_status: db.refund.status, slots: db.slots.length, locks: lockCount, total_amount: db.total_amount.toString(), deposit_amount: db.deposit_amount.toString(), remaining_amount: db.remaining_amount.toString() };
    report.checks.private_storage = noPrivateIdentifier(ownerProof.body) && noPrivateIdentifier(customerRefund.body);
    report.checks.signed_url = true;
    report.checks.final_invariants = true;
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await Promise.allSettled([customer.logout(), owner.logout(), otherCustomer.logout()]);
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(`FULL BOOKING LIFECYCLE E2E FAILED: ${error?.message || 'UNKNOWN_ERROR'}`);
  process.exitCode = 1;
});
