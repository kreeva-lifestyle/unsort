// The "Unknown code" debug list: the distinct design codes that no vendor
// sheet knows, with how many Indya rows each one covers — a few hundred
// codes to fix instead of thousands of rows to page through.
import { T } from '../../../lib/theme';

export default function IndyaUnknown({ bases, onPick, onMap }: { bases: { base: string; rows: number }[]; onPick: (base: string) => void; onMap: (base: string) => void }) {
  if (bases.length === 0) return null;
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Unknown codes · {bases.length}</div>
      <div style={{ fontSize: 10.5, color: T.tx3, marginBottom: 8, lineHeight: 1.5 }}>No vendor sheet has these design codes in any size. Their rows say “SKU mismatch” in the file. Tap a code to see its rows, or “map” to give it the correct code.</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 160, overflowY: 'auto' }}>
        {bases.map(b => (
          <span key={b.base} style={{ display: 'inline-flex', border: `1px solid ${T.bd2}`, borderRadius: 999, overflow: 'hidden' }}>
            <button type="button" onClick={() => onPick(b.base)} className="touch44" style={{ padding: '4px 10px', border: 'none', background: 'transparent', color: T.tx, fontFamily: T.mono, fontSize: 11, cursor: 'pointer', minHeight: 32 }}>
              {b.base} <span style={{ color: T.tx3 }}>· {b.rows}</span>
            </button>
            <button type="button" onClick={() => onMap(b.base)} className="touch44" aria-label={`Map ${b.base}`} style={{ padding: '4px 10px', border: 'none', borderLeft: `1px solid ${T.bd2}`, background: T.ac3, color: T.ac2, fontSize: 10, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>map</button>
          </span>
        ))}
      </div>
    </div>
  );
}
