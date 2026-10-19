import { AuthError } from '../../auth/errors.js';
import { buildSlots, invalidDate, timezone } from './slots.js';

const asDate = value => value instanceof Date ? value : new Date(value);
const booking = value => ({ ...value, id: BigInt(value.id), court_id: BigInt(value.court_id),
  booking_flow_version: Number(value.booking_flow_version ?? 1),
  start_at: asDate(value.start_at), end_at: asDate(value.end_at), expires_at: asDate(value.expires_at),
  confirmation_expires_at: value.confirmation_expires_at == null ? null : asDate(value.confirmation_expires_at) });
const ruleTime = value => new Date(`1970-01-01T${value}Z`);
const rule = value => ({ ...value, start_time: ruleTime(value.start_time), end_time: ruleTime(value.end_time) });
const block = value => ({ start_at: asDate(value.start_at), end_at: asDate(value.end_at) });

export function createAvailabilityService(db) {
  return {
    async read(courtId, date) {
        const [row] = await db.$queryRaw`
          WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS now),
          snapshot AS MATERIALIZED (
            SELECT now,
              to_char(now AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS today,
              (${date}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day_start,
              ((${date}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day_end
            FROM moment
          ), visible AS MATERIALIZED (
            SELECT c.id, c.facility_id, f.opening_time, f.closing_time
            FROM courts c JOIN facilities f ON f.id = c.facility_id JOIN users u ON u.id = f.owner_id
            WHERE c.id = ${courtId} AND c.status = 'ACTIVE' AND f.status = 'ACTIVE' AND u.status = 'ACTIVE'
          )
          SELECT s.now, s.today, s.day_start, s.day_end, v.id AS court_id, v.facility_id,
            v.opening_time, v.closing_time,
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'start_time', to_char(pr.start_time, 'HH24:MI:SS.MS'),
              'end_time', to_char(pr.end_time, 'HH24:MI:SS.MS'),
              'hourly_rate', pr.hourly_rate::text)) FROM price_rules pr WHERE pr.facility_id = v.facility_id), '[]'::jsonb) AS rules,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('start_at', cb.start_at, 'end_at', cb.end_at))
              FROM court_blocks cb WHERE cb.court_id = v.id AND cb.start_at < s.day_end AND cb.end_at > s.day_start), '[]'::jsonb) AS blocks,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id::text, 'court_id', b.court_id::text,
              'start_at', b.start_at, 'end_at', b.end_at, 'status', b.status,
              'booking_flow_version', b.booking_flow_version, 'expires_at', b.expires_at,
              'confirmation_expires_at', b.confirmation_expires_at))
              FROM bookings b WHERE b.court_id = v.id AND b.start_at < s.day_end AND b.end_at > s.day_start), '[]'::jsonb) AS bookings,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', lb.id::text, 'court_id', lb.court_id::text,
              'start_at', lb.start_at, 'end_at', lb.end_at, 'status', lb.status,
              'booking_flow_version', lb.booking_flow_version, 'expires_at', lb.expires_at,
              'confirmation_expires_at', lb.confirmation_expires_at))
              FROM court_slot_locks l JOIN booking_slots bs ON bs.id = l.booking_slot_id JOIN bookings lb ON lb.id = bs.booking_id
              WHERE l.court_id = v.id AND l.start_at >= s.day_start AND l.start_at < s.day_end), '[]'::jsonb) AS locked_bookings
          FROM snapshot s LEFT JOIN visible v ON true`;
        if (date < row.today) throw invalidDate();
        if (!row.court_id) throw new AuthError(404, 'RESOURCE_NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y sÃ¢n.');
        const occupancy = new Map(row.bookings.map(value => { const item = booking(value); return [String(item.id), item]; }));
        for (const value of row.locked_bookings) {
          const item = booking(value);
          if (item.court_id === courtId && !occupancy.has(String(item.id))) occupancy.set(String(item.id), item);
        }
        const slots = buildSlots({
          facility: { opening_time: row.opening_time, closing_time: row.closing_time },
          rules: row.rules.map(rule), blocks: row.blocks.map(block), bookings: [...occupancy.values()],
          dayStart: row.day_start, now: row.now,
        });
        return { data: { court_id: String(courtId), date, timezone, slot_minutes: 30, slots }, meta: { server_time: row.now.toISOString() } };
    },
  };
}
