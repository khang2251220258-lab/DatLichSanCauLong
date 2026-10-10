import 'dotenv/config';

if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) throw new Error('FRONTEND_URL_REQUIRED');

const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};
