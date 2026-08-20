// Suppliers for ONE sub-component: several suppliers, each with its own
// material code and rate; the radio picks which one PRICES the sheet (the
// others stay as alternates the purchase plan can fall back to by hand).
// House modal contract: portal, modal-inner, body scroll lock, full reset on
// close (state is a working copy — Cancel discards, Done commits).
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import { CostingSupplier, blankSupplier, num } from './costingModel';

export default function SupplierModal({ subName, suppliers, onDone, onClose }: {
  subName: string;
  suppliers: CostingSupplier[];
  onDone: (next: CostingSupplier[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CostingSupplier[]>(() =>
    suppliers.length ? suppliers.map(s => ({ ...s })) : [blankSupplier()]);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const patch = (i: number, p: Partial<CostingSupplier>) =>
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const select = (i: number) =>
    setRows(prev => prev.map((r, j) => ({ ...r, selected: j === i })));
  const remove = (i: number) =>
    setRows(prev => {
      const next = prev.filter((_, j) => j !== i);
      // The selected supplier must survive a delete — fall to the first row.
      if (next.length && !next.some(r => r.selected)) next[0] = { ...next[0], selected: true };
      return next.length ? next : [blankSupplier()];
    });

  const done = () => {
    const kept = rows.filter(r => r.name.trim() || r.materialCode.trim() || String(r.rate).trim());
    if (kept.length === 0) { setError('Add at least one supplier'); return; }
    const sel = kept.find(r => r.selected) ?? kept[0];
    if (!sel.name.trim()) { setError('The selected supplier needs a name'); return; }
    if (!(num(sel.rate) > 0)) { setError('The selected supplier needs a rate above 0'); return; }
    onDone(kept.map(r => ({ ...r, selected: r === sel })));
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>Suppliers — {subName || 'sub component'}</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
          <div style={{ fontSize: 10.5, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>
            The ticked supplier&rsquo;s rate prices the sheet; the others are alternates, each with its own material code.
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <input type="radio" name="sel-supplier" checked={!!r.selected} onChange={() => select(i)}
                aria-label="Use this supplier's rate" style={{ width: 18, height: 18, flexShrink: 0 }} />
              <input value={r.name} onChange={e => patch(i, { name: e.target.value })} placeholder="Supplier"
                style={{ ...S.fInput, flex: 2, minWidth: 0 }} />
              <input value={r.materialCode} onChange={e => patch(i, { materialCode: e.target.value })} placeholder="Material code"
                style={{ ...S.fInput, flex: 2, minWidth: 0, fontFamily: T.mono }} />
              <input value={r.rate} onChange={e => patch(i, { rate: e.target.value })} onKeyDown={e => numericKeyDown(e)}
                type="number" inputMode="decimal" placeholder="Rate" style={{ ...S.fInput, flex: 1, minWidth: 64 }} />
              <span onClick={() => remove(i)} aria-label="Remove supplier"
                style={{ cursor: 'pointer', color: T.re, fontSize: 16, lineHeight: 1, padding: '4px 2px' }}>&#215;</span>
            </div>
          ))}
          <button onClick={() => setRows(prev => [...prev, { ...blankSupplier(), selected: false }])}
            style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>+ Add supplier</button>
          {error && (
            <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginTop: 10 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={onClose} style={{ ...S.btnGhost, flex: 1, minHeight: 44 }}>Cancel</button>
            <button onClick={done} style={{ ...S.btnPrimary, flex: 1, minHeight: 44 }}>Done</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
