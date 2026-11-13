import { io } from 'socket.io-client';

import { API_BASE } from './api.js';

// A relative API base ("/api") means the app is served by the API: use this page's origin.
export const SOCKET_ORIGIN = import.meta.env.VITE_SOCKET_URL || (API_BASE.startsWith('/') ? window.location.origin : API_BASE.replace(/\/api\/?$/, ''));

let socket;

/** One shared Socket.IO connection for the whole app, authenticated by the session cookie. */
export function getSocket() {
  if (!socket) socket = io(SOCKET_ORIGIN, { withCredentials: true, autoConnect: true });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = undefined;
}
