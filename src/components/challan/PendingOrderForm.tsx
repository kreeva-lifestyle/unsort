// New / edit pending order: customer (with suggestions from the challan
// customers), item lines (SKU · description · qty — no price, that comes
// with the challan), notes. A bottom sheet on mobile like every modal here.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import SkuInput from '../ui/SkuInput';
import SuggestInput from '../ui/SuggestInput';
import type { CashChallanOrder, CashChallanOrderItem } from '../../types/database';
import { blankItem, orderProblem, saveOrder, searchOrderCustomers } from './pendingOrdersModel';

type Cust = { id: string; name: string; phone: string | null };

export default function PendingOrderForm({ editing, onClose, onSaved, addToast }: {
  editing: CashChallanOrder | null;
  onClose: () => void;
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [customerName, setCustomerName] = useState(editing?.customer_name ?? '');
  const [customerId, setCustomerId] = useState<string | null>(editing?.customer_id ?? null);
  const [customerPhone, setCustomerPhone] = useState(editing?.customer_phone ?? '');
  const [items, setItems] = useState<CashChallanOrderItem[]>(editing?.items.length ? editing.items.map(it => ({ ...it })) : [blankItem()]);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [custs, setCusts] = useState<Cust[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useModalLock(true);
  useBackClose(true, onClose);

  // Customer suggestions follow the typed name (debounced); picking one
  // links the customer id and fills the phone, like the challan form.
  useEffect(() => {
    const q = customerName.trim();
    if (q.length < 2 || custs.some(c => c.name === q)) return;
    const t = setTimeout(() => { searchOrderCustomers(q).then(setCusts).catch(e => addToast(friendlyError(e), 'error')); }, 250);
    return () => clearTimeout(t);
  }, [customerName]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (i: number, p: Partial<CashChallanOrderItem>) => setItems(list => list.map((it, j) => (j === i ? { ...it, ...p } : it)));

  const save = async () => {
    if (saving) return;
    const problem = orderProblem(customerName, items);
    if (problem) { setError(problem); return; }
    setError(''); setSaving(true);
    try {
      await saveOrder({ id: editing?.id, customer_id: customerId, customer_name: customerName, customer_phone: customerPhone, items, notes });
      addToast(editing ? 'Order updated' : 'Pending order saved', 'success');
      onSaved();
    } catch (e) { setError(friendlyError(e)); }
    setSaving(false);
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>{editing ? 'Edit pending order' : 'New pending order'}</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }} aria-label="Close">&#215;</span>
        </div>
        <form noValidate onSubmit={e => { e.preventDefault(); save(); }} style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={S.fLabel}>Customer *</label>
            <SuggestInput value={customerName} options={custs.map(c => c.name)} placeholder="Customer name"
              onChange={v => { setCustomerName(v); if (customerId && custs.find(c => c.id === customerId)?.name !== v) setCustomerId(null); }}
              onPick={v => { const c = custs.find(x => x.name === v); if (c) { setCustomerId(c.id); if (c.phone && !customerPhone) setCustomerPhone(c.phone); } }}
              style={{ ...S.fInput, width: '100%' }} inputProps={{ autoFocus: !editing, autoComplete: 'off' }} />
          </div>
          <div>
            <label style={S.fLabel}>Phone</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} inputMode="tel" placeholder="Optional" style={{ ...S.fInput, width: '100%' }} />
          </div>
          <div>
            <label style={S.fLabel}>Items *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px 32px', gap: 6, alignItems: 'center' }}>
                  <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                    <SkuInput value={it.sku} onChange={v => patch(i, { sku: v })} placeholder="SKU" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
                    <input value={it.description} onChange={e => patch(i, { description: e.target.value })} placeholder="Description" style={{ ...S.fInput, width: '100%' }} />
                  </div>
                  <input value={it.quantity} onChange={e => patch(i, { quantity: Number(e.target.value) })} onKeyDown={e => numericKeyDown(e)} type="number" min="1" step="1" inputMode="numeric" placeholder="Qty" aria-label="Quantity" style={{ ...S.fInput, width: '100%', fontFamily: T.mono, textAlign: 'center' }} />
                  <button type="button" onClick={() => setItems(list => list.length === 1 ? [blankItem()] : list.filter((_, j) => j !== i))} aria-label="Remove item"
                    style={{ border: 'none', background: 'none', color: T.re, opacity: 0.7, fontSize: 18, cursor: 'pointer', minHeight: 44 }}>&#215;</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems(list => [...list, blankItem()])} style={{ ...S.btnGhost, ...S.btnSm, marginTop: 8, borderStyle: 'dashed', minHeight: 36 }}>+ Add item</button>
          </div>
          <div>
            <label style={S.fLabel}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Colour, delivery date, anything to remember…"
              style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 56, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          {error && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...S.btnPrimary, minHeight: 44, minWidth: 120, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save order'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body);
}
