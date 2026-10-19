import { Prisma } from '@prisma/client';

const literal = value => value.replace(/[\\%_]/g, '\\$&');

function visibility(query) {
  const parts = [Prisma.sql`f.status = 'ACTIVE'`, Prisma.sql`u.status = 'ACTIVE'`];
  if (query.district) parts.push(Prisma.sql`f.district = ${query.district}`);
  if (query.q) {
    const pattern = `%${literal(query.q)}%`;
    parts.push(Prisma.sql`(f.name ILIKE ${pattern} ESCAPE '\\' OR c.name ILIKE ${pattern} ESCAPE '\\')`);
  }
  return Prisma.join(parts, ' AND ');
}

export function createRecurringSearchService(db, storage) {
  return {
    async list(query) {
      const where = visibility(query), offset = (query.page - 1) * query.page_size;
      const [result] = await db.$queryRaw`
        WITH params AS MATERIALIZED (
          SELECT clock_timestamp() AS now, ${query.start_date}::date AS starts_on,
            ${query.end_date}::date AS ends_on, ${query.weekday}::smallint AS weekday,
            ${query.start_time}::time AS start_time, ${query.end_time}::time AS end_time
        ), occurrence_dates AS MATERIALIZED (
          SELECT day::date AS day
          FROM params p, LATERAL generate_series(p.starts_on, p.ends_on, interval '1 day') day
          WHERE EXTRACT(ISODOW FROM day)::smallint = p.weekday
        ), occurrences AS MATERIALIZED (
          SELECT (d.day + p.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS start_at,
            (d.day + p.end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS end_at
          FROM occurrence_dates d CROSS JOIN params p
        ), requested_slots AS MATERIALIZED (
          SELECT o.start_at AS occurrence_start,
            slot_start AS start_at, slot_start + interval '30 minutes' AS end_at
          FROM occurrences o, LATERAL generate_series(o.start_at, o.end_at - interval '30 minutes', interval '30 minutes') slot_start
        ), matching_courts AS MATERIALIZED (
          SELECT c.facility_id, c.id, c.name
          FROM courts c JOIN facilities f ON f.id = c.facility_id JOIN users u ON u.id = f.owner_id
          CROSS JOIN params p
          WHERE c.status = 'ACTIVE' AND ${where}
            AND f.opening_time <= p.start_time AND f.closing_time >= p.end_time
            AND NOT EXISTS (SELECT 1 FROM occurrences o WHERE o.start_at <= p.now)
            AND NOT EXISTS (
              SELECT 1 FROM occurrences o JOIN court_blocks cb ON cb.court_id = c.id
              WHERE cb.start_at < o.end_at AND cb.end_at > o.start_at
            )
            AND NOT EXISTS (
              SELECT 1 FROM occurrences o JOIN bookings b ON b.court_id = c.id
                AND b.start_at < o.end_at AND b.end_at > o.start_at
              WHERE b.status = 'CONFIRMED'
                OR (b.booking_flow_version = 1 AND b.status = 'PENDING_CONFIRMATION')
                OR (b.booking_flow_version = 1 AND b.status = 'PENDING_PAYMENT' AND p.now < b.expires_at)
                OR (b.booking_flow_version = 2 AND b.status = 'PENDING_CONFIRMATION'
                  AND b.confirmation_expires_at IS NOT NULL AND p.now < b.confirmation_expires_at)
            )
            AND NOT EXISTS (
              SELECT 1 FROM requested_slots s
              WHERE (SELECT count(*) FROM price_rules pr WHERE pr.facility_id = f.id
                AND pr.start_time <= (s.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time
                AND pr.end_time >= (s.end_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time) <> 1
            )
        ), matching_facilities AS MATERIALIZED (
          SELECT f.id, f.name, f.district, f.address,
            jsonb_agg(jsonb_build_object('id', mc.id::text, 'name', mc.name) ORDER BY mc.id) AS matching_courts
          FROM matching_courts mc JOIN facilities f ON f.id = mc.facility_id
          GROUP BY f.id, f.name, f.district, f.address
        ), page AS MATERIALIZED (
          SELECT * FROM matching_facilities ORDER BY id OFFSET ${offset} LIMIT ${query.page_size}
        )
        SELECT (SELECT count(*)::int FROM matching_facilities) AS total,
          (SELECT count(*)::int FROM occurrence_dates) AS occurrence_count,
          COALESCE(jsonb_agg(jsonb_build_object(
            'id', pg.id::text, 'name', pg.name, 'district', pg.district, 'address', pg.address,
            'image_path', (SELECT fi.image_path FROM facility_images fi WHERE fi.facility_id = pg.id ORDER BY fi.sort_order, fi.id LIMIT 1),
            'amenities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id::text, 'name', a.name) ORDER BY a.name, a.id)
              FROM facility_amenities fa JOIN amenities a ON a.id = fa.amenity_id
              WHERE fa.facility_id = pg.id AND a.is_active), '[]'::jsonb),
            'matching_courts', pg.matching_courts
          ) ORDER BY pg.id) FILTER (WHERE pg.id IS NOT NULL), '[]'::jsonb) AS items
        FROM (SELECT 1) seed LEFT JOIN page pg ON true`;
      return { total: result.total, occurrence_count: result.occurrence_count, items: result.items.map(item => ({
        id: item.id, name: item.name, district: item.district, address: item.address,
        cover_image_url: item.image_path ? storage.url(item.image_path) : null,
        amenities: item.amenities, matching_courts: item.matching_courts,
      })) };
    },
  };
}
