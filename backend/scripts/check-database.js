// Chỉ kiểm tra kết nối bằng Prisma Client, không đọc/ghi dữ liệu nghiệp vụ.
let prisma;
const timeout = setTimeout(() => {
  console.error('Prisma PostgreSQL connection: FAILED (CHECK_TIMEOUT)');
  process.exit(1);
}, 20000);

try {
  ({ prisma } = await import('../src/config/prisma.js'));
  await prisma.$queryRaw`SELECT 1`;
  console.log('Prisma PostgreSQL connection: SUCCESS');
  console.log('TLS verification: SUCCESS');
  console.log('Authentication: SUCCESS');
  console.log('SELECT 1: SUCCESS');
} catch (error) {
  // Không in message/stack/meta: chúng có thể chứa thông tin kết nối.
  const safeCodes = new Set([
    'P1000', 'P1001', 'P1002', 'P1011', 'P2010', 'P2024',
    '28P01', '28000', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID',
    'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT',
  ]);
  const code = safeCodes.has(error.code) ? error.code : 'CONNECTION_CHECK_ERROR';
  console.error(`Prisma PostgreSQL connection: FAILED (${code})`);
  process.exitCode = 1;
} finally {
  if (prisma) await prisma.$disconnect().catch(() => {});
  clearTimeout(timeout);
}
