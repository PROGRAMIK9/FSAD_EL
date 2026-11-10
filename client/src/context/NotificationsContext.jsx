import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useSocketEvent } from '../hooks/useSocketEvent.js';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    () =>
      api
        .get('/notifications')
        .then(setItems)
        .catch(() => {})
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  useSocketEvent('notification:new', (n) => {
    setItems((list) => [n, ...list.filter((x) => x._id !== n._id)]);
    toast(n.title || 'New notification', { icon: '🔔' });
  });

  const markRead = useCallback(async (id) => {
    const updated = await api.patch(`/notifications/${id}/read`);
    setItems((list) => list.map((n) => (n._id === id ? updated : n)));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.patch('/notifications/read-all');
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now })));
  }, []);

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <NotificationsContext.Provider value={{ items, loading, unread, reload, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);
