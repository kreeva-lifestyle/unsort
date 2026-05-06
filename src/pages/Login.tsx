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
      if (reason === 'session_expired') { setInfo('Session expired — please sign in again.'); localStorage.removeItem('signOutReason'); }
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

  const inputStyle: React.CSSProperties = {
    width: '100%', background: T.s2, border: `1px solid ${T.bd}`, borderRadius: 8,
    padding: '12px 14px', color: T.tx, fontFamily: T.sans, fontSize: 14, fontWeight: 500,
    outline: 'none', boxSizing: 'border-box', transition: T.transition,
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, color: T.tx3, textTransform: 'uppercase',
    letterSpacing: '0.1em', fontWeight: 600, marginBottom: 6,
  };

  return (
    <div className="login-page" style={{ position: 'fixed', inset: 0, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* Ambient orbs */}
      <div style={{ position: 'absolute', width: 600, height: 600, top: -200, right: -100, background: `radial-gradient(circle, ${T.ac}40 0%, transparent 60%)`, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, animation: 'loginGlowInOut 5s .3s ease forwards' }} />
      <div style={{ position: 'absolute', width: 500, height: 500, bottom: -200, left: -100, background: `radial-gradient(circle, ${T.bl}30 0%, transparent 60%)`, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, animation: 'loginGlowInOut 5s .5s ease forwards' }} />
      <div style={{ position: 'absolute', width: 250, height: 250, top: '50%', left: '40%', background: `radial-gradient(circle, ${T.yl}20 0%, transparent 60%)`, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, animation: 'loginGlowInOut 5.5s .7s ease forwards' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, bottom: '20%', left: '15%', background: `radial-gradient(circle, ${T.gr}20 0%, transparent 60%)`, borderRadius: '50%', filter: 'blur(100px)', opacity: 0, animation: 'loginGlowInOut 5.5s .9s ease forwards' }} />
      <div style={{ position: 'absolute', width: 200, height: 200, top: '15%', right: '20%', background: 'radial-gradient(circle, rgba(232,121,249,.20) 0%, transparent 60%)', borderRadius: '50%', filter: 'blur(80px)', opacity: 0, animation: 'loginGlowInOut 5s 1.1s ease forwards' }} />
      {/* Dot grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '24px 24px', pointerEvents: 'none' }} />

      {/* Split layout container */}
      <div className="login-split" style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', gap: 60, maxWidth: 1080, width: '100%', padding: '20px 40px', alignItems: 'center', animation: 'loginBoxEnter 1.2s cubic-bezier(.16,1,.3,1) both' }}>
        {/* Left panel — brand hero */}
        <div className="login-hero" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.sora, fontWeight: 800, fontSize: 22, color: '#fff', boxShadow: `0 10px 30px ${T.ac}55`, flexShrink: 0 }}>D</div>
            <div>
              <div style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 700, color: T.tx, letterSpacing: -0.4 }}>DailyOffice</div>
              <div style={{ fontSize: 11, color: T.tx3, fontFamily: T.mono, marginTop: 2 }}>by Arya Designs</div>
            </div>
          </div>
          <h1 style={{ fontFamily: T.sora, fontSize: 42, fontWeight: 700, color: T.tx, letterSpacing: -1, lineHeight: 1.05, maxWidth: 520, margin: 0 }}>
            One app for<br /><span style={{ background: `linear-gradient(135deg, ${T.ac2}, ${T.bl})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>every counter.</span>
          </h1>
          <p style={{ fontSize: 14, color: T.tx2, lineHeight: 1.6, marginTop: 18, maxWidth: 480 }}>
            Inventory, billing, packing, cash — all in one place. Built for garment businesses that move fast.
          </p>
          <div style={{ display: 'flex', gap: 24, marginTop: 32 }}>
            {[{ n: '50K+', l: 'Items tracked' }, { n: '₹2Cr+', l: 'Revenue managed' }, { n: '99.9%', l: 'Uptime' }].map(s => (
              <div key={s.l}><div style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 700, color: T.ac2, letterSpacing: -0.4 }}>{s.n}</div><div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{s.l}</div></div>
            ))}
          </div>
        </div>

        {/* Right panel — login card */}
        <div style={{ background: 'rgba(14,18,30,.88)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: 32, boxShadow: '0 30px 80px rgba(0,0,0,.5), 0 0 40px rgba(99,102,241,.06)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.sora, color: T.tx, letterSpacing: -0.3 }}>Welcome back</div>
            <div style={{ fontSize: 12, color: T.tx3, marginTop: 4 }}>Sign in to your workspace</div>
          </div>

          {info && <div style={{ background: 'rgba(56,189,248,.10)', border: '1px solid rgba(56,189,248,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: T.bl, marginBottom: 14 }}>{info}</div>}
          {error && <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: T.re, marginBottom: 14, animation: 'loginShake .4s ease' }}>{error}</div>}
          {forgotMsg && <div style={{ background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: T.gr, marginBottom: 14 }}>{forgotMsg}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email</label>
              <input type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Password</label>
              <input type="password" autoComplete="current-password" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, fontFamily: T.sora, color: '#fff', background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, boxShadow: `0 10px 30px ${T.ac}55`, transition: 'all .2s', filter: loading ? 'brightness(0.7)' : 'none', letterSpacing: 0.3 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" onClick={handleForgotPassword} style={{ background: 'transparent', border: 'none', color: T.tx3, fontSize: 11, cursor: 'pointer', padding: '4px 8px', fontFamily: T.sans, textDecoration: 'underline', textDecorationColor: T.bd2, textUnderlineOffset: 3, transition: T.transition }} onMouseEnter={e => (e.currentTarget.style.color = T.tx2)} onMouseLeave={e => (e.currentTarget.style.color = T.tx3)}>Forgot password?</button>
            </div>
          </form>
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: T.tx3 }}>
            By signing in, you agree to our <span style={{ color: T.tx2, textDecoration: 'underline', cursor: 'pointer' }}>Terms</span> &amp; <span style={{ color: T.tx2, textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
