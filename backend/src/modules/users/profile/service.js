import { AuthError } from '../../auth/errors.js';

const options = { maxWait: 20000, timeout: 20000 };
const expired = () => new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
async function now(db) { return (await db.$queryRaw`SELECT clock_timestamp() AS now`)[0].now; }
const present = user => ({
  id: String(user.id),
  full_name: user.full_name,
  email: user.email,
  phone: user.phone,
  capabilities: user.role === 'ADMIN' ? ['ADMIN'] : user.ownerProfile ? ['CUSTOMER', 'OWNER'] : ['CUSTOMER'],
  has_local_password: user.password_hash !== null,
});

export function createProfileService(db) {
  return {
    async get(actor) {
      const user = await db.user.findUnique({ where: { id: BigInt(actor.user.id) }, include: { ownerProfile: true } });
      if (!user || user.status !== 'ACTIVE') throw expired();
      return present(user);
    },
    async update(actor, input) {
      const userId = BigInt(actor.user.id);
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const session = await tx.authSession.findUnique({ where: { id: actor.id } });
        const timestamp = await now(tx);
        if (!session || session.user_id !== userId || session.revoked_at || session.expires_at <= timestamp) throw expired();
        const current = await tx.user.findUnique({ where: { id: userId }, include: { ownerProfile: true } });
        if (!current || current.status !== 'ACTIVE') throw expired();
        await tx.user.update({ where: { id: userId }, data: input });
        return present({ ...current, ...input });
      }, options);
    },
  };
}
