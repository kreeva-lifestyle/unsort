// One taught-mapping row: column chip, source → target (or the ignored
// badge), stale warning, delete-with-confirm. Extracted from
// TaughtMappingsPage for the file budget.
import { T, S } from '../../lib/theme';
import type { ListingMapping } from '../../types/database';

export default function MappingRow({ r, stale, confirming, onAskDelete, onCancelDelete, onDelete }: {
  r: ListingMapping;
  stale: boolean;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${T.bd}`, fontSize: 13 }}>
      <div style={{ width: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 10, color: T.tx3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }} title={r.field_label}>{r.field_label}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, wordBreak: 'break-word' }}>
          <span style={{ color: T.tx2, textDecoration: r.ignored ? 'line-through' : 'none', opacity: r.ignored ? 0.6 : 1 }}>{r.source}</span>
          {r.ignored ? (
            <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, background: 'rgba(255,255,255,.06)', color: T.tx3 }}>ignored — never suggested (delete to bring it back)</span>
          ) : (<>
            <span style={{ color: T.tx3, fontSize: 11 }}>→</span>
            <span style={{ color: T.ac2, fontWeight: 600 }}>{r.target}</span>
          </>)}
        </div>
        {stale && (
          <div title="The marketplace changed this column's dropdown — this value no longer exists in it. Teach the new value (same column + same master value replaces this lesson)." style={{ marginTop: 4, padding: '2px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, background: 'rgba(239,68,68,.12)', color: T.re, whiteSpace: 'nowrap', display: 'inline-block' }}>
            not in this sheet's list anymore
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {confirming ? (
          <>
            <button onClick={onDelete} style={{ ...S.btnDanger, ...S.btnSm }}>Confirm</button>
            <button onClick={onCancelDelete} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
          </>
        ) : (
          <button onClick={onAskDelete} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</button>
        )}
      </div>
    </div>
  );
}
