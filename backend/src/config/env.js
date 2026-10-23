import 'dotenv/config';
import { bookingFlowVersion } from '../modules/bookings/config.js';

if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) throw new Error('FRONTEND_URL_REQUIRED');

const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || '';
  const stateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET || '';
  const values = [clientId, clientSecret, redirectUri, stateSecret];
  if (values.every(value => !value)) return Object.freeze({ enabled: false });
  if (values.some(value => !value) || [...stateSecret].length < 32) throw new Error('GOOGLE_OAUTH_CONFIG_INVALID');
  let parsed;
  try { parsed = new URL(redirectUri); } catch { throw new Error('GOOGLE_OAUTH_CONFIG_INVALID'); }
  if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && parsed.hostname === 'localhost')) throw new Error('GOOGLE_OAUTH_CONFIG_INVALID');
  return Object.freeze({ enabled: true, clientId, clientSecret, redirectUri: parsed.toString(), stateSecret });
}

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  bookingFlowVersion: bookingFlowVersion(process.env.BOOKING_FLOW_VERSION, { required: process.env.NODE_ENV === 'production' }),
  googleOAuth: googleOAuthConfig(),
};
