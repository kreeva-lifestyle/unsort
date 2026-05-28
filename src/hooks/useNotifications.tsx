// Notifications hook + provider
import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

interface NotificationContextValue {
  notifications: any[];
  toasts: { id: number; message: string; type: string }[];
  markAsRead: (id: string) => Promise<void>;
  addToast: (message: string, type?: string) => void;
  fetchNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);
export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const { user } = useAuth();

  const lastToastRef = useRef<{ message: string; type: string; ts: number } | null>(null);
  const toastIdRef = useRef(0);
  const addToast = useCallback((message: string, type = 'info') => {
    const now = Date.now();
    const last = lastToastRef.current;
    if (last && last.message === message && last.type === type && now - last.ts < 200) return;
    lastToastRef.current = { message, type, ts: now };
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
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
