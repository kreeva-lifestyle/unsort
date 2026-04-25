// Login screen — shown when no auth session exists
import { useState } from 'react';
import { T } from '../lib/theme';

export default function Login({ signIn }: { signIn: (email: string, password: string) => Promise<{ error: any }> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error.message);
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = { width: '100%', background: `rgba(20,25,40,.8)`, border: `1px solid ${T.bd2}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '9px 12px', transition: 'all .2s', outline: 'none', marginBottom: 12 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* Static glow orbs — no looping animation */}
      <div style={{ position: 'absolute', width: 400, height: 400, background: T.ac, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, top: -100, left: -100, animation: 'loginGlowIn 2s .3s ease forwards' }} />
      <div style={{ position: 'absolute', width: 350, height: 350, background: T.bl, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, bottom: -80, right: -80, animation: 'loginGlowIn 2s .5s ease forwards' }} />
      <div style={{ position: 'absolute', width: 250, height: 250, background: T.yl, borderRadius: '50%', filter: 'blur(80px)', opacity: 0, top: '50%', left: '60%', animation: 'loginGlowIn 2.5s .7s ease forwards' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, background: T.gr, borderRadius: '50%', filter: 'blur(100px)', opacity: 0, bottom: '20%', left: '15%', animation: 'loginGlowIn 2.5s .9s ease forwards' }} />
      <div style={{ position: 'absolute', width: 200, height: 200, background: '#E879F9', borderRadius: '50%', filter: 'blur(80px)', opacity: 0, top: '15%', right: '20%', animation: 'loginGlowIn 2s 1.1s ease forwards' }} />

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

        {error && <div style={{ background: 'rgba(245,87,92,.12)', border: '1px solid rgba(245,87,92,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: T.re, marginBottom: 14, animation: 'loginShake .4s ease' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ textAlign: 'left', opacity: 0, animation: 'loginFadeUp 1s .7s ease both' }}><label style={{ fontSize: 9, color: T.tx3, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 1.5, display: 'block', fontWeight: 600 }}>Email</label><input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} /></div>
          <div style={{ textAlign: 'left', opacity: 0, animation: 'loginFadeUp 1s .85s ease both' }}><label style={{ fontSize: 9, color: T.tx3, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 1.5, display: 'block', fontWeight: 600 }}>Password</label><input type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} /></div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '11px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: T.sans, color: '#fff', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: 0.3, opacity: 0, animation: 'loginFadeUp 1s 1s ease both', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>{loading ? 'Please wait...' : 'Sign In'}</button>
        </form>
        <p style={{ fontSize: 8, color: T.tx3, marginTop: 22, letterSpacing: 1.5, textTransform: 'uppercase' as const, opacity: 0, animation: 'loginFadeUp 1s 1.2s ease both' }}>Powered by Arya Designs</p>
      </div>
    </div>
  );
}
