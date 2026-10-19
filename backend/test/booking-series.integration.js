import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { createBookingSeriesService } from '../src/modules/bookings/series-service.js';
import { recurringBookingInput } from '../src/modules/bookings/series-validation.js';
import { createPaymentService } from '../src/modules/payments/service.js';

test('Recurring Booking Phase 3 PostgreSQL lifecycle and concurrency', { timeout: 600000 }, async t => {
  const tag = `TEST_RECURRING_V3_${randomUUID()}`;
  const users = [], sessions = [], facilityIds = [], courtIds = [];
  const config = { nodeEnv: 'development', frontendUrl: 'http://localhost:5173', bookingFlowVersion: 2 };
  const forbidden = () => { throw new Error('EXTERNAL_CALL_FORBIDDEN'); };
  const storedObjects = new Set();
  const storage = { ready() {}, privateUrl(_id, _type, expires) { return `https://private.invalid/signed?expires=${expires}`; },
    async upload(_buffer,id){ storedObjects.add(id); return id; }, async destroy(id){ storedObjects.delete(id); } };
  const time = value => new Date(`1970-01-01T${value}:00Z`);
  let server;
  try {
    const [{ now }] = await prisma.$queryRaw`SELECT clock_timestamp() AS now`;
    for (let index = 0; index < 4; index += 1) {
      const email = `${tag}-${index}@example.invalid`, token = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('hex');
      const user = await prisma.user.create({ data: { email, email_normalized: email.toLowerCase(), full_name: `${tag} User ${index}`, phone: index === 2 ? null : `09000000${index}`, google_subject: email, role: index === 3 ? 'ADMIN' : 'CUSTOMER', status: 'ACTIVE', created_at: now } });
      users.push(user);
      await prisma.authSession.create({ data: { user_id: user.id, token_hash: createHash('sha256').update(token).digest(), csrf_token: csrf, created_at: now, expires_at: new Date(+now + 365 * 86400000) } });
      sessions.push({ token, csrf });
    }
    for (const owner of [users[0], users[1]]) {
      const request = await prisma.ownerRequest.create({ data: { user_id: owner.id, status: 'APPROVED', applicant_name_snapshot: tag, applicant_email_snapshot: owner.email, reviewed_by: users[3].id, reviewed_at: now, created_at: now } });
      await prisma.ownerProfile.create({ data: { user_id: owner.id, approved_request_id: request.id, created_at: now } });
    }
    const facility = await prisma.facility.create({ data: { owner_id: users[0].id, name: tag, address: 'Địa chỉ fixture', district: 'Phường Hải Châu', phone: '0900000000', opening_time: time('06:00'), closing_time: time('22:00'), status: 'ACTIVE', created_at: now } });
    facilityIds.push(facility.id);
    const court = await prisma.court.create({ data: { facility_id: facility.id, name: `${tag} Court`, status: 'ACTIVE', created_at: now } });
    courtIds.push(court.id);
    await prisma.priceRule.create({ data: { facility_id: facility.id, start_time: time('06:00'), end_time: time('22:00'), hourly_rate: '80000', created_at: now } });
    await prisma.cancellationPolicy.create({data:{facility_id:facility.id,cutoff_hours:24,created_at:now}});
    await prisma.bankAccount.create({ data: { facility_id: facility.id, bank_name: 'Fixture Bank', account_number: '00112233', account_holder: 'FIXTURE OWNER', qr_image_path: `${tag}/qr`, created_at: now } });

    server = createApp(prisma, config, undefined, { ready: forbidden, send: forbidden }, undefined, { url: forbidden, upload: forbidden, destroy: forbidden }, undefined, storage).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const request = async (path, who = 2, method = 'GET', data, overrides = {}) => {
      const session = sessions[who];
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method, headers: { Origin: overrides.origin ?? config.frontendUrl, Cookie: `booking_session=${session.token}`, 'X-CSRF-Token': overrides.csrf ?? session.csrf, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(60000) });
      return { status: response.status, body: await response.json() };
    };
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#123456' } }).png().toBuffer();
    const refundProof = async (refundId, who = 0) => {
      const form = new FormData(); form.append('image', new Blob([png], { type: 'image/png' }), 'refund-proof.png');
      const session = sessions[who];
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/owner/refunds/${refundId}/proof`, { method: 'POST', headers: { Origin: config.frontendUrl, Cookie: `booking_session=${session.token}`, 'X-CSRF-Token': session.csrf }, body: form, signal: AbortSignal.timeout(60000) });
      return { status: response.status, body: await response.json() };
    };
    const local = new Date(+now + 7 * 3600000);
    local.setUTCDate(local.getUTCDate() + 2);
    const isoWeekday = local.getUTCDay() || 7;
    const shiftTo = weekday => { const date = new Date(local); date.setUTCDate(date.getUTCDate() + ((weekday - (date.getUTCDay() || 7) + 7) % 7)); return date; };
    const monday = shiftTo(1);
    const dateOnly = date => date.toISOString().slice(0, 10);
    const body = (startDate, weeks = 2, startTime = '18:00', endTime = '19:00') => ({ court_id: String(court.id), weekday: 1, start_date: dateOnly(startDate), end_date: dateOnly(new Date(+startDate + weeks * 7 * 86400000)), start_time: startTime, end_time: endTime });
    const createdIds = [];
    const create = async (payload, who = 2) => { const result = await request('/bookings/recurring', who, 'POST', payload); if (result.status === 201) createdIds.push(BigInt(result.body.data.id)); return result; };

    await t.test('atomic create persists Series, child V2 bookings, slot history and locks with one shared DB deadline', async () => {
      const started = performance.now();
      const result = await create(body(monday, 2));
      assert.equal(result.status, 201);
      assert.equal(result.body.data.status, 'PENDING_CONFIRMATION');
      assert.equal(result.body.data.occurrence_count, 3);
      assert.equal(result.body.data.transfer_reference, `CLDNS ${result.body.data.id}`);
      assert.equal(result.body.data.total_amount, '240000');
      assert.equal(result.body.data.deposit_amount, '72000');
      assert.equal(result.body.data.remaining_amount, '168000');
      assert.equal(result.body.data.bank.has_qr_image, true);
      assert.ok(result.body.data.bank.qr_image_url.startsWith('https://private.invalid/'));
      assert.equal(Date.parse(result.body.data.confirmation_expires_at) - Date.parse(result.body.meta.server_time), 30 * 60000);
      assert.ok(result.body.data.occurrences.every(row => row.status === 'PENDING_CONFIRMATION'));
      const seriesId = BigInt(result.body.data.id);
      const children = await prisma.booking.findMany({ where: { booking_series_id: seriesId }, include: { slots: true }, orderBy: { start_at: 'asc' } });
      assert.equal(children.length, 3);
      assert.ok(children.every(row => row.booking_flow_version === 2 && +row.confirmation_expires_at === +children[0].confirmation_expires_at && row.slots.length === 2));
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking: { booking_series_id: seriesId } } } }), 6);
      console.log(`RECURRING CREATE PERFORMANCE: ${(performance.now() - started).toFixed(1)}ms, children=3, slots=6`);
    });

    await t.test('customer/owner reads are scoped, paginated and do not expose storage identifiers', async () => {
      const seriesId = createdIds[0];
      const customer = await request(`/booking-series/${seriesId}`);
      assert.equal(customer.status, 200); assert.equal(customer.body.data.id, String(seriesId));
      assert.equal(JSON.stringify(customer.body).includes(`${tag}/qr`), false);
      assert.equal((await request(`/booking-series/${seriesId}`, 1)).status, 404);
      const owner = await request(`/owner/booking-series/${seriesId}`, 0);
      assert.equal(owner.status, 200); assert.equal(owner.body.data.customer.full_name, `${tag} User 2`);
      assert.equal((await request(`/owner/booking-series/${seriesId}`, 1)).status, 404);
      assert.equal((await request('/owner/booking-series?page=1&page_size=1', 0)).body.meta.total >= 1, true);
      assert.equal((await request('/owner/booking-series', 2)).status, 403);
    });

    await t.test('one conflicting occurrence rejects the whole series without partial rows', async () => {
      const before = { series: await prisma.bookingSeries.count(), bookings: await prisma.booking.count({ where: { court_id: court.id } }), slots: await prisma.bookingSlot.count({ where: { booking: { court_id: court.id } } }), locks: await prisma.courtSlotLock.count({ where: { court_id: court.id } }) };
      const result = await create(body(new Date(+monday + 14 * 86400000), 2));
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'SLOT_UNAVAILABLE');
      assert.deepEqual({ series: await prisma.bookingSeries.count(), bookings: await prisma.booking.count({ where: { court_id: court.id } }), slots: await prisma.bookingSlot.count({ where: { booking: { court_id: court.id } } }), locks: await prisma.courtSlotLock.count({ where: { court_id: court.id } }) }, before);
    });

    await t.test('an injected failure after intermediate writes rolls back Series, children, slots and locks', async () => {
      const payload = body(new Date(+monday + 21 * 86400000), 1, '17:00', '17:30');
      const before = { series: await prisma.bookingSeries.count(), bookings: await prisma.booking.count({ where: { court_id: court.id } }), slots: await prisma.bookingSlot.count({ where: { booking: { court_id: court.id } } }), locks: await prisma.courtSlotLock.count({ where: { court_id: court.id } }) };
      const db = new Proxy(prisma, { get(target, key) { if (key === '$transaction') return (fn, options) => target.$transaction(tx => fn(new Proxy(tx, { get(value, property) { if (property === 'courtSlotLock') return new Proxy(value.courtSlotLock, { get(model, method) { if (method === 'createMany') return async args => { await model.createMany(args); throw Object.assign(new Error('Injected'), { code: 'TEST_FAILURE' }); }; return model[method]; } }); return value[property]; } })), options); return target[key]; } });
      const actor = await createAuthService(prisma).session(sessions[2].token);
      await assert.rejects(createBookingSeriesService(db, storage).create(actor, recurringBookingInput(payload)), error => error.code === 'TEST_FAILURE');
      assert.deepEqual({ series: await prisma.bookingSeries.count(), bookings: await prisma.booking.count({ where: { court_id: court.id } }), slots: await prisma.bookingSlot.count({ where: { booking: { court_id: court.id } } }), locks: await prisma.courtSlotLock.count({ where: { court_id: court.id } }) }, before);
    });

    await t.test('partially-overlapping concurrent series yield one whole winner and no partial loser', async () => {
      const a = body(new Date(+monday + 21 * 86400000), 1, '16:00', '16:30');
      const b = body(new Date(+monday + 28 * 86400000), 1, '16:00', '16:30');
      const results = await Promise.all([create(a, 1), create(b, 2)]);
      assert.deepEqual(results.map(row => row.status).sort(), [201, 409]);
      const winner = results.find(row => row.status === 201), loser = results.find(row => row.status === 409);
      assert.equal(loser.body.error.code, 'SLOT_UNAVAILABLE');
      assert.equal(await prisma.booking.count({ where: { booking_series_id: BigInt(winner.body.data.id) } }), 2);
      assert.equal(await prisma.bookingSeries.count({ where: { court_id: court.id, start_time: time('16:00') } }), 1);
    });

    await t.test('single Booking V2 versus recurring Series overlap has exactly one winner', async () => {
      const startDate = new Date(+monday + 7 * 86400000);
      const recurring = body(startDate, 0, '20:00', '20:30');
      const start = new Date(`${dateOnly(startDate)}T20:00:00+07:00`);
      const single = { court_id: String(court.id), start_at: start.toISOString(), end_at: new Date(+start + 1800000).toISOString() };
      const results = await Promise.all([create(recurring, 1), request('/bookings', 2, 'POST', single)]);
      assert.deepEqual(results.map(row => row.status).sort(), [201, 409]);
      assert.equal(results.find(row => row.status === 409).body.error.code, 'SLOT_UNAVAILABLE');
      assert.equal(await prisma.courtSlotLock.count({ where: { court_id: court.id, start_at: start } }), 1);
    });

    await t.test('concurrent same-series create has exactly one winner and no partial losing series', async () => {
      const payload = body(new Date(+monday + 35 * 86400000), 1, '19:00', '20:00');
      const results = await Promise.all([create(payload, 1), create(payload, 2)]);
      assert.deepEqual(results.map(row => row.status).sort(), [201, 409]);
      assert.equal(results.find(row => row.status === 409).body.error.code, 'SLOT_UNAVAILABLE');
      const winner = results.find(row => row.status === 201);
      assert.equal(await prisma.booking.count({ where: { booking_series_id: BigInt(winner.body.data.id) } }), 2);
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking: { booking_series_id: BigInt(winner.body.data.id) } } } }), 4);
    });

    await t.test('Owner confirm transitions whole series atomically and preserves BOOKED locks', async () => {
      const made = await create(body(new Date(+monday + 56 * 86400000), 1, '06:00', '06:30'));
      const seriesId = BigInt(made.body.data.id);
      const confirmed = await request(`/owner/booking-series/${seriesId}/confirm`, 0, 'POST', {});
      assert.equal(confirmed.status, 200); assert.equal(confirmed.body.data.status, 'CONFIRMED');
      const rows = await prisma.booking.findMany({ where: { booking_series_id: seriesId } });
      assert.ok(rows.every(row => row.status === 'CONFIRMED' && row.confirmed_by_user_id === users[0].id));
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking: { booking_series_id: seriesId } } } }), rows.length);
      assert.equal((await request(`/owner/booking-series/${seriesId}/confirm`, 0, 'POST', {})).status, 409);
    });

    await t.test('Customer cancels isolated confirmed occurrences with child refunds and deterministic concurrency',async()=>{
      const made=await create(body(new Date(+monday+49*86400000),1,'11:00','11:30'));
      const seriesId=BigInt(made.body.data.id);
      assert.equal((await request(`/owner/booking-series/${seriesId}/confirm`,0,'POST',{})).status,200);
      const children=await prisma.booking.findMany({where:{booking_series_id:seriesId},orderBy:{id:'asc'}});
      assert.equal(children.length,2);
      const same=await Promise.all([
        request(`/booking-series/${seriesId}/occurrences/${children[0].id}/cancel`,2,'POST',{reason:'Đổi lịch'}),
        request(`/booking-series/${seriesId}/occurrences/${children[0].id}/cancel`,2,'POST',{reason:'Lặp lại'}),
      ]);
      assert.deepEqual(same.map(row=>row.status).sort(),[200,409],JSON.stringify(same.map(row=>row.body)));
      const second=await request(`/booking-series/${seriesId}/occurrences/${children[1].id}/cancel`,2,'POST',{});
      assert.equal(second.status,200);assert.equal(second.body.data.series.status,'CONFIRMED');
      assert.equal(second.body.data.occurrence.refund.amount,children[1].deposit_amount.toString());
      const [series,rows,refunds,locks,slots]=await Promise.all([
        prisma.bookingSeries.findUnique({where:{id:seriesId}}),prisma.booking.findMany({where:{booking_series_id:seriesId}}),
        prisma.refund.findMany({where:{booking:{booking_series_id:seriesId}}}),prisma.courtSlotLock.count({where:{bookingSlot:{booking:{booking_series_id:seriesId}}}}),
        prisma.bookingSlot.count({where:{booking:{booking_series_id:seriesId}}}),
      ]);
      assert.equal(series.status,'CONFIRMED');assert.ok(rows.every(row=>row.status==='CANCELLED'));assert.equal(refunds.length,2);assert.equal(locks,0);assert.equal(slots,2);
      const detail=await request(`/booking-series/${seriesId}`,2);assert.equal(detail.status,200);assert.ok(detail.body.data.occurrences.every(row=>row.status==='CANCELLED'&&row.refund?.status==='PENDING'));
      assert.equal((await request(`/booking-series/${seriesId}/occurrences/${children[0].id}/cancel`,1,'POST',{})).status,404);
      const other=createdIds[0],foreignChild=await prisma.booking.findFirst({where:{booking_series_id:other}});
      assert.equal((await request(`/booking-series/${seriesId}/occurrences/${foreignChild.id}/cancel`,2,'POST',{})).status,404);
      const refundView=await request(`/refunds/${refunds[0].id}`,2);assert.equal(refundView.status,200);assert.equal(refundView.body.data.status,'PENDING');
      const uploaded=await refundProof(refunds[0].id,0);assert.equal(uploaded.status,201);assert.equal(uploaded.body.data.status,'PROOF_SUBMITTED');
      const ownerView=await request(`/owner/refunds/${refunds[0].id}`,0);assert.equal(ownerView.status,200);assert.match(ownerView.body.data.proof_image_url,/^https:\/\/private\.invalid\//);
      assert.equal(JSON.stringify(ownerView.body).includes('refund-proofs/'),false);
      const received=await request(`/refunds/${refunds[0].id}/confirm`,2,'POST',{});assert.equal(received.status,200);assert.equal(received.body.data.status,'REFUNDED');
      assert.equal((await request(`/refunds/${refunds[0].id}`,2)).body.data.status,'REFUNDED');
    });

    await t.test('PostgreSQL cancellation cutoff is allowed before and rejected at/after the exact deadline',async()=>{
      const actor=await createAuthService(prisma).session(sessions[2].token);
      const cases=[['before',-1,200],['exact',0,409],['after',1,409]];
      for(let index=0;index<cases.length;index+=1){
        const [label,offset,expected]=cases[index];
        const made=await create(body(new Date(+monday+(84+index*7)*86400000),0,`${12+index}:00`,`${12+index}:30`));
        assert.equal(made.status,201);const seriesId=BigInt(made.body.data.id);
        assert.equal((await request(`/owner/booking-series/${seriesId}/confirm`,0,'POST',{})).status,200);
        const child=await prisma.booking.findFirst({where:{booking_series_id:seriesId},include:{slots:{include:{lock:true}}}});
        const deadline=new Date(+child.start_at-child.cancellation_cutoff_hours_snapshot*3600000+offset);
        const service=createBookingSeriesService(prisma,storage,{cancellationClock:async tx=>(await tx.$queryRaw`SELECT ${deadline}::timestamptz AS now`)[0].now});
        let outcome;
        try{outcome=await service.cancelOccurrence(actor,seriesId,child.id,`boundary-${label}`);}catch(error){outcome=error;}
        if(expected===200){assert.equal(outcome.data.occurrence.status,'CANCELLED');assert.equal(await prisma.refund.count({where:{booking_id:child.id}}),1);assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:child.id}}}),0);}
        else {assert.equal(outcome.status,409);assert.equal(outcome.code,'CANCELLATION_DEADLINE_PASSED');assert.equal((await prisma.booking.findUnique({where:{id:child.id}})).status,'CONFIRMED');assert.equal(await prisma.refund.count({where:{booking_id:child.id}}),0);assert.equal(await prisma.courtSlotLock.count({where:{bookingSlot:{booking_id:child.id}}}),child.slots.length);}
      }
    });

    await t.test('cancellation failure after Refund insert rolls back child, metadata, Refund and locks',async()=>{
      const made=await create(body(new Date(+monday+119*86400000),0,'15:00','15:30'));assert.equal(made.status,201);
      const seriesId=BigInt(made.body.data.id);assert.equal((await request(`/owner/booking-series/${seriesId}/confirm`,0,'POST',{})).status,200);
      const before=await prisma.booking.findFirst({where:{booking_series_id:seriesId},include:{slots:true}}), lockIds=(await prisma.courtSlotLock.findMany({where:{bookingSlot:{booking_id:before.id}},orderBy:{booking_slot_id:'asc'}})).map(row=>String(row.booking_slot_id));
      const db=new Proxy(prisma,{get(target,key){if(key==='$transaction')return(fn,options)=>target.$transaction(tx=>fn(new Proxy(tx,{get(value,property){if(property==='refund')return new Proxy(value.refund,{get(model,method){if(method==='create')return async args=>{await model.create(args);throw Object.assign(new Error('Injected cancellation rollback'),{code:'TEST_CANCEL_FAILURE'});};return model[method];}});return value[property];}})),options);return target[key];}});
      const actor=await createAuthService(prisma).session(sessions[2].token);
      await assert.rejects(createBookingSeriesService(db,storage).cancelOccurrence(actor,seriesId,before.id,'rollback'),error=>error.code==='TEST_CANCEL_FAILURE');
      const after=await prisma.booking.findUnique({where:{id:before.id}}), afterLocks=(await prisma.courtSlotLock.findMany({where:{bookingSlot:{booking_id:before.id}},orderBy:{booking_slot_id:'asc'}})).map(row=>String(row.booking_slot_id));
      assert.equal(after.status,'CONFIRMED');assert.equal(after.cancelled_at,null);assert.equal(after.cancelled_by,null);assert.equal(after.cancellation_reason,null);
      assert.equal(await prisma.refund.count({where:{booking_id:before.id}}),0);assert.deepEqual(afterLocks,lockIds);assert.equal(await prisma.bookingSlot.count({where:{booking_id:before.id}}),before.slots.length);assert.equal((await prisma.bookingSeries.findUnique({where:{id:seriesId}})).status,'CONFIRMED');
    });

    await t.test('concurrent different-child cancellation isolates lock identities and releases availability after commit',async()=>{
      const made=await create(body(new Date(+monday+126*86400000),2,'16:00','16:30'));assert.equal(made.status,201);
      const seriesId=BigInt(made.body.data.id);assert.equal((await request(`/owner/booking-series/${seriesId}/confirm`,0,'POST',{})).status,200);
      const children=await prisma.booking.findMany({where:{booking_series_id:seriesId},include:{slots:{include:{lock:true}}},orderBy:{start_at:'asc'}});assert.equal(children.length,3);
      const lockIdentity=child=>child.slots.filter(slot=>slot.lock).map(slot=>`${slot.id}:${slot.lock.court_id}:${slot.lock.start_at.toISOString()}`).sort();
      const before=children.map(lockIdentity);
      const availabilityDate=dateOnly(new Date(+children[0].start_at+7*3600000));
      const beforeAvailability=await request(`/courts/${court.id}/availability?date=${availabilityDate}`,2);assert.equal(beforeAvailability.status,200);
      assert.equal(beforeAvailability.body.data.slots.find(slot=>slot.start_at===children[0].start_at.toISOString()).state,'BOOKED');
      const results=await Promise.all(children.slice(0,2).map((child,index)=>request(`/booking-series/${seriesId}/occurrences/${child.id}/cancel`,2,'POST',{reason:`child-${index}`})));
      assert.deepEqual(results.map(row=>row.status),[200,200]);
      const rows=await prisma.booking.findMany({where:{booking_series_id:seriesId},include:{slots:{include:{lock:true}},refund:true},orderBy:{start_at:'asc'}});
      assert.deepEqual(rows.map(row=>row.status),['CANCELLED','CANCELLED','CONFIRMED']);assert.ok(rows.slice(0,2).every(row=>row.refund?.amount.toString()===row.deposit_amount.toString()));assert.equal(rows[2].refund,null);
      assert.deepEqual(lockIdentity(rows[0]),[]);assert.deepEqual(lockIdentity(rows[1]),[]);assert.deepEqual(lockIdentity(rows[2]),before[2]);
      assert.ok(rows.every(row=>row.slots.length===1));assert.equal((await prisma.bookingSeries.findUnique({where:{id:seriesId}})).status,'CONFIRMED');
      const afterAvailability=await request(`/courts/${court.id}/availability?date=${availabilityDate}`,2);assert.equal(afterAvailability.status,200);
      assert.equal(afterAvailability.body.data.slots.find(slot=>slot.start_at===children[0].start_at.toISOString()).state,'AVAILABLE');
    });

    await t.test('Owner reject requires approved reason field, transitions whole series and releases locks', async () => {
      const made = await create(body(new Date(+monday + 56 * 86400000), 1, '07:00', '07:30'));
      const seriesId = BigInt(made.body.data.id);
      assert.equal((await request(`/owner/booking-series/${seriesId}/reject`, 0, 'POST', { reason: 'wrong field' })).status, 422);
      const rejected = await request(`/owner/booking-series/${seriesId}/reject`, 0, 'POST', { rejection_reason: '  Không thể nhận lịch cố định  ' });
      assert.equal(rejected.status, 200); assert.equal(rejected.body.data.status, 'REJECTED');
      assert.ok((await prisma.booking.findMany({ where: { booking_series_id: seriesId } })).every(row => row.status === 'REJECTED' && row.rejection_reason === 'Không thể nhận lịch cố định'));
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking: { booking_series_id: seriesId } } } }), 0);
    });

    await t.test('exact deadline expiry wins, expires all children, preserves slots and releases locks', async () => {
      const made = await create(body(new Date(+monday + 63 * 86400000), 1, '08:00', '08:30'));
      const seriesId = BigInt(made.body.data.id);
      await prisma.$executeRaw`UPDATE booking_series SET confirmation_expires_at=clock_timestamp() WHERE id=${seriesId}`;
      await prisma.$executeRaw`UPDATE bookings SET confirmation_expires_at=(SELECT confirmation_expires_at FROM booking_series WHERE id=${seriesId}) WHERE booking_series_id=${seriesId}`;
      const result = await request(`/owner/booking-series/${seriesId}/confirm`, 0, 'POST', {});
      assert.equal(result.status, 409); assert.equal(result.body.error.code, 'BOOKING_EXPIRED');
      assert.equal((await prisma.bookingSeries.findUnique({ where: { id: seriesId } })).status, 'EXPIRED');
      assert.ok((await prisma.booking.findMany({ where: { booking_series_id: seriesId } })).every(row => row.status === 'EXPIRED' && row.expired_at));
      assert.equal(await prisma.courtSlotLock.count({ where: { bookingSlot: { booking: { booking_series_id: seriesId } } } }), 0);
      assert.ok(await prisma.bookingSlot.count({ where: { booking: { booking_series_id: seriesId } } }) > 0);
      const expiredList = await request('/owner/booking-series?status=EXPIRED&page=1&page_size=100', 0);
      assert.equal(expiredList.status, 200); assert.ok(expiredList.body.data.some(row => row.id === String(seriesId)));
      const pendingList = await request('/owner/booking-series?status=PENDING_CONFIRMATION&page=1&page_size=100', 0);
      assert.equal(pendingList.status, 200); assert.equal(pendingList.body.data.some(row => row.id === String(seriesId)), false);
    });

    await t.test('concurrent confirm/reject yields one terminal decision without mixed children', async () => {
      const made = await create(body(new Date(+monday + 70 * 86400000), 1, '09:00', '09:30'));
      const seriesId = BigInt(made.body.data.id);
      const results = await Promise.all([request(`/owner/booking-series/${seriesId}/confirm`, 0, 'POST', {}), request(`/owner/booking-series/${seriesId}/reject`, 0, 'POST', { rejection_reason: 'Race rejection' })]);
      assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
      const row = await prisma.bookingSeries.findUnique({ where: { id: seriesId } });
      const children = await prisma.booking.findMany({ where: { booking_series_id: seriesId } });
      assert.ok(['CONFIRMED', 'REJECTED'].includes(row.status)); assert.ok(children.every(child => child.status === row.status));
    });

    await t.test('Origin/CSRF and PaymentProof restrictions fail closed', async () => {
      const made = await create(body(new Date(+monday + 77 * 86400000), 1, '10:00', '10:30'));
      const seriesId = BigInt(made.body.data.id), child = await prisma.booking.findFirst({ where: { booking_series_id: seriesId } });
      assert.equal((await request(`/owner/booking-series/${seriesId}/confirm`, 0, 'POST', {}, { origin: 'https://invalid.example' })).status, 403);
      const actor = await createAuthService(prisma).session(sessions[2].token);
      await assert.rejects(createPaymentService(prisma, storage).precheck(actor, child.id), error => error.code === 'PAYMENT_PROOF_NOT_ALLOWED_FOR_BOOKING_FLOW');
      assert.equal(await prisma.paymentProof.count({ where: { booking_id: child.id } }), 0);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await prisma.$transaction(async tx => {
        await tx.courtSlotLock.deleteMany({ where: { court_id: { in: courtIds } } });
        await tx.refund.deleteMany({ where: { booking: { court_id: { in: courtIds } } } });
        await tx.paymentProof.deleteMany({ where: { booking: { court_id: { in: courtIds } } } });
        await tx.bookingSlot.deleteMany({ where: { booking: { court_id: { in: courtIds } } } });
        await tx.booking.deleteMany({ where: { court_id: { in: courtIds } } });
        await tx.bookingSeries.deleteMany({ where: { court_id: { in: courtIds } } });
        await tx.courtBlock.deleteMany({ where: { court_id: { in: courtIds } } });
        await tx.court.deleteMany({ where: { id: { in: courtIds } } });
        await tx.cancellationPolicy.deleteMany({ where: { facility_id: { in: facilityIds } } });
        await tx.priceRule.deleteMany({ where: { facility_id: { in: facilityIds } } });
        await tx.bankAccount.deleteMany({ where: { facility_id: { in: facilityIds } } });
        await tx.facility.deleteMany({ where: { id: { in: facilityIds } } });
        const userIds = users.map(row => row.id);
        await tx.ownerProfile.deleteMany({ where: { user_id: { in: userIds } } });
        await tx.ownerRequest.deleteMany({ where: { user_id: { in: userIds } } });
        await tx.authSession.deleteMany({ where: { user_id: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }, { maxWait: 20000, timeout: 60000 });
      assert.equal(await prisma.user.count({ where: { full_name: { startsWith: tag } } }), 0);
      assert.equal(await prisma.bookingSeries.count({ where: { facility_name_snapshot: tag } }), 0);
      console.log('RECURRING V3 FIXTURE CLEANUP: PASS');
    } finally { await prisma.$disconnect(); }
  }
});
