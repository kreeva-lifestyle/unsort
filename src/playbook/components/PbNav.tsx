// Playbook's own navigation: one row of tabs under the header. On phones it
// scrolls sideways; every item is a 44px tap target. The page lives in
// PlaybookApp state + localStorage ('pb-page') — never the URL hash, which the
// hidden DailyWork tree owns.
import { T, Icon } from '../../lib/theme';

export type PbPage = 'dashboard' | 'products' | 'websites' | 'vendors' | 'settings' | 'guide';
export const PB_PAGES: { id: PbPage; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'products', label: 'Products', icon: 'box' },
  { id: 'websites', label: 'Websites', icon: 'link' },
  { id: 'vendors', label: 'Vendors', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'guide', label: 'Guide', icon: 'file' },
];

export default function PbNav({ page, onGo }: { page: PbPage; onGo: (p: PbPage) => void }) {
  return (
    <nav aria-label="Playbook" style={{ display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', padding: '0 max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left))', maxWidth: 1080, margin: '0 auto' }}>
      {PB_PAGES.map(p => {
        const on = p.id === page;
        return (
          <button key={p.id} type="button" onClick={() => onGo(p.id)} aria-current={on ? 'page' : undefined}
            style={{
              flexShrink: 0, minHeight: 44, padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 7,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: 13, fontWeight: on ? 600 : 500,
              color: on ? T.tx : T.tx3, borderBottom: '2px solid transparent',
              borderImage: on ? `linear-gradient(90deg, ${T.yl}, ${T.re}) 1` : undefined,
            }}>
            <Icon name={p.icon} size={15} />{p.label}
          </button>
        );
      })}
    </nav>
  );
}
