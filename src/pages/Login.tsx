// Login screen — shown when no auth session exists
import { useState, useEffect } from 'react';
import { T } from '../lib/theme';
import { supabase } from '../lib/supabase';

const friendlyAuthError = (raw: string): string => {
  const m = (raw || '').toLowerCase();
  if (m.includes('invalid login')) return 'Incorrect email or password. Please try again.';
  if (m.includes('email not confirmed')) return 'Email not confirmed. Ask your admin to re-invite you.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('network') || m.includes('fetch')) return 'Network error. Check your connection.';
  return raw || 'Sign-in failed. Please try again.';
};

export default function Login({ signIn }: { signIn: (email: string, password: string) => Promise<{ error: any }> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    try {
      const reason = localStorage.getItem('signOutReason');
      if (reason === 'session_expired') {
        setInfo('Session expired — please sign in again.');
        localStorage.removeItem('signOutReason');
      }
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setForgotMsg('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError(friendlyAuthError(error.message));
      // Preserve both email AND password so the user can correct a typo rather than re-type everything (audit P1)
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    setError(''); setForgotMsg('');
    if (!email.trim()) { setError('Enter your email above first, then tap "Forgot password".'); return; }
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (resetErr) { setError(friendlyAuthError(resetErr.message)); return; }
    setForgotMsg(`Password reset link sent to ${email.trim()}. Check your email.`);
  };

  const inputStyle: React.CSSProperties = { width: '100%', background: `rgba(20,25,40,.8)`, border: `1px solid ${T.bd2}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '9px 12px', transition: 'all .2s', outline: 'none', marginBottom: 12 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* Glow orbs — fade out after peak so the login screen stops burning GPU cycles when idle (audit P3) */}
      <div style={{ position: 'absolute', width: 400, height: 400, background: T.ac, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, top: -100, left: -100, animation: 'loginGlowInOut 5s .3s ease forwards' }} />
      <div style={{ position: 'absolute', width: 350, height: 350, background: T.bl, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, bottom: -80, right: -80, animation: 'loginGlowInOut 5s .5s ease forwards' }} />
      <div style={{ position: 'absolute', width: 250, height: 250, background: T.yl, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, top: '50%', left: '60%', animation: 'loginGlowInOut 5.5s .7s ease forwards' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, background: T.gr, borderRadius: '50%', filter: 'blur(100px)', opacity: 0, bottom: '20%', left: '15%', animation: 'loginGlowInOut 5.5s .9s ease forwards' }} />
      <div style={{ position: 'absolute', width: 200, height: 200, background: '#E879F9', borderRadius: '50%', filter: 'blur(80px)', opacity: 0, top: '15%', right: '20%', animation: 'loginGlowInOut 5s 1.1s ease forwards' }} />

      {/* Dot grid overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px', pointerEvents: 'none' }} />

      {/* Login card */}
      <div style={{ position: 'relative', zIndex: 1, background: 'rgba(14,18,30,.88)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: `1px solid rgba(255,255,255,.08)`, borderRadius: 18, width: 370, maxWidth: 'calc(100vw - 32px)', padding: '36px 30px', textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,.6), 0 0 40px rgba(99,102,241,0.06)', animation: 'loginBoxEnter 1.2s cubic-bezier(.16,1,.3,1) both' }}>

        {/* Logo */}
        <div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.sora, marginBottom: 4, letterSpacing: -0.5, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', opacity: 0, animation: 'loginFadeUp 1s .3s ease both' }}>DailyOffice</div>

        {/* Tagline */}
        <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 3, textTransform: 'uppercase' as const, marginBottom: 8, opacity: 0, animation: 'loginFadeUp 1s .5s ease both' }}>Your Workspace, Simplified</div>

        {/* Divider */}
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.bd2}, transparent)`, marginBottom: 24, opacity: 0, animation: 'loginFadeUp 1s .6s ease both' }} />

        {info && <div style={{ background: 'rgba(56,189,248,.10)', border: '1px solid rgba(56,189,248,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: T.bl, marginBottom: 14 }}>{info}</div>}
        {error && <div style={{ background: 'rgba(245,87,92,.12)', border: '1px solid rgba(245,87,92,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: T.re, marginBottom: 14, animation: 'loginShake .4s ease' }}>{error}</div>}
        {forgotMsg && <div style={{ background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: T.gr, marginBottom: 14 }}>{forgotMsg}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ textAlign: 'left', opacity: 0, animation: 'loginFadeUp 1s .7s ease both' }}><label style={{ fontSize: 9, color: T.tx3, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 1.5, display: 'block', fontWeight: 600 }}>Email</label><input type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} /></div>
          <div style={{ textAlign: 'left', opacity: 0, animation: 'loginFadeUp 1s .85s ease both' }}><label style={{ fontSize: 9, color: T.tx3, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 1.5, display: 'block', fontWeight: 600 }}>Password</label><input type="password" autoComplete="current-password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} /></div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '11px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: T.sans, color: '#fff', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: 0.3, opacity: 0, animation: 'loginFadeUp 1s 1s ease both', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>{loading ? 'Please wait...' : 'Sign In'}</button>
          <div style={{ marginTop: 12, textAlign: 'center', opacity: 0, animation: 'loginFadeUp 1s 1.1s ease both' }}>
            <button type="button" onClick={handleForgotPassword} style={{ background: 'transparent', border: 'none', color: T.tx3, fontSize: 11, cursor: 'pointer', padding: '4px 8px', fontFamily: T.sans, textDecoration: 'underline', textDecorationColor: T.bd2, textUnderlineOffset: 3 }}>Forgot password?</button>
          </div>
        </form>
        <p style={{ fontSize: 8, color: T.tx3, marginTop: 22, letterSpacing: 1.5, textTransform: 'uppercase' as const, opacity: 0, animation: 'loginFadeUp 1s 1.2s ease both' }}>Powered by Arya Designs</p>
      </div>
    </div>
  );
}
