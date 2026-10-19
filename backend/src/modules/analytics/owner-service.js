import { Prisma } from '@prisma/client';
import { AuthError } from '../auth/errors.js';

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const notFound = () => new AuthError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy cơ sở.');
const facilityClause = input => input.facility_id === null
  ? Prisma.empty
  : Prisma.sql`AND f.id = ${input.facility_id}`;
const facilityExists = (ownerId, input) => input.facility_id === null
  ? Prisma.sql`TRUE`
  : Prisma.sql`EXISTS (SELECT 1 FROM facilities f WHERE f.id = ${input.facility_id} AND f.owner_id = ${ownerId})`;

export function overviewFactsSql(ownerId, input) {
  const scope = facilityClause(input);
  return Prisma.sql`
    WITH parameters AS MATERIALIZED (
      SELECT (${input.from}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AS from_utc,
             ((${input.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AS to_utc,
             ${facilityExists(ownerId, input)} AS facility_exists,
             clock_timestamp() AS server_time
    ), owned_bookings AS MATERIALIZED (
      SELECT b.*
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN facilities f ON f.id = c.facility_id
      CROSS JOIN parameters p
      WHERE f.owner_id = ${ownerId} ${scope}
        AND b.start_at >= p.from_utc AND b.start_at < p.to_utc
    ), confirmed_slots AS MATERIALIZED (
      SELECT bs.*, ob.start_at AS booking_start_at
      FROM booking_slots bs
      JOIN owned_bookings ob ON ob.id = bs.booking_id
      WHERE ob.status IN ('CONFIRMED', 'COMPLETED')
    ), months AS (
      SELECT generate_series(date_trunc('month', ${input.from}::date),
                             date_trunc('month', ${input.to}::date), interval '1 month')::date AS month
    ), month_values AS (
      SELECT date_trunc('month', ob.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS month,
             count(*) FILTER (WHERE ob.status IN ('CONFIRMED','COMPLETED'))::int AS confirmed_count,
             count(*) FILTER (WHERE ob.status = 'CANCELLED')::int AS cancelled_count,
             coalesce(sum(ob.total_amount) FILTER (WHERE ob.status IN ('CONFIRMED','COMPLETED')), 0)::text AS confirmed_value
      FROM owned_bookings ob GROUP BY 1
    ), weekday_values AS (
      SELECT extract(isodow FROM ob.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS weekday,
             count(*) FILTER (WHERE ob.status IN ('CONFIRMED','COMPLETED'))::int AS confirmed_count
      FROM owned_bookings ob GROUP BY 1
    )
    SELECT p.server_time, p.facility_exists,
      jsonb_build_object(
        'confirmed_booking_count', count(*) FILTER (WHERE ob.status IN ('CONFIRMED','COMPLETED'))::int,
        'completed_booking_count', count(*) FILTER (WHERE ob.status = 'COMPLETED')::int,
        'cancelled_booking_count', count(*) FILTER (WHERE ob.status = 'CANCELLED')::int,
        'confirmed_hours', ((SELECT count(*) FROM confirmed_slots) * 0.5)::numeric(20,1)::text,
        'confirmed_booking_value', coalesce(sum(ob.total_amount) FILTER (WHERE ob.status IN ('CONFIRMED','COMPLETED')), 0)::text,
        'confirmed_deposit_amount', coalesce(sum(ob.deposit_amount) FILTER (WHERE ob.confirmed_at IS NOT NULL AND ob.confirmed_by_user_id IS NOT NULL), 0)::text,
        'refunded_deposit_amount', coalesce(sum(r.amount) FILTER (WHERE r.status = 'REFUNDED'), 0)::text,
        'net_known_deposit_amount', (coalesce(sum(ob.deposit_amount) FILTER (WHERE ob.confirmed_at IS NOT NULL AND ob.confirmed_by_user_id IS NOT NULL), 0) - coalesce(sum(r.amount) FILTER (WHERE r.status = 'REFUNDED'), 0))::text
      ) AS summary,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'confirmed_count', coalesce(v.confirmed_count, 0),
        'cancelled_count', coalesce(v.cancelled_count, 0),
        'confirmed_booking_value', coalesce(v.confirmed_value, '0')
      ) ORDER BY m.month), '[]'::jsonb) FROM months m LEFT JOIN month_values v USING (month)) AS monthly_trend,
      (SELECT jsonb_agg(jsonb_build_object(
        'weekday', d.weekday,
        'confirmed_count', coalesce(v.confirmed_count, 0)
      ) ORDER BY d.weekday) FROM generate_series(1,7) d(weekday) LEFT JOIN weekday_values v USING (weekday)) AS weekday_bookings
    FROM parameters p
    LEFT JOIN owned_bookings ob ON TRUE
    LEFT JOIN refunds r ON r.booking_id = ob.id
    GROUP BY p.server_time, p.facility_exists`;
}

function capacityCtes(ownerId, input) {
  const scope = facilityClause(input);
  return Prisma.sql`
    parameters AS MATERIALIZED (
      SELECT ${input.from}::date AS from_date, ${input.to}::date AS to_date,
             ${facilityExists(ownerId, input)} AS facility_exists
    ), owned_courts AS MATERIALIZED (
      SELECT c.id AS court_id, c.name AS court_name, f.id AS facility_id, f.name AS facility_name,
             f.opening_time, f.closing_time
      FROM courts c JOIN facilities f ON f.id = c.facility_id
      WHERE f.owner_id = ${ownerId} ${scope} AND c.status = 'ACTIVE'
    ), dates AS (
      SELECT generate_series(p.from_date, p.to_date, interval '1 day')::date AS day FROM parameters p
    ), raw_slots AS MATERIALIZED (
      SELECT oc.*, d.day,
             slot.local_start,
             slot.local_start AT TIME ZONE 'Asia/Ho_Chi_Minh' AS start_at,
             (slot.local_start + interval '30 minutes') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS end_at
      FROM owned_courts oc CROSS JOIN dates d
      CROSS JOIN LATERAL generate_series(d.day + oc.opening_time,
        d.day + oc.closing_time - interval '30 minutes', interval '30 minutes') slot(local_start)
    ), confirmed_occupancy AS MATERIALIZED (
      SELECT DISTINCT b.court_id, bs.start_at, bs.end_at
      FROM booking_slots bs JOIN bookings b ON b.id = bs.booking_id
      JOIN owned_courts oc ON oc.court_id = b.court_id CROSS JOIN parameters p
      WHERE b.status IN ('CONFIRMED','COMPLETED')
        AND bs.start_at < ((p.to_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND bs.end_at > (p.from_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ), classified AS MATERIALIZED (
      SELECT rs.*,
        bool_or(cb.id IS NOT NULL) AS blocked,
        bool_or(co.court_id IS NOT NULL) AS occupied
      FROM raw_slots rs
      LEFT JOIN confirmed_occupancy co ON co.court_id=rs.court_id AND co.start_at < rs.end_at AND co.end_at > rs.start_at
      LEFT JOIN court_blocks cb ON cb.court_id=rs.court_id AND cb.start_at < rs.end_at AND cb.end_at > rs.start_at
      GROUP BY rs.court_id,rs.court_name,rs.facility_id,rs.facility_name,rs.opening_time,rs.closing_time,
               rs.day,rs.local_start,rs.start_at,rs.end_at
    )`;
}

export function overviewCapacitySql(ownerId, input) {
  return Prisma.sql`
    WITH ${capacityCtes(ownerId, input)},
    daily AS (
      SELECT d.day,
        count(*) FILTER (WHERE NOT c.blocked)::int AS capacity_slots,
        count(*) FILTER (WHERE NOT c.blocked AND c.occupied)::int AS occupied_slots,
        count(*) FILTER (WHERE c.blocked)::int AS blocked_slots
      FROM dates d LEFT JOIN classified c ON c.day = d.day GROUP BY d.day
    ), weekday AS (
      SELECT extract(isodow FROM day)::int AS weekday,
        sum(capacity_slots)::int AS capacity_slots, sum(occupied_slots)::int AS occupied_slots,
        sum(blocked_slots)::int AS blocked_slots
      FROM daily GROUP BY 1
    ), heatmap AS (
      SELECT extract(isodow FROM day)::int AS weekday, to_char(local_start, 'HH24:MI') AS start_time,
        count(*) FILTER (WHERE NOT blocked)::int AS capacity_slots,
        count(*) FILTER (WHERE NOT blocked AND occupied)::int AS occupied_slots,
        count(*) FILTER (WHERE blocked)::int AS blocked_slots
      FROM classified GROUP BY 1,2
    )
    SELECT p.facility_exists,
      coalesce((SELECT sum(capacity_slots)::int FROM daily), 0) AS capacity_slots,
      coalesce((SELECT sum(occupied_slots)::int FROM daily), 0) AS occupied_slots,
      (SELECT jsonb_agg(jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'), 'capacity_slots', capacity_slots,
        'occupied_slots', occupied_slots, 'blocked_slots', blocked_slots,
        'available_slots', capacity_slots - occupied_slots
      ) ORDER BY day) FROM daily) AS daily_capacity,
      (SELECT jsonb_agg(jsonb_build_object(
        'weekday', d.weekday, 'capacity_slots', coalesce(w.capacity_slots,0),
        'occupied_slots', coalesce(w.occupied_slots,0), 'blocked_slots', coalesce(w.blocked_slots,0),
        'available_slots', coalesce(w.capacity_slots,0) - coalesce(w.occupied_slots,0),
        'utilization_rate', CASE WHEN coalesce(w.capacity_slots,0)=0 THEN NULL ELSE round(w.occupied_slots * 100.0 / w.capacity_slots, 2)::text END
      ) ORDER BY d.weekday) FROM generate_series(1,7) d(weekday) LEFT JOIN weekday w USING (weekday)) AS weekday_capacity,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'weekday', weekday, 'start_time', start_time, 'capacity_slots', capacity_slots,
        'occupied_slots', occupied_slots, 'blocked_slots', blocked_slots,
        'available_slots', capacity_slots - occupied_slots,
        'utilization_rate', CASE WHEN capacity_slots=0 THEN NULL ELSE round(occupied_slots * 100.0 / capacity_slots,2)::text END
      ) ORDER BY weekday,start_time), '[]'::jsonb) FROM heatmap) AS hourly_heatmap
    FROM parameters p`;
}

export function courtsSql(ownerId, input) {
  const offset = (input.page - 1) * input.page_size;
  const scope = facilityClause(input);
  return Prisma.sql`
    WITH ${capacityCtes(ownerId, input)},
    booking_values AS (
      SELECT c.court_id,
        count(*) FILTER (WHERE b.status IN ('CONFIRMED','COMPLETED'))::int AS confirmed_booking_count,
        coalesce(sum(b.total_amount) FILTER (WHERE b.status IN ('CONFIRMED','COMPLETED')),0)::text AS confirmed_booking_value
      FROM owned_courts c
      LEFT JOIN bookings b ON b.court_id=c.court_id
        AND b.start_at >= (${input.from}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND b.start_at < ((${input.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      GROUP BY c.court_id
    ), slot_values AS (
      SELECT c.court_id,
        count(bs.id) FILTER (WHERE b.status IN ('CONFIRMED','COMPLETED'))::int AS occupied_history_slots
      FROM owned_courts c LEFT JOIN bookings b ON b.court_id=c.court_id
        AND b.start_at >= (${input.from}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND b.start_at < ((${input.to}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      LEFT JOIN booking_slots bs ON bs.booking_id=b.id GROUP BY c.court_id
    ), capacity AS (
      SELECT court_id,
        count(*) FILTER (WHERE NOT blocked)::int AS capacity_slots,
        count(*) FILTER (WHERE NOT blocked AND occupied)::int AS occupied_slots,
        count(*) FILTER (WHERE blocked)::int AS blocked_slots
      FROM classified GROUP BY court_id
    ), rows AS (
      SELECT oc.court_id, oc.court_name, oc.facility_id, oc.facility_name,
        coalesce(bv.confirmed_booking_count,0) AS confirmed_booking_count,
        (coalesce(sv.occupied_history_slots,0)*0.5)::numeric(20,1)::text AS confirmed_hours,
        coalesce(bv.confirmed_booking_value,'0') AS confirmed_booking_value,
        coalesce(cp.capacity_slots,0) AS capacity_slots,
        coalesce(cp.occupied_slots,0) AS occupied_slots,
        coalesce(cp.blocked_slots,0) AS blocked_slots
      FROM owned_courts oc LEFT JOIN booking_values bv USING(court_id)
      LEFT JOIN slot_values sv USING(court_id) LEFT JOIN capacity cp USING(court_id)
    ), paged AS (
      SELECT * FROM rows ORDER BY occupied_slots DESC, court_id ASC LIMIT ${input.page_size} OFFSET ${offset}
    )
    SELECT p.facility_exists, (SELECT count(*)::int FROM rows) AS total,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'court_id', court_id::text, 'court_name', court_name,
        'facility_id', facility_id::text, 'facility_name', facility_name,
        'confirmed_booking_count', confirmed_booking_count, 'confirmed_hours', confirmed_hours,
        'confirmed_booking_value', confirmed_booking_value, 'capacity_slots', capacity_slots,
        'occupied_slots', occupied_slots, 'blocked_slots', blocked_slots,
        'available_slots', capacity_slots - occupied_slots,
        'utilization_rate', CASE WHEN capacity_slots=0 THEN NULL ELSE round(occupied_slots*100.0/capacity_slots,2)::text END
      ) ORDER BY occupied_slots DESC,court_id ASC) FROM paged), '[]'::jsonb) AS items,
      clock_timestamp() AS server_time
    FROM parameters p`;
}

function ratio(occupied, capacity) {
  return capacity === 0 ? null : (Math.round((occupied * 10_000) / capacity) / 100).toFixed(2).replace(/\.00$/, '');
}

function assertCapacity(values) {
  for (const row of values) {
    if (row.capacity_slots < row.occupied_slots || row.available_slots < 0) {
      throw new Error('OWNER_ANALYTICS_CAPACITY_INVARIANT');
    }
  }
}

export function createOwnerAnalyticsService(db) {
  return {
    async overview(actor, input) {
      const ownerId = BigInt(actor.user.id);
      const [factRows, capacityRows] = await Promise.all([
        db.$queryRaw(overviewFactsSql(ownerId, input)),
        db.$queryRaw(overviewCapacitySql(ownerId, input)),
      ]);
      const facts = factRows[0], capacity = capacityRows[0];
      if (!facts?.facility_exists || !capacity?.facility_exists) throw notFound();
      const weekdayBookings = new Map(facts.weekday_bookings.map(row => [row.weekday, row]));
      assertCapacity(capacity.daily_capacity);
      assertCapacity(capacity.hourly_heatmap);
      const weekdayUsage = capacity.weekday_capacity.map(row => ({
        weekday: row.weekday,
        confirmed_count: weekdayBookings.get(row.weekday)?.confirmed_count ?? 0,
        occupied_slots: row.occupied_slots,
        capacity_slots: row.capacity_slots,
        utilization_rate: row.utilization_rate,
      }));
      return {
        data: {
          range: { from: input.from, to: input.to, timezone: TIMEZONE, facility_id: input.facility_id?.toString() ?? null },
          summary: {
            ...facts.summary,
            operational_capacity_slots: capacity.capacity_slots,
            confirmed_occupied_slots: capacity.occupied_slots,
            utilization_rate: ratio(capacity.occupied_slots, capacity.capacity_slots),
          },
          monthly_trend: facts.monthly_trend,
          weekday_usage: weekdayUsage,
          hourly_heatmap: capacity.hourly_heatmap,
          daily_capacity: capacity.daily_capacity,
        },
        meta: { server_time: new Date(facts.server_time).toISOString() },
      };
    },
    async courts(actor, input) {
      const rows = await db.$queryRaw(courtsSql(BigInt(actor.user.id), input));
      const result = rows[0];
      if (!result?.facility_exists) throw notFound();
      assertCapacity(result.items);
      return {
        data: result.items,
        meta: {
          server_time: new Date(result.server_time).toISOString(),
          page: input.page,
          page_size: input.page_size,
          total: result.total,
        },
      };
    },
  };
}
