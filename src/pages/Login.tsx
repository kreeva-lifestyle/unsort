import { useState, useEffect } from 'react';
import { T, S } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { getFaceIdEnrollment } from '../lib/faceId';

const friendlyAuthError = (raw: string): string => {
  const m = (raw || '').toLowerCase();
  if (m.includes('invalid login')) return 'Incorrect email or password. Please try again.';
  if (m.includes('email not confirmed')) return 'Email not confirmed. Ask your admin to re-invite you.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('network') || m.includes('fetch')) return 'Network error. Check your connection.';
  return raw || 'Sign-in failed. Please try again.';
};

export default function Login({ signIn, locked, unlockWithFaceId }: {
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  locked?: boolean;
  unlockWithFaceId?: () => Promise<{ error?: string }>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [info, setInfo] = useState('');
  // Two-option entry: when Face ID is enrolled on this device the user picks
  // how to sign in; otherwise straight to the email form.
  const enrollment = getFaceIdEnrollment();
  const faceIdOffered = !!enrollment && !!unlockWithFaceId;
  const [mode, setMode] = useState<'choose' | 'email'>(faceIdOffered ? 'choose' : 'email');
  const [faceBusy, setFaceBusy] = useState(false);

  const handleFaceId = async () => {
    if (!unlockWithFaceId || faceBusy) return;
    setError(''); setFaceBusy(true);
    const res = await unlockWithFaceId();
    // On success the app unlocks instantly (no navigation needed here).
    if (res.error) setError(res.error);
    setFaceBusy(false);
  };

  useEffect(() => {
    try {
      const reason = localStorage.getItem('signOutReason');
      if (reason === 'session_expired') { setInfo('Session expired — please sign in again.'); localStorage.removeItem('signOutReason'); }
      else if (reason === 'deactivated') { setInfo('Your access was revoked — contact your admin.'); localStorage.removeItem('signOutReason'); }
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setForgotMsg(''); setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(friendlyAuthError(error.message));
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    setError(''); setForgotMsg('');
    if (!email.trim()) { setError('Enter your email above first, then tap "Forgot password".'); return; }
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (resetErr) { setError(friendlyAuthError(resetErr.message)); return; }
    setForgotMsg(`Password reset link sent to ${email.trim()}. Check your email.`);
  };

  const inp: React.CSSProperties = {
    ...S.fInput, height: 44, fontSize: 15, padding: '12px 16px', borderRadius: 10,
  };

  return (
    // overflowY auto (NOT hidden): with the iOS keyboard open the fixed frame
    // doesn't shrink, so the centered card's lower half — password + Sign In —
    // sat under the keyboard with no way to scroll to it.
    <div className="login-page" style={{ position: 'fixed', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      {/* Ambient orbs */}
      <div style={{ position: 'absolute', width: 600, height: 600, top: -200, right: -100, background: `radial-gradient(circle, ${T.ac44} 0%, transparent 60%)`, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, animation: 'loginGlowInOut 5s .3s ease forwards' }} />
      <div style={{ position: 'absolute', width: 500, height: 500, bottom: -200, left: -100, background: `radial-gradient(circle, ${T.bl30} 0%, transparent 60%)`, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, animation: 'loginGlowInOut 5s .5s ease forwards' }} />

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

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.sora, color: T.tx, letterSpacing: -0.3 }}>Welcome back</div>
            <div style={{ fontSize: 13, color: T.tx3, marginTop: 4 }}>
              {mode === 'choose'
                ? (locked && enrollment?.email ? `Locked — ${enrollment.email}` : 'Choose how to sign in')
                : 'Sign in to your workspace'}
            </div>
          </div>

          {info && <div style={{ background: 'rgba(56,189,248,.10)', border: '1px solid rgba(56,189,248,.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: T.bl, marginBottom: 14 }}>{info}</div>}
          {error && <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: T.re, marginBottom: 14, animation: 'loginShake .4s ease' }}>{error}</div>}
          {forgotMsg && <div style={{ background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: T.gr, marginBottom: 14 }}>{forgotMsg}</div>}

          {mode === 'choose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button type="button" onClick={handleFaceId} disabled={faceBusy} style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', cursor: faceBusy ? 'default' : 'pointer', fontSize: 15, fontWeight: 600, fontFamily: T.sora, color: '#fff', background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, boxShadow: `0 8px 24px ${T.ac44}`, transition: 'all .2s', filter: faceBusy ? 'brightness(0.7)' : 'none', letterSpacing: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'none', stroke: '#fff', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M3 8V6a3 3 0 013-3h2M16 3h2a3 3 0 013 3v2M21 16v2a3 3 0 01-3 3h-2M8 21H6a3 3 0 01-3-3v-2" />
                  <path d="M9 9.5v1M15 9.5v1M12 9.5v3.2a.8.8 0 01-.8.8" />
                  <path d="M9 15.2a4.2 4.2 0 006 0" />
                </svg>
                {faceBusy ? 'Waiting for Face ID…' : 'Login with Face ID'}
              </button>
              <button type="button" onClick={() => { setError(''); setMode('email'); }} style={{ width: '100%', padding: 15, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: T.sora, color: T.tx2, background: 'rgba(255,255,255,.04)', transition: 'all .2s', letterSpacing: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
                </svg>
                Login via Email
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: mode === 'email' ? 'block' : 'none' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: T.tx2, fontWeight: 500, marginBottom: 6 }}>Email</label>
              <input type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required style={inp} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: T.tx2, fontWeight: 500, marginBottom: 6 }}>Password</label>
              <input type="password" autoComplete="current-password" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} required style={inp} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 15, fontWeight: 600, fontFamily: T.sora, color: '#fff', background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, boxShadow: `0 8px 24px ${T.ac44}`, transition: 'all .2s', filter: loading ? 'brightness(0.7)' : 'none', letterSpacing: 0.3 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div style={{ marginTop: 16, textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 6 }}>
              {faceIdOffered && (
                <button type="button" onClick={() => { setError(''); setMode('choose'); }} style={{ background: 'transparent', border: 'none', color: T.tx3, fontSize: 12, cursor: 'pointer', padding: '6px 10px', fontFamily: T.sans, transition: T.transition }} onMouseEnter={e => (e.currentTarget.style.color = T.tx2)} onMouseLeave={e => (e.currentTarget.style.color = T.tx3)}>← Face ID</button>
              )}
              <button type="button" onClick={handleForgotPassword} style={{ background: 'transparent', border: 'none', color: T.tx3, fontSize: 12, cursor: 'pointer', padding: '6px 10px', fontFamily: T.sans, transition: T.transition }} onMouseEnter={e => (e.currentTarget.style.color = T.tx2)} onMouseLeave={e => (e.currentTarget.style.color = T.tx3)}>Forgot password?</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
