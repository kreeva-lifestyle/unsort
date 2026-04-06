import React, { useState, useEffect, createContext, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ulphprdnswznfztawbvg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Design tokens matching Pricedesk dark theme
const T = {
  bg: '#0f1117', s: '#181c26', s2: '#1f2435', s3: '#262d42',
  bd: '#2a3148', bd2: '#3a4560',
  tx: '#e8ecf4', tx2: '#8b9abf', tx3: '#5a6a90',
  ac: '#8b5cf6', ac2: '#a78bfa',
  gr: '#2dd4a0', re: '#f5575c', bl: '#4e8ef7', yl: '#f5a623',
  r: 6, mono: "'IBM Plex Mono', monospace", sans: "'IBM Plex Sans', sans-serif",
};

// Shared styles
const S = {
  fLabel: { fontSize: 11, color: T.tx3, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 1, display: 'block' } as React.CSSProperties,
  fInput: { width: '100%', background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: T.r, color: T.tx, fontFamily: T.sans, fontSize: 13, padding: '9px 12px', outline: 'none', transition: 'border-color .15s' } as React.CSSProperties,
  btnPrimary: { padding: '8px 18px', borderRadius: T.r, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: T.sans, background: T.ac, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'opacity .15s', letterSpacing: 0.2 } as React.CSSProperties,
  btnGhost: { padding: '8px 18px', borderRadius: T.r, border: `1px solid ${T.bd2}`, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: T.sans, background: 'transparent', color: T.tx2, display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all .15s' } as React.CSSProperties,
  btnDanger: { padding: '6px 12px', borderRadius: T.r, border: '1px solid rgba(245,87,92,.3)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: T.sans, background: 'rgba(245,87,92,.1)', color: T.re, transition: 'all .15s' } as React.CSSProperties,
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' } as React.CSSProperties,
  modalBox: { background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 12, width: 500, maxWidth: 'calc(100vw - 32px)', maxHeight: '88vh', overflowY: 'auto' as const } as React.CSSProperties,
  modalHead: { padding: '16px 20px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as React.CSSProperties,
  thStyle: { fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, padding: '10px 14px', textAlign: 'left' as const, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: T.s2 } as React.CSSProperties,
  tdStyle: { padding: '10px 14px', fontSize: 13, borderBottom: `1px solid ${T.bd}`, color: T.tx } as React.CSSProperties,
};

const AuthContext = createContext<any>(null);
const NotificationContext = createContext<any>(null);
const useAuth = () => useContext(AuthContext);
const useNotifications = () => useContext(NotificationContext);

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) await fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data);
    setLoading(false);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    return { error };
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  return <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, fetchProfile }}>{children}</AuthContext.Provider>;
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
    <div style={{ position: 'fixed', bottom: 22, right: 22, zIndex: 999 }}>
      {toasts.map((t: any) => (
        <div key={t.id} style={{ background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, padding: '11px 17px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 9, boxShadow: '0 4px 20px rgba(0,0,0,.4)', animation: 'su .18s ease', marginBottom: 8, borderLeft: `3px solid ${t.type === 'error' ? T.re : T.gr}`, color: T.tx, maxWidth: 'calc(100vw - 32px)' }}>{t.message}</div>
      ))}
    </div>
  );
};

const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = isLogin ? await signIn(email, password) : await signUp(email, password, fullName);
    if (error) setError(error.message);
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = { width: '100%', background: `rgba(31,36,53,.8)`, border: `1px solid ${T.bd2}`, borderRadius: 10, color: T.tx, fontFamily: T.sans, fontSize: 16, padding: '12px 14px', transition: 'all .2s', outline: 'none', marginBottom: 16 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 400, height: 400, background: T.ac, borderRadius: '50%', filter: 'blur(80px)', opacity: 0.15, top: -100, left: -100, animation: 'loginGlowFloat 8s ease-in-out infinite alternate' }} />
      <div style={{ position: 'absolute', width: 350, height: 350, background: T.bl, borderRadius: '50%', filter: 'blur(80px)', opacity: 0.15, bottom: -80, right: -80, animation: 'loginGlowFloat 10s ease-in-out infinite alternate', animationDelay: '-3s' }} />
      <div style={{ position: 'absolute', width: 250, height: 250, background: T.yl, borderRadius: '50%', filter: 'blur(80px)', opacity: 0.1, top: '50%', left: '60%', animation: 'loginGlowFloat 12s ease-in-out infinite alternate', animationDelay: '-5s' }} />
      <div style={{ position: 'relative', zIndex: 1, background: 'rgba(24,28,38,.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: `1px solid rgba(42,49,72,.6)`, borderRadius: 20, width: 400, maxWidth: 'calc(100vw - 32px)', padding: '40px 36px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.03) inset', animation: 'loginBoxEnter .6s cubic-bezier(.16,1,.3,1) both' }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.ac, fontFamily: T.mono, marginBottom: 4, letterSpacing: -0.5, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'loginLogoShine 3s ease-in-out infinite alternate' }}>Unsort</div>
        <div style={{ fontSize: 11, color: T.tx3, letterSpacing: 3, textTransform: 'uppercase' as const, marginBottom: 32, opacity: 0, animation: 'loginFadeUp .5s .2s ease both' }}>Track Damaged & Unsorted Products</div>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.bd2}, transparent)`, marginBottom: 28, opacity: 0, animation: 'loginFadeUp .5s .25s ease both' }} />
        {error && <div style={{ background: 'rgba(245,87,92,.12)', border: '1px solid rgba(245,87,92,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: T.re, marginBottom: 14, animation: 'loginShake .4s ease' }}>{error}</div>}
        <div style={{ display: 'flex', marginBottom: 24, background: T.s2, borderRadius: 8, padding: 3 }}>
          <button onClick={() => setIsLogin(true)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: T.sans, background: isLogin ? T.ac : 'transparent', color: isLogin ? '#fff' : T.tx3, transition: 'all .15s' }}>Sign In</button>
          <button onClick={() => setIsLogin(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: T.sans, background: !isLogin ? T.ac : 'transparent', color: !isLogin ? '#fff' : T.tx3, transition: 'all .15s' }}>Sign Up</button>
        </div>
        <form onSubmit={handleSubmit}>
          {!isLogin && <div style={{ textAlign: 'left', opacity: 0, animation: 'loginFadeUp .5s .3s ease both' }}><label style={{ fontSize: 11, color: T.tx3, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1.5, display: 'block' }}>Full Name</label><input type="text" placeholder="Enter your name" value={fullName} onChange={(e) => setFullName(e.target.value)} required style={inputStyle} /></div>}
          <div style={{ textAlign: 'left', opacity: 0, animation: 'loginFadeUp .5s .35s ease both' }}><label style={{ fontSize: 11, color: T.tx3, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1.5, display: 'block' }}>Email</label><input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} /></div>
          <div style={{ textAlign: 'left', opacity: 0, animation: 'loginFadeUp .5s .4s ease both' }}><label style={{ fontSize: 11, color: T.tx3, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1.5, display: 'block' }}>Password</label><input type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} /></div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: T.sans, color: '#000', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: 0.3, opacity: 0, animation: 'loginFadeUp .5s .5s ease both', position: 'relative', overflow: 'hidden' }}>{loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}</button>
        </form>
        <p style={{ fontSize: 11, color: T.tx3, marginTop: 24, letterSpacing: 1 }}>Powered by Arya Designs</p>
      </div>
    </div>
  );
};

const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) => {
  const { profile } = useAuth();
  const tabs = [{ id: 'dashboard', icon: '📊', label: 'Dashboard' }, { id: 'inventory', icon: '📦', label: 'Inventory' }, { id: 'categories', icon: '🏷️', label: 'Categories' }, { id: 'reports', icon: '📋', label: 'Reports' }, { id: 'activity', icon: '📜', label: 'Activity' }];
  if (profile?.role === 'admin') tabs.push({ id: 'users', icon: '👥', label: 'Users' });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div style={{ width: 230, height: '100vh', background: T.s, borderRight: `1px solid ${T.bd}`, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 100, overflowY: 'auto' }}>
      <div style={{ padding: '18px 16px', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ac, fontFamily: T.mono, letterSpacing: -0.5 }}>Unsort</div>
        <div style={{ fontSize: 10, color: T.tx3, letterSpacing: 2, textTransform: 'uppercase' as const, marginTop: 3 }}>Product Tracking</div>
      </div>
      <div style={{ fontSize: 10, color: T.tx3, letterSpacing: 2, textTransform: 'uppercase' as const, padding: '14px 16px 6px', fontWeight: 600 }}>Navigation</div>
      <nav style={{ flex: 1, padding: '0 0 10px' }}>
        {tabs.map((t) => (
          <div key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', cursor: 'pointer', background: activeTab === t.id ? T.s2 : 'transparent', color: activeTab === t.id ? T.ac : T.tx2, fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400, fontFamily: T.sans, borderLeft: `3px solid ${activeTab === t.id ? T.ac : 'transparent'}`, transition: 'all .12s' }}>
            <span style={{ width: 18, textAlign: 'center', fontSize: 14 }}>{t.icon}</span> {t.label}
          </div>
        ))}
      </nav>
      <div style={{ padding: '14px 16px', borderTop: `1px solid ${T.bd}`, marginTop: 'auto' }}>
        {profile && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(profile.full_name || 'U')[0].toUpperCase()}</div>
          <div><p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.tx }}>{profile.full_name}</p><p style={{ margin: 0, fontSize: 11, color: T.tx3, textTransform: 'capitalize' as const }}>{profile.role}</p></div>
        </div>}
        <div onClick={handleSignOut} style={{ width: '100%', padding: '8px 14px', borderRadius: T.r, border: `1px solid ${T.bd2}`, background: T.s2, color: T.tx2, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: T.sans, transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, userSelect: 'none' }}>Sign Out</div>
        <p style={{ margin: '12px 0 0', fontSize: 9, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase' as const, textAlign: 'center', opacity: 0.5 }}>Powered by Arya Designs</p>
      </div>
    </div>
  );
};

const Header = ({ title }: { title: string }) => {
  const { notifications, markAsRead } = useNotifications();
  const [show, setShow] = useState(false);
  const unread = notifications.filter((n: any) => !n.is_read).length;

  return (
    <header style={{ background: T.s, borderBottom: `1px solid ${T.bd}`, padding: '12px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 }}>
      <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.tx }}>{title}</h1>
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShow(!show)} style={{ padding: '7px 10px', borderRadius: T.r, border: `1px solid ${T.bd2}`, background: 'transparent', cursor: 'pointer', position: 'relative', color: T.tx2, fontSize: 14 }}>
          🔔 {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: T.ac, color: 'white', borderRadius: '50%', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono }}>{unread}</span>}
        </button>
        {show && (
          <div className="notif-dropdown" style={{ position: 'absolute', right: 0, top: 44, width: 320, background: T.s, borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.03) inset', border: `1px solid ${T.bd2}`, zIndex: 50, maxHeight: 400, overflowY: 'auto' }}>
            <div style={{ padding: '13px 17px', borderBottom: `1px solid ${T.bd}`, fontWeight: 600, fontSize: 13, color: T.tx, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Notifications {unread > 0 && <span style={{ fontSize: 10, fontFamily: T.mono, color: T.ac, background: 'rgba(139,92,246,.12)', padding: '2px 7px', borderRadius: T.r }}>{unread} new</span>}</div>
            {notifications.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No notifications</div> : notifications.slice(0, 10).map((n: any) => (
              <div key={n.id} onClick={() => markAsRead(n.id)} style={{ padding: '10px 17px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', background: n.is_read ? 'transparent' : 'rgba(139,92,246,.06)' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: T.tx }}>{n.title}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: T.tx3 }}>{n.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
};

const statusTag = (status: string) => {
  const m: Record<string, { bg: string; color: string }> = {
    complete: { bg: 'rgba(45,212,160,.15)', color: T.gr },
    damaged: { bg: 'rgba(245,87,92,.15)', color: T.re },
    unsorted: { bg: 'rgba(245,166,35,.15)', color: T.yl },
    repaired: { bg: 'rgba(78,142,247,.15)', color: T.bl },
    disposed: { bg: 'rgba(139,154,191,.1)', color: T.tx3 },
  };
  const s = m[status] || m.unsorted;
  return { display: 'inline-block' as const, padding: '2px 8px', borderRadius: T.r, fontSize: 11, fontWeight: 500, background: s.bg, color: s.color };
};

const Dashboard = () => {
  const [stats, setStats] = useState<any>({ total_products: 0, total_inventory: 0, damaged_count: 0, unsorted_count: 0, complete_count: 0, open_reports: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: summaryRows } = await supabase.from('dashboard_summary').select('*').limit(1);
    const { data: items } = await supabase.from('inventory_items').select('*, products(name, sku)').order('created_at', { ascending: false }).limit(5);
    if (summaryRows && summaryRows.length > 0) setStats(summaryRows[0]);
    setRecent(items || []);
    setLoading(false);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, flexDirection: 'column', gap: 12 }}><div className="spinner" /><span style={{ color: T.tx3, fontSize: 12 }}>Loading dashboard...</span></div>;

  const cards = [
    { label: 'CATEGORIES', value: stats.total_products, color: T.ac, icon: '🏷️' },
    { label: 'INVENTORY', value: stats.total_inventory, color: T.bl, icon: '📦' },
    { label: 'DAMAGED', value: stats.damaged_count, color: T.re, icon: '⚠️' },
    { label: 'UNSORTED', value: stats.unsorted_count, color: T.yl, icon: '❓' },
    { label: 'COMPLETE', value: stats.complete_count, color: T.gr, icon: '✅' },
    { label: 'OPEN REPORTS', value: stats.open_reports, color: '#9b6dff', icon: '📋' },
  ];

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 13, marginBottom: 20 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '15px 17px', transition: 'border-color .15s, box-shadow .15s', cursor: 'default' }} onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.bd2; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,.2)'; }} onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.bd; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 7 }}>
              <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1 }}>{c.label}</p>
              <span style={{ fontSize: 14, opacity: 0.6 }}>{c.icon}</span>
            </div>
            <p style={{ fontFamily: T.mono, fontSize: 24, fontWeight: 600, color: c.color, margin: 0 }}>{c.value}</p>
          </div>
        ))}
      </div>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r }}>
        <div style={{ padding: '13px 17px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Recent Items</span>
        </div>
        <div style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: T.s2 }}>{['Category', 'Code', 'Status'].map(h => <th key={h} style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, padding: '9px 13px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{h}</th>)}</tr></thead>
            <tbody>{recent.map((item) => (
              <tr key={item.id}><td style={{ padding: '9px 13px', fontSize: 12, borderBottom: `1px solid ${T.bd}`, color: T.tx }}>{item.products?.name}</td><td style={{ padding: '9px 13px', fontSize: 12, borderBottom: `1px solid ${T.bd}`, fontFamily: T.mono, color: T.tx2 }}>{item.products?.sku}</td><td style={{ padding: '9px 13px', fontSize: 12, borderBottom: `1px solid ${T.bd}` }}><span style={statusTag(item.status)}>{item.status}</span></td></tr>
            ))}</tbody>
          </table>
          {recent.length === 0 && <p style={{ color: T.tx3, textAlign: 'center', padding: 20, fontSize: 12 }}>No items yet</p>}
        </div>
      </div>
    </div>
  );
};

const Inventory = () => {
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [comps, setComps] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [form, setForm] = useState({ product_id: '', serial_number: '', batch_number: '', status: 'unsorted', location: '', notes: '' });

  useEffect(() => { fetchData(); const ch = supabase.channel('inv').on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, fetchData).subscribe(); return () => { supabase.removeChannel(ch); }; }, []);

  const fetchData = async () => { const { data: inv } = await supabase.from('inventory_items').select('*, products(name, sku, total_components)').order('created_at', { ascending: false }); const { data: prod } = await supabase.from('products').select('*').eq('is_active', true); setItems(inv || []); setProducts(prod || []); setLoading(false); };

  const fetchComps = async (id: string) => { const { data } = await supabase.from('item_components').select('*, components(name, component_code, is_critical)').eq('inventory_item_id', id); setComps(data || []); };

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); const { error } = selected ? await supabase.from('inventory_items').update(form).eq('id', selected.id) : await supabase.from('inventory_items').insert({ ...form, reported_by: profile?.id }); if (error) addToast(error.message, 'error'); else { addToast(selected ? 'Updated!' : 'Added!', 'success'); setShowModal(false); setSelected(null); setForm({ product_id: '', serial_number: '', batch_number: '', status: 'unsorted', location: '', notes: '' }); fetchData(); } };

  const updateComp = async (id: string, status: string) => { const { error } = await supabase.from('item_components').update({ status }).eq('id', id); if (error) addToast(error.message, 'error'); else { addToast('Updated!', 'success'); fetchComps(selected.id); fetchData(); } };

  const openEdit = (item: any) => { setSelected(item); setForm({ product_id: item.product_id, serial_number: item.serial_number || '', batch_number: item.batch_number || '', status: item.status, location: item.location || '', notes: item.notes || '' }); setShowModal(true); };
  const openComps = async (item: any) => { setSelected(item); await fetchComps(item.id); setShowCompModal(true); };
  const canEdit = profile && ['admin', 'manager', 'operator'].includes(profile.role);
  const filtered = items.filter((i) => filter === 'all' || i.status === filter);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, flexDirection: 'column', gap: 12 }}><div className="spinner" /><span style={{ color: T.tx3, fontSize: 12 }}>Loading inventory...</span></div>;

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: T.tx3, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const }}>Status</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...S.fInput, width: 150, padding: '7px 10px', cursor: 'pointer' }}><option value="all">All</option><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="complete">Complete</option></select>
        <div style={{ flex: 1 }} />
        {canEdit && <div onClick={() => { setSelected(null); setForm({ product_id: '', serial_number: '', batch_number: '', status: 'unsorted', location: '', notes: '' }); setShowModal(true); }} style={S.btnPrimary}>+ Add Item</div>}
      </div>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Category', 'Code', 'Status', 'Components', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((item) => (<tr key={item.id} style={{ transition: 'background .1s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><td style={S.tdStyle}>{item.products?.name}</td><td style={{ ...S.tdStyle, fontFamily: T.mono, color: T.tx2, fontSize: 12 }}>{item.products?.sku}</td><td style={S.tdStyle}><span style={statusTag(item.status)}>{item.status}</span></td><td style={S.tdStyle}><span onClick={() => openComps(item)} style={{ color: T.ac, cursor: 'pointer', fontSize: 13 }}>View ({item.products?.total_components || 0})</span></td><td style={S.tdStyle}>{canEdit && <span onClick={() => openEdit(item)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12 }}>Edit</span>}</td></tr>))}</tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: T.tx3, fontSize: 13 }}>No items</div>}
      </div>

      {showModal && (<div style={S.modalOverlay}><div style={S.modalBox}><div style={S.modalHead}><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Item</span><span onClick={() => setShowModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><form onSubmit={handleSubmit} style={{ padding: 20 }}><div style={{ marginBottom: 14 }}><label style={S.fLabel}>Category *</label><select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} required style={S.fInput}><option value="">Select</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}><div><label style={S.fLabel}>Serial Number</label><input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="Optional" style={S.fInput} /></div><div><label style={S.fLabel}>Batch Number</label><input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} placeholder="Optional" style={S.fInput} /></div></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}><div><label style={S.fLabel}>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={S.fInput}><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="complete">Complete</option></select></div><div><label style={S.fLabel}>Location</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Warehouse A" style={S.fInput} /></div></div><div style={{ marginBottom: 14 }}><label style={S.fLabel}>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" style={S.fInput} /></div><div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>{selected ? 'Update' : 'Add'}</button></div></form></div></div>)}

      {showCompModal && selected && (<div style={S.modalOverlay}><div style={S.modalBox}><div style={S.modalHead}><div><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>Components</span><p style={{ margin: '4px 0 0', fontSize: 12, color: T.tx3 }}>{selected.products?.name}</p></div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><div style={{ padding: 20 }}><div style={{ background: 'rgba(139,92,246,.06)', border: `1px solid rgba(139,92,246,.2)`, borderRadius: T.r, padding: '10px 14px', fontSize: 12, color: T.ac2, marginBottom: 16 }}>Mark all components as "Present" to auto-complete this item</div>{comps.map((c) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, marginBottom: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: c.status === 'present' ? T.gr : c.status === 'damaged' ? T.re : T.yl }} /><div><p style={{ margin: 0, fontWeight: 500, fontSize: 13, color: T.tx }}>{c.components?.name}</p><p style={{ margin: 0, fontSize: 11, fontFamily: T.mono, color: T.tx3 }}>{c.components?.component_code}{c.components?.is_critical && <span style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 3, fontSize: 9, background: 'rgba(245,87,92,.12)', color: T.re, fontWeight: 600 }}>Critical</span>}</p></div></div>{canEdit && <select value={c.status} onChange={(e) => updateComp(c.id, e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 100, padding: '6px 8px', cursor: 'pointer' }}><option value="missing">Missing</option><option value="present">Present</option><option value="damaged">Damaged</option></select>}</div>))}{comps.length === 0 && <p style={{ textAlign: 'center', color: T.tx3, fontSize: 13, padding: 20 }}>No components</p>}</div></div></div>)}
    </div>
  );
};

const Categories = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [comps, setComps] = useState<any[]>([]);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [form, setForm] = useState({ sku: '', name: '', description: '', category: '' });
  const [compForm, setCompForm] = useState({ component_code: '', name: '', is_critical: false });

  useEffect(() => { fetchCategories(); }, []);
  const fetchCategories = async () => { const { data } = await supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }); setCategories(data || []); setLoading(false); };
  const fetchComps = async (id: string) => { const { data } = await supabase.from('components').select('*').eq('product_id', id).order('created_at', { ascending: true }); setComps(data || []); };

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); const { error } = selected ? await supabase.from('products').update(form).eq('id', selected.id) : await supabase.from('products').insert({ ...form, created_by: profile?.id }); if (error) addToast(error.message, 'error'); else { addToast(selected ? 'Updated!' : 'Added!', 'success'); setShowModal(false); setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); fetchCategories(); } };

  const addComp = async (e: React.FormEvent) => { e.preventDefault(); const { error } = await supabase.from('components').insert({ ...compForm, product_id: selected.id }); if (error) addToast(error.message, 'error'); else { addToast('Component added!', 'success'); setCompForm({ component_code: '', name: '', is_critical: false }); fetchComps(selected.id); fetchCategories(); } };

  const deleteComp = async (id: string) => { await supabase.from('components').delete().eq('id', id); addToast('Deleted!', 'success'); fetchComps(selected.id); fetchCategories(); };

  const openEdit = (p: any) => { setSelected(p); setForm({ sku: p.sku, name: p.name, description: p.description || '', category: p.category || '' }); setShowModal(true); };
  const openComps = async (p: any) => { setSelected(p); await fetchComps(p.id); setShowCompModal(true); };
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, flexDirection: 'column', gap: 12 }}><div className="spinner" /><span style={{ color: T.tx3, fontSize: 12 }}>Loading categories...</span></div>;

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Categories</span>{canEdit && <div onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setShowModal(true); }} style={S.btnPrimary}>+ Add Category</div>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>{categories.map((p) => (<div key={p.id} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '18px 20px', transition: 'border-color .15s, box-shadow .15s', cursor: 'default' }} onMouseEnter={e => { e.currentTarget.style.borderColor = T.bd2; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,.2)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.boxShadow = 'none'; }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.tx }}>{p.name}</h3>
            <p style={{ margin: '4px 0 0', color: T.ac, fontSize: 12, fontFamily: T.mono }}>{p.sku}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {canEdit && <span onClick={() => openEdit(p)} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 12 }}>Edit</span>}
          </div>
        </div>
        {p.description && <p style={{ color: T.tx3, fontSize: 13, margin: '0 0 12px' }}>{p.description}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 0', borderTop: `1px solid ${T.bd}` }}>
          <span style={{ fontSize: 12, color: T.tx3 }}>{p.total_components} component{p.total_components !== 1 ? 's' : ''}</span>
          <span onClick={() => openComps(p)} style={{ ...S.btnPrimary, padding: '5px 14px', fontSize: 12 }}>Manage Components</span>
        </div>
      </div>))}</div>
      {categories.length === 0 && <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 48, textAlign: 'center' }}><p style={{ color: T.tx3, fontSize: 14, marginBottom: 12 }}>No categories yet</p><p style={{ color: T.tx3, fontSize: 12 }}>Add a category like "Lehenga Choli" and then add components like Lehenga, Blouse, Dupatta</p>{canEdit && <div onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setShowModal(true); }} style={{ ...S.btnPrimary, marginTop: 16, display: 'inline-flex' }}>+ Add First Category</div>}</div>}

      {showModal && (<div style={S.modalOverlay}><div style={S.modalBox}><div style={S.modalHead}><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Category</span><span onClick={() => setShowModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><form onSubmit={handleSubmit} style={{ padding: 20 }}><div style={{ marginBottom: 14 }}><label style={S.fLabel}>Category Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Lehenga Choli" style={S.fInput} /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}><div><label style={S.fLabel}>Code *</label><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required placeholder="e.g. LC-001" style={S.fInput} /></div><div><label style={S.fLabel}>Group</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Ethnic Wear" style={S.fInput} /></div></div><div style={{ marginBottom: 14 }}><label style={S.fLabel}>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of this category" style={S.fInput} /></div><div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>{selected ? 'Update' : 'Add Category'}</button></div></form></div></div>)}

      {showCompModal && selected && (<div style={S.modalOverlay}><div style={{ ...S.modalBox, width: 560 }}><div style={S.modalHead}><div><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>Components of "{selected.name}"</span><p style={{ margin: '4px 0 0', fontSize: 12, color: T.tx3 }}>Add the individual parts that make up this category</p></div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><div style={{ padding: 20 }}>{canEdit && <form onSubmit={addComp} style={{ background: T.s2, border: `1px solid ${T.bd}`, padding: 16, borderRadius: T.r, marginBottom: 16 }}><p style={{ fontSize: 11, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>Add New Component</p><div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10, marginBottom: 10 }}><input value={compForm.component_code} onChange={(e) => setCompForm({ ...compForm, component_code: e.target.value })} placeholder="Code" required style={S.fInput} /><input value={compForm.name} onChange={(e) => setCompForm({ ...compForm, name: e.target.value })} placeholder="e.g. Lehenga, Blouse, Dupatta" required style={S.fInput} /></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.tx2, cursor: 'pointer' }}><input type="checkbox" checked={compForm.is_critical} onChange={(e) => setCompForm({ ...compForm, is_critical: e.target.checked })} /> Mark as critical</label><button type="submit" style={{ ...S.btnPrimary, padding: '7px 16px' }}>+ Add Component</button></div></form>}
      {comps.length > 0 && <p style={{ fontSize: 11, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>{comps.length} Component{comps.length !== 1 ? 's' : ''}</p>}
      {comps.map((c, i) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: `1px solid ${T.bd}`, borderRadius: T.r, marginBottom: 6, background: T.s2 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 24, height: 24, borderRadius: '50%', background: T.s3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: T.tx2, fontFamily: T.mono }}>{i + 1}</span><div><span style={{ fontSize: 14, color: T.tx, fontWeight: 500 }}>{c.name}</span><div style={{ display: 'flex', gap: 6, marginTop: 2 }}><span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 500, background: 'rgba(139,92,246,.1)', color: T.ac2, fontFamily: T.mono }}>{c.component_code}</span>{c.is_critical && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, background: 'rgba(245,87,92,.1)', color: T.re, fontWeight: 600 }}>Critical</span>}</div></div></div>{canEdit && <span onClick={() => deleteComp(c.id)} style={S.btnDanger}>Delete</span>}</div>))}
      {comps.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: T.tx3 }}><p style={{ fontSize: 13, marginBottom: 4 }}>No components added yet</p><p style={{ fontSize: 12 }}>Add components like Lehenga, Blouse, Dupatta etc.</p></div>}</div></div></div>)}
    </div>
  );
};

const Reports = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [form, setForm] = useState({ inventory_item_id: '', damage_type: '', cause: '', estimated_loss: '' });

  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => { const { data: rep } = await supabase.from('damage_reports').select('*, inventory_items(*, products(name, sku)), profiles:reported_by(full_name)').order('created_at', { ascending: false }); const { data: inv } = await supabase.from('inventory_items').select('*, products(name, sku)').in('status', ['damaged', 'unsorted']); setReports(rep || []); setItems(inv || []); setLoading(false); };

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); const { error } = await supabase.from('damage_reports').insert({ ...form, estimated_loss: form.estimated_loss ? parseFloat(form.estimated_loss) : null, reported_by: profile?.id }); if (error) addToast(error.message, 'error'); else { addToast('Created!', 'success'); setShowModal(false); setForm({ inventory_item_id: '', damage_type: '', cause: '', estimated_loss: '' }); fetchData(); } };

  const updateStatus = async (id: string, status: string) => { await supabase.from('damage_reports').update({ status }).eq('id', id); addToast('Updated!', 'success'); fetchData(); };

  const canEdit = profile && ['admin', 'manager', 'operator'].includes(profile.role);

  const reportStatusTag = (status: string) => {
    const m: Record<string, { bg: string; color: string }> = {
      open: { bg: 'rgba(245,87,92,.15)', color: T.re },
      investigating: { bg: 'rgba(245,166,35,.15)', color: T.yl },
      resolved: { bg: 'rgba(45,212,160,.15)', color: T.gr },
      closed: { bg: 'rgba(139,154,191,.1)', color: T.tx3 },
    };
    const s = m[status] || m.open;
    return { display: 'inline-block' as const, padding: '2px 8px', borderRadius: T.r, fontSize: 11, fontWeight: 500, background: s.bg, color: s.color };
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, flexDirection: 'column', gap: 12 }}><div className="spinner" /><span style={{ color: T.tx3, fontSize: 12 }}>Loading reports...</span></div>;

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Damage Reports</span>{canEdit && <div onClick={() => setShowModal(true)} style={S.btnPrimary}>+ New Report</div>}</div>
      {reports.map((r) => (<div key={r.id} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '16px 18px', marginBottom: 10, transition: 'border-color .15s' }} onMouseEnter={e => e.currentTarget.style.borderColor = T.bd2} onMouseLeave={e => e.currentTarget.style.borderColor = T.bd}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><div><span style={{ fontFamily: T.mono, color: T.ac, fontSize: 12, fontWeight: 500 }}>{r.report_number}</span><span style={{ marginLeft: 8, ...reportStatusTag(r.status) }}>{r.status}</span><h3 style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 600, color: T.tx }}>{r.inventory_items?.products?.name}</h3></div>{canEdit && <select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 120, padding: '6px 10px', cursor: 'pointer', height: 'fit-content' }}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select>}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}><div><p style={{ margin: 0, color: T.tx3, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600 }}>Type</p><p style={{ margin: '4px 0 0', fontSize: 13, color: T.tx }}>{r.damage_type}</p></div><div><p style={{ margin: 0, color: T.tx3, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600 }}>Cause</p><p style={{ margin: '4px 0 0', fontSize: 13, color: T.tx }}>{r.cause || '-'}</p></div><div><p style={{ margin: 0, color: T.tx3, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600 }}>Est. Loss</p><p style={{ margin: '4px 0 0', fontSize: 13, fontFamily: T.mono, color: r.estimated_loss ? T.re : T.tx3 }}>{r.estimated_loss ? `₹${r.estimated_loss.toLocaleString()}` : '-'}</p></div></div></div>))}
      {reports.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: T.tx3, fontSize: 13 }}>No reports</div>}

      {showModal && (<div style={S.modalOverlay}><div style={S.modalBox}><div style={S.modalHead}><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>New Report</span><span onClick={() => setShowModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><form onSubmit={handleSubmit} style={{ padding: 20 }}><div style={{ marginBottom: 14 }}><label style={S.fLabel}>Item *</label><select value={form.inventory_item_id} onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })} required style={S.fInput}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.products?.name}</option>)}</select></div><div style={{ marginBottom: 14 }}><label style={S.fLabel}>Damage Type *</label><input value={form.damage_type} onChange={(e) => setForm({ ...form, damage_type: e.target.value })} required placeholder="e.g. Tear, Stain, Broken" style={S.fInput} /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}><div><label style={S.fLabel}>Cause</label><input value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} placeholder="Optional" style={S.fInput} /></div><div><label style={S.fLabel}>Est. Loss (₹)</label><input type="number" value={form.estimated_loss} onChange={(e) => setForm({ ...form, estimated_loss: e.target.value })} placeholder="0" style={S.fInput} /></div></div><div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>Submit</button></div></form></div></div>)}
    </div>
  );
};

const Activity = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const { data } = await supabase.from('activity_logs').select('*, profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(50); setLogs(data || []); setLoading(false); })(); }, []);
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, flexDirection: 'column', gap: 12 }}><div className="spinner" /><span style={{ color: T.tx3, fontSize: 12 }}>Loading activity...</span></div>;

  const actionTag = (action: string) => {
    const isCreate = action === 'created';
    return { display: 'inline-block' as const, padding: '2px 7px', borderRadius: T.r, fontSize: 10, fontFamily: T.mono, background: isCreate ? 'rgba(45,212,160,.15)' : 'rgba(78,142,247,.15)', color: isCreate ? T.gr : T.bl };
  };

  return (<div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}><div style={{ fontSize: 14, fontWeight: 600, color: T.tx, marginBottom: 16 }}>Activity Log</div><div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r }}>{logs.map((log) => (<div key={log.id} style={{ padding: '12px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: T.s2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{log.action === 'created' ? '➕' : '✏️'}</div><div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 600, fontSize: 13, color: T.tx }}>{log.profiles?.full_name || 'System'}</span><span style={actionTag(log.action)}>{log.action}</span></div><p style={{ margin: '4px 0 0', fontSize: 12, color: T.tx3 }}>{log.description}</p></div></div>))}{logs.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: T.tx3, fontSize: 13 }}>No activity</div>}</div></div>);
};

const Users = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  useEffect(() => { (async () => { const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setUsers(data || []); setLoading(false); })(); }, []);
  const updateRole = async (id: string, role: string) => { await supabase.from('profiles').update({ role }).eq('id', id); addToast('Updated!', 'success'); const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setUsers(data || []); };
  const toggleActive = async (id: string, isActive: boolean) => { await supabase.from('profiles').update({ is_active: !isActive }).eq('id', id); addToast(isActive ? 'Revoked' : 'Granted', 'success'); const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setUsers(data || []); };
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, flexDirection: 'column', gap: 12 }}><div className="spinner" /><span style={{ color: T.tx3, fontSize: 12 }}>Loading users...</span></div>;
  return (<div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}><div style={{ fontSize: 14, fontWeight: 600, color: T.tx, marginBottom: 16 }}>User Management</div><div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, overflow: 'hidden' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['User', 'Role', 'Status', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead><tbody>{users.map((u) => (<tr key={u.id} style={{ transition: 'background .1s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}><td style={S.tdStyle}><p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: T.tx }}>{u.full_name}</p><p style={{ margin: '2px 0 0', fontSize: 12, color: T.tx3 }}>{u.email}</p></td><td style={S.tdStyle}><select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} disabled={u.id === profile?.id} style={{ ...S.fInput, width: 'auto', minWidth: 110, padding: '6px 10px', cursor: u.id === profile?.id ? 'not-allowed' : 'pointer', opacity: u.id === profile?.id ? 0.5 : 1 }}><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></td><td style={S.tdStyle}><span style={{ padding: '3px 10px', borderRadius: T.r, fontSize: 11, fontWeight: 600, ...( u.is_active ? { background: 'rgba(45,212,160,.12)', color: T.gr } : { background: 'rgba(245,87,92,.12)', color: T.re }) }}>{u.is_active ? 'Active' : 'Inactive'}</span></td><td style={S.tdStyle}>{u.id !== profile?.id && <span onClick={() => toggleActive(u.id, u.is_active)} style={{ padding: '6px 14px', borderRadius: T.r, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: T.sans, display: 'inline-block', ...(u.is_active ? { background: 'rgba(245,87,92,.1)', color: T.re, border: '1px solid rgba(245,87,92,.25)' } : { background: 'rgba(45,212,160,.1)', color: T.gr, border: '1px solid rgba(45,212,160,.25)' }) }}>{u.is_active ? 'Revoke' : 'Grant'}</span>}</td></tr>))}</tbody></table></div></div>);
};

const MainApp = () => {
  const [tab, setTab] = useState('dashboard');
  const titles: Record<string, string> = { dashboard: 'Dashboard', inventory: 'Inventory', categories: 'Categories', reports: 'Damage Reports', activity: 'Activity Log', users: 'User Management' };
  return (<div style={{ minHeight: '100vh', background: T.bg, width: '100%' }}><Sidebar activeTab={tab} setActiveTab={setTab} /><div style={{ marginLeft: 230, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}><Header title={titles[tab]} /><main style={{ flex: 1, overflowX: 'hidden' }}>{tab === 'dashboard' && <Dashboard />}{tab === 'inventory' && <Inventory />}{tab === 'categories' && <Categories />}{tab === 'reports' && <Reports />}{tab === 'activity' && <Activity />}{tab === 'users' && <Users />}</main></div><ToastContainer /></div>);
};

export default function App() { return <AuthProvider><AppContent /></AuthProvider>; }

const AppContent = () => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: '100vh', width: '100%', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}><div style={{ fontSize: 24, fontWeight: 700, fontFamily: T.mono, letterSpacing: -0.5, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Unsort</div><div className="spinner" /><p style={{ color: T.tx3, fontSize: 11, letterSpacing: 1 }}>LOADING</p></div>;
  if (!user) return <AuthScreen />;
  return <NotificationProvider><MainApp /></NotificationProvider>;
};
