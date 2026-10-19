import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';

test('Public Facility guest HTTP/PostgreSQL and scoped fixture cleanup', { timeout: 600000 }, async t => {
  const tag = `public-${randomUUID()}`, email = `${tag}@example.invalid`, created_at = new Date();
  const time = value => new Date(`1970-01-01T${value}:00.000Z`);
  let server, user, a, b;
  const fixtureIds = [], amenityIds = [];
  const storage = { url: id => `https://images.example.invalid/${id}`,
    upload() { throw new Error('REAL_UPLOAD_FORBIDDEN'); }, destroy() { throw new Error('REAL_DELETE_FORBIDDEN'); } };
  const config = { nodeEnv: 'development', frontendUrl: 'http://localhost:5173' };
  async function check(name, fn) { await t.test(name, fn); }
  try {
    user = await prisma.user.create({ data: { email, email_normalized: email, full_name: tag, role: 'CUSTOMER', status: 'ACTIVE', google_subject: tag, created_at } });
    const approval = await prisma.ownerRequest.create({ data: { user_id: user.id, status: 'APPROVED', applicant_name_snapshot: tag, applicant_email_snapshot: email, reviewed_by: user.id, reviewed_at: created_at, created_at } });
    await prisma.ownerProfile.create({ data: { user_id: user.id, approved_request_id: approval.id, created_at } });
    async function facility(state, suffix) {
      const r = await prisma.facility.create({ data: { owner_id: user.id, name: `${tag} ${suffix}`, address: 'Fixture only', district: 'Phường Hải Châu', phone: '0123456789',
        opening_time: time('06:00'), closing_time: time('22:00'), status: state, rejection_reason: state === 'REJECTED' ? 'Fixture' : null,
        suspension_reason: state === 'SUSPENDED' ? 'Fixture' : null, created_at } }); fixtureIds.push(r.id); return r;
    }
    a = await facility('ACTIVE', 'Cà phê %_\\'); b = await facility('ACTIVE', 'Empty');
    const hidden = [];
    for (const state of ['DRAFT', 'PENDING', 'REJECTED', 'SUSPENDED']) hidden.push(await facility(state, state));
    server = createApp(prisma, config, undefined, undefined, undefined, storage).listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    async function get(path) {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { signal: AbortSignal.timeout(60000) });
      return { status: r.status, body: await r.json(), cache: r.headers.get('cache-control') };
    }
    const list = query => get(`/facilities?${new URLSearchParams({ q: tag, ...query })}`);
    await check('Guest visibility, pagination/defaults/order and non-public 404', async () => {
      const r = await list({}); assert.equal(r.status, 200); assert.equal(r.cache, 'no-store');
      assert.equal(r.body.meta.total, 2); assert.equal(r.body.meta.page, 1); assert.equal(r.body.meta.page_size, 20);
      assert.deepEqual(r.body.data.map(v => v.id), [String(a.id), String(b.id)]);
      assert.deepEqual((await list({ page: '2', page_size: '1' })).body.data.map(v => v.id), [String(b.id)]);
      assert.deepEqual((await list({ page: '3', page_size: '1' })).body.data, []);
      assert.deepEqual(Object.keys(r.body.data[0]).sort(), ['id', 'name', 'district', 'address', 'cover_image_url', 'amenities'].sort());
      assert.equal(r.body.data[0].cover_image_url, null);
      for (const f of hidden) assert.equal((await get(`/facilities/${f.id}`)).status, 404);
      assert.equal((await get('/facilities/9223372036854775807')).status, 404);
    });
    await check('Owner LOCKED hides list/count/detail; unlock fixture restores visibility', async () => {
      try {
        await prisma.user.update({ where: { id: user.id }, data: { status: 'LOCKED', locked_at: new Date(), locked_reason: 'Fixture' } });
        const r = await list({}); assert.equal(r.body.meta.total, 0); assert.deepEqual(r.body.data, []);
        assert.equal((await get(`/facilities/${a.id}`)).status, 404);
      } finally { await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', locked_at: null, locked_reason: null } }); }
    });
    await check('Empty public facility detail independent of bank/price/courts', async () => {
      const r = await get(`/facilities/${b.id}`); assert.equal(r.status, 200);
      for (const key of ['gallery', 'amenities', 'courts', 'price_rules']) assert.deepEqual(r.body.data[key], []);
      assert.equal(r.body.data.cancellation_policy, null);
      assert.equal(r.body.data.latitude, null); assert.equal(r.body.data.opening_time, '06:00');
    });
    const courts = [];
    for (const [name, status] of [[`${tag}-needle`, 'ACTIVE'], [`${tag}-needle2`, 'ACTIVE'], [`${tag}-hiddenCourt`, 'INACTIVE']])
      courts.push(await prisma.court.create({ data: { facility_id: a.id, name, status, created_at } }));
    await check('Search Facility/ACTIVE Court, deduplication, case/NFC/accent and literal wildcard', async () => {
      for (const q of [` ${tag.toUpperCase()} Ca\u0300 phe\u0302 `, `${tag}-NEEDLE`, `${tag} Cà phê %_\\`]) {
        const r = await list({ q }); assert.equal(r.status, 200); assert.deepEqual(r.body.data.map(v => v.id), [String(a.id)]);
      }
      for (const q of [`${tag}-hiddenCourt`, `${tag} Ca phe`, `${tag} Cà phê X_\\`]) assert.equal((await list({ q })).body.meta.total, 0);
      const blank = await list({ q: '  ', page_size: '100' }); assert.equal(blank.status, 200);
    });
    await check('District normalization and invalid/unsupported/malformed query contracts', async () => {
      assert.equal((await list({ district: ' Phường Hải Châu '.normalize('NFD') })).body.meta.total, 2);
      assert.equal((await list({ district: 'Xã Hòa Vang' })).body.meta.total, 0);
      assert.equal((await list({ district: 'unknown' })).body.error.code, 'INVALID_DISTRICT');
      for (const key of ['sort', 'min_price', 'max_price', 'min_rating', 'amenity_ids']) {
        const r = await list({ [key]: '' }); assert.equal(r.status, 422); assert.equal(r.body.error.code, 'FILTER_NOT_CONFIGURED');
      }
      for (const query of [{ date: '' }, { date: '2030-01-01', start_time: '18:00' }]) {
        const r = await list(query); assert.equal(r.status, 422); assert.equal(r.body.error.code, 'INVALID_SEARCH_RANGE');
      }
      for (const path of ['/facilities?q=a&q=b', '/facilities?district=a&district=b', '/facilities?page=0', '/facilities?page_size=101', '/facilities?unknown=1', '/facilities/0', `/facilities/${a.id}?q=x`])
        assert.equal((await get(path)).status, 422);
    });
    const expectedImages = [];
    for (const order of [2, 0, 0]) {
      const image = await prisma.facilityImage.create({ data: { facility_id: a.id, image_path: `${tag}/image-${expectedImages.length}`, sort_order: order, created_at } });
      expectedImages.push(image);
    }
    expectedImages.sort((x, y) => x.sort_order - y.sort_order || Number(x.id - y.id));
    for (const [name, is_active] of [[`${tag}-Z`, true], [`${tag}-A`, true], [`${tag}-hidden`, false]]) {
      const v = await prisma.amenity.create({ data: { name, is_active, created_at } }); amenityIds.push(v.id);
      await prisma.facilityAmenity.create({ data: { facility_id: a.id, amenity_id: v.id, created_at } });
    }
    for (const [start, end, rate] of [['16:00', '22:00', '120000'], ['06:00', '16:00', '80000']])
      await prisma.priceRule.create({ data: { facility_id: a.id, start_time: time(start), end_time: time(end), hourly_rate: rate, created_at } });
    await check('Interval search returns matching Courts without changing normal list DTO', async () => {
      const [{ day }] = await prisma.$queryRaw`SELECT to_char((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, 'YYYY-MM-DD') AS day`;
      const searched = await list({ date: day, start_time: '18:00', end_time: '19:00' });
      assert.equal(searched.status, 200); assert.equal(searched.body.meta.total, 1);
      assert.deepEqual(searched.body.data[0].matching_courts, courts.slice(0, 2).map(court => ({ id: String(court.id), name: court.name })));
      const normal = await list({}); assert.ok(!Object.hasOwn(normal.body.data[0], 'matching_courts'));
    });
    await prisma.cancellationPolicy.create({ data: { facility_id: a.id, cutoff_hours: 2, created_at } });
    await prisma.bankAccount.create({ data: { facility_id: a.id, bank_name: 'PRIVATE_FIXTURE_BANK', account_number: '123', account_holder: 'PRIVATE_FIXTURE_HOLDER', created_at } });
    await check('Gallery/cover tie-break, active relations, prices, policy and strict DTO security', async () => {
      const r = await get(`/facilities/${a.id}`); assert.equal(r.status, 200); const d = r.body.data;
      assert.deepEqual(Object.keys(d).sort(), ['id','name','district','address','phone','description','opening_time','closing_time','latitude','longitude','gallery','amenities','courts','price_rules','cancellation_policy'].sort());
      assert.deepEqual(d.gallery, expectedImages.map(v => storage.url(v.image_path)));
      assert.deepEqual(d.amenities, [{ id: String(amenityIds[1]), name: `${tag}-A` }, { id: String(amenityIds[0]), name: `${tag}-Z` }]);
      assert.deepEqual(d.courts, courts.slice(0, 2).map(v => ({ id: String(v.id), name: v.name, description: null })));
      assert.deepEqual(d.price_rules.map(v => [v.start_time,v.end_time,v.hourly_rate]), [['06:00','16:00','80000'],['16:00','22:00','120000']]);
      for (const v of d.price_rules) assert.deepEqual(Object.keys(v).sort(), ['id','start_time','end_time','hourly_rate'].sort());
      assert.deepEqual(d.cancellation_policy, { cutoff_hours: 2 });
      const card = (await list({})).body.data[0]; assert.equal(card.cover_image_url, d.gallery[0]); assert.deepEqual(card.amenities, d.amenities);
      for (const forbidden of ['owner_id','reviewed_by','rejection_reason','suspension_reason','image_path','public_id','bank_account','booking_ready','PRIVATE_FIXTURE_BANK',email])
        assert.ok(!JSON.stringify(r.body).includes(forbidden));
    });
    await check('Health remains HTTP 200', async () => {
      const r = await get('/health'); assert.equal(r.status, 200); assert.deepEqual(r.body, { success: true, message: 'API is running' });
    });
  } finally {
    if (server) await new Promise(r => server.close(r));
    try {
      await prisma.$transaction(async tx => {
        const where = { facility_id: { in: fixtureIds } };
        for (const model of ['facilityImage','facilityAmenity','priceRule','cancellationPolicy','bankAccount','court']) await tx[model].deleteMany({ where });
        await tx.facility.deleteMany({ where: { id: { in: fixtureIds } } });
        await tx.amenity.deleteMany({ where: { id: { in: amenityIds } } });
        if (user) {
          await tx.ownerProfile.deleteMany({ where: { user_id: user.id } });
          await tx.ownerRequest.deleteMany({ where: { user_id: user.id } });
          await tx.user.deleteMany({ where: { id: user.id, email_normalized: email } });
        }
      }, { maxWait: 20000, timeout: 30000 });
      assert.equal(await prisma.user.count({ where: { email_normalized: email } }), 0);
      assert.equal(await prisma.facility.count({ where: { id: { in: fixtureIds } } }), 0);
      assert.equal(await prisma.amenity.count({ where: { id: { in: amenityIds } } }), 0);
      console.log('PUBLIC FACILITY FIXTURE CLEANUP: PASS');
    } finally { await prisma.$disconnect(); }
  }
});
