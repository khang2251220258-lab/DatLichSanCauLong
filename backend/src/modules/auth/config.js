export const authConfig = Object.freeze({
  hash: { memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 },
  lifetimeMs: 7 * 24 * 60 * 60 * 1000,
  windowMs: 15 * 60 * 1000,
  registerLimit: 5, loginLimit: 20, failedLimit: 5,
  resetLifetimeMs: 15 * 60 * 1000,
  forgotIpLimit: 5, forgotEmailLimit: 3, resetIpLimit: 10,
  cookieName: 'booking_session',
});
