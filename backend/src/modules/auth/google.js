import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const stateLifetimeMs = 10 * 60 * 1000;
const stateCookieName = 'booking_google_oauth_state';
const scopes = ['openid', 'email', 'profile'];

export class GoogleOAuthDiagnosticError extends Error {
  constructor(code, diagnostic) {
    super(code);
    this.name = 'GoogleOAuthDiagnosticError';
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

const providerErrors = new Set(['invalid_grant', 'invalid_client', 'redirect_uri_mismatch', 'unauthorized_client', 'invalid_request', 'access_denied', 'temporarily_unavailable']);
const exceptionTypes = new Set(['GaxiosError', 'Error', 'FetchError', 'GoogleAuthError']);
function codeExchangeDiagnostic(error) {
  const exception_type = exceptionTypes.has(error?.name) ? error.name : 'UnknownError';
  const status = error?.response?.status;
  const http_status = Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
  const provider_error = typeof error?.response?.data?.error === 'string' && providerErrors.has(error.response.data.error)
    ? error.response.data.error
    : undefined;
  return Object.freeze({ exception_type, ...(http_status ? { http_status } : {}), ...(provider_error ? { provider_error } : {}) });
}

const equal = (left, right) => {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && timingSafeEqual(a, b);
};

const signature = (secret, value) => createHmac('sha256', secret).update(value).digest('base64url');

export const googleStateCookie = Object.freeze({ name: stateCookieName, lifetimeMs: stateLifetimeMs });

export function createOAuthState(secret, timestamp = Date.now()) {
  const value = `${randomBytes(32).toString('base64url')}.${timestamp + stateLifetimeMs}`;
  return `${value}.${signature(secret, value)}`;
}

export function verifyOAuthState(state, cookieValue, secret, timestamp = Date.now()) {
  if (typeof state !== 'string' || typeof cookieValue !== 'string' || !equal(state, cookieValue)) return false;
  const pieces = state.split('.');
  if (pieces.length !== 3 || !/^[A-Za-z0-9_-]{43}$/.test(pieces[0]) || !/^\d{1,16}$/.test(pieces[1]) || !/^[A-Za-z0-9_-]{43}$/.test(pieces[2])) return false;
  const value = `${pieces[0]}.${pieces[1]}`;
  const expiresAt = Number(pieces[1]);
  return Number.isSafeInteger(expiresAt) && expiresAt > timestamp && equal(pieces[2], signature(secret, value));
}

function normalizeIdentity(payload) {
  const subject = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const emailVerified = payload?.email_verified === true || payload?.email_verified === 'true';
  if (!emailVerified) throw new GoogleOAuthDiagnosticError('GOOGLE_EMAIL_NOT_VERIFIED');
  if (!subject || [...subject].length > 255 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GoogleOAuthDiagnosticError('GOOGLE_IDENTITY_INVALID');
  return { subject, email, name: typeof payload.name === 'string' ? payload.name : '' };
}

export function createGoogleOAuth(config, client = config.googleOAuth?.enabled
  ? new OAuth2Client(config.googleOAuth.clientId, config.googleOAuth.clientSecret, config.googleOAuth.redirectUri)
  : null) {
  if (!config.googleOAuth?.enabled) return Object.freeze({ enabled: false });
  return {
    enabled: true,
    createState: () => createOAuthState(config.googleOAuth.stateSecret),
    authorizationUrl: state => client.generateAuthUrl({
      access_type: 'online',
      prompt: 'select_account',
      scope: scopes,
      state,
    }),
    async exchangeAndVerify(code) {
      let tokenResult;
      try { tokenResult = await client.getToken(code); }
      catch (error) { throw new GoogleOAuthDiagnosticError('GOOGLE_CODE_EXCHANGE_FAILED', codeExchangeDiagnostic(error)); }
      const idToken = tokenResult?.tokens?.id_token;
      if (typeof idToken !== 'string' || !idToken) throw new GoogleOAuthDiagnosticError('GOOGLE_ID_TOKEN_MISSING');
      let ticket;
      try { ticket = await client.verifyIdToken({ idToken, audience: config.googleOAuth.clientId }); }
      catch { throw new GoogleOAuthDiagnosticError('GOOGLE_ID_TOKEN_VERIFICATION_FAILED'); }
      return normalizeIdentity(ticket?.getPayload?.());
    },
  };
}

export function readCookie(req, name) {
  const prefix = `${name}=`;
  const matches = (req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(prefix));
  return matches.length === 1 ? matches[0].slice(prefix.length) : null;
}
