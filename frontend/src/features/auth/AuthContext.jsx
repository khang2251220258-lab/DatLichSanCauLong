import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { AuthContext } from './useAuth';
import { authResponse } from '../../services/responseValidators';
import { clearProtectedSnapshots, protectedIdentity } from '../../services/protectedReadCache';
const guest = { status: 'guest', user: null, csrfToken: null, error: null };
async function readSession(signal) {
  try {
    const { data } = await api('/auth/session', { signal, validate:authResponse });
    return { status: 'authenticated', user: data.user, csrfToken: data.csrf_token, error: null };
  } catch (error) {
    return error.status === 401 ? guest : { ...guest, status: 'error', error };
  }
}
export function AuthProvider({ children }) {
  const [session, setSession] = useState({ ...guest, status: 'loading' });
  // Memory-only: a manual logout must not restore a protected destination
  // captured for the prior account during the next login.
  const [logoutIntent, setLogoutIntent] = useState(false);
  const logoutIntentRef = useRef(false);
  const generation = useRef(0);
  const identityRef = useRef(null);
  const commitSession = result => {
    const nextIdentity = result.status === 'authenticated' ? protectedIdentity(result.user) : null;
    if (identityRef.current && identityRef.current !== nextIdentity) clearProtectedSnapshots(identityRef.current);
    identityRef.current = nextIdentity;
    setSession(result);
  };
  const refresh = async () => {
    const version = ++generation.current;
    setSession({ ...guest, status: 'loading' });
    const result = await readSession();
    if (version === generation.current) commitSession(result);
    return result;
  };
  useEffect(() => {
    const controller = new AbortController();
    const version = ++generation.current;
    // StrictMode performs a mount-cleanup-mount probe in development. Defer the
    // transport by one microtask so the discarded mount never starts a duplicate
    // session request, while the real mount remains abortable.
    queueMicrotask(() => {
      if (controller.signal.aborted || version !== generation.current) return;
      readSession(controller.signal).then(result => {
        if (!controller.signal.aborted && version === generation.current) commitSession(result);
      });
    });
    return () => controller.abort();
  }, []);
  const confirmLogin = async signal => {
    const version = ++generation.current;
    const result = await readSession(signal);
    if (version === generation.current) commitSession(result);
    return result;
  };
  const clearSession = (reason) => {
    generation.current++;
    clearProtectedSnapshots(identityRef.current);
    identityRef.current = null;
    if (reason === 'logout') {
      logoutIntentRef.current = true;
      setLogoutIntent(true);
    }
    setSession(guest);
  };
  const hasLogoutIntent = () => logoutIntentRef.current;
  const consumeLogoutIntent = () => {
    logoutIntentRef.current = false;
    setLogoutIntent(false);
  };
  const reconcileProfile = profile => setSession(current => current.status === 'authenticated' && String(current.user.id) === String(profile.id)
    ? { ...current, user: { ...current.user, ...profile } }
    : current);
  const request = async (path, options = {}) => {
    const method = options.method || 'GET';
    try { return await api(path, { ...options, csrfToken: session.csrfToken }); }
    catch (error) {
      if (error.status === 401 && error.code === 'SESSION_EXPIRED') clearSession();
      throw error;
    } finally { if (!['GET','HEAD'].includes(method)) clearProtectedSnapshots(identityRef.current); }
  };
  return <AuthContext.Provider value={{ ...session, logoutIntent, hasLogoutIntent, refresh, confirmLogin, clearSession, consumeLogoutIntent, reconcileProfile, request }}>{children}</AuthContext.Provider>;
}
