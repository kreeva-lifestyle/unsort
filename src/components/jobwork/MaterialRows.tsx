// The job form's material list: what goes out to the jobworker (fabric,
// lining, lace, cut panels…), its unit, and how much one finished piece
// uses. Usage/pc is optional — with it the balance can say what the
// jobworker should still hold; without it the balance shows sent − returned.
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import SuggestInput from '../ui/SuggestInput';
import { MATERIAL_UNITS } from './jobworkModel';
import type { MaterialDraft } from './jobworkApi';

export default function MaterialRows({ rows, onChange, suggestions, locked }: {
  rows: MaterialDraft[];
  onChange: (next: MaterialDraft[]) => void;
  /** Material names from the SKU's costing, offered while typing. */
  suggestions: string[];
  /** Ids of materials that already have movements — they cannot be removed. */
  locked: Set<string>;
}) {
  const set = (i: number, patch: Partial<MaterialDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.id ?? `n${i}`} className="jw-mat-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px 84px 44px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <SuggestInput value={r.name} onChange={v => set(i, { name: v })} options={suggestions} placeholder="Material — e.g. flute"
            style={{ ...S.fInput, width: '100%', minWidth: 0 }} />
          <select value={r.unit} onChange={e => set(i, { unit: e.target.value })} aria-label="Unit" style={{ ...S.fInput, padding: '8px 6px', cursor: 'pointer' }}>
            {MATERIAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <input value={r.per_piece} onChange={e => set(i, { per_piece: e.target.value })} onKeyDown={e => numericKeyDown(e)}
            type="number" min="0" inputMode="decimal" placeholder="per pc" aria-label="Usage per piece" style={{ ...S.fInput, width: '100%' }} />
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={!!r.id && locked.has(r.id)}
            title={r.id && locked.has(r.id) ? 'Already sent or returned — cannot be removed' : 'Remove'} aria-label="Remove material"
            style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36, padding: 0, opacity: r.id && locked.has(r.id) ? 0.3 : 1, color: T.re }}>&#215;</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { name: '', unit: 'Meter', per_piece: '' }])}
        style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, borderStyle: 'dashed' }}>+ Add material</button>
    </div>
  );
}
