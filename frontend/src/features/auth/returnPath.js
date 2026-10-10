export function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const parsed = new URL(value, 'http://app.local');
    return parsed.origin === 'http://app.local' && parsed.pathname.startsWith('/') ? parsed.pathname + parsed.search + parsed.hash : '/';
  } catch { return '/'; }
}
