// Receive goods against a PO — the "payments" analog. Per line item shows
// Ordered / Received / Remaining and an input for the qty arriving now
// (defaults to remaining; over-receipt is ALLOWED — a 54 m order may deliver
// 57 m, shown as "+N extra"). One shared date + remarks → receive_po_items.
// Before writing we re-check the server's received totals: if another user
// recorded a receipt while this modal was open, the pre-filled quantities are
// stale and confirming would silently double the tally.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import DateInput from '../ui/DateInput';
import { poAuditLog } from './poAudit';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

export default function POReceive({ po, items, onClose, onReceived, addToast }: {
  po: PurchaseOrder;
  items: PurchaseOrderItem[];
  onClose: () => void;
  onReceived: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  // Live received totals — starts from the snapshot passed in, refreshed from
  // the server just before submit (see the stale-receipt guard below).
  const [liveRecvd, setLiveRecvd] = useState<Record<string, number>>(() => Object.fromEntries(items.map(it => [it.id, Number(it.received_qty || 0)])));
  const recvdOf = (it: PurchaseOrderItem) => liveRecvd[it.id] ?? Number(it.received_qty || 0);
  const remainingOf = (it: PurchaseOrderItem) => Math.max(0, Number(it.quantity) - recvdOf(it));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(items.map(it => [it.id, String(Math.max(0, Number(it.quantity) - Number(it.received_qty || 0)))])));
  const [date, setDate] = useState(localToday());
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.body.classList.add('modal-open'); return () => { document.body.classList.remove('modal-open'); }; }, []);

  const submit = async () => {
    if (saving) return;
    setError('');
    const receipts = items
      .map(it => ({ it, q: num(qty[it.id] || '') }))
      .filter(({ q }) => q > 0)
      .map(({ it, q }) => ({ po_item_id: it.id, received_qty: q }));
    if (receipts.length === 0) { setError('Enter a received quantity for at least one item'); return; }
    // Over-receipt is allowed — a 54 m order may deliver 57 m. No remaining cap.
    setSaving(true);
    // Stale-receipt guard: if someone else received against this PO while the
    // modal was open, the pre-filled "remaining" quantities would double-count.
    // Refresh the totals and make the user confirm against the fresh numbers.
    try {
      const { data: fresh, error: fe } = await supabase.from('purchase_order_items').select('id, received_qty').eq('po_id', po.id);
      if (fe) throw new Error(fe.message);
      const freshMap = Object.fromEntries(((fresh as { id: string; received_qty: number }[] | null) || []).map(r => [r.id, Number(r.received_qty || 0)]));
      const changed = items.some(it => (freshMap[it.id] ?? 0) !== recvdOf(it));
      if (changed) {
        setLiveRecvd(freshMap);
        setError('Received totals just changed — someone else recorded a receipt on this PO. The numbers above are now up to date; review your quantities and confirm again.');
        setSaving(false);
        return;
      }
    } catch (e) { setError(friendlyError(e)); setSaving(false); return; }
    try {
      const p_receipts = receipts.map(r => ({ ...r, receipt_date: date || null, remarks: remarks.trim() || null }));
      const { error: e } = await supabase.rpc('receive_po_items', { p_po_id: po.id, p_receipts });
      if (e) throw new Error(e.message);
      const totalQty = receipts.reduce((s, r) => s + r.received_qty, 0);
      await poAuditLog('RECEIVE', po.id, `PO #${po.po_number} — received ${totalQty} across ${receipts.length} item${receipts.length === 1 ? '' : 's'}`);
      addToast('Receipt recorded', 'success');
      onReceived();
    } catch (e) { setError(friendlyError(e)); setSaving(false); return; }
    setSaving(false);
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Receive — PO #{po.po_number}</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&times;</span>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(it => {
              const rem = remainingOf(it);
              const recvd = recvdOf(it);
              const over = recvd - Number(it.quantity);
              return (
                <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.item_name}</div>
                    <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, marginTop: 2 }}>
                      Ordered {Number(it.quantity)}{it.unit ? ` ${it.unit}` : ''} · Received {recvd} · {over > 0
                        ? <span style={{ color: T.yl }}>+{over} extra</span>
                        : <span style={{ color: rem <= 0 ? T.gr : T.yl }}>Remaining {rem}</span>}
                    </div>
                  </div>
                  <input
                    value={qty[it.id] ?? ''}
                    onChange={e => setQty(m => ({ ...m, [it.id]: e.target.value }))}
                    onKeyDown={e => numericKeyDown(e)}
                    inputMode="decimal"
                    placeholder="0"
                    style={{ ...S.fInput, width: 80, fontFamily: T.mono, textAlign: 'right' }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 12 }}>
            <div><label style={S.fLabel}>Receipt date</label><DateInput value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%' }} /></div>
            <div><label style={S.fLabel}>Remarks</label><input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional (e.g. courier, invoice #)" style={S.fInput} /></div>
          </div>
          {error && <div style={{ marginTop: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Confirm receipt'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
