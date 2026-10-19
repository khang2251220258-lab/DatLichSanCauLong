export function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const parsed = new URL(value, 'http://app.local');
    return parsed.origin === 'http://app.local' && parsed.pathname.startsWith('/') ? parsed.pathname + parsed.search + parsed.hash : '/';
  } catch { return '/'; }
}

const has = (user, capability) => Array.isArray(user?.capabilities) && user.capabilities.includes(capability);

export function landingPath(user) {
  if (has(user, 'ADMIN')) return '/admin/facilities';
  if (has(user, 'OWNER')) return '/owner/facilities';
  return '/';
}

export function authorizedReturnPath(value, user) {
  if (typeof value !== 'string') return landingPath(user);
  const path = safeReturnPath(value);
  const pathname = new URL(path, 'http://app.local').pathname;
  if (pathname === '/' || pathname === '/profile' || pathname === '/facilities' || /^\/facilities\/[^/]+$/.test(pathname)) return path;
  // Never restore a resource-scoped booking URL after login. Capabilities
  // establish role access, not ownership of an id captured by a prior account.
  if (has(user, 'CUSTOMER') && (pathname === '/bookings' || pathname === '/booking-series' || pathname === '/owner-request' || /^\/facilities\/[^/]+\/(?:booking|recurring)-confirm$/.test(pathname))) return path;
  if (has(user, 'OWNER') && (pathname === '/owner/facilities' || pathname === '/owner/bookings' || pathname === '/owner/booking-series' || pathname === '/owner/analytics')) return path;
  if (has(user, 'ADMIN') && ['/admin/facilities', '/admin/owner-requests', '/admin/amenities'].includes(pathname)) return path;
  return landingPath(user);
}
