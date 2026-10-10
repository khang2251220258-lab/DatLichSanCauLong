import { Prisma } from '@prisma/client';
import { AuthError } from '../../auth/errors.js';

const options = { maxWait: 20000, timeout: 20000, isolationLevel: 'RepeatableRead' };
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
    list(query) {
      return db.$transaction(async tx => {
        const where = visibility(query), offset = (query.page - 1) * query.page_size;
        const [result] = await tx.$queryRaw`
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
      }, options);
    },
    detail(id) {
      return db.$transaction(async tx => {
        const rows = await tx.$queryRaw`
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
      }, options);
    },
  };
}
