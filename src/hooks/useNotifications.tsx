// Notifications hook + provider
import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const NotificationContext = createContext<any>(null);
export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const { user } = useAuth();

  const addToast = useCallback((message: string, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => {
      if (prev.some((t) => t.message === message && t.type === type)) return prev;
      return [...prev, { id, message, type }];
    });
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('notifications').select('id, user_id, title, message, type, entity_id, is_read, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (!error) {
      setNotifications(data || []);
      try { const c = (data || []).filter((n: any) => !n.is_read).length; if (c > 0) (navigator as any).setAppBadge?.(c); else (navigator as any).clearAppBadge?.(); } catch {}
    }
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (!error) {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
        try { const c = next.filter((n: any) => !n.is_read).length; if (c > 0) (navigator as any).setAppBadge?.(c); else (navigator as any).clearAppBadge?.(); } catch {}
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const channel = supabase.channel('notifications').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload: any) => {
      setNotifications((prev) => [payload.new, ...prev]);
      addToast(payload.new.title, payload.new.type);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, addToast, fetchNotifications]);

  const value = useMemo(() => ({ notifications, toasts, markAsRead, addToast, fetchNotifications }), [notifications, toasts, markAsRead, addToast, fetchNotifications]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
