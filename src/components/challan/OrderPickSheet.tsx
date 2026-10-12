// "Make challan" from an order: what goes on this challan. Every line still
// due is listed with how many to send now — all of it by default; set a
// line to 0 to leave it for later, or lower it to send part. Whatever is
// not sent stays on the order as pending. A bottom sheet on mobile.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import type { CashChallanOrder } from '../../types/database';
import { lineLeft } from './pendingOrdersModel';

export default function OrderPickSheet({ order, onClose, onPick }: {
  order: CashChallanOrder;
  onClose: () => void;
  /** Pieces per order line (same index as order.items) to put on the challan. */
  onPick: (picks: number[]) => void;
}) {
  const [picks, setPicks] = useState<number[]>(() => order.items.map(lineLeft));
  useModalLock(true);
  useBackClose(true, onClose);
  const set = (i: number, v: number) => setPicks(p => p.map((x, j) => (j === i ? Math.max(0, Math.min(lineLeft(order.items[i]), Math.round(v) || 0)) : x)));
  const total = picks.reduce((s, x) => s + x, 0);
  const due = order.items.reduce((s, it) => s + lineLeft(it), 0);
  const step: React.CSSProperties = { ...S.btnGhost, width: 44, minHeight: 44, padding: 0, fontSize: 18, lineHeight: 1 };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ minWidth: 0 }}>
            <div style={S.modalTitle}>What goes on this challan?</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.customer_name} · {due} pcs still due</div>
          </div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <form noValidate onSubmit={e => { e.preventDefault(); if (total > 0) onPick(picks); }} style={{ padding: '14px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button type="button" onClick={() => setPicks(order.items.map(lineLeft))} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>All</button>
            <button type="button" onClick={() => setPicks(order.items.map(() => 0))} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>None</button>
          </div>
          {order.items.map((it, i) => {
            const left = lineLeft(it);
            if (left <= 0) return null;   // already gone out in full
            const done = Number(it.delivered) || 0;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${picks[i] > 0 ? T.ac33 : T.bd}`, background: picks[i] > 0 ? T.ac3 : 'rgba(255,255,255,0.02)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontFamily: it.sku ? T.mono : T.sans, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sku || it.description}</div>
                  <div style={{ fontSize: 11, color: T.tx3 }}>{left} due{done > 0 ? ` · ${done} of ${it.quantity} already sent` : ''}</div>
                </div>
                <button type="button" onClick={() => set(i, picks[i] - 1)} disabled={picks[i] <= 0} aria-label={`One less ${it.sku || it.description}`} style={{ ...step, opacity: picks[i] <= 0 ? 0.35 : 1 }}>&#8722;</button>
                <input value={picks[i]} onChange={e => set(i, Number(e.target.value))} onKeyDown={e => numericKeyDown(e)} type="number" min="0" max={left} step="1" inputMode="numeric"
                  aria-label={`How many ${it.sku || it.description} on this challan`} style={{ ...S.fInput, width: 56, textAlign: 'center', fontFamily: T.mono, padding: '8px 4px' }} />
                <button type="button" onClick={() => set(i, picks[i] + 1)} disabled={picks[i] >= left} aria-label={`One more ${it.sku || it.description}`} style={{ ...step, opacity: picks[i] >= left ? 0.35 : 1 }}>+</button>
              </div>
            );
          })}
          {total < due && total > 0 && <div style={{ fontSize: 11, color: T.tx3, padding: '2px 2px 0' }}>{due - total} pcs stay on the order as pending.</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
            <button type="submit" disabled={total === 0} style={{ ...S.btnPrimary, flex: 1, minHeight: 44, opacity: total === 0 ? 0.5 : 1, pointerEvents: total === 0 ? 'none' : 'auto' }}>
              {total === 0 ? 'Pick at least one piece' : `Make challan · ${total} pcs`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body);
}
