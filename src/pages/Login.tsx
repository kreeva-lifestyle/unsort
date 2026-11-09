import { useState, useEffect, useRef } from 'react';
import DivisionPicker from '../components/brand/DivisionPicker';
import FaceIdChoice from '../components/login/FaceIdChoice';
import SignInDetails from '../components/login/SignInDetails';
import { T, S } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/friendlyError';
import { getFaceIdEnrollment, faceIdOffered as faceIdOfferedNow } from '../lib/faceId';
import { urlAuthErrorMessage } from '../hooks/authSession';

export default function Login({ signIn, locked, unlockWithFaceId }: {
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  locked?: boolean;
  unlockWithFaceId?: () => Promise<{ error?: string; code?: string }>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [info, setInfo] = useState('');
  const [failures, setFailures] = useState(0);   // re-reads the "Details" list
  // Two-option entry: Face ID is offered only when it can work — an
  // enrolment, a kept session and fewer than the maximum failed prompts on
  // this device. Re-read every render so the button disappears the moment
  // the session is gone.
  const enrollment = getFaceIdEnrollment();
  const faceIdOffered = faceIdOfferedNow() && !!unlockWithFaceId;
  const [mode, setMode] = useState<'choose' | 'email'>(faceIdOffered ? 'choose' : 'email');
  const [faceBusy, setFaceBusy] = useState(false);
  // Ref, not state: two taps in the same tick both read stale state and
  // start two OS prompts (WebKit then aborts the first as "cancelled").
  const inFlight = useRef(false);
  useEffect(() => { if (!faceIdOffered) setMode('email'); }, [faceIdOffered]);

  const fail = (msg: string) => { setError(msg); setFailures(n => n + 1); };

  const handleFaceId = async () => {
    if (!unlockWithFaceId || inFlight.current) return;
    inFlight.current = true;
    setError(''); setInfo(''); setFaceBusy(true);
    try {
      const res = await unlockWithFaceId();
      // On success the app unlocks instantly (no navigation needed here).
      if (res.error) {
        // Session problems are information (blue), prompt problems are errors (red).
        if (res.code === 'session' || res.code === 'offline') setInfo(res.error);
        else fail(res.error);
        if (res.code === 'too_many' || res.code === 'session' || res.code === 'mismatch' || res.code === 'wrong_host') setMode('email');
      }
    } finally { setFaceBusy(false); inFlight.current = false; }
  };

  // The reason banner is read at mount AND whenever the lock/offer state
  // changes: the login stays mounted across "locked → session gone", so a
  // mount-only read showed the message on a later visit instead of now.
  // An expired/used reset link comes back in the URL hash (auth-js leaves
  // it there): explain it once, then strip it so a reload is a plain sign-in.
  useEffect(() => {
    try {
      const reason = localStorage.getItem('signOutReason');
      if (reason === 'session_expired') { setInfo('Session expired — please sign in again.'); localStorage.removeItem('signOutReason'); }
      else if (reason === 'deactivated') { setInfo('Your access was revoked — contact your admin.'); localStorage.removeItem('signOutReason'); }
    } catch {}
    const urlErr = urlAuthErrorMessage(window.location.hash);
    if (urlErr) {
      setInfo(urlErr); setMode('email');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [locked, faceIdOffered]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(''); setForgotMsg(''); setLoading(true);
    try {
      // trim: iOS autocorrect leaves a trailing space after the address.
      const { error } = await signIn(email.trim(), password);
      if (error) fail(friendlyError(error, 'Sign-in failed. Please try again.'));
    } catch (err) {
      fail(friendlyError(err, 'Sign-in failed. Please try again.'));
    } finally { setLoading(false); }   // a thrown signIn used to leave "Signing in..." for good
  };

  const handleForgotPassword = async () => {
    if (forgotSending) return;
    setError(''); setForgotMsg('');
    if (!email.trim()) { setError('Enter your email above first, then tap "Forgot password".'); return; }
    setForgotSending(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (resetErr) { fail(friendlyError(resetErr, 'Could not send the reset email. Please try again.')); return; }
      setForgotMsg(`Password reset link sent to ${email.trim()}. Check your email.`);
    } catch (err) {
      fail(friendlyError(err, 'Could not send the reset email. Please try again.'));
    } finally { setForgotSending(false); }
  };

  const inp: React.CSSProperties = {
    ...S.fInput, height: 44, fontSize: 15, padding: '12px 16px', borderRadius: 10,
  };
  const link: React.CSSProperties = { background: 'transparent', border: 'none', color: T.tx2, fontSize: 12, cursor: 'pointer', minHeight: 44, padding: '12px 10px', fontFamily: T.sans, transition: T.transition };
  const banner = (bg: string, bd: string, color: string): React.CSSProperties => ({ background: bg, border: `1px solid ${bd}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color, marginBottom: 14 });

  return (
    // overflowY auto (NOT hidden): with the iOS keyboard open the fixed frame
    // doesn't shrink, so the centered card's lower half — password + Sign In —
    // sat under the keyboard with no way to scroll to it.
    <div className="login-page" data-launch-end style={{ position: 'fixed', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      {/* Ambient orbs, clipped: they overhang the frame and used to add ~200px of empty scroll under the card */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 600, height: 600, top: -200, right: -100, background: `radial-gradient(circle, ${T.ac44} 0%, transparent 60%)`, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, animation: 'loginGlowInOut 5s .3s ease forwards' }} />
        <div style={{ position: 'absolute', width: 500, height: 500, bottom: -200, left: -100, background: `radial-gradient(circle, ${T.bl30} 0%, transparent 60%)`, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, animation: 'loginGlowInOut 5s .5s ease forwards' }} />
      </div>

      {/* Desktop: split layout */}
      <div className="login-split" style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', gap: 60, maxWidth: 1080, width: '100%', padding: '20px 40px', alignItems: 'center', margin: 'auto', animation: 'loginBoxEnter 1.2s cubic-bezier(.16,1,.3,1) both' }}>
        {/* Left: brand hero (desktop only) */}
        <div className="login-hero" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.sora, fontWeight: 800, fontSize: 22, color: '#fff', boxShadow: `0 10px 30px ${T.ac55}`, flexShrink: 0 }}>D</div>
            <div>
              <div style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 700, color: T.tx, letterSpacing: -0.4 }}>DailyOffice</div>
              <div style={{ fontSize: 11, color: T.tx3, fontFamily: T.mono, marginTop: 2 }}>Your Workspace, Simplified</div>
            </div>
          </div>
          <h1 style={{ fontFamily: T.sora, fontSize: 42, fontWeight: 700, color: T.tx, letterSpacing: -1, lineHeight: 1.05, maxWidth: 520, margin: 0 }}>
            One app for<br /><span style={{ background: `linear-gradient(135deg, ${T.ac2}, ${T.bl})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>every counter.</span>
          </h1>
          <p style={{ fontSize: 14, color: T.tx2, lineHeight: 1.6, marginTop: 18, maxWidth: 480 }}>
            Inventory, billing, packing, cash — all in one place. Built for garment businesses that move fast.
          </p>
        </div>

        {/* Right/Mobile: login card */}
        <div className="login-card" style={{ background: 'rgba(14,18,30,.88)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: '36px 28px 28px', boxShadow: '0 30px 80px rgba(0,0,0,.5)' }}>
          {/* Mobile brand mark */}
          <div className="login-mobile-brand" style={{ display: 'none', textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.sora, fontWeight: 800, fontSize: 28, color: '#fff', boxShadow: `0 10px 30px ${T.ac55}`, marginBottom: 14 }}>D</div>
            <div style={{ fontFamily: T.sora, fontSize: 20, fontWeight: 700, color: T.tx, letterSpacing: -0.3 }}>DailyOffice</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>Your Workspace, Simplified</div>
          </div>

          <DivisionPicker />
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.sora, color: T.tx, letterSpacing: -0.3 }}>Welcome back</div>
            <div style={{ fontSize: 13, color: T.tx3, marginTop: 4 }}>
              {mode === 'choose'
                ? (locked && enrollment?.email ? `Locked — ${enrollment.email}` : 'Choose how to sign in')
                : 'Sign in to your workspace'}
            </div>
          </div>

          {info && <div role="status" style={banner('oklch(0.77 0.14 230 / .10)', 'oklch(0.77 0.14 230 / .3)', T.bl)}>{info}</div>}
          {error && <div role="alert" style={{ ...banner('oklch(0.63 0.22 25 / .12)', 'oklch(0.63 0.22 25 / .3)', T.re), animation: 'loginShake .4s ease' }}>{error}</div>}
          {forgotMsg && <div role="status" style={banner('oklch(0.72 0.19 145 / .10)', 'oklch(0.72 0.19 145 / .3)', T.gr)}>{forgotMsg}</div>}

          {mode === 'choose' && <FaceIdChoice busy={faceBusy} onFaceId={handleFaceId} onEmail={() => { setError(''); setMode('email'); }} />}

          <form onSubmit={handleSubmit} style={{ display: mode === 'email' ? 'block' : 'none' }}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="login-email" style={{ display: 'block', fontSize: 12, color: T.tx2, fontWeight: 500, marginBottom: 6 }}>Email</label>
              <input id="login-email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required style={inp} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="login-password" style={{ display: 'block', fontSize: 12, color: T.tx2, fontWeight: 500, marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input id="login-password" name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" enterKeyHint="go" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} required style={{ ...inp, paddingRight: 64 }} />
                <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', minHeight: 40, padding: '0 12px', background: 'transparent', border: 'none', color: T.tx3, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>{showPw ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 15, fontWeight: 600, fontFamily: T.sora, color: '#fff', background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, boxShadow: `0 8px 24px ${T.ac44}`, transition: 'all .2s', filter: loading ? 'brightness(0.7)' : 'none', letterSpacing: 0.3 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div style={{ marginTop: 8, textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 6 }}>
              {faceIdOffered && (
                <button type="button" onClick={() => { setError(''); setMode('choose'); }} style={link}>← Face ID</button>
              )}
              <button type="button" onClick={handleForgotPassword} disabled={forgotSending} style={{ ...link, opacity: forgotSending ? 0.5 : 1, pointerEvents: forgotSending ? 'none' : 'auto' }}>{forgotSending ? 'Sending…' : 'Forgot password?'}</button>
            </div>
          </form>
          <SignInDetails tick={failures} />
        </div>
      </div>
    </div>
  );
}
