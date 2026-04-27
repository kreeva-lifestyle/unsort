// Auth state hook + provider
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext<any>(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => { if (mounted) { setLoading(false); setReady(true); } }, 3000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!mounted) return;
        if (refreshed?.session?.user) {
          setUser(refreshed.session.user);
          const { data: prof, error: profErr } = await supabase.from('profiles').select('id, email, full_name, role, is_active, phone, created_at, updated_at').eq('id', refreshed.session.user.id).maybeSingle();
          if (profErr) console.error('Profile load failed:', profErr.message);
          if (mounted) setProfile(prof);
        } else {
          setUser(null); setProfile(null);
        }
      } else {
        setUser(null); setProfile(null);
      }
      if (mounted) { setLoading(false); setReady(true); clearTimeout(timeout); }
    }).catch(() => { if (mounted) { setLoading(false); setReady(true); clearTimeout(timeout); } });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        supabase.from('profiles').select('id, email, full_name, role, is_active, phone, created_at, updated_at').eq('id', session.user.id).maybeSingle().then(({ data, error }) => {
          if (error) console.error('Profile load failed:', error.message);
          if (mounted) { setProfile(data); setLoading(false); setReady(true); }
        });
      } else {
        setUser(null); setProfile(null);
        setLoading(false); setReady(true);
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    return { error };
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  // Session timeout — auto-logout after 30 min of inactivity.
  // Reason flag is read by Login.tsx to show "session expired" toast.
  useEffect(() => {
    if (!user) return;
    let timer: any;
    const expire = () => {
      try { localStorage.setItem('signOutReason', 'session_expired'); } catch {}
      supabase.auth.signOut();
    };
    const resetTimer = () => { clearTimeout(timer); timer = setTimeout(expire, 30 * 60 * 1000); };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, resetTimer)); };
  }, [user]);

  return <AuthContext.Provider value={{ user, profile, loading, ready, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
};
