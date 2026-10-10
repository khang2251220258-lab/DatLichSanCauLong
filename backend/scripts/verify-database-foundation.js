// Kiểm chứng foundation: metadata read-only; fixture chỉ trong transaction ROLLBACK.
// Không chạy tự động khi khởi động ứng dụng. Không dùng sequence cho fixture.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { getPostgresConfig } from '../src/config/database.js';

const sql = readFileSync(new URL('../prisma/migrations/20260922000000_init/migration.sql', import.meta.url), 'utf8');
const tables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(x => x[1]);
const client = new pg.Client(getPostgresConfig());
let transaction = false;
const check = (name, ok) => { console.log(`${name}: ${ok ? 'PASS' : 'FAIL'}`); if (!ok) throw { code: 'VERIFICATION_FAILED' }; };
const namesEqual = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const countRows = async () => {
  const counts = {};
  for (const table of tables) counts[table] = (await client.query(`SELECT count(*)::text AS n FROM public."${table}"`)).rows[0].n;
  return counts;
};
try {
  await client.connect();
  const actualTables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(x => x.tablename);
  check('24 business tables', tables.every(t => actualTables.includes(t)) && tables.length === 24);
  check('reports absent', !actualTables.includes('reports'));
  console.log('Verified tables:', tables.join(', '));
  const constraints = (await client.query(`SELECT c.conname, c.contype, c.convalidated, c.confdeltype, c.confupdtype,
    t.relname AS tablename, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname=ANY($1::text[])`, [tables])).rows;
  for (const [type, pattern, expected] of [
    ['p', /CONSTRAINT "([^"]+)" PRIMARY KEY/g, 24],
    ['f', /ADD CONSTRAINT "([^"]+)" FOREIGN KEY/g, 36],
    ['c', /ADD CONSTRAINT "([^"]+)" CHECK/g, 76],
  ]) {
    const actual = constraints.filter(c => c.contype === type);
    check(`${type} count/names/validated (${expected})`, actual.length === expected && actual.every(c => c.convalidated) && namesEqual(actual.map(c => c.conname), [...sql.matchAll(pattern)].map(x => x[1])));
  }
  check('All FK RESTRICT', constraints.filter(c => c.contype === 'f').every(c => c.confdeltype === 'r' && c.confupdtype === 'r'));
  for (const fk of sql.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \("([^"]+)"\) REFERENCES "([^"]+)"\("([^"]+)"\)/g)) {
    const actual = constraints.find(c => c.conname === fk[2]);
    check(`FK ${fk[2]}`, actual.tablename === fk[1] && actual.definition.replaceAll('"', '').includes(`FOREIGN KEY (${fk[3]}) REFERENCES ${fk[4]}(${fk[5]})`));
  }
  const indexes = (await client.query(`SELECT ci.relname AS name, i.indisprimary, i.indisunique, i.indisvalid,
    pg_get_expr(i.indpred,i.indrelid) AS predicate, pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_class ci ON ci.oid=i.indexrelid WHERE n.nspname='public' AND t.relname=ANY($1::text[])`, [tables])).rows;
  const nonpk = indexes.filter(i => !i.indisprimary);
  check('Index names/valid', namesEqual(nonpk.map(i => i.name), [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map(x => x[1])) && indexes.every(i => i.indisvalid));
  const counts = { pk: indexes.filter(i => i.indisprimary).length, unique: nonpk.filter(i => i.indisunique && !i.predicate).length, partial: nonpk.filter(i => i.indisunique && i.predicate).length, normal: nonpk.filter(i => !i.indisunique).length };
  console.log('Index counts:', JSON.stringify(counts));
  check('Index counts match', JSON.stringify(Object.values(counts)) === JSON.stringify([24,17,1,27]));
  const pending = indexes.find(i => i.name === 'owner_requests_one_pending_per_user');
  check('OwnerRequest partial unique', pending.indisunique && pending.definition.includes('(user_id)') && /status.*=.*'PENDING'/.test(pending.predicate));
  check('CourtSlotLock composite PK', constraints.find(c => c.conname === 'court_slot_locks_pkey').definition === 'PRIMARY KEY (court_id, start_at)');
  for (const [name, column] of [['court_slot_locks_booking_slot_id_key','booking_slot_id'],['refunds_booking_id_key','booking_id']]) check(name, indexes.some(i => i.name === name && i.indisunique && i.definition.includes(`(${column})`)));
  const migration = (await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations')).rows;
  check('Migration recorded and checksum', migration.length === 1 && migration[0].migration_name === '20260922000000_init' && !!migration[0].finished_at && !migration[0].rolled_back_at && migration[0].checksum === createHash('sha256').update(sql).digest('hex'));

  const before = await countRows();
  // Chỉ chạy fixture khi 24 bảng vừa khởi tạo đều rỗng; tránh đụng dữ liệu thật.
  check('Fixture safety: business tables empty', Object.values(before).every(n => n === '0'));
  await client.query('BEGIN'); transaction = true;
  await client.query("SET LOCAL statement_timeout = '10s'");
  const now = '2026-09-23T00:00:00Z';
  const insert = async (table, data) => {
    const row = { created_at: now, updated_at: now, ...data };
    const fields = Object.keys(row);
    await client.query(`INSERT INTO public."${table}" (${fields.map(f => `"${f}"`).join(',')}) VALUES (${fields.map((_,i) => `$${i+1}`).join(',')})`, Object.values(row));
  };
  const rejects = async (name, action, code, constraint) => {
    await client.query('SAVEPOINT negative_case');
    let error;
    try { await action(); } catch (e) { error = e; }
    await client.query('ROLLBACK TO SAVEPOINT negative_case');
    await client.query('RELEASE SAVEPOINT negative_case');
    check(name, error?.code === code && error?.constraint === constraint);
  };
  await insert('users', { id: 1, email: 'foundation@example.invalid', email_normalized: 'foundation@example.invalid', full_name: 'Fixture rollback', role: 'CUSTOMER', status: 'ACTIVE' });
  const request = { user_id: 1, status: 'PENDING', applicant_name_snapshot: 'Fixture', applicant_email_snapshot: 'foundation@example.invalid' };
  await insert('owner_requests', { ...request, id: 1, status: 'APPROVED', reviewed_by: 1, reviewed_at: now });
  await insert('owner_profiles', { user_id: 1, approved_request_id: 1 });
  await insert('facilities', { id: 1, owner_id: 1, name: 'Fixture', address: 'Fixture', district: 'Fixture', phone: '000', opening_time: '06:00', closing_time: '22:00', status: 'ACTIVE' });
  await insert('courts', { id: 1, facility_id: 1, name: 'Fixture', status: 'ACTIVE' });
  const booking = { customer_id: 1, court_id: 1, status: 'PENDING_PAYMENT', start_at: '2026-09-24T02:00:00Z', end_at: '2026-09-24T03:00:00Z', expires_at: '2026-09-23T00:05:00Z', total_amount: 100000, deposit_amount: 30000, remaining_amount: 70000, bank_name_snapshot: 'Fixture', account_number_snapshot: '0', account_holder_snapshot: 'Fixture', facility_name_snapshot: 'Fixture', facility_address_snapshot: 'Fixture', court_name_snapshot: 'Fixture' };
  await insert('bookings', { ...booking, id: 1 });
  for (const [name, change, constraint] of [
    ['Invalid Booking status', { status: 'INVALID' }, 'm02_bookings_status_check'],
    ['Negative booking money', { total_amount: -100000, deposit_amount: -30000, remaining_amount: -70000 }, 'm07_bookings_nonnegative_amounts_check'],
    ['Incorrect deposit', { deposit_amount: 20000, remaining_amount: 80000 }, 'm07_bookings_deposit_amount_check'],
    ['Incorrect remaining', { remaining_amount: 60000 }, 'm07_bookings_remaining_amount_check'],
  ]) await rejects(name, () => insert('bookings', { ...booking, id: 2, ...change }), '23514', constraint);
  const slot = { booking_id: 1, start_at: booking.start_at, end_at: '2026-09-24T02:30:00Z', hourly_rate_snapshot: 100000, slot_amount: 50000 };
  await insert('booking_slots', { ...slot, id: 1 });
  await rejects('Slot must be 30 minutes', () => insert('booking_slots', { ...slot, id: 2, end_at: booking.end_at }), '23514', 'm10_booking_slots_duration_check');
  await insert('bookings', { ...booking, id: 2 });
  await insert('booking_slots', { ...slot, id: 2, booking_id: 2 });
  await insert('court_slot_locks', { court_id: 1, start_at: slot.start_at, booking_slot_id: 1 });
  await rejects('Duplicate CourtSlotLock', () => insert('court_slot_locks', { court_id: 1, start_at: slot.start_at, booking_slot_id: 2 }), '23505', 'court_slot_locks_pkey');
  await rejects('Rating outside 1-5', () => insert('reviews', { id: 1, booking_id: 1, rating: 6, status: 'VISIBLE' }), '23514', 'm16_reviews_rating_check');
  const refund = { id: 1, booking_id: 1, amount: 30000, status: 'PENDING', reason: 'Fixture', requested_at: now };
  await rejects('Invalid Refund status', () => insert('refunds', { ...refund, status: 'INVALID' }), '23514', 'm02_refunds_status_check');
  await rejects('Negative Refund amount', () => insert('refunds', { ...refund, amount: -1 }), '23514', 'm15_refunds_amount_check');
  await insert('refunds', refund);
  await rejects('Duplicate Refund booking', () => insert('refunds', { ...refund, id: 2 }), '23505', 'refunds_booking_id_key');
  await rejects('Invalid OwnerRequest status', () => insert('owner_requests', { ...request, id: 2, status: 'INVALID' }), '23514', 'm02_owner_requests_status_check');
  for (const id of [2,3]) await insert('owner_requests', { ...request, id, status: 'REJECTED', reviewed_by: 1, reviewed_at: now, rejection_reason: 'Fixture' });
  await insert('owner_requests', { ...request, id: 4 });
  check('REJECTED + REJECTED + PENDING allowed', true);
  await rejects('Duplicate PENDING OwnerRequest', () => insert('owner_requests', { ...request, id: 5 }), '23505', 'owner_requests_one_pending_per_user');
  for (const table of ['password_reset_tokens','auth_sessions']) {
    const token = { id: 1, user_id: 1, token_hash: Buffer.alloc(31), expires_at: '2026-09-23T00:15:00Z', ...(table === 'auth_sessions' ? { csrf_token: 'x'.repeat(64) } : {}) };
    await rejects(`${table} hash length`, () => insert(table, token), '23514', `m03_${table}_token_hash_length_check`);
    await insert(table, { ...token, token_hash: Buffer.alloc(32) });
  }
  await client.query('ROLLBACK'); transaction = false;
  check('Rollback: all 24 row counts unchanged and zero', JSON.stringify(before) === JSON.stringify(await countRows()));
  console.log('DATABASE FOUNDATION VERIFIED: YES');
} catch (error) {
  console.error('Verification error code:', /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'VERIFICATION_ERROR');
  process.exitCode = 1;
} finally {
  if (transaction) { await client.query('ROLLBACK'); console.log('Rollback after failure: SUCCESS'); }
  await client.end();
}
