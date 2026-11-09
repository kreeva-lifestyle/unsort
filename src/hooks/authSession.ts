// Session plumbing shared by useAuth and the sign-in pages: the URL checks
// for a password-recovery link, profile loading, a capped refresh, and the
// ONE sign-out call every path goes through.
import { supabase } from '../lib/supabase';
import { logSwallowed } from '../lib/errorLogger';

export const PROFILE_COLS = 'id, email, full_name, role, is_active, phone, created_at, updated_at, module_access';
// The LOADING splash: a device with a kept session waits longer for it (the
// restore can take two round-trips on weak mobile data); the sign-in page
// is shown at the hard cap only. Without a kept session: sign-in at the
// soft mark.
export const SPLASH_SOFT_MS = 3000;
export const SPLASH_HARD_MS = 15000;
// A refresh fetch that hangs (captive wifi, dead uplink) must not hold the
// splash or the Face ID button for good.
export const REFRESH_CAP_MS = 12000;

// A refresh that failed because the NETWORK failed, not because the session
// was rejected. auth-js tags these as retryable; offline is the common case.
export const isTransientAuthError = (err: unknown): boolean => {
  const e = err as { name?: string; status?: number; message?: string } | null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!e) return false;
  if (e.name === 'AuthRetryableFetchError') return true;
  if (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504) return true;
  return /failed to fetch|load failed|network|timed? ?out|fetch/i.test(e.message || '');
};

const hashParams = (hash: string) => new URLSearchParams(hash.replace(/^#\/?/, ''));

/** A real password-recovery callback: `type=recovery` WITH a token. An
 *  expired/used link comes back as `#error=…&error_code=otp_expired…`
 *  (sometimes with `type=recovery` too) and is never a recovery. */
export const isRecoveryHash = (hash: string): boolean => {
  const p = hashParams(hash);
  return p.get('type') === 'recovery' && (p.has('access_token') || p.has('code')) && !p.has('error') && !p.has('error_code') && !p.has('error_description');
};

/** The auth error Supabase sent back in the URL (expired or used link), as
 *  sign-in copy; null when the URL carries none. auth-js leaves this hash in
 *  place, so the caller strips it once it has been shown. */
export const urlAuthErrorMessage = (hash: string): string | null => {
  const p = hashParams(hash);
  if (!p.has('error') && !p.has('error_code') && !p.has('error_description')) return null;
  const code = (p.get('error_code') || '').toLowerCase();
  const desc = (p.get('error_description') || '').toLowerCase();
  if (code === 'otp_expired' || /expired|invalid/.test(desc)) return 'This password-reset link has expired or was already used — tap "Forgot password?" for a new one.';
  if (code === 'access_denied') return 'That sign-in link could not be used — sign in with your email and password, or request a new reset link.';
  return 'That link could not be used. Sign in with your email and password.';
};

export const fetchProfile = async (userId: string) => {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle();
  if (error) logSwallowed('profile load', error);
  return { data, error };
};

/** refreshSession with a deadline; the timeout reads as a transient error. */
export const refreshWithCap = (ms = REFRESH_CAP_MS): ReturnType<typeof supabase.auth.refreshSession> => {
  const timeout = new Promise<Awaited<ReturnType<typeof supabase.auth.refreshSession>>>(resolve => setTimeout(() => {
    const error = Object.assign(new Error('Session refresh timed out'), { name: 'AuthRetryableFetchError' });
    resolve({ data: { session: null, user: null }, error } as Awaited<ReturnType<typeof supabase.auth.refreshSession>>);
  }, ms));
  return Promise.race([supabase.auth.refreshSession(), timeout]);
};

// Sign out THIS device only. The default scope ('global') revoked every
// session of the account, and the staff share accounts across phones and
// the office PC — one person signing out, or an idle forgotten tab hitting
// the inactivity timer, threw a colleague mid-work back to the login page
// (27 forced re-logins in one week in the auth logs). 'global' stays for a
// deactivated account only. One call in flight at a time: the deactivation
// check, the inactivity timer and a Face ID fail could fire together and
// each sent its own /logout.
let inflight: Promise<void> | null = null;
export const signOutDevice = (scope: 'local' | 'global' = 'local'): Promise<void> => {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope });
      if (error) logSwallowed('sign out', error);
    } catch (e) { logSwallowed('sign out', e); }
  })().finally(() => { inflight = null; });
  return inflight;
};

export type Revalidation =
  | { kind: 'ok'; user: any; profile: any }
  | { kind: 'offline' }
  | { kind: 'rejected'; reason: 'session_expired' | 'deactivated'; message: string };

/** After the biometric passed: one server round-trip that must say the kept
 *  session is alive, belongs to the enrolled account and is still active.
 *  Offline keeps the session and the lock; a rejection fails closed. The
 *  same trip (re)loads the profile — a lock that outlived a failed cold-
 *  start load otherwise unlocked into "Loading your profile…". */
export const revalidateKeptSession = async (enrolledUserId: string): Promise<Revalidation> => {
  const { data: refreshed, error: refErr } = await refreshWithCap();
  if (refErr && isTransientAuthError(refErr)) return { kind: 'offline' };
  const user = refreshed?.session?.user;
  if (refErr || !user) return { kind: 'rejected', reason: 'session_expired', message: 'Your session has expired — sign in with email to continue.' };
  if (user.id !== enrolledUserId) return { kind: 'rejected', reason: 'session_expired', message: 'This device is set up for a different account — sign in with email.' };
  const { data: profile, error: profErr } = await fetchProfile(user.id);
  if (profErr) {
    if (isTransientAuthError(profErr)) return { kind: 'offline' };
    return { kind: 'rejected', reason: 'session_expired', message: 'Could not verify your account — sign in with email.' };
  }
  if (profile && profile.is_active === false) return { kind: 'rejected', reason: 'deactivated', message: 'This account has been deactivated.' };
  return { kind: 'ok', user, profile };
};
