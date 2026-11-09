// Auth state hook + provider
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { isFaceIdEnrolledFor, isAppLocked, lockApp, unlockApp, verifyFaceId, getFaceIdEnrollment, disableFaceId, hasStoredSession, clearFaceIdFails } from '../lib/faceId';
import { runBeforeSignOut } from '../lib/beforeSignOut';
import { isRecoveryHash, fetchProfile, signOutDevice, refreshWithCap, revalidateKeptSession, SPLASH_SOFT_MS, SPLASH_HARD_MS } from './authSession';

interface AuthContextValue {
  user: any;
  profile: any;
  /** The profile could not be loaded (offline at cold start, RLS); the user is kept. */
  profileError: boolean;
  loading: boolean;
  ready: boolean;
  /** The kept session is taking long to restore (the splash says so). */
  slow: boolean;
  locked: boolean;
  /** The app was opened from a password-recovery link: show the reset form. */
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
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
  // Mirror for the auth-state listener: lets it skip refetching a profile it
  // already holds without re-binding.
  const profileRef = useRef<any>(null);
  profileRef.current = profile;
  const [profileError, setProfileError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  // Latched ONCE from the URL: auth-js clears the hash the moment it has read
  // the token, so a check on every render saw a plain URL right after the
  // recovery session was saved and opened the dashboard instead of the form.
  const [recovery, setRecovery] = useState(() => isRecoveryHash(window.location.hash));
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
  // The one profile loader (defined in the startup effect, used by Face ID
  // unlock and Retry): one fetch per user id at a time.
  const loadProfile = useRef<(uid: string) => Promise<void>>(async () => {});

  useEffect(() => {
    let mounted = true;
    const finish = () => { if (mounted) { setLoading(false); setReady(true); setSlow(false); } };
    // With a kept session the splash waits for the restore (copy changes at
    // the soft mark, sign-in only at the hard cap): flipping to the sign-in
    // page at 3 s showed the email form to a signed-in user on slow mobile
    // data, then swapped it for the app mid-typing.
    const stored = hasStoredSession();
    const soft = setTimeout(() => { if (stored) setSlow(true); else finish(); }, SPLASH_SOFT_MS);
    const hard = setTimeout(finish, stored ? SPLASH_HARD_MS : SPLASH_SOFT_MS);
    const clear = () => { clearTimeout(soft); clearTimeout(hard); };

    // Deactivated accounts (profiles.is_active = false) are signed out the
    // moment their profile loads — without this, a revoked user's session
    // (or a password reset) kept working. Returns false when revoked. Global
    // scope on purpose: every device of a revoked account must go.
    const enforceActive = (prof: any): boolean => {
      if (prof && prof.is_active === false) {
        try { localStorage.setItem('signOutReason', 'deactivated'); } catch {}
        void signOutDevice('global');
        return false;
      }
      return true;
    };

    let inflight: { id: string; p: Promise<void> } | null = null;
    loadProfile.current = (uid: string) => {
      if (inflight?.id === uid) return inflight.p;   // startup and INITIAL_SESSION ask for the same profile
      const p = (async () => {
        const { data, error } = await fetchProfile(uid);
        if (!mounted) return;
        if (error) { setProfileError(true); return; }   // keep the user; Retry / online refetches
        setProfileError(false);
        if (!enforceActive(data)) { setUser(null); setProfile(null); return; }
        setProfile(data);
      })().finally(() => { if (inflight?.p === p) inflight = null; });
      inflight = { id: uid, p };
      return p;
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        // Render from the kept session at once (the profile follows; a tab
        // that needs it shows "Loading your profile…" / Retry meanwhile).
        // auth-js refreshes on its own
        // inside the expiry margin; a refresh here only when the token is
        // about to lapse — the old unconditional one rotated the refresh
        // token on every cold open (a kill mid-rotation left the device with
        // a consumed token, and the next open was signed out). A transient
        // failure keeps the stored user: the Face ID unlock re-validates
        // server-side anyway, so a revoked session cannot sneak back in.
        setUser(session.user); finish(); clear();
        // Locked: the lock screen needs no profile and no refresh — the Face
        // ID unlock re-validates the session and loads the profile itself.
        if (lockedRef.current) return;
        let sessUser = session.user;
        const expiresSoon = (session.expires_at ?? 0) * 1000 - Date.now() < 5 * 60_000;
        if (expiresSoon) {
          const { data: refreshed } = await refreshWithCap();
          if (!mounted) return;
          if (refreshed?.session?.user) { sessUser = refreshed.session.user; setUser(sessUser); }
        }
        await loadProfile.current(sessUser.id);
      } else {
        setUser(null); setProfile(null); finish(); clear();
      }
    }).catch(() => { finish(); clear(); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // The kept session died while the app sat locked (refresh token revoked
      // or expired in the background): drop the lock and explain, instead of
      // offering a Face ID prompt over nothing.
      if (event === 'SIGNED_OUT' && lockedRef.current) {
        unlockApp(); setLocked(false);
        try { localStorage.setItem('signOutReason', 'session_expired'); } catch {}
      }
      if (session?.user) {
        setUser(session.user);
        // Token refresh / user update: the profile is already here. Otherwise
        // (login, Face ID, another user) load it; the startup load above and
        // INITIAL_SESSION share one fetch.
        if (profileRef.current?.id === session.user.id) { finish(); return; }
        void loadProfile.current(session.user.id).then(finish);
      } else {
        setUser(null); setProfile(null);
        finish();
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); clear(); };
  }, []);

  // A profile load that failed offline retries by itself when the device is
  // back online or the app returns to the foreground.
  useEffect(() => {
    if (!profileError || !user) return;
    const retry = () => { if (document.visibilityState === 'visible') void loadProfile.current(user.id); };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); };
  }, [profileError, user]);

  const reloadProfile = async () => { if (user) await loadProfile.current(user.id); };

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

  // The ONE sign-out. With Face ID enrolled for this user it locks (session
  // kept, nothing to flush); otherwise module queues flush under this user
  // first, then THIS device's session is destroyed (never the account's
  // other devices — see signOutDevice).
  const signOut = async () => {
    if (user && isFaceIdEnrolledFor(user.id)) {
      if (!lockApp()) { await signOutDevice(); return; }   // storage blocked: fall back to a real sign-out
      setLocked(true);
      return;
    }
    await runBeforeSignOut();
    await signOutDevice();
  };

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
    // Re-validate the kept session server-side (authSession.revalidateKeptSession).
    const v = await revalidateKeptSession(enr.userId);
    if (v.kind === 'offline') return { error: "No connection — try Face ID again when you're online.", code: 'offline' as const };
    if (v.kind === 'rejected') {
      try { localStorage.setItem('signOutReason', v.reason); } catch {}
      await signOutDevice();
      unlockApp(); setLocked(false);
      return { error: v.message, code: 'session' as const };
    }
    setUser(v.user); setProfile(v.profile); setProfileError(false);
    unlockApp(); setLocked(false); clearFaceIdFails();
    try { localStorage.removeItem('signOutReason'); } catch {}
    return {};
  };

  // Session timeout after 30 min of inactivity: lock when Face ID is
  // enrolled (one-tap resume), full sign-out otherwise (queues flush first,
  // as on the Sign out button).
  useEffect(() => {
    if (!user || locked) return;
    let timer: any;
    const expire = async () => {
      if (isFaceIdEnrolledFor(user.id)) { lockApp(); setLocked(true); return; }
      try { localStorage.setItem('signOutReason', 'session_expired'); } catch {}
      await runBeforeSignOut();
      await signOutDevice();
    };
    const resetTimer = () => { clearTimeout(timer); timer = setTimeout(() => { void expire(); }, 30 * 60 * 1000); };
    // Capture phase: `scroll` does not bubble and every list scrolls inside
    // <main> or a sheet, so a listener on window only ever saw touch/mouse.
    const events = ['mousedown', 'pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true, capture: true }));
    resetTimer();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, resetTimer, { capture: true })); };
  }, [user, locked]);

  return <AuthContext.Provider value={{ user, profile, profileError, loading, ready, slow, locked, recovery, signIn, signUp, signOut, reloadProfile, unlockWithFaceId }}>{children}</AuthContext.Provider>;
};
