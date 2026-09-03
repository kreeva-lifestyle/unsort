// Auth state hook + provider
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { isFaceIdEnrolledFor, isAppLocked, lockApp, unlockApp, verifyFaceId, getFaceIdEnrollment, disableFaceId, hasStoredSession, clearFaceIdFails } from '../lib/faceId';
import { runBeforeSignOut } from '../lib/beforeSignOut';

// A refresh that failed because the NETWORK failed, not because the session
// was rejected. auth-js tags these as retryable; offline is the common case.
const isTransientAuthError = (err: unknown): boolean => {
  const e = err as { name?: string; status?: number; message?: string } | null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!e) return false;
  if (e.name === 'AuthRetryableFetchError') return true;
  if (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504) return true;
  return /failed to fetch|load failed|network|timed? ?out|fetch/i.test(e.message || '');
};

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
  unlockWithFaceId: () => Promise<{ error?: string; code?: string }>;
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
  // Mirror for the auth-state listener: lets it skip refetching a profile the
  // startup load already holds (INITIAL_SESSION dedupe) without re-binding.
  const profileRef = useRef<any>(null);
  profileRef.current = profile;
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  // Face ID lock: the session survives on-device; the UI gates on `locked`
  // until the platform authenticator verifies the user (or email re-auth).
  // Locked only when there is something to unlock: an enrolment AND a kept
  // session. A stale lock flag with no session used to show a Face ID button
  // that could never succeed.
  const [locked, setLocked] = useState(() => {
    const l = isAppLocked() && !!getFaceIdEnrollment() && hasStoredSession();
    if (!l && isAppLocked()) { unlockApp(); try { localStorage.setItem('signOutReason', 'session_expired'); } catch {} }
    return l;
  });
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

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
        // Refresh can fail TRANSIENTLY (cold PWA start on a flaky mobile
        // connection). Nulling the user here silently discarded a perfectly
        // good on-device session and left Face ID dead until a full email
        // login. Keep the stored session's user instead: supabase-js retries
        // the refresh on the next API call, and the Face ID unlock path
        // re-validates server-side anyway (fail closed), so a genuinely
        // revoked session cannot sneak back in through this.
        const sessUser = refreshed?.session?.user ?? session.user;
        setUser(sessUser);
        const { data: prof, error: profErr } = await supabase.from('profiles').select('id, email, full_name, role, is_active, phone, created_at, updated_at, module_access').eq('id', sessUser.id).maybeSingle();
        if (profErr) console.error('Profile load failed:', profErr.message);
        if (!enforceActive(prof)) { if (mounted) { setUser(null); setProfile(null); } }
        else if (mounted) setProfile(prof);
      } else {
        setUser(null); setProfile(null);
      }
      if (mounted) { setLoading(false); setReady(true); clearTimeout(timeout); }
    }).catch(() => { if (mounted) { setLoading(false); setReady(true); clearTimeout(timeout); } });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      // The kept session died while the app sat locked (refresh token revoked
      // or expired in the background): drop the lock and explain, instead of
      // offering a Face ID prompt over nothing.
      if (event === 'SIGNED_OUT' && lockedRef.current) {
        unlockApp(); setLocked(false);
        try { localStorage.setItem('signOutReason', 'session_expired'); } catch {}
      }
      if (session?.user) {
        setUser(session.user);
        // Startup fires INITIAL_SESSION right after the load above fetched
        // this exact profile — don't fetch it a second time on every app
        // open. Only the fetch is skipped; every other path (login, Face ID,
        // sign-out, a different user) behaves exactly as before.
        if (profileRef.current?.id === session.user.id) { setLoading(false); setReady(true); return; }
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // A full email re-auth always clears the biometric lock.
    if (!error) {
      unlockApp(); setLocked(false); clearFaceIdFails();
      try { localStorage.removeItem('signOutReason'); } catch {}
      // If a DIFFERENT user's Face ID enrollment is still on this device, drop
      // it — otherwise the lock screen shows a stranger's email and offers
      // their Face ID. The signed-in user comes straight from the sign-in
      // response, so there is no second request that could fail silently.
      const enr = getFaceIdEnrollment();
      if (data?.user && enr && enr.userId !== data.user.id) disableFaceId();
    }
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    return { error };
  };

  // With Face ID enrolled for this user, "sign out" LOCKS the app (session
  // stays on-device so biometric unlock is instant). Disabling Face ID in
  // Profile settings restores the full sign-out behavior.
  // The ONE sign-out. With Face ID enrolled for this user it locks (session
  // kept, nothing to flush); otherwise module queues flush under this user
  // first, then the session is destroyed.
  const signOut = async () => {
    if (user && isFaceIdEnrolledFor(user.id)) {
      if (!lockApp()) { await supabase.auth.signOut(); return; }   // storage blocked: fall back to a real sign-out
      setLocked(true);
      return;
    }
    await runBeforeSignOut();
    await supabase.auth.signOut();
  };

  const lockNow = () => { lockApp(); setLocked(true); };

  // One OS biometric prompt, then a single server round-trip to re-validate
  // before lifting the lock. The biometric alone is not enough: a session that
  // expired, or an account DEACTIVATED while the app sat locked, must fail
  // closed to email login rather than unlock back into live data.
  const unlockWithFaceId = async (): Promise<{ error?: string; code?: string }> => {
    // Gate on the ENROLLMENT, not on `user`: at a cold start the kept session
    // is still being restored in the background, so `user` is null for the
    // first seconds — the old check raced that restore and answered "Session
    // ended, sign in with email" to a tap that should have shown the Face ID
    // prompt. The biometric needs no session; the session is validated (and
    // matched to the enrolled account) right after it passes.
    const enr = getFaceIdEnrollment();
    if (!enr) return { error: 'Face ID is not set up on this device.' };
    const res = await verifyFaceId();
    if (!res.ok) return { error: res.error, code: res.code };
    // Re-validate the kept session server-side.
    const failClosed = async (reason: string, msg: string) => {
      try { localStorage.setItem('signOutReason', reason); } catch {}
      await supabase.auth.signOut();
      unlockApp(); setLocked(false);
      return { error: msg, code: 'session' as const };
    };
    const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
    if (refErr && isTransientAuthError(refErr)) {
      // No network: keep the session and the lock; the user retries when online.
      return { error: "No connection — try Face ID again when you're online.", code: 'offline' as const };
    }
    if (refErr || !refreshed?.session?.user) {
      return failClosed('session_expired', 'Your session has expired — sign in with email to continue.');
    }
    if (refreshed.session.user.id !== enr.userId) {
      return failClosed('session_expired', 'This device is set up for a different account — sign in with email.');
    }
    const { data: prof, error: profErr } = await supabase.from('profiles').select('is_active').eq('id', refreshed.session.user.id).maybeSingle();
    if (profErr) {
      if (isTransientAuthError(profErr)) return { error: "No connection — try Face ID again when you're online.", code: 'offline' as const };
      return failClosed('session_expired', 'Could not verify your account — sign in with email.');
    }
    if (prof && prof.is_active === false) {
      return failClosed('deactivated', 'This account has been deactivated.');
    }
    setUser(refreshed.session.user);
    unlockApp(); setLocked(false); clearFaceIdFails();
    try { localStorage.removeItem('signOutReason'); } catch {}
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
    // Capture phase: `scroll` does not bubble and every list scrolls inside
    // <main> or a sheet, so a listener on window only ever saw touch/mouse.
    const events = ['mousedown', 'pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true, capture: true }));
    resetTimer();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, resetTimer, { capture: true })); };
  }, [user, locked]);

  return <AuthContext.Provider value={{ user, profile, loading, ready, locked, signIn, signUp, signOut, lockNow, unlockWithFaceId }}>{children}</AuthContext.Provider>;
};
