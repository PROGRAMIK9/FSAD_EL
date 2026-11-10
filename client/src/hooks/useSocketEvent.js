import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket.js';

/** Subscribes to a Socket.IO event for the lifetime of the component. */
export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const socket = getSocket();
    const listener = (...args) => ref.current(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [event]);
}
