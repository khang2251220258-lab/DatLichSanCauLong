import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';

test('Availability guest HTTP/PostgreSQL, read-only occupancy and scoped cleanup', { timeout: 600000 }, async t => {
  const tag = `availability-${randomUUID()}`, email = `${tag}@example.invalid`, time = v => new Date(`1970-01-01T${v}:00Z`);
  let user, facility, court, server;
  const created_at = new Date();
  try {
    const [clock] = await prisma.$queryRaw`SELECT clock_timestamp() AS now,
      to_char(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS today,
      to_char((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, 'YYYY-MM-DD') AS tomorrow`;
    const date = clock.tomorrow, midnight = new Date(`${date}T00:00:00+07:00`);
    const at = index => new Date(+midnight + (360 + index * 30) * 60000);
    user = await prisma.user.create({ data: { email, email_normalized: email, full_name: tag, role: 'CUSTOMER', status: 'ACTIVE', google_subject: tag, created_at } });
    const approval = await prisma.ownerRequest.create({ data: { user_id: user.id, status: 'APPROVED', applicant_name_snapshot: tag, applicant_email_snapshot: email, reviewed_by: user.id, reviewed_at: created_at, created_at } });
    await prisma.ownerProfile.create({ data: { user_id: user.id, approved_request_id: approval.id, created_at } });
    facility = await prisma.facility.create({ data: { owner_id: user.id, name: tag, address: 'Fixture', district: 'Phường Hải Châu', phone: '0123456789', opening_time: time('06:00'), closing_time: time('12:00'), status: 'ACTIVE', created_at } });
    court = await prisma.court.create({ data: { facility_id: facility.id, name: tag, status: 'ACTIVE', created_at } });
    for (const [start, end] of [['06:00','10:30'],['11:00','12:00']]) await prisma.priceRule.create({ data: { facility_id: facility.id, start_time: time(start), end_time: time(end), hourly_rate: '80001', created_at } });
    const statusSlots = [[1,'CONFIRMED'],[2,'PENDING_CONFIRMATION'],[3,'PENDING_PAYMENT'],[4,'PENDING_PAYMENT'],[5,'CANCELLED'],[6,'REJECTED'],[7,'EXPIRED'],[8,'COMPLETED'],[11,'CONFIRMED']];
    for (const [i,status] of statusSlots) {
      const created = new Date(+clock.now - (i === 4 || i === 2 ? 600000 : 0));
      const b = await prisma.booking.create({ data: { court_id: court.id, customer_id: user.id, status,
        start_at: at(i), end_at: at(i+1), expires_at: new Date(+created + 300000), created_at: created,
        total_amount: 40001, deposit_amount: 12000, remaining_amount: 28001,
        bank_name_snapshot: 'Fixture', account_number_snapshot: '123', account_holder_snapshot: 'Fixture',
        facility_name_snapshot: tag, facility_address_snapshot: 'Fixture', court_name_snapshot: tag,
        ...(status === 'CANCELLED' ? { cancelled_by: 'CUSTOMER', cancelled_at: created_at } : {}),
        ...(status === 'REJECTED' ? { rejection_reason: 'Fixture' } : {}) } });
      const slot = await prisma.bookingSlot.create({ data: { booking_id: b.id, start_at: at(i), end_at: at(i+1), hourly_rate_snapshot: 80001, slot_amount: '40000.5', created_at } });
      // Stale physical locks must not block expired/terminal bookings. Effective bookings without locks still block.
      if ([4,5].includes(i)) await prisma.courtSlotLock.create({ data: { court_id: court.id, start_at: at(i), booking_slot_id: slot.id, created_at } });
    }
    for (const i of [0,11]) await prisma.courtBlock.create({ data: { court_id: court.id, start_at: new Date(+at(i)+60000), end_at: at(i+1), reason: 'PRIVATE_BLOCK_REASON', created_by: user.id, created_at } });
    const forbid = () => { throw new Error('EXTERNAL_CALL_FORBIDDEN'); };
    server = createApp(prisma, { nodeEnv: 'development', frontendUrl: 'http://localhost:5173' }, undefined,
      { ready: forbid, send: forbid }, undefined, { url: forbid, upload: forbid, destroy: forbid }).listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const path = `/courts/${court.id}/availability`;
    async function get(url) {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${url}`, { signal: AbortSignal.timeout(60000) });
      return { status: r.status, body: await r.json(), cache: r.headers.get('cache-control') };
    }
    async function snapshot() {
      return prisma.$transaction(async tx => ({
        user: await tx.user.findUnique({ where: { id: user.id } }), facility: await tx.facility.findUnique({ where: { id: facility.id } }), court: await tx.court.findUnique({ where: { id: court.id } }),
        bookings: await tx.booking.findMany({ where: { court_id: court.id }, orderBy: { id: 'asc' } }),
        slots: await tx.bookingSlot.findMany({ where: { booking: { court_id: court.id } }, orderBy: { id: 'asc' } }),
        locks: await tx.courtSlotLock.findMany({ where: { court_id: court.id }, orderBy: { start_at: 'asc' } }),
        blocks: await tx.courtBlock.findMany({ where: { court_id: court.id }, orderBy: { id: 'asc' } }),
        rules: await tx.priceRule.findMany({ where: { facility_id: facility.id }, orderBy: { id: 'asc' } }),
      }), { timeout: 30000 });
    }
    await t.test('Guest states, priority, UTC, exact half VND, whitelist and no database mutation', async () => {
      const before = await snapshot(), r = await get(`${path}?date=${date}`);
      assert.equal(r.status, 200); assert.equal(r.cache, 'no-store');
      assert.deepEqual(Object.keys(r.body.data).sort(), ['court_id','date','timezone','slot_minutes','slots'].sort());
      const d = r.body.data; assert.equal(d.timezone, 'Asia/Ho_Chi_Minh'); assert.equal(d.slot_minutes, 30); assert.equal(d.date, date);
      assert.deepEqual(d.slots.map(s => s.state), ['BLOCKED','BOOKED','HELD','HELD','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','AVAILABLE','UNPRICED','AVAILABLE','BLOCKED']);
      assert.equal(d.slots[0].start_at, at(0).toISOString()); assert.equal(d.slots[11].end_at, at(12).toISOString());
      for (const [i,s] of d.slots.entries()) {
        assert.deepEqual(Object.keys(s).sort(), ['start_at','end_at','state','slot_amount'].sort());
        assert.equal(s.slot_amount, i === 9 ? null : '40000.5');
      }
      assert.ok(Number.isFinite(Date.parse(r.body.meta.server_time)));
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('Today PAST based on response DB timestamp and local midnight UTC conversion', async () => {
      await prisma.facility.update({ where: { id: facility.id }, data: { opening_time: time('00:00'), closing_time: time('23:30') } });
      try {
        const r = await get(`${path}?date=${clock.today}`); assert.equal(r.status, 200);
        assert.equal(r.body.data.slots.length, 47);
        assert.equal(r.body.data.slots[0].start_at, new Date(`${clock.today}T00:00:00+07:00`).toISOString());
        for (const s of r.body.data.slots) assert.equal(s.state === 'PAST', Date.parse(s.start_at) <= Date.parse(r.body.meta.server_time));
      } finally { await prisma.facility.update({ where: { id: facility.id }, data: { opening_time: time('06:00'), closing_time: time('12:00') } }); }
    });
    await t.test('Strict date/query/path and past day rejection', async () => {
      for (const query of ['', '?date=2000-01-01', '?date=2030-02-30', `?date=${date}&date=${date}`, '?date=2030-1-01']) {
        const r = await get(path+query); assert.equal(r.status,422); assert.equal(r.body.error.code,'INVALID_DATE');
      }
      for (const url of [`${path}?date=${date}&start_time=06:00`, `/courts/0/availability?date=${date}`]) assert.equal((await get(url)).body.error.code,'VALIDATION_ERROR');
    });
    await t.test('Court/Facility/Owner visibility all return safe 404', async () => {
      const assertHidden = async () => { const r=await get(`${path}?date=${date}`); assert.equal(r.status,404); assert.equal(r.body.error.code,'RESOURCE_NOT_FOUND'); };
      try {
        await prisma.court.update({ where:{id:court.id}, data:{status:'INACTIVE'} }); await assertHidden();
      } finally { await prisma.court.update({ where:{id:court.id}, data:{status:'ACTIVE'} }); }
      try {
        await prisma.user.update({ where:{id:user.id}, data:{status:'LOCKED',locked_at:created_at,locked_reason:'Fixture'} }); await assertHidden();
      } finally { await prisma.user.update({ where:{id:user.id}, data:{status:'ACTIVE',locked_at:null,locked_reason:null} }); }
      try {
        for (const status of ['DRAFT','PENDING','REJECTED','SUSPENDED']) {
          await prisma.facility.update({ where:{id:facility.id}, data:{status,rejection_reason:'Fixture',suspension_reason:'Fixture'} }); await assertHidden();
        }
      } finally { await prisma.facility.update({ where:{id:facility.id}, data:{status:'ACTIVE',rejection_reason:null,suspension_reason:null} }); }
    });
    await t.test('Overlapping rule rejects whole response without mutation; health 200', async () => {
      const extra = await prisma.priceRule.create({ data:{facility_id:facility.id,start_time:time('06:00'),end_time:time('07:00'),hourly_rate:90000,created_at} });
      try {
        const before=await snapshot(), r=await get(`${path}?date=${date}`);
        assert.equal(r.status,409); assert.equal(r.body.error.code,'PRICE_NOT_CONFIGURED'); assert.ok(!('data' in r.body));
        assert.deepEqual(await snapshot(),before);
      } finally { await prisma.priceRule.delete({where:{id:extra.id}}); }
      const health=await get('/health'); assert.equal(health.status,200); assert.deepEqual(health.body,{success:true,message:'API is running'});
    });
  } finally {
    if (server) await new Promise(r=>server.close(r));
    try {
      await prisma.$transaction(async tx=>{
        if(court){
          await tx.courtSlotLock.deleteMany({where:{court_id:court.id}});
          await tx.courtBlock.deleteMany({where:{court_id:court.id}});
          await tx.bookingSlot.deleteMany({where:{booking:{court_id:court.id}}});
          await tx.booking.deleteMany({where:{court_id:court.id,customer_id:user.id}});
          await tx.court.delete({where:{id:court.id}});
        }
        if(facility){await tx.priceRule.deleteMany({where:{facility_id:facility.id}});await tx.facility.delete({where:{id:facility.id}});}
        if(user){await tx.ownerProfile.deleteMany({where:{user_id:user.id}});await tx.ownerRequest.deleteMany({where:{user_id:user.id}});await tx.user.delete({where:{id:user.id}});}
      },{maxWait:20000,timeout:30000});
      assert.equal(await prisma.user.count({where:{email_normalized:email}}),0);
      if(court){assert.equal(await prisma.court.count({where:{id:court.id}}),0);assert.equal(await prisma.booking.count({where:{court_id:court.id}}),0);assert.equal(await prisma.courtSlotLock.count({where:{court_id:court.id}}),0);}
      console.log('AVAILABILITY FIXTURE CLEANUP: PASS');
    } finally {await prisma.$disconnect();}
  }
});
