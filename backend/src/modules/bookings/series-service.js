import { Prisma } from '@prisma/client';
import { bankInput } from '../facilities/booking-configuration/validation.js';
import { fail, minute, local, priceSlots, confirmedCancellationError } from './rules.js';
import { options, clock, missing, courtInclude, actorCheck, lockCourt, expire } from './transaction.js';
import { isSlotConflict } from './service.js';
import { bookingDomainConfig } from './config.js';
import { AuthError } from '../auth/errors.js';
import { seriesReference } from './series-validation.js';

const txOptions = { ...options, timeout: 60000 };
const id = value => String(value);
const money = value => value.toString();
const isoDate = value => (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
const hhmm = value => (value instanceof Date ? value.toISOString().slice(11, 16) : String(value).slice(0, 5));
const invalidState = code => new AuthError(409, code, code === 'BOOKING_EXPIRED' ? 'Lịch cố định đã hết hạn xác nhận.' : 'Trạng thái lịch cố định không cho phép thao tác này.');

function childDto(row, series, now) {
  const deadline = row.cancellation_cutoff_hours_snapshot == null ? null : new Date(+row.start_at-row.cancellation_cutoff_hours_snapshot*3600000);
  const block = series.status!=='CONFIRMED'||row.status!=='CONFIRMED'?'INVALID_BOOKING_STATE'
    : row.cancellation_cutoff_hours_snapshot==null?'CANCELLATION_POLICY_NOT_CONFIGURED'
      : now&&now>=deadline?'CANCELLATION_DEADLINE_PASSED':null;
  return { booking_id:id(row.id),start_at:row.start_at,end_at:row.end_at,total_amount:money(row.total_amount),deposit_amount:money(row.deposit_amount),remaining_amount:money(row.remaining_amount),status:row.status,
    can_cancel:block===null,cancellation_deadline:deadline,cancellation_block_reason:block,cancelled_at:row.cancelled_at??null,cancelled_by:row.cancelled_by??null,cancellation_reason:row.cancellation_reason??null,
    refund:row.refund?{id:id(row.refund.id),booking_id:id(row.refund.booking_id),amount:money(row.refund.amount),status:row.refund.status,reason:row.refund.reason,requested_at:row.refund.requested_at,proof_submitted_at:row.refund.proof_submitted_at,confirmed_at:row.refund.confirmed_at,refunded_at:row.refund.refunded_at}:null };
}
function seriesDto(row, children = row.bookings || [], storage = null, serverTime = null) {
  const qrExpiresAt = row.qr_image_path_snapshot && storage && serverTime
    ? new Date(serverTime.getTime() + 300000)
    : null;
  return { id: id(row.id), status: row.status, weekday: row.weekday, start_date: isoDate(row.starts_on), end_date: isoDate(row.ends_on),
    start_time: hhmm(row.start_time), end_time: hhmm(row.end_time), occurrence_count: row.occurrence_count,
    total_amount: money(row.total_amount), deposit_amount: money(row.deposit_amount), remaining_amount: money(row.remaining_amount),
    confirmation_expires_at: row.confirmation_expires_at, transfer_reference: seriesReference(row.id), created_at: row.created_at,
    facility: { id: id(row.facility_id), name: row.facility_name_snapshot, address: row.facility_address_snapshot },
    court: { id: id(row.court_id), name: row.court_name_snapshot },
    bank: { bank_name: row.bank_name_snapshot, account_number: row.account_number_snapshot, account_holder: row.account_holder_snapshot,
      has_qr_image: Boolean(row.qr_image_path_snapshot),
      qr_image_url: qrExpiresAt ? storage.privateUrl(row.qr_image_path_snapshot, 'image/png', Math.floor(qrExpiresAt.getTime() / 1000)) : null,
      qr_image_expires_at: qrExpiresAt?.toISOString() ?? null },
    confirmed_at: row.confirmed_at, confirmed_by_user_id: row.confirmed_by_user_id == null ? null : id(row.confirmed_by_user_id),
    rejected_at: row.rejected_at, rejection_reason: row.rejection_reason,
    occurrences: children.map(child=>childDto(child,row,serverTime)) };
}
const childInclude={refund:{select:{id:true,booking_id:true,amount:true,status:true,reason:true,requested_at:true,proof_submitted_at:true,confirmed_at:true,refunded_at:true}}};
const overlaps = (row, occurrence) => row.start_at < occurrence.end_at && row.end_at > occurrence.start_at;
const effective = (row, now) => row.status === 'CONFIRMED' ||
  (row.booking_flow_version === 1 && row.status === 'PENDING_CONFIRMATION') ||
  (row.booking_flow_version === 1 && row.status === 'PENDING_PAYMENT' && row.expires_at > now) ||
  (row.booking_flow_version === 2 && row.status === 'PENDING_CONFIRMATION' && row.confirmation_expires_at > now);

async function expireSeries(tx, series, now) {
  if (!series || series.status !== 'PENDING_CONFIRMATION' || series.confirmation_expires_at > now) return false;
  const childIds = (series.bookings || await tx.booking.findMany({ where: { booking_series_id: series.id }, select: { id: true } })).map(row => row.id);
  await tx.bookingSeries.updateMany({ where: { id: series.id, status: 'PENDING_CONFIRMATION', confirmation_expires_at: { lte: now } }, data: { status: 'EXPIRED', updated_at: now } });
  await tx.booking.updateMany({ where: { id: { in: childIds }, status: 'PENDING_CONFIRMATION' }, data: { status: 'EXPIRED', expired_at: now, updated_at: now } });
  await tx.courtSlotLock.deleteMany({ where: { bookingSlot: { booking_id: { in: childIds } } } });
  return true;
}
async function checkOwner(tx, actor, now) {
  const session = await tx.authSession.findUnique({ where: { id: actor.id }, include: { user: { include: { ownerProfile: true } } } });
  if (!session || session.user_id !== BigInt(actor.user.id) || session.revoked_at || session.expires_at <= now || session.user.status !== 'ACTIVE') throw new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  if (session.user.role !== 'CUSTOMER' || !session.user.ownerProfile) throw new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
}
export function createBookingSeriesService(db, qrStorage, config = {}) {
  const holdMinutes = config.confirmationHoldMinutes ?? bookingDomainConfig.confirmationHoldMinutes;
  const cancellationClock = config.cancellationClock ?? clock;
  async function initialCustomer(actor, seriesId) {
    const row = await db.bookingSeries.findFirst({ where: { id: seriesId, customer_id: BigInt(actor.user.id) }, include: { bookings: { orderBy: { start_at: 'asc' } }, facility: { select: { owner_id: true } } } });
    if (!row) throw missing(); return row;
  }
  async function initialOwner(actor, seriesId) {
    const row = await db.bookingSeries.findFirst({ where: { id: seriesId, facility: { owner_id: BigInt(actor.user.id) } }, include: { bookings: { orderBy: { start_at: 'asc' } } } });
    if (!row) throw missing(); return row;
  }
  async function ownerAction(actor, seriesId, action, reason) {
    const initial = await initialOwner(actor, seriesId);
    const result = await db.$transaction(async tx => {
      const userIds = [...new Set([BigInt(actor.user.id), initial.customer_id])].sort((a,b)=>a<b?-1:a>b?1:0);
      for (const userId of userIds) await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM facilities WHERE id = ${initial.facility_id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM courts WHERE id = ${initial.court_id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM booking_series WHERE id = ${seriesId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM bookings WHERE booking_series_id = ${seriesId} ORDER BY id FOR UPDATE`;
      const now = await clock(tx); await checkOwner(tx, actor, now);
      const series = await tx.bookingSeries.findFirst({ where: { id: seriesId, facility: { owner_id: BigInt(actor.user.id) } }, include: { bookings: { orderBy: { start_at: 'asc' } } } });
      if (!series || series.facility_id !== initial.facility_id || series.court_id !== initial.court_id) throw missing();
      if (await expireSeries(tx, series, now)) return { error: 'BOOKING_EXPIRED' };
      if (series.status !== 'PENDING_CONFIRMATION' || series.bookings.length !== series.occurrence_count || series.bookings.some(row => row.status !== 'PENDING_CONFIRMATION')) throw invalidState('INVALID_SERIES_STATE');
      const status = action === 'confirm' ? 'CONFIRMED' : 'REJECTED';
      await tx.bookingSeries.update({ where: { id: series.id }, data: action === 'confirm'
        ? { status, confirmed_at: now, confirmed_by_user_id: BigInt(actor.user.id), updated_at: now }
        : { status, rejected_at: now, rejection_reason: reason, updated_at: now } });
      await tx.booking.updateMany({ where: { booking_series_id: series.id, status: 'PENDING_CONFIRMATION' }, data: action === 'confirm'
        ? { status, confirmed_at: now, confirmed_by_user_id: BigInt(actor.user.id), updated_at: now }
        : { status, rejected_at: now, rejection_reason: reason, updated_at: now } });
      if (action === 'reject') await tx.courtSlotLock.deleteMany({ where: { bookingSlot: { booking: { booking_series_id: series.id } } } });
      const updated = await tx.bookingSeries.findUnique({ where: { id: series.id }, include: { bookings: { orderBy: { start_at: 'asc' } } } });
      return { data: seriesDto(updated,updated.bookings,qrStorage,now), meta: { server_time: now.toISOString() } };
    }, txOptions);
    if (result.error) throw invalidState(result.error); return result;
  }
  return {
    async cancelOccurrence(actor,seriesId,bookingId,reason){
      const initial=await db.bookingSeries.findFirst({where:{id:seriesId,customer_id:BigInt(actor.user.id),bookings:{some:{id:bookingId,customer_id:BigInt(actor.user.id)}}},select:{id:true,customer_id:true,facility_id:true,court_id:true,facility:{select:{owner_id:true}}}});
      if(!initial)throw missing();
      const result=await db.$transaction(async tx=>{
        const userIds=[...new Set([BigInt(actor.user.id),initial.facility.owner_id])].sort((a,b)=>a<b?-1:a>b?1:0);
        for(const userId of userIds)await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM facilities WHERE id=${initial.facility_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM courts WHERE id=${initial.court_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM booking_series WHERE id=${seriesId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM bookings WHERE id=${bookingId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM payment_proofs WHERE booking_id=${bookingId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM refunds WHERE booking_id=${bookingId} FOR UPDATE`;
        const now=await cancellationClock(tx);await actorCheck(tx,actor,now);
        const series=await tx.bookingSeries.findFirst({where:{id:seriesId,customer_id:BigInt(actor.user.id)},select:{id:true,status:true,confirmed_at:true,confirmed_by_user_id:true,facility_id:true,court_id:true}});
        const child=await tx.booking.findFirst({where:{id:bookingId,customer_id:BigInt(actor.user.id),booking_series_id:seriesId},include:{paymentProof:true,refund:true}});
        if(!series||!child||series.facility_id!==initial.facility_id||series.court_id!==initial.court_id||child.court_id!==initial.court_id)throw missing();
        if(series.status!=='CONFIRMED'||child.status!=='CONFIRMED')return{error:'INVALID_BOOKING_STATE'};
        if(child.booking_flow_version!==2||child.booking_series_id===null||!series.confirmed_at||!series.confirmed_by_user_id||!child.confirmed_at||!child.confirmed_by_user_id||child.confirmed_by_user_id!==series.confirmed_by_user_id||+child.confirmed_at!==+series.confirmed_at||child.paymentProof||child.refund)return{error:'INCONSISTENT_PAYMENT_STATE'};
        const eligibility=confirmedCancellationError(child,now);if(eligibility)return{error:eligibility};
        const cancelled=await tx.booking.update({where:{id:bookingId},data:{status:'CANCELLED',cancelled_at:now,cancelled_by:'CUSTOMER',cancellation_reason:reason,updated_at:now}});
        const refund=await tx.refund.create({data:{booking_id:bookingId,amount:child.deposit_amount,status:'PENDING',reason:reason||'Khách hàng hủy một buổi trong lịch cố định theo chính sách.',requested_at:now,created_at:now,updated_at:now}});
        await tx.courtSlotLock.deleteMany({where:{bookingSlot:{booking_id:bookingId}}});
        return{data:{series:{id:id(series.id),status:series.status},occurrence:childDto({...cancelled,refund},series,now)},meta:{server_time:now.toISOString()}};
      },txOptions);
      if(result.error)throw fail(result.error);return result;
    },
    async create(actor, input) {
      const initial = await db.court.findUnique({ where: { id: input.court_id }, include: courtInclude });
      if (!initial) throw missing();
      try {
        return await db.$transaction(async tx => {
          const court = await lockCourt(tx, actor, initial), facility = court.facility;
          const first = input.occurrences[0], last = input.occurrences.at(-1);
          await tx.$queryRaw`SELECT bs.id FROM booking_series bs
            WHERE bs.court_id = ${court.id} AND bs.status = 'PENDING_CONFIRMATION'
              AND (bs.confirmation_expires_at <= clock_timestamp() OR EXISTS (
                SELECT 1 FROM bookings b WHERE b.booking_series_id = bs.id AND b.start_at < ${last.end_at} AND b.end_at > ${first.start_at}
              ))
            ORDER BY bs.id FOR UPDATE`;
          const related = await tx.$queryRaw`SELECT id, status, booking_flow_version, expires_at, confirmation_expires_at, start_at, end_at, booking_series_id
            FROM bookings WHERE court_id = ${court.id} AND ((booking_flow_version = 1 AND status = 'PENDING_PAYMENT') OR
              (booking_flow_version = 2 AND status = 'PENDING_CONFIRMATION') OR (start_at < ${last.end_at} AND end_at > ${first.start_at}))
            ORDER BY id FOR UPDATE`;
          const now = await clock(tx); await actorCheck(tx, actor, now);
          if (facility.status !== 'ACTIVE' || facility.owner.user.status !== 'ACTIVE') throw fail('FACILITY_UNAVAILABLE');
          if (court.status !== 'ACTIVE') throw fail('COURT_UNAVAILABLE');
          if (first.start_at <= now) throw fail('BOOKING_IN_PAST', 422);
          if (minute(local(first.start_at)) < minute(facility.opening_time) || minute(local(first.end_at)) > minute(facility.closing_time)) throw fail('INVALID_TIME_RANGE', 422);
          const staleSeriesIds = [...new Set(related.filter(row => row.booking_series_id && row.status === 'PENDING_CONFIRMATION' && row.confirmation_expires_at <= now).map(row => row.booking_series_id))];
          if (staleSeriesIds.length) await tx.bookingSeries.updateMany({ where: { id: { in: staleSeriesIds }, status: 'PENDING_CONFIRMATION', confirmation_expires_at: { lte: now } }, data: { status: 'EXPIRED', updated_at: now } });
          await expire(tx, related, now);
          if (related.some(row => effective(row, now) && input.occurrences.some(occurrence => overlaps(row, occurrence)))) throw fail('SLOT_UNAVAILABLE');
          const blocks = await tx.courtBlock.findMany({ where: { court_id: court.id, start_at: { lt: last.end_at }, end_at: { gt: first.start_at } } });
          if (blocks.some(row => input.occurrences.some(occurrence => overlaps(row, occurrence)))) throw fail('SLOT_UNAVAILABLE');
          const rules = await tx.priceRule.findMany({ where: { facility_id: facility.id } });
          const priced = input.occurrences.map(occurrence => ({ occurrence, priced: priceSlots(occurrence, rules) }));
          const bank = await tx.bankAccount.findUnique({ where: { facility_id: facility.id } });
          if (!bank) throw fail('BANK_ACCOUNT_NOT_CONFIGURED');
          try { bankInput({ bank_name: bank.bank_name, account_number: bank.account_number, account_holder: bank.account_holder }); } catch { throw fail('BANK_ACCOUNT_NOT_CONFIGURED'); }
          const policy = await tx.cancellationPolicy.findUnique({ where: { facility_id: facility.id } });
          const sums = priced.reduce((a,row)=>({ total:a.total+BigInt(row.priced.total_amount), deposit:a.deposit+BigInt(row.priced.deposit_amount), remaining:a.remaining+BigInt(row.priced.remaining_amount) }),{total:0n,deposit:0n,remaining:0n});
          if (sums.total > 999999999999n || sums.deposit > 999999999999n || sums.remaining > 999999999999n) throw fail('BOOKING_AMOUNT_TOO_LARGE',422);
          const deadline = new Date(+now + holdMinutes * 60000);
          const series = await tx.bookingSeries.create({ data: { customer_id: BigInt(actor.user.id), facility_id: facility.id, court_id: court.id,
            weekday: input.weekday, start_time: new Date(`1970-01-01T${input.start_time}:00Z`), end_time: new Date(`1970-01-01T${input.end_time}:00Z`),
            starts_on: new Date(`${input.start_date}T00:00:00Z`), ends_on: new Date(`${input.end_date}T00:00:00Z`), occurrence_count: priced.length,
            status:'PENDING_CONFIRMATION', confirmation_expires_at:deadline, total_amount:String(sums.total), deposit_amount:String(sums.deposit), remaining_amount:String(sums.remaining),
            bank_name_snapshot:bank.bank_name,account_number_snapshot:bank.account_number,account_holder_snapshot:bank.account_holder,qr_image_path_snapshot:bank.qr_image_path,
            facility_name_snapshot:facility.name,facility_address_snapshot:facility.address,court_name_snapshot:court.name,created_at:now,updated_at:now } });
          const children = await tx.booking.createManyAndReturn({ data: priced.map(row => ({ customer_id:BigInt(actor.user.id),court_id:court.id,booking_series_id:series.id,status:'PENDING_CONFIRMATION',booking_flow_version:2,
            start_at:row.occurrence.start_at,end_at:row.occurrence.end_at,expires_at:now,confirmation_expires_at:deadline,...Object.fromEntries(Object.entries(row.priced).filter(([key])=>key!=='slots')),
            cancellation_cutoff_hours_snapshot:policy?.cutoff_hours??null,bank_name_snapshot:bank.bank_name,account_number_snapshot:bank.account_number,account_holder_snapshot:bank.account_holder,qr_image_path_snapshot:bank.qr_image_path,
            facility_name_snapshot:facility.name,facility_address_snapshot:facility.address,court_name_snapshot:court.name,created_at:now,updated_at:now })), select: { id:true,start_at:true } });
          const childByStart = new Map(children.map(row => [+row.start_at, row.id]));
          await tx.bookingSlot.createMany({ data: priced.flatMap(row => row.priced.slots.map(slot=>({...slot,booking_id:childByStart.get(+row.occurrence.start_at),created_at:now,updated_at:now}))) });
          const saved = await tx.bookingSlot.findMany({ where: { booking: { booking_series_id: series.id } }, select: { id:true,start_at:true }, orderBy:{start_at:'asc'} });
          await tx.courtSlotLock.createMany({ data:saved.map(slot=>({court_id:court.id,start_at:slot.start_at,booking_slot_id:slot.id,created_at:now,updated_at:now})) });
          const current = await tx.bookingSeries.findUnique({ where:{id:series.id},include:{bookings:{orderBy:{start_at:'asc'}}} });
          return { data:seriesDto(current, current.bookings, qrStorage, now),meta:{server_time:now.toISOString()} };
        },txOptions);
      } catch(error){if(isSlotConflict(error))throw fail('SLOT_UNAVAILABLE');throw error;}
    },
    async ownerList(actor, query) {
      const now=await clock(db);await checkOwner(db,actor,now);const status=query.status==='EXPIRED'?Prisma.sql`AND (bs.status='EXPIRED' OR (bs.status='PENDING_CONFIRMATION' AND bs.confirmation_expires_at <= ${now}))`:query.status==='PENDING_CONFIRMATION'?Prisma.sql`AND bs.status='PENDING_CONFIRMATION' AND bs.confirmation_expires_at > ${now}`:query.status?Prisma.sql`AND bs.status = ${query.status}`:Prisma.empty,offset=(query.page-1)*query.page_size;
      const [result]=await db.$queryRaw`WITH owned AS MATERIALIZED (SELECT bs.*,u.full_name customer_name,u.phone customer_phone,
        CASE WHEN bs.status='PENDING_CONFIRMATION' AND bs.confirmation_expires_at <= ${now} THEN 'EXPIRED' ELSE bs.status END effective_status
        FROM booking_series bs JOIN facilities f ON f.id=bs.facility_id JOIN users u ON u.id=bs.customer_id WHERE f.owner_id=${BigInt(actor.user.id)} ${status}),
        page AS MATERIALIZED (SELECT * FROM owned ORDER BY created_at DESC,id DESC OFFSET ${offset} LIMIT ${query.page_size})
        SELECT (SELECT count(*)::int FROM owned) total,COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FILTER(WHERE p.id IS NOT NULL),'[]'::jsonb) items FROM (SELECT 1) seed LEFT JOIN page p ON true`;
      return {data:result.items.map(row=>({...seriesDto({...row,status:row.effective_status},[]),customer:{full_name:row.customer_name,phone:row.customer_phone}})),meta:{server_time:now.toISOString(),page:query.page,page_size:query.page_size,total:result.total}};
    },
    async ownerDetail(actor, seriesId) { const initial=await initialOwner(actor,seriesId);return db.$transaction(async tx=>{const ids=[BigInt(actor.user.id),initial.customer_id].sort((a,b)=>a<b?-1:a>b?1:0);for(const userId of [...new Set(ids)])await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM facilities WHERE id=${initial.facility_id} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM courts WHERE id=${initial.court_id} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM booking_series WHERE id=${seriesId} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM bookings WHERE booking_series_id=${seriesId} ORDER BY id FOR UPDATE`;const now=await clock(tx);await checkOwner(tx,actor,now);let row=await tx.bookingSeries.findFirst({where:{id:seriesId,facility:{owner_id:BigInt(actor.user.id)}},include:{bookings:{include:childInclude,orderBy:{start_at:'asc'}},customer:{select:{full_name:true,phone:true}}}});if(!row)throw missing();await expireSeries(tx,row,now);row=await tx.bookingSeries.findUnique({where:{id:seriesId},include:{bookings:{include:childInclude,orderBy:{start_at:'asc'}},customer:{select:{full_name:true,phone:true}}}});return {data:{...seriesDto(row,row.bookings,qrStorage,now),customer:row.customer},meta:{server_time:now.toISOString()}}},txOptions); },
    async customerList(actor, query) {
      const now=await clock(db);await actorCheck(db,actor,now);const status=query.status==='EXPIRED'?Prisma.sql`AND (bs.status='EXPIRED' OR (bs.status='PENDING_CONFIRMATION' AND bs.confirmation_expires_at <= ${now}))`:query.status==='PENDING_CONFIRMATION'?Prisma.sql`AND bs.status='PENDING_CONFIRMATION' AND bs.confirmation_expires_at > ${now}`:query.status?Prisma.sql`AND bs.status = ${query.status}`:Prisma.empty,offset=(query.page-1)*query.page_size;
      const [result]=await db.$queryRaw`WITH mine AS MATERIALIZED (SELECT bs.*,
        CASE WHEN bs.status='PENDING_CONFIRMATION' AND bs.confirmation_expires_at <= ${now} THEN 'EXPIRED' ELSE bs.status END effective_status
        FROM booking_series bs WHERE bs.customer_id=${BigInt(actor.user.id)} ${status}),
        page AS MATERIALIZED (SELECT * FROM mine ORDER BY created_at DESC,id DESC OFFSET ${offset} LIMIT ${query.page_size})
        SELECT (SELECT count(*)::int FROM mine) total,COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FILTER(WHERE p.id IS NOT NULL),'[]'::jsonb) items FROM (SELECT 1) seed LEFT JOIN page p ON true`;
      return {data:result.items.map(row=>seriesDto({...row,status:row.effective_status},[])),meta:{server_time:now.toISOString(),page:query.page,page_size:query.page_size,total:result.total}};
    },
    async customerDetail(actor, seriesId) {
      const initial=await initialCustomer(actor,seriesId);
      return db.$transaction(async tx=>{const ids=[BigInt(actor.user.id),initial.facility.owner_id].filter(Boolean).sort((a,b)=>a<b?-1:a>b?1:0);for(const userId of [...new Set(ids)])await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM facilities WHERE id=${initial.facility_id} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM courts WHERE id=${initial.court_id} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM booking_series WHERE id=${seriesId} FOR UPDATE`;await tx.$queryRaw`SELECT id FROM bookings WHERE booking_series_id=${seriesId} ORDER BY id FOR UPDATE`;const now=await clock(tx);await actorCheck(tx,actor,now);let row=await tx.bookingSeries.findFirst({where:{id:seriesId,customer_id:BigInt(actor.user.id)},include:{bookings:{include:childInclude,orderBy:{start_at:'asc'}},facility:{select:{owner_id:true}}}});if(!row)throw missing();await expireSeries(tx,row,now);row=await tx.bookingSeries.findUnique({where:{id:seriesId},include:{bookings:{include:childInclude,orderBy:{start_at:'asc'}}}});return {data:seriesDto(row,row.bookings,qrStorage,now),meta:{server_time:now.toISOString()}}},txOptions);
    },
    confirm:(actor,id)=>ownerAction(actor,id,'confirm'), reject:(actor,id,reason)=>ownerAction(actor,id,'reject',reason),
  };
}
