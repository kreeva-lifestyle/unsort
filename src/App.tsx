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
    // Safety timeout: if auth check takes more than 4 seconds, stop loading
    const timeout = setTimeout(() => setLoading(false), 4000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => {
          setProfile(data);
          setLoading(false);
          clearTimeout(timeout);
        });
      } else {
        setLoading(false);
        clearTimeout(timeout);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => {
          setProfile(data);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
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

  return <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
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
        <form onSubmit={handleSubmit}>
          <div style={{ textAlign: 'left', opacity: 0, animation: 'loginFadeUp .5s .3s ease both' }}><label style={{ fontSize: 11, color: T.tx3, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1.5, display: 'block' }}>Email</label><input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} /></div>
          <div style={{ textAlign: 'left', opacity: 0, animation: 'loginFadeUp .5s .35s ease both' }}><label style={{ fontSize: 11, color: T.tx3, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1.5, display: 'block' }}>Password</label><input type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} /></div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: T.sans, color: '#fff', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: 0.3, opacity: 0, animation: 'loginFadeUp .5s .4s ease both', position: 'relative', overflow: 'hidden' }}>{loading ? 'Please wait...' : 'Sign In'}</button>
        </form>
        <p style={{ fontSize: 11, color: T.tx3, marginTop: 24, letterSpacing: 1 }}>Powered by Arya Designs</p>
      </div>
    </div>
  );
};

const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) => {
  const { profile } = useAuth();
  const tabs = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'inventory', icon: '📦', label: 'Inventory' },
    { id: 'categories', icon: '🏷️', label: 'Categories' },
    { id: 'locations', icon: '📍', label: 'Locations' },
    { id: 'tags', icon: '🔖', label: 'Tags' },
    { id: 'reports', icon: '📋', label: 'Reports' },
    { id: 'activity', icon: '📜', label: 'Activity' },
  ];
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
    dry_clean: { bg: 'rgba(78,142,247,.15)', color: T.bl },
  };
  const s = m[status] || m.unsorted;
  return { display: 'inline-block' as const, padding: '2px 8px', borderRadius: T.r, fontSize: 11, fontWeight: 500, background: s.bg, color: s.color };
};

const Dashboard = () => {
  const [stats, setStats] = useState<any>({ total_products: 0, total_inventory: 0, damaged_count: 0, unsorted_count: 0, complete_count: 0, open_reports: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('dashboard_summary').select('*').limit(1).then(({ data }) => { if (data && data[0]) setStats(data[0]); });
    supabase.from('inventory_items').select('*, products(name, sku)').order('created_at', { ascending: false }).limit(5).then(({ data }) => { setRecent(data || []); });
  }, []);

  const cards = [
    { label: 'CATEGORIES', value: stats.total_products, color: T.ac, icon: '🏷️' },
    { label: 'INVENTORY', value: stats.total_inventory, color: T.bl, icon: '📦' },
    { label: 'UNSORTED', value: stats.unsorted_count, color: T.yl, icon: '❓' },
    { label: 'DAMAGED', value: stats.damaged_count, color: T.re, icon: '⚠️' },
    { label: 'DRY CLEAN', value: stats.dry_clean_count || 0, color: T.bl, icon: '🧹' },
    { label: 'COMPLETE', value: stats.complete_count, color: T.gr, icon: '✅' },
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
  const [search, setSearch] = useState('');
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [form, setForm] = useState({ product_id: '', serial_number: '', status: 'unsorted', location: '', notes: '' });
  const [catSearch, setCatSearch] = useState('');
  const [showCatDrop, setShowCatDrop] = useState(false);
  const [catComps, setCatComps] = useState<any[]>([]);
  const [missingComps, setMissingComps] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [matchResult, setMatchResult] = useState<any>(null);

  const fetchData = () => {
    supabase.from('inventory_items').select('*, products(name, sku, total_components)').order('created_at', { ascending: false }).then(({ data }) => setItems(data || []));
    supabase.from('products').select('*').eq('is_active', true).then(({ data }) => setProducts(data || []));
    supabase.from('locations').select('*').order('name').then(({ data }) => setLocations(data || []));
    supabase.from('tags').select('*').order('name').then(({ data }) => setTags(data || []));
    supabase.from('item_tags').select('*, tags(id, name, color)').then(({ data }) => {
      const map: Record<string, any[]> = {};
      (data || []).forEach((it: any) => { if (!map[it.inventory_item_id]) map[it.inventory_item_id] = []; map[it.inventory_item_id].push(it.tags); });
      setItemTags(map);
    });
  };
  useEffect(() => { fetchData(); const ch = supabase.channel('inv').on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, fetchData).subscribe(); return () => { supabase.removeChannel(ch); }; }, []);

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
    await new Promise(r => setTimeout(r, 500)); // wait for trigger to create item_components
    const { data: itemComps } = await supabase.from('item_components').select('*').eq('inventory_item_id', inventoryItemId);
    if (itemComps) {
      for (const ic of itemComps) {
        const isMissing = missingComps.has(ic.component_id);
        await supabase.from('item_components').update({ status: isMissing ? 'missing' : 'present' }).eq('id', ic.id);
      }
    }
  };

  const checkForPairMatch = async (productId: string, currentItemId: string) => {
    // Get all components for this category
    const { data: allComps } = await supabase.from('components').select('id').eq('product_id', productId);
    if (!allComps || allComps.length === 0) return;
    const allCompIds = new Set(allComps.map(c => c.id));

    // Get the current item's present components
    const { data: currentItemComps } = await supabase.from('item_components').select('component_id, status').eq('inventory_item_id', currentItemId);
    if (!currentItemComps) return;
    const currentPresent = new Set(currentItemComps.filter(c => c.status === 'present').map(c => c.component_id));
    const currentMissing = new Set(currentItemComps.filter(c => c.status === 'missing').map(c => c.component_id));
    if (currentMissing.size === 0) return; // nothing missing, no need to pair

    // Find other unsorted items of the same category
    const { data: otherItems } = await supabase.from('inventory_items')
      .select('id, batch_number, serial_number, created_at')
      .eq('product_id', productId)
      .eq('status', 'unsorted')
      .neq('id', currentItemId);
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
    let savedItemId = '';
    if (selected) {
      const { error } = await supabase.from('inventory_items').update(form).eq('id', selected.id);
      if (error) { addToast(error.message, 'error'); return; }
      if (form.status === 'unsorted') await updateComponentStatuses(selected.id);
      savedItemId = selected.id;
      addToast('Updated!', 'success');
    } else {
      // Auto-generate unique ID and store in batch_number
      const uniqueId = generateUniqueId();
      const insertData = { ...form, batch_number: uniqueId, reported_by: profile?.id };
      const { data, error } = await supabase.from('inventory_items').insert(insertData).select().single();
      if (error || !data) { addToast(error?.message || 'Error', 'error'); return; }
      if (form.status === 'unsorted') await updateComponentStatuses(data.id);
      savedItemId = data.id;
      addToast(`Item added! ID: ${uniqueId}`, 'success');
    }
    // Save tags
    if (savedItemId) {
      await supabase.from('item_tags').delete().eq('inventory_item_id', savedItemId);
      if (selectedTags.size > 0) {
        const tagInserts = [...selectedTags].map(tagId => ({ inventory_item_id: savedItemId, tag_id: tagId }));
        await supabase.from('item_tags').insert(tagInserts);
      }
    }

    const savedProductId = form.product_id;
    const savedStatus = form.status;
    const hadMissing = missingComps.size > 0;
    setShowModal(false); setSelected(null); setForm({ product_id: '', serial_number: '', status: 'unsorted', location: '', notes: '' }); setCatComps([]); setMissingComps(new Set()); setSelectedTags(new Set()); fetchData();

    // Check for pair matches after save (only for unsorted items with missing components)
    if (savedStatus === 'unsorted' && hadMissing) {
      setTimeout(() => checkForPairMatch(savedProductId, savedItemId), 1000);
    }
  };

  const updateComp = async (id: string, status: string) => { const { error } = await supabase.from('item_components').update({ status }).eq('id', id); if (error) addToast(error.message, 'error'); else { addToast('Updated!', 'success'); fetchComps(selected.id); fetchData(); } };

  const openEdit = async (item: any) => {
    setSelected(item); setForm({ product_id: item.product_id, serial_number: item.serial_number || '', status: item.status, location: item.location || '', notes: item.notes || '' }); setCatSearch(item.products?.name || '');
    const { data: cc } = await supabase.from('components').select('*').eq('product_id', item.product_id);
    setCatComps(cc || []);
    const { data: ic } = await supabase.from('item_components').select('*').eq('inventory_item_id', item.id);
    const missing = new Set<string>();
    if (ic) ic.forEach((c: any) => { if (c.status === 'missing') missing.add(c.component_id); });
    setMissingComps(missing);
    // Load existing tags
    const existingTags = new Set<string>((itemTags[item.id] || []).map((t: any) => t?.id).filter(Boolean));
    setSelectedTags(existingTags);
    setShowModal(true);
  };
  const openComps = async (item: any) => { setSelected(item); await fetchComps(item.id); setShowCompModal(true); };
  const canEdit = profile && ['admin', 'manager', 'operator'].includes(profile.role);

  const filtered = items.filter((i) => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (catFilter !== 'all' && i.product_id !== catFilter) return false;
    if (locFilter !== 'all' && (i.location || '') !== locFilter) return false;
    if (tagFilter !== 'all') { const t = itemTags[i.id] || []; if (!t.some((tg: any) => tg?.id === tagFilter)) return false; }
    if (search) {
      const q = search.toLowerCase();
      const name = (i.products?.name || '').toLowerCase();
      const sku = (i.products?.sku || '').toLowerCase();
      const uid = (i.batch_number || '').toLowerCase();
      const skuCode = (i.serial_number || '').toLowerCase();
      const notes = (i.notes || '').toLowerCase();
      const loc = (i.location || '').toLowerCase();
      if (!name.includes(q) && !sku.includes(q) && !uid.includes(q) && !skuCode.includes(q) && !notes.includes(q) && !loc.includes(q)) return false;
    }
    return true;
  });

  const hasActiveFilters = statusFilter !== 'all' || catFilter !== 'all' || locFilter !== 'all' || tagFilter !== 'all' || search !== '';
  const clearFilters = () => { setStatusFilter('all'); setCatFilter('all'); setLocFilter('all'); setTagFilter('all'); setSearch(''); };

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Inventory <span style={{ fontSize: 12, fontWeight: 400, color: T.tx3 }}>({filtered.length}{items.length !== filtered.length ? ` of ${items.length}` : ''})</span></span>
        {canEdit && <div onClick={() => { setSelected(null); setForm({ product_id: '', serial_number: '', status: 'unsorted', location: '', notes: '' }); setCatSearch(''); setCatComps([]); setMissingComps(new Set()); setSelectedTags(new Set()); setShowModal(true); }} style={S.btnPrimary}>+ Add Item</div>}
      </div>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '10px 14px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, SKU code, location, notes..." style={{ ...S.fInput, flex: 1, minWidth: 180, padding: '7px 10px' }} />
        <div style={{ width: 1, height: 24, background: T.bd2 }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 120, padding: '7px 10px', cursor: 'pointer' }}><option value="all">All Status</option><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="dry_clean">Dry Clean</option><option value="complete">Complete</option></select>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 130, padding: '7px 10px', cursor: 'pointer' }}><option value="all">All Categories</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 120, padding: '7px 10px', cursor: 'pointer' }}><option value="all">All Locations</option>{locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select>
        {tags.length > 0 && <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 110, padding: '7px 10px', cursor: 'pointer' }}><option value="all">All Tags</option>{tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        {hasActiveFilters && <span onClick={clearFilters} style={{ fontSize: 11, color: T.ac, cursor: 'pointer', padding: '4px 10px', border: '1px solid rgba(139,92,246,.3)', borderRadius: T.r, background: 'rgba(139,92,246,.06)' }}>Clear filters</span>}
      </div>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Unique ID', 'Category', 'SKU Code', 'Status', 'Location', 'Tags', 'Notes', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((item) => (<tr key={item.id} style={{ transition: 'background .1s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 11, color: T.gr }}>{item.batch_number || '—'}</td>
            <td style={S.tdStyle}><span style={{ fontWeight: 500 }}>{item.products?.name}</span><span style={{ display: 'block', fontSize: 11, fontFamily: T.mono, color: T.tx3 }}>{item.products?.sku}</span></td>
            <td style={{ ...S.tdStyle, fontFamily: T.mono, color: T.ac2, fontSize: 12 }}>{item.serial_number || '—'}</td>
            <td style={S.tdStyle}><span style={statusTag(item.status)}>{item.status === 'dry_clean' ? 'Dry Clean' : item.status}</span></td>
            <td style={{ ...S.tdStyle, fontSize: 12, color: T.tx3 }}>{item.location || '—'}</td>
            <td style={S.tdStyle}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{(itemTags[item.id] || []).map((t: any) => t && <span key={t.id} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 500, background: (t.color || T.ac) + '20', color: t.color || T.ac }}>{t.name}</span>)}{(itemTags[item.id] || []).length === 0 && <span style={{ color: T.tx3, fontSize: 12 }}>—</span>}</div></td>
            <td style={{ ...S.tdStyle, fontSize: 12, maxWidth: 180 }}>{item.notes ? <span onClick={() => setExpandedNote(expandedNote === item.id ? null : item.id)} style={{ color: T.tx2, cursor: 'pointer' }}>{expandedNote === item.id ? item.notes : item.notes.length > 40 ? item.notes.slice(0, 40) + '...' : item.notes}</span> : <span style={{ color: T.tx3 }}>—</span>}</td>
            <td style={S.tdStyle}>
              <div style={{ display: 'flex', gap: 6 }}>
                <span onClick={() => openComps(item)} style={{ color: T.ac, cursor: 'pointer', fontSize: 12 }}>Parts</span>
                {canEdit && <span onClick={() => openEdit(item)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11 }}>Edit</span>}
              </div>
            </td>
          </tr>))}</tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: T.tx3, fontSize: 13 }}>{hasActiveFilters ? 'No items match your filters' : 'No items yet'}</div>}
      </div>

      {showModal && (<div style={S.modalOverlay}><div style={S.modalBox}><div style={S.modalHead}><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Item</span><span onClick={() => setShowModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><form onSubmit={handleSubmit} style={{ padding: 20 }}><div style={{ marginBottom: 14, position: 'relative' }}><label style={S.fLabel}>Category *</label><input value={catSearch} onChange={(e) => { setCatSearch(e.target.value); setShowCatDrop(true); setForm({ ...form, product_id: '' }); }} onFocus={() => setShowCatDrop(true)} placeholder="Type to search categories by name or SKU..." style={S.fInput} autoComplete="off" /><input type="hidden" value={form.product_id} required />{form.product_id && <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: T.r, background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.25)', fontSize: 12, color: T.ac2 }}>{products.find(p => p.id === form.product_id)?.name} <span style={{ fontFamily: T.mono, opacity: 0.7 }}>{products.find(p => p.id === form.product_id)?.sku}</span><span onClick={() => { setForm({ ...form, product_id: '' }); setCatSearch(''); }} style={{ cursor: 'pointer', marginLeft: 4, opacity: 0.6 }}>✕</span></div>}{showCatDrop && !form.product_id && (() => { const q = catSearch.toLowerCase(); const filtered = products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))); return filtered.length > 0 ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, maxHeight: 180, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>{filtered.map(p => <div key={p.id} onClick={() => { setForm({ ...form, product_id: p.id }); setCatSearch(p.name); setShowCatDrop(false); supabase.from('components').select('*').eq('product_id', p.id).then(({ data }) => { setCatComps(data || []); setMissingComps(new Set()); }); }} style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bd}`, transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.s2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><span style={{ fontSize: 13, color: T.tx }}>{p.name}</span><span style={{ fontSize: 11, fontFamily: T.mono, color: T.tx3 }}>{p.sku}</span></div>)}</div> : catSearch ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, padding: '12px 14px', fontSize: 12, color: T.tx3, zIndex: 10 }}>No categories found</div> : null; })()}</div><div style={{ marginBottom: 14 }}><label style={S.fLabel}>SKU Code</label><input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="e.g. LC-001-A" style={{ ...S.fInput, fontFamily: T.mono }} /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}><div><label style={S.fLabel}>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={S.fInput}><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="dry_clean">Dry Clean</option><option value="complete">Complete</option></select></div><div><label style={S.fLabel}>Location</label><select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={S.fInput}><option value="">Select location</option>{locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select></div></div>{form.status === 'unsorted' && catComps.length > 0 && <div style={{ marginBottom: 14 }}><label style={S.fLabel}>Missing Components <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>(select which are missing)</span></label><div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 10 }}>{catComps.map(c => { const isMissing = missingComps.has(c.id); return <div key={c.id} onClick={() => { const next = new Set(missingComps); if (isMissing) next.delete(c.id); else next.add(c.id); setMissingComps(next); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: T.r, cursor: 'pointer', marginBottom: 4, background: isMissing ? 'rgba(245,166,35,.08)' : 'transparent', border: `1px solid ${isMissing ? 'rgba(245,166,35,.3)' : 'transparent'}`, transition: 'all .12s' }}><div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isMissing ? T.yl : T.bd2}`, background: isMissing ? T.yl : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#000', fontWeight: 700, flexShrink: 0 }}>{isMissing && '✓'}</div><span style={{ fontSize: 13, color: isMissing ? T.yl : T.tx }}>{c.name}</span>{isMissing && <span style={{ fontSize: 10, color: T.yl, marginLeft: 'auto', fontWeight: 600 }}>MISSING</span>}</div>; })}</div>{missingComps.size > 0 && <p style={{ fontSize: 11, color: T.yl, marginTop: 6 }}>{missingComps.size} component{missingComps.size > 1 ? 's' : ''} marked as missing</p>}</div>}<div style={{ marginBottom: 14 }}><label style={S.fLabel}>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" style={S.fInput} /></div>{tags.length > 0 && <div style={{ marginBottom: 14 }}><label style={S.fLabel}>Tags</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{tags.map(t => { const sel = selectedTags.has(t.id); return <span key={t.id} onClick={() => { const next = new Set(selectedTags); if (sel) next.delete(t.id); else next.add(t.id); setSelectedTags(next); }} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: 500, background: sel ? (t.color || T.ac) + '25' : T.s2, color: sel ? (t.color || T.ac) : T.tx3, border: `1px solid ${sel ? (t.color || T.ac) + '50' : T.bd}`, transition: 'all .12s' }}>{t.name}</span>; })}</div></div>}<div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>{selected ? 'Update' : 'Add'}</button></div></form></div></div>)}

      {showCompModal && selected && (<div style={S.modalOverlay}><div style={S.modalBox}><div style={S.modalHead}><div><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>Components</span><p style={{ margin: '4px 0 0', fontSize: 12, color: T.tx3 }}>{selected.products?.name}</p></div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><div style={{ padding: 20 }}><div style={{ background: 'rgba(139,92,246,.06)', border: `1px solid rgba(139,92,246,.2)`, borderRadius: T.r, padding: '10px 14px', fontSize: 12, color: T.ac2, marginBottom: 16 }}>Mark all components as "Present" to auto-complete this item</div>{comps.map((c) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, marginBottom: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: c.status === 'present' ? T.gr : c.status === 'damaged' ? T.re : T.yl }} /><div><p style={{ margin: 0, fontWeight: 500, fontSize: 13, color: T.tx }}>{c.components?.name}</p><p style={{ margin: 0, fontSize: 11, fontFamily: T.mono, color: T.tx3 }}>{c.components?.component_code}{c.components?.is_critical && <span style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 3, fontSize: 9, background: 'rgba(245,87,92,.12)', color: T.re, fontWeight: 600 }}>Critical</span>}</p></div></div>{canEdit && <select value={c.status} onChange={(e) => updateComp(c.id, e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 100, padding: '6px 8px', cursor: 'pointer' }}><option value="missing">Missing</option><option value="present">Present</option><option value="damaged">Damaged</option></select>}</div>))}{comps.length === 0 && <p style={{ textAlign: 'center', color: T.tx3, fontSize: 13, padding: 20 }}>No components</p>}</div></div></div>)}
      {matchResult && (<div style={S.modalOverlay}><div style={{ ...S.modalBox, width: 520 }}><div style={{ ...S.modalHead, background: 'rgba(45,212,160,.06)', borderBottom: `1px solid rgba(45,212,160,.2)` }}><span style={{ fontSize: 15, fontWeight: 600, color: T.gr }}>Pair Match Found!</span><span onClick={() => setMatchResult(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><div style={{ padding: 20 }}>
        <div style={{ background: 'rgba(45,212,160,.08)', border: '1px solid rgba(45,212,160,.25)', borderRadius: T.r, padding: 14, marginBottom: 16, fontSize: 13, color: T.gr }}>
          A complete <strong>{matchResult.categoryName}</strong> can be assembled by combining these two items!
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
  useEffect(() => { fetchCategories(); }, []);
  const fetchComps = async (id: string) => { const { data } = await supabase.from('components').select('*').eq('product_id', id).order('created_at', { ascending: true }); setComps(data || []); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected) {
      const { error } = await supabase.from('products').update({ sku: form.sku, name: form.name, description: form.description, category: form.category }).eq('id', selected.id);
      if (error) { addToast(error.message, 'error'); return; }
      addToast('Updated!', 'success');
    } else {
      const { data, error } = await supabase.from('products').insert({ sku: form.sku, name: form.name, description: form.description, category: form.category, created_by: profile?.id }).select().single();
      if (error || !data) { addToast(error?.message || 'Error', 'error'); return; }
      const validComps = newComps.filter(c => c.trim());
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

  const addCompToExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    const validComps = newComps.filter(c => c.trim());
    if (validComps.length === 0) return;
    const compsToInsert = validComps.map((name, i) => ({ product_id: selected.id, name: name.trim(), component_code: `C${(comps.length || 0) + i + 1}` }));
    const { error } = await supabase.from('components').insert(compsToInsert);
    if (error) { addToast(error.message, 'error'); return; }
    addToast(`${validComps.length} component(s) added!`, 'success');
    setNewComps(['']); fetchComps(selected.id); fetchCategories();
  };

  const deleteComp = async (id: string) => { await supabase.from('components').delete().eq('id', id); addToast('Deleted!', 'success'); fetchComps(selected.id); fetchCategories(); };

  const openEdit = (p: any) => { setSelected(p); setForm({ sku: p.sku || '', name: p.name, description: p.description || '', category: p.category || '' }); setNewComps(['']); setShowModal(true); };
  const openComps = async (p: any) => { setSelected(p); setNewComps(['']); await fetchComps(p.id); setShowCompModal(true); };
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);

  const compInputRow = (val: string, i: number, total: number) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.s3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: T.tx3, fontFamily: T.mono, flexShrink: 0 }}>{i + 1}</span>
      <input value={val} onChange={(e) => updateCompRow(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) addCompRow(); } }} placeholder={i === 0 ? 'e.g. Lehenga' : i === 1 ? 'e.g. Blouse' : i === 2 ? 'e.g. Dupatta' : 'Component name'} style={{ ...S.fInput, flex: 1 }} />
      {total > 1 && <span onClick={() => removeCompRow(i)} style={{ cursor: 'pointer', color: T.re, fontSize: 16, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>✕</span>}
    </div>
  );

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Categories</span>{canEdit && <div onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setNewComps(['']); setShowModal(true); }} style={S.btnPrimary}>+ Add Category</div>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>{categories.map((p) => (<div key={p.id} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '18px 20px', transition: 'border-color .15s, box-shadow .15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = T.bd2; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,.2)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.boxShadow = 'none'; }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div><h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.tx }}>{p.name}</h3><span style={{ fontSize: 11, fontFamily: T.mono, color: T.ac2 }}>{p.sku}</span></div>
          {canEdit && <span onClick={() => openEdit(p)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12 }}>Edit</span>}
        </div>
        {p.description && <p style={{ color: T.tx3, fontSize: 13, margin: '0 0 12px' }}>{p.description}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 0', borderTop: `1px solid ${T.bd}` }}>
          <span style={{ fontSize: 12, color: T.tx3 }}>{p.total_components} component{p.total_components !== 1 ? 's' : ''}</span>
          <span onClick={() => openComps(p)} style={{ ...S.btnPrimary, padding: '5px 14px', fontSize: 12 }}>Manage Components</span>
        </div>
      </div>))}</div>
      {categories.length === 0 && <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 48, textAlign: 'center' }}><p style={{ color: T.tx3, fontSize: 14, marginBottom: 8 }}>No categories yet</p><p style={{ color: T.tx3, fontSize: 12 }}>Add a category like "Lehenga Choli" with components like Lehenga, Blouse, Dupatta</p>{canEdit && <div onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setNewComps(['']); setShowModal(true); }} style={{ ...S.btnPrimary, marginTop: 16, display: 'inline-flex' }}>+ Add First Category</div>}</div>}

      {showModal && (<div style={S.modalOverlay}><div style={{ ...S.modalBox, width: 520 }}><div style={S.modalHead}><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Category</span><span onClick={() => setShowModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><form onSubmit={handleSubmit} style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, marginBottom: 14 }}><div><label style={S.fLabel}>Category Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Lehenga Choli" style={S.fInput} /></div><div><label style={S.fLabel}>SKU *</label><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required placeholder="e.g. LC-01" style={{ ...S.fInput, fontFamily: T.mono }} /></div></div>
        <div style={{ marginBottom: 14 }}><label style={S.fLabel}>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description (optional)" style={S.fInput} /></div>
        {!selected && <>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><label style={{ ...S.fLabel, margin: 0 }}>Components</label><span onClick={addCompRow} style={{ ...S.btnPrimary, padding: '4px 10px', fontSize: 11 }}>+ Add More</span></div>
          <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 12, marginBottom: 14 }}>
            {newComps.map((c, i) => compInputRow(c, i, newComps.length))}
          </div>
        </>}
        <div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>{selected ? 'Update' : 'Add Category'}</button></div>
      </form></div></div>)}

      {showCompModal && selected && (<div style={S.modalOverlay}><div style={{ ...S.modalBox, width: 560 }}><div style={S.modalHead}><div><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>Components of "{selected.name}"</span><p style={{ margin: '4px 0 0', fontSize: 12, color: T.tx3 }}>Manage the individual parts of this category</p></div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><div style={{ padding: 20 }}>
        {canEdit && <form onSubmit={addCompToExisting} style={{ background: T.s2, border: `1px solid ${T.bd}`, padding: 14, borderRadius: T.r, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><p style={{ fontSize: 11, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, margin: 0 }}>Add Components</p><span onClick={addCompRow} style={{ fontSize: 11, color: T.ac, cursor: 'pointer' }}>+ Add More</span></div>
          {newComps.map((c, i) => compInputRow(c, i, newComps.length))}
          <button type="submit" style={{ ...S.btnPrimary, padding: '6px 14px', marginTop: 6 }}>+ Add Component{newComps.filter(c => c.trim()).length > 1 ? 's' : ''}</button>
        </form>}
        {comps.length > 0 && <p style={{ fontSize: 11, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>{comps.length} Component{comps.length !== 1 ? 's' : ''}</p>}
        {comps.map((c, i) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: `1px solid ${T.bd}`, borderRadius: T.r, marginBottom: 6, background: T.s2 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 24, height: 24, borderRadius: '50%', background: T.s3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: T.tx2, fontFamily: T.mono }}>{i + 1}</span><span style={{ fontSize: 14, color: T.tx, fontWeight: 500 }}>{c.name}</span></div>{canEdit && <span onClick={() => deleteComp(c.id)} style={S.btnDanger}>Delete</span>}</div>))}
        {comps.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: T.tx3 }}><p style={{ fontSize: 13 }}>No components yet</p></div>}
      </div></div></div>)}
    </div>
  );
};

const TAG_COLORS = ['#8b5cf6', '#4e8ef7', '#2dd4a0', '#f5a623', '#f5575c', '#ff6b9d', '#06b6d4', '#84cc16'];

const Tags = () => {
  const [tags, setTags] = useState<any[]>([]);
  const [newTag, setNewTag] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);

  const fetchTags = () => { supabase.from('tags').select('*').order('name').then(({ data }) => setTags(data || [])); };
  useEffect(() => { fetchTags(); }, []);

  const addTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    const { error } = await supabase.from('tags').insert({ name: newTag.trim(), color: newColor });
    if (error) addToast(error.message, 'error');
    else { addToast('Tag added!', 'success'); setNewTag(''); setNewColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]); fetchTags(); }
  };

  const updateTag = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from('tags').update({ name: editName.trim(), color: editColor }).eq('id', id);
    if (error) addToast(error.message, 'error');
    else { addToast('Updated!', 'success'); setEditId(null); fetchTags(); }
  };

  const deleteTag = async (id: string) => {
    await supabase.from('item_tags').delete().eq('tag_id', id);
    const { error } = await supabase.from('tags').delete().eq('id', id);
    if (error) addToast(error.message, 'error');
    else { addToast('Deleted!', 'success'); fetchTags(); }
  };

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, marginBottom: 16 }}>Tags</div>
      {canEdit && <form onSubmit={addTag} style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add new tag..." style={{ ...S.fInput, flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>{TAG_COLORS.map(c => <div key={c} onClick={() => setNewColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: newColor === c ? '2px solid #fff' : '2px solid transparent', transition: 'border .1s' }} />)}</div>
        <button type="submit" style={S.btnPrimary}>+ Add</button>
      </form>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map(t => (
          <div key={t.id} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
            {editId === t.id ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') updateTag(t.id); if (e.key === 'Escape') setEditId(null); }} style={{ ...S.fInput, width: 100 }} autoFocus />
                <div style={{ display: 'flex', gap: 3 }}>{TAG_COLORS.map(c => <div key={c} onClick={() => setEditColor(c)} style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', border: editColor === c ? '2px solid #fff' : '2px solid transparent' }} />)}</div>
                <span onClick={() => updateTag(t.id)} style={{ ...S.btnPrimary, padding: '4px 8px', fontSize: 11 }}>Save</span>
              </div>
            ) : (
              <>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: t.color || T.ac, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 500, color: T.tx, flex: 1 }}>{t.name}</span>
                {canEdit && <div style={{ display: 'flex', gap: 4 }}>
                  <span onClick={() => { setEditId(t.id); setEditName(t.name); setEditColor(t.color || T.ac); }} style={{ fontSize: 11, color: T.tx3, cursor: 'pointer' }}>Edit</span>
                  <span onClick={() => deleteTag(t.id)} style={{ fontSize: 11, color: T.re, cursor: 'pointer' }}>Del</span>
                </div>}
              </>
            )}
          </div>
        ))}
      </div>
      {tags.length === 0 && <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 40, textAlign: 'center', color: T.tx3, fontSize: 13 }}>No tags yet. Add tags like "Urgent", "Priority", "Wedding Collection" etc.</div>}
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
  useEffect(() => { fetchLocations(); }, []);

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
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Locations</span>
      </div>
      {canEdit && <form onSubmit={addLocation} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="Add new location..." style={{ ...S.fInput, flex: 1 }} />
        <button type="submit" style={S.btnPrimary}>+ Add</button>
      </form>}
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r }}>
        {locations.map((loc, i) => (
          <div key={loc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < locations.length - 1 ? `1px solid ${T.bd}` : 'none' }}>
            {editId === loc.id ? (
              <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') updateLocation(loc.id); if (e.key === 'Escape') setEditId(null); }} style={{ ...S.fInput, flex: 1 }} autoFocus />
                <span onClick={() => updateLocation(loc.id)} style={{ ...S.btnPrimary, padding: '6px 12px', fontSize: 12 }}>Save</span>
                <span onClick={() => setEditId(null)} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 12 }}>Cancel</span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>📍</span>
                  <span style={{ fontSize: 14, color: T.tx, fontWeight: 500 }}>{loc.name}</span>
                </div>
                {canEdit && <div style={{ display: 'flex', gap: 6 }}>
                  <span onClick={() => { setEditId(loc.id); setEditName(loc.name); }} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 12 }}>Edit</span>
                  <span onClick={() => deleteLocation(loc.id)} style={{ ...S.btnDanger, padding: '4px 10px', fontSize: 12 }}>Delete</span>
                </div>}
              </>
            )}
          </div>
        ))}
        {locations.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 13 }}>No locations yet. Add your first location above.</div>}
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
  useEffect(() => { fetchData(); }, []);

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
  useEffect(() => { supabase.from('activity_logs').select('*, profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(50).then(({ data }) => setLogs(data || [])); }, []);

  const actionTag = (action: string) => {
    const isCreate = action === 'created';
    return { display: 'inline-block' as const, padding: '2px 7px', borderRadius: T.r, fontSize: 10, fontFamily: T.mono, background: isCreate ? 'rgba(45,212,160,.15)' : 'rgba(78,142,247,.15)', color: isCreate ? T.gr : T.bl };
  };

  return (<div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}><div style={{ fontSize: 14, fontWeight: 600, color: T.tx, marginBottom: 16 }}>Activity Log</div><div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r }}>{logs.map((log) => (<div key={log.id} style={{ padding: '12px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: T.s2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{log.action === 'created' ? '➕' : '✏️'}</div><div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 600, fontSize: 13, color: T.tx }}>{log.profiles?.full_name || 'System'}</span><span style={actionTag(log.action)}>{log.action}</span></div><p style={{ margin: '4px 0 0', fontSize: 12, color: T.tx3 }}>{log.description}</p></div></div>))}{logs.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: T.tx3, fontSize: 13 }}>No activity</div>}</div></div>);
};

const Users = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', password: '', role: 'viewer' });
  const [inviteResult, setInviteResult] = useState<{ email: string; password: string } | null>(null);
  const { profile } = useAuth();
  const { addToast } = useNotifications();

  const fetchUsers = () => { supabase.from('profiles').select('*').order('created_at', { ascending: false }).then(({ data }) => setUsers(data || [])); };
  useEffect(() => { fetchUsers(); }, []);

  const updateRole = async (id: string, role: string) => { await supabase.from('profiles').update({ role }).eq('id', id); addToast('Role updated!', 'success'); fetchUsers(); };
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
    // Update role if not default viewer
    if (data.user && inviteForm.role !== 'viewer') {
      await supabase.from('profiles').update({ role: inviteForm.role }).eq('id', data.user.id);
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
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>User Management</span>
        <div onClick={() => setShowInvite(true)} style={S.btnPrimary}>+ Invite User</div>
      </div>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['User', 'Role', 'Status', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} style={{ transition: 'background .1s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <td style={S.tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(u.full_name || u.email || '?')[0].toUpperCase()}</div>
                  <div><p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: T.tx }}>{u.full_name || 'Unnamed'}</p><p style={{ margin: '2px 0 0', fontSize: 12, color: T.tx3 }}>{u.email}</p></div>
                </div>
              </td>
              <td style={S.tdStyle}><select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} disabled={u.id === profile?.id} style={{ ...S.fInput, width: 'auto', minWidth: 110, padding: '6px 10px', cursor: u.id === profile?.id ? 'not-allowed' : 'pointer', opacity: u.id === profile?.id ? 0.5 : 1 }}><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></td>
              <td style={S.tdStyle}><span style={{ padding: '3px 10px', borderRadius: T.r, fontSize: 11, fontWeight: 600, ...(u.is_active ? { background: 'rgba(45,212,160,.12)', color: T.gr } : { background: 'rgba(245,87,92,.12)', color: T.re }) }}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
              <td style={S.tdStyle}>{u.id !== profile?.id && <span onClick={() => toggleActive(u.id, u.is_active)} style={{ padding: '6px 14px', borderRadius: T.r, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: T.sans, display: 'inline-block', ...(u.is_active ? { background: 'rgba(245,87,92,.1)', color: T.re, border: '1px solid rgba(245,87,92,.25)' } : { background: 'rgba(45,212,160,.1)', color: T.gr, border: '1px solid rgba(45,212,160,.25)' }) }}>{u.is_active ? 'Revoke' : 'Grant'}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {showInvite && (<div style={S.modalOverlay}><div style={S.modalBox}>
        <div style={S.modalHead}><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>Invite New User</span><span onClick={closeInvite} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div>
        {inviteResult ? (
          <div style={{ padding: 20 }}>
            <div style={{ background: 'rgba(45,212,160,.08)', border: '1px solid rgba(45,212,160,.25)', borderRadius: T.r, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.gr, margin: '0 0 8px' }}>User invited successfully!</p>
              <p style={{ fontSize: 12, color: T.tx2, margin: 0 }}>Share these credentials with the user:</p>
            </div>
            <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 11, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 4 }}>Email</p>
                <p style={{ fontSize: 14, fontFamily: T.mono, color: T.tx, margin: 0, userSelect: 'all' as const }}>{inviteResult.email}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 4 }}>Password</p>
                <p style={{ fontSize: 14, fontFamily: T.mono, color: T.ac, margin: 0, userSelect: 'all' as const }}>{inviteResult.password}</p>
              </div>
            </div>
            <p style={{ fontSize: 11, color: T.tx3, marginTop: 12, textAlign: 'center' }}>The user should change their password after first login</p>
            <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'flex-end' }}>
              <div onClick={closeInvite} style={S.btnPrimary}>Done</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} style={{ padding: 20 }}>
            <div style={{ marginBottom: 14 }}><label style={S.fLabel}>Full Name *</label><input value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} required placeholder="e.g. Mahesh Dhameliya" style={S.fInput} /></div>
            <div style={{ marginBottom: 14 }}><label style={S.fLabel}>Email *</label><input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required placeholder="user@aryadesigns.co.in" style={S.fInput} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div><label style={S.fLabel}>Password</label><input value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} placeholder="Auto-generate if empty" style={S.fInput} /></div>
              <div><label style={S.fLabel}>Role</label><select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} style={S.fInput}><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="manager">Manager</option><option value="admin">Admin</option></select></div>
            </div>
            <div style={{ background: 'rgba(139,92,246,.06)', border: `1px solid rgba(139,92,246,.2)`, borderRadius: T.r, padding: '10px 14px', fontSize: 12, color: T.ac2, marginBottom: 14 }}>The user will be created with the credentials above. Share the email and password with them so they can sign in.</div>
            <div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <span onClick={closeInvite} style={S.btnGhost}>Cancel</span>
              <button type="submit" disabled={inviting} style={S.btnPrimary}>{inviting ? 'Creating...' : 'Create & Invite'}</button>
            </div>
          </form>
        )}
      </div></div>)}
    </div>
  );
};

const MainApp = () => {
  const [tab, setTab] = useState('dashboard');
  const titles: Record<string, string> = { dashboard: 'Dashboard', inventory: 'Inventory', categories: 'Categories', locations: 'Locations', tags: 'Tags', reports: 'Damage Reports', activity: 'Activity Log', users: 'User Management' };
  return (<div style={{ minHeight: '100vh', background: T.bg, width: '100%' }}><Sidebar activeTab={tab} setActiveTab={setTab} /><div style={{ marginLeft: 230, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}><Header title={titles[tab]} /><main style={{ flex: 1, overflowX: 'hidden' }}>{tab === 'dashboard' && <Dashboard />}{tab === 'inventory' && <Inventory />}{tab === 'categories' && <Categories />}{tab === 'locations' && <Locations />}{tab === 'tags' && <Tags />}{tab === 'reports' && <Reports />}{tab === 'activity' && <Activity />}{tab === 'users' && <Users />}</main></div><ToastContainer /></div>);
};

export default function App() { return <AuthProvider><AppContent /></AuthProvider>; }

const AppContent = () => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: '100vh', width: '100%', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}><div style={{ fontSize: 24, fontWeight: 700, fontFamily: T.mono, letterSpacing: -0.5, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Unsort</div><div className="spinner" /><p style={{ color: T.tx3, fontSize: 11, letterSpacing: 1 }}>LOADING</p></div>;
  if (!user) return <AuthScreen />;
  return <NotificationProvider><MainApp /></NotificationProvider>;
};
