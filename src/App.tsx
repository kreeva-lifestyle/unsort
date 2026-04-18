import React, { useState, useEffect, useRef, createContext, useContext, useId, Component, useCallback } from 'react';

// Error boundary to prevent blank screen crashes
class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: any }> {
  state = { error: null as any };
  static getDerivedStateFromError(error: any) { return { error }; }
  render() {
    if (this.state.error) return <div style={{ minHeight: '100vh', background: '#060810', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 14, padding: 20, position: 'relative' }}>
      <div style={{ position: 'absolute', top: '30%', left: '40%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(99,102,241,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, background: 'rgba(14,18,30,.90)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '28px 32px', textAlign: 'center' as const, maxWidth: 380, boxShadow: '0 16px 48px rgba(0,0,0,.4)' }}>
        <p style={{ color: '#E2E8F0', fontSize: 14, fontWeight: 600, fontFamily: "'Sora', sans-serif", marginBottom: 6 }}>Something went wrong</p>
        <p style={{ color: '#4A5568', fontSize: 11, marginBottom: 16, lineHeight: 1.5 }}>{String(this.state.error?.message || this.state.error)}</p>
        <button onClick={() => window.location.reload()} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #6366F1dd, #818CF8cc)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, boxShadow: '0 2px 10px rgba(99,102,241,.25)', transition: 'all .18s' }}>Reload</button>
      </div>
    </div>;
    return this.props.children;
  }
}
import { createClient } from '@supabase/supabase-js';
import JsBarcode from 'jsbarcode';
import Quagga from '@ericblade/quagga2';
import BrandTagPrinter from './BrandTagPrinter';
import PackTime from './PackTime';
import CashChallan from './CashChallan';
import InventoryExtras from './InventoryExtras';

const SUPABASE_URL = 'https://ulphprdnswznfztawbvg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const T = {
  bg: '#060810', s: '#0B0F19', s2: '#0F1420', s3: '#141B2B',
  bd: 'rgba(255,255,255,0.05)', bd2: 'rgba(255,255,255,0.08)',
  tx: '#E2E8F0', tx2: '#8896B0', tx3: '#4A5568',
  ac: '#6366F1', ac2: '#818CF8',
  gr: '#22C55E', re: '#EF4444', bl: '#38BDF8', yl: '#F59E0B',
  r: 8, mono: "'JetBrains Mono', monospace", sans: "'Inter', -apple-system, sans-serif",
  sora: "'Sora', 'Inter', sans-serif",
  glass1: 'rgba(255,255,255,0.02)', glass2: 'rgba(255,255,255,0.04)',
  transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
};

// Shared styles
const S = {
  fLabel: { display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' as const } as React.CSSProperties,
  fInput: { width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '7px 10px', outline: 'none', transition: T.transition } as React.CSSProperties,
  btnPrimary: { padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: T.sans, background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5, boxShadow: '0 2px 10px rgba(99,102,241,0.25)', transition: T.transition, whiteSpace: 'nowrap' as const, letterSpacing: '0.02em' } as React.CSSProperties,
  btnGhost: { padding: '5px 12px', borderRadius: 6, border: `1px solid rgba(99,102,241,0.15)`, cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: T.sans, background: 'rgba(99,102,241,0.06)', color: T.ac2, display: 'inline-flex', alignItems: 'center', gap: 5, transition: T.transition, whiteSpace: 'nowrap' as const } as React.CSSProperties,
  btnDanger: { padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.18)', cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: T.sans, background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', transition: T.transition, whiteSpace: 'nowrap' as const } as React.CSSProperties,
  btnSm: { padding: '3px 8px', fontSize: 10 } as React.CSSProperties,
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.80)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 8 } as React.CSSProperties,
  modalBox: { background: 'rgba(14,18,30,0.96)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: `1px solid ${T.bd2}`, borderRadius: 14, width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: '0 24px 80px rgba(0,0,0,.65)', padding: 0 } as React.CSSProperties,
  modalHead: { padding: '13px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as React.CSSProperties,
  thStyle: { fontSize: 9, color: T.tx3, padding: '9px 12px', textAlign: 'left' as const, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.015)', textTransform: 'uppercase' as const, letterSpacing: '0.1em', whiteSpace: 'nowrap' as const } as React.CSSProperties,
  tdStyle: { padding: '9px 12px', fontSize: 12, borderBottom: `1px solid ${T.bd}`, color: T.tx2 } as React.CSSProperties,
};

const AuthContext = createContext<any>(null);
const NotificationContext = createContext<any>(null);
const useAuth = () => useContext(AuthContext);
const useNotifications = () => useContext(NotificationContext);

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => { if (mounted) { setLoading(false); setReady(true); } }, 3000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        // Verify the session is still valid by refreshing
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!mounted) return;
        if (refreshed?.session?.user) {
          setUser(refreshed.session.user);
          const { data: prof } = await supabase.from('profiles').select('*').eq('id', refreshed.session.user.id).maybeSingle();
          if (mounted) setProfile(prof);
        } else {
          setUser(null); setProfile(null);
        }
      } else {
        setUser(null); setProfile(null);
      }
      if (mounted) { setLoading(false); setReady(true); clearTimeout(timeout); }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => {
          if (mounted) { setProfile(data); setLoading(false); setReady(true); }
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
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    return { error };
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  return <AuthContext.Provider value={{ user, profile, loading, ready, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
};

const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [toasts, setToasts] = useState<any[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const channel = supabase.channel('notifications').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload: any) => {
      setNotifications((prev) => [payload.new, ...prev]);
      addToast(payload.new.title, payload.new.type);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    setNotifications(data || []);
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const addToast = (message: string, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  return <NotificationContext.Provider value={{ notifications, toasts, markAsRead, addToast, fetchNotifications }}>{children}</NotificationContext.Provider>;
};

const ToastContainer = () => {
  const { toasts } = useNotifications();
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 999 }}>
      {toasts.map((t: any) => (
        <div key={t.id} style={{ background: 'rgba(12,16,28,0.95)', backdropFilter: 'blur(16px)', border: `1px solid ${T.bd2}`, borderRadius: 6, padding: '8px 14px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 20px rgba(0,0,0,.5)', animation: 'su .18s ease', marginBottom: 6, borderLeft: `2px solid ${t.type === 'error' ? T.re : T.gr}`, color: T.tx, maxWidth: 'calc(100vw - 32px)' }}>{t.message}</div>
      ))}
    </div>
  );
};

const AuthScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

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
};

// SVG icons for modern look
const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const s = { width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, string> = {
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5M12 22V13M21 8l-9 5',
    tag: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
    pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0zM12 7a3 3 0 100 6 3 3 0 000-6z',
    file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
    users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
    search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
    scan: 'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M8 12h8',
    check: 'M20 6L9 17l-5-5',
    link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
    settings: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2zM12 15a3 3 0 100-6 3 3 0 000 6z',
  };
  return <svg viewBox="0 0 24 24" style={s}><path d={paths[name] || ''} /></svg>;
};

const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) => {
  const { profile } = useAuth();
  const tabs = [
    { id: 'dashboard', icon: 'grid', label: 'Dashboard' },
    { id: 'inventory', icon: 'box', label: 'Inventory' },
    { id: 'reports', icon: 'file', label: 'Reports' },
    { id: 'brandtag', icon: 'tag', label: 'Brand Tags' },
    { id: 'packtime', icon: 'scan', label: 'PackStation' },
    { id: 'challan', icon: 'file', label: 'Cash Challan' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="sidebar" style={{ width: 220, height: '100vh', background: 'rgba(8,11,20,0.85)', backdropFilter: 'blur(36px)', WebkitBackdropFilter: 'blur(36px)', borderRight: `1px solid ${T.bd}`, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 100, overflowY: 'auto' }}>
      {/* Sidebar ambient glow */}
      <div style={{ position: 'absolute', top: -30, left: -20, width: 160, height: 160, background: `radial-gradient(circle, ${T.ac}10 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ padding: '14px 14px 11px', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.sora, letterSpacing: -0.5, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'subtlePulse 4s ease-in-out infinite' }}>DailyOffice</div>
        <div style={{ fontSize: 8, color: T.tx3, letterSpacing: 2.5, textTransform: 'uppercase' as const, marginTop: 2 }}>Your Workspace, Simplified</div>
      </div>
      <div style={{ fontSize: 8, color: T.tx3, letterSpacing: 2, textTransform: 'uppercase' as const, padding: '12px 14px 5px', fontWeight: 600 }}>Menu</div>
      <nav style={{ flex: 1, padding: '2px 8px 8px' }}>
        {tabs.map((t) => (
          <div key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', margin: '2px 0', cursor: 'pointer', background: activeTab === t.id ? 'rgba(99,102,241,.08)' : 'transparent', color: activeTab === t.id ? T.ac2 : T.tx3, fontSize: 11, fontWeight: activeTab === t.id ? 600 : 400, fontFamily: T.sans, borderRadius: 6, transition: 'all .18s ease', position: 'relative' }}
            onMouseEnter={e => { if (activeTab !== t.id) { e.currentTarget.style.background = 'rgba(99,102,241,.04)'; e.currentTarget.style.color = T.tx2; } }}
            onMouseLeave={e => { if (activeTab !== t.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.tx3; } }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, background: activeTab === t.id ? 'rgba(99,102,241,.12)' : 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .18s ease' }}><Icon name={t.icon} size={14} /></span>
            {t.label}
            {activeTab === t.id && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, borderRadius: '0 3px 3px 0', background: T.ac, boxShadow: `0 0 8px ${T.ac}88`, animation: 'pulseGlow 2s ease-in-out infinite' }} />}
          </div>
        ))}
      </nav>
      <div style={{ padding: '10px 10px', borderTop: `1px solid ${T.bd}`, marginTop: 'auto' }}>
        {profile && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '7px 9px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: `1px solid ${T.bd}`, transition: 'all .15s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'} onMouseLeave={e => e.currentTarget.style.borderColor = T.bd}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(profile.full_name || 'U')[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.full_name}</p><p style={{ margin: 0, fontSize: 8, color: T.tx3, textTransform: 'capitalize' as const }}>{profile.role}</p></div>
        </div>}
        <div onClick={handleSignOut} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'rgba(248,113,113,.04)', border: '1px solid rgba(248,113,113,.10)', color: '#f87171', cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: T.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,.08)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,.20)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,.04)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,.10)'; }}>Sign Out</div>
        <p style={{ margin: '8px 0 0', fontSize: 7, color: T.tx3, letterSpacing: 1.5, textTransform: 'uppercase' as const, textAlign: 'center', opacity: 0.3 }}>Powered by Arya Designs</p>
      </div>
      </div>
    </div>
  );
};

const BarcodeScanner = ({ onScan, onClose, scanError }: { onScan: (code: string) => Promise<boolean>; onClose: () => void; scanError?: string }) => {
  const videoRef = useRef<HTMLDivElement>(null);
  const ocrVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'barcode' | 'text'>('barcode');
  const [cameraError, setCameraError] = useState('');
  const [manualId, setManualId] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [scanning, setScanning] = useState(true);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const scannedRef = useRef(false);
  const mountedRef = useRef(true);

  // Barcode mode
  const startBarcode = useCallback(() => {
    if (!videoRef.current || mode !== 'barcode') return;
    scannedRef.current = false; setScanning(true); setLastCode('');
    Quagga.init({
      inputStream: { type: 'LiveStream', target: videoRef.current, constraints: { facingMode: 'environment', width: { ideal: 480 }, height: { ideal: 320 } } },
      decoder: { readers: ['code_128_reader', 'code_39_reader', 'ean_reader', 'ean_8_reader'], multiple: false },
      locate: true, frequency: 10,
    }, (err: any) => { if (err) setCameraError('Camera not available.'); else Quagga.start(); });
    Quagga.onDetected((result: any) => {
      const code = result?.codeResult?.code;
      if (code && !scannedRef.current) {
        scannedRef.current = true; setLastCode(code);
        if (navigator.vibrate) navigator.vibrate(100);
        Quagga.stop(); setScanning(false);
        onScan(code).then(found => { if (!found && mountedRef.current) setTimeout(() => startBarcode(), 2000); });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // OCR mode - start camera
  const startOcrCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } });
      if (ocrVideoRef.current) { ocrVideoRef.current.srcObject = stream; ocrVideoRef.current.play(); }
    } catch { setCameraError('Camera not available.'); }
  }, []);

  const extractId = (text: string): string | null => {
    // Try standard format: UNS-DDMMYY-XXXX
    const m1 = text.match(/UNS[-–—.\s]*\d{6}[-–—.\s]*\d{4}/i);
    if (m1) return m1[0].replace(/[^A-Z0-9]/gi, '').replace(/^(UNS)(\d{6})(\d{4})$/i, '$1-$2-$3').toUpperCase();
    // Try looser: UNS followed by digits
    const m2 = text.match(/UNS\D*(\d[\d\s-]{8,14}\d)/i);
    if (m2) { const digits = m2[1].replace(/\D/g, ''); if (digits.length >= 10) return `UNS-${digits.slice(0,6)}-${digits.slice(6,10)}`; }
    return null;
  };

  const captureAndOcr = async () => {
    if (!ocrVideoRef.current || !canvasRef.current) return;
    setOcrProcessing(true); setOcrStatus('Capturing...');
    const video = ocrVideoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setOcrProcessing(false); return; }
    ctx.drawImage(video, 0, 0);

    setOcrStatus('Reading...');
    try {
      const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), 'image/png'));
      const formData = new FormData();
      formData.append('file', blob, 'scan.png');
      formData.append('apikey', 'K85858938588957');
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      formData.append('OCREngine', '2');

      const resp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
      const json = await resp.json();
      const text = json?.ParsedResults?.[0]?.ParsedText || '';
      const id = extractId(text);
      if (id) {
        setLastCode(id); setOcrStatus('');
        if (navigator.vibrate) navigator.vibrate(100);
        onScan(id);
      } else {
        setOcrStatus('No ID found. Write clearly: UNS-DDMMYY-XXXX');
        setLastCode('');
      }
    } catch { setOcrStatus('Network error. Try manual entry.'); }
    setOcrProcessing(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    if (mode === 'barcode') startBarcode();
    if (mode === 'text') startOcrCamera();
    const videoEl = ocrVideoRef.current;
    return () => {
      mountedRef.current = false;
      Quagga.stop(); Quagga.offDetected();
      if (videoEl?.srcObject) (videoEl.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const switchMode = (m: 'barcode' | 'text') => {
    Quagga.stop(); Quagga.offDetected();
    if (ocrVideoRef.current?.srcObject) (ocrVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    setLastCode(''); setOcrStatus(''); setCameraError(''); setMode(m);
  };

  const handleManual = () => { if (manualId.trim()) { setLastCode(manualId.trim()); onScan(manualId.trim()); } };

  return (
    <div style={S.modalOverlay}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 380 }}>
        <div style={S.modalHead}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Scan ID</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span>
        </div>
        <div style={{ padding: 14 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: T.s2, borderRadius: 6, padding: 3, marginBottom: 10 }}>
            <div onClick={() => switchMode('barcode')} style={{ flex: 1, padding: '6px 0', borderRadius: 4, textAlign: 'center', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: mode === 'barcode' ? T.ac : 'transparent', color: mode === 'barcode' ? '#fff' : T.tx3, transition: 'all .15s' }}>Barcode</div>
            <div onClick={() => switchMode('text')} style={{ flex: 1, padding: '6px 0', borderRadius: 4, textAlign: 'center', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: mode === 'text' ? T.ac : 'transparent', color: mode === 'text' ? '#fff' : T.tx3, transition: 'all .15s' }}>Text (OCR)</div>
          </div>

          {/* Barcode camera */}
          {mode === 'barcode' && !cameraError && <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', marginBottom: 10, background: '#000', aspectRatio: '4/3' }}>
            <div ref={videoRef} style={{ position: 'absolute', inset: 0 }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
              <div style={{ width: '75%', height: 50, border: `2px solid ${scanning ? T.ac : T.gr}`, borderRadius: 8, position: 'relative' }}>
                {scanning && <div style={{ position: 'absolute', top: '50%', left: '10%', right: '10%', height: 2, background: T.re, boxShadow: `0 0 10px ${T.re}`, animation: 'scanLine 2s ease-in-out infinite' }} />}
              </div>
            </div>
          </div>}

          {/* OCR camera */}
          {mode === 'text' && !cameraError && <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', marginBottom: 10, background: '#000', aspectRatio: '4/3' }}>
            <video ref={ocrVideoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
              <div style={{ width: '80%', height: 40, border: `2px dashed ${T.ac}`, borderRadius: 6 }} />
            </div>
          </div>}

          {mode === 'text' && !cameraError && <div onClick={captureAndOcr} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', marginBottom: 10, padding: '10px 0', opacity: ocrProcessing ? 0.6 : 1, pointerEvents: ocrProcessing ? 'none' : 'auto' }}>
            {ocrProcessing ? <><div className="spinner" style={{ width: 14, height: 14 }} /> {ocrStatus}</> : 'Capture & Read Text'}
          </div>}

          {cameraError && <div style={{ background: T.s2, borderRadius: 10, padding: 20, marginBottom: 10, textAlign: 'center' }}><p style={{ fontSize: 12, color: T.yl }}>{cameraError}</p></div>}

          {/* Result */}
          {lastCode && <div style={{ borderRadius: T.r, padding: '8px 12px', marginBottom: 10, fontSize: 12, textAlign: 'center', fontFamily: T.mono, ...(scanError ? { background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)', color: T.re } : { background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.2)', color: T.gr }) }}>
            {scanError || `Detected: ${lastCode}`}
            {scanError && mode === 'barcode' && <p style={{ fontSize: 10, color: T.tx3, margin: '4px 0 0' }}>Re-scanning...</p>}
          </div>}
          {ocrStatus && !ocrProcessing && <p style={{ fontSize: 11, color: T.yl, textAlign: 'center', marginBottom: 8 }}>{ocrStatus}</p>}

          {/* Manual entry */}
          <div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 10 }}>
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Or type ID</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={manualId} onChange={(e) => setManualId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleManual(); }} placeholder="UNS-DDMMYY-XXXX" style={{ ...S.fInput, flex: 1, fontFamily: T.mono, fontSize: 12 }} />
              <span onClick={handleManual} style={S.btnPrimary}>Go</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Header = ({ title, onSearch, onNotifClick, onOpenScanner }: { title: string; onSearch?: (q: string) => void; onNotifClick?: (n: any) => void; onOpenScanner?: () => void }) => {
  const { notifications, markAsRead } = useNotifications();
  const [show, setShow] = useState(false);
  const unread = notifications.filter((n: any) => !n.is_read).length;
  const [globalSearch, setGlobalSearch] = useState('');

  const handleNotifClick = (n: any) => {
    markAsRead(n.id);
    setShow(false);
    if (onNotifClick) onNotifClick(n);
  };

  return (
    <header className="header-bar" style={{ background: 'rgba(8,11,20,0.60)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', borderBottom: `1px solid ${T.bd}`, padding: '0 16px', position: 'sticky', top: 0, zIndex: 50, height: 44, display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        {/* Title with accent dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, boxShadow: `0 0 8px ${T.ac}55` }} />
          <h1 className="header-title" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.tx, whiteSpace: 'nowrap', fontFamily: T.sora, letterSpacing: -0.2 }}>{title}</h1>
        </div>
        {/* Separator */}
        <div style={{ width: 1, height: 18, background: `linear-gradient(180deg, transparent, ${T.bd2}, transparent)`, flexShrink: 0 }} />
        {/* Search */}
        <div className="header-search" style={{ flex: 1, maxWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '5px 10px', transition: 'all .18s' }}>
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, flexShrink: 0, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
            <input value={globalSearch} onChange={(e) => { setGlobalSearch(e.target.value); onSearch?.(e.target.value); }} placeholder="Search items, IDs, SKUs..." style={{ background: 'transparent', border: 'none', outline: 'none', color: T.tx, fontFamily: T.sans, fontSize: 11, flex: 1, minWidth: 0 }} />
            {globalSearch && <span onClick={() => { setGlobalSearch(''); onSearch?.(''); }} style={{ cursor: 'pointer', color: T.tx3, fontSize: 12, lineHeight: 1 }}>×</span>}
          </div>
        </div>
        {/* Right actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => onOpenScanner?.()} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.02)', cursor: 'pointer', color: T.tx3, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }} title="Scan barcode" onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = T.bd2; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = T.bd; }}>
          <Icon name="scan" size={14} />
        </button>
        <div style={{ position: 'relative' }}>
        <button onClick={() => setShow(!show)} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.02)', cursor: 'pointer', position: 'relative', color: T.tx3, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = T.bd2; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = T.bd; }}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></svg>
          {unread > 0 && <span style={{ position: 'absolute', top: -3, right: -3, width: 14, height: 14, background: T.ac, color: 'white', borderRadius: '50%', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, boxShadow: `0 0 6px ${T.ac}66` }}>{unread}</span>}
        </button>
        {show && (
          <div className="notif-dropdown" style={{ position: 'absolute', right: 0, top: 38, width: 290, background: 'rgba(12,16,28,0.96)', backdropFilter: 'blur(24px)', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,.55)', border: `1px solid ${T.bd2}`, zIndex: 50, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, fontWeight: 600, fontSize: 11, color: T.tx, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Notifications {unread > 0 && <span style={{ fontSize: 9, fontFamily: T.mono, color: T.ac, background: 'rgba(99,102,241,.10)', padding: '2px 6px', borderRadius: 4 }}>{unread} new</span>}</div>
            {notifications.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No notifications</div> : notifications.slice(0, 10).map((n: any) => (
              <div key={n.id} onClick={() => handleNotifClick(n)} style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', background: n.is_read ? 'transparent' : 'rgba(99,102,241,.04)', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(99,102,241,.04)'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: T.tx }}>{n.title}</p>
                  {!n.is_read && <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.ac, flexShrink: 0, marginTop: 4 }} />}
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: T.tx3, lineHeight: 1.4 }}>{n.message}</p>
                <p style={{ margin: '3px 0 0', fontSize: 9, color: T.tx3, opacity: 0.5 }}>{new Date(n.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
      </div>
    </header>
  );
};

const statusTag = (status: string) => {
  const m: Record<string, { bg: string; color: string; bd: string }> = {
    complete: { bg: 'rgba(34,197,94,0.10)', color: '#4ADE80', bd: 'rgba(34,197,94,0.25)' },
    completed: { bg: 'rgba(34,197,94,0.15)', color: '#4ADE80', bd: 'rgba(34,197,94,0.30)' },
    damaged: { bg: 'rgba(239,68,68,0.10)', color: '#FCA5A5', bd: 'rgba(239,68,68,0.25)' },
    unsorted: { bg: 'rgba(245,158,11,0.10)', color: '#FCD34D', bd: 'rgba(245,158,11,0.25)' },
    dry_clean: { bg: 'rgba(56,189,248,0.10)', color: '#7DD3FC', bd: 'rgba(56,189,248,0.25)' },
  };
  const s = m[status] || m.unsorted;
  return { display: 'inline-flex' as const, alignItems: 'center' as const, gap: 4, padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.bd}`, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
};

const Dashboard = () => {
  const { profile } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const [stats, setStats] = useState<any>({ total_products: 0, total_inventory: 0, damaged_count: 0, unsorted_count: 0, complete_count: 0, open_reports: 0 });
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState('');
  const refreshStats = () => { supabase.from('dashboard_summary').select('*').limit(1).then(({ data }) => { if (data && data[0]) setStats(data[0]); }); };
  const fetchTasks = () => { supabase.from('tasks').select('*').order('created_at', { ascending: false }).then(({ data }) => setTasks(data || [])); };

  useEffect(() => {
    refreshStats(); fetchTasks();
    const ch = supabase.channel('dash-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, refreshStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, refreshStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'damage_reports' }, refreshStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchTasks)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const addTask = async (e: React.FormEvent) => { e.preventDefault(); if (!newTask.trim()) return; await supabase.from('tasks').insert({ title: newTask.trim(), created_by: profile?.id }); setNewTask(''); fetchTasks(); };
  const toggleTask = async (id: string, done: boolean) => { await supabase.from('tasks').update({ is_done: !done }).eq('id', id); fetchTasks(); };
  const deleteTask = async (id: string) => { await supabase.from('tasks').delete().eq('id', id); fetchTasks(); };

  const cards = [
    { label: 'Categories', value: stats.total_products, color: T.ac },
    { label: 'Total items', value: stats.total_inventory, color: T.bl },
    { label: 'Unsorted', value: stats.unsorted_count, color: T.yl },
    { label: 'Damaged', value: stats.damaged_count, color: T.re },
    { label: 'Dry clean', value: stats.dry_clean_count || 0, color: '#06b6d4' },
    { label: 'Complete', value: stats.complete_count, color: T.gr },
    { label: 'Completed', value: stats.completed_count || 0, color: '#10b981' },
  ];

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease', position: 'relative' }}>
      {/* Ambient glow */}
      <div style={{ position: 'absolute', top: -60, right: -40, width: 250, height: 250, background: `radial-gradient(circle, ${T.ac}12 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>{greeting}, {profile?.full_name?.split(' ')[0] || 'there'}</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: T.tx3 }}>Here's your overview for today</p>
      </div>
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '14px 16px', transition: 'transform .2s, box-shadow .2s', cursor: 'default', position: 'relative', overflow: 'hidden', backdropFilter: 'blur(8px)' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${c.color}18`; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.color}cc, ${c.color}33)` }} />
            <p style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.8, marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>{c.label}</p>
            <p style={{ fontFamily: T.sora, fontSize: 24, fontWeight: 700, color: c.color, margin: 0, letterSpacing: -0.5 }}>{c.value}</p>
          </div>
        ))}
      </div>
      {/* Tasker */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Tasks</span>
          <span style={{ fontSize: 9, color: T.tx3 }}>{tasks.filter(t => !t.is_done).length} pending</span>
        </div>
        <form onSubmit={addTask} style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${T.bd}` }}>
          <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task..." style={{ ...S.fInput, flex: 1 }} />
          <button type="submit" style={S.btnPrimary}>Add</button>
        </form>
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {tasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: `1px solid ${T.bd}`, opacity: t.is_done ? 0.45 : 1 }}>
              <div onClick={() => toggleTask(t.id, t.is_done)} style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${t.is_done ? T.gr : T.bd2}`, background: t.is_done ? T.gr : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#000', fontWeight: 700, flexShrink: 0 }}>{t.is_done && '✓'}</div>
              <span style={{ flex: 1, fontSize: 11, color: T.tx, textDecoration: t.is_done ? 'line-through' : 'none' }}>{t.title}</span>
              <span onClick={() => deleteTask(t.id)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 11, opacity: 0.4 }}>×</span>
            </div>
          ))}
          {tasks.length === 0 && <div style={{ padding: 18, textAlign: 'center', color: T.tx3, fontSize: 10 }}>No tasks yet</div>}
        </div>
      </div>
      </div>
    </div>
  );
};

const MARKETPLACES = ['Myntra-Fusionic', 'Ajio-Fusionic', 'Tanuka', 'Svaraa', 'Amazon'];
const SIZES = ['N/A', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size', 'Semi-Stitched'];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const canAlterSize = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (a === 'Semi-Stitched' || b === 'Semi-Stitched') return true;
  if (a === 'N/A' || b === 'N/A') return true;
  const ai = SIZE_ORDER.indexOf(a), bi = SIZE_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return false;
  return Math.abs(ai - bi) === 1;
};
const isDupatta = (name: string) => /dup+at*a|orhni|chunni|stole/i.test(name);
const isLehenga = (name: string) => /lehenga|lehnga|ghaghra/i.test(name);
const isBottomType = (name: string) => /bottom|pant|trouser|skirt|salwar|churidar|palazzo/i.test(name);

const Inventory = ({ globalSearch = '', openItemId, onItemOpened, active }: { globalSearch?: string; openItemId?: string | null; onItemOpened?: () => void; active?: boolean }) => {
  const [stage, setStage] = useState<'pending' | 'completed'>('pending');
  const instanceId = useId();
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [comps, setComps] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [itemTags, setItemTags] = useState<Record<string, any[]>>({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [locFilter, setLocFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [mpFilter, setMpFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [form, setForm] = useState({ product_id: '', serial_number: '', size: '', status: 'unsorted', location: '', notes: '', order_id: '', marketplace: '', ticket_id: '', link: '' });
  const [catSearch, setCatSearch] = useState('');
  const [showCatDrop, setShowCatDrop] = useState(false);
  const [showSkuDrop, setShowSkuDrop] = useState(false);
  const [catComps, setCatComps] = useState<any[]>([]);
  const [missingComps, setMissingComps] = useState<Set<string>>(new Set());
  const [damagedComps, setDamagedComps] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState('');
  const [matchResult, setMatchResult] = useState<any>(null);

  const [itemMissing, setItemMissing] = useState<Record<string, string[]>>({});
  const [itemDamaged, setItemDamaged] = useState<Record<string, string[]>>({});
  const [itemPresent, setItemPresent] = useState<Record<string, Set<string>>>({});
  const [completablePairs, setCompletablePairs] = useState<Record<string, string[]>>({});
  const [showCompleteModal, setShowCompleteModal] = useState<{ itemId: string; pairId?: string } | null>(null);
  const [showIntel, setShowIntel] = useState(false);
  const [intelResults, setIntelResults] = useState<any[]>([]);
  const [showExtras, setShowExtras] = useState(false);
  const [invLimit, setInvLimit] = useState(5000);
  const [invTruncated, setInvTruncated] = useState(false);

  useEffect(() => { if (active) setShowExtras(false); }, [active]);

  const fetchData = () => {
    supabase.from('inventory_items').select('*, products(name, sku, total_components)').order('created_at', { ascending: false }).limit(invLimit).then(({ data }) => { setItems(data || []); setInvTruncated((data || []).length >= invLimit); });
    supabase.from('products').select('*').eq('is_active', true).then(({ data }) => setProducts(data || []));
    supabase.from('locations').select('*').order('name').then(({ data }) => setLocations(data || []));
    supabase.from('tags').select('*').order('name').then(({ data }) => setTags(data || []));
    supabase.from('item_tags').select('*, tags(id, name, color)').then(({ data }) => {
      const map: Record<string, any[]> = {};
      (data || []).forEach((it: any) => { if (!map[it.inventory_item_id]) map[it.inventory_item_id] = []; map[it.inventory_item_id].push(it.tags); });
      setItemTags(map);
    });
    supabase.from('item_components').select('inventory_item_id, component_id, status, components(name)').then(({ data }) => {
      const missingMap: Record<string, string[]> = {};
      const damagedMap: Record<string, string[]> = {};
      const presentMap: Record<string, Set<string>> = {};
      (data || []).forEach((ic: any) => {
        if (ic.status === 'missing') {
          if (!missingMap[ic.inventory_item_id]) missingMap[ic.inventory_item_id] = [];
          if (ic.components?.name) missingMap[ic.inventory_item_id].push(ic.components.name);
        }
        if (ic.status === 'damaged') {
          if (!damagedMap[ic.inventory_item_id]) damagedMap[ic.inventory_item_id] = [];
          if (ic.components?.name) damagedMap[ic.inventory_item_id].push(ic.components.name);
        }
        if (ic.status === 'present') {
          if (!presentMap[ic.inventory_item_id]) presentMap[ic.inventory_item_id] = new Set();
          presentMap[ic.inventory_item_id].add(ic.component_id);
        }
      });
      setItemMissing(missingMap); setItemDamaged(damagedMap);
      setItemPresent(presentMap);
    });
  };

  // Compute all completable pairs: must match category + SKU + size
  useEffect(() => {
    if (items.length === 0) return;
    const unsorted = items.filter(i => i.status === 'unsorted');
    const pairs: Record<string, string[]> = {};
    for (const a of unsorted) {
      const aPresent = itemPresent[a.id];
      const aMissing = itemMissing[a.id];
      if (!aMissing || aMissing.length === 0 || !aPresent) continue;
      const totalComps = a.products?.total_components || 0;
      if (totalComps === 0) continue;
      for (const b of unsorted) {
        if (a.id === b.id) continue;
        // Must match: same category, same SKU, same size
        if (a.product_id !== b.product_id) continue;
        if ((a.serial_number || '') !== (b.serial_number || '')) continue;
        const sA = a.size || '', sB = b.size || '';
        if (sA !== sB && sA !== 'N/A' && sB !== 'N/A') continue;
        const bPresent = itemPresent[b.id];
        if (!bPresent) continue;
        const union = new Set([...aPresent, ...bPresent]);
        if (union.size >= totalComps) {
          if (!pairs[a.id]) pairs[a.id] = [];
          if (!pairs[a.id].includes(b.id)) pairs[a.id].push(b.id);
        }
      }
    }
    setCompletablePairs(pairs);
  }, [items, itemMissing, itemPresent]);
  useEffect(() => {
    fetchData();
    let debounceTimer: any;
    const debouncedFetch = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(fetchData, 500); };
    const ch = supabase.channel('inv-sync-' + instanceId.replace(/:/g, ''))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_components' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_tags' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, debouncedFetch)
      .subscribe();
    return () => { clearTimeout(debounceTimer); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back button support
  useEffect(() => {
    const onPop = () => { if (showExtras) setShowExtras(false); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [showExtras]);

  // Open item detail from notification click
  useEffect(() => {
    if (!openItemId) return;
    (async () => {
      const { data: item } = await supabase.from('inventory_items').select('*, products(name, sku, total_components)').eq('id', openItemId).maybeSingle();
      if (item) { setSelected(item); await fetchComps(item.id); supabase.from('activity_logs').select('*, profiles:user_id(full_name)').eq('entity_id', item.id).order('created_at', { ascending: false }).limit(20).then(({ data }) => setItemLogs(data || [])); setShowCompModal(true); }
      onItemOpened?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItemId]);

  const fetchComps = async (id: string) => { const { data } = await supabase.from('item_components').select('*, components(name, component_code, is_critical)').eq('inventory_item_id', id); setComps(data || []); };

  const generateUniqueId = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `UNS-${dd}${mm}${yy}-${seq}`;
  };

  const updateComponentStatuses = async (inventoryItemId: string) => {
    await new Promise(r => setTimeout(r, 500));
    const { data: itemComps } = await supabase.from('item_components').select('*').eq('inventory_item_id', inventoryItemId);
    if (itemComps) {
      for (const ic of itemComps) {
        const status = damagedComps.has(ic.component_id) ? 'damaged' : missingComps.has(ic.component_id) ? 'missing' : 'present';
        await supabase.from('item_components').update({ status }).eq('id', ic.id);
      }
    }
  };

  const checkForPairMatch = async (productId: string, currentItemId: string) => {
    // Get current item details for SKU + size matching
    const { data: currentItem } = await supabase.from('inventory_items').select('serial_number, size').eq('id', currentItemId).maybeSingle();
    if (!currentItem) return;

    // Get all components for this category
    const { data: allComps } = await supabase.from('components').select('id').eq('product_id', productId);
    if (!allComps || allComps.length === 0) return;
    const allCompIds = new Set(allComps.map(c => c.id));

    // Get the current item's present components
    const { data: currentItemComps } = await supabase.from('item_components').select('component_id, status').eq('inventory_item_id', currentItemId);
    if (!currentItemComps) return;
    const currentPresent = new Set(currentItemComps.filter(c => c.status === 'present').map(c => c.component_id));
    const currentMissing = new Set(currentItemComps.filter(c => c.status === 'missing').map(c => c.component_id));
    if (currentMissing.size === 0) return;

    // Find other unsorted items of the same category + SKU + size
    let query = supabase.from('inventory_items')
      .select('id, batch_number, serial_number, size, created_at')
      .eq('product_id', productId)
      .eq('status', 'unsorted')
      .neq('id', currentItemId);
    if (currentItem.serial_number) query = query.eq('serial_number', currentItem.serial_number);
    if (currentItem.size && currentItem.size !== 'N/A') query = query.eq('size', currentItem.size);
    const { data: otherItems } = await query;
    if (!otherItems || otherItems.length === 0) return;

    // Check each other item for complementary components
    for (const other of otherItems) {
      const { data: otherComps } = await supabase.from('item_components').select('component_id, status').eq('inventory_item_id', other.id);
      if (!otherComps) continue;
      const otherPresent = new Set(otherComps.filter(c => c.status === 'present').map(c => c.component_id));

      // Check if the union of present components from both items covers ALL components
      const union = new Set([...currentPresent, ...otherPresent]);
      const coversAll = [...allCompIds].every(id => union.has(id));

      if (coversAll) {
        // Get component names for display
        const { data: compNames } = await supabase.from('components').select('id, name').eq('product_id', productId);
        const nameMap = Object.fromEntries((compNames || []).map(c => [c.id, c.name]));
        const currentPresentNames = [...currentPresent].map(id => nameMap[id]).filter(Boolean);
        const otherPresentNames = [...otherPresent].map(id => nameMap[id]).filter(Boolean);
        const catName = products.find(p => p.id === productId)?.name || 'Unknown';

        setMatchResult({
          categoryName: catName,
          sku: currentItem.serial_number || '',
          size: currentItem.size || '',
          currentId: currentItemId,
          currentUniqueId: items.find(i => i.id === currentItemId)?.batch_number || 'Current item',
          currentPresent: currentPresentNames,
          otherId: other.id,
          otherUniqueId: other.batch_number || other.serial_number || 'Unknown',
          otherPresent: otherPresentNames,
          otherDate: new Date(other.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        });
        return; // found a match, stop searching
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.product_id) { addToast('Please select a category', 'error'); return; }
    if (selected && selected.product_id !== form.product_id) { addToast('Cannot change category on existing item. Delete and recreate instead.', 'error'); return; }
    const hasDupatta = catComps.some(c => isDupatta(c.name));
    const hasNonDupatta = catComps.some(c => !isDupatta(c.name));
    if (!form.size) { addToast('Please select a size', 'error'); return; }
    if (hasNonDupatta && form.size === 'N/A') {
      addToast('N/A is only for Dupatta-only items. Select a proper size.', 'error'); return;
    }
    if (hasDupatta && !hasNonDupatta && form.size !== 'N/A') {
      addToast('Dupatta-only items must have size N/A', 'error'); return;
    }
    if (!selected && form.status === 'unsorted' && catComps.length > 0 && missingComps.size === 0 && damagedComps.size === 0) {
      addToast('All components are present — status should be "Complete" not "Unsorted"', 'error'); return;
    }
    if (form.status === 'unsorted' && catComps.length > 0 && missingComps.size === catComps.length) {
      addToast('All components are missing — entire product is missing. Change status or deselect some.', 'error'); return;
    }
    let savedItemId = '';
    if (selected) {
      if (selected.serial_number && selected.serial_number !== form.serial_number) {
        const { count } = await supabase.from('inventory_extras').select('id', { count: 'exact', head: true }).eq('sku', selected.serial_number);
        if ((count || 0) > 0) { addToast(`Cannot change SKU — ${count} extra(s) reference "${selected.serial_number}". Update extras first.`, 'error'); return; }
      }
      const { error } = await supabase.from('inventory_items').update(form).eq('id', selected.id);
      if (error) { addToast(error.message, 'error'); return; }
      if (form.status === 'unsorted' || form.status === 'damaged') await updateComponentStatuses(selected.id);
      savedItemId = selected.id;
      addToast('Updated!', 'success');
    } else {
      // Auto-generate unique ID and store in batch_number
      const uniqueId = generateUniqueId();
      const insertData = { ...form, batch_number: uniqueId, reported_by: profile?.id };
      const { data, error } = await supabase.from('inventory_items').insert(insertData).select().single();
      if (error || !data) { addToast(error?.message || 'Error', 'error'); return; }
      if (form.status === 'unsorted' || form.status === 'damaged') await updateComponentStatuses(data.id);
      savedItemId = data.id;
      addToast(`Item added! ID: ${uniqueId}`, 'success');
    }
    // Save tags
    if (savedItemId && tagInput.trim()) {
      await supabase.from('item_tags').delete().eq('inventory_item_id', savedItemId);
      const tagNames = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      for (const name of tagNames) {
        let { data: existing } = await supabase.from('tags').select('id').eq('name', name).maybeSingle();
        if (!existing) { const { data: created } = await supabase.from('tags').insert({ name }).select('id').single(); existing = created; }
        if (existing) await supabase.from('item_tags').insert({ inventory_item_id: savedItemId, tag_id: existing.id });
      }
    } else if (savedItemId && !tagInput.trim()) {
      await supabase.from('item_tags').delete().eq('inventory_item_id', savedItemId);
    }

    const savedProductId = form.product_id;
    const savedStatus = form.status;
    const hadMissing = missingComps.size > 0;
    setShowModal(false); setSelected(null); setForm({ product_id: '', serial_number: '', size: '', status: 'unsorted', location: '', notes: '', order_id: '', marketplace: '', ticket_id: '', link: '' }); setCatComps([]); setMissingComps(new Set()); setDamagedComps(new Set()); setTagInput(''); fetchData();

    // Check for pair matches after save (only for unsorted items with missing components)
    if (savedStatus === 'unsorted' && hadMissing) {
      setTimeout(() => checkForPairMatch(savedProductId, savedItemId), 1000);
    }
  };

  const updateComp = async (id: string, status: string) => { const { error } = await supabase.from('item_components').update({ status }).eq('id', id); if (error) addToast(error.message, 'error'); else { addToast('Updated!', 'success'); fetchComps(selected.id); fetchData(); } };

  const openEdit = async (item: any) => {
    setSelected(item); setForm({ product_id: item.product_id, serial_number: item.serial_number || '', size: item.size || '', status: item.status, location: item.location || '', notes: item.notes || '', order_id: item.order_id || '', marketplace: item.marketplace || '', ticket_id: item.ticket_id || '', link: item.link || '' }); setCatSearch(item.products?.name || '');
    const { data: cc } = await supabase.from('components').select('*').eq('product_id', item.product_id);
    setCatComps(cc || []);
    const { data: ic } = await supabase.from('item_components').select('*').eq('inventory_item_id', item.id);
    const missing = new Set<string>(); const damaged = new Set<string>();
    if (ic) ic.forEach((c: any) => { if (c.status === 'missing') missing.add(c.component_id); if (c.status === 'damaged') damaged.add(c.component_id); });
    setMissingComps(missing); setDamagedComps(damaged);
    setTagInput((itemTags[item.id] || []).map((t: any) => t?.name).filter(Boolean).join(', '));
    setShowModal(true);
  };
  const [itemLogs, setItemLogs] = useState<any[]>([]);

  const printBarcode = (uniqueId: string) => {
    const canvas = document.createElement('canvas');
    try { JsBarcode(canvas, uniqueId, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 14, font: 'IBM Plex Mono', margin: 10 }); } catch { return; }
    const win = window.open('', '_blank', 'width=400,height=250');
    if (!win) return;
    win.document.write(`<html><head><title>${uniqueId}</title><style>body{font-family:'IBM Plex Sans',sans-serif;text-align:center;padding:20px}@media print{.no-print{display:none}}</style></head><body><img src="${canvas.toDataURL()}" /><br><button class="no-print" onclick="window.print()" style="margin-top:16px;padding:8px 24px;font-size:14px;cursor:pointer">Print</button></body></html>`);
    win.document.close();
  };
  const openComps = async (item: any) => {
    setSelected(item); await fetchComps(item.id);
    supabase.from('activity_logs').select('*, profiles:user_id(full_name)').eq('entity_id', item.id).order('created_at', { ascending: false }).limit(20).then(({ data }) => setItemLogs(data || []));
    setShowCompModal(true);
  };
  const canEdit = profile && ['admin', 'manager', 'operator'].includes(profile.role);

  const [pendingDelete, setPendingDelete] = useState<{ id: string; timer: number } | null>(null);

  const handleDelete = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    if (item.paired_with) { addToast('Cannot delete — item is paired. Unpair first.', 'error'); return; }
    if (item.status === 'completed') { addToast('Cannot delete a completed item.', 'error'); return; }
    setItems(prev => prev.filter(i => i.id !== itemId));
    const timer = window.setTimeout(async () => {
      await supabase.from('item_tags').delete().eq('inventory_item_id', itemId);
      await supabase.from('item_components').delete().eq('inventory_item_id', itemId);
      await supabase.from('inventory_items').delete().eq('id', itemId);
      setPendingDelete(null);
      fetchData();
    }, 5000);
    setPendingDelete({ id: itemId, timer });
  };

  const undoDelete = () => {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      setPendingDelete(null);
      fetchData();
    }
  };

  const handleComplete = async (itemId: string, pairId: string) => {
    const [{ data: aComps }, { data: bComps }, { data: prod }] = await Promise.all([
      supabase.from('item_components').select('component_id, status').eq('inventory_item_id', itemId),
      supabase.from('item_components').select('component_id, status').eq('inventory_item_id', pairId),
      supabase.from('inventory_items').select('product_id, products(total_components)').eq('id', itemId).maybeSingle() as any,
    ]);
    const aP = new Set((aComps || []).filter(c => c.status === 'present').map(c => c.component_id));
    const bP = new Set((bComps || []).filter(c => c.status === 'present').map(c => c.component_id));
    const union = new Set([...aP, ...bP]);
    const total = (prod as any)?.products?.total_components || 0;
    if (total > 0 && union.size < total) { addToast('Cannot complete — combined components do not cover all required parts. Data may have changed.', 'error'); setShowCompleteModal(null); fetchData(); return; }
    const { error: e1 } = await supabase.from('inventory_items').update({ status: 'completed', paired_with: pairId }).eq('id', itemId);
    const { error: e2 } = await supabase.from('inventory_items').update({ status: 'completed', paired_with: itemId }).eq('id', pairId);
    if (e1 || e2) { addToast(`Error: ${e1?.message || e2?.message}`, 'error'); return; }
    setItems(prev => prev.map(i => (i.id === itemId || i.id === pairId) ? { ...i, status: 'completed' } : i));
    addToast('Both items moved to Completed!', 'success');
    setShowCompleteModal(null);
    fetchData();
  };

  const handleCancelCompletion = async (itemId: string) => {
    // Check if completed via extra — cannot revert
    const { count: extraUsed } = await supabase.from('inventory_extras_history').select('id', { count: 'exact', head: true }).eq('related_inventory_item_id', itemId).eq('action', 'used');
    if ((extraUsed || 0) > 0) { addToast('Cannot revert — item was completed using an extra. Extra quantity was already decremented.', 'error'); return; }
    const item = items.find(i => i.id === itemId);
    const pairedId = item?.paired_with;
    const idsToRevert = [itemId];
    if (pairedId) idsToRevert.push(pairedId);

    for (const id of idsToRevert) {
      await supabase.from('inventory_items').update({ status: 'unsorted', paired_with: null }).eq('id', id);
    }
    setItems(prev => prev.map(i => idsToRevert.includes(i.id) ? { ...i, status: 'unsorted', paired_with: null } : i));
    addToast(pairedId ? 'Both paired items moved back to Inventory' : 'Item moved back to Inventory', 'success');
    fetchData();
  };

  const computeIntel = async () => {
    const unsorted = items.filter(i => i.status === 'unsorted');
    const results: any[] = [];
    const checked = new Set<string>();

    for (const a of unsorted) {
      const aMissing = itemMissing[a.id] || [];
      const aPresent = itemPresent[a.id];
      if (!aMissing.length || !aPresent) continue;

      for (const b of unsorted) {
        if (a.id === b.id) continue;
        if (a.product_id !== b.product_id) continue;
        if ((a.serial_number || '') !== (b.serial_number || '')) continue;
        // Skip if same size (normal pairing handles that)
        if ((a.size || '') === (b.size || '')) continue;
        // Must be alterable adjacent sizes
        if (!canAlterSize(a.size || '', b.size || '')) continue;
        // Skip duplicate pairs
        const pairKey = [a.id, b.id].sort().join('-');
        if (checked.has(pairKey)) continue;

        const bPresent = itemPresent[b.id];
        if (!bPresent) continue;
        const totalComps = a.products?.total_components || 0;
        if (totalComps === 0) continue;

        const union = new Set([...aPresent, ...bPresent]);
        if (union.size >= totalComps) {
          checked.add(pairKey);
          results.push({
            itemA: a, itemB: b,
            missingA: aMissing,
            missingB: itemMissing[b.id] || [],
            sizeA: a.size, sizeB: b.size,
            category: a.products?.name,
            sku: a.serial_number,
          });
        }
      }
    }
    setIntelResults(results);
    setShowIntel(true);
  };

  const isCompletedView = stage === 'completed';

  const filtered = items.filter((i) => {
    // Pending stage hides completed items; completed stage only shows them
    if (!isCompletedView && i.status === 'completed') return false;
    if (isCompletedView && i.status !== 'completed') return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (catFilter !== 'all' && i.product_id !== catFilter) return false;
    if (locFilter !== 'all' && (i.location || '') !== locFilter) return false;
    if (mpFilter !== 'all' && (i.marketplace || '') !== mpFilter) return false;
    if (tagFilter !== 'all') { const t = itemTags[i.id] || []; if (!t.some((tg: any) => tg?.id === tagFilter)) return false; }
    const searchTerm = globalSearch || search;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const fields = [
        i.products?.name, i.products?.sku, i.batch_number, i.serial_number, i.size,
        i.notes, i.location, i.order_id, i.marketplace, i.ticket_id, i.link, i.status,
        ...(itemTags[i.id] || []).map((t: any) => t?.name),
        ...(itemMissing[i.id] || []),
        ...(itemDamaged[i.id] || []),
      ];
      if (!fields.some(f => (f || '').toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const hasActiveFilters = statusFilter !== 'all' || catFilter !== 'all' || locFilter !== 'all' || mpFilter !== 'all' || tagFilter !== 'all' || search !== '' || globalSearch !== '';
  const clearFilters = () => { setStatusFilter('all'); setCatFilter('all'); setLocFilter('all'); setMpFilter('all'); setTagFilter('all'); setSearch(''); setPage(0); };

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  useEffect(() => { setPage(0); }, [statusFilter, catFilter, locFilter, mpFilter, tagFilter, search, globalSearch, stage]);

  const scrollToPair = (pairId: string) => {
    setHighlightId(pairId);
    const el = document.getElementById('row-' + pairId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHighlightId(null), 2000);
  };

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      {/* Stage toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!showExtras && <><div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, border: `1px solid ${T.bd}` }}>
            {(['pending', 'completed'] as const).map(s => (
              <div key={s} onClick={() => { setStage(s); setPage(0); }} style={{ padding: '4px 14px', borderRadius: 4, fontSize: 10, fontWeight: stage === s ? 600 : 400, cursor: 'pointer', background: stage === s ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'transparent', color: stage === s ? '#fff' : T.tx3, transition: 'all .15s', textTransform: 'capitalize' }}>{s}</div>
            ))}
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, color: T.tx3 }}>{filtered.length !== items.filter(i => isCompletedView ? i.status === 'completed' : i.status !== 'completed').length ? `${filtered.length} of ` : ''}{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span></>}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {!showExtras && <div onClick={() => {
            if (filtered.length === 0) return;
            const csv = 'Batch,SKU,Category,Size,Status,Location,Missing,Damaged\n' + filtered.map(i => `${i.batch_number || ''},${i.serial_number || ''},"${i.products?.name || ''}",${i.size || ''},${i.status},${i.location || ''},"${(itemMissing[i.id] || []).join('; ')}","${(itemDamaged[i.id] || []).join('; ')}"`).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Inventory_${stage}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
          }} style={{ ...S.btnGhost, fontSize: 10 }}>Export CSV</div>}
          {!showExtras && !isCompletedView && <div onClick={computeIntel} style={{ ...S.btnGhost, background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.15)', color: T.yl, fontWeight: 600, fontSize: 10 }}>Smart Intel</div>}
          {!showExtras && <div onClick={() => { setShowExtras(true); window.history.pushState({ view: 'extras' }, ''); }} style={{ ...S.btnGhost, background: 'rgba(56,189,248,.05)', border: '1px solid rgba(56,189,248,.15)', color: T.bl, fontWeight: 600, fontSize: 10 }}>Extras</div>}
          {!showExtras && canEdit && !isCompletedView && <div onClick={() => { setSelected(null); setForm({ product_id: '', serial_number: '', size: '', status: 'unsorted', location: '', notes: '', order_id: '', marketplace: '', ticket_id: '', link: '' }); setCatSearch(''); setCatComps([]); setMissingComps(new Set()); setDamagedComps(new Set()); setTagInput(''); setShowModal(true); }} style={S.btnPrimary}>+ Add Item</div>}
        </div>
      </div>
      {showExtras ? <InventoryExtras /> : <>
      <div className="filter-bar" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '8px 10px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, SKU code, location, notes..." style={{ ...S.fInput, flex: 1, minWidth: 160, padding: '6px 9px' }} />
        <div style={{ width: 1, height: 24, background: T.bd2 }} />
        {!isCompletedView && <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 100, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Status</option><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="dry_clean">Dry Clean</option><option value="complete">Complete</option></select>}
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 110, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Categories</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 100, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Locations</option>{locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select>
        <select value={mpFilter} onChange={(e) => setMpFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 110, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Marketplaces</option>{MARKETPLACES.map(m => <option key={m} value={m}>{m}</option>)}</select>
        {tags.length > 0 && <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 90, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Tags</option>{tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        {hasActiveFilters && <span onClick={clearFilters} style={{ fontSize: 10, color: T.ac, cursor: 'pointer', padding: '3px 8px', border: '1px solid rgba(99,102,241,.2)', borderRadius: 4, background: 'rgba(99,102,241,.06)' }}>Clear filters</span>}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
          <thead><tr>{['Unique ID', 'SKU', 'Category', 'Size', 'Tags', 'Notes', 'Link', 'Status', 'Issues', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
          <tbody>{paged.map((item) => {
            const missing = itemMissing[item.id] || [];
            const damaged = itemDamaged[item.id] || [];
            return (<tr key={item.id} id={'row-' + item.id} style={{ transition: 'background .2s', background: highlightId === item.id ? 'rgba(99,102,241,.08)' : 'transparent' }} onMouseEnter={e => { if (highlightId !== item.id) e.currentTarget.style.background = 'rgba(255,255,255,.015)'; }} onMouseLeave={e => { if (highlightId !== item.id) e.currentTarget.style.background = 'transparent'; }}>
            <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 10, whiteSpace: 'nowrap' }}><span style={{ color: T.gr }}>{item.batch_number || '—'}</span>{isCompletedView && item.paired_with && (() => { const pair = items.find(p => p.id === item.paired_with); return pair ? <span onClick={() => scrollToPair(item.paired_with)} style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, cursor: 'pointer' }} title="Click to find paired item"><svg viewBox="0 0 24 24" style={{ width: 9, height: 9, fill: 'none', stroke: T.ac2, strokeWidth: 2, flexShrink: 0 }}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg><span style={{ fontSize: 9, color: T.ac2 }}>{pair.batch_number}</span></span> : null; })()}</td>
            <td style={{ ...S.tdStyle, fontFamily: T.mono, color: T.ac2, fontSize: 10 }}>{item.serial_number || '—'}</td>
            <td style={{ ...S.tdStyle, fontSize: 11 }}><span style={{ fontWeight: 500 }}>{item.products?.name}</span></td>
            <td style={{ ...S.tdStyle, fontSize: 10, fontWeight: 500 }}>{item.size || '—'}</td>
            <td style={S.tdStyle}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{(itemTags[item.id] || []).map((t: any) => t && <span key={t.id} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 500, background: 'rgba(99,102,241,.10)', color: T.ac2 }}>{t.name}</span>)}{(itemTags[item.id] || []).length === 0 && <span style={{ color: T.tx3, fontSize: 10 }}>—</span>}</div></td>
            <td style={{ ...S.tdStyle, fontSize: 11, maxWidth: 140 }}>{item.notes ? <span onClick={() => setExpandedNote(expandedNote === item.id ? null : item.id)} style={{ color: T.tx2, cursor: 'pointer' }}>{expandedNote === item.id ? item.notes : item.notes.length > 25 ? item.notes.slice(0, 25) + '...' : item.notes}</span> : <span style={{ color: T.tx3 }}>—</span>}</td>
            <td style={S.tdStyle}>{item.link ? <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: T.ac, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="link" size={12} /></a> : <span style={{ color: T.tx3 }}>—</span>}</td>
            <td style={S.tdStyle}><span style={statusTag(item.status)}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.6 }} />{item.status === 'dry_clean' ? 'Dry Clean' : item.status}</span></td>
            <td style={S.tdStyle}>{(missing.length > 0 || damaged.length > 0) ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{missing.map((name, i) => <span key={'m'+i} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 500, background: 'rgba(251,191,36,.08)', color: T.yl }}>Missing: {name}</span>)}{damaged.map((name, i) => <span key={'d'+i} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 500, background: 'rgba(248,113,113,.08)', color: T.re }}>Damaged: {name}</span>)}</div> : <span style={{ color: T.tx3, fontSize: 10 }}>{item.status === 'completed' || item.status === 'complete' ? 'All good' : '—'}</span>}</td>
            <td style={S.tdStyle}>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <span onClick={() => openComps(item)} style={{ ...S.btnPrimary, ...S.btnSm }}>View</span>
                {!isCompletedView && completablePairs[item.id]?.length > 0 && <span onClick={() => setShowCompleteModal({ itemId: item.id })} style={{ ...S.btnSm, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 600, fontFamily: T.sans, background: 'rgba(16,185,129,.12)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' as const }}>Complete ({completablePairs[item.id].length})</span>}
                {isCompletedView && canEdit && <span onClick={() => { if (confirm(item.paired_with ? 'This will revert BOTH paired items back to Inventory. Continue?' : 'Revert this item back to Inventory?')) handleCancelCompletion(item.id); }} style={{ ...S.btnSm, padding: '2px 7px', borderRadius: 4, border: '1px solid rgba(251,191,36,.15)', cursor: 'pointer', fontSize: 9, fontWeight: 600, fontFamily: T.sans, background: 'rgba(251,191,36,.05)', color: T.yl, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' as const }}>Revert{item.paired_with ? ' Both' : ''}</span>}
                {canEdit && <span onClick={() => openEdit(item)} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</span>}
                {canEdit && <span onClick={() => handleDelete(item.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Del</span>}
              </div>
            </td>
          </tr>);})}</tbody>
        </table>
        </div>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>{hasActiveFilters ? 'No items match your filters' : 'No items yet'}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, fontSize: 11 }}>
        <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} style={{ ...S.fInput, width: 'auto', padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
        <span style={{ color: T.tx3 }}>rows</span>
        {totalPages > 1 && <>
          <span onClick={() => setPage(Math.max(0, page - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }}>Prev</span>
          <span style={{ color: T.tx3 }}>{page + 1} / {totalPages}</span>
          <span onClick={() => setPage(Math.min(totalPages - 1, page + 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= totalPages - 1 ? 0.3 : 1, pointerEvents: page >= totalPages - 1 ? 'none' : 'auto' }}>Next</span>
        </>}
        {invTruncated && <span onClick={() => { setInvLimit(p => p + 5000); fetchData(); }} style={{ ...S.btnGhost, fontSize: 9, color: T.yl, borderColor: 'rgba(245,158,11,.2)', background: 'rgba(245,158,11,.06)' }}>Load More Items ({invLimit} loaded)</span>}
      </div>

      {showModal && (<div style={S.modalOverlay}><div className="modal-inner" style={S.modalBox}><div style={S.modalHead}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Item</span></div><form onSubmit={handleSubmit} style={{ padding: 16 }}><div style={{ marginBottom: 10, position: 'relative' }}><label style={S.fLabel}>Category *</label><input value={catSearch} onChange={(e) => { setCatSearch(e.target.value); setShowCatDrop(true); setForm({ ...form, product_id: '' }); }} onFocus={() => setShowCatDrop(true)} placeholder="Type to search categories by name or SKU..." style={{ ...S.fInput, opacity: selected ? 0.6 : 1 }} autoComplete="off" disabled={!!selected} /><input type="hidden" value={form.product_id} required />{form.product_id && <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: T.r, background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.25)', fontSize: 12, color: T.ac2 }}>{products.find(p => p.id === form.product_id)?.name} <span style={{ fontFamily: T.mono, opacity: 0.7 }}>{products.find(p => p.id === form.product_id)?.sku}</span><span onClick={() => { setForm({ ...form, product_id: '' }); setCatSearch(''); }} style={{ cursor: 'pointer', marginLeft: 4, opacity: 0.6 }}>✕</span></div>}{showCatDrop && !form.product_id && (() => { const q = catSearch.toLowerCase(); const filtered = products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))); return filtered.length > 0 ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, maxHeight: 180, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>{filtered.map(p => <div key={p.id} onClick={() => { setForm({ ...form, product_id: p.id }); setCatSearch(p.name); setShowCatDrop(false); supabase.from('components').select('*').eq('product_id', p.id).then(({ data }) => { setCatComps(data || []); setMissingComps(new Set()); setDamagedComps(new Set()); }); }} style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bd}`, transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.s2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><span style={{ fontSize: 13, color: T.tx }}>{p.name}</span><span style={{ fontSize: 11, fontFamily: T.mono, color: T.tx3 }}>{p.sku}</span></div>)}</div> : catSearch ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, padding: '12px 14px', fontSize: 12, color: T.tx3, zIndex: 10 }}>No categories found</div> : null; })()}</div><div style={{ marginBottom: 10, position: 'relative' }}><label style={S.fLabel}>SKU Code</label><input value={form.serial_number} onChange={(e) => { setForm({ ...form, serial_number: e.target.value }); setShowSkuDrop(true); }} onFocus={() => setShowSkuDrop(true)} onBlur={() => setTimeout(() => setShowSkuDrop(false), 150)} placeholder="e.g. LC-001-A" style={{ ...S.fInput, fontFamily: T.mono }} autoComplete="off" />{showSkuDrop && form.serial_number && (() => { const q = form.serial_number.toLowerCase(); const existing = [...new Set(items.map(i => i.serial_number).filter(Boolean))]; const matches = existing.filter(s => s.toLowerCase().includes(q) && s !== form.serial_number); return matches.length > 0 ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, maxHeight: 140, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,.3)' }}>{matches.slice(0, 8).map(s => <div key={s} onMouseDown={() => { setForm({ ...form, serial_number: s }); setShowSkuDrop(false); }} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontFamily: T.mono, color: T.ac2, borderBottom: `1px solid ${T.bd}`, transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.s2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{s}</div>)}</div> : null; })()}</div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Size</label><select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} style={S.fInput}><option value="">Select size...</option>{SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div><label style={S.fLabel}>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={S.fInput}><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="dry_clean">Dry Clean</option><option value="complete">Complete</option></select></div></div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Location</label><select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={S.fInput}><option value="">Select location</option>{locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select></div><div><label style={S.fLabel}>Marketplace</label><select value={form.marketplace} onChange={(e) => setForm({ ...form, marketplace: e.target.value })} style={S.fInput}><option value="">Select</option>{MARKETPLACES.map(m => <option key={m} value={m}>{m}</option>)}</select></div></div>{(form.status === 'unsorted' || form.status === 'damaged') && catComps.length > 0 && <div style={{ marginBottom: 14 }}>
  <label style={S.fLabel}>Component Status <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>(click to toggle: Present → Missing → Damaged)</span></label>
  {form.status === 'damaged' && <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
    <span onClick={() => { setDamagedComps(new Set(catComps.map((c: any) => c.id))); setMissingComps(new Set()); }} style={{ ...S.btnDanger, fontSize: 10, padding: '3px 10px', cursor: 'pointer' }}>Mark All Damaged</span>
    <span onClick={() => { setDamagedComps(new Set()); setMissingComps(new Set()); }} style={{ ...S.btnGhost, fontSize: 10, padding: '3px 10px' }}>Reset All</span>
  </div>}
  <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 8 }}>{catComps.map(c => {
    const isMissing = missingComps.has(c.id);
    const isDamaged = damagedComps.has(c.id);
    const state = isDamaged ? 'damaged' : isMissing ? 'missing' : 'present';
    const cycle = () => {
      const m = new Set(missingComps); const d = new Set(damagedComps);
      if (state === 'present') { m.add(c.id); d.delete(c.id); }
      else if (state === 'missing') { m.delete(c.id); d.add(c.id); }
      else { m.delete(c.id); d.delete(c.id); }
      setMissingComps(m); setDamagedComps(d);
    };
    const bg = isDamaged ? 'rgba(248,113,113,.08)' : isMissing ? 'rgba(251,191,36,.08)' : 'transparent';
    const bdr = isDamaged ? 'rgba(248,113,113,.3)' : isMissing ? 'rgba(251,191,36,.3)' : 'transparent';
    const clr = isDamaged ? T.re : isMissing ? T.yl : T.gr;
    return <div key={c.id} onClick={cycle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 3, background: bg, border: `1px solid ${bdr}`, transition: 'all .12s' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: clr, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: state === 'present' ? T.tx : clr, flex: 1 }}>{c.name}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: clr, textTransform: 'uppercase' as const }}>{state}</span>
    </div>;
  })}</div>
  {missingComps.size > 0 && <p style={{ fontSize: 10, color: T.yl, marginTop: 5 }}>{missingComps.size} missing</p>}
  {damagedComps.size > 0 && <p style={{ fontSize: 10, color: T.re, marginTop: 3 }}>{damagedComps.size} damaged</p>}
  {form.status === 'unsorted' && missingComps.size === catComps.length && damagedComps.size === 0 && <p style={{ fontSize: 11, color: T.re, marginTop: 5, background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.15)', borderRadius: 6, padding: '6px 10px' }}>All missing — change status to "Damaged" or deselect some.</p>}
</div>}<div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Order ID</label><input value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })} placeholder="Optional" style={S.fInput} /></div><div><label style={S.fLabel}>Ticket ID</label><input value={form.ticket_id} onChange={(e) => setForm({ ...form, ticket_id: e.target.value })} placeholder="Optional" style={S.fInput} /></div></div><div style={{ marginBottom: 12 }}><label style={S.fLabel}>Link</label><input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Optional URL" style={S.fInput} /></div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Tags <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>(comma separated)</span></label><input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="e.g. urgent, wedding" style={S.fInput} /></div><div><label style={S.fLabel}>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" style={S.fInput} /></div></div><div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>{selected ? 'Update' : 'Add'}</button></div></form></div></div>)}

      {showCompModal && selected && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 520 }}><div style={S.modalHead}><div><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{selected.products?.name}</span><div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontSize: 10, fontFamily: T.mono, color: T.gr }}>{selected.batch_number}</span>{selected.serial_number && <span style={{ fontSize: 10, fontFamily: T.mono, color: T.ac2 }}>{selected.serial_number}</span>}<span style={statusTag(selected.status)}>{selected.status}</span>{selected.batch_number && <span onClick={() => printBarcode(selected.batch_number)} style={{ ...S.btnGhost, ...S.btnSm }}>Print Barcode</span>}</div>{selected.order_id && <p style={{ margin: '3px 0 0', fontSize: 10, color: T.tx3 }}>Order: {selected.order_id}{selected.marketplace ? ` | ${selected.marketplace}` : ''}</p>}{selected.ticket_id && <p style={{ margin: '2px 0 0', fontSize: 10, color: T.tx3 }}>Ticket: {selected.ticket_id}</p>}{selected.link && <a href={selected.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.ac, marginTop: 2, display: 'block' }}>Open Link</a>}</div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span></div><div style={{ padding: 16 }}>
        <p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Components</p>
        {comps.map((c) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.status === 'missing' ? 'rgba(245,166,35,.2)' : T.bd}`, borderRadius: 6, marginBottom: 5 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: c.status === 'present' ? T.gr : c.status === 'damaged' ? T.re : T.yl }} /><span style={{ fontWeight: 500, fontSize: 11, color: T.tx }}>{c.components?.name}</span>{c.status === 'missing' && <span style={{ fontSize: 9, color: T.yl, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,166,35,.08)' }}>MISSING</span>}</div>{canEdit && <select value={c.status} onChange={(e) => updateComp(c.id, e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 85, padding: '4px 6px', cursor: 'pointer', fontSize: 10 }}><option value="missing">Missing</option><option value="present">Present</option><option value="damaged">Damaged</option></select>}</div>))}
        {comps.length === 0 && <p style={{ textAlign: 'center', color: T.tx3, fontSize: 11, padding: 14 }}>No components</p>}
        {itemLogs.length > 0 && <><div style={{ borderTop: `1px solid ${T.bd}`, marginTop: 12, paddingTop: 12 }}><p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Activity History</p>{itemLogs.map(log => <div key={log.id} style={{ padding: '6px 0', borderBottom: `1px solid ${T.bd}`, display: 'flex', gap: 8, fontSize: 10 }}><span style={{ color: T.tx3, whiteSpace: 'nowrap', fontFamily: T.mono, fontSize: 9 }}>{new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span><span style={{ color: T.tx2 }}>{log.description || log.action}</span></div>)}</div></>}
      </div></div></div>)}
      {matchResult && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 480 }}><div style={{ ...S.modalHead, background: 'rgba(45,212,160,.05)', borderBottom: `1px solid rgba(45,212,160,.15)` }}><span style={{ fontSize: 13, fontWeight: 600, color: T.gr }}>Pair Match Found!</span><span onClick={() => setMatchResult(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span></div><div style={{ padding: 16 }}>
        <div style={{ background: 'rgba(45,212,160,.06)', border: '1px solid rgba(45,212,160,.18)', borderRadius: T.r, padding: 12, marginBottom: 12, fontSize: 11, color: T.gr }}>
          A complete <strong>{matchResult.categoryName}</strong>{matchResult.size && <> in size <strong>{matchResult.size}</strong></>}{matchResult.sku && <> (SKU: <span style={{ fontFamily: T.mono }}>{matchResult.sku}</span>)</>} can be assembled!
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 14 }}>
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Current Item</p>
            <p style={{ fontSize: 12, fontFamily: T.mono, color: T.ac2, margin: '0 0 8px' }}>{matchResult.currentUniqueId}</p>
            <p style={{ fontSize: 11, color: T.tx3, margin: '0 0 6px' }}>Has these components:</p>
            {matchResult.currentPresent.map((n: string) => <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: T.gr }} /><span style={{ fontSize: 12, color: T.tx }}>{n}</span></div>)}
          </div>
          <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 14 }}>
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Matching Item</p>
            <p style={{ fontSize: 12, fontFamily: T.mono, color: T.ac2, margin: '0 0 4px' }}>{matchResult.otherUniqueId}</p>
            <p style={{ fontSize: 11, color: T.tx3, margin: '0 0 8px' }}>Added on {matchResult.otherDate}</p>
            <p style={{ fontSize: 11, color: T.tx3, margin: '0 0 6px' }}>Has these components:</p>
            {matchResult.otherPresent.map((n: string) => <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: T.gr }} /><span style={{ fontSize: 12, color: T.tx }}>{n}</span></div>)}
          </div>
        </div>
        <div style={{ background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.2)', borderRadius: T.r, padding: 12, fontSize: 12, color: T.ac2, textAlign: 'center' }}>
          Combine both items to complete the <strong>{matchResult.categoryName}</strong>
        </div>
        <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'flex-end' }}><div onClick={() => setMatchResult(null)} style={S.btnPrimary}>Got it</div></div>
      </div></div></div>)}

      {showCompleteModal && (() => {
        const itemA = items.find(i => i.id === showCompleteModal.itemId);
        if (!itemA) return null;
        const missingA = itemMissing[itemA.id] || [];
        const pairIds = completablePairs[itemA.id] || [];
        const pairItems = pairIds.map(pid => items.find(i => i.id === pid)).filter(Boolean);
        const selectedPair = showCompleteModal.pairId ? items.find(i => i.id === showCompleteModal.pairId) : null;

        return (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 540, maxWidth: '100%' }}>
          <div style={{ ...S.modalHead, background: 'rgba(16,185,129,.06)', borderBottom: '1px solid rgba(16,185,129,.2)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>Complete Product</span>
          </div>
          <div style={{ padding: 18 }}>
            {/* Current item */}
            <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600 }}>This Item</span>
                <span style={{ fontSize: 11, fontFamily: T.mono, color: T.gr }}>{itemA.batch_number}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.tx, margin: '0 0 4px' }}>{itemA.products?.name} {itemA.serial_number && <span style={{ fontFamily: T.mono, color: T.ac2, fontWeight: 400 }}>({itemA.serial_number})</span>}{itemA.size && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10, background: T.s3, color: T.tx2 }}>{itemA.size}</span>}</p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {missingA.map(name => <span key={name} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500, background: 'rgba(251,191,36,.12)', color: T.yl }}>{name} missing</span>)}
              </div>
            </div>

            {/* Pair selection */}
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Select item to combine with ({pairItems.length} available)</p>
            <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
              {pairItems.map((b: any) => {
                const missingB = itemMissing[b.id] || [];
                const isSelected = showCompleteModal.pairId === b.id;
                return <div key={b.id} onClick={() => setShowCompleteModal({ ...showCompleteModal, pairId: b.id })} style={{ background: isSelected ? 'rgba(16,185,129,.08)' : T.s2, border: `1px solid ${isSelected ? 'rgba(16,185,129,.4)' : T.bd}`, borderRadius: T.r, padding: 12, marginBottom: 6, cursor: 'pointer', transition: 'all .15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${isSelected ? '#10b981' : T.bd2}`, background: isSelected ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700, flexShrink: 0 }}>{isSelected && '✓'}</div>
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.gr }}>{b.batch_number}</span>
                      {b.serial_number && <span style={{ fontSize: 11, fontFamily: T.mono, color: T.ac2 }}>{b.serial_number}</span>}
                      {b.size && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: T.s3, color: T.tx2 }}>{b.size}</span>}
                    </div>
                    {b.location && <span style={{ fontSize: 10, color: T.tx3 }}>{b.location}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 26 }}>
                    {missingB.length > 0
                      ? missingB.map(name => <span key={name} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, background: 'rgba(251,191,36,.1)', color: T.yl }}>{name} missing</span>)
                      : <span style={{ fontSize: 10, color: T.gr }}>All components present</span>
                    }
                  </div>
                  {isSelected && <div style={{ marginLeft: 26, marginTop: 6, fontSize: 11, color: '#10b981' }}>Combined = <strong>Complete {itemA.products?.name}</strong></div>}
                </div>;
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setShowCompleteModal(null)} style={S.btnGhost}>Cancel</span>
              <span onClick={() => { if (showCompleteModal.pairId) handleComplete(showCompleteModal.itemId, showCompleteModal.pairId); else addToast('Select an item to combine with', 'error'); }} style={{ ...S.btnPrimary, background: selectedPair ? 'linear-gradient(135deg, #10b981, #34d399)' : T.bd2, boxShadow: selectedPair ? '0 2px 8px rgba(16,185,129,.25)' : 'none', opacity: selectedPair ? 1 : 0.5 }}>Mark as Completed</span>
            </div>
          </div>
        </div></div>);
      })()}

      {pendingDelete && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 10, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 30px rgba(0,0,0,.5)', zIndex: 300, animation: 'su .2s ease' }}>
        <span style={{ fontSize: 13, color: T.tx }}>Item deleted</span>
        <span onClick={undoDelete} style={{ ...S.btnPrimary, padding: '5px 14px', fontSize: 12, background: T.yl, color: '#000', boxShadow: 'none' }}>Undo</span>
      </div>}

      {/* Smart Intel Modal */}
      {showIntel && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 580, maxWidth: '100%' }}>
        <div style={{ ...S.modalHead, background: 'rgba(251,191,36,.06)', borderBottom: '1px solid rgba(251,191,36,.2)' }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.yl }}>Smart Intel</span>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: T.tx3 }}>Cross-size completion possibilities (adjacent size alteration)</p>
          </div>
          <span onClick={() => setShowIntel(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span>
        </div>
        <div style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          {intelResults.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: T.tx3 }}>
            <p style={{ fontSize: 14, marginBottom: 6 }}>No cross-size matches found</p>
            <p style={{ fontSize: 11 }}>Intel looks for unsorted items with the same SKU but adjacent sizes (e.g. M ↔ L) that can complete each other</p>
          </div>}
          {intelResults.map((r, idx) => (
            <div key={idx} style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{r.category}</span>
                  {r.sku && <span style={{ marginLeft: 6, fontFamily: T.mono, fontSize: 11, color: T.ac2 }}>{r.sku}</span>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.yl, background: 'rgba(251,191,36,.1)', padding: '2px 8px', borderRadius: 4 }}>{r.sizeA} ↔ {r.sizeB}</span>
              </div>
              <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div style={{ background: T.s3, borderRadius: 6, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.gr }}>{r.itemA.batch_number}</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,.1)', color: T.yl }}>{r.sizeA}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {r.missingA.map((n: string) => <span key={n} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: isDupatta(n) ? 'rgba(96,165,250,.1)' : 'rgba(251,191,36,.1)', color: isDupatta(n) ? T.bl : T.yl }}>{isDupatta(n) ? `${n} (no size)` : `${n} missing`}</span>)}
                  </div>
                </div>
                <div style={{ background: T.s3, borderRadius: 6, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.gr }}>{r.itemB.batch_number}</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,.1)', color: T.yl }}>{r.sizeB}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {r.missingB.map((n: string) => <span key={n} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: isDupatta(n) ? 'rgba(96,165,250,.1)' : 'rgba(251,191,36,.1)', color: isDupatta(n) ? T.bl : T.yl }}>{isDupatta(n) ? `${n} (no size)` : `${n} missing`}</span>)}
                  </div>
                </div>
              </div>
              <div style={{ background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.15)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: T.yl, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.yl, strokeWidth: 2, flexShrink: 0 }}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                Can complete by altering size {r.sizeA} → {r.sizeB} or {r.sizeB} → {r.sizeA}
                {r.missingA.some((n: string) => isDupatta(n)) || r.missingB.some((n: string) => isDupatta(n)) ? ' (Dupatta is universal - no alteration needed)' : ''}
              </div>
            </div>
          ))}
          {intelResults.length > 0 && <p style={{ fontSize: 10, color: T.tx3, textAlign: 'center', marginTop: 8 }}>
            Size alteration: XS↔S, S↔M, M↔L, L↔XL, XL↔XXL | Semi-Stitched matches all | Dupatta has no size
          </p>}
        </div>
      </div></div>)}
      </>}
    </div>
  );
};

const Categories = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [comps, setComps] = useState<any[]>([]);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [form, setForm] = useState({ sku: '', name: '', description: '', category: '' });
  const [newComps, setNewComps] = useState<string[]>(['']);

  const fetchCategories = () => { supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }).then(({ data }) => setCategories(data || [])); };
  useEffect(() => {
    fetchCategories();
    const ch = supabase.channel('cat-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchCategories)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'components' }, fetchCategories)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  const fetchComps = async (id: string) => { const { data } = await supabase.from('components').select('*').eq('product_id', id).order('created_at', { ascending: true }); setComps(data || []); };

  const generateSku = (name: string) => {
    const base = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    const ts = Date.now().toString(36).slice(-4).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `${base}-${ts}${rand}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected) {
      if (selected.name !== form.name) {
        const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('product_id', selected.id);
        if ((count || 0) > 0 && !confirm(`${count} item(s) use this category. Renaming will affect all. Continue?`)) return;
      }
      const { error } = await supabase.from('products').update({ name: form.name, description: form.description, category: form.category }).eq('id', selected.id);
      if (error) { addToast(error.message, 'error'); return; }
      const validComps = newComps.filter(c => c.trim());
      if (validComps.length > 0) {
        const compsToInsert = validComps.map((name, i) => ({ product_id: selected.id, name: name.trim(), component_code: `C${(comps.length || 0) + i + 1}` }));
        await supabase.from('components').insert(compsToInsert);
      }
      addToast('Updated!', 'success');
    } else {
      const validComps = newComps.filter(c => c.trim());
      if (validComps.length === 0) { addToast('Add at least 1 component', 'error'); return; }
      const sku = generateSku(form.name);
      const { data, error } = await supabase.from('products').insert({ sku, name: form.name, description: form.description, category: form.category, created_by: profile?.id, total_components: validComps.length }).select().single();
      if (error || !data) { addToast(error?.message || 'Error', 'error'); return; }
      if (validComps.length > 0) {
        const compsToInsert = validComps.map((name, i) => ({ product_id: data.id, name: name.trim(), component_code: `C${i + 1}` }));
        await supabase.from('components').insert(compsToInsert);
      }
      addToast(`Category "${form.name}" added with ${validComps.length} components!`, 'success');
    }
    setShowModal(false); setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setNewComps(['']); fetchCategories();
  };

  const addCompRow = () => setNewComps([...newComps, '']);
  const removeCompRow = (i: number) => setNewComps(newComps.filter((_, idx) => idx !== i));
  const updateCompRow = (i: number, val: string) => { const c = [...newComps]; c[i] = val; setNewComps(c); };

  const checkCategoryInUse = async (productId: string) => {
    const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('product_id', productId);
    return (count || 0) > 0;
  };

  const addCompToExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    const validComps = newComps.filter(c => c.trim());
    if (validComps.length === 0) return;
    if (await checkCategoryInUse(selected.id)) { addToast('Cannot modify components — inventory items use this category. Delink items first.', 'error'); return; }
    const compsToInsert = validComps.map((name, i) => ({ product_id: selected.id, name: name.trim(), component_code: `C${(comps.length || 0) + i + 1}` }));
    const { error } = await supabase.from('components').insert(compsToInsert);
    if (error) { addToast(error.message, 'error'); return; }
    await supabase.from('products').update({ total_components: (comps.length || 0) + validComps.length }).eq('id', selected.id);
    addToast(`${validComps.length} component(s) added!`, 'success');
    setNewComps(['']); fetchComps(selected.id); fetchCategories();
  };

  const deleteComp = async (id: string) => {
    if (await checkCategoryInUse(selected.id)) { addToast('Cannot delete component — inventory items use this category. Delink items first.', 'error'); return; }
    const { count: compCount } = await supabase.from('components').select('id', { count: 'exact', head: true }).eq('product_id', selected.id);
    if ((compCount || 0) <= 1) { addToast('Cannot delete — category must have at least 1 component', 'error'); return; }
    const [{ count: itemCount }, { count: extraCount }] = await Promise.all([
      supabase.from('item_components').select('id', { count: 'exact', head: true }).eq('component_id', id),
      supabase.from('inventory_extras').select('id', { count: 'exact', head: true }).eq('component_id', id),
    ]);
    const refs = (itemCount || 0) + (extraCount || 0);
    if (refs > 0) { addToast(`Cannot delete — used by ${itemCount || 0} item(s) and ${extraCount || 0} extra(s)`, 'error'); return; }
    await supabase.from('components').delete().eq('id', id);
    await supabase.from('products').update({ total_components: Math.max(0, (comps.length || 1) - 1) }).eq('id', selected.id);
    addToast('Deleted!', 'success'); fetchComps(selected.id); fetchCategories();
  };

  const openEdit = async (p: any) => { setSelected(p); setForm({ sku: p.sku || '', name: p.name, description: p.description || '', category: p.category || '' }); setNewComps(['']); await fetchComps(p.id); setShowModal(true); };
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);

  const compInputRow = (val: string, i: number, total: number, offset = 0) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.s3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: T.tx3, fontFamily: T.mono, flexShrink: 0 }}>{offset + i + 1}</span>
      <input value={val} onChange={(e) => updateCompRow(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) addCompRow(); } }} placeholder="Component name" style={{ ...S.fInput, flex: 1 }} />
      {total > 1 && <span onClick={() => removeCompRow(i)} style={{ cursor: 'pointer', color: T.re, fontSize: 16, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>✕</span>}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><span style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Categories</span>{canEdit && <div onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setNewComps(['']); setShowModal(true); }} style={S.btnPrimary}>+ Add</div>}</div>
      <div className="cat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>{categories.map((p) => (<div key={p.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '14px 16px', transition: 'border-color .15s, box-shadow .15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = T.bd2; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.2)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.boxShadow = 'none'; }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div><h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.tx }}>{p.name}</h3><span style={{ fontSize: 10, fontFamily: T.mono, color: T.ac2 }}>{p.sku}</span></div>
          {canEdit && <span onClick={() => openEdit(p)} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</span>}
        </div>
        {p.description && <p style={{ color: T.tx3, fontSize: 11, margin: '0 0 10px' }}>{p.description}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0', borderTop: `1px solid ${T.bd}` }}>
          <span style={{ fontSize: 10, color: T.tx3 }}>{p.total_components} component{p.total_components !== 1 ? 's' : ''}</span>
        </div>
      </div>))}</div>
      {categories.length === 0 && <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 36, textAlign: 'center' }}><p style={{ color: T.tx3, fontSize: 12, marginBottom: 6 }}>No categories yet</p><p style={{ color: T.tx3, fontSize: 10 }}>Add a category like "Lehenga Choli" with components like Lehenga, Blouse, Dupatta</p>{canEdit && <div onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setNewComps(['']); setShowModal(true); }} style={{ ...S.btnPrimary, marginTop: 12, display: 'inline-flex' }}>+ Add First Category</div>}</div>}

      {showModal && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 480 }}><div style={S.modalHead}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Category</span></div><form onSubmit={handleSubmit} style={{ padding: 16 }}>
        <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Category name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Lehenga Choli" style={S.fInput} /></div>
        <div style={{ marginBottom: 12 }}><label style={S.fLabel}>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description (optional)" style={S.fInput} /></div>
        <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><label style={{ ...S.fLabel, margin: 0 }}>Components</label><span onClick={addCompRow} style={{ ...S.btnPrimary, ...S.btnSm }}>+ Add More</span></div>
        {selected && comps.length > 0 && <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 8, marginBottom: 8 }}>
          {comps.map((c: any, i: number) => (<div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, marginBottom: 3, background: 'transparent', border: `1px solid ${T.bd}` }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.s3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: T.tx3, fontFamily: T.mono, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>{c.name}</span>
            {canEdit && <span onClick={() => deleteComp(c.id)} style={{ ...S.btnDanger, padding: '2px 8px', fontSize: 9 }}>Delete</span>}
          </div>))}
        </div>}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 10, marginBottom: 12 }}>
          {newComps.map((c, i) => compInputRow(c, i, newComps.length, selected ? comps.length : 0))}
        </div>
        <div style={{ padding: '12px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 7 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>{selected ? 'Update' : 'Add Category'}</button></div>
      </form></div></div>)}

      {showCompModal && selected && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 500 }}><div style={S.modalHead}><div><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Components of "{selected.name}"</span><p style={{ margin: '3px 0 0', fontSize: 10, color: T.tx3 }}>Manage the individual parts of this category</p></div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span></div><div style={{ padding: 16 }}>
        {canEdit && <form onSubmit={addCompToExisting} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, padding: 12, borderRadius: T.r, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, margin: 0 }}>Add Components</p><span onClick={addCompRow} style={{ fontSize: 10, color: T.ac, cursor: 'pointer' }}>+ Add More</span></div>
          {newComps.map((c, i) => compInputRow(c, i, newComps.length))}
          <button type="submit" style={{ ...S.btnPrimary, marginTop: 4 }}>+ Add Component{newComps.filter(c => c.trim()).length > 1 ? 's' : ''}</button>
        </form>}
        {comps.length > 0 && <p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>{comps.length} Component{comps.length !== 1 ? 's' : ''}</p>}
        {comps.map((c, i) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: `1px solid ${T.bd}`, borderRadius: 6, marginBottom: 5, background: 'rgba(255,255,255,0.02)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: T.s3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: T.tx3, fontFamily: T.mono }}>{i + 1}</span><span style={{ fontSize: 12, color: T.tx, fontWeight: 500 }}>{c.name}</span></div>{canEdit && <span onClick={() => deleteComp(c.id)} style={S.btnDanger}>Delete</span>}</div>))}
        {comps.length === 0 && <div style={{ textAlign: 'center', padding: 16, color: T.tx3 }}><p style={{ fontSize: 11 }}>No components yet</p></div>}
      </div></div></div>)}
    </div>
  );
};


const Locations = () => {
  const [locations, setLocations] = useState<any[]>([]);
  const [newLoc, setNewLoc] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);

  const fetchLocations = () => { supabase.from('locations').select('*').order('name').then(({ data }) => setLocations(data || [])); };
  useEffect(() => {
    fetchLocations();
    const ch = supabase.channel('loc-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, fetchLocations).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const addLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoc.trim()) return;
    const { error } = await supabase.from('locations').insert({ name: newLoc.trim() });
    if (error) addToast(error.message, 'error');
    else { addToast('Location added!', 'success'); setNewLoc(''); fetchLocations(); }
  };

  const updateLocation = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from('locations').update({ name: editName.trim() }).eq('id', id);
    if (error) addToast(error.message, 'error');
    else { addToast('Updated!', 'success'); setEditId(null); fetchLocations(); }
  };

  const deleteLocation = async (id: string) => {
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) addToast(error.message, 'error');
    else { addToast('Deleted!', 'success'); fetchLocations(); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Locations</span>
      </div>
      {canEdit && <form onSubmit={addLocation} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="Add new location..." style={{ ...S.fInput, flex: 1 }} />
        <button type="submit" style={S.btnPrimary}>+ Add</button>
      </form>}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r }}>
        {locations.map((loc, i) => (
          <div key={loc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: i < locations.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
            {editId === loc.id ? (
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') updateLocation(loc.id); if (e.key === 'Escape') setEditId(null); }} style={{ ...S.fInput, flex: 1 }} autoFocus />
                <span onClick={() => updateLocation(loc.id)} style={S.btnPrimary}>Save</span>
                <span onClick={() => setEditId(null)} style={S.btnGhost}>Cancel</span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>📍</span>
                  <span style={{ fontSize: 12, color: T.tx, fontWeight: 500 }}>{loc.name}</span>
                </div>
                {canEdit && <div style={{ display: 'flex', gap: 4 }}>
                  <span onClick={() => { setEditId(loc.id); setEditName(loc.name); }} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</span>
                  <span onClick={() => deleteLocation(loc.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</span>
                </div>}
              </>
            )}
          </div>
        ))}
        {locations.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No locations yet. Add your first location above.</div>}
      </div>
    </div>
  );
};

const Reports = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [form, setForm] = useState({ inventory_item_id: '', damage_type: '', cause: '', estimated_loss: '' });

  const fetchData = () => {
    supabase.from('damage_reports').select('*, inventory_items(*, products(name, sku)), profiles:reported_by(full_name)').order('created_at', { ascending: false }).then(({ data }) => setReports(data || []));
    supabase.from('inventory_items').select('*, products(name, sku)').in('status', ['damaged', 'unsorted']).then(({ data }) => setItems(data || []));
  };
  useEffect(() => {
    fetchData();
    const ch = supabase.channel('rep-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'damage_reports' }, fetchData).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); const { error } = await supabase.from('damage_reports').insert({ ...form, estimated_loss: form.estimated_loss ? parseFloat(form.estimated_loss) : null, reported_by: profile?.id }); if (error) addToast(error.message, 'error'); else { addToast('Created!', 'success'); setShowModal(false); setForm({ inventory_item_id: '', damage_type: '', cause: '', estimated_loss: '' }); fetchData(); } };

  const updateStatus = async (id: string, status: string) => { await supabase.from('damage_reports').update({ status }).eq('id', id); addToast('Updated!', 'success'); fetchData(); };

  const canEdit = profile && ['admin', 'manager', 'operator'].includes(profile.role);

  const reportStatusTag = (status: string) => {
    const m: Record<string, { bg: string; color: string; bd: string }> = {
      open: { bg: 'rgba(239,68,68,0.10)', color: '#FCA5A5', bd: 'rgba(239,68,68,0.25)' },
      investigating: { bg: 'rgba(245,158,11,0.10)', color: '#FCD34D', bd: 'rgba(245,158,11,0.25)' },
      resolved: { bg: 'rgba(34,197,94,0.10)', color: '#4ADE80', bd: 'rgba(34,197,94,0.25)' },
      closed: { bg: T.glass2, color: T.tx3, bd: T.bd },
    };
    const s = m[status] || m.open;
    return { display: 'inline-block' as const, padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.bd}`, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
  };

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Damage Reports</span>{canEdit && <div onClick={() => setShowModal(true)} style={S.btnPrimary}>+ New Report</div>}</div>
      {reports.map((r) => (<div key={r.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '12px 14px', marginBottom: 8, transition: 'border-color .15s' }} onMouseEnter={e => e.currentTarget.style.borderColor = T.bd2} onMouseLeave={e => e.currentTarget.style.borderColor = T.bd}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><div><span style={{ fontFamily: T.mono, color: T.ac, fontSize: 10, fontWeight: 500 }}>{r.report_number}</span><span style={{ marginLeft: 6, ...reportStatusTag(r.status) }}>{r.status}</span><h3 style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: T.tx }}>{r.inventory_items?.products?.name}</h3></div>{canEdit && <select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 100, padding: '4px 8px', cursor: 'pointer', height: 'fit-content', fontSize: 10 }}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select>}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}><div><p style={{ margin: 0, color: T.tx3, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600 }}>Type</p><p style={{ margin: '3px 0 0', fontSize: 11, color: T.tx }}>{r.damage_type}</p></div><div><p style={{ margin: 0, color: T.tx3, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600 }}>Cause</p><p style={{ margin: '3px 0 0', fontSize: 11, color: T.tx }}>{r.cause || '-'}</p></div><div><p style={{ margin: 0, color: T.tx3, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600 }}>Est. Loss</p><p style={{ margin: '3px 0 0', fontSize: 11, fontFamily: T.mono, color: r.estimated_loss ? T.re : T.tx3 }}>{r.estimated_loss ? `₹${r.estimated_loss.toLocaleString()}` : '-'}</p></div></div></div>))}
      {reports.length === 0 && <div style={{ textAlign: 'center', padding: 36, color: T.tx3, fontSize: 11 }}>No reports</div>}

      {showModal && (<div style={S.modalOverlay}><div className="modal-inner" style={S.modalBox}><div style={S.modalHead}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>New Report</span><span onClick={() => setShowModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span></div><form onSubmit={handleSubmit} style={{ padding: 16 }}><div style={{ marginBottom: 10 }}><label style={S.fLabel}>Item *</label><select value={form.inventory_item_id} onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })} required style={S.fInput}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.products?.name}</option>)}</select></div><div style={{ marginBottom: 10 }}><label style={S.fLabel}>Damage Type *</label><input value={form.damage_type} onChange={(e) => setForm({ ...form, damage_type: e.target.value })} required placeholder="e.g. Tear, Stain, Broken" style={S.fInput} /></div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}><div><label style={S.fLabel}>Cause</label><input value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} placeholder="Optional" style={S.fInput} /></div><div><label style={S.fLabel}>Est. Loss (₹)</label><input type="number" value={form.estimated_loss} onChange={(e) => setForm({ ...form, estimated_loss: e.target.value })} placeholder="0" style={S.fInput} /></div></div><div style={{ padding: '12px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 7 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>Submit</button></div></form></div></div>)}
    </div>
  );
};

const Users = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', password: '', role: 'viewer' });
  const [inviteResult, setInviteResult] = useState<{ email: string; password: string } | null>(null);
  const [pinExists, setPinExists] = useState(false);
  const [pinLength, setPinLength] = useState(0);
  const [editingPin, setEditingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [myPhone, setMyPhone] = useState('');
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const { profile } = useAuth();
  const { addToast } = useNotifications();

  const loadPin = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from('profiles').select('cash_pin, phone').eq('id', profile.id).maybeSingle();
    const pin = data?.cash_pin || '';
    setPinExists(!!pin);
    setPinLength(pin.length);
    setMyPhone(data?.phone || '');
  }, [profile?.id]);

  useEffect(() => { loadPin(); }, [loadPin]);

  const savePhone = async () => {
    const cleaned = phoneInput.replace(/\D/g, '');
    if (cleaned.length !== 10) { addToast('Phone must be 10 digits', 'error'); return; }
    setPhoneSaving(true);
    const { error } = await supabase.from('profiles').update({ phone: cleaned }).eq('id', profile.id);
    setPhoneSaving(false);
    if (error) { addToast('Save failed: ' + error.message, 'error'); return; }
    setMyPhone(cleaned);
    setPhoneEditing(false);
    addToast('Phone saved', 'success');
  };

  const saveMyPin = async () => {
    setPinError('');
    if (newPin.length < 4 || newPin.length > 6) { setPinError('PIN must be 4-6 digits'); return; }
    if (!/^\d+$/.test(newPin)) { setPinError('PIN must be digits only'); return; }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return; }
    setPinSaving(true);
    const { error } = await supabase.from('profiles').update({ cash_pin: newPin }).eq('id', profile.id);
    setPinSaving(false);
    if (error) { setPinError('Save failed: ' + error.message); return; }
    setNewPin(''); setConfirmPin(''); setEditingPin(false);
    await loadPin();
    addToast('Cash PIN saved successfully', 'success');
  };

  const removePin = async () => {
    if (!confirm('Remove your Cash PIN? You will not be able to confirm cash handovers without it.')) return;
    await supabase.from('profiles').update({ cash_pin: null }).eq('id', profile.id);
    await loadPin();
    addToast('Cash PIN removed', 'success');
  };

  const fetchUsers = () => { supabase.from('profiles').select('*').order('created_at', { ascending: false }).then(({ data }) => setUsers(data || [])); };
  useEffect(() => {
    fetchUsers();
    const ch = supabase.channel('usr-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchUsers).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const updateRole = async (id: string, role: string) => { const { error } = await supabase.from('profiles').update({ role }).eq('id', id); if (error) addToast('Failed: ' + error.message, 'error'); else { addToast('Role updated!', 'success'); fetchUsers(); } };
  const toggleActive = async (id: string, isActive: boolean) => { await supabase.from('profiles').update({ is_active: !isActive }).eq('id', id); addToast(isActive ? 'Access revoked' : 'Access granted', 'success'); fetchUsers(); };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    const password = inviteForm.password || generatePassword();
    const { data, error } = await supabase.auth.signUp({
      email: inviteForm.email,
      password,
      options: { data: { full_name: inviteForm.full_name } }
    });
    if (error) {
      addToast(error.message, 'error');
      setInviting(false);
      return;
    }
    // Auto-confirm email + update role
    if (data.user) {
      await supabase.rpc('confirm_user_email', { target_user_id: data.user.id });
      if (inviteForm.role !== 'viewer') {
        await supabase.from('profiles').update({ role: inviteForm.role }).eq('id', data.user.id);
      }
    }
    setInviteResult({ email: inviteForm.email, password });
    addToast(`User ${inviteForm.full_name} invited!`, 'success');
    setInviting(false);
    fetchUsers();
  };

  const closeInvite = () => {
    setShowInvite(false);
    setInviteResult(null);
    setInviteForm({ email: '', full_name: '', password: '', role: 'viewer' });
  };

  return (
    <div>
      {/* My Phone — required for WhatsApp notifications */}
      <div style={{ background: 'rgba(34,197,94,.05)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.gr, fontFamily: T.sora }}>My Phone Number</div>
          {!phoneEditing && (myPhone.length === 10 ? (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,.12)', color: T.gr, fontWeight: 700, textTransform: 'uppercase' }}>✓ Saved</span>
          ) : (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase' }}>Required</span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10 }}>Required to receive WhatsApp notifications for cash handovers and payment alerts.</div>

        {!phoneEditing ? (
          // Read-only display + Edit button
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {myPhone.length === 10 ? (
              <span style={{ fontFamily: T.mono, fontSize: 16, color: T.tx, fontWeight: 600, letterSpacing: 1 }}>+91 {myPhone.slice(0, 5)} {myPhone.slice(5)}</span>
            ) : (
              <span style={{ fontSize: 11, color: T.tx3, fontStyle: 'italic' }}>No phone number saved</span>
            )}
            <button onClick={() => { setPhoneInput(myPhone); setPhoneEditing(true); }} style={S.btnPrimary}>{myPhone.length === 10 ? 'Edit' : 'Add Phone'}</button>
          </div>
        ) : (
          // Edit mode: input + Save + Cancel
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="tel" inputMode="numeric" value={phoneInput} onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9876543210" autoFocus style={{ ...S.fInput, fontFamily: T.mono, flex: 1, maxWidth: 220, fontSize: 13 }} />
            <button onClick={savePhone} disabled={phoneSaving} style={{ ...S.btnPrimary, opacity: phoneSaving ? 0.6 : 1 }}>{phoneSaving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => { setPhoneEditing(false); setPhoneInput(''); }} style={S.btnGhost}>Cancel</button>
          </div>
        )}
      </div>

      {/* My Cash PIN — for confirming cash handovers */}
      <div style={{ background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.yl, fontFamily: T.sora }}>My Cash PIN</div>
          {!editingPin && (pinExists ? (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,.12)', color: T.gr, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>✓ Saved</span>
          ) : (
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Not Set</span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginBottom: 10 }}>Required to sign cash handovers received from accountant. 4-6 digits.</div>

        {!editingPin ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {pinExists ? (
              <span style={{ fontFamily: T.mono, fontSize: 16, color: T.tx, fontWeight: 600, letterSpacing: 6 }}>{'•'.repeat(pinLength)}</span>
            ) : (
              <span style={{ fontSize: 11, color: T.tx3, fontStyle: 'italic' }}>No PIN configured</span>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setEditingPin(true); setNewPin(''); setConfirmPin(''); setPinError(''); }} style={S.btnPrimary}>{pinExists ? 'Edit' : 'Set PIN'}</button>
              {pinExists && <button onClick={removePin} style={S.btnDanger}>Remove</button>}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ ...S.fLabel, marginBottom: 3 }}>{pinExists ? 'New PIN' : 'PIN'}</label>
                <input type="password" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" inputMode="numeric" autoFocus style={{ ...S.fInput, fontFamily: T.mono, letterSpacing: 4, textAlign: 'center', fontSize: 14 }} />
              </div>
              <div>
                <label style={{ ...S.fLabel, marginBottom: 3 }}>Confirm PIN</label>
                <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" inputMode="numeric" style={{ ...S.fInput, fontFamily: T.mono, letterSpacing: 4, textAlign: 'center', fontSize: 14 }} />
              </div>
            </div>
            {pinError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '5px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{pinError}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={saveMyPin} disabled={pinSaving} style={{ ...S.btnPrimary, opacity: pinSaving ? 0.6 : 1 }}>{pinSaving ? 'Saving...' : 'Save PIN'}</button>
              <button onClick={() => { setEditingPin(false); setNewPin(''); setConfirmPin(''); setPinError(''); }} style={S.btnGhost}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Users</span>
        <div onClick={() => setShowInvite(true)} style={S.btnPrimary}>+ Invite User</div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['User', 'Role', 'Status', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} style={{ transition: 'background .1s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.015)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <td style={S.tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(u.full_name || u.email || '?')[0].toUpperCase()}</div>
                  <div><p style={{ margin: 0, fontWeight: 600, fontSize: 11, color: T.tx }}>{u.full_name || 'Unnamed'}</p><p style={{ margin: '1px 0 0', fontSize: 10, color: T.tx3 }}>{u.email}</p></div>
                </div>
              </td>
              <td style={S.tdStyle}><select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} disabled={u.id === profile?.id} style={{ ...S.fInput, width: 'auto', minWidth: 90, padding: '4px 8px', cursor: u.id === profile?.id ? 'not-allowed' : 'pointer', opacity: u.id === profile?.id ? 0.5 : 1, fontSize: 10 }}><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></td>
              <td style={S.tdStyle}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, ...(u.is_active ? { background: 'rgba(45,212,160,.10)', color: T.gr } : { background: 'rgba(245,87,92,.10)', color: T.re }) }}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
              <td style={S.tdStyle}>{u.id !== profile?.id && <span onClick={() => toggleActive(u.id, u.is_active)} style={{ padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: T.sans, display: 'inline-block', ...(u.is_active ? { background: 'rgba(245,87,92,.08)', color: T.re, border: '1px solid rgba(245,87,92,.18)' } : { background: 'rgba(45,212,160,.08)', color: T.gr, border: '1px solid rgba(45,212,160,.18)' }) }}>{u.is_active ? 'Revoke' : 'Grant'}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {showInvite && (<div style={S.modalOverlay}><div className="modal-inner" style={S.modalBox}>
        <div style={S.modalHead}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Invite New User</span></div>
        {inviteResult ? (
          <div style={{ padding: 16 }}>
            <div style={{ background: 'rgba(45,212,160,.06)', border: '1px solid rgba(45,212,160,.18)', borderRadius: T.r, padding: 12, marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: T.gr, margin: '0 0 4px' }}>User invited successfully!</p>
              <p style={{ fontSize: 10, color: T.tx2, margin: 0 }}>Share these credentials with the user:</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 12 }}>
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 }}>Email</p>
                <p style={{ fontSize: 12, fontFamily: T.mono, color: T.tx, margin: 0, userSelect: 'all' as const }}>{inviteResult.email}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 }}>Password</p>
                <p style={{ fontSize: 12, fontFamily: T.mono, color: T.ac, margin: 0, userSelect: 'all' as const }}>{inviteResult.password}</p>
              </div>
            </div>
            <p style={{ fontSize: 10, color: T.tx3, marginTop: 10, textAlign: 'center' }}>The user should change their password after first login</p>
            <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'flex-end' }}>
              <div onClick={closeInvite} style={S.btnPrimary}>Done</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} style={{ padding: 16 }}>
            <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Full Name *</label><input value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} required placeholder="e.g. Mahesh Dhameliya" style={S.fInput} /></div>
            <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Email *</label><input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required placeholder="user@aryadesigns.co.in" style={S.fInput} /></div>
            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div><label style={S.fLabel}>Password</label><input value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} placeholder="Auto-generate if empty" style={S.fInput} /></div>
              <div><label style={S.fLabel}>Role</label><select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} style={S.fInput}><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="manager">Manager</option><option value="admin">Admin</option></select></div>
            </div>
            <div style={{ background: 'rgba(99,102,241,.05)', border: `1px solid rgba(99,102,241,.15)`, borderRadius: T.r, padding: '8px 12px', fontSize: 10, color: T.ac2, marginBottom: 12 }}>The user will be created with the credentials above. Share the email and password with them so they can sign in.</div>
            <div style={{ padding: '12px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
              <span onClick={closeInvite} style={S.btnGhost}>Cancel</span>
              <button type="submit" disabled={inviting} style={S.btnPrimary}>{inviting ? 'Creating...' : 'Create & Invite'}</button>
            </div>
          </form>
        )}
      </div></div>)}
    </div>
  );
};

const SettingsPage = () => {
  const [tab, setTab] = useState('categories');
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const tabs = [{ id: 'categories', label: 'Categories' }, { id: 'locations', label: 'Locations' }];
  if (isAdmin) tabs.push({ id: 'users', label: 'Users' });
  tabs.push({ id: 'brands', label: 'Brands' });
  tabs.push({ id: 'packtime', label: 'PackStation' });
  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, width: 'fit-content', border: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
        {tabs.map(t => <div key={t.id} onClick={() => setTab(t.id)} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 10, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', background: tab === t.id ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'transparent', color: tab === t.id ? '#fff' : T.tx3, transition: 'all .15s' }}>{t.label}</div>)}
      </div>
      {tab === 'categories' && <Categories />}
      {tab === 'locations' && <Locations />}
      {tab === 'users' && <Users />}
      {tab === 'brands' && <BrandsSettings />}
      {tab === 'packtime' && <PackTimeSettings />}
    </div>
  );
};

const BrandsSettings = () => {
  const [brands, setBrands] = useState<any[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const { addToast } = useNotifications();
  const fetchBrands = () => { supabase.from('brands').select('*').order('name').then(({ data }) => setBrands(data || [])); };
  useEffect(() => { fetchBrands(); }, []);
  const addBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand.trim()) return;
    const { error } = await supabase.from('brands').insert({ name: newBrand.trim().toUpperCase() });
    if (error) addToast(error.message, 'error');
    else { addToast('Brand added!', 'success'); setNewBrand(''); fetchBrands(); }
  };
  const toggleBrand = async (id: string, active: boolean) => { await supabase.from('brands').update({ is_active: !active }).eq('id', id); fetchBrands(); };
  const deleteBrand = async (id: string) => { await supabase.from('brands').delete().eq('id', id); addToast('Brand removed', 'success'); fetchBrands(); };
  return (
    <div>
      <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: T.tx }}>Brands</h3>
      <form onSubmit={addBrand} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input value={newBrand} onChange={e => setNewBrand(e.target.value)} placeholder="Brand name (e.g. TANUKA)" style={{ ...S.fInput, flex: 1 }} />
        <button type="submit" style={S.btnPrimary}>+ Add</button>
      </form>
      {brands.map(b => (
        <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.bd}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: b.is_active ? T.gr : T.tx3 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{b.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span onClick={() => toggleBrand(b.id, b.is_active)} style={{ ...S.btnGhost, ...S.btnSm, cursor: 'pointer' }}>{b.is_active ? 'Disable' : 'Enable'}</span>
            <span onClick={() => deleteBrand(b.id)} style={{ ...S.btnDanger, cursor: 'pointer' }}>Delete</span>
          </div>
        </div>
      ))}
      {brands.length === 0 && <div style={{ fontSize: 11, color: T.tx3, padding: 10 }}>No brands. Add one above.</div>}
    </div>
  );
};

const PackTimeSettings = () => {
  const [couriers, setCouriers] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [newCourier, setNewCourier] = useState('');
  const [newSheet, setNewSheet] = useState('');
  const [newCamera, setNewCamera] = useState('');
  const { addToast } = useNotifications();

  const fetchData = () => {
    supabase.from('packtime_couriers').select('*').order('name').then(({ data }) => setCouriers(data || []));
    supabase.from('packtime_cameras').select('*').order('number').then(({ data }) => setCameras(data || []));
  };
  useEffect(() => { fetchData(); }, []);

  const addCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourier.trim() || !newSheet.trim()) return;
    const { error } = await supabase.from('packtime_couriers').insert({ name: newCourier.trim(), sheet_name: newSheet.trim() });
    if (error) addToast(error.message, 'error');
    else { addToast('Courier added!', 'success'); setNewCourier(''); setNewSheet(''); fetchData(); }
  };

  const toggleCourier = async (id: string, active: boolean) => {
    await supabase.from('packtime_couriers').update({ is_active: !active }).eq('id', id);
    fetchData();
  };

  const deleteCourier = async (id: string) => {
    await supabase.from('packtime_couriers').delete().eq('id', id);
    addToast('Courier removed', 'success'); fetchData();
  };

  const addCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCamera.trim()) return;
    const { error } = await supabase.from('packtime_cameras').insert({ number: newCamera.trim() });
    if (error) addToast(error.message, 'error');
    else { addToast('Camera added!', 'success'); setNewCamera(''); fetchData(); }
  };

  const deleteCamera = async (id: string) => {
    await supabase.from('packtime_cameras').delete().eq('id', id);
    addToast('Camera removed', 'success'); fetchData();
  };

  return (
    <div>
      {/* Couriers */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Courier Companies</div>
        <form onSubmit={addCourier} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input value={newCourier} onChange={e => setNewCourier(e.target.value)} placeholder="Courier name..." style={{ ...S.fInput, flex: 1 }} />
          <input value={newSheet} onChange={e => setNewSheet(e.target.value)} placeholder="Sheet tab name (e.g. Sheet7)" style={{ ...S.fInput, flex: 1 }} />
          <button type="submit" style={S.btnPrimary}>+ Add</button>
        </form>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r }}>
          {couriers.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: i < couriers.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.is_active ? T.gr : T.tx3, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: T.tx, fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 9, fontFamily: T.mono, color: T.tx3, background: 'rgba(255,255,255,0.03)', padding: '1px 6px', borderRadius: 3 }}>{c.sheet_name}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <span onClick={() => toggleCourier(c.id, c.is_active)} style={{ ...S.btnGhost, ...S.btnSm, color: c.is_active ? T.yl : T.gr }}>{c.is_active ? 'Disable' : 'Enable'}</span>
                <span onClick={() => deleteCourier(c.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</span>
              </div>
            </div>
          ))}
          {couriers.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No couriers configured</div>}
        </div>
      </div>

      {/* Cameras */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Cameras</div>
        <form onSubmit={addCamera} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input value={newCamera} onChange={e => setNewCamera(e.target.value)} placeholder="Camera number (e.g. 5)" style={{ ...S.fInput, flex: 1 }} />
          <button type="submit" style={S.btnPrimary}>+ Add</button>
        </form>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.r }}>
          {cameras.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: i < cameras.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontFamily: T.mono, fontWeight: 600, color: T.tx }}>{c.number}</span>
                {!c.is_active && <span style={{ fontSize: 8, color: T.tx3, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.03)' }}>disabled</span>}
              </div>
              <span onClick={() => deleteCamera(c.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</span>
            </div>
          ))}
          {cameras.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No cameras configured</div>}
        </div>
      </div>
    </div>
  );
};

const VALID_TABS = ['dashboard', 'inventory', 'reports', 'brandtag', 'packtime', 'challan', 'settings'];
const getTabFromHash = () => {
  const h = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return VALID_TABS.includes(h) ? h : 'dashboard';
};

const MainApp = () => {
  const [tab, setTabState] = useState(getTabFromHash);
  const [globalSearch, setGlobalSearch] = useState('');
  const [notifItemId, setNotifItemId] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mounted, setMounted] = useState<Set<string>>(new Set([getTabFromHash()]));

  // Central navigate — updates URL + state
  const setTab = (t: string) => {
    if (!VALID_TABS.includes(t)) t = 'dashboard';
    const newHash = `#/${t}`;
    if (window.location.hash !== newHash) window.history.pushState(null, '', newHash);
    setTabState(t);
  };

  // Browser back/forward support
  useEffect(() => {
    const onPop = () => setTabState(getTabFromHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Ensure initial hash exists so back button has something to pop
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', `#/${tab}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy mount: only mount a page once its tab is selected
  useEffect(() => { setMounted(prev => { if (prev.has(tab)) return prev; const next = new Set(prev); next.add(tab); return next; }); }, [tab]);
  const titles: Record<string, string> = { dashboard: 'Dashboard', inventory: 'Inventory', reports: 'Reports', brandtag: 'Brand Tags', packtime: 'PackStation', challan: 'Cash Challan', settings: 'Settings' };
  const handleGlobalSearch = (q: string) => { setGlobalSearch(q); if (q && tab !== 'inventory') setTab('inventory'); };
  const handleNotifClick = (n: any) => {
    if (n.entity_id) { setTab('inventory'); setNotifItemId(n.entity_id); }
  };
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const handleScan = async (code: string): Promise<boolean> => {
    setScanError('');
    const { data } = await supabase.from('inventory_items').select('id').eq('batch_number', code).maybeSingle();
    if (data) { setScannerOpen(false); setTab('inventory'); setNotifItemId(data.id); return true; }
    setScanError(`No item found for: ${code}`);
    return false;
  };
  return (<div style={{ minHeight: '100vh', background: T.bg, width: '100%', overflow: 'hidden', position: 'relative' }}>
    {/* Ambient background glows */}
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 0 }}>
      <div style={{ position: 'absolute', top: -100, right: -50, width: 400, height: 400, background: `radial-gradient(circle, ${T.ac}08 0%, transparent 70%)` }} />
      <div style={{ position: 'absolute', bottom: -100, left: -50, width: 350, height: 350, background: `radial-gradient(circle, ${T.bl}06 0%, transparent 70%)` }} />
    </div>
    <Sidebar activeTab={tab} setActiveTab={(t) => { setTab(t); setGlobalSearch(''); setNotifItemId(null); setMobileMenu(false); }} />
    {/* Mobile overlay */}
    <div className="mobile-overlay" onClick={() => setMobileMenu(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 98, opacity: mobileMenu ? 1 : 0, pointerEvents: mobileMenu ? 'auto' : 'none', transition: 'opacity .25s ease', backdropFilter: 'blur(2px)' }} />
    {/* Mobile sidebar drawer */}
    <div className="mobile-drawer" style={{ display: 'none', position: 'fixed', top: 0, left: 0, width: 260, height: '100vh', zIndex: 101, transform: mobileMenu ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .3s cubic-bezier(.4,0,.2,1)', boxShadow: mobileMenu ? '4px 0 24px rgba(0,0,0,.4)' : 'none' }}>
      <Sidebar activeTab={tab} setActiveTab={(t) => { setTab(t); setGlobalSearch(''); setNotifItemId(null); setMobileMenu(false); }} />
    </div>
    <div className="main-area" style={{ marginLeft: 220, display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: '100vw' }}>
      {/* Mobile bottom nav */}
      <div className="mobile-hamburger" style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 102, background: T.s, borderTop: `1px solid ${T.bd}`, padding: '8px 0', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', justifyContent: 'space-around' }}>
        {[{ id: 'dashboard', icon: 'grid', label: 'Home' }, { id: 'inventory', icon: 'box', label: 'Inventory' }, { id: 'packtime', icon: 'scan', label: 'PackStation' }, { id: 'challan', icon: 'file', label: 'Challan' }].map(t => (
          <div key={t.id} onClick={() => { setTab(t.id); setMobileMenu(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '2px 16px', color: tab === t.id ? T.ac : T.tx3, fontSize: 9, fontWeight: 500 }}>
            <Icon name={t.icon} size={20} /><span>{t.label}</span>
          </div>
        ))}
      </div>
      <Header title={titles[tab]} onSearch={handleGlobalSearch} onNotifClick={handleNotifClick} onOpenScanner={() => { setScanError(''); setScannerOpen(true); }} />
      <main style={{ flex: 1, overflow: 'auto' }}>
        {mounted.has('dashboard') && <div style={{ display: tab === 'dashboard' ? 'block' : 'none' }}><Dashboard /></div>}
        {mounted.has('inventory') && <div style={{ display: tab === 'inventory' ? 'block' : 'none' }}><Inventory globalSearch={globalSearch} openItemId={notifItemId} onItemOpened={() => setNotifItemId(null)} active={tab === 'inventory'} /></div>}
        {mounted.has('reports') && <div style={{ display: tab === 'reports' ? 'block' : 'none' }}><Reports /></div>}
        {mounted.has('brandtag') && <div style={{ display: tab === 'brandtag' ? 'block' : 'none' }}><BrandTagPrinter /></div>}
        {mounted.has('packtime') && <div style={{ display: tab === 'packtime' ? 'block' : 'none' }}><PackTime active={tab === 'packtime'} /></div>}
        {mounted.has('challan') && <div style={{ display: tab === 'challan' ? 'block' : 'none' }}><CashChallan active={tab === 'challan'} /></div>}
        {mounted.has('settings') && <div style={{ display: tab === 'settings' ? 'block' : 'none' }}><SettingsPage /></div>}
      </main>
    </div>
    <ToastContainer />
    {scannerOpen && <BarcodeScanner onScan={handleScan} onClose={() => setScannerOpen(false)} scanError={scanError} />}
  </div>);
};

export default function App() { return <ErrorBoundary><AuthProvider><AppContent /></AuthProvider></ErrorBoundary>; }

const AppContent = () => {
  const auth = useAuth();
  if (!auth?.ready && auth?.loading) return <div style={{ minHeight: '100vh', width: '100%', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}><div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.sora, letterSpacing: -0.5, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Unsort</div><div className="spinner" /><p style={{ color: T.tx3, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' }}>LOADING</p></div>;
  if (!auth?.user) return <AuthScreen />;
  return <NotificationProvider><MainApp /></NotificationProvider>;
};
