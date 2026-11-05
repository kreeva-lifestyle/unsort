// Playbook's own navigation. Desktop: nav pills in the floating glass top bar
// (Dashboard · Products · Websites · Vendors · Settings · Guide; active =
// frosted glass + aria-current). Phone: the fixed 4-tab glass bar (Home ·
// Products · Websites · More); Vendors, Settings and Guide live under More.
// The page lives in PlaybookApp state + localStorage ('pb-page') — never the
// URL hash, which the hidden DailyWork tree owns.
import { PB, pbActive } from '../pbTheme';
import PbIcon from './ui/PbIcon';

export type PbPage = 'dashboard' | 'products' | 'websites' | 'vendors' | 'settings' | 'guide' | 'more';
/** Desktop pages (top bar), in order. 'more' is phone-only and not listed here. */
export const PB_PAGES: { id: PbPage; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'products', label: 'Products', icon: 'box' },
  { id: 'websites', label: 'Websites', icon: 'globe' },
  { id: 'vendors', label: 'Vendors', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'guide', label: 'Guide', icon: 'book' },
];
/** Phone tab bar. Pages under More keep the More tab lit. */
export const PB_TABS: { id: PbPage; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Home', icon: 'home' },
  { id: 'products', label: 'Products', icon: 'box' },
  { id: 'websites', label: 'Websites', icon: 'globe' },
  { id: 'more', label: 'More', icon: 'more' },
];
export const MORE_PAGES: PbPage[] = ['more', 'vendors', 'settings', 'guide'];
export const pageLabel = (p: PbPage) => (p === 'more' ? 'More' : PB_PAGES.find(x => x.id === p)?.label ?? 'Dashboard');

/** Desktop nav pills (inside the top bar). */
export default function PbNav({ page, onGo }: { page: PbPage; onGo: (p: PbPage) => void }) {
  return (
    <nav aria-label="Playbook" style={{ display: 'flex', gap: 4, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none', padding: 2 }}>
      {PB_PAGES.map(p => {
        const on = p.id === page;
        return (
          <button key={p.id} type="button" onClick={() => onGo(p.id)} aria-current={on ? 'page' : undefined} className="pb-pill pb-navpill"
            style={{
              flexShrink: 0, minHeight: 'var(--pb-ctl-h)', borderRadius: PB.r.pill, cursor: 'pointer',
              fontFamily: PB.sans, fontWeight: 500, color: PB.tx2, background: 'transparent', border: '1px solid transparent',
              ...(on ? pbActive : null),
            }}>
            {p.label}
          </button>
        );
      })}
    </nav>
  );
}

/** Phone: fixed floating glass tab bar. A second tap on the active tab is go(same) → scroll to top + close layers. */
export function PbTabBar({ page, onGo }: { page: PbPage; onGo: (p: PbPage) => void }) {
  return (
    <nav aria-label="Playbook" className="pb-tabbar pb-phone-only">
      {PB_TABS.map(t => {
        const exact = t.id === page;
        const on = exact || (t.id === 'more' && MORE_PAGES.includes(page));
        return (
          <button key={t.id} type="button" onClick={() => onGo(t.id)} aria-current={on ? 'page' : undefined} className="pb-tab pb-pill"
            style={{ color: PB.tx2, ...(on ? { ...pbActive, borderRadius: PB.r.row } : null) }}>
            <PbIcon name={t.icon} size={20} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
