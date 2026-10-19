import { useCallback, useEffect, useRef, useState } from 'react';

// Keeps private delivery URLs short-lived without trusting the browser wall clock.
export function useSignedImage(read, data) {
  const refreshRead = read.refresh;
  const url = data?.proof_image_url || '';
  const expiresAt = data?.proof_image_expires_at || '';
  const serverTime = read.value?.meta?.server_time || '';
  const [expiredUrl, setExpiredUrl] = useState('');
  const [failedUrl, setFailedUrl] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const automaticRetryUsed = useRef(false);
  const automaticRefresh = useRef(false);

  const refresh = useCallback(async (manual = false) => {
    if (automaticRefresh.current) return;
    if (manual) automaticRetryUsed.current = false;
    automaticRefresh.current = true;
    setRefreshError('');
    const result = await refreshRead();
    automaticRefresh.current = false;
    if (result?.error) setRefreshError(result.error.code || 'API_ERROR');
    return result;
  }, [refreshRead]);

  useEffect(() => {
    if (!url || !expiresAt || !serverTime || !Number.isFinite(read.receivedAt)) return undefined;
    const elapsed = Math.max(0, performance.now() - read.receivedAt);
    const remaining = Date.parse(expiresAt) - Date.parse(serverTime) - elapsed;
    const timer = setTimeout(() => {
      setExpiredUrl(url);
      void refresh(false);
    }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [url, expiresAt, serverTime, read.receivedAt, refresh]);

  const onError = useCallback(async () => {
    if (automaticRetryUsed.current) {
      setFailedUrl(url);
      return;
    }
    automaticRetryUsed.current = true;
    const result = await refresh(false);
    if (result?.error) setFailedUrl(url);
  }, [refresh, url]);

  const onLoad = useCallback(() => {
    automaticRetryUsed.current = false;
    setFailedUrl('');
    setRefreshError('');
  }, []);

  const manualRetry = useCallback(async () => {
    setExpiredUrl('');
    setFailedUrl('');
    return refresh(true);
  }, [refresh]);

  return {
    expired: Boolean(url) && expiredUrl === url,
    failed: Boolean(url) && failedUrl === url,
    refreshError,
    onError,
    onLoad,
    manualRetry,
  };
}
