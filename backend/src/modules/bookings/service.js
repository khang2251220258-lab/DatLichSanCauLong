import { bankInput } from '../facilities/booking-configuration/validation.js';
import { fail, validateTime, priceSlots, confirmedCancellationError } from './rules.js';
import { summaryFields, detailFields, present } from './dto.js';

import { options, clock, missing, courtInclude, actorCheck, lockCourt, expire, isExpiredHold } from './transaction.js';
import { BOOKING_FLOW_V1, BOOKING_FLOW_V2, bookingDomainConfig } from './config.js';
const envelope = (row, now, storage) => ({ data: present(row, now, storage), meta: { server_time: now.toISOString() } });
export function isSlotConflict(error) {
  if (error.code !== 'P2002') return false;
  if (error.meta?.modelName && error.meta.modelName !== 'CourtSlotLock') return false;
  const target = error.meta?.target, cause = error.meta?.driverAdapterError?.cause;
  return target === 'court_slot_locks_pkey' ||
    (Array.isArray(target) && target.length === 2 && target.includes('court_id') && target.includes('start_at')) ||
    (cause?.constraint?.index === 'court_slot_locks_pkey' && (!cause.table || cause.table === 'court_slot_locks'));
}
export function creationLifecycle(flowVersion, now, confirmationHoldMinutes = bookingDomainConfig.confirmationHoldMinutes) {
  return flowVersion === BOOKING_FLOW_V2
    ? { status: 'PENDING_CONFIRMATION', expires_at: now, confirmation_expires_at: new Date(+now + confirmationHoldMinutes * 60000) }
    : { status: 'PENDING_PAYMENT', expires_at: new Date(+now + 300000), confirmation_expires_at: null };
}
export function createBookingService(db, qrStorage, config = {}) {
  const flowVersion = config.flowVersion ?? BOOKING_FLOW_V1;
  const confirmationHoldMinutes = config.confirmationHoldMinutes ?? bookingDomainConfig.confirmationHoldMinutes;
  if (![BOOKING_FLOW_V1, BOOKING_FLOW_V2].includes(flowVersion)) throw new Error('BOOKING_FLOW_VERSION_INVALID');
  return {
    async create(actor, input) {
      const initial = await db.court.findUnique({ where: { id: input.court_id }, include: courtInclude });
      if (!initial) throw missing();
      try {
        return await db.$transaction(async tx => {
          const court = await lockCourt(tx, actor, initial), facility = court.facility;
          const related = await tx.$queryRaw`SELECT id, status, booking_flow_version, expires_at, confirmation_expires_at FROM bookings
            WHERE court_id = ${court.id} AND (
              (booking_flow_version = 1 AND status = 'PENDING_PAYMENT')
              OR (booking_flow_version = 2 AND status = 'PENDING_CONFIRMATION')
              OR (start_at < ${input.end_at} AND end_at > ${input.start_at})
            )
            ORDER BY id ASC FOR UPDATE`;
          const now = await clock(tx);
          await actorCheck(tx, actor, now);
          if (facility.status !== 'ACTIVE' || facility.owner.user.status !== 'ACTIVE') throw fail('FACILITY_UNAVAILABLE');
          if (court.status !== 'ACTIVE') throw fail('COURT_UNAVAILABLE');
          validateTime(input, facility, now);
          await expire(tx, related, now);
          const range = { court_id: court.id, start_at: { lt: input.end_at }, end_at: { gt: input.start_at } };
          const occupied = await tx.booking.count({ where: { ...range, OR: [
            { status: 'CONFIRMED' },
            { booking_flow_version: BOOKING_FLOW_V1, status: 'PENDING_CONFIRMATION' },
            { booking_flow_version: BOOKING_FLOW_V1, status: 'PENDING_PAYMENT', expires_at: { gt: now } },
            { booking_flow_version: BOOKING_FLOW_V2, status: 'PENDING_CONFIRMATION', confirmation_expires_at: { gt: now } },
          ] } });
          if (occupied || await tx.courtBlock.count({ where: range })) throw fail('SLOT_UNAVAILABLE');
          const rules = await tx.priceRule.findMany({ where: { facility_id: facility.id } });
          const { slots, ...amounts } = priceSlots(input, rules);
          const bank = await tx.bankAccount.findUnique({ where: { facility_id: facility.id } });
          if (!bank) throw fail('BANK_ACCOUNT_NOT_CONFIGURED');
          try { bankInput({ bank_name: bank.bank_name, account_number: bank.account_number, account_holder: bank.account_holder }); }
          catch { throw fail('BANK_ACCOUNT_NOT_CONFIGURED'); }
          const policy = await tx.cancellationPolicy.findUnique({ where: { facility_id: facility.id } });
          const lifecycle = creationLifecycle(flowVersion, now, confirmationHoldMinutes);
          const booking = await tx.booking.create({ data: {
            customer_id: BigInt(actor.user.id), court_id: court.id, start_at: input.start_at, end_at: input.end_at,
            booking_flow_version: flowVersion,
            status: lifecycle.status,
            created_at: now,
            // V2 never reads this legacy field; it remains non-null for backward schema compatibility.
            expires_at: lifecycle.expires_at,
            confirmation_expires_at: lifecycle.confirmation_expires_at,
            ...amounts,
            facility_name_snapshot: facility.name, facility_address_snapshot: facility.address, court_name_snapshot: court.name,
            bank_name_snapshot: bank.bank_name, account_number_snapshot: bank.account_number, account_holder_snapshot: bank.account_holder,
            qr_image_path_snapshot: bank.qr_image_path, cancellation_cutoff_hours_snapshot: policy?.cutoff_hours ?? null,
          } });
          await tx.bookingSlot.createMany({ data: slots.map(slot => ({ ...slot, booking_id: booking.id, created_at: now, updated_at: now })) });
          const savedSlots = await tx.bookingSlot.findMany({ where: { booking_id: booking.id }, select: { id: true, start_at: true }, orderBy: { start_at: 'asc' } });
          await tx.courtSlotLock.createMany({ data: savedSlots.map(slot => ({ court_id: court.id, start_at: slot.start_at, booking_slot_id: slot.id, created_at: now, updated_at: now })) });
          return envelope(await tx.booking.findUnique({ where: { id: booking.id }, select: detailFields }), now, qrStorage);
        }, options);
      } catch (error) {
        if (isSlotConflict(error)) throw fail('SLOT_UNAVAILABLE');
        throw error;
      }
    },
    async detail(actor, id) {
      const initial = await db.booking.findFirst({ where: { id, customer_id: BigInt(actor.user.id) }, include: { court: { include: courtInclude } } });
      if (!initial) throw missing();
      return db.$transaction(async tx => {
        await lockCourt(tx, actor, initial.court);
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`;
        const now = await clock(tx);
        await actorCheck(tx, actor, now);
        const row = await tx.booking.findFirst({ where: { id, customer_id: BigInt(actor.user.id), court_id: initial.court_id } });
        if (!row) throw missing();
        await expire(tx, [row], now);
        return envelope(await tx.booking.findUnique({ where: { id }, select: detailFields }), now, qrStorage);
      }, options);
    },
    async cancel(actor, id, reason) {
      const initial = await db.booking.findFirst({ where: { id, customer_id: BigInt(actor.user.id) }, include: { court: { include: courtInclude } } });
      if (!initial) throw missing();
      const result = await db.$transaction(async tx => {
        await lockCourt(tx, actor, initial.court);
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM payment_proofs WHERE booking_id = ${id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM refunds WHERE booking_id = ${id} FOR UPDATE`;
        const now = await clock(tx);
        await actorCheck(tx, actor, now);
        const booking = await tx.booking.findFirst({ where: { id, customer_id: BigInt(actor.user.id), court_id: initial.court_id } });
        if (!booking) throw missing();
        if (isExpiredHold(booking, now)) {
          await expire(tx, [booking], now);
          return { error: 'BOOKING_EXPIRED' };
        }
        if (booking.status === 'EXPIRED') return { error: 'BOOKING_EXPIRED' };
        if (booking.status === 'PENDING_CONFIRMATION') return { error: 'CANCELLATION_NOT_ALLOWED' };
        const proof = await tx.paymentProof.findUnique({ where: { booking_id: id } });
        if (booking.status === 'CONFIRMED') {
          const eligibilityError = confirmedCancellationError(booking, now);
          if (eligibilityError) return { error: eligibilityError };
          if (!proof || proof.status !== 'APPROVED') return { error: 'INCONSISTENT_PAYMENT_STATE' };
          if (await tx.refund.findUnique({ where: { booking_id: id } })) return { error: 'INCONSISTENT_PAYMENT_STATE' };
          const cancelled = await tx.booking.update({ where: { id }, data: {
            status: 'CANCELLED', cancelled_at: now, cancelled_by: 'CUSTOMER', cancellation_reason: reason, updated_at: now,
          } });
          const refund = await tx.refund.create({ data: {
            booking_id: id, amount: booking.deposit_amount, status: 'PENDING',
            reason: reason || 'Khách hàng hủy booking theo chính sách.', requested_at: now, created_at: now, updated_at: now,
          } });
          await tx.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: id } } });
          return { data: { booking: {
            id: String(cancelled.id), status: cancelled.status, cancelled_by: cancelled.cancelled_by,
            cancellation_reason: cancelled.cancellation_reason, cancelled_at: cancelled.cancelled_at,
          }, refund: { id: String(refund.id), booking_id: String(refund.booking_id), amount: refund.amount.toString(), status: refund.status, requested_at: refund.requested_at } }, meta: { server_time: now.toISOString() } };
        }
        if (booking.status !== 'PENDING_PAYMENT') return { error: 'INVALID_BOOKING_STATE' };
        if (proof) return { error: 'CANCELLATION_NOT_ALLOWED' };
        const cancelled = await tx.booking.update({ where: { id }, data: {
          status: 'CANCELLED', cancelled_at: now, cancelled_by: 'CUSTOMER', cancellation_reason: reason, updated_at: now,
        } });
        await tx.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: id } } });
        return { data: { booking: {
          id: String(cancelled.id), status: cancelled.status, cancelled_by: cancelled.cancelled_by,
          cancellation_reason: cancelled.cancellation_reason, cancelled_at: cancelled.cancelled_at,
        }, refund: null }, meta: { server_time: now.toISOString() } };
      }, options);
      if (result.error) throw fail(result.error);
      return result;
    },
    list(actor, query) {
      return db.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const now = await clock(tx);
        await actorCheck(tx, actor, now);
        const where = { customer_id: BigInt(actor.user.id) };
        const rows = await tx.booking.findMany({ where, select: summaryFields, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.page_size, take: query.page_size });
        const total = await tx.booking.count({ where });
        return { data: rows.map(row => present(row, now)), meta: { server_time: now.toISOString(), ...query, total } };
      }, { ...options, isolationLevel: 'RepeatableRead' });
    },
  };
}
