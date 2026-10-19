/* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { readPublicSnapshot, writePublicSnapshot } from '../../services/publicReadCache';

export function usePublicRead(path, validate, { cache = true } = {}) {
  const generation = useRef(0), active = useRef(null), validateRef = useRef(validate);
  useEffect(() => { validateRef.current = validate; }, [validate]);
  const [state, setState] = useState(() => {
    const value = cache ? readPublicSnapshot(path) : null;
    return { key:path, value, loading:!value, busy:false, error:null, refreshError:null };
  });
  const refresh = useCallback(async () => {
    if (!path) { setState({ key:path, value:null, loading:false, busy:false, error:null, refreshError:null }); return { idle:true }; }
    const version = ++generation.current;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setState(previous => previous.key === path && previous.value
      ? { ...previous, loading:false, busy:true, error:null, refreshError:null }
      : { key:path, value:null, loading:true, busy:true, error:null, refreshError:null });
    try {
      const value = await api(path, { signal:controller.signal, validate:validateRef.current });
      if (controller.signal.aborted || version !== generation.current) return { aborted:true };
      if (cache) writePublicSnapshot(path, value);
      setState({ key:path, value, loading:false, busy:false, error:null, refreshError:null });
      return { value, verified:true };
    } catch (error) {
      if (controller.signal.aborted || version !== generation.current || error?.code === 'REQUEST_CANCELLED') return { aborted:true };
      setState(previous => previous.key === path && previous.value
        ? { ...previous, loading:false, busy:false, error:null, refreshError:error }
        : { key:path, value:null, loading:false, busy:false, error, refreshError:null });
      return { error };
    } finally { if (active.current === controller) active.current = null; }
  }, [path, cache]);
  useEffect(() => {
    if (!path) { setState({ key:path, value:null, loading:false, busy:false, error:null, refreshError:null }); return undefined; }
    const cached = cache ? readPublicSnapshot(path) : null;
    setState(previous => cached ? { key:path, value:cached, loading:false, busy:true, error:null, refreshError:null }
      : previous.key === path ? previous : { key:path, value:null, loading:true, busy:false, error:null, refreshError:null });
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void refresh(); });
    return () => { disposed = true; generation.current++; active.current?.abort(); active.current = null; };
  }, [path, refresh, cache]);
  return state.key === path ? { ...state, key:path, refresh, retry:refresh } : { value:null, loading:true, busy:false, error:null, refreshError:null, key:path, refresh, retry:refresh };
}
