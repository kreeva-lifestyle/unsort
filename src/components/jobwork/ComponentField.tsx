// The job form's "Component sent": which piece of the design goes to the
// jobworker. The chips are the master sheet's INCLUDES for the SKU (owner: a
// component IS what the sheet says the design includes — "1 LEHENGA,
// 1 BLOUSE, 1 DUPATTA" → LEHENGA · BLOUSE · DUPATTA), read from the server's
// copy of the sheet through product_catalog, followed by any component the
// SKU's costing sheet names differently (PANT where the sheet says BOTTOM).
// A design in neither place gets a plain box to type into.
import { T, S } from '../../lib/theme';
import { useProductCatalog, resolveSku } from '../../hooks/useProductCatalog';
import { mergeComponents, sameComponent } from '../../lib/componentNames';
import { componentNames } from './jobworkCosting';
import type { CostingRef } from './jobworkApi';

export default function ComponentField({ sku, costing, value, onPick, onChange }: {
  sku: string;
  costing: CostingRef | null;
  value: string;
  /** A chip tap — the form also fills rate and material hints from it. */
  onPick: (c: string) => void;
  onChange: (v: string) => void;
}) {
  const { index } = useProductCatalog();
  const master = resolveSku(index, sku)?.product.includes ?? [];
  const comps = mergeComponents(master, costing ? componentNames(costing.components) : []);
  const note = master.length > 0 && costing ? `From the master sheet and the ${costing.sku} costing sheet`
    : master.length > 0 ? 'From the master sheet'
    : costing ? `From the ${costing.sku} costing sheet (not in the master sheet)`
    : sku.trim().length >= 3 ? 'Not in the master sheet and no costing sheet — type the component' : '';
  const chip = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 32, borderRadius: 999, padding: '5px 12px', fontSize: 11, ...(on ? { borderColor: T.ac, color: T.ac2, background: T.ac3 } : {}) });
  return (
    <div>
      <label style={S.fLabel}>Component sent</label>
      {comps.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {comps.map(c => (
            <button key={c} type="button" className="touch44" onClick={() => onPick(c)} aria-pressed={sameComponent(value, c)} style={chip(sameComponent(value, c))}>{c.toUpperCase()}</button>
          ))}
        </div>
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="e.g. LEHENGA, TOP, DUPATTA" style={{ ...S.fInput, width: '100%' }} />
      )}
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{note}</div>
    </div>
  );
}
