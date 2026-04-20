import React, { useState, useEffect, Component } from 'react';

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
import BrandTagPrinter from './BrandTagPrinter';
import PackTime from './PackTime';
import CashChallan from './CashChallan';
import Login from './pages/Login';
import SettingsPage from './pages/Settings';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import BarcodeScanner from './components/ui/BarcodeScanner';
import SidebarComponent from './components/layout/Sidebar';
import HeaderComponent from './components/layout/Header';
import ToastContainerComponent from './components/layout/ToastContainer';
import { supabase } from './lib/supabase';
import { T, Icon } from './lib/theme';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { NotificationProvider, useNotifications } from './hooks/useNotifications';

const VALID_TABS = ['dashboard', 'inventory', 'brandtag', 'packtime', 'challan', 'settings'];
const getTabFromHash = () => {
  const h = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return VALID_TABS.includes(h) ? h : 'dashboard';
};

const MainApp = () => {
  const { profile } = useAuth();
  const { addToast, notifications, markAsRead, toasts } = useNotifications();
  const [tab, setTabState] = useState(getTabFromHash);
  const [globalSearch, setGlobalSearch] = useState('');
  const [notifItemId, setNotifItemId] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mounted, setMounted] = useState<Set<string>>(new Set([getTabFromHash()]));

  // Central navigate — updates URL + state
  const setTab = (t: string) => {
    if (!VALID_TABS.includes(t)) t = 'dashboard';
    // Settings is open to everyone — My Profile tab (Phone + Cash PIN) is required for operators too.
    if (t === 'settings' && !profile) t = 'dashboard';
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
  const titles: Record<string, string> = { dashboard: 'Dashboard', inventory: 'Inventory', brandtag: 'Brand Tags', packtime: 'PackStation', challan: 'Cash Challan', settings: 'Settings' };
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
    {/* Ambient glows are static CSS (see .app-glows in index.css) — not React children so
        they don't re-render on tab change (audit P3 performance) */}
    <div className="app-glows" aria-hidden="true" />
    <SidebarComponent activeTab={tab} setActiveTab={(t) => { setTab(t); setGlobalSearch(''); setNotifItemId(null); setMobileMenu(false); }} profile={profile} />
    {/* Mobile overlay */}
    <div className="mobile-overlay" onClick={() => setMobileMenu(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 98, opacity: mobileMenu ? 1 : 0, pointerEvents: mobileMenu ? 'auto' : 'none', transition: 'opacity .25s ease', backdropFilter: 'blur(2px)' }} />
    {/* Mobile sidebar drawer */}
    <div className="mobile-drawer" style={{ display: 'none', position: 'fixed', top: 0, left: 0, width: 260, height: '100vh', zIndex: 101, transform: mobileMenu ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .3s cubic-bezier(.4,0,.2,1)', boxShadow: mobileMenu ? '4px 0 24px rgba(0,0,0,.4)' : 'none' }}>
      <SidebarComponent activeTab={tab} setActiveTab={(t) => { setTab(t); setGlobalSearch(''); setNotifItemId(null); setMobileMenu(false); }} profile={profile} />
    </div>
    <div className="main-area" style={{ marginLeft: 220, display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: '100vw' }}>
      {/* Mobile bottom nav */}
      <div className="mobile-hamburger" style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 102, background: T.s, borderTop: `1px solid ${T.bd}`, padding: '8px 0', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', justifyContent: 'space-around' }}>
        {[{ id: 'dashboard', icon: 'grid', label: 'Home' }, { id: 'inventory', icon: 'box', label: 'Inventory' }, { id: 'packtime', icon: 'scan', label: 'PackStation' }, { id: 'challan', icon: 'file', label: 'Challan' }].map(t => (
          <div key={t.id} onClick={() => { setTab(t.id); setMobileMenu(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '2px 16px', color: tab === t.id ? T.ac : T.tx3, fontSize: 9, fontWeight: 500 }}>
            <Icon name={t.icon} size={20} /><span>{t.label}</span>
          </div>
        ))}
        {/* More — opens full sidebar drawer for Brand Tags / Settings / anything else */}
        <div onClick={() => setMobileMenu(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '2px 16px', color: mobileMenu ? T.ac : T.tx3, fontSize: 9, fontWeight: 500 }}>
          <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
          <span>More</span>
        </div>
      </div>
      <HeaderComponent title={titles[tab]} onSearch={handleGlobalSearch} onNotifClick={handleNotifClick} onOpenScanner={() => { setScanError(''); setScannerOpen(true); }} notifications={notifications} markAsRead={markAsRead} />
      <main style={{ flex: 1, overflow: 'auto' }}>
        {mounted.has('dashboard') && <div style={{ display: tab === 'dashboard' ? 'block' : 'none' }}><Dashboard navigateTo={setTab} /></div>}
        {mounted.has('inventory') && <div style={{ display: tab === 'inventory' ? 'block' : 'none' }}><Inventory globalSearch={globalSearch} openItemId={notifItemId} onItemOpened={() => setNotifItemId(null)} active={tab === 'inventory'} /></div>}

        {mounted.has('brandtag') && <div style={{ display: tab === 'brandtag' ? 'block' : 'none' }}><BrandTagPrinter /></div>}
        {mounted.has('packtime') && <div style={{ display: tab === 'packtime' ? 'block' : 'none' }}><PackTime active={tab === 'packtime'} /></div>}
        {mounted.has('challan') && <div style={{ display: tab === 'challan' ? 'block' : 'none' }}><CashChallan active={tab === 'challan'} /></div>}
        {mounted.has('settings') && <div style={{ display: tab === 'settings' ? 'block' : 'none' }}><SettingsPage profile={profile} addToast={addToast} /></div>}
      </main>
    </div>
    <ToastContainerComponent toasts={toasts} />
    {scannerOpen && <BarcodeScanner onScan={handleScan} onClose={() => setScannerOpen(false)} scanError={scanError} />}
  </div>);
};

export default function App() { return <ErrorBoundary><AuthProvider><AppContent /></AuthProvider></ErrorBoundary>; }

const AppContent = () => {
  const auth = useAuth();
  if (!auth?.ready && auth?.loading) return <div style={{ minHeight: '100vh', width: '100%', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}><div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.sora, letterSpacing: -0.5, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Unsort</div><div className="spinner" /><p style={{ color: T.tx3, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' }}>LOADING</p></div>;
  if (!auth?.user) return <Login signIn={auth.signIn} />;
  return <NotificationProvider><MainApp /></NotificationProvider>;
};
