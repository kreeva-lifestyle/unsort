import React, { useState, useEffect, Component, Suspense, lazy } from 'react';

// Preload logo immediately for short-link pages — fires before React renders anything,
// so the 474KB PNG downloads in parallel with JS chunk evaluation.
if (window.location.hash.startsWith('#/s/')) {
  const _lnk = document.createElement('link');
  _lnk.rel = 'preload'; _lnk.as = 'image'; _lnk.href = '/arya-designs-logo.png';
  document.head.appendChild(_lnk);
}

// Error boundary to prevent blank screen crashes
class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    logError(error, 'boundary', { componentStack: errorInfo.componentStack || undefined });
  }
  render() {
    if (this.state.error) return <div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 14, padding: 20, position: 'relative' }}>
      <div style={{ position: 'absolute', top: '30%', left: '40%', width: 300, height: 300, background: `radial-gradient(circle, ${T.ac3} 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, background: T.s, backdropFilter: 'blur(24px)', border: `1px solid ${T.bd}`, borderRadius: T.rXl, padding: '28px 32px', textAlign: 'center' as const, maxWidth: 380, boxShadow: '0 16px 48px rgba(0,0,0,.4)' }}>
        <p style={{ color: T.tx, fontSize: 14, fontWeight: 600, fontFamily: T.sora, marginBottom: 6 }}>Something went wrong</p>
        <p style={{ color: T.tx3, fontSize: 11, marginBottom: 16, lineHeight: 1.5 }}>{this.state.error instanceof Error ? this.state.error.message : String(this.state.error)}</p>
        <button onClick={() => window.location.reload()} style={{ ...S.btnPrimary, padding: '7px 18px', fontSize: 11 }}>Reload</button>
      </div>
    </div>;
    return this.props.children;
  }
}

// Chunk-load failures: a fresh deploy renames hashed chunks, so a stale tab
// 404s on navigation — one auto-reload fixes that. But offline (or with a
// broken deploy) the reload fails the same way forever, looping the page with
// no explanation. The 30s guard turns repeat failures into a real screen.
const ChunkErrorScreen = () => (
  <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <div style={{ textAlign: 'center', maxWidth: 360 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Couldn't load this page</div>
      <p style={{ color: T.tx3, fontSize: 11, marginBottom: 16, lineHeight: 1.5 }}>Check your internet connection, then reload. If it keeps happening, a new version may still be deploying — wait a minute and try again.</p>
      <button onClick={() => window.location.reload()} style={{ ...S.btnPrimary, padding: '7px 18px', fontSize: 11 }}>Reload</button>
    </div>
  </div>
);
const retryImport = (fn: () => Promise<any>) => lazy(() =>
  fn().catch(() => {
    let last = 0;
    try { last = Number(sessionStorage.getItem('chunkReloadedAt')) || 0; } catch {}
    if (Date.now() - last > 30_000) {
      try { sessionStorage.setItem('chunkReloadedAt', String(Date.now())); } catch {}
      window.location.reload();
      return new Promise<never>(() => {});
    }
    return { default: ChunkErrorScreen };
  })
);

const BrandTagPrinter = retryImport(() => import('./pages/BrandTags'));
const PackTime = retryImport(() => import('./pages/PackTime'));
const CashChallan = retryImport(() => import('./pages/CashChallan'));
const PurchaseOrders = retryImport(() => import('./pages/PurchaseOrders'));
const Attendance = retryImport(() => import('./pages/Attendance'));
const SettingsPage = retryImport(() => import('./pages/Settings'));
const Inventory = retryImport(() => import('./pages/Inventory'));
const ProgramsModule = retryImport(() => import('./modules/programs'));
const Minis = retryImport(() => import('./pages/Minis'));
const PrintStation = retryImport(() => import('./pages/PrintStation'));
const LazyPublicShareView = retryImport(() => import('./modules/programs/PublicShareView'));
const LazyTracklyRedirect = retryImport(() => import('./components/minis/TracklyRedirect'));
const LazyPasswordReset = retryImport(() => import('./pages/PasswordReset'));
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SidebarComponent from './components/layout/Sidebar';
import HeaderComponent from './components/layout/Header';
import ToastContainerComponent from './components/layout/ToastContainer';
import OfflineBar from './components/ui/OfflineBar';
import { T, S, Icon } from './lib/theme';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { NotificationProvider, useNotifications } from './hooks/useNotifications';
import { BreadcrumbProvider } from './hooks/useBreadcrumb';

import { TAB_IDS, canAccessTab, getFirstAllowedTab } from './lib/tabs';
import { initGlobalPrintMode } from './lib/printQueue';
import { logError } from './lib/errorLogger';
const getTabFromHash = () => {
  const h = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return (TAB_IDS as readonly string[]).includes(h) ? h : 'dashboard';
};

const MainApp = () => {
  const { profile } = useAuth();
  const { addToast, notifications, markAsRead, toasts } = useNotifications();
  const [tab, setTabState] = useState(getTabFromHash);
  const [notifItemId, setNotifItemId] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mounted, setMounted] = useState<Set<string>>(new Set([getTabFromHash()]));

  const checkTab = (t: string) => canAccessTab(profile?.role, t, profile?.module_access);

  // Central navigate — updates URL + state
  const fallback = () => getFirstAllowedTab(profile?.role, profile?.module_access);
  const setTab = (t: string) => {
    if (!(TAB_IDS as readonly string[]).includes(t)) t = fallback();
    if (!checkTab(t)) t = fallback();
    const newHash = `#/${t}`;
    if (window.location.hash !== newHash) window.history.pushState(null, '', newHash);
    setTabState(t);
  };

  // Browser back/forward support
  useEffect(() => {
    const onPop = () => { const t = getTabFromHash(); setTabState(checkTab(t) ? t : fallback()); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [profile]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') { document.querySelector<HTMLElement>('.modal-inner span[style*="cursor: pointer"]')?.click(); return; }
      if (mod && e.key === 'f') { e.preventDefault(); document.querySelector<HTMLInputElement>('input[type="text"][placeholder*="earch"], input[type="search"]')?.focus(); return; }
      if (mod && e.key === 'n') { e.preventDefault(); document.querySelector<HTMLElement>('.fab')?.click(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ensure initial hash exists so back button has something to pop
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', `#/${tab}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect to dashboard if current tab became unauthorized after profile loads
  useEffect(() => { if (profile && !checkTab(tab)) setTab(fallback()); }, [profile]);

  // Load the global print mode (shared across all users) + keep it live
  useEffect(() => { if (!profile) return; return initGlobalPrintMode(); }, [profile]);

  // Lazy mount: only mount a page once its tab is selected
  useEffect(() => { setMounted(prev => { if (prev.has(tab)) return prev; const next = new Set(prev); next.add(tab); return next; }); }, [tab]);
  const titles: Record<string, string> = { dashboard: 'Dashboard', inventory: 'Inventory', brandtag: 'Brand Tags', packtime: 'PackStation', challan: 'Cash Challan', purchaseorders: 'Purchase Orders', programs: 'Programs', minis: 'Minis', printstation: 'Print Station', settings: 'Settings' };
  const handleNotifClick = (n: any) => {
    if (n.entity_id) { setTab('inventory'); setNotifItemId(n.entity_id); }
  };
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { const v = localStorage.getItem('sidebarOpen'); return v === null ? true : v === '1'; } catch { return true; }
  });
  useEffect(() => { try { localStorage.setItem('sidebarOpen', sidebarOpen ? '1' : '0'); } catch { /* private mode */ } }, [sidebarOpen]);

  return (<div style={{ minHeight: '100dvh', background: T.bg, width: '100%', overflowX: 'hidden', position: 'relative' }}>
    <div className="app-glows" aria-hidden="true" />
    <SidebarComponent activeTab={tab} setActiveTab={(t) => { setTab(t); setNotifItemId(null); setMobileMenu(false); }} profile={profile} collapsed={!sidebarOpen} />
    {/* Mobile overlay */}
    <div className="mobile-overlay" onClick={() => setMobileMenu(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 98, opacity: mobileMenu ? 1 : 0, pointerEvents: mobileMenu ? 'auto' : 'none', transition: 'opacity .25s ease', backdropFilter: 'blur(2px)' }} />
    {/* Mobile sidebar drawer */}
    <div className="mobile-drawer" style={{ display: 'none', position: 'fixed', top: 0, left: 0, width: 260, height: 'calc(100dvh - 60px)', zIndex: 101, transform: mobileMenu ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .3s cubic-bezier(.4,0,.2,1)', boxShadow: mobileMenu ? '4px 0 24px rgba(0,0,0,.4)' : 'none' }}>
      <SidebarComponent activeTab={tab} setActiveTab={(t) => { setTab(t); setNotifItemId(null); setMobileMenu(false); }} profile={profile} />
    </div>
    <div className="main-area" style={{ marginLeft: sidebarOpen ? 220 : 0, display: 'flex', flexDirection: 'column', maxWidth: '100vw', transition: 'margin-left .25s cubic-bezier(.4,0,.2,1)' }}>
      {/* Mobile bottom nav */}
      <div className="mobile-hamburger" style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 102, background: T.s, borderTop: `1px solid ${T.bd}`, padding: '8px 0', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', justifyContent: 'space-around' }}>
        {[{ id: 'dashboard', icon: 'grid', label: 'Home' }, { id: 'inventory', icon: 'box', label: 'Inventory' }, { id: 'packtime', icon: 'scan', label: 'PackStation' }, { id: 'challan', icon: 'file', label: 'Challan' }].filter(t => checkTab(t.id)).map(t => (
          <div key={t.id} onClick={() => { setTab(t.id); setMobileMenu(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '2px 16px', color: tab === t.id ? T.ac : T.tx3, fontSize: 9, fontWeight: 500, transition: 'color .2s ease', position: 'relative' }}>
            <Icon name={t.icon} size={20} /><span>{t.label}</span>
            {tab === t.id && <span style={{ position: 'absolute', top: -8, width: 20, height: 3, borderRadius: 2, background: T.ac, boxShadow: `0 0 8px ${T.ac44}`, animation: 'tabDot .25s cubic-bezier(.2,.9,.3,1)' }} />}
          </div>
        ))}
        {/* More — opens full sidebar drawer for Brand Tags / Settings / anything else */}
        <div onClick={() => setMobileMenu(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '2px 16px', color: mobileMenu ? T.ac : T.tx3, fontSize: 9, fontWeight: 500 }}>
          <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
          <span>More</span>
        </div>
      </div>
      <HeaderComponent title={titles[tab]} onNotifClick={handleNotifClick} notifications={notifications} markAsRead={markAsRead} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(o => !o)} />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>}>
        {mounted.has('dashboard') && <div style={{ display: tab === 'dashboard' ? 'block' : 'none' }}><Dashboard navigateTo={setTab} /></div>}
        {mounted.has('inventory') && <div style={{ display: tab === 'inventory' ? 'block' : 'none' }}><Inventory openItemId={notifItemId} onItemOpened={() => setNotifItemId(null)} active={tab === 'inventory'} /></div>}
        {mounted.has('brandtag') && checkTab('brandtag') && <div style={{ display: tab === 'brandtag' ? 'block' : 'none' }}><BrandTagPrinter /></div>}
        {mounted.has('packtime') && checkTab('packtime') && <div style={{ display: tab === 'packtime' ? 'block' : 'none' }}><PackTime active={tab === 'packtime'} /></div>}
        {mounted.has('challan') && checkTab('challan') && <div style={{ display: tab === 'challan' ? 'block' : 'none' }}><CashChallan active={tab === 'challan'} /></div>}
        {mounted.has('purchaseorders') && checkTab('purchaseorders') && <div style={{ display: tab === 'purchaseorders' ? 'block' : 'none' }}><PurchaseOrders active={tab === 'purchaseorders'} /></div>}
        {mounted.has('attendance') && checkTab('attendance') && <div style={{ display: tab === 'attendance' ? 'block' : 'none' }}><Attendance /></div>}
        {mounted.has('programs') && checkTab('programs') && <div style={{ display: tab === 'programs' ? 'block' : 'none' }}><ProgramsModule /></div>}
        {mounted.has('minis') && checkTab('minis') && <div style={{ display: tab === 'minis' ? 'block' : 'none' }}><Minis /></div>}
        {mounted.has('printstation') && checkTab('printstation') && <div style={{ display: tab === 'printstation' ? 'block' : 'none' }}><PrintStation /></div>}
        {mounted.has('settings') && <div style={{ display: tab === 'settings' ? 'block' : 'none' }}><SettingsPage profile={profile} addToast={addToast} /></div>}
        </Suspense>
      </main>
    </div>
    <ToastContainerComponent toasts={toasts} />
    <OfflineBar />
    <InstallPrompt />
  </div>);
};

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(() => !!sessionStorage.getItem('pwa-dismiss'));
  useEffect(() => {
    const h = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (!deferredPrompt || dismissed) return null;
  return (
    <div style={{ position: 'fixed', bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))', right: 16, zIndex: 200, background: 'rgba(14,18,30,.96)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: `1px solid ${T.ac3}`, borderRadius: 10, padding: '8px 10px 8px 12px', boxShadow: '0 8px 24px rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', gap: 8, animation: 'slideUp .3s cubic-bezier(.2,.9,.3,1)' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>Install app</span>
      <button onClick={() => { deferredPrompt.prompt(); setDeferredPrompt(null); }} style={{ ...S.btnPrimary, padding: '5px 12px', fontSize: 10, flexShrink: 0 }}>Install</button>
      <span onClick={() => { setDismissed(true); sessionStorage.setItem('pwa-dismiss', '1'); }} style={{ color: T.tx3, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 4 }} aria-label="Close">&times;</span>
    </div>
  );
};

export default function App() {
  // Short-circuit all auth/providers for public short links — AuthProvider never mounts,
  // Supabase client never initializes, saving ~100ms on every cold open.
  const hash = window.location.hash;
  const shortMatch = hash.match(/^#\/s\/([a-zA-Z0-9_-]{3,32})$/);
  if (shortMatch) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#000' }} />}>
          <LazyTracklyRedirect shortCode={shortMatch[1]} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  return <ErrorBoundary><AuthProvider><AppContent /></AuthProvider></ErrorBoundary>;
}

const AppContent = () => {
  const auth = useAuth();

  // Password recovery callback — Supabase redirects with #access_token=...&type=recovery
  const hash = window.location.hash;
  if (hash.includes('type=recovery')) return <Suspense fallback={<div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}><LazyPasswordReset /></Suspense>;

  // Public share route — no auth required, rendered before login gate
  const shareMatch = hash.match(/^#\/share\/program\/([a-f0-9]+)$/);
  if (shareMatch) return <Suspense fallback={<div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}><LazyPublicShareView shareToken={shareMatch[1]} /></Suspense>;

  const shortMatch = hash.match(/^#\/s\/([a-zA-Z0-9_-]{3,32})$/);
  if (shortMatch) return <Suspense fallback={<div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}><LazyTracklyRedirect shortCode={shortMatch[1]} /></Suspense>;

  if (!auth?.ready && auth?.loading) return <div style={{ minHeight: '100dvh', width: '100%', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}><div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.sora, letterSpacing: -0.5, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>DailyOffice</div><div className="spinner" /><p style={{ color: T.tx3, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' }}>LOADING</p></div>;
  if (!auth?.user || auth.locked) return <Login signIn={auth.signIn} locked={auth.locked} unlockWithFaceId={auth.unlockWithFaceId} />;
  return <NotificationProvider><BreadcrumbProvider><MainApp /></BreadcrumbProvider></NotificationProvider>;
};
