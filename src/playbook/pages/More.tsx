// Phone "More" tab (DESIGN.md §7, layout §4): rows for the pages that don't
// get a tab — Websites, Vendors, Settings, Guide — then Switch to DailyWork
// and Log out at the bottom, in the thumb zone. Desktop never shows this page
// (the top bar holds all six pages); PlaybookApp maps 'more' to the dashboard.
import { DailyWorkMark } from '../../components/brand/DivisionLogos';
import type { PbPage } from '../components/PbNav';
import { PbButton, PbPageHeader, PbRow } from '../components/ui';

const ROWS: { id: PbPage; title: string; meta: string; icon: string }[] = [
  { id: 'websites', title: 'Websites', meta: 'Connections, rules, pricing', icon: 'globe' },
  { id: 'vendors', title: 'Vendors', meta: 'Who supplies the products', icon: 'users' },
  { id: 'settings', title: 'Settings', meta: 'AI reader, categories, automation', icon: 'settings' },
  { id: 'guide', title: 'Guide', meta: 'How everything works · PDF', icon: 'book' },
];

export default function More({ go, onSwitch, onSignOut, signingOut }: {
  go: (p: PbPage) => void; onSwitch: () => void; onSignOut: () => void; signingOut: boolean;
}) {
  return (
    // Fills the screen above the tab bar so the two account buttons sit at the bottom.
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 24,
      minHeight: 'calc(100dvh - max(12px, env(safe-area-inset-top)) - var(--pb-bar) - env(safe-area-inset-bottom) - 16px)',
    }}>
      <div>
        <PbPageHeader title="More" />
        <nav aria-label="More pages" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ROWS.map(r => <PbRow key={r.id} icon={r.icon} title={r.title} meta={r.meta} onClick={() => go(r.id)} />)}
        </nav>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PbButton block onClick={onSwitch} style={{ justifyContent: 'flex-start', gap: 12 }}>
          <DailyWorkMark size={20} decorative />Switch to DailyWork
        </PbButton>
        <PbButton block kind="danger" onClick={onSignOut} busy={signingOut} busyLabel="Signing out…">Log out</PbButton>
      </div>
    </div>
  );
}
