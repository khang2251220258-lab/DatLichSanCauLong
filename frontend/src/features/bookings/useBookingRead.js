import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';

export function useBookingRead(path, syncOnFocus = false, validate) {
  const auth = useAuth(), request = useRef(auth.request);
  useEffect(() => { request.current = auth.request; }, [auth.request]);
  const active = useRef(null), [state, setState] = useState({});
  const refresh = useCallback(async () => {
    if (active.current) return active.current.promise;
    const controller = new AbortController();
    setState(previous => ({ ...previous, busy:true }));
    const operation=(async()=>{try {
        const value = await request.current(path, { signal:controller.signal, validate });
        if (!controller.signal.aborted) setState({ path, value, receivedAt:performance.now(), busy:false, error:null });
        return { value };
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ ...previous, path, error, busy:false }));
        return { error };
      } finally { if (active.current?.controller === controller) active.current = null; }
    })();
    active.current={controller,promise:operation};
    return operation;
  }, [path, validate]);
  useEffect(() => {
    void refresh();
    const focus = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    if (syncOnFocus) { window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus); }
    return () => {
      active.current?.controller.abort(); active.current = null;
      window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus);
    };
  }, [refresh, syncOnFocus]);
  return { ...(state.path === path ? state : {}), loading:state.path !== path, refresh };
}
