// Auth state hook + provider
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { isFaceIdEnrolledFor, isAppLocked, lockApp, unlockApp, verifyFaceId, getFaceIdEnrollment } from '../lib/faceId';

interface AuthContextValue {
  user: any;
  profile: any;
  loading: boolean;
  ready: boolean;
  locked: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  lockNow: () => void;
  unlockWithFaceId: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  // Face ID lock: the session survives on-device; the UI gates on `locked`
  // until the platform authenticator verifies the user (or email re-auth).
  const [locked, setLocked] = useState(() => isAppLocked() && !!getFaceIdEnrollment());

  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => { if (mounted) { setLoading(false); setReady(true); } }, 3000);

    // Deactivated accounts (profiles.is_active = false) are signed out the
    // moment their profile loads — without this, a revoked user's session
    // (or a password reset) kept working. Returns false when revoked.
    const enforceActive = (prof: any): boolean => {
      if (prof && prof.is_active === false) {
        try { localStorage.setItem('signOutReason', 'deactivated'); } catch {}
        supabase.auth.signOut();
        return false;
      }
      return true;
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!mounted) return;
        if (refreshed?.session?.user) {
          setUser(refreshed.session.user);
          const { data: prof, error: profErr } = await supabase.from('profiles').select('id, email, full_name, role, is_active, phone, created_at, updated_at, module_access').eq('id', refreshed.session.user.id).maybeSingle();
          if (profErr) console.error('Profile load failed:', profErr.message);
          if (!enforceActive(prof)) { if (mounted) { setUser(null); setProfile(null); } }
          else if (mounted) setProfile(prof);
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
        supabase.from('profiles').select('id, email, full_name, role, is_active, phone, created_at, updated_at, module_access').eq('id', session.user.id).maybeSingle().then(({ data, error }) => {
          if (error) console.error('Profile load failed:', error.message);
          if (!mounted) return;
          if (!enforceActive(data)) { setUser(null); setProfile(null); setLoading(false); setReady(true); return; }
          setProfile(data); setLoading(false); setReady(true);
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
    // A full email re-auth always clears the biometric lock.
    if (!error) { unlockApp(); setLocked(false); }
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    return { error };
  };

  // With Face ID enrolled for this user, "sign out" LOCKS the app (session
  // stays on-device so biometric unlock is instant). Disabling Face ID in
  // Profile settings restores the full sign-out behavior.
  const signOut = async () => {
    if (user && isFaceIdEnrolledFor(user.id)) { lockApp(); setLocked(true); return; }
    await supabase.auth.signOut();
  };

  const lockNow = () => { lockApp(); setLocked(true); };

  // Blazing-fast path: one OS biometric prompt, zero network. The kept
  // session must still exist — if it evaporated, fail closed to email login.
  const unlockWithFaceId = async (): Promise<{ error?: string }> => {
    if (!user || !isFaceIdEnrolledFor(user.id)) {
      return { error: 'Session ended — sign in with email once to re-enable Face ID.' };
    }
    const res = await verifyFaceId();
    if (!res.ok) return { error: res.error };
    unlockApp(); setLocked(false);
    return {};
  };

  // Session timeout after 30 min of inactivity: lock when Face ID is
  // enrolled (one-tap resume), full sign-out otherwise.
  useEffect(() => {
    if (!user || locked) return;
    let timer: any;
    const expire = () => {
      if (isFaceIdEnrolledFor(user.id)) { lockApp(); setLocked(true); return; }
      try { localStorage.setItem('signOutReason', 'session_expired'); } catch {}
      supabase.auth.signOut();
    };
    const resetTimer = () => { clearTimeout(timer); timer = setTimeout(expire, 30 * 60 * 1000); };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, resetTimer)); };
  }, [user, locked]);

  return <AuthContext.Provider value={{ user, profile, loading, ready, locked, signIn, signUp, signOut, lockNow, unlockWithFaceId }}>{children}</AuthContext.Provider>;
};
