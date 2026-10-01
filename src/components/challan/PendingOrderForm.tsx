// New / edit pending order: customer (the last five customers as one-tap
// pills, then suggestions from the challan customers as you type), item
// lines (SKU · qty — no price and no description, owner's call), notes.
// A bottom sheet on mobile like every modal here.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import { friendlyError } from '../../lib/friendlyError';
import { logSwallowed } from '../../lib/errorLogger';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import SkuInput from '../ui/SkuInput';
import SuggestInput from '../ui/SuggestInput';
import type { CashChallanOrder, CashChallanOrderItem } from '../../types/database';
import { blankItem, orderProblem, saveOrder, searchOrderCustomers, recentCustomers, type RecentCustomer } from './pendingOrdersModel';

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
  const [custs, setCusts] = useState<RecentCustomer[]>([]);
  const [recent, setRecent] = useState<RecentCustomer[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useModalLock(true);
  useBackClose(true, onClose);

  // The pills are a convenience: a failed lookup leaves a plain form.
  useEffect(() => { recentCustomers().then(setRecent).catch(e => logSwallowed('Recent customer pills', e)); }, []);
  // Suggestions follow the typed name (debounced); picking one links the
  // customer id and fills the phone, like the challan form.
  useEffect(() => {
    const q = customerName.trim();
    if (q.length < 2 || custs.some(c => c.name === q)) return;
    const t = setTimeout(() => { searchOrderCustomers(q).then(setCusts).catch(e => addToast(friendlyError(e), 'error')); }, 250);
    return () => clearTimeout(t);
  }, [customerName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any edit clears the last validation message — it is re-checked on Save.
  const pickCustomer = (c: RecentCustomer) => { setError(''); setCustomerName(c.name); setCustomerId(c.id); if (c.phone && !customerPhone) setCustomerPhone(c.phone); };
  const patch = (i: number, p: Partial<CashChallanOrderItem>) => { setError(''); setItems(list => list.map((it, j) => (j === i ? { ...it, ...p } : it))); };

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
      <div className="modal-inner" style={{ ...S.modalBox, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>{editing ? 'Edit pending order' : 'New pending order'}</div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <form noValidate onSubmit={e => { e.preventDefault(); save(); }} style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={S.fLabel}>Customer *</label>
            <SuggestInput value={customerName} options={custs.map(c => c.name)} placeholder="Customer name"
              onChange={v => { setError(''); setCustomerName(v); if (customerId && custs.find(c => c.id === customerId)?.name !== v) setCustomerId(null); }}
              onPick={v => { const c = custs.find(x => x.name === v); if (c) pickCustomer(c); }}
              style={{ ...S.fInput, width: '100%' }} inputProps={{ autoFocus: !editing, autoComplete: 'off' }} />
            {!customerName.trim() && recent.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {recent.map(c => (
                  <button key={c.id ?? c.name} type="button" className="touch44" onClick={() => pickCustomer(c)} aria-label={`Use customer ${c.name}`}
                    style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, padding: '6px 12px', fontSize: 11, borderRadius: 999 }}>{c.name}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={S.fLabel}>Phone</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} inputMode="tel" placeholder="Optional" style={{ ...S.fInput, width: '100%' }} />
          </div>
          <div>
            <label style={S.fLabel}>Items *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 76px 44px', gap: 6, alignItems: 'center' }}>
                  <SkuInput value={it.sku} onChange={v => patch(i, { sku: v })} placeholder="SKU" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
                  <input value={it.quantity} onChange={e => patch(i, { quantity: Number(e.target.value) })} onKeyDown={e => numericKeyDown(e)} type="number" min="1" step="1" inputMode="numeric" placeholder="Qty" aria-label="Quantity" style={{ ...S.fInput, width: '100%', fontFamily: T.mono, textAlign: 'center' }} />
                  <button type="button" onClick={() => setItems(list => list.length === 1 ? [blankItem()] : list.filter((_, j) => j !== i))} aria-label="Remove item"
                    style={{ border: 'none', background: 'none', color: T.re, opacity: 0.7, fontSize: 20, cursor: 'pointer', width: 44, minHeight: 44 }}>&#215;</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems(list => [...list, blankItem()])} style={{ ...S.btnGhost, marginTop: 8, borderStyle: 'dashed', minHeight: 40 }}>+ Add item</button>
          </div>
          <div>
            <label style={S.fLabel}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Colour, delivery date, anything to remember…"
              style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 56, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          {error && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...S.btnPrimary, flex: 1, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save order'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body);
}
