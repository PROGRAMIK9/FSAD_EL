import { io } from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const origin = import.meta.env.VITE_SOCKET_URL || apiUrl.replace(/\/api\/?$/, '');

let socket;

/** One shared Socket.IO connection for the whole app, authenticated by the session cookie. */
export function getSocket() {
  if (!socket) socket = io(origin, { withCredentials: true, autoConnect: true });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = undefined;
}
