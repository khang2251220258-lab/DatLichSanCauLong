import argon2 from 'argon2';
import { validate } from '../src/modules/auth/validation.js';
import { passwordOptions } from '../src/modules/auth/password.js';
import { AuthError } from '../src/modules/auth/errors.js';
export async function bootstrapAdmin(db, input) {
  const data = validate(input, true);
  const duplicate = () => new AuthError(409, 'EMAIL_ALREADY_EXISTS', 'Email đã tồn tại; không thay đổi tài khoản.');
  if (await db.user.findUnique({ where: { email_normalized: data.email }, select: { id: true } })) throw duplicate();
  const password_hash = await argon2.hash(data.password, passwordOptions);
  try {
    const created_at = (await db.$queryRaw`SELECT clock_timestamp() AS now`)[0].now;
    await db.user.create({ data: { email: data.email, email_normalized: data.email, full_name: data.full_name, password_hash, role: 'ADMIN', status: 'ACTIVE', created_at } });
    return { status: 'CREATED' };
  } catch (error) { if (error.code === 'P2002') throw duplicate(); throw error; }
}
