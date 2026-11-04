// Playbook division (owner, 2026-11-04): its own shell and pages, coded
// separately from DailyWork — rules in src/playbook/CLAUDE.md. The shell is the
// header (logo, switch back to DailyWork, sign out), Playbook's own nav row,
// the page switch and Playbook's toasts. Pages: Dashboard · Products (Product
// Directory) · Websites · Vendors · Settings · Guide.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { T, S } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';
import { setDivision } from '../lib/division';
import { closeAllLayers, closeTopLayer } from '../hooks/useBackClose';
import { DivisionLogo, DailyWorkMark } from '../components/brand/DivisionLogos';
import PbNav, { PB_PAGES, type PbPage } from './components/PbNav';
import { PbToasts, usePbToasts } from './components/PbToasts';
import PlaybookDashboard from './PlaybookDashboard';
import Products, { type ProductsStart } from './pages/Products';
import Websites from './pages/Websites';
import Vendors from './pages/Vendors';
import PbSettings from './pages/PbSettings';
import Guide from './pages/Guide';

// The page is kept in state + localStorage, never in the URL hash (the hidden DailyWork tree owns hash routing).
const PAGE_KEY = 'pb-page';
const readPage = (): PbPage => {
  try { const p = localStorage.getItem(PAGE_KEY); if (PB_PAGES.some(x => x.id === p)) return p as PbPage; } catch { /* storage blocked: start on the dashboard */ }
  return 'dashboard';
};

export default function PlaybookApp() {
  const { profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [page, setPage] = useState<PbPage>(readPage);
  // A dashboard tile opens Products with a filter; the key remounts Products so it takes the new start.
  const [start, setStart] = useState<{ key: number; value: ProductsStart }>({ key: 0, value: {} });
  const { addToast, toasts, dismiss } = usePbToasts();
  const scroller = useRef<HTMLDivElement>(null);

  // DailyWork's header owns the title there; give it back when switching.
  const prevTitle = useRef(document.title);
  useEffect(() => { const prev = prevTitle.current; return () => { document.title = prev; }; }, []);
  useEffect(() => {
    document.title = `${PB_PAGES.find(p => p.id === page)?.label ?? 'Dashboard'} · Playbook · DailyOffice`;
  }, [page]);

  // DailyWork's global Escape is off while Playbook is open — Playbook closes its own top layer.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTopLayer(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const pageRef = useRef(page);
  const go = useCallback((p: PbPage, s?: ProductsStart) => {
    closeAllLayers(); // a modal or product page must not outlive its page
    // A plain nav tap opens Products clean: an old tile filter or "+ Add product" must not come back.
    if (s || p !== pageRef.current) setStart(prev => ({ key: prev.key + 1, value: s ?? {} }));
    pageRef.current = p;
    setPage(p);
    try { localStorage.setItem(PAGE_KEY, p); } catch { /* storage blocked: page just isn't remembered */ }
    scroller.current?.scrollTo({ top: 0 });
  }, []);

  // Same as DailyWork's Logout: lock when Face ID is enrolled, else sign out;
  // the reload clears every in-memory state.
  const out = async () => {
    if (signingOut) return;
    setSigningOut(true);
    // A Cash Challan draft (customer, phone, items) must not outlive the session on a shared device.
    try { localStorage.removeItem('ccDraft'); } catch { /* storage blocked: nothing kept to clear */ }
    try { await signOut(); } catch { /* reload below shows the login either way */ }
    window.location.reload();
  };

  return (
    // #root is a fixed overflow:hidden frame, so Playbook brings its own scroller (the header sticks inside it).
    <div ref={scroller} style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: T.bg, color: T.tx, fontFamily: T.sans } as React.CSSProperties}>
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(8,11,20,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 1080, margin: '0 auto', padding: 'max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 6px max(16px, env(safe-area-inset-left))' }}>
          <DivisionLogo division="playbook" size={34} />
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => setDivision('dailywork')} aria-label="Switch to DailyWork"
            style={{ ...S.btnGhost, display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '6px 12px 6px 8px' }}>
            <DailyWorkMark size={24} decorative />DailyWork
          </button>
          <button type="button" onClick={out} aria-label="Log out"
            style={{ ...S.btnGhost, minHeight: 44, pointerEvents: signingOut ? 'none' : 'auto', opacity: signingOut ? 0.5 : 1 }}>{signingOut ? 'Signing out…' : 'Logout'}</button>
        </div>
        <PbNav page={page} onGo={p => go(p)} />
      </header>
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '20px max(16px, env(safe-area-inset-right)) max(40px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))' }}>
        {page === 'dashboard' && <PlaybookDashboard name={profile?.full_name?.split(' ')[0] || ''} addToast={addToast} go={go} />}
        {page === 'products' && <Products key={start.key} addToast={addToast} start={start.value} />}
        {page === 'websites' && <Websites addToast={addToast} />}
        {page === 'vendors' && <Vendors addToast={addToast} />}
        {page === 'settings' && <PbSettings addToast={addToast} />}
        {page === 'guide' && <Guide addToast={addToast} />}
      </main>
      <PbToasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
