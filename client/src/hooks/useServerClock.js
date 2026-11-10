import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks the difference between the server clock and this device so countdowns
 * match the server's deadline even when the device clock is wrong.
 * Call `sync(serverNowIso)` whenever a response includes the server time.
 */
export function useServerClock(tickMs = 1000) {
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  const sync = useCallback((serverNow) => {
    if (serverNow) offset.current = new Date(serverNow).getTime() - Date.now();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset.current), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  return { now: now, sync, serverTime: () => Date.now() + offset.current };
}
