import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '../src/config/prisma.js';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/service.js';
import { createOwnerRequestService } from '../src/modules/users/owner-requests/service.js';
import { createPresentationService } from '../src/modules/facilities/presentation/service.js';
import { createFacilityService } from '../src/modules/facilities/service.js';
import { bootstrapAdmin } from '../scripts/admin-bootstrap-service.js';

const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#16834f' } }).png().toBuffer();
test('Facility Presentation HTTP/PostgreSQL, storage failures, concurrency and cleanup', { timeout: 900000 }, async t => {
  const tag = randomUUID(), emails = ['a', 'b', 'admin', 'customer'].map(x => `presentation-${tag}-${x}@example.invalid`);
  const password = 'Test1' + randomBytes(20).toString('hex'), sessions = [], assets = new Set(), logs = [], destroyed = [];
  const setup = new Proxy(prisma, { get(target, key) { return key === '$transaction' ? (fn, opts) => target.$transaction(fn, { maxWait: 20000, timeout: 30000, ...opts }) : target[key]; } });
  const auth = createAuthService(setup), requests = createOwnerRequestService(setup), facilityService = createFacilityService(prisma);
  let beforeUpload, destroyFails = false, storageUnavailable = false, server;
  const storage = {
    ready() { if (storageUnavailable) throw Object.assign(new Error('Not configured'), { status: 503, code: 'IMAGE_STORAGE_NOT_CONFIGURED' }); },
    url: id => `https://images.example.invalid/${id}`,
    async upload(_buffer, id) { if (beforeUpload) await beforeUpload(); assets.add(id); return id; },
    async destroy(id) { destroyed.push(id); if (destroyFails) throw { http_code: 503, message: 'DO_NOT_LOG_THIS' }; assets.delete(id); },
  };
  const logger = { error: value => logs.push(value) }, service = createPresentationService(prisma, storage, logger);
  const config = { nodeEnv: 'development', frontendUrl: 'http://localhost:5173' };
  let a, b, actors, amenity;
  const check = (name, fn) => t.test(name, async () => { try { await fn(); } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; throw new Error('PRESENTATION_CASE_FAILED: ' + (/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'UNEXPECTED_ERROR')); } });
  try {
    for (let i = 0; i < emails.length; i++) {
      const input = { email: emails[i], password, full_name: 'Presentation fixture' };
      if (i === 2) await bootstrapAdmin(setup, input); else await auth.register(input);
      sessions.push(await auth.login({ email: emails[i], password }));
    }
    for (const i of [0, 1]) {
      const r = await requests.create(await auth.session(sessions[i].token));
      await requests.decide(await auth.session(sessions[2].token), BigInt(r.id), true);
      sessions[i] = await auth.login({ email: emails[i], password });
    }
    actors = await Promise.all(sessions.map(s => auth.session(s.token)));
    server = createApp(prisma, config, undefined, undefined, undefined, storage, logger).listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    async function req(path, who = 0, method = 'GET', body, headers = {}) {
      const s = sessions[who], form = body instanceof FormData;
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method,
        headers: { Origin: config.frontendUrl, ...(s ? { Cookie: `booking_session=${s.token}`, 'X-CSRF-Token': s.csrf_token } : {}), ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : form ? body : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
      const text = await res.text(); assert.ok(!text.includes('password_hash') && !text.includes('token_hash'));
      return { status: res.status, data: res.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : null };
    }
    const path = (id, kind = 'images') => `/owner/facilities/${id}/${kind}`;
    const form = (buffer = png, type = 'image/png') => { const f = new FormData(); f.append('image', new Blob([buffer], { type }), 'fixture.png'); return f; };
    async function facility(who = 0) {
      const r = await req('/owner/facilities', who, 'POST', { name: 'Presentation fixture', address: 'Fixture', district: 'Phường Hải Châu', phone: '0123456789', opening_time: '06:00', closing_time: '22:00' });
      assert.equal(r.status, 201); return r.data.data.id;
    }
    a = await facility(); b = await facility(1);
    await check('Owner/Admin catalogs, defaults, normalization, duplicate and inactive visibility', async () => {
      let r = await req('/admin/amenities', 2, 'POST', { name: `  ${tag} Ca\u0300 phe\u0302  ` }); assert.equal(r.status, 201);
      amenity = r.data.data; assert.equal(amenity.name, `${tag} Cà phê`); assert.equal(amenity.is_active, true);
      assert.equal((await req('/admin/amenities', 2, 'POST', { name: amenity.name })).status, 409);
      for (const body of [{ name: '' }, { name: 'a'.repeat(101) }, { name: 'x', is_active: false }]) assert.equal((await req('/admin/amenities', 2, 'POST', body)).status, 422);
      assert.equal((await req(`/admin/amenities/${amenity.id}`, 2, 'PATCH', { is_active: 'false' })).status, 422);
      r = await req('/owner/amenities'); assert.equal(r.status, 200); assert.ok(r.data.data.some(v => v.id === amenity.id));
      assert.equal((await req('/owner/amenities?page=1')).status, 422);
      r = await req('/admin/amenities?page=1&page_size=1', 2); assert.equal(r.status, 200); assert.equal(r.data.meta.page_size, 1);
      r = await req('/admin/amenities', 2, 'POST', { name: `${tag} Rename source` }); assert.equal(r.status, 201);
      const renamedId = r.data.data.id;
      r = await req(`/admin/amenities/${renamedId}`, 2, 'PATCH', { name: `${tag} Renamed` }); assert.equal(r.status, 200); assert.equal(r.data.data.name, `${tag} Renamed`);
      assert.equal((await req(`/admin/amenities/${renamedId}`, 2, 'PATCH', { name: amenity.name })).status, 409);
      const concurrentName = `${tag} Concurrent`;
      const concurrent = await Promise.all([
        req('/admin/amenities', 2, 'POST', { name: concurrentName }),
        req('/admin/amenities', 2, 'POST', { name: concurrentName }),
      ]);
      assert.deepEqual(concurrent.map(value => value.status).sort(), [201, 409]);
      r = await req('/admin/amenities?page=1&page_size=100', 2); assert.equal(r.status, 200);
      for (let i = 1; i < r.data.data.length; i++) {
        const previous = r.data.data[i - 1], current = r.data.data[i];
        const previousTime = Date.parse(previous.created_at), currentTime = Date.parse(current.created_at);
        assert.ok(previousTime > currentTime || (previousTime === currentTime && BigInt(previous.id) > BigInt(current.id)));
      }
      for (const who of [0, 1, 3]) assert.equal((await req('/admin/amenities', who)).status, 403);
      for (const who of [2, 3]) assert.equal((await req('/owner/amenities', who)).status, 403);
      assert.equal((await req('/owner/amenities', -1)).status, 401);
    });
    await check('Atomic amenities replace, empty, invalid IDs, deactivate retains existing assignment', async () => {
      const url = path(a, 'amenities');
      assert.deepEqual((await req(url)).data.data, []);
      assert.equal((await req(url, 0, 'PUT', { amenity_ids: [amenity.id] })).status, 200);
      for (const ids of [[amenity.id, amenity.id], ['9223372036854775807'], [0]]) assert.equal((await req(url, 0, 'PUT', { amenity_ids: ids })).status, 422);
      assert.equal((await req(url)).data.data.length, 1);
      assert.equal((await req(`/admin/amenities/${amenity.id}`, 2, 'PATCH', { is_active: false })).status, 200);
      assert.equal((await req(url)).data.data[0].is_active, false);
      assert.ok(!(await req('/owner/amenities')).data.data.some(v => v.id === amenity.id));
      assert.equal((await req(url, 0, 'PUT', { amenity_ids: [amenity.id] })).status, 422);
      assert.equal((await req(url)).data.data.length, 1);
      assert.equal((await req(url, 0, 'PUT', { amenity_ids: [] })).status, 200);
      assert.deepEqual((await req(url)).data.data, []);
      assert.equal((await req(`/admin/amenities/${amenity.id}`, 2, 'PATCH', { is_active: true })).status, 200);
    });
    await check('Route ownership, Origin/CSRF, input protection and no out-of-scope API', async () => {
      for (const kind of ['images', 'amenities']) {
        assert.equal((await req(path(a, kind), 1)).status, 404); assert.equal((await req(path(a, kind), -1)).status, 401);
        assert.equal((await req(path(a, kind), 2)).status, 403); assert.equal((await req(path(a, kind), 3)).status, 403);
      }
      assert.equal((await req(path(b), 0, 'POST', form())).status, 404);
      for (const h of [{ Origin: 'https://evil.invalid' }, { 'X-CSRF-Token': '' }]) {
        assert.equal((await req(path(a), 0, 'POST', form(), h)).status, 403);
        assert.equal((await req(path(a, 'amenities'), 0, 'PUT', { amenity_ids: [] }, h)).status, 403);
        assert.equal((await req('/admin/amenities', 2, 'POST', { name: 'x' }, h)).status, 403);
      }
      assert.equal((await req('/amenities')).status, 404);
      assert.equal((await req(`/facilities/${a}/images`)).status, 404);
      assert.equal((await req(path(a), 0, 'POST', form(Buffer.from('<svg/>')))).status, 415);
      assert.equal((await req(path(a), 0, 'POST', form(png, 'image/jpeg'))).status, 415);
      assert.equal((await req(path(a), 0, 'POST', form(Buffer.alloc(5_000_001)))).status, 413);
      const injected = form(); injected.append('public_id', 'evil'); assert.equal((await req(path(a), 0, 'POST', injected)).status, 422);
    });
    await check('Upload/list/reorder/delete cover, public_id persistence and continuous order', async () => {
      for (let i = 0; i < 3; i++) assert.equal((await req(path(a), 0, 'POST', form())).status, 201);
      let r = await req(path(a)), ids = r.data.data.map(v => v.id); assert.deepEqual(r.data.data.map(v => v.sort_order), [0, 1, 2]);
      const stored = await prisma.facilityImage.findMany({ where: { facility_id: BigInt(a) } }); assert.ok(stored.every(v => v.image_path.startsWith(`facility-images/${a}/`) && !v.image_path.includes('https:')));
      assert.equal((await req(path(a, 'images/order'), 0, 'PUT', { image_ids: ids.slice(1) })).status, 422);
      assert.equal((await req(path(a, 'images/order'), 0, 'PUT', { image_ids: [ids[0], ids[0], ids[1]] })).status, 422);
      r = await req(path(a, 'images/order'), 0, 'PUT', { image_ids: [...ids].reverse() }); assert.equal(r.status, 200); assert.equal(r.data.data[0].id, ids[2]);
      assert.equal((await req(path(b, `images/${ids[2]}`), 1, 'DELETE')).status, 404);
      assert.equal((await req(path(a, `images/${ids[2]}`), 0, 'DELETE')).status, 204);
      r = await req(path(a)); assert.equal(r.data.data[0].id, ids[1]); assert.deepEqual(r.data.data.map(v => v.sort_order), [0, 1]);
      assert.ok(!assets.has(stored.find(v => String(v.id) === ids[2]).image_path));
    });
    await check('Five-state matrix for presentation leaves all Facility metadata unchanged', async () => {
      const f = await facility();
      for (const state of ['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']) {
        // Only the UUID-owned fixture is updated to exercise each permitted state.
        await prisma.facility.update({ where: { id: BigInt(f) }, data: { status: state,
          rejection_reason: state === 'REJECTED' ? 'Fixture rejection' : null,
          suspension_reason: state === 'SUSPENDED' ? 'Fixture suspension' : null } });
        const before = await prisma.facility.findUnique({ where: { id: BigInt(f) } });
        assert.equal((await req(path(f))).status, 200); assert.equal((await req(path(f, 'amenities'))).status, 200);
        assert.equal((await req(path(f), 0, 'POST', form())).status, state === 'PENDING' ? 409 : 201);
        assert.equal((await req(path(f, 'amenities'), 0, 'PUT', { amenity_ids: [amenity.id] })).status, state === 'PENDING' ? 409 : 200);
        const images = (await req(path(f))).data.data;
        assert.equal((await req(path(f, 'images/order'), 0, 'PUT', { image_ids: images.map(v => v.id) })).status, state === 'PENDING' ? 409 : 200);
        if (images.length) assert.equal((await req(path(f, `images/${images[0].id}`), 0, 'DELETE')).status, state === 'PENDING' ? 409 : 204);
        assert.deepEqual(await prisma.facility.findUnique({ where: { id: BigInt(f) } }), before);
      }
    });
    await check('Concurrent uploads stop at ten; loser object destroyed', async () => {
      const f = BigInt(await facility());
      for (let i = 0; i < 9; i++) await service.upload(actors[0], f, png);
      let arrived = 0, release; const barrier = new Promise(r => { release = r; });
      beforeUpload = async () => { if (++arrived === 2) release(); await barrier; };
      const results = await Promise.allSettled([service.upload(actors[0], f, png), service.upload(actors[0], f, png)]); beforeUpload = undefined;
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.code, 'IMAGE_LIMIT_REACHED');
      const records = await prisma.facilityImage.findMany({ where: { facility_id: f }, orderBy: { sort_order: 'asc' } });
      assert.deepEqual(records.map(v => v.sort_order), Array.from({ length: 10 }, (_, i) => i));
      assert.equal([...assets].filter(id => id.startsWith(`facility-images/${f}/`)).length, 10);
    });
    await check('Submit during external upload wins without locks held across network', async () => {
      const f = BigInt(await facility());
      beforeUpload = async () => { await facilityService.transition(actors[0], f, 'submit'); };
      await assert.rejects(service.upload(actors[0], f, png), { code: 'FACILITY_STATE_NOT_EDITABLE' }); beforeUpload = undefined;
      assert.equal(await prisma.facilityImage.count({ where: { facility_id: f } }), 0);
      assert.equal([...assets].filter(v => v.startsWith(`facility-images/${f}/`)).length, 0);
    });
    await check('Failed DB insert preserves original error even when cleanup fails; safe manual log', async () => {
      const f = BigInt(await facility());
      const broken = new Proxy(prisma, { get(target, key) { return key === '$transaction' ? (fn, opts) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, prop) { return prop === 'facilityImage' ? new Proxy(inner.facilityImage, { get(model, method) { return method === 'create' ? () => { throw Object.assign(new Error('Injected'), { code: 'INJECTED_DB_FAILURE' }); } : model[method]; } }) : inner[prop]; } })), opts) : target[key]; } });
      destroyFails = true;
      await assert.rejects(createPresentationService(broken, storage, logger).upload(actors[0], f, png), { code: 'INJECTED_DB_FAILURE' }); destroyFails = false;
      assert.equal(await prisma.facilityImage.count({ where: { facility_id: f } }), 0);
      assert.deepEqual(Object.keys(logs.at(-1)).sort(), ['code', 'public_id']); assert.equal(logs.at(-1).code, 'HTTP_503'); assert.ok(!JSON.stringify(logs).includes('DO_NOT_LOG_THIS'));
      await storage.destroy(logs.at(-1).public_id);
    });
    await check('Delete storage failure retains committed deletion, logs orphan; DB failure never destroys', async () => {
      const f = BigInt(await facility()), created = await service.upload(actors[0], f, png);
      destroyFails = true; await service.deleteImage(actors[0], f, BigInt(created.id)); destroyFails = false;
      assert.equal(await prisma.facilityImage.count({ where: { facility_id: f } }), 0); await storage.destroy(logs.at(-1).public_id);
      const other = await service.upload(actors[0], f, png), count = destroyed.length;
      await prisma.facility.update({ where: { id: f }, data: { status: 'PENDING' } });
      await assert.rejects(service.deleteImage(actors[0], f, BigInt(other.id)), { code: 'FACILITY_STATE_NOT_EDITABLE' });
      assert.equal(destroyed.length, count); assert.equal(await prisma.facilityImage.count({ where: { facility_id: f } }), 1);
    });
    await check('Concurrent reorder/delete and assignment/deactivate serialize without partial data', async () => {
      const f = BigInt(await facility()), first = await service.upload(actors[0], f, png), second = await service.upload(actors[0], f, png);
      const results = await Promise.allSettled([service.reorder(actors[0], f, [BigInt(second.id), BigInt(first.id)]), service.deleteImage(actors[0], f, BigInt(first.id))]);
      assert.equal(results[1].status, 'fulfilled'); if (results[0].status === 'rejected') assert.equal(results[0].reason.status, 404);
      const remaining = await service.listImages(actors[0], f); assert.equal(remaining.length, 1); assert.equal(remaining[0].sort_order, 0);
      const assigned = await Promise.allSettled([service.replaceAmenities(actors[0], f, [BigInt(amenity.id)]), service.saveAmenity(actors[2], BigInt(amenity.id), { is_active: false })]);
      assert.equal(assigned[1].status, 'fulfilled'); if (assigned[0].status === 'rejected') assert.equal(assigned[0].reason.status, 422);
      const links = await service.readAmenities(actors[0], f); assert.ok(links.length <= 1); if (links.length) assert.equal(links[0].is_active, false);
      await service.saveAmenity(actors[2], BigInt(amenity.id), { is_active: true });
      await Promise.all([service.replaceAmenities(actors[0], f, []), service.replaceAmenities(actors[0], f, [BigInt(amenity.id)])]);
      assert.ok((await service.readAmenities(actors[0], f)).length <= 1);
    });
    await check('Session rechecked after upload and health remains 200', async () => {
      const f = BigInt(await facility());
      beforeUpload = async () => { await auth.logout(actors[0]); };
      await assert.rejects(service.upload(actors[0], f, png), { status: 401 }); beforeUpload = undefined;
      assert.equal(await prisma.facilityImage.count({ where: { facility_id: f } }), 0);
      const health = await req('/health', -1); assert.equal(health.status, 200); assert.deepEqual(health.data, { success: true, message: 'API is running' });
    });
  } catch (error) { throw new Error('PRESENTATION_SETUP_FAILED: ' + (/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'CHECK_FAILED')); }
  finally {
    beforeUpload = undefined; destroyFails = false;
    if (server?.listening) await new Promise(r => server.close(r));
    try {
      const users = await prisma.user.findMany({ where: { email_normalized: { in: emails } }, select: { id: true } }), ids = users.map(v => v.id);
      const facilities = await prisma.facility.findMany({ where: { owner_id: { in: ids } }, select: { id: true } }), fids = facilities.map(v => v.id);
      await prisma.$transaction(async tx => {
        await tx.facilityImage.deleteMany({ where: { facility_id: { in: fids } } });
        await tx.facilityAmenity.deleteMany({ where: { facility_id: { in: fids } } });
        await tx.amenity.deleteMany({ where: { name: { startsWith: tag } } });
        await tx.facility.deleteMany({ where: { id: { in: fids } } });
        await tx.authSession.deleteMany({ where: { user_id: { in: ids } } });
        await tx.ownerProfile.deleteMany({ where: { user_id: { in: ids } } });
        await tx.ownerRequest.deleteMany({ where: { user_id: { in: ids } } });
        await tx.user.deleteMany({ where: { id: { in: ids }, email_normalized: { in: emails } } });
      }, { maxWait: 20000, timeout: 30000 });
      for (const id of [...assets]) await storage.destroy(id);
      assert.equal(await prisma.user.count({ where: { email_normalized: { in: emails } } }), 0);
      assert.equal(await prisma.amenity.count({ where: { name: { startsWith: tag } } }), 0);
      assert.equal(await prisma.facilityImage.count({ where: { facility_id: { in: fids } } }), 0);
      assert.equal(await prisma.facilityAmenity.count({ where: { facility_id: { in: fids } } }), 0);
      assert.equal(await prisma.facility.count({ where: { id: { in: fids } } }), 0);
      assert.equal(assets.size, 0); console.log('PRESENTATION FIXTURE CLEANUP: PASS');
    } finally { await prisma.$disconnect(); }
  }
});
