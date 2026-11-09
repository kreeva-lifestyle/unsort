import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/friendlyError';
import { signOutDevice, isTransientAuthError } from '../hooks/authSession';
import { T, S } from '../lib/theme';

// How long the recovery session may take to arrive (auth-js reads the link's
// token and asks the server who it is) before the page stops waiting and
// says it could not check the link (a late answer still opens the form).
const SESSION_WAIT_MS = 8000;
type Link = { state: 'checking' | 'ok' | 'dead' | 'offline'; email?: string };

export default function PasswordReset() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [link, setLink] = useState<Link>({ state: 'checking' });

  // The form used to open for ANY recovery-looking link and only fail on
  // submit with gotrue's "Auth session missing!". Check the session first.
  // initialize() hands back the error auth-js hit reading the link, which
  // tells a dead link from a dead network (the token stays in the URL on a
  // network failure, so a reload re-reads it).
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => { if (alive) setLink(l => l.state === 'checking' ? { state: 'offline' } : l); }, SESSION_WAIT_MS);
    (async () => {
      const { error } = await supabase.auth.initialize();
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (session?.user) setLink({ state: 'ok', email: session.user.email ?? '' });
      else setLink({ state: error && isTransientAuthError(error) ? 'offline' : 'dead' });
    })().catch(() => { if (alive) setLink({ state: 'dead' }); });
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  // A late answer may have stored the session (and cleared the hash) by now.
  const tryAgain = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) { setLink({ state: 'ok', email: session.user.email ?? '' }); return; }
    window.location.reload();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) { setError(friendlyError(upErr, 'Could not update the password. Please try again.')); return; }
      setDone(true);
    } catch (err) { setError(friendlyError(err, 'Could not update the password. Please try again.')); }
    finally { setSaving(false); }
  };

  const goToLogin = async () => {
    // Awaited: the reload used to win the race and land inside the app with
    // the recovery session still stored. This device only.
    await signOutDevice();
    // replace, not assign: setting location.hash pushes an entry, so Back from
    // the login screen re-entered the recovery link and reopened this form.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.location.reload();
  };

  const input: React.CSSProperties = { ...S.fInput, height: 44 };
  const title = done ? 'Password Updated' : link.state === 'dead' ? 'Link Expired' : link.state === 'offline' ? 'Can’t Check Link' : 'Set New Password';

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.rXl, padding: '32px 28px', maxWidth: 380, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,.4)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.sora, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6 }}>DailyOffice</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>{title}</div>
        </div>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div role="status" style={{ background: 'oklch(0.72 0.19 145 / .08)', border: '1px solid oklch(0.72 0.19 145 / .2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: T.gr, fontWeight: 600 }}>Password updated successfully!</div>
              <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>Sign in with your new password. On a phone, open the DailyOffice app from the home screen and sign in there.</div>
            </div>
            <button onClick={() => { void goToLogin(); }} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', minHeight: 44 }}>Go to Login</button>
          </div>
        ) : link.state === 'offline' ? (
          <div style={{ textAlign: 'center' }}>
            <div role="alert" style={{ background: 'oklch(0.77 0.14 230 / .10)', border: '1px solid oklch(0.77 0.14 230 / .3)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: T.bl, lineHeight: 1.5 }}>
              Couldn’t reach the server to check this link. Check your connection, then tap Try again.
            </div>
            <button onClick={() => { void tryAgain(); }} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', minHeight: 44 }}>Try again</button>
          </div>
        ) : link.state === 'dead' ? (
          <div style={{ textAlign: 'center' }}>
            <div role="alert" style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: T.re, lineHeight: 1.5 }}>
              This password-reset link is invalid or has expired. Go back to sign in and tap “Forgot password?” for a new one.
            </div>
            <button onClick={() => { void goToLogin(); }} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', minHeight: 44 }}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Hidden username: lets the password manager update the existing
                login entry instead of saving an orphan password. */}
            <input type="email" name="email" autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" value={link.email ?? ''} style={{ position: 'absolute', opacity: 0, height: 0, width: 0, border: 0, padding: 0 }} />
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="new-password" style={S.fLabel}>New Password</label>
              <input id="new-password" name="new-password" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="Minimum 8 characters" autoFocus style={input} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="confirm-password" style={S.fLabel}>Confirm Password</label>
              <input id="confirm-password" name="confirm-password" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }} placeholder="Re-enter password" style={input} />
              <button type="button" className="touch44" onClick={() => setShowPw(v => !v)} aria-pressed={showPw} style={{ background: 'none', border: 'none', padding: '4px 0', fontSize: 11, color: T.ac2, cursor: 'pointer', fontFamily: T.sans }}>{showPw ? 'Hide passwords' : 'Show passwords'}</button>
            </div>
            {error && <div role="alert" style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 12 }}>{error}</div>}
            <button type="submit" disabled={saving || link.state !== 'ok'} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving || link.state !== 'ok' ? 0.5 : 1 }}>
              {saving ? 'Updating…' : link.state === 'checking' ? 'Checking link…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
