import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createGoogleOAuth, createOAuthState, verifyOAuthState, googleStateCookie } from '../src/modules/auth/google.js';
import { authRoutes, apiError } from '../src/modules/auth/routes.js';
import { createAuthService } from '../src/modules/auth/service.js';

const config = {
  nodeEnv: 'development',
  frontendUrl: 'http://localhost:5173',
  googleOAuth: { enabled: true, clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost:3000/api/v1/auth/google/callback', stateSecret: 'a'.repeat(48) },
};
const session = { user: { id: '1', capabilities: ['CUSTOMER'] }, csrf_token: 'a'.repeat(64), token: 'x'.repeat(43), expires_at: new Date(Date.now() + 60_000) };

function appWith({ exchangeAndVerify = async () => ({ subject: 'subject-1', email: 'google@example.com', name: 'Google User' }), googleLogin = async () => session, logger = { warn() {} } } = {}) {
  const service = { googleLogin };
  const google = { enabled: true, createState: () => createOAuthState(config.googleOAuth.stateSecret), authorizationUrl: state => `https://accounts.example/auth?state=${encodeURIComponent(state)}`, exchangeAndVerify };
  const app = express(); app.use('/auth', authRoutes(service, config, undefined, google, logger)); app.use(apiError);
  return app;
}
async function server(app) {
  const instance = app.listen(0, '127.0.0.1'); await new Promise(resolve => instance.once('listening', resolve));
  return { instance, base: `http://127.0.0.1:${instance.address().port}/auth` };
}

function serviceDb(users = []) {
  const sessions = [];
  let nextUserId = BigInt(users.length + 1);
  const db = {
    user: {
      async findUnique({ where }) {
        const user = users.find(candidate => (where.google_subject && candidate.google_subject === where.google_subject) || (where.email_normalized && candidate.email_normalized === where.email_normalized) || (where.id && candidate.id === where.id));
        return user ? { ...user, ownerProfile: user.ownerProfile || null } : null;
      },
      async create({ data }) {
        if (users.some(user => user.google_subject === data.google_subject || user.email_normalized === data.email_normalized)) { const error = new Error('unique'); error.code = 'P2002'; throw error; }
        const user = { ...data, id: nextUserId++, ownerProfile: null }; users.push(user); return { ...user };
      },
    },
    authSession: { async create({ data }) { sessions.push(data); return data; } },
    async $queryRaw() { return [{ now: new Date('2026-10-22T00:00:00.000Z') }]; },
    async $transaction(callback) { return callback(db); },
  };
  return { db, users, sessions };
}

test('Google OAuth state is signed, expires, and cannot be substituted', () => {
  const state = createOAuthState(config.googleOAuth.stateSecret, 1_000);
  assert.ok(verifyOAuthState(state, state, config.googleOAuth.stateSecret, 1_001));
  assert.equal(verifyOAuthState(state, `${state}x`, config.googleOAuth.stateSecret, 1_001), false);
  assert.equal(verifyOAuthState(state, state, config.googleOAuth.stateSecret, 1_000 + googleStateCookie.lifetimeMs), false);
});

test('Google verifier accepts only a verified normalized identity for the configured audience', async () => {
  let audience;
  const oauth = createGoogleOAuth(config, {
    async getToken() { return { tokens: { id_token: 'opaque-id-token' } }; },
    async verifyIdToken(input) { audience = input.audience; return { getPayload: () => ({ sub: 'subject-1', email: ' User@Example.com ', email_verified: true, name: 'User' }) }; },
  });
  assert.deepEqual(await oauth.exchangeAndVerify('code'), { subject: 'subject-1', email: 'user@example.com', name: 'User' });
  assert.equal(audience, 'client');
  const invalid = createGoogleOAuth(config, {
    async getToken() { return { tokens: { id_token: 'opaque-id-token' } }; },
    async verifyIdToken() { return { getPayload: () => ({ sub: 'subject-1', email: 'user@example.com', email_verified: false }) }; },
  });
  await assert.rejects(() => invalid.exchangeAndVerify('code'), { code: 'GOOGLE_EMAIL_NOT_VERIFIED' });
});

test('Google OAuth initiation and callback create only the existing app session', async () => {
  const { instance, base } = await server(appWith());
  try {
    const start = await fetch(`${base}/google`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const stateCookie = start.headers.get('set-cookie').split(';')[0];
    assert.ok(state);
    const callback = await fetch(`${base}/google/callback?code=opaque-code&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie: stateCookie } });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), 'http://localhost:5173/login?google=success');
    assert.match(callback.headers.get('set-cookie'), /booking_session=/);
    assert.doesNotMatch(callback.headers.get('location'), /code|token|subject|email/);
  } finally { await new Promise(resolve => instance.close(resolve)); }
});

test('successful Google callback is single-use even if the browser replays its old state cookie', async () => {
  let logins = 0;
  const { instance, base } = await server(appWith({ googleLogin: async () => { logins += 1; return session; } }));
  try {
    const start = await fetch(`${base}/google`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = start.headers.get('set-cookie').split(';')[0];
    const callbackUrl = `${base}/google/callback?code=opaque-code&state=${encodeURIComponent(state)}`;
    const first = await fetch(callbackUrl, { redirect: 'manual', headers: { cookie } });
    const replay = await fetch(callbackUrl, { redirect: 'manual', headers: { cookie } });
    assert.equal(first.headers.get('location'), 'http://localhost:5173/login?google=success');
    assert.equal(replay.headers.get('location'), 'http://localhost:5173/login?google=google_failed');
    assert.equal(logins, 1);
  } finally { await new Promise(resolve => instance.close(resolve)); }
});

test('Google callback fails closed for state replay, cancellation, and identity failure', async () => {
  const { instance, base } = await server(appWith({ exchangeAndVerify: async () => { throw new Error('bad token'); } }));
  try {
    const start = await fetch(`${base}/google`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = start.headers.get('set-cookie').split(';')[0];
    const bad = await fetch(`${base}/google/callback?code=x&state=wrong`, { redirect: 'manual', headers: { cookie } });
    assert.equal(bad.headers.get('location'), 'http://localhost:5173/login?google=google_failed');
    const cancelled = await fetch(`${base}/google/callback?error=access_denied&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie } });
    assert.equal(cancelled.headers.get('location'), 'http://localhost:5173/login?google=google_cancelled');
    const replay = await fetch(`${base}/google/callback?error=access_denied&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie } });
    assert.equal(replay.headers.get('location'), 'http://localhost:5173/login?google=google_failed');
  } finally { await new Promise(resolve => instance.close(resolve)); }
});

test('Google callback emits bounded diagnostics without OAuth values and preserves safe redirects', async () => {
  const diagnostics = [];
  const logger = { warn: event => diagnostics.push(event) };
  const { instance, base } = await server(appWith({
    logger,
    exchangeAndVerify: async () => {
      const error = new Error('opaque-code opaque-state opaque-cookie');
      error.code = 'GOOGLE_CODE_EXCHANGE_FAILED';
      throw error;
    },
  }));
  try {
    const missingState = await fetch(`${base}/google/callback`, { redirect: 'manual' });
    assert.equal(missingState.headers.get('location'), 'http://localhost:5173/login?google=google_failed');
    const start = await fetch(`${base}/google`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = start.headers.get('set-cookie').split(';')[0];
    const callback = await fetch(`${base}/google/callback?code=opaque-code&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie } });
    assert.equal(callback.headers.get('location'), 'http://localhost:5173/login?google=google_failed');
    assert.deepEqual(diagnostics, [
      { event: 'GOOGLE_OAUTH_CALLBACK_FAILED', category: 'GOOGLE_STATE_MISSING', stage: 'state' },
      { event: 'GOOGLE_OAUTH_CALLBACK_FAILED', category: 'GOOGLE_CODE_EXCHANGE_FAILED', stage: 'code_exchange' },
    ]);
    const output = JSON.stringify(diagnostics);
    assert.doesNotMatch(output, /opaque-code|opaque-state|opaque-cookie|token|cookie/i);
  } finally { await new Promise(resolve => instance.close(resolve)); }
});

test('Google OAuth provider failures use bounded diagnostic categories', async () => {
  const exchangeFailure = createGoogleOAuth(config, { async getToken() { throw new Error('provider response'); } });
  await assert.rejects(() => exchangeFailure.exchangeAndVerify('opaque-code'), { code: 'GOOGLE_CODE_EXCHANGE_FAILED' });
  const missingToken = createGoogleOAuth(config, { async getToken() { return { tokens: {} }; } });
  await assert.rejects(() => missingToken.exchangeAndVerify('opaque-code'), { code: 'GOOGLE_ID_TOKEN_MISSING' });
  const verificationFailure = createGoogleOAuth(config, {
    async getToken() { return { tokens: { id_token: 'opaque-id-token' } }; },
    async verifyIdToken() { throw new Error('bad token'); },
  });
  await assert.rejects(() => verificationFailure.exchangeAndVerify('opaque-code'), { code: 'GOOGLE_ID_TOKEN_VERIFICATION_FAILED' });
});

test('Google code exchange records only allowlisted provider metadata', async () => {
  const providerError = new Error('opaque-code opaque-token opaque-secret');
  providerError.name = 'GaxiosError';
  providerError.response = { status: 400, data: { error: 'invalid_grant', error_description: 'opaque-state opaque-cookie' } };
  const oauth = createGoogleOAuth(config, { async getToken() { throw providerError; } });
  await assert.rejects(
    () => oauth.exchangeAndVerify('opaque-code'),
    error => {
      assert.equal(error.code, 'GOOGLE_CODE_EXCHANGE_FAILED');
      assert.deepEqual(error.diagnostic, { exception_type: 'GaxiosError', http_status: 400, provider_error: 'invalid_grant' });
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /opaque|secret|token|state|cookie/i);
      return true;
    },
  );
});

test('Google callback logs only the safe exchange metadata allowlist', async () => {
  const diagnostics = [];
  const { instance, base } = await server(appWith({
    logger: { warn: event => diagnostics.push(event) },
    exchangeAndVerify: async () => {
      const error = new Error('opaque-code');
      error.code = 'GOOGLE_CODE_EXCHANGE_FAILED';
      error.diagnostic = { exception_type: 'GaxiosError', http_status: 400, provider_error: 'invalid_grant', raw: 'opaque-token' };
      throw error;
    },
  }));
  try {
    const start = await fetch(`${base}/google`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = start.headers.get('set-cookie').split(';')[0];
    await fetch(`${base}/google/callback?code=opaque-code&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie } });
    assert.deepEqual(diagnostics, [{ event: 'GOOGLE_OAUTH_CALLBACK_FAILED', category: 'GOOGLE_CODE_EXCHANGE_FAILED', stage: 'code_exchange', exception_type: 'GaxiosError', http_status: 400, provider_error: 'invalid_grant' }]);
  } finally { await new Promise(resolve => instance.close(resolve)); }
});

test('Google callback assigns unexpected service errors to the reached stage with safe Prisma metadata', async () => {
  const diagnostics = [];
  const { instance, base } = await server(appWith({
    logger: { warn: event => diagnostics.push(event) },
    googleLogin: async () => {
      const error = new Error('opaque database credential');
      error.name = 'PrismaClientInitializationError';
      error.code = 'P1001';
      error.diagnostic = { exception_type: 'PrismaClientInitializationError', prisma_error: 'P1001', operation: 'subject_lookup', operation_elapsed_ms: 42, transaction_elapsed_ms: 65, raw: 'opaque database credential' };
      throw error;
    },
  }));
  try {
    const start = await fetch(`${base}/google`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = start.headers.get('set-cookie').split(';')[0];
    const callback = await fetch(`${base}/google/callback?code=opaque-code&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie } });
    assert.equal(callback.headers.get('location'), 'http://localhost:5173/login?google=google_failed');
    assert.deepEqual(diagnostics, [{ event: 'GOOGLE_OAUTH_CALLBACK_FAILED', category: 'GOOGLE_CALLBACK_UNKNOWN_FAILED', stage: 'user_resolution', exception_type: 'PrismaClientInitializationError', prisma_error: 'P1001', operation: 'subject_lookup', operation_elapsed_ms: 42, transaction_elapsed_ms: 65 }]);
  } finally { await new Promise(resolve => instance.close(resolve)); }
});

test('Google callback maps collision, inactive, and persistence stages safely', async () => {
  for (const [code, expected, category] of [
    ['GOOGLE_EMAIL_COLLISION', 'account_exists', 'GOOGLE_ACCOUNT_COLLISION'],
    ['ACCOUNT_LOCKED', 'account_inactive', 'GOOGLE_ACCOUNT_LOCKED'],
    ['GOOGLE_USER_RESOLUTION_FAILED', 'google_failed', 'GOOGLE_USER_RESOLUTION_FAILED'],
    ['GOOGLE_USER_CREATION_FAILED', 'google_failed', 'GOOGLE_USER_CREATION_FAILED'],
    ['GOOGLE_SESSION_CREATION_FAILED', 'google_failed', 'GOOGLE_SESSION_CREATION_FAILED'],
  ]) {
    const diagnostics = [];
    const { instance, base } = await server(appWith({ logger: { warn: event => diagnostics.push(event) }, googleLogin: async () => { const error = new Error(code); error.code = code; throw error; } }));
    try {
      const start = await fetch(`${base}/google`, { redirect: 'manual' });
      const state = new URL(start.headers.get('location')).searchParams.get('state');
      const cookie = start.headers.get('set-cookie').split(';')[0];
      const callback = await fetch(`${base}/google/callback?code=x&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie } });
      assert.equal(callback.headers.get('location'), `http://localhost:5173/login?google=${expected}`);
      assert.equal(diagnostics[0].category, category);
    } finally { await new Promise(resolve => instance.close(resolve)); }
  }
});

test('Google service creates a Customer-only account with the required name fallback and app session', async () => {
  const fixture = serviceDb();
  const result = await createAuthService(fixture.db).googleLogin({ subject: 'subject-new', email: '  NguyenVanA@example.com ', name: ' ' });
  assert.equal(fixture.users.length, 1);
  assert.deepEqual(fixture.users[0], { id: 1n, email: 'nguyenvana@example.com', email_normalized: 'nguyenvana@example.com', full_name: 'nguyenvana', password_hash: null, google_subject: 'subject-new', role: 'CUSTOMER', status: 'ACTIVE', created_at: new Date('2026-10-22T00:00:00.000Z'), ownerProfile: null });
  assert.equal(result.user.capabilities.join(','), 'CUSTOMER');
  assert.equal(fixture.sessions.length, 1);
  assert.equal(result.token.length, 43);
  await assert.rejects(() => createAuthService(fixture.db).login({ email: 'nguyenvana@example.com', password: 'local-password' }), { code: 'INVALID_CREDENTIALS' });
});

test('Google service resolves stable subject without overwriting profile and rejects collision or inactive account', async () => {
  const existing = { id: 1n, email: 'local@example.com', email_normalized: 'local@example.com', full_name: 'Existing', password_hash: null, google_subject: 'subject-old', role: 'CUSTOMER', status: 'ACTIVE', ownerProfile: { id: 4n } };
  const fixture = serviceDb([existing]);
  const returning = await createAuthService(fixture.db).googleLogin({ subject: 'subject-old', email: 'changed@example.com', name: 'Changed' });
  assert.equal(returning.user.full_name, 'Existing');
  assert.equal(returning.user.capabilities.join(','), 'CUSTOMER,OWNER');
  assert.equal(returning.user.has_local_password, false);
  assert.equal(fixture.users.length, 1);
  assert.equal(fixture.sessions.length, 1);
  assert.equal(existing.email_normalized, 'local@example.com');
  assert.equal(existing.google_subject, 'subject-old');
  assert.equal(existing.password_hash, null);
  await assert.rejects(() => createAuthService(fixture.db).googleLogin({ subject: 'subject-other', email: 'local@example.com', name: 'Other' }), { code: 'GOOGLE_EMAIL_COLLISION' });
  assert.equal(fixture.users.length, 1);
  assert.equal(fixture.sessions.length, 1);
  assert.equal(existing.google_subject, 'subject-old');
  existing.status = 'LOCKED';
  await assert.rejects(() => createAuthService(fixture.db).googleLogin({ subject: 'subject-old', email: 'local@example.com', name: 'Existing' }), { code: 'ACCOUNT_LOCKED' });
  assert.equal(fixture.sessions.length, 1);
});

test('Google service classifies Prisma operation and transaction failures without raw database details', async () => {
  const resolutionFixture = serviceDb();
  const resolutionError = new Error('opaque connection value');
  resolutionError.name = 'PrismaClientKnownRequestError';
  resolutionError.code = 'P2024';
  resolutionFixture.db.user.findUnique = async () => { throw resolutionError; };
  await assert.rejects(
    () => createAuthService(resolutionFixture.db).googleLogin({ subject: 'subject', email: 'user@example.com', name: 'User' }),
    error => {
      assert.equal(error.code, 'GOOGLE_USER_RESOLUTION_FAILED');
      assert.equal(error.diagnostic.exception_type, 'PrismaClientKnownRequestError');
      assert.equal(error.diagnostic.prisma_error, 'P2024');
      assert.equal(error.diagnostic.operation, 'subject_lookup');
      assert.ok(Number.isInteger(error.diagnostic.operation_elapsed_ms));
      assert.ok(Number.isInteger(error.diagnostic.transaction_elapsed_ms));
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /opaque|connection/i);
      return true;
    },
  );
  const transactionFixture = serviceDb();
  const transactionError = new Error('opaque database credential');
  transactionError.name = 'PrismaClientInitializationError';
  transactionError.code = 'P1001';
  transactionFixture.db.$transaction = async () => { throw transactionError; };
  await assert.rejects(
    () => createAuthService(transactionFixture.db).googleLogin({ subject: 'subject', email: 'user@example.com', name: 'User' }),
    error => {
      assert.equal(error.code, 'GOOGLE_USER_TRANSACTION_FAILED');
      assert.equal(error.diagnostic.operation, 'transaction_open');
      assert.equal(error.diagnostic.prisma_error, 'P1001');
      return true;
    },
  );
});

test('Google login waits for transaction acquisition without changing execution timeout', async () => {
  const fixture = serviceDb();
  const transaction = fixture.db.$transaction;
  let options;
  fixture.db.$transaction = async (callback, receivedOptions) => {
    options = receivedOptions;
    if (!receivedOptions?.maxWait || receivedOptions.maxWait <= 2000) {
      const error = new Error('connection details must not be logged');
      error.name = 'PrismaClientKnownRequestError';
      error.code = 'P2028';
      throw error;
    }
    return transaction(callback);
  };
  const result = await createAuthService(fixture.db).googleLogin({ subject: 'subject-new', email: 'user@example.com', name: 'User' });
  assert.equal(result.user.email, 'user@example.com');
  assert.deepEqual(options, { maxWait: 20000, timeout: 20000 });
  assert.equal(fixture.users.length, 1);
  assert.equal(fixture.sessions.length, 1);
});

test('Google P2028 at session insert identifies the operation and rolls back new user', async () => {
  const users = [];
  const sessions = [];
  const p2028 = new Error('transaction expired with private data');
  p2028.name = 'PrismaClientKnownRequestError';
  p2028.code = 'P2028';
  const db = {
    async $transaction(callback) {
      const pendingUsers = [];
      const tx = {
        async $queryRaw() { return [{ now: new Date('2026-10-22T00:00:00.000Z') }]; },
        user: {
          async findUnique() { return null; },
          async create({ data }) { const user = { id: 1n, ...data, ownerProfile: null }; pendingUsers.push(user); return user; },
        },
        authSession: { async create() { throw p2028; } },
      };
      const result = await callback(tx);
      users.push(...pendingUsers);
      return result;
    },
  };
  await assert.rejects(() => createAuthService(db).googleLogin({ subject: 'subject-new', email: 'user@example.com', name: 'User' }), error => {
    assert.equal(error.code, 'GOOGLE_SESSION_CREATION_FAILED');
    assert.equal(error.diagnostic.prisma_error, 'P2028');
    assert.equal(error.diagnostic.operation, 'session_insert');
    assert.ok(Number.isInteger(error.diagnostic.operation_elapsed_ms));
    assert.ok(Number.isInteger(error.diagnostic.transaction_elapsed_ms));
    assert.doesNotMatch(JSON.stringify(error.diagnostic), /private data|user@example|subject-new/i);
    return true;
  });
  assert.equal(users.length, 0);
  assert.equal(sessions.length, 0);
});

test('Google P2028 after transaction callback is attributed to commit boundary', async () => {
  const fixture = serviceDb();
  const p2028 = new Error('transaction closed');
  p2028.name = 'PrismaClientKnownRequestError';
  p2028.code = 'P2028';
  fixture.db.$transaction = async callback => {
    await callback(fixture.db);
    throw p2028;
  };
  await assert.rejects(() => createAuthService(fixture.db).googleLogin({ subject: 'subject-new', email: 'user@example.com', name: 'User' }), error => {
    assert.equal(error.code, 'GOOGLE_USER_TRANSACTION_FAILED');
    assert.equal(error.diagnostic.prisma_error, 'P2028');
    assert.equal(error.diagnostic.operation, 'transaction_commit');
    return true;
  });
});
