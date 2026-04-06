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
  r: 4, mono: "'IBM Plex Mono', monospace", sans: "'IBM Plex Sans', sans-serif",
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
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
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
  const { profile, signOut } = useAuth();
  const tabs = [{ id: 'dashboard', icon: '📊', label: 'Dashboard' }, { id: 'inventory', icon: '📦', label: 'Inventory' }, { id: 'products', icon: '🏷️', label: 'Products' }, { id: 'reports', icon: '📋', label: 'Reports' }, { id: 'activity', icon: '📜', label: 'Activity' }];
  if (profile?.role === 'admin') tabs.push({ id: 'users', icon: '👥', label: 'Users' });

  return (
    <div style={{ width: 230, height: '100vh', background: T.s, borderRight: `1px solid ${T.bd}`, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 100, overflowY: 'auto' }}>
      <div style={{ padding: 18, borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.ac, fontFamily: T.mono }}>Unsort</div>
        <div style={{ fontSize: 10, color: T.tx3, letterSpacing: 2, textTransform: 'uppercase' as const, marginTop: 2 }}>Product Tracking</div>
      </div>
      <div style={{ fontSize: 10, color: T.tx3, letterSpacing: 2, textTransform: 'uppercase' as const, padding: '12px 16px 5px' }}>Navigation</div>
      <nav style={{ flex: 1, padding: '0 0 10px' }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px', border: 'none', cursor: 'pointer', background: activeTab === t.id ? T.s2 : 'transparent', color: activeTab === t.id ? T.ac : T.tx2, fontSize: 13, fontWeight: 500, fontFamily: T.sans, textAlign: 'left', borderLeft: `3px solid ${activeTab === t.id ? T.ac : 'transparent'}`, transition: 'all .12s' }}>
            <span style={{ width: 16, textAlign: 'center', fontSize: 13 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>
      <div style={{ padding: '14px 16px', borderTop: `1px solid ${T.bd}`, marginTop: 'auto' }}>
        {profile && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.ac, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#000', flexShrink: 0 }}>{(profile.full_name || 'U')[0].toUpperCase()}</div>
          <div><p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: T.tx }}>{profile.full_name}</p><p style={{ margin: 0, fontSize: 10, color: T.tx3, textTransform: 'capitalize' as const }}>{profile.role}</p></div>
        </div>}
        <button onClick={signOut} style={{ width: '100%', padding: '7px 15px', borderRadius: T.r, border: `1px solid ${T.bd2}`, background: 'transparent', color: T.tx2, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: T.sans, transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 5 }}>🚪 Sign Out</button>
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
          <div style={{ position: 'absolute', right: 0, top: 44, width: 300, background: T.s, borderRadius: T.r, boxShadow: '0 10px 40px rgba(0,0,0,.4)', border: `1px solid ${T.bd2}`, zIndex: 50, maxHeight: 400, overflowY: 'auto' }}>
            <div style={{ padding: '13px 17px', borderBottom: `1px solid ${T.bd}`, fontWeight: 600, fontSize: 13, color: T.tx }}>Notifications</div>
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
    const [{ data: summary }, { data: items }] = await Promise.all([
      supabase.from('dashboard_summary').select('*').single(),
      supabase.from('inventory_items').select('*, products(name, sku)').order('created_at', { ascending: false }).limit(5)
    ]);
    if (summary) setStats(summary);
    if (items) setRecent(items);
    setLoading(false);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: T.tx3, fontSize: 13 }}>Loading...</div>;

  const cards = [
    { label: 'PRODUCTS', value: stats.total_products, color: T.ac },
    { label: 'INVENTORY', value: stats.total_inventory, color: T.bl },
    { label: 'DAMAGED', value: stats.damaged_count, color: T.re },
    { label: 'UNSORTED', value: stats.unsorted_count, color: T.yl },
    { label: 'COMPLETE', value: stats.complete_count, color: T.gr },
    { label: 'OPEN REPORTS', value: stats.open_reports, color: '#9b6dff' },
  ];

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 13, marginBottom: 20 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: '15px 17px' }}>
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 7 }}>{c.label}</p>
            <p style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 600, color: c.color, margin: 0 }}>{c.value}</p>
          </div>
        ))}
      </div>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r }}>
        <div style={{ padding: '13px 17px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Recent Items</span>
        </div>
        <div style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: T.s2 }}>{['Product', 'SKU', 'Status'].map(h => <th key={h} style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, padding: '9px 13px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{h}</th>)}</tr></thead>
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

  const fetchData = async () => { const [{ data: inv }, { data: prod }] = await Promise.all([supabase.from('inventory_items').select('*, products(name, sku, total_components)').order('created_at', { ascending: false }), supabase.from('products').select('*').eq('is_active', true)]); setItems(inv || []); setProducts(prod || []); setLoading(false); };

  const fetchComps = async (id: string) => { const { data } = await supabase.from('item_components').select('*, components(name, component_code, is_critical)').eq('inventory_item_id', id); setComps(data || []); };

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); const { error } = selected ? await supabase.from('inventory_items').update(form).eq('id', selected.id) : await supabase.from('inventory_items').insert({ ...form, reported_by: profile?.id }); if (error) addToast(error.message, 'error'); else { addToast(selected ? 'Updated!' : 'Added!', 'success'); setShowModal(false); setSelected(null); setForm({ product_id: '', serial_number: '', batch_number: '', status: 'unsorted', location: '', notes: '' }); fetchData(); } };

  const updateComp = async (id: string, status: string) => { const { error } = await supabase.from('item_components').update({ status }).eq('id', id); if (error) addToast(error.message, 'error'); else { addToast('Updated!', 'success'); fetchComps(selected.id); fetchData(); } };

  const openEdit = (item: any) => { setSelected(item); setForm({ product_id: item.product_id, serial_number: item.serial_number || '', batch_number: item.batch_number || '', status: item.status, location: item.location || '', notes: item.notes || '' }); setShowModal(true); };
  const openComps = async (item: any) => { setSelected(item); await fetchComps(item.id); setShowCompModal(true); };
  const canEdit = profile && ['admin', 'manager', 'operator'].includes(profile.role);
  const filtered = items.filter((i) => filter === 'all' || i.status === filter);

  const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' };
  const modalBox: React.CSSProperties = { background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 12, width: 540, maxWidth: 'calc(100vw - 32px)', maxHeight: '88vh', overflowY: 'auto' };
  const modalHead: React.CSSProperties = { padding: '17px 21px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const fLabel: React.CSSProperties = { fontSize: 11, color: T.tx3, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 1, display: 'block' };
  const fInput: React.CSSProperties = { width: '100%', background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 13, padding: '8px 11px' };
  const btnPrimary: React.CSSProperties = { padding: '7px 15px', borderRadius: T.r, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: T.sans, background: T.ac, color: '#000', display: 'inline-flex', alignItems: 'center', gap: 5 };
  const btnGhost: React.CSSProperties = { ...btnPrimary, background: 'transparent', color: T.tx2, border: `1px solid ${T.bd2}` };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: T.tx3, fontSize: 13 }}>Loading...</div>;

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r }}>
        <span style={{ fontSize: 11, color: T.tx3, whiteSpace: 'nowrap' }}>Status</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...fInput, minWidth: 120, padding: '5px 9px', fontSize: 12, cursor: 'pointer' }}><option value="all">All</option><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="complete">Complete</option></select>
        <div style={{ flex: 1 }} />
        {canEdit && <button onClick={() => { setSelected(null); setForm({ product_id: '', serial_number: '', batch_number: '', status: 'unsorted', location: '', notes: '' }); setShowModal(true); }} style={btnPrimary}>+ Add Item</button>}
      </div>
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: T.s2 }}>{['Product', 'SKU', 'Status', 'Components', 'Actions'].map((h) => <th key={h} style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, padding: '9px 13px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((item) => (<tr key={item.id} style={{ borderBottom: `1px solid ${T.bd}` }}><td style={{ padding: '9px 13px', fontSize: 12, color: T.tx }}>{item.products?.name}</td><td style={{ padding: '9px 13px', fontSize: 12, fontFamily: T.mono, color: T.tx2 }}>{item.products?.sku}</td><td style={{ padding: '9px 13px' }}><span style={statusTag(item.status)}>{item.status}</span></td><td style={{ padding: '9px 13px' }}><button onClick={() => openComps(item)} style={{ color: T.ac, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>View ({item.products?.total_components || 0})</button></td><td style={{ padding: '9px 13px' }}>{canEdit && <button onClick={() => openEdit(item)} style={{ ...btnGhost, padding: '4px 8px', fontSize: 11 }}>Edit</button>}</td></tr>))}</tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No items</div>}
      </div>

      {showModal && (<div style={modalOverlay}><div style={modalBox}><div style={modalHead}><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Item</span><span onClick={() => setShowModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><form onSubmit={handleSubmit} style={{ padding: 21 }}><div style={{ marginBottom: 14 }}><label style={fLabel}>Product *</label><select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} required style={fInput}><option value="">Select</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div style={{ marginBottom: 14 }}><label style={fLabel}>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={fInput}><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="complete">Complete</option></select></div><div style={{ marginBottom: 14 }}><label style={fLabel}>Location</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={fInput} /></div><div style={{ padding: '15px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><button type="button" onClick={() => setShowModal(false)} style={btnGhost}>Cancel</button><button type="submit" style={btnPrimary}>{selected ? 'Update' : 'Add'}</button></div></form></div></div>)}

      {showCompModal && selected && (<div style={modalOverlay}><div style={modalBox}><div style={modalHead}><div><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>Components</span><p style={{ margin: '4px 0 0', fontSize: 11, color: T.tx3 }}>{selected.products?.name}</p></div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><div style={{ padding: 21 }}><div style={{ background: 'rgba(78,142,247,.07)', border: '1px solid rgba(78,142,247,.2)', borderRadius: 6, padding: '9px 13px', fontSize: 12, color: T.tx2, marginBottom: 14 }}>Mark all as Present to auto-complete this item</div>{comps.map((c) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 11px', background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, marginBottom: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: c.status === 'present' ? T.gr : c.status === 'damaged' ? T.re : T.yl }} /><div><p style={{ margin: 0, fontWeight: 500, fontSize: 12, color: T.tx }}>{c.components?.name}</p><p style={{ margin: 0, fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>{c.components?.component_code}{c.components?.is_critical && <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 3, fontSize: 9, background: 'rgba(245,87,92,.15)', color: T.re }}>Critical</span>}</p></div></div>{canEdit && <select value={c.status} onChange={(e) => updateComp(c.id, e.target.value)} style={{ ...fInput, width: 'auto', minWidth: 90, padding: '5px 7px', fontSize: 12, cursor: 'pointer' }}><option value="missing">Missing</option><option value="present">Present</option><option value="damaged">Damaged</option></select>}</div>))}{comps.length === 0 && <p style={{ textAlign: 'center', color: T.tx3, fontSize: 12 }}>No components</p>}</div></div></div>)}
    </div>
  );
};

const Products = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [comps, setComps] = useState<any[]>([]);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [form, setForm] = useState({ sku: '', name: '', description: '', category: '' });
  const [compForm, setCompForm] = useState({ component_code: '', name: '', is_critical: false });

  useEffect(() => { fetchProducts(); }, []);
  const fetchProducts = async () => { const { data } = await supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }); setProducts(data || []); setLoading(false); };
  const fetchComps = async (id: string) => { const { data } = await supabase.from('components').select('*').eq('product_id', id); setComps(data || []); };

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); const { error } = selected ? await supabase.from('products').update(form).eq('id', selected.id) : await supabase.from('products').insert({ ...form, created_by: profile?.id }); if (error) addToast(error.message, 'error'); else { addToast(selected ? 'Updated!' : 'Added!', 'success'); setShowModal(false); setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); fetchProducts(); } };

  const addComp = async (e: React.FormEvent) => { e.preventDefault(); const { error } = await supabase.from('components').insert({ ...compForm, product_id: selected.id }); if (error) addToast(error.message, 'error'); else { addToast('Added!', 'success'); setCompForm({ component_code: '', name: '', is_critical: false }); fetchComps(selected.id); fetchProducts(); } };

  const deleteComp = async (id: string) => { await supabase.from('components').delete().eq('id', id); addToast('Deleted!', 'success'); fetchComps(selected.id); fetchProducts(); };

  const openEdit = (p: any) => { setSelected(p); setForm({ sku: p.sku, name: p.name, description: p.description || '', category: p.category || '' }); setShowModal(true); };
  const openComps = async (p: any) => { setSelected(p); await fetchComps(p.id); setShowCompModal(true); };
  const canEdit = profile && ['admin', 'manager'].includes(profile.role);

  const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' };
  const modalBox: React.CSSProperties = { background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 12, width: 540, maxWidth: 'calc(100vw - 32px)', maxHeight: '88vh', overflowY: 'auto' };
  const modalHead: React.CSSProperties = { padding: '17px 21px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const fLabel: React.CSSProperties = { fontSize: 11, color: T.tx3, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 1, display: 'block' };
  const fInput: React.CSSProperties = { width: '100%', background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 13, padding: '8px 11px' };
  const btnPrimary: React.CSSProperties = { padding: '7px 15px', borderRadius: T.r, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: T.sans, background: T.ac, color: '#000' };
  const btnGhost: React.CSSProperties = { ...btnPrimary, background: 'transparent', color: T.tx2, border: `1px solid ${T.bd2}` };
  const btnDanger: React.CSSProperties = { ...btnPrimary, background: 'rgba(245,87,92,.15)', color: T.re, border: '1px solid rgba(245,87,92,.3)' };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: T.tx3, fontSize: 13 }}>Loading...</div>;

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Products</span>{canEdit && <button onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setShowModal(true); }} style={btnPrimary}>+ Add Product</button>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 13 }}>{products.map((p) => (<div key={p.id} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 15, transition: 'border-color .12s' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><div><h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.tx }}>{p.name}</h3><p style={{ margin: '3px 0 0', color: T.ac, fontSize: 12, fontFamily: T.mono }}>{p.sku}</p></div>{canEdit && <button onClick={() => openEdit(p)} style={{ ...btnGhost, padding: '4px 8px', fontSize: 11 }}>Edit</button>}</div><p style={{ color: T.tx3, fontSize: 12, margin: '0 0 10px' }}>{p.description || 'No description'}</p><button onClick={() => openComps(p)} style={{ color: T.ac, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>Components ({p.total_components})</button></div>))}</div>
      {products.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: T.tx3, fontSize: 12 }}>No products yet</div>}

      {showModal && (<div style={modalOverlay}><div style={modalBox}><div style={modalHead}><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Product</span><span onClick={() => setShowModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><form onSubmit={handleSubmit} style={{ padding: 21 }}><div style={{ marginBottom: 14 }}><label style={fLabel}>SKU *</label><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required style={fInput} /></div><div style={{ marginBottom: 14 }}><label style={fLabel}>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={fInput} /></div><div style={{ marginBottom: 14 }}><label style={fLabel}>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={fInput} /></div><div style={{ padding: '15px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><button type="button" onClick={() => setShowModal(false)} style={btnGhost}>Cancel</button><button type="submit" style={btnPrimary}>{selected ? 'Update' : 'Add'}</button></div></form></div></div>)}

      {showCompModal && selected && (<div style={modalOverlay}><div style={modalBox}><div style={modalHead}><div><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>Components</span><p style={{ margin: '4px 0 0', fontSize: 11, color: T.tx3 }}>{selected.name}</p></div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><div style={{ padding: 21 }}>{canEdit && <form onSubmit={addComp} style={{ background: T.s2, border: `1px solid ${T.bd}`, padding: 14, borderRadius: T.r, marginBottom: 16 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}><input value={compForm.component_code} onChange={(e) => setCompForm({ ...compForm, component_code: e.target.value })} placeholder="Code" required style={{ ...fInput, fontSize: 12 }} /><input value={compForm.name} onChange={(e) => setCompForm({ ...compForm, name: e.target.value })} placeholder="Name" required style={{ ...fInput, fontSize: 12 }} /></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.tx2 }}><input type="checkbox" checked={compForm.is_critical} onChange={(e) => setCompForm({ ...compForm, is_critical: e.target.checked })} /> Critical</label><button type="submit" style={{ ...btnPrimary, padding: '5px 10px', fontSize: 12 }}>Add</button></div></form>}{comps.map((c) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 11px', border: `1px solid ${T.bd}`, borderRadius: T.r, marginBottom: 6, background: T.s2 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 12, color: T.tx }}>{c.name}</span><span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 500, background: 'rgba(155,109,255,.12)', color: '#9b6dff', border: '1px solid rgba(155,109,255,.25)', fontFamily: T.mono }}>{c.component_code}</span>{c.is_critical && <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 9, background: 'rgba(245,87,92,.15)', color: T.re }}>Critical</span>}</div>{canEdit && <button onClick={() => deleteComp(c.id)} style={btnDanger}>Del</button>}</div>))}{comps.length === 0 && <p style={{ textAlign: 'center', color: T.tx3, fontSize: 12 }}>No components</p>}</div></div></div>)}
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
  const fetchData = async () => { const [{ data: rep }, { data: inv }] = await Promise.all([supabase.from('damage_reports').select('*, inventory_items(*, products(name, sku)), profiles:reported_by(full_name)').order('created_at', { ascending: false }), supabase.from('inventory_items').select('*, products(name, sku)').in('status', ['damaged', 'unsorted'])]); setReports(rep || []); setItems(inv || []); setLoading(false); };

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

  const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' };
  const modalBox: React.CSSProperties = { background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 12, width: 540, maxWidth: 'calc(100vw - 32px)', maxHeight: '88vh', overflowY: 'auto' };
  const modalHead: React.CSSProperties = { padding: '17px 21px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const fLabel: React.CSSProperties = { fontSize: 11, color: T.tx3, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 1, display: 'block' };
  const fInput: React.CSSProperties = { width: '100%', background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 13, padding: '8px 11px' };
  const btnPrimary: React.CSSProperties = { padding: '7px 15px', borderRadius: T.r, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: T.sans, background: T.ac, color: '#000' };
  const btnGhost: React.CSSProperties = { ...btnPrimary, background: 'transparent', color: T.tx2, border: `1px solid ${T.bd2}` };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: T.tx3, fontSize: 13 }}>Loading...</div>;

  return (
    <div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Damage Reports</span>{canEdit && <button onClick={() => setShowModal(true)} style={btnPrimary}>+ New Report</button>}</div>
      {reports.map((r) => (<div key={r.id} style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 15, marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><div><span style={{ fontFamily: T.mono, color: T.ac, fontSize: 12 }}>{r.report_number}</span><span style={{ marginLeft: 8, ...reportStatusTag(r.status) }}>{r.status}</span><h3 style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 600, color: T.tx }}>{r.inventory_items?.products?.name}</h3></div>{canEdit && <select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)} style={{ ...fInput, width: 'auto', minWidth: 110, padding: '5px 9px', fontSize: 12, cursor: 'pointer', height: 'fit-content' }}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select>}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}><div><p style={{ margin: 0, color: T.tx3, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1 }}>Type</p><p style={{ margin: '2px 0 0', fontSize: 12, color: T.tx }}>{r.damage_type}</p></div><div><p style={{ margin: 0, color: T.tx3, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1 }}>Cause</p><p style={{ margin: '2px 0 0', fontSize: 12, color: T.tx }}>{r.cause || '-'}</p></div><div><p style={{ margin: 0, color: T.tx3, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1 }}>Est. Loss</p><p style={{ margin: '2px 0 0', fontSize: 12, fontFamily: T.mono, color: T.re }}>{r.estimated_loss ? `₹${r.estimated_loss}` : '-'}</p></div></div></div>))}
      {reports.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: T.tx3, fontSize: 12 }}>No reports</div>}

      {showModal && (<div style={modalOverlay}><div style={modalBox}><div style={modalHead}><span style={{ fontSize: 15, fontWeight: 600, color: T.tx }}>New Report</span><span onClick={() => setShowModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 20, lineHeight: 1 }}>✕</span></div><form onSubmit={handleSubmit} style={{ padding: 21 }}><div style={{ marginBottom: 14 }}><label style={fLabel}>Item *</label><select value={form.inventory_item_id} onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })} required style={fInput}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.products?.name}</option>)}</select></div><div style={{ marginBottom: 14 }}><label style={fLabel}>Damage Type *</label><input value={form.damage_type} onChange={(e) => setForm({ ...form, damage_type: e.target.value })} required style={fInput} /></div><div style={{ marginBottom: 14 }}><label style={fLabel}>Est. Loss (₹)</label><input type="number" value={form.estimated_loss} onChange={(e) => setForm({ ...form, estimated_loss: e.target.value })} style={fInput} /></div><div style={{ padding: '15px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><button type="button" onClick={() => setShowModal(false)} style={btnGhost}>Cancel</button><button type="submit" style={btnPrimary}>Submit</button></div></form></div></div>)}
    </div>
  );
};

const Activity = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const { data } = await supabase.from('activity_logs').select('*, profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(50); setLogs(data || []); setLoading(false); })(); }, []);
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: T.tx3, fontSize: 13 }}>Loading...</div>;

  const actionTag = (action: string) => {
    const isCreate = action === 'created';
    return { display: 'inline-block' as const, padding: '2px 7px', borderRadius: T.r, fontSize: 10, fontFamily: T.mono, background: isCreate ? 'rgba(45,212,160,.15)' : 'rgba(78,142,247,.15)', color: isCreate ? T.gr : T.bl };
  };

  return (<div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}><div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 16 }}>Activity Log</div><div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r }}>{logs.map((log) => (<div key={log.id} style={{ padding: '12px 17px', borderBottom: `1px solid ${T.bd}`, display: 'flex', gap: 11, alignItems: 'flex-start' }}><div style={{ width: 28, height: 28, borderRadius: '50%', background: T.s2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{log.action === 'created' ? '➕' : '✏️'}</div><div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 500, fontSize: 12, color: T.tx }}>{log.profiles?.full_name || 'System'}</span><span style={actionTag(log.action)}>{log.action}</span></div><p style={{ margin: '4px 0 0', fontSize: 11, color: T.tx3 }}>{log.description}</p></div></div>))}{logs.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No activity</div>}</div></div>);
};

const Users = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  useEffect(() => { (async () => { const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setUsers(data || []); setLoading(false); })(); }, []);
  const updateRole = async (id: string, role: string) => { await supabase.from('profiles').update({ role }).eq('id', id); addToast('Updated!', 'success'); const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setUsers(data || []); };
  const toggleActive = async (id: string, isActive: boolean) => { await supabase.from('profiles').update({ is_active: !isActive }).eq('id', id); addToast(isActive ? 'Revoked' : 'Granted', 'success'); const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setUsers(data || []); };
  const fInput: React.CSSProperties = { background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '5px 9px', cursor: 'pointer' };
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: T.tx3, fontSize: 13 }}>Loading...</div>;
  return (<div style={{ padding: '22px 26px', animation: 'fi .18s ease' }}><div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 16 }}>User Management</div><div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: T.r, overflow: 'hidden' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ background: T.s2 }}>{['User', 'Role', 'Status', 'Actions'].map((h) => <th key={h} style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, padding: '9px 13px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{h}</th>)}</tr></thead><tbody>{users.map((u) => (<tr key={u.id} style={{ borderBottom: `1px solid ${T.bd}` }}><td style={{ padding: '9px 13px' }}><p style={{ margin: 0, fontWeight: 500, fontSize: 12, color: T.tx }}>{u.full_name}</p><p style={{ margin: '2px 0 0', fontSize: 11, color: T.tx3 }}>{u.email}</p></td><td style={{ padding: '9px 13px' }}><select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} disabled={u.id === profile?.id} style={fInput}><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></td><td style={{ padding: '9px 13px' }}><span style={{ padding: '2px 8px', borderRadius: T.r, fontSize: 11, fontWeight: 500, ...( u.is_active ? { background: 'rgba(45,212,160,.15)', color: T.gr } : { background: 'rgba(245,87,92,.15)', color: T.re }) }}>{u.is_active ? 'Active' : 'Inactive'}</span></td><td style={{ padding: '9px 13px' }}>{u.id !== profile?.id && <button onClick={() => toggleActive(u.id, u.is_active)} style={{ padding: '5px 10px', borderRadius: T.r, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: T.sans, ...(u.is_active ? { background: 'rgba(245,87,92,.15)', color: T.re } : { background: 'rgba(45,212,160,.15)', color: T.gr }) }}>{u.is_active ? 'Revoke' : 'Grant'}</button>}</td></tr>))}</tbody></table></div></div>);
};

const MainApp = () => {
  const [tab, setTab] = useState('dashboard');
  const titles: Record<string, string> = { dashboard: 'Dashboard', inventory: 'Inventory', products: 'Products', reports: 'Damage Reports', activity: 'Activity Log', users: 'User Management' };
  return (<div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}><Sidebar activeTab={tab} setActiveTab={setTab} /><div style={{ marginLeft: 230, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}><Header title={titles[tab]} /><main style={{ flex: 1, overflowX: 'hidden' }}>{tab === 'dashboard' && <Dashboard />}{tab === 'inventory' && <Inventory />}{tab === 'products' && <Products />}{tab === 'reports' && <Reports />}{tab === 'activity' && <Activity />}{tab === 'users' && <Users />}</main></div><ToastContainer /></div>);
};

export default function App() { return <AuthProvider><AppContent /></AuthProvider>; }

const AppContent = () => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}><div style={{ fontSize: 17, fontWeight: 700, color: T.ac, fontFamily: T.mono, letterSpacing: -0.5 }}>Unsort</div><p style={{ color: T.tx3, fontSize: 12 }}>Loading...</p></div>;
  if (!user) return <AuthScreen />;
  return <NotificationProvider><MainApp /></NotificationProvider>;
};
