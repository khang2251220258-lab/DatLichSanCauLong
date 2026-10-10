import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { X509Certificate } from 'node:crypto';
import dotenv from 'dotenv';

const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: resolve(backendRoot, '.env'), quiet: true });

function connectionUrl(value) {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
    if (!url.hostname || !url.username || !url.pathname.slice(1)) throw new Error();
    return url;
  } catch {
    throw new Error('DATABASE_CONNECTION_CONFIG_INVALID');
  }
}

function certificate() {
  const path = resolve(backendRoot, process.env.DATABASE_CA_PATH || 'certs/supabase-ca.crt');
  try {
    const ca = readFileSync(path, 'utf8');
    new X509Certificate(ca);
    return { path, ca };
  } catch {
    throw new Error('DATABASE_CA_INVALID_OR_MISSING');
  }
}

// Runtime PrismaPg dùng cấu hình pg riêng, không truyền connectionString:
// các tham số SSL trong URL không thể ghi đè CA này.
export function getPostgresConfig() {
  const url = connectionUrl(process.env.DATABASE_URL);
  const { ca } = certificate();
  try {
    return {
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port || 5432),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      ssl: { ca, rejectUnauthorized: true },
      connectionTimeoutMillis: 12000,
      max: 5,
    };
  } catch {
    throw new Error('DATABASE_CONNECTION_CONFIG_INVALID');
  }
}

// Prisma CLI dùng schema engine và tham số TLS riêng của Prisma,
// không dùng ssl object của pg. Không ghi URL đã chuẩn hóa ra file/log.
export function getPrismaCliUrl() {
  const url = connectionUrl(process.env.DIRECT_URL || process.env.DATABASE_URL);
  const { path } = certificate();
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('ssl')) url.searchParams.delete(key);
  }
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  url.searchParams.set('sslcert', path);
  url.searchParams.set('connect_timeout', '12');
  return url.toString();
}
