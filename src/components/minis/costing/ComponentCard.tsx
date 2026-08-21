// One MAIN COMPONENT of a costing sheet: its name plus sub-components.
// Desktop shows the reference-screenshot table (Sub · Supplier · QTY · Unit ·
// Rate · Cost); the phone gets stacked cards instead of a sideways-scrolling
// table (owner: "optimize the best for mobile"). Rate lives on the supplier
// (each supplier has its own), so the rate cell edits the SELECTED supplier's
// rate; the supplier cell opens the multi-supplier editor. Compulsory fields
// show a red border LIVE — a zero rate is visible while typing, not only at
// save (owner: "rate cannot be zero").
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import {
  CostingComponent, CostingSub, CostingSupplier, CostingLibrary,
  UNITS, blankSub, selectedSupplier, subCost, componentCost, money, subProblems,
} from './costingModel';
import SupplierModal from './SupplierModal';

const BAD = '1px solid rgba(239,68,68,.55)';

export default function ComponentCard({ comp, library, onChange, onRemove }: {
  comp: CostingComponent;
  library: CostingLibrary;
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
  const patchCode = (i: number, materialCode: string) => {
    const s = comp.subs[i];
    const sel = selectedSupplier(s);
    const suppliers: CostingSupplier[] = sel
      ? s.suppliers.map(x => (x === sel ? { ...x, materialCode } : x))
      : [{ name: '', materialCode, rate: '', selected: true }];
    patchSub(i, { suppliers });
  };
  const removeSub = (i: number) => onChange({ ...comp, subs: comp.subs.filter((_, j) => j !== i) });
  const addSub = () => onChange({ ...comp, subs: [...comp.subs, blankSub()] });

  const cellIn = (bad: boolean): React.CSSProperties =>
    ({ ...S.fInput, width: '100%', minWidth: 0, ...(bad ? { border: BAD } : {}) });
  const th = { ...S.thStyle, padding: '8px 10px', whiteSpace: 'nowrap' as const };
  const td = { padding: '6px 8px', borderTop: `1px solid ${T.bd}`, verticalAlign: 'middle' as const };

  const supplierBtn = (s: CostingSub, i: number, bad: boolean) => {
    const sel = selectedSupplier(s);
    const extra = s.suppliers.filter(x => x.name.trim()).length - 1;
    return (
      <button onClick={() => setSupFor(i)}
        style={{ ...S.btnGhost, width: '100%', minHeight: 36, padding: '4px 10px', justifyContent: 'flex-start', textAlign: 'left', ...(bad ? { border: BAD } : {}) }}>
        <span style={{ fontSize: 12, color: sel?.name ? T.tx : T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
          {sel?.name || 'Select supplier *'}{extra > 0 ? ` +${extra}` : ''}
        </span>
      </button>
    );
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 170 }}>
          <label style={S.fLabel}>Main component <span style={{ color: T.re }}>*</span></label>
          <input value={comp.name} onChange={e => onChange({ ...comp, name: e.target.value })} list="costing-main-suggest"
            placeholder="e.g. Fabric / Stitching / Packing" style={cellIn(!comp.name.trim())} />
        </div>
        <button onClick={onRemove} style={{ ...S.btnDanger, ...S.btnSm, minHeight: 36 }}>Remove</button>
      </div>

      {/* Desktop: the reference table */}
      <div className="desktop-only" style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${T.bd}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead><tr>
            <th style={{ ...th, minWidth: 140 }}>Sub component</th>
            <th style={{ ...th, minWidth: 140 }}>Supplier</th>
            <th style={{ ...th, minWidth: 110 }}>Material code</th>
            <th style={{ ...th, width: 76 }}>QTY</th>
            <th style={{ ...th, width: 96 }}>Unit</th>
            <th style={{ ...th, width: 90 }}>Rate</th>
            <th style={{ ...th, width: 92, textAlign: 'right' }}>Cost</th>
            <th style={{ ...th, width: 36 }} />
          </tr></thead>
          <tbody>
            {comp.subs.map((s, i) => {
              const bad = subProblems(s);
              const sel = selectedSupplier(s);
              return (
                <tr key={i}>
                  <td style={td}><input value={s.name} onChange={e => patchSub(i, { name: e.target.value })} list="costing-sub-suggest" placeholder="e.g. Georgette 60&quot;" style={cellIn(bad.name)} /></td>
                  <td style={td}>{supplierBtn(s, i, bad.supplier)}</td>
                  <td style={td}><input value={sel?.materialCode ?? ''} onChange={e => patchCode(i, e.target.value)} placeholder="Code" style={{ ...cellIn(false), fontFamily: T.mono }} /></td>
                  <td style={td}><input value={s.qty} onChange={e => patchSub(i, { qty: e.target.value })} onKeyDown={e => numericKeyDown(e)} type="number" min="0" inputMode="decimal" placeholder="0" style={cellIn(bad.qty)} /></td>
                  <td style={td}>
                    <select value={s.unit} onChange={e => patchSub(i, { unit: e.target.value })} style={cellIn(bad.unit)}>
                      <option value="">Unit…</option>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={td}><input value={sel?.rate ?? ''} onChange={e => patchRate(i, e.target.value)} onKeyDown={e => numericKeyDown(e)} type="number" min="0" inputMode="decimal" placeholder="0" style={cellIn(bad.rate)} /></td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: T.mono, fontSize: 12, color: T.tx, whiteSpace: 'nowrap' }}>{money(subCost(s))}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span onClick={() => removeSub(i)} aria-label="Remove sub component" style={{ cursor: 'pointer', color: T.re, fontSize: 16, lineHeight: 1, padding: 4 }}>&#215;</span>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={6} style={{ ...td, borderTop: `1px solid ${T.bd2}` }}>
                <button onClick={addSub} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>+ Add sub component</button>
              </td>
              <td style={{ ...td, borderTop: `1px solid ${T.bd2}`, textAlign: 'right', fontFamily: T.mono, fontWeight: 700, color: T.ac2, whiteSpace: 'nowrap' }}>{money(componentCost(comp))}</td>
              <td style={{ ...td, borderTop: `1px solid ${T.bd2}` }} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Phone: stacked cards, nothing scrolls sideways */}
      <div className="mobile-only" style={{ flexDirection: 'column', gap: 8 }}>
        {comp.subs.map((s, i) => {
          const bad = subProblems(s);
          const sel = selectedSupplier(s);
          return (
            <div key={i} style={{ border: `1px solid ${T.bd}`, borderRadius: 8, padding: 10, background: 'rgba(255,255,255,0.015)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <input value={s.name} onChange={e => patchSub(i, { name: e.target.value })} list="costing-sub-suggest" placeholder="Sub component *" style={{ ...cellIn(bad.name), flex: 1 }} />
                <span onClick={() => removeSub(i)} aria-label="Remove sub component" style={{ cursor: 'pointer', color: T.re, fontSize: 18, lineHeight: 1, padding: '6px 4px' }}>&#215;</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                {supplierBtn(s, i, bad.supplier)}
                <input value={sel?.materialCode ?? ''} onChange={e => patchCode(i, e.target.value)} placeholder="Material code" style={{ ...cellIn(false), fontFamily: T.mono }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <input value={s.qty} onChange={e => patchSub(i, { qty: e.target.value })} onKeyDown={e => numericKeyDown(e)} type="number" min="0" inputMode="decimal" placeholder="QTY *" style={cellIn(bad.qty)} />
                <select value={s.unit} onChange={e => patchSub(i, { unit: e.target.value })} style={cellIn(bad.unit)}>
                  <option value="">Unit *</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input value={sel?.rate ?? ''} onChange={e => patchRate(i, e.target.value)} onKeyDown={e => numericKeyDown(e)} type="number" min="0" inputMode="decimal" placeholder="Rate *" style={cellIn(bad.rate)} />
              </div>
              <div style={{ textAlign: 'right', fontFamily: T.mono, fontSize: 12, color: T.tx, marginTop: 6 }}>Cost {money(subCost(s))}</div>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={addSub} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36 }}>+ Add sub component</button>
          <span style={{ fontFamily: T.mono, fontWeight: 700, color: T.ac2, fontSize: 12 }}>{money(componentCost(comp))}</span>
        </div>
      </div>

      {supFor !== null && (
        <SupplierModal
          subName={comp.subs[supFor]?.name || ''}
          suppliers={comp.subs[supFor]?.suppliers || []}
          known={library.suppliers}
          onClose={() => setSupFor(null)}
          onDone={next => { patchSub(supFor, { suppliers: next }); setSupFor(null); }}
        />
      )}
    </div>
  );
}
