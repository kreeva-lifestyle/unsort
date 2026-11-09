// Playbook division (owner, 2026-11-04): its own shell and pages, coded
// separately from DailyWork — rules in src/playbook/CLAUDE.md. V2 "Bento
// glass" shell (DESIGN.md §4–§7): the backdrop glows, a floating glass top bar
// on desktop (logo, nav pills, DailyWork switch, Log out), and on phone a
// fixed 4-tab glass bar (Home · Products · Websites · More) with page headers
// owned by the pages (PbPageHeader). Also the page switch and the toasts.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../components/ui/ConfirmModal';
import { setDivision } from '../lib/division';
import { closeAllLayers, closeTopLayer, useBackClose } from '../hooks/useBackClose';
import { DailyWorkMark, PlaybookMark } from '../components/brand/DivisionLogos';
import PbNav, { PbTabBar, PB_PAGES, pageLabel, type PbPage } from './components/PbNav';
import { PbToasts, usePbToasts } from './components/PbToasts';
import { PbButton, PbConfirm } from './components/ui';
import { discardAsk } from './components/ui/discard';
import { dirtyTitle } from './hooks/useDirty';
import { PB, pbRootVars, pbTile } from './pbTheme';
import { useIsPhone } from './hooks/useIsPhone';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import PlaybookDashboard from './PlaybookDashboard';
import Products, { type ProductsStart } from './pages/Products';
import Websites from './pages/Websites';
import Vendors from './pages/Vendors';
import PbSettings from './pages/PbSettings';
import Guide from './pages/Guide';
import More from './pages/More';

// The page is kept in state + localStorage, never in the URL hash (the hidden DailyWork tree owns hash routing).
const PAGE_KEY = 'pb-page';
const readPage = (): PbPage => {
  try { const p = localStorage.getItem(PAGE_KEY); if (p === 'more' || PB_PAGES.some(x => x.id === p)) return p as PbPage; } catch { /* storage blocked: start on the dashboard */ }
  return 'dashboard';
};

export default function PlaybookApp() {
  const { profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [page, setPage] = useState<PbPage>(readPage);
  // A dashboard tile opens Products with a filter; the key remounts Products so it takes the new start.
  const [start, setStart] = useState<{ key: number; value: ProductsStart }>({ key: 0, value: {} });
  const { addToast, toasts, dismiss } = usePbToasts();
  // A "How to set it up" button opens the Guide at one section (null: the top).
  const [guideAt, setGuideAt] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const isPhone = useIsPhone();
  useKeyboardInset();
  const { ask, modalProps } = useConfirm();
  // 'more' is a phone-only page: on desktop it never stays selected (the top bar lists every page).
  const shown: PbPage = page === 'more' && !isPhone ? 'dashboard' : page;

  // DailyWork's header owns the title there; give it back when switching.
  const prevTitle = useRef(document.title);
  useEffect(() => { const prev = prevTitle.current; return () => { document.title = prev; }; }, []);
  useEffect(() => { document.title = `${pageLabel(shown)} · Playbook · DailyOffice`; }, [shown]);

  // DailyWork's global Escape is off while Playbook is open — Playbook closes its own top layer.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTopLayer(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const pageRef = useRef(page);
  const go = useCallback(async (p: PbPage, s?: ProductsStart) => {
    // Unsaved typing on the open page (edited product Facts): ask before leaving.
    const what = dirtyTitle();
    if (what && !(await ask(discardAsk(what)))) return;
    closeAllLayers(); // a modal or product page must not outlive its page
    // A plain nav tap opens Products clean: an old tile filter or "+ Add product" must not come back.
    if (s || p !== pageRef.current) setStart(prev => ({ key: prev.key + 1, value: s ?? {} }));
    pageRef.current = p;
    setGuideAt(null);
    setPage(p);
    try { localStorage.setItem(PAGE_KEY, p); } catch { /* storage blocked: page just isn't remembered */ }
    scroller.current?.scrollTo({ top: 0 });
  }, [ask]);

  // Phone: Vendors, Settings and Guide sit under More. Their header shows
  // "Back to More", and the device Back returns there instead of leaving Playbook.
  const underMore = isPhone && (shown === 'vendors' || shown === 'settings' || shown === 'guide');
  useBackClose(underMore, () => {
    pageRef.current = 'more';
    setPage('more');
    try { localStorage.setItem(PAGE_KEY, 'more'); } catch { /* storage blocked: page just isn't remembered */ }
    scroller.current?.scrollTo({ top: 0 });
  });
  const backToMore = underMore ? closeTopLayer : undefined;

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
  const toDailyWork = () => setDivision('dailywork');

  return (
    // #root is a fixed overflow:hidden frame, so Playbook brings its own scroller (.pb-scroll).
    <div ref={scroller} className="pb-scroll"
      style={{ ...pbRootVars, height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: PB.bg, color: PB.tx, fontFamily: PB.sans } as CSSProperties}>
      <div className="pb-glow" aria-hidden="true" />
      <div className="pb-statusbar pb-phone-only" aria-hidden="true" style={{ background: PB.bg }} />
      <div className="pb-shell">
        <a href="#pb-main" className="pb-sr pb-skip pb-pill pb-desk-only"
          style={{ ...pbTile, borderRadius: PB.r.pill, padding: 0, border: 'none', color: PB.tx, fontWeight: 600, fontSize: 14, lineHeight: '44px', textDecoration: 'none' }}>Skip to content</a>
        <header className="pb-topbar pb-desk-only pb-topbar-row"
          style={{ ...pbTile, borderRadius: PB.r.pill, padding: '8px 8px 8px 16px', display: 'flex', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <PlaybookMark size={32} />
            <span className="pb-wordmark" style={{ fontFamily: PB.sora, fontWeight: 700, fontSize: 17, letterSpacing: -0.3 }}>Playbook</span>
          </span>
          <PbNav page={shown} onGo={p => go(p)} />
          <span style={{ flex: 1 }} />
          <PbButton onClick={toDailyWork} aria-label="Switch to DailyWork" title="Switch to DailyWork" style={{ borderRadius: PB.r.pill, flexShrink: 0 }}>
            <DailyWorkMark size={20} decorative /><span className="pb-wordmark">DailyWork</span>
          </PbButton>
          {/* Below 1100px the two account buttons go icon-only so the six nav pills fit (title = the mouse hint). */}
          <PbButton onClick={out} icon="logout" aria-label={signingOut ? 'Signing out…' : 'Log out'} title={signingOut ? 'Signing out…' : 'Log out'} aria-busy={signingOut || undefined}
            style={{ borderRadius: PB.r.pill, flexShrink: 0, ...(signingOut ? { pointerEvents: 'none', opacity: 0.5 } : null) }}>
            <span className="pb-wordmark">{signingOut ? 'Signing out…' : 'Log out'}</span>
          </PbButton>
        </header>
        <main id="pb-main" tabIndex={-1}>
          {shown === 'dashboard' && <PlaybookDashboard name={profile?.full_name?.split(' ')[0] || ''} addToast={addToast} go={go} />}
          {shown === 'products' && <Products key={start.key} addToast={addToast} start={start.value} onGuide={id => { go('guide'); setGuideAt(id); }} />}
          {shown === 'websites' && <Websites addToast={addToast} />}
          {shown === 'vendors' && <Vendors addToast={addToast} onBack={backToMore} />}
          {shown === 'settings' && <PbSettings addToast={addToast} onBack={backToMore} onGuide={id => { go('guide'); setGuideAt(id); }} />}
          {shown === 'guide' && <Guide addToast={addToast} onBack={backToMore} at={guideAt} />}
          {shown === 'more' && <More go={p => go(p)} onSwitch={toDailyWork} onSignOut={out} signingOut={signingOut} />}
        </main>
      </div>
      <PbTabBar page={shown} onGo={p => go(p)} />
      <PbToasts toasts={toasts} dismiss={dismiss} />
      <PbConfirm {...modalProps} />
    </div>
  );
}
