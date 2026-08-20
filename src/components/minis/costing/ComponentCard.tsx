// One MAIN COMPONENT of a costing sheet: its name plus the sub-component
// table from the owner's reference screenshot (Sub · Supplier · QTY · Unit ·
// Rate · Cost). Rate lives on the supplier (each supplier has its own), so
// the rate cell edits the SELECTED supplier's rate; the supplier cell opens
// the multi-supplier modal. Table scrolls horizontally on the phone.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import {
  CostingComponent, CostingSub, CostingSupplier,
  UNITS, blankSub, selectedSupplier, subCost, componentCost, money,
} from './costingModel';
import SupplierModal from './SupplierModal';

export default function ComponentCard({ comp, onChange, onRemove }: {
  comp: CostingComponent;
  onChange: (next: CostingComponent) => void;
  onRemove: () => void;
}) {
  const [supFor, setSupFor] = useState<number | null>(null);

  const patchSub = (i: number, p: Partial<CostingSub>) =>
    onChange({ ...comp, subs: comp.subs.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const patchRate = (i: number, rate: string) => {
    const s = comp.subs[i];
    const sel = selectedSupplier(s);
    const suppliers: CostingSupplier[] = sel
      ? s.suppliers.map(x => (x === sel ? { ...x, rate } : x))
      : [{ name: '', materialCode: '', rate, selected: true }];
    patchSub(i, { suppliers });
  };
  const removeSub = (i: number) =>
    onChange({ ...comp, subs: comp.subs.filter((_, j) => j !== i) });

  const cellIn = { ...S.fInput, width: '100%', minWidth: 0 } as React.CSSProperties;
  const th = { ...S.thStyle, padding: '8px 10px', whiteSpace: 'nowrap' as const };
  const td = { padding: '6px 8px', borderTop: `1px solid ${T.bd}`, verticalAlign: 'middle' as const };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={S.fLabel}>Main component <span style={{ color: T.re }}>*</span></label>
          <input value={comp.name} onChange={e => onChange({ ...comp, name: e.target.value })}
            placeholder="e.g. Fabric / Stitching / Packing" style={{ ...S.fInput, width: '100%' }} />
        </div>
        <button onClick={onRemove} style={{ ...S.btnDanger, ...S.btnSm, minHeight: 36, alignSelf: 'flex-end' }}>Remove component</button>
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr>
            <th style={{ ...th, minWidth: 150 }}>Sub component</th>
            <th style={{ ...th, minWidth: 140 }}>Supplier</th>
            <th style={{ ...th, width: 76 }}>QTY</th>
            <th style={{ ...th, width: 96 }}>Unit</th>
            <th style={{ ...th, width: 90 }}>Rate</th>
            <th style={{ ...th, width: 92, textAlign: 'right' }}>Cost</th>
            <th style={{ ...th, width: 36 }} />
          </tr></thead>
          <tbody>
            {comp.subs.map((s, i) => {
              const sel = selectedSupplier(s);
              return (
                <tr key={i}>
                  <td style={td}><input value={s.name} onChange={e => patchSub(i, { name: e.target.value })} placeholder="e.g. Georgette 60&quot;" style={cellIn} /></td>
                  <td style={td}>
                    {/* Opens the multi-supplier editor; shows the selected one
                        + how many alternates ride along, with material code. */}
                    <button onClick={() => setSupFor(i)}
                      style={{ ...S.btnGhost, width: '100%', minHeight: 36, padding: '4px 10px', justifyContent: 'flex-start', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                      <span style={{ fontSize: 12, color: sel?.name ? T.tx : T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                        {sel?.name || 'Select supplier'}{s.suppliers.filter(x => x.name.trim()).length > 1 ? ` +${s.suppliers.filter(x => x.name.trim()).length - 1}` : ''}
                      </span>
                      {sel?.materialCode ? <span style={{ fontSize: 9.5, color: T.tx3, fontFamily: T.mono }}>{sel.materialCode}</span> : null}
                    </button>
                  </td>
                  <td style={td}><input value={s.qty} onChange={e => patchSub(i, { qty: e.target.value })} onKeyDown={e => numericKeyDown(e)} type="number" inputMode="decimal" placeholder="0" style={cellIn} /></td>
                  <td style={td}>
                    <select value={s.unit} onChange={e => patchSub(i, { unit: e.target.value })} style={cellIn}>
                      <option value="">Unit…</option>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={td}><input value={sel?.rate ?? ''} onChange={e => patchRate(i, e.target.value)} onKeyDown={e => numericKeyDown(e)} type="number" inputMode="decimal" placeholder="0" style={cellIn} /></td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: T.mono, fontSize: 12, color: T.tx, whiteSpace: 'nowrap' }}>{money(subCost(s))}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span onClick={() => removeSub(i)} aria-label="Remove sub component" style={{ cursor: 'pointer', color: T.re, fontSize: 16, lineHeight: 1, padding: 4 }}>&#215;</span>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={5} style={{ ...td, borderTop: `1px solid ${T.bd2}` }}>
                <button onClick={() => onChange({ ...comp, subs: [...comp.subs, blankSub()] })} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>+ Add sub component</button>
              </td>
              <td style={{ ...td, borderTop: `1px solid ${T.bd2}`, textAlign: 'right', fontFamily: T.mono, fontWeight: 700, color: T.ac2, whiteSpace: 'nowrap' }}>{money(componentCost(comp))}</td>
              <td style={{ ...td, borderTop: `1px solid ${T.bd2}` }} />
            </tr>
          </tbody>
        </table>
      </div>

      {supFor !== null && (
        <SupplierModal
          subName={comp.subs[supFor]?.name || ''}
          suppliers={comp.subs[supFor]?.suppliers || []}
          onClose={() => setSupFor(null)}
          onDone={next => { patchSub(supFor, { suppliers: next }); setSupFor(null); }}
        />
      )}
    </div>
  );
}
