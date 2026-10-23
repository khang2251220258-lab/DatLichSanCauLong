import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { authConfig } from './config.js';
import { AuthError } from './errors.js';
import { passwordOptions } from './password.js';
import { normalizeEmail } from './validation.js';
export const tokenHash = token => createHash('sha256').update(token).digest();
const dummyHash = argon2.hash(randomBytes(32), passwordOptions);
const denied = () => new AuthError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
const publicUser = user => ({ id: String(user.id), email: user.email, full_name: user.full_name, phone: user.phone, avatar_path: user.avatar_path, role: user.role,
  capabilities: user.role === 'ADMIN' ? ['ADMIN'] : user.ownerProfile ? ['CUSTOMER', 'OWNER'] : ['CUSTOMER'], has_local_password: user.password_hash !== null });
async function now(db) { return (await db.$queryRaw`SELECT clock_timestamp() AS now`)[0].now; }
function googleFullName(name, email) {
  const candidate = typeof name === 'string' ? name.trim() : '';
  if (candidate && [...candidate].length <= 150) return candidate;
  const fallback = email.split('@', 1)[0].trim();
  const normalized = [...fallback].slice(0, 150).join('').trim();
  if (!normalized) throw new AuthError(401, 'GOOGLE_IDENTITY_INVALID', 'Không thể xác minh tài khoản Google.');
  return normalized;
}
async function createSession(tx, user, query = (_operation, run) => run()) {
  const created_at = await query('session_clock', () => now(tx));
  const token = randomBytes(32).toString('base64url');
  const csrf_token = randomBytes(32).toString('hex');
  const expires_at = new Date(created_at.getTime() + authConfig.lifetimeMs);
  await query('session_insert', () => tx.authSession.create({ data: { user_id: user.id, token_hash: tokenHash(token), csrf_token, created_at, expires_at } }));
  return { user: publicUser(user), csrf_token, token, expires_at };
}
const prismaExceptionTypes = new Set(['PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'PrismaClientInitializationError', 'PrismaClientRustPanicError', 'Error', 'UnknownError']);
const safePrismaDiagnostic = error => {
  const exception_type = prismaExceptionTypes.has(error?.name) ? error.name : 'UnknownError';
  const prisma_error = typeof error?.code === 'string' && /^P\d{4}$/.test(error.code) ? error.code : undefined;
  return Object.freeze({ exception_type, ...(prisma_error ? { prisma_error } : {}) });
};
const googleDiagnosticFailure = (code, diagnostic) => {
  const error = new Error(code);
  error.name = 'GoogleCallbackDiagnosticError';
  error.code = code;
  error.diagnostic = diagnostic;
  return error;
};
export function createAuthService(db, emailAdapter) {
  return {
    assertEmailConfigured() { emailAdapter.assertConfigured(); },
    async forgot({ email }) {
      emailAdapter.assertConfigured();
      const user = await db.user.findUnique({ where: { email_normalized: email } });
      if (!user || user.status !== 'ACTIVE' || !user.password_hash) return null;
      const delivery = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (!current || current.status !== 'ACTIVE' || !current.password_hash) return null;
        const created_at = await now(tx);
        await tx.passwordResetToken.updateMany({ where: { user_id: user.id, used_at: null, invalidated_at: null }, data: { invalidated_at: created_at } });
        const token = randomBytes(32).toString('base64url');
        await tx.passwordResetToken.create({ data: { user_id: user.id, token_hash: tokenHash(token), created_at, expires_at: new Date(created_at.getTime() + authConfig.resetLifetimeMs) } });
        return { email: current.email, token };
      }, { timeout: 20000 });
      // Caller invokes only after transaction commit and HTTP response completion.
      return delivery ? () => emailAdapter.send(delivery) : null;
    },
    async reset({ token, new_password }) {
      const invalidToken = () => new AuthError(422, 'INVALID_RESET_TOKEN', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalidToken();
      const found = await db.passwordResetToken.findUnique({ where: { token_hash: tokenHash(token) } });
      if (!found) throw invalidToken();
      const password_hash = await argon2.hash(new_password, passwordOptions);
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${found.user_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM password_reset_tokens WHERE id = ${found.id} FOR UPDATE`;
        const current = await tx.passwordResetToken.findUnique({ where: { id: found.id }, include: { user: true } });
        const timestamp = await now(tx);
        if (!current || current.used_at || current.invalidated_at || current.expires_at <= timestamp || current.user.status !== 'ACTIVE' || !current.user.password_hash) throw invalidToken();
        await tx.user.update({ where: { id: current.user_id }, data: { password_hash } });
        await tx.passwordResetToken.update({ where: { id: current.id }, data: { used_at: timestamp } });
        await tx.passwordResetToken.updateMany({ where: { user_id: current.user_id, used_at: null, invalidated_at: null }, data: { invalidated_at: timestamp } });
        await tx.authSession.updateMany({ where: { user_id: current.user_id, revoked_at: null }, data: { revoked_at: timestamp } });
      }, { timeout: 20000 });
    },
    async change(session, { current_password, new_password }) {
      const userId = BigInt(session.user.id);
      const password_hash = await argon2.hash(new_password, passwordOptions);
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const current = await tx.user.findUnique({ where: { id: userId } });
        const active = await tx.authSession.findUnique({ where: { id: session.id } });
        const timestamp = await now(tx);
        if (!current || current.status !== 'ACTIVE' || !active || active.user_id !== userId || active.revoked_at || active.expires_at <= timestamp) throw new AuthError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
        if (!current.password_hash) throw new AuthError(409, 'PASSWORD_NOT_CONFIGURED', 'Vui lòng tiếp tục đăng nhập bằng Google.');
        if (!await argon2.verify(current.password_hash, current_password)) throw new AuthError(422, 'INVALID_CURRENT_PASSWORD', 'Mật khẩu hiện tại không đúng.');
        await tx.user.update({ where: { id: userId }, data: { password_hash } });
        await tx.passwordResetToken.updateMany({ where: { user_id: userId, used_at: null, invalidated_at: null }, data: { invalidated_at: timestamp } });
        await tx.authSession.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: timestamp } });
      }, { timeout: 20000 });
    },
    async register(input) {
      const password_hash = await argon2.hash(input.password, passwordOptions);
      try {
        const user = await db.user.create({ data: { email: input.email, email_normalized: input.email, full_name: input.full_name, password_hash, role: 'CUSTOMER', status: 'ACTIVE', created_at: await now(db) } });
        return publicUser(user);
      } catch (error) { if (error.code === 'P2002') throw new AuthError(409, 'EMAIL_ALREADY_EXISTS', 'Email đã được sử dụng.'); throw error; }
    },
    async login(input) {
      const user = await db.user.findUnique({ where: { email_normalized: input.email }, include: { ownerProfile: true } });
      const valid = await argon2.verify(user?.password_hash || await dummyHash, input.password);
      if (!user?.password_hash || !valid) throw denied();
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        const current = await tx.user.findUnique({ where: { id: user.id }, include: { ownerProfile: true } });
        if (!current || current.password_hash !== user.password_hash) throw denied();
        if (current.status !== 'ACTIVE') throw new AuthError(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa.');
        return createSession(tx, current);
      });
    },
    async googleLogin(identity) {
      const subject = typeof identity?.subject === 'string' ? identity.subject.trim() : '';
      const email = typeof identity?.email === 'string' ? normalizeEmail(identity.email) : '';
      if (!subject || [...subject].length > 255 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(401, 'GOOGLE_IDENTITY_INVALID', 'Không thể xác minh tài khoản Google.');
      const transactionStarted = performance.now();
      let operation = 'transaction_open';
      const googleStep = async (code, label, run) => {
        operation = label;
        const started = performance.now();
        try { return await run(); }
        catch (error) {
          if (error instanceof AuthError) throw error;
          throw googleDiagnosticFailure(code, { ...safePrismaDiagnostic(error), operation: label, operation_elapsed_ms: Math.round(performance.now() - started) });
        }
      };
      try {
        const result = await db.$transaction(async tx => {
          const bySubject = await googleStep('GOOGLE_USER_RESOLUTION_FAILED', 'subject_lookup', () => tx.user.findUnique({ where: { google_subject: subject }, include: { ownerProfile: true } }));
          if (bySubject) {
            await googleStep('GOOGLE_USER_RESOLUTION_FAILED', 'user_lock', () => tx.$queryRaw`SELECT id FROM users WHERE id = ${bySubject.id} FOR UPDATE`);
            const current = await googleStep('GOOGLE_USER_RESOLUTION_FAILED', 'locked_user_lookup', () => tx.user.findUnique({ where: { id: bySubject.id }, include: { ownerProfile: true } }));
            if (!current || current.status !== 'ACTIVE') throw new AuthError(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa.');
            const session = await createSession(tx, current, (label, run) => googleStep('GOOGLE_SESSION_CREATION_FAILED', label, run));
            operation = 'transaction_commit';
            return session;
          }
          const byEmail = await googleStep('GOOGLE_USER_RESOLUTION_FAILED', 'email_lookup', () => tx.user.findUnique({ where: { email_normalized: email } }));
          if (byEmail) throw new AuthError(409, 'GOOGLE_EMAIL_COLLISION', 'Email đã có tài khoản.');
          const created_at = await googleStep('GOOGLE_USER_CREATION_FAILED', 'user_clock', () => now(tx));
          const user = await googleStep('GOOGLE_USER_CREATION_FAILED', 'user_insert', () => tx.user.create({ data: { email, email_normalized: email, full_name: googleFullName(identity.name, email), password_hash: null, google_subject: subject, role: 'CUSTOMER', status: 'ACTIVE', created_at }, include: { ownerProfile: true } }));
          const session = await createSession(tx, user, (label, run) => googleStep('GOOGLE_SESSION_CREATION_FAILED', label, run));
          operation = 'transaction_commit';
          return session;
        // Cold session-pooler acquisition can exceed Prisma's 2-second default maxWait.
        }, { maxWait: 20000, timeout: 20000 });
        return result;
      } catch (error) {
        if (error instanceof AuthError) throw error;
        const diagnostic = { ...safePrismaDiagnostic(error), ...error?.diagnostic, operation: error?.diagnostic?.operation || operation, transaction_elapsed_ms: Math.round(performance.now() - transactionStarted) };
        if (error?.code === 'P2002') throw googleDiagnosticFailure('GOOGLE_USER_CREATION_FAILED', diagnostic);
        if (typeof error?.code === 'string' && error.code.startsWith('GOOGLE_')) { error.diagnostic = diagnostic; throw error; }
        throw googleDiagnosticFailure('GOOGLE_USER_TRANSACTION_FAILED', diagnostic);
      }
    },
    async session(token) {
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const session = await db.authSession.findUnique({ where: { token_hash: tokenHash(token) }, include: { user: { include: { ownerProfile: true } } } });
      if (!session || session.revoked_at || session.expires_at <= await now(db) || session.user.status !== 'ACTIVE') return null;
      return { id: session.id, user: publicUser(session.user), csrf_token: session.csrf_token };
    },
    async logout(session) { if (session) await db.authSession.updateMany({ where: { id: session.id, revoked_at: null }, data: { revoked_at: await now(db) } }); },
  };
}
