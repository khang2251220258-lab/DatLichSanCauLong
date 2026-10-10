// Called once before rendering the router; the fragment never enters router state.
export function captureResetToken(browser = window) {
  let token = null;
  if (browser.location.pathname === '/reset-password') {
    const params = new URLSearchParams(browser.location.hash.slice(1));
    const values = params.getAll('token');
    if (values.length === 1 && values[0]) token = values[0];
    browser.history.replaceState(browser.history.state, '', browser.location.pathname + browser.location.search);
  }
  return { read: () => token, clear: () => { token = null; } };
}
