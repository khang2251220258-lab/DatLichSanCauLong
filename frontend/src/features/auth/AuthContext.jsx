import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { AuthContext } from './useAuth';
import { authResponse } from '../../services/responseValidators';
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
  const generation = useRef(0);
  const refresh = async () => {
    const version = ++generation.current;
    setSession({ ...guest, status: 'loading' });
    const result = await readSession();
    if (version === generation.current) setSession(result);
  };
  useEffect(() => {
    const controller = new AbortController();
    const version = ++generation.current;
    readSession(controller.signal).then(result => {
      if (!controller.signal.aborted && version === generation.current) setSession(result);
    });
    return () => controller.abort();
  }, []);
  const acceptLogin = data => {
    generation.current++;
    setSession({ status: 'authenticated', user: data.user, csrfToken: data.csrf_token, error: null });
  };
  const clearSession = () => { generation.current++; setSession(guest); };
  const request = async (path, options = {}) => {
    try { return await api(path, { ...options, csrfToken: session.csrfToken }); }
    catch (error) {
      if (error.status === 401 && error.code === 'SESSION_EXPIRED') clearSession();
      throw error;
    }
  };
  return <AuthContext.Provider value={{ ...session, refresh, acceptLogin, clearSession, request }}>{children}</AuthContext.Provider>;
}
