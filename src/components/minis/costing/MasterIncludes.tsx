// "The master sheet says DRS236 includes LEHENGA · BLOUSE · DUPATTA" above
// the components of a costing, with a one-tap "+ DUPATTA" for every piece
// the sheet lists that the costing does not have yet. Nothing here removes
// or renames what the user typed.
import { T, S } from '../../../lib/theme';

export default function MasterIncludes({ sku, comps, missing, onAdd }: {
  sku: string;
  /** The sheet's pieces for the SKU, in sheet order; empty = not in the master sheet. */
  comps: string[];
  missing: string[];
  onAdd: (name: string) => void;
}) {
  if (comps.length === 0) return null;
  return (
    <div data-fx="cost-master" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, fontSize: 11, color: T.tx3, lineHeight: 1.5 }}>
      <span>Master sheet: {sku.trim().toUpperCase()} includes <b style={{ color: T.tx2 }}>{comps.join(' · ')}</b></span>
      {missing.map(n => (
        <button key={n} type="button" className="touch44" onClick={() => onAdd(n)} title={`Add ${n} as a main component`}
          style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, borderRadius: 999, padding: '5px 12px', fontSize: 11 }}>+ {n}</button>
      ))}
    </div>
  );
}
