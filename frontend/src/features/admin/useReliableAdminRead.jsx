/* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps, react/only-export-components */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { protectedIdentity, readProtectedSnapshot, writeProtectedSnapshot } from '../../services/protectedReadCache';

export const isUnknownMutationResult = error => ['REQUEST_TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error?.code);

export function useReliableAdminRead(path, validate, { cache = false } = {}) {
  const auth = useAuth();
  const requestRef = useRef(auth.request);
  const validateRef = useRef(validate);
  useEffect(() => { requestRef.current = auth.request; }, [auth.request]);
  useEffect(() => { validateRef.current = validate; }, [validate]);
  const identity = protectedIdentity(auth.user);
  const resourceKey = path ? `${identity}:${path}` : null;
  const generation = useRef(0);
  const active = useRef(null);
  const [state, setState] = useState(() => {
    const value = cache ? readProtectedSnapshot(identity, path) : null;
    return { key:resourceKey, value, loading:Boolean(path) && !value, busy:false, error:null, refreshError:null };
  });

  const refresh = useCallback(async () => {
    if (!path || !resourceKey) return { skipped:true };
    const version = ++generation.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState(previous => previous.key === resourceKey && previous.value
      ? { ...previous, busy:true, error:null, refreshError:null }
      : { key:resourceKey, value:null, loading:true, busy:true, error:null, refreshError:null });
    try {
      const value = await requestRef.current(path, { validate:validateRef.current, signal:controller.signal });
      if (controller.signal.aborted || version !== generation.current) return { aborted:true };
      if (cache) writeProtectedSnapshot(identity, path, value);
      setState({ key:resourceKey, value, loading:false, busy:false, error:null, refreshError:null });
      return { value, verified:true };
    } catch (error) {
      if (controller.signal.aborted || version !== generation.current || error?.code === 'REQUEST_CANCELLED') return { aborted:true };
      setState(previous => previous.key === resourceKey && previous.value
        ? { ...previous, loading:false, busy:false, error:null, refreshError:error }
        : { key:resourceKey, value:null, loading:false, busy:false, error, refreshError:null });
      throw error;
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [path, resourceKey, cache, identity]);

  useEffect(() => {
    if (!resourceKey) {
      generation.current++;
      active.current?.abort();
      active.current = null;
      setState({ key:null, value:null, loading:false, busy:false, error:null, refreshError:null });
      return undefined;
    }
    const cached = cache ? readProtectedSnapshot(identity, path) : null;
    if (cached) setState({ key:resourceKey, value:cached, loading:false, busy:true, error:null, refreshError:null });
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void refresh().catch(() => {}); });
    return () => {
      disposed = true;
      generation.current++;
      active.current?.abort();
      active.current = null;
    };
  }, [refresh, resourceKey, cache, identity, path]);

  if (state.key !== resourceKey) return { value:null, loading:Boolean(resourceKey), busy:false, error:null, refreshError:null, refresh };
  return { ...state, refresh };
}

export function AdminReadStatus({ read, message }) {
  if (read.refreshError) return <div className="admin-read-warning" role="alert"><span>{message}</span><button type="button" onClick={() => void read.refresh().catch(() => {})}>Thử đồng bộ lại</button></div>;
  if (read.busy && read.value) return <p className="admin-read-sync" role="status">Đang đồng bộ dữ liệu…</p>;
  return null;
}

export function AdminUnresolved({ message, onRetry }) {
  return <div className="admin-unresolved" role="alert"><span>{message}</span><button type="button" onClick={onRetry}>Kiểm tra lại dữ liệu</button></div>;
}
