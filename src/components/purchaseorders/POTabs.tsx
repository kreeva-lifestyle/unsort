// Open / Completed tabs above the PO list (owner's ask). Open = still
// expecting goods or not yet sent (draft, approved, sent, partially
// received); Completed = finished one way or another (completed, closed,
// cancelled). Each tab shows its count for the current search and filters,
// so a search that only matches the other tab says so on the tab itself.
import { T, S } from '../../lib/theme';
import type { PoTab } from './usePoList';

const LABEL: Record<PoTab, string> = { open: 'Open', completed: 'Completed' };

export default function POTabs({ tab, onTab, counts }: {
  tab: PoTab;
  onTab: (t: PoTab) => void;
  /** null while that tab's count is not known yet. */
  counts: Record<PoTab, number | null>;
}) {
  return (
    <div role="tablist" aria-label="Purchase orders" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {(['open', 'completed'] as PoTab[]).map(t => {
        const on = tab === t;
        return (
          <button key={t} type="button" role="tab" aria-selected={on} onClick={() => { if (!on) onTab(t); }}
            style={{ ...(on ? S.btnPrimary : S.btnGhost), flex: 1, maxWidth: 220, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {LABEL[t]}
            {counts[t] !== null && (
              <span style={{ fontFamily: T.mono, fontSize: 11, padding: '1px 7px', borderRadius: 999, background: on ? 'rgba(255,255,255,.18)' : T.glass2, color: on ? T.tx : T.tx3 }}>{counts[t]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
