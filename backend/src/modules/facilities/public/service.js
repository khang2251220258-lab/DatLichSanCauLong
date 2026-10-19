import { Prisma } from '@prisma/client';
import { AuthError } from '../../auth/errors.js';

const literal = value => value.replace(/[\\%_]/g, '\\$&');

function visibility(query) {
  const parts = [Prisma.sql`f.status = 'ACTIVE'`, Prisma.sql`u.status = 'ACTIVE'`];
  if (query.district) parts.push(Prisma.sql`f.district = ${query.district}`);
  if (query.q) {
    const pattern = `%${literal(query.q)}%`;
    parts.push(Prisma.sql`(f.name ILIKE ${pattern} ESCAPE '\\' OR EXISTS (
      SELECT 1 FROM courts search_court
      WHERE search_court.facility_id = f.id AND search_court.status = 'ACTIVE'
        AND search_court.name ILIKE ${pattern} ESCAPE '\\'
    ))`);
  }
  return Prisma.join(parts, ' AND ');
}

const publicFrom = Prisma.sql`FROM facilities f JOIN users u ON u.id = f.owner_id`;

export function createPublicFacilityService(db, storage) {
  return {
    async list(query) {
        const where = visibility(query), offset = (query.page - 1) * query.page_size;
        if (query.interval) {
          const { date, start_time, end_time } = query.interval;
          const [result] = await db.$queryRaw`
            WITH moment AS MATERIALIZED (SELECT clock_timestamp() AS now),
            params AS MATERIALIZED (
              SELECT now,
                ${date}::date AS requested_date,
                to_char(now AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS today,
                ((${date}::date + ${start_time}::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS requested_start,
                ((${date}::date + ${end_time}::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS requested_end
              FROM moment
            ), matching_courts AS MATERIALIZED (
              SELECT c.facility_id, c.id, c.name
              FROM params p
              JOIN courts c ON c.status = 'ACTIVE'
              JOIN facilities f ON f.id = c.facility_id
              JOIN users u ON u.id = f.owner_id
              WHERE ${where}
                AND p.requested_date >= p.today::date
                AND p.requested_date <= p.today::date + 30
                AND p.requested_start > p.now
                AND f.opening_time <= ${start_time}::time
                AND f.closing_time >= ${end_time}::time
                AND NOT EXISTS (
                  SELECT 1 FROM court_blocks cb
                  WHERE cb.court_id = c.id
                    AND cb.start_at < p.requested_end AND cb.end_at > p.requested_start
                )
                AND NOT EXISTS (
                  SELECT 1 FROM bookings b
                  WHERE b.court_id = c.id
                    AND b.start_at < p.requested_end AND b.end_at > p.requested_start
                    AND (
                      b.status = 'CONFIRMED'
                      OR (b.booking_flow_version = 1 AND b.status = 'PENDING_CONFIRMATION')
                      OR (b.booking_flow_version = 1 AND b.status = 'PENDING_PAYMENT' AND p.now < b.expires_at)
                      OR (b.booking_flow_version = 2 AND b.status = 'PENDING_CONFIRMATION'
                        AND b.confirmation_expires_at IS NOT NULL AND p.now < b.confirmation_expires_at)
                    )
                )
                AND NOT EXISTS (
                  SELECT 1
                  FROM generate_series(p.requested_start, p.requested_end - interval '30 minutes', interval '30 minutes') slot_start
                  WHERE (SELECT count(*) FROM price_rules pr
                    WHERE pr.facility_id = f.id
                      AND pr.start_time <= (slot_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::time
                      AND pr.end_time >= ((slot_start + interval '30 minutes') AT TIME ZONE 'Asia/Ho_Chi_Minh')::time) <> 1
                )
            ), matching_facilities AS MATERIALIZED (
              SELECT f.id, f.name, f.district, f.address,
                jsonb_agg(jsonb_build_object('id', mc.id::text, 'name', mc.name) ORDER BY mc.id ASC) AS matching_courts
              FROM matching_courts mc JOIN facilities f ON f.id = mc.facility_id
              GROUP BY f.id, f.name, f.district, f.address
            ), page AS MATERIALIZED (
              SELECT * FROM matching_facilities ORDER BY id ASC OFFSET ${offset} LIMIT ${query.page_size}
            )
            SELECT p.today,
              (SELECT count(*)::int FROM matching_facilities) AS total,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id', pg.id::text, 'name', pg.name, 'district', pg.district, 'address', pg.address,
                'image_path', (SELECT fi.image_path FROM facility_images fi WHERE fi.facility_id = pg.id ORDER BY fi.sort_order ASC, fi.id ASC LIMIT 1),
                'amenities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id::text, 'name', a.name) ORDER BY a.name ASC, a.id ASC)
                  FROM facility_amenities fa JOIN amenities a ON a.id = fa.amenity_id
                  WHERE fa.facility_id = pg.id AND a.is_active = true), '[]'::jsonb),
                'matching_courts', pg.matching_courts
              ) ORDER BY pg.id ASC) FILTER (WHERE pg.id IS NOT NULL), '[]'::jsonb) AS items
            FROM params p LEFT JOIN page pg ON true GROUP BY p.today`;
          const today = new Date(`${result.today}T00:00:00.000Z`);
          const max = new Date(+today + 30 * 86400000).toISOString().slice(0, 10);
          if (date < result.today || date > max) throw new AuthError(422, 'INVALID_DATE', 'Ngày tìm kiếm không hợp lệ.');
          return { total: result.total, items: result.items.map(r => ({
            id: r.id, name: r.name, district: r.district, address: r.address,
            cover_image_url: r.image_path ? storage.url(r.image_path) : null,
            amenities: r.amenities, matching_courts: r.matching_courts,
          })) };
        }
        const [result] = await db.$queryRaw`
          WITH page AS MATERIALIZED (
            SELECT f.id, f.name, f.district, f.address
            ${publicFrom} WHERE ${where}
            ORDER BY f.id ASC OFFSET ${offset} LIMIT ${query.page_size}
          )
          SELECT
            (SELECT count(*)::int ${publicFrom} WHERE ${where}) AS total,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', p.id::text, 'name', p.name, 'district', p.district, 'address', p.address,
              'image_path', (SELECT fi.image_path FROM facility_images fi WHERE fi.facility_id = p.id ORDER BY fi.sort_order ASC, fi.id ASC LIMIT 1),
              'amenities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id::text, 'name', a.name) ORDER BY a.name ASC, a.id ASC)
                FROM facility_amenities fa JOIN amenities a ON a.id = fa.amenity_id
                WHERE fa.facility_id = p.id AND a.is_active = true), '[]'::jsonb)
            ) ORDER BY p.id ASC) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS items
          FROM (SELECT 1) seed LEFT JOIN page p ON true`;
        return { total: result.total, items: result.items.map(r => ({
          id: r.id, name: r.name, district: r.district, address: r.address,
          cover_image_url: r.image_path ? storage.url(r.image_path) : null, amenities: r.amenities,
        })) };
    },
    async detail(id) {
        const rows = await db.$queryRaw`
          SELECT f.id::text AS id, f.name, f.district, f.address, f.phone, f.description,
            to_char(f.opening_time, 'HH24:MI') AS opening_time,
            to_char(f.closing_time, 'HH24:MI') AS closing_time,
            f.latitude::text AS latitude, f.longitude::text AS longitude,
            COALESCE((SELECT jsonb_agg(fi.image_path ORDER BY fi.sort_order ASC, fi.id ASC)
              FROM facility_images fi WHERE fi.facility_id = f.id), '[]'::jsonb) AS images,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id::text, 'name', a.name) ORDER BY a.name ASC, a.id ASC)
              FROM facility_amenities fa JOIN amenities a ON a.id = fa.amenity_id
              WHERE fa.facility_id = f.id AND a.is_active = true), '[]'::jsonb) AS amenities,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id::text, 'name', c.name, 'description', c.description) ORDER BY c.id ASC)
              FROM courts c WHERE c.facility_id = f.id AND c.status = 'ACTIVE'), '[]'::jsonb) AS courts,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pr.id::text, 'start_time', to_char(pr.start_time, 'HH24:MI'),
              'end_time', to_char(pr.end_time, 'HH24:MI'), 'hourly_rate', pr.hourly_rate::text)
              ORDER BY pr.start_time ASC, pr.end_time ASC, pr.id ASC)
              FROM price_rules pr WHERE pr.facility_id = f.id), '[]'::jsonb) AS price_rules,
            (SELECT jsonb_build_object('cutoff_hours', cp.cutoff_hours)
              FROM cancellation_policies cp WHERE cp.facility_id = f.id) AS cancellation_policy
          ${publicFrom} WHERE f.id = ${id} AND f.status = 'ACTIVE' AND u.status = 'ACTIVE'`;
        const r = rows[0];
        if (!r) throw new AuthError(404, 'RESOURCE_NOT_FOUND', 'KhÃ´ng tÃ¬m tháº¥y cÆ¡ sá»Ÿ.');
        return { id: r.id, name: r.name, district: r.district, address: r.address, phone: r.phone,
          description: r.description, opening_time: r.opening_time, closing_time: r.closing_time,
          latitude: r.latitude, longitude: r.longitude,
          gallery: r.images.map(value => storage.url(value)), amenities: r.amenities,
          courts: r.courts, price_rules: r.price_rules, cancellation_policy: r.cancellation_policy };
    },
  };
}
