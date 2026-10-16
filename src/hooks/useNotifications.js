import { useState, useEffect, useCallback, useRef } from 'react';
import db from '@/api/client';

const POLL_INTERVAL_MS = 60 * 1000;

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [listData, countData] = await Promise.all([
        db.entities.Notification.list({ limit: 50 }),
        request('/notifications/unread-count'),
      ]);
      setNotifications(listData?.items || []);
      setUnreadCount(countData?.count || 0);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id) => {
    try {
      await request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await request('/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return { notifications, unreadCount, isLoading, markRead, markAllRead, refresh };
}

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}
