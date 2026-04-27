// Notifications hook + provider
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const NotificationContext = createContext<any>(null);
export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const channel = supabase.channel('notifications').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload: any) => {
      setNotifications((prev) => [payload.new, ...prev]);
      addToast(payload.new.title, payload.new.type);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (!error) setNotifications(data || []);
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (!error) setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const addToast = (message: string, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  return <NotificationContext.Provider value={{ notifications, toasts, markAsRead, addToast, fetchNotifications }}>{children}</NotificationContext.Provider>;
};
