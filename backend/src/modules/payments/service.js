import { randomUUID } from 'node:crypto';
import { AuthError } from '../auth/errors.js';
import { options, clock, missing, courtInclude, actorCheck, lockCourt, expire } from '../bookings/transaction.js';
import { storageErrorCode } from '../facilities/presentation/storage.js';

const conflict = code => new AuthError(409, code, {
  BOOKING_EXPIRED: 'Thời gian gửi minh chứng đã hết.',
  PROOF_ALREADY_SUBMITTED: 'Booking đã có minh chứng thanh toán.',
  INVALID_BOOKING_STATE: 'Trạng thái booking không cho phép gửi minh chứng.',
}[code]);

export function createPaymentService(db, storage, logger = console) {
  function log(code, publicId) {
    try { logger.error({ event: 'PAYMENT_PROOF_CLEANUP_REQUIRED', code, public_id: publicId }); } catch { /* Preserve original error. */ }
  }
  async function cleanup(publicId, actor, id, court) {
    // A failed transaction response can be an unknown COMMIT outcome.
    // Wait behind the original writer before reading references: an unlocked
    // count could miss its still-uncommitted proof after a lost COMMIT response.
    try {
      const referenced = await db.$transaction(async tx => {
        await lockCourt(tx, actor, court);
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`;
        return tx.paymentProof.count({ where: { image_path: publicId } });
      }, options);
      if (referenced) return;
    }
    catch { log('DB_COMMIT_OUTCOME_UNKNOWN', publicId); return; }
    try { await storage.destroy(publicId); } catch (error) { log(storageErrorCode(error), publicId); }
  }
  async function locked(actor, id, image) {
    const initial = await db.booking.findFirst({ where: { id, customer_id: BigInt(actor.user.id) }, include: { court: { include: courtInclude } } });
    if (!initial) throw missing();
    const result = await db.$transaction(async tx => {
      await lockCourt(tx, actor, initial.court);
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM payment_proofs WHERE booking_id = ${id} FOR UPDATE`;
      const now = await clock(tx);
      await actorCheck(tx, actor, now);
      const booking = await tx.booking.findFirst({ where: { id, customer_id: BigInt(actor.user.id), court_id: initial.court_id } });
      if (!booking) throw missing();
      if (booking.status === 'EXPIRED' || (booking.status === 'PENDING_PAYMENT' && booking.expires_at <= now)) {
        await expire(tx, [booking], now);
        return { error: 'BOOKING_EXPIRED' }; // Commit expiry before reporting the conflict.
      }
      if (await tx.paymentProof.findUnique({ where: { booking_id: id } })) return { error: 'PROOF_ALREADY_SUBMITTED' };
      if (booking.status !== 'PENDING_PAYMENT') return { error: 'INVALID_BOOKING_STATE' };
      if (!image) return { court: initial.court };
      const proof = await tx.paymentProof.create({ data: { booking_id: id, ...image, status: 'SUBMITTED', submitted_at: now, created_at: now, updated_at: now } });
      await tx.booking.update({ where: { id }, data: { status: 'PENDING_CONFIRMATION', updated_at: now } });
      return { data: {
        proof: { id: String(proof.id), status: proof.status, submitted_at: now.toISOString() },
        booking: { id: String(id), status: 'PENDING_CONFIRMATION', expires_at: booking.expires_at.toISOString() },
      }, meta: { server_time: now.toISOString() } };
    }, options);
    if (result.error) throw conflict(result.error);
    return result;
  }
  return {
    async detail(actor, id) {
      const result = await db.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const now = await clock(tx);
        await actorCheck(tx, actor, now);
        const proof = await tx.paymentProof.findFirst({ where: { booking_id: id, booking: { customer_id: BigInt(actor.user.id) } }, select: {
          id: true, booking_id: true, status: true, submitted_at: true, image_path: true, mime_type: true,
        } });
        if (!proof) throw missing();
        return { proof, now };
      }, { ...options, isolationLevel: 'RepeatableRead' });
      storage.ready();
      const expiresAt = new Date(result.now.getTime() + 300000);
      return { data: {
        id: String(result.proof.id), booking_id: String(result.proof.booking_id), status: result.proof.status,
        submitted_at: result.proof.submitted_at,
        proof_image_url: storage.privateUrl(result.proof.image_path, result.proof.mime_type, Math.floor(expiresAt.getTime() / 1000)),
        proof_image_expires_at: expiresAt.toISOString(),
      }, meta: { server_time: result.now.toISOString() } };
    },
    precheck: (actor, id) => locked(actor, id),
    async submit(actor, id, file) {
      const preflight = await locked(actor, id);
      storage.ready();
      const publicId = `payment-proofs/${randomUUID()}`;
      try {
        await storage.upload(file.buffer, publicId);
        return await locked(actor, id, { image_path: publicId, mime_type: file.mime_type, size_bytes: file.size_bytes });
      } catch (error) {
        await cleanup(publicId, actor, id, preflight.court);
        if (error.code === 'P2002' && error.meta?.modelName === 'PaymentProof') throw conflict('PROOF_ALREADY_SUBMITTED');
        throw error;
      }
    },
  };
}
