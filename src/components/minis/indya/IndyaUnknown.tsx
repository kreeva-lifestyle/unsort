// The "Unknown code" debug list: the distinct design codes that no vendor
// sheet knows, with how many Indya rows each one covers — a few hundred
// codes to fix instead of thousands of rows to page through.
import { T } from '../../../lib/theme';

export default function IndyaUnknown({ bases, onPick }: { bases: { base: string; rows: number }[]; onPick: (base: string) => void }) {
  if (bases.length === 0) return null;
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Unknown codes · {bases.length}</div>
      <div style={{ fontSize: 10.5, color: T.tx3, marginBottom: 8, lineHeight: 1.5 }}>No vendor sheet has these design codes in any size. Their rows say “SKU mismatch” in the file. Tap one to see its rows.</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 160, overflowY: 'auto' }}>
        {bases.map(b => (
          <button key={b.base} type="button" onClick={() => onPick(b.base)} className="touch44"
            style={{ padding: '4px 10px', borderRadius: 999, border: `1px solid ${T.bd2}`, background: 'transparent', color: T.tx, fontFamily: T.mono, fontSize: 11, cursor: 'pointer', minHeight: 32 }}>
            {b.base} <span style={{ color: T.tx3 }}>· {b.rows}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
