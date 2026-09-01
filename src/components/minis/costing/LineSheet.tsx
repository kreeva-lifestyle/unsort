// The bottom-sheet editor for ONE material line (owner-approved redesign):
// tap a row → this opens with big qty/rate fields, unit pills, the selected
// supplier's material code, supplier tick-cards with the CHEAPEST badge and
// the cheaper-alternate nudge, and a live line cost. Edits write straight
// into the parent sheet state (nothing is lost if the sheet closes); the
// full supplier add/edit flow stays in SupplierModal, opened from here.
// House modal contract: portal + modal-inner (bottom sheet on mobile) +
// body scroll lock.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import {
  CostingSub, CostingSupplier, CostingLibrary, UNITS,
  selectedSupplier, subCost, subProblems, cheaperAlt, money, num,
} from './costingModel';
import SupplierModal from './SupplierModal';
import SuggestInput from '../../ui/SuggestInput';

const BAD = '1px solid rgba(239,68,68,.55)';

export default function LineSheet({ sub, compName, library, onChange, onRemove, onClose }: {
  sub: CostingSub;
  compName: string;
  library: CostingLibrary;
  onChange: (next: CostingSub) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [supOpen, setSupOpen] = useState(false);
  // SupplierModal removes modal-open when it closes — re-add while we're up.
  useEffect(() => {
    if (!supOpen) document.body.classList.add('modal-open');
    return () => { if (!supOpen) document.body.classList.remove('modal-open'); };
  }, [supOpen]);

  const sel = selectedSupplier(sub);
  const bad = subProblems(sub);
  const alt = cheaperAlt(sub);
  const patchSel = (p: Partial<CostingSupplier>) => {
    const suppliers = sel ? sub.suppliers.map(x => (x === sel ? { ...x, ...p } : x))
      : [{ name: '', materialCode: '', rate: '', selected: true, ...p }];
    onChange({ ...sub, suppliers });
  };
  const pick = (i: number) => onChange({ ...sub, suppliers: sub.suppliers.map((x, j) => ({ ...x, selected: j === i })) });
  const named = sub.suppliers.map((x, i) => ({ x, i })).filter(v => v.x.name.trim());
  const rates = named.map(v => num(v.x.rate)).filter(r => r > 0);
  const minRate = rates.length > 1 ? Math.min(...rates) : 0;

  const fld = (b: boolean): React.CSSProperties => ({ ...S.fInput, width: '100%', fontSize: 15, height: 42, ...(b ? { border: BAD } : {}) });
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 480 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ ...S.modalTitle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub.name.trim() || 'New line'}</span>
            <span style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>{compName.trim() || 'component'}</span>
          </div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
          <label style={S.fLabel}>Sub component <span style={{ color: T.re }}>*</span></label>
          <SuggestInput value={sub.name} onChange={v => onChange({ ...sub, name: v })} options={library.subs}
            placeholder='e.g. Georgette 60"' style={{ ...fld(bad.name), marginBottom: 12 }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={S.fLabel}>Qty <span style={{ color: T.re }}>*</span></label>
              <input value={sub.qty} onChange={e => onChange({ ...sub, qty: e.target.value })} onKeyDown={e => numericKeyDown(e)}
                type="number" min="0" enterKeyHint="next" placeholder="0" style={fld(bad.qty)} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {UNITS.map(u => (
                  <button key={u} onClick={() => onChange({ ...sub, unit: u })}
                    style={{ ...S.btnGhost, ...S.btnSm, minHeight: 28, borderRadius: 999, padding: '4px 12px',
                      ...(sub.unit === u ? { borderColor: T.ac, color: T.ac2, background: 'rgba(99,102,241,.1)' } : bad.unit ? { border: BAD } : {}) }}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={S.fLabel}>Rate (today&rsquo;s) <span style={{ color: T.re }}>*</span></label>
              <input value={sel?.rate ?? ''} onChange={e => patchSel({ rate: e.target.value })} onKeyDown={e => numericKeyDown(e)}
                type="number" min="0" enterKeyHint="done" placeholder="0" style={fld(bad.rate)} />
              <label style={{ ...S.fLabel, marginTop: 8, display: 'block' }}>Material code</label>
              <input value={sel?.materialCode ?? ''} onChange={e => patchSel({ materialCode: e.target.value })}
                placeholder="Code" style={{ ...fld(false), fontFamily: T.mono, height: 36, fontSize: 13 }} />
            </div>
          </div>

          <label style={S.fLabel}>Suppliers — tick the one that prices this {bad.supplier && <span style={{ color: T.re }}>*</span>}</label>
          {named.map(({ x, i }) => (
            <div key={i} onClick={() => pick(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.s2, border: `1px solid ${x === sel ? 'rgba(99,102,241,.45)' : T.bd2}`, borderRadius: 12, padding: '10px 12px', marginTop: 8, cursor: 'pointer' }}>
              <input type="radio" readOnly checked={x === sel} style={{ width: 18, height: 18, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>
                  {x.name}
                  {minRate > 0 && num(x.rate) === minRate && <span style={{ fontSize: 8, fontWeight: 800, color: T.gr, border: '1px solid oklch(0.72 0.19 145 / .35)', borderRadius: 4, padding: '2px 5px', marginLeft: 6, verticalAlign: 2 }}>CHEAPEST</span>}
                </div>
                {x.materialCode.trim() && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{x.materialCode}</div>}
              </div>
              <span style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: x === sel ? T.ac2 : T.tx }}>{money(num(x.rate))}</span>
            </div>
          ))}
          <button onClick={() => setSupOpen(true)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, marginTop: 8 }}>
            {named.length ? 'Edit suppliers' : '+ Add supplier *'}
          </button>
          {alt && (
            <div style={{ background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .25)', borderRadius: 10, padding: '9px 11px', fontSize: 11, color: T.yl, marginTop: 10, lineHeight: 1.5 }}>
              Tip: {alt.name} is {money(alt.saving)}/{sub.unit || 'unit'} cheaper — {money(alt.saving * num(sub.qty))} saved per piece. Tick to switch, or keep your primary if quality/terms are better.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${T.bd}`, paddingTop: 12, marginTop: 14, fontSize: 12, color: T.tx2 }}>
            <span>Line cost</span>
            <span style={{ fontFamily: T.mono }}><b style={{ color: T.ac2, fontSize: 14 }}>{money(subCost(sub))}</b> · {num(sub.qty) || 0} {sub.unit || '?'} × {money(num(sel?.rate))}</span>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={() => { onRemove(); onClose(); }} style={{ ...S.btnDanger, minHeight: 44 }}>Delete</button>
            <button onClick={onClose} style={{ ...S.btnPrimary, flex: 1, minHeight: 44 }}>Done</button>
          </div>
        </div>
      </div>
      {supOpen && (
        <SupplierModal subName={sub.name} suppliers={sub.suppliers} known={library.suppliers}
          onClose={() => setSupOpen(false)}
          onDone={next => { onChange({ ...sub, suppliers: next }); setSupOpen(false); }} />
      )}
    </div>,
    document.body,
  );
}
