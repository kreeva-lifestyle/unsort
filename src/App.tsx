import React, { useState, useEffect, createContext, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ulphprdnswznfztawbvg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 50 }}>
      {toasts.map((t: any) => (
        <div key={t.id} style={{ background: t.type === 'pair_complete' ? '#8b5cf6' : '#3b82f6', color: 'white', padding: '12px 16px', borderRadius: 8, marginBottom: 8 }}>{t.message}</div>
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

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #1e1b4b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 36 }}>📦</div>
          <h1 style={{ fontSize: 36, fontWeight: 'bold', color: 'white', margin: 0 }}>Unsort</h1>
          <p style={{ color: '#c4b5fd', marginTop: 8 }}>Track Damaged and Unsorted Products</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: 32, border: '1px solid rgba(255,255,255,0.2)' }}>
          <div style={{ display: 'flex', marginBottom: 24, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 4 }}>
            <button onClick={() => setIsLogin(true)} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, background: isLogin ? '#8b5cf6' : 'transparent', color: isLogin ? 'white' : '#cbd5e1' }}>Sign In</button>
            <button onClick={() => setIsLogin(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, background: !isLogin ? '#8b5cf6' : 'transparent', color: !isLogin ? 'white' : '#cbd5e1' }}>Sign Up</button>
          </div>
          <form onSubmit={handleSubmit}>
            {!isLogin && <input type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required style={{ width: '100%', padding: 12, marginBottom: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: 16, boxSizing: 'border-box' }} />}
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: 12, marginBottom: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: 16, boxSizing: 'border-box' }} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: 12, marginBottom: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: 16, boxSizing: 'border-box' }} />
            {error && <p style={{ color: '#fca5a5', fontSize: 14, margin: '0 0 12px' }}>{error}</p>}
            <button type="submit" disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>{loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}</button>
          </form>
        </div>
        <p style={{ textAlign: 'center', color: 'rgba(196,181,253,0.6)', fontSize: 14, marginTop: 24 }}>Powered by Arya Designs</p>
      </div>
    </div>
  );
};

const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) => {
  const { profile, signOut } = useAuth();
  const tabs = [{ id: 'dashboard', icon: '📊', label: 'Dashboard' }, { id: 'inventory', icon: '📦', label: 'Inventory' }, { id: 'products', icon: '🏷️', label: 'Products' }, { id: 'reports', icon: '📋', label: 'Reports' }, { id: 'activity', icon: '📜', label: 'Activity' }];
  if (profile?.role === 'admin') tabs.push({ id: 'users', icon: '👥', label: 'Users' });

  return (
    <div style={{ width: 220, background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ padding: 20, borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📦</div>
        <span style={{ fontWeight: 'bold', fontSize: 18 }}>Unsort</span>
      </div>
      <nav style={{ flex: 1, padding: 8 }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 4, borderRadius: 8, border: 'none', cursor: 'pointer', background: activeTab === t.id ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : 'transparent', color: activeTab === t.id ? 'white' : '#94a3b8', fontSize: 14, textAlign: 'left' }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>
      <div style={{ padding: 16, borderTop: '1px solid #1e293b' }}>
        {profile && <div style={{ marginBottom: 12 }}><p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{profile.full_name}</p><p style={{ margin: 0, fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{profile.role}</p></div>}
        <button onClick={signOut} style={{ width: '100%', padding: 10, borderRadius: 8, border: 'none', background: '#1e293b', color: 'white', cursor: 'pointer', fontSize: 14 }}>🚪 Sign Out</button>
      </div>
    </div>
  );
};

const Header = ({ title }: { title: string }) => {
  const { notifications, markAsRead } = useNotifications();
  const [show, setShow] = useState(false);
  const unread = notifications.filter((n: any) => !n.is_read).length;

  return (
    <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#1e293b' }}>{title}</h1>
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShow(!show)} style={{ padding: 10, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', position: 'relative' }}>
          🔔 {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, background: '#8b5cf6', color: 'white', borderRadius: '50%', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>}
        </button>
        {show && (
          <div style={{ position: 'absolute', right: 0, top: 48, width: 300, background: 'white', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', zIndex: 50, maxHeight: 400, overflowY: 'auto' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>Notifications</div>
            {notifications.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No notifications</div> : notifications.slice(0, 10).map((n: any) => (
              <div key={n.id} onClick={() => markAsRead(n.id)} style={{ padding: 12, borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: n.is_read ? 'white' : '#f5f3ff' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{n.title}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{n.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
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

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>Loading...</div>;

  const cards = [
    { label: 'Products', value: stats.total_products, icon: '🏷️', color: '#8b5cf6' },
    { label: 'Inventory', value: stats.total_inventory, icon: '📦', color: '#3b82f6' },
    { label: 'Damaged', value: stats.damaged_count, icon: '⚠️', color: '#ef4444' },
    { label: 'Unsorted', value: stats.unsorted_count, icon: '❓', color: '#f59e0b' },
    { label: 'Complete', value: stats.complete_count, icon: '✅', color: '#10b981' },
    { label: 'Reports', value: stats.open_reports, icon: '📋', color: '#a855f7' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 24 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ width: 40, height: 40, background: c.color, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: 20 }}>{c.icon}</div>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 'bold', color: '#1e293b' }}>{c.value}</p>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>{c.label}</p>
          </div>
        ))}
      </div>
      <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Recent Items</h3>
        {recent.map((item) => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div><p style={{ margin: 0, fontWeight: 500 }}>{item.products?.name}</p><p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{item.products?.sku}</p></div>
            <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: item.status === 'complete' ? '#d1fae5' : item.status === 'damaged' ? '#fee2e2' : '#fef3c7', color: item.status === 'complete' ? '#065f46' : item.status === 'damaged' ? '#991b1b' : '#92400e' }}>{item.status}</span>
          </div>
        ))}
        {recent.length === 0 && <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>No items yet</p>}
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

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>Loading...</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}><option value="all">All</option><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="complete">Complete</option></select>
        {canEdit && <button onClick={() => { setSelected(null); setForm({ product_id: '', serial_number: '', batch_number: '', status: 'unsorted', location: '', notes: '' }); setShowModal(true); }} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: 'white', cursor: 'pointer', fontWeight: 600 }}>+ Add Item</button>}
      </div>
      <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f8fafc' }}><tr>{['Product', 'SKU', 'Status', 'Components', 'Actions'].map((h) => <th key={h} style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#64748b' }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((item) => (<tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: 14 }}>{item.products?.name}</td><td style={{ padding: 14, color: '#64748b' }}>{item.products?.sku}</td><td style={{ padding: 14 }}><span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: item.status === 'complete' ? '#d1fae5' : item.status === 'damaged' ? '#fee2e2' : '#fef3c7' }}>{item.status}</span></td><td style={{ padding: 14 }}><button onClick={() => openComps(item)} style={{ color: '#8b5cf6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>View ({item.products?.total_components || 0})</button></td><td style={{ padding: 14 }}>{canEdit && <button onClick={() => openEdit(item)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>Edit</button>}</td></tr>))}</tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No items</div>}
      </div>

      {showModal && (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}><div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 400, maxHeight: '90vh', overflow: 'auto' }}><div style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}><h2 style={{ margin: 0, fontSize: 18 }}>{selected ? 'Edit' : 'Add'} Item</h2><button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button></div><form onSubmit={handleSubmit} style={{ padding: 20 }}><div style={{ marginBottom: 16 }}><label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Product *</label><select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} required style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}><option value="">Select</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="complete">Complete</option></select></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>Location</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }} /></div><div style={{ display: 'flex', gap: 12 }}><button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>Cancel</button><button type="submit" style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', background: '#8b5cf6', color: 'white', cursor: 'pointer' }}>{selected ? 'Update' : 'Add'}</button></div></form></div></div>)}

      {showCompModal && selected && (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}><div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 400, maxHeight: '90vh', overflow: 'auto' }}><div style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}><div><h2 style={{ margin: 0, fontSize: 18 }}>Components</h2><p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{selected.products?.name}</p></div><button onClick={() => setShowCompModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button></div><div style={{ padding: 20 }}><div style={{ background: '#f5f3ff', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#5b21b6' }}>💡 Mark all as Present to complete!</div>{comps.map((c) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: '#f8fafc', borderRadius: 8, marginBottom: 8 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: c.status === 'present' ? '#10b981' : c.status === 'damaged' ? '#ef4444' : '#f59e0b' }} /><div><p style={{ margin: 0, fontWeight: 500 }}>{c.components?.name}</p><p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{c.components?.component_code}</p></div></div>{canEdit && <select value={c.status} onChange={(e) => updateComp(c.id, e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}><option value="missing">Missing</option><option value="present">Present</option><option value="damaged">Damaged</option></select>}</div>))}{comps.length === 0 && <p style={{ textAlign: 'center', color: '#64748b' }}>No components</p>}</div></div></div>)}
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

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>Loading...</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}><h2 style={{ margin: 0, fontSize: 18 }}>Products</h2>{canEdit && <button onClick={() => { setSelected(null); setForm({ sku: '', name: '', description: '', category: '' }); setShowModal(true); }} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: 'white', cursor: 'pointer' }}>+ Add Product</button>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>{products.map((p) => (<div key={p.id} style={{ background: 'white', borderRadius: 12, padding: 20 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><div><h3 style={{ margin: 0, fontSize: 16 }}>{p.name}</h3><p style={{ margin: '4px 0 0', color: '#8b5cf6', fontSize: 14 }}>{p.sku}</p></div>{canEdit && <button onClick={() => openEdit(p)} style={{ padding: 6, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>✏️</button>}</div><p style={{ color: '#64748b', fontSize: 14, margin: '0 0 12px' }}>{p.description || 'No description'}</p><button onClick={() => openComps(p)} style={{ color: '#8b5cf6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>🔧 {p.total_components} components</button></div>))}</div>
      {products.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>No products yet</div>}

      {showModal && (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}><div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 400 }}><div style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>{selected ? 'Edit' : 'Add'} Product</h2><button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button></div><form onSubmit={handleSubmit} style={{ padding: 20 }}><div style={{ marginBottom: 16 }}><label style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>SKU *</label><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }} /></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }} /></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }} /></div><div style={{ display: 'flex', gap: 12 }}><button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>Cancel</button><button type="submit" style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', background: '#8b5cf6', color: 'white', cursor: 'pointer' }}>{selected ? 'Update' : 'Add'}</button></div></form></div></div>)}

      {showCompModal && selected && (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}><div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 400, maxHeight: '90vh', overflow: 'auto' }}><div style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}><div><h2 style={{ margin: 0 }}>Components</h2><p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{selected.name}</p></div><button onClick={() => setShowCompModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button></div><div style={{ padding: 20 }}>{canEdit && <form onSubmit={addComp} style={{ background: '#f8fafc', padding: 16, borderRadius: 8, marginBottom: 20 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}><input value={compForm.component_code} onChange={(e) => setCompForm({ ...compForm, component_code: e.target.value })} placeholder="Code" required style={{ padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} /><input value={compForm.name} onChange={(e) => setCompForm({ ...compForm, name: e.target.value })} placeholder="Name" required style={{ padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }} /></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={compForm.is_critical} onChange={(e) => setCompForm({ ...compForm, is_critical: e.target.checked })} /> Critical</label><button type="submit" style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#8b5cf6', color: 'white', cursor: 'pointer' }}>Add</button></div></form>}{comps.map((c) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>{c.name}</span><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#f1f5f9' }}>{c.component_code}</span>{c.is_critical && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#fee2e2', color: '#991b1b' }}>Critical</span>}</div>{canEdit && <button onClick={() => deleteComp(c.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}>🗑️</button>}</div>))}{comps.length === 0 && <p style={{ textAlign: 'center', color: '#64748b' }}>No components</p>}</div></div></div>)}
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

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>Loading...</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}><h2 style={{ margin: 0, fontSize: 18 }}>Damage Reports</h2>{canEdit && <button onClick={() => setShowModal(true)} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: 'white', cursor: 'pointer' }}>+ New Report</button>}</div>
      {reports.map((r) => (<div key={r.id} style={{ background: 'white', borderRadius: 12, padding: 20, marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><div><span style={{ fontFamily: 'monospace', color: '#8b5cf6', fontSize: 14 }}>{r.report_number}</span><span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 12, fontSize: 11, background: r.status === 'open' ? '#fee2e2' : '#d1fae5', color: r.status === 'open' ? '#991b1b' : '#065f46' }}>{r.status}</span><h3 style={{ margin: '8px 0 0', fontSize: 15 }}>{r.inventory_items?.products?.name}</h3></div>{canEdit && <select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, height: 'fit-content' }}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select>}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12, fontSize: 14 }}><div><p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Type</p><p style={{ margin: '2px 0 0' }}>{r.damage_type}</p></div><div><p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Cause</p><p style={{ margin: '2px 0 0' }}>{r.cause || '-'}</p></div><div><p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Est. Loss</p><p style={{ margin: '2px 0 0' }}>{r.estimated_loss ? `₹${r.estimated_loss}` : '-'}</p></div></div></div>))}
      {reports.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>No reports</div>}

      {showModal && (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}><div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 400 }}><div style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>New Report</h2><button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button></div><form onSubmit={handleSubmit} style={{ padding: 20 }}><div style={{ marginBottom: 16 }}><label style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>Item *</label><select value={form.inventory_item_id} onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })} required style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.products?.name}</option>)}</select></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>Damage Type *</label><input value={form.damage_type} onChange={(e) => setForm({ ...form, damage_type: e.target.value })} required style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }} /></div><div style={{ marginBottom: 16 }}><label style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>Est. Loss (₹)</label><input type="number" value={form.estimated_loss} onChange={(e) => setForm({ ...form, estimated_loss: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }} /></div><div style={{ display: 'flex', gap: 12 }}><button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>Cancel</button><button type="submit" style={{ flex: 1, padding: 12, borderRadius: 8, border: 'none', background: '#8b5cf6', color: 'white', cursor: 'pointer' }}>Submit</button></div></form></div></div>)}
    </div>
  );
};

const Activity = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { const { data } = await supabase.from('activity_logs').select('*, profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(50); setLogs(data || []); setLoading(false); })(); }, []);
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>Loading...</div>;
  return (<div style={{ padding: 24 }}><h2 style={{ margin: '0 0 20px', fontSize: 18 }}>Activity Log</h2><div style={{ background: 'white', borderRadius: 12 }}>{logs.map((log) => (<div key={log.id} style={{ padding: 16, borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12 }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{log.action === 'created' ? '➕' : '✏️'}</div><div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 500 }}>{log.profiles?.full_name || 'System'}</span><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: log.action === 'created' ? '#d1fae5' : '#dbeafe' }}>{log.action}</span></div><p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{log.description}</p></div></div>))}{logs.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No activity</div>}</div></div>);
};

const Users = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  useEffect(() => { (async () => { const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setUsers(data || []); setLoading(false); })(); }, []);
  const updateRole = async (id: string, role: string) => { await supabase.from('profiles').update({ role }).eq('id', id); addToast('Updated!', 'success'); const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setUsers(data || []); };
  const toggleActive = async (id: string, isActive: boolean) => { await supabase.from('profiles').update({ is_active: !isActive }).eq('id', id); addToast(isActive ? 'Revoked' : 'Granted', 'success'); const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setUsers(data || []); };
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>Loading...</div>;
  return (<div style={{ padding: 24 }}><h2 style={{ margin: '0 0 20px', fontSize: 18 }}>User Management</h2><div style={{ background: 'white', borderRadius: 12, overflow: 'hidden' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead style={{ background: '#f8fafc' }}><tr>{['User', 'Role', 'Status', 'Actions'].map((h) => <th key={h} style={{ padding: 14, textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#64748b' }}>{h}</th>)}</tr></thead><tbody>{users.map((u) => (<tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: 14 }}><p style={{ margin: 0, fontWeight: 500 }}>{u.full_name}</p><p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{u.email}</p></td><td style={{ padding: 14 }}><select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)} disabled={u.id === profile?.id} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}><option value="admin">Admin</option><option value="manager">Manager</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></td><td style={{ padding: 14 }}><span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 12, background: u.is_active ? '#d1fae5' : '#fee2e2', color: u.is_active ? '#065f46' : '#991b1b' }}>{u.is_active ? 'Active' : 'Inactive'}</span></td><td style={{ padding: 14 }}>{u.id !== profile?.id && <button onClick={() => toggleActive(u.id, u.is_active)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: u.is_active ? '#fee2e2' : '#d1fae5', color: u.is_active ? '#991b1b' : '#065f46' }}>{u.is_active ? 'Revoke' : 'Grant'}</button>}</td></tr>))}</tbody></table></div></div>);
};

const MainApp = () => {
  const [tab, setTab] = useState('dashboard');
  const titles: Record<string, string> = { dashboard: 'Dashboard', inventory: 'Inventory', products: 'Products', reports: 'Damage Reports', activity: 'Activity Log', users: 'User Management' };
  return (<div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}><Sidebar activeTab={tab} setActiveTab={setTab} /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}><Header title={titles[tab]} /><main style={{ flex: 1, overflow: 'auto' }}>{tab === 'dashboard' && <Dashboard />}{tab === 'inventory' && <Inventory />}{tab === 'products' && <Products />}{tab === 'reports' && <Reports />}{tab === 'activity' && <Activity />}{tab === 'users' && <Users />}</main></div><ToastContainer /></div>);
};

export default function App() { return <AuthProvider><AppContent /></AuthProvider>; }

const AppContent = () => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}><div style={{ width: 64, height: 64, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📦</div><p style={{ color: '#c4b5fd' }}>Loading Unsort...</p></div>;
  if (!user) return <AuthScreen />;
  return <NotificationProvider><MainApp /></NotificationProvider>;
};
