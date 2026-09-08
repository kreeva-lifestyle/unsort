// The catalog's SKU folders with their sheet status — dot + label, never
// pills. Active ones are what the pack will contain.
import { T } from '../../../lib/theme';
import type { CatalogResult, FolderStatus } from './api';
import { mb } from './api';

const DOT: Record<FolderStatus, { color: string; label: string }> = { active: { color: T.gr, label: 'active' }, inactive: { color: T.tx3, label: 'inactive · skipped' }, unknown: { color: T.yl, label: 'not on the sheet for this catalog · skipped' } };

export default function FolderList({ r }: { r: CatalogResult }) {
  const t = r.totals;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 11, color: T.tx2, marginBottom: 6 }}>
        <span><span style={{ fontFamily: T.mono, color: T.tx }}>{r.folder.name}</span> · {r.items.length} folder{r.items.length === 1 ? '' : 's'}</span>
        <span style={{ fontFamily: T.mono, color: t.active ? T.gr : T.tx3 }}>{t.active} active · {t.files} file{t.files === 1 ? '' : 's'} · {mb(t.bytes)}</span>
      </div>
      {r.truncated && <div style={{ fontSize: 10, color: T.yl, marginBottom: 6 }}>This folder is very large — only the first part was listed.</div>}
      <div style={{ maxHeight: 320, overflowY: 'auto', WebkitOverflowScrolling: 'touch', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
        {r.items.map((it, i) => (
          <div key={it.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderTop: i ? `1px solid ${T.bd}` : 'none', minHeight: 36, opacity: it.status === 'active' ? 1 : 0.6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[it.status].color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.mono, fontSize: 12, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
              <div style={{ fontSize: 10, color: T.tx3, lineHeight: 1.4 }}>{it.files} file{it.files === 1 ? '' : 's'} · {mb(it.bytes)} · {DOT[it.status].label}</div>
            </div>
          </div>
        ))}
        {r.items.length === 0 && <div style={{ padding: 16, fontSize: 11, color: T.tx3, textAlign: 'center' }}>No SKU folders inside this catalog folder.</div>}
      </div>
      {r.missing.length > 0 && (
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, lineHeight: 1.5 }}>
          On the sheet but no folder here ({r.missing.length}): <span style={{ fontFamily: T.mono }}>{r.missing.slice(0, 20).join(', ')}{r.missing.length > 20 ? '…' : ''}</span>
        </div>
      )}
      {r.loose > 0 && <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{r.loose} loose file{r.loose === 1 ? ' sits' : 's sit'} directly in the catalog folder outside any SKU — not included.</div>}
    </div>
  );
}
