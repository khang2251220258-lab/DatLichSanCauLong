import { useEffect, useState } from 'react';

export function useServerCountdown(expiresAt, serverTime, receivedAt, sync) {
  const [elapsed, setElapsed] = useState(() => performance.now() - receivedAt);
  const remaining = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.parse(serverTime) - elapsed) / 1000));
  useEffect(() => {
    const timer = setInterval(() => setElapsed(performance.now() - receivedAt), 250);
    return () => clearInterval(timer);
  }, [receivedAt]);
  useEffect(() => { if (remaining === 0) sync(expiresAt); }, [remaining, sync, expiresAt]);
  return remaining;
}
