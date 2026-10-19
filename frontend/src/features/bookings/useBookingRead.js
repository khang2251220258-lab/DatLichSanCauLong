import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { protectedIdentity, readProtectedSnapshot, writeProtectedSnapshot } from '../../services/protectedReadCache';

export function useBookingRead(path, syncOnFocus = false, validate, { cache = false } = {}) {
  const auth = useAuth(), request = useRef(auth.request);
  const identity = protectedIdentity(auth.user);
  useEffect(() => { request.current = auth.request; }, [auth.request]);
  const active = useRef(null), generation = useRef(0), [state, setState] = useState(() => {
    const value = cache ? readProtectedSnapshot(identity, path) : null;
    return value ? { path, value, receivedAt:performance.now(), revision:0, busy:false, error:null } : {};
  });
  const cancelActive = useCallback(() => {
    generation.current++;
    const operation = active.current;
    operation?.controller.abort();
    if (active.current === operation) active.current = null;
  }, []);
  const refresh = useCallback(async () => {
    if (active.current) return active.current.promise;
    const version = ++generation.current;
    const controller = new AbortController();
    setState(previous => ({ ...previous, busy:true }));
    const operation=(async()=>{try {
        const value = await request.current(path, { signal:controller.signal, validate });
        if (controller.signal.aborted || version !== generation.current) return { aborted:true };
        if (cache) writeProtectedSnapshot(identity, path, value);
        setState({ path, value, receivedAt:performance.now(), revision:version, busy:false, error:null });
        return { value, verified:true };
      } catch (error) {
        if (controller.signal.aborted || version !== generation.current) return { aborted:true };
        setState(previous => ({ ...previous, path, error, busy:false }));
        return { error };
      } finally { if (active.current?.controller === controller) active.current = null; }
    })();
    active.current={controller,promise:operation};
    return operation;
  }, [path, validate, cache, identity]);
  useEffect(() => {
    const cached = cache ? readProtectedSnapshot(identity, path) : null;
    if (cached) setState({ path, value:cached, receivedAt:performance.now(), revision:generation.current, busy:true, error:null });
    // React StrictMode mounts, cleans up, then mounts again in development.
    // Defer the initial read so the discarded probe never reaches the API.
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void refresh(); });
    const focus = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    if (syncOnFocus) { window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus); }
    return () => {
      disposed = true;
      cancelActive();
      window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus);
    };
  }, [cancelActive, refresh, syncOnFocus, cache, identity, path]);
  return { ...(state.path === path ? state : {}), loading:state.path !== path, refresh };
}
