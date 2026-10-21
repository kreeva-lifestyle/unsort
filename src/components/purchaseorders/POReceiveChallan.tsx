// Receive one vendor challan against several POs at once (owner's ask: a
// challan often covers several orders — 14 challans covered 40 POs, each
// received one PO at a time). Pick the vendor (or come in with one), type the
// challan number, tick the orders on it — a tick fills each line with what is
// still to come, editable — and confirm: one transaction books every order
// (receive_po_challan → receive_po_items per PO), the challan number on every
// receipt. Before writing, the received totals are re-read: if someone else
// received on one of these orders meanwhile, the numbers refresh and the user
// confirms again (as POReceive does).
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { useBackClose } from '../../hooks/useBackClose';
import { useModalLock } from '../../hooks/useModalLock';
import DateInput from '../ui/DateInput';
import { fileDate } from '../../lib/exportName';
import { itemLabel } from './poItemLabel';
import { fmtQty, unitOf } from './poStats';
import { shortDate } from './POHeaderInfo';
import { STATUS_DOT } from './poSections';
import POChallanVendors, { OPEN, type ChallanVendor } from './POChallanVendors';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

type Line = Pick<PurchaseOrderItem, 'id' | 'item_name' | 'fabric_code' | 'sku' | 'unit' | 'quantity' | 'received_qty' | 'cancelled_at' | 'sort_order'>;
type OpenPo = Pick<PurchaseOrder, 'id' | 'po_number' | 'po_date' | 'status' | 'vendor_id' | 'vendor_name'> & { purchase_order_items: Line[] };
const n = (v: unknown) => Number(v || 0);
const left = (l: Line) => Math.max(0, n(l.quantity) - n(l.received_qty));
const live = (po: OpenPo) => po.purchase_order_items.filter(l => !l.cancelled_at).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

export default function POReceiveChallan({ vendor: given, poId, challanNo, onClose, onReceived, addToast }: {
  /** The vendor, when opened from one of its orders; null = pick one first. */
  vendor: ChallanVendor | null;
  /** An order to tick from the start. */
  poId?: string;
  challanNo?: string;
  onClose: () => void;
  onReceived: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [vendor, setVendor] = useState<ChallanVendor | null>(given);
  const [pos, setPos] = useState<OpenPo[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, string>>({});
  const [challan, setChallan] = useState(challanNo ?? '');
  const [date, setDate] = useState(fileDate());
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  useModalLock();
  useBackClose(true, onClose);
  useEffect(() => { if (error) errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);

  // The vendor's open orders — matched the way the server matches them (vendor record, else the typed name).
  const loadPos = async (v: ChallanVendor): Promise<OpenPo[] | null> => {
    let q = supabase.from('purchase_orders').select('id, po_number, po_date, status, vendor_id, vendor_name, purchase_order_items(id, item_name, fabric_code, sku, unit, quantity, received_qty, cancelled_at, sort_order)')
      .in('status', OPEN).order('po_number');
    q = v.id ? q.eq('vendor_id', v.id) : q.is('vendor_id', null).ilike('vendor_name', v.name.trim());
    const { data, error: e } = await q;
    if (e) { setError(friendlyError(e)); return null; }
    return ((data as unknown as OpenPo[] | null) ?? []).filter(po => live(po).some(l => left(l) > 0));
  };
  useEffect(() => {
    if (!vendor) return;
    let alive = true;
    loadPos(vendor).then(list => {
      if (!alive || !list) return;
      setPos(list);
      const first = list.find(po => po.id === poId);
      if (first) { setTicked(new Set([first.id])); setQty(Object.fromEntries(live(first).map(l => [l.id, String(left(l))]))); }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once per vendor
  }, [vendor]);

  // A tick fills the order's lines with what is still to come; an untick clears them.
  const tick = (po: OpenPo) => {
    const on = !ticked.has(po.id);
    setTicked(s => { const x = new Set(s); if (on) x.add(po.id); else x.delete(po.id); return x; });
    setQty(m => ({ ...m, ...Object.fromEntries(live(po).map(l => [l.id, on ? String(left(l)) : ''])) }));
  };
  const lines = (pos ?? []).filter(po => ticked.has(po.id)).flatMap(po => live(po).map(l => ({ l, q: parseFloat(qty[l.id] || '') || 0 }))).filter(x => x.q > 0);
  const orders = new Set((pos ?? []).filter(po => ticked.has(po.id) && live(po).some(l => (parseFloat(qty[l.id] || '') || 0) > 0)).map(po => po.id)).size;

  const submit = async () => {
    if (saving || !vendor || !pos) return;
    setError('');
    const no = challan.trim();
    if (!no) { setError('Enter the challan number'); return; }
    if (!lines.length) { setError('Tick the orders on this challan and enter what arrived'); return; }
    setSaving(true);
    try {
      // Stale guard: someone received on one of these orders while this was open.
      const { data: fresh, error: fe } = await supabase.from('purchase_order_items').select('id, received_qty').in('id', lines.map(x => x.l.id));
      if (fe) throw fe;
      const now = new Map(((fresh as { id: string; received_qty: number }[] | null) ?? []).map(r => [r.id, n(r.received_qty)]));
      if (lines.some(x => now.get(x.l.id) !== n(x.l.received_qty))) {
        const list = await loadPos(vendor);
        if (list) setPos(list);
        setError('Someone just received on one of these orders — the numbers above are now up to date; check the quantities and confirm again.');
        setSaving(false);
        return;
      }
      const { error: e } = await supabase.rpc('receive_po_challan', { p_challan_no: no, p_receipt_date: date || null, p_remarks: remarks.trim() || null, p_lines: lines.map(x => ({ po_item_id: x.l.id, received_qty: x.q })) });
      if (e) throw e;
      addToast(`Challan ${no} received on ${orders} order${orders === 1 ? '' : 's'}`, 'success');
      onReceived();
    } catch (e) { setError(friendlyError(e)); setSaving(false); return; }
    setSaving(false);
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Receive a challan{vendor ? ` · ${vendor.name}` : ''}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          {!vendor ? <POChallanVendors onPick={setVendor} onError={e => setError(friendlyError(e))} /> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                <div><label style={S.fLabel}>Challan no. *</label><input value={challan} onChange={e => setChallan(e.target.value)} maxLength={40} autoFocus={!challanNo} placeholder="e.g. TK/4411" style={{ ...S.fInput, fontFamily: T.mono }} /></div>
                <div><label style={S.fLabel}>Receipt date</label><DateInput value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%' }} /></div>
                <div><label style={S.fLabel}>Remarks</label><input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional" style={S.fInput} /></div>
              </div>
              <label style={S.fLabel}>Orders on this challan</label>
              {pos === null && <div style={{ fontSize: 12, color: T.tx3, padding: '20px 0', textAlign: 'center' }}>Loading…</div>}
              {pos?.length === 0 && <div style={{ fontSize: 12, color: T.tx3, padding: '20px 0', textAlign: 'center' }}>{vendor.name} has nothing still to come.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                {pos?.map(po => {
                  const on = ticked.has(po.id), st = STATUS_DOT[po.status];
                  const due = live(po).filter(l => left(l) > 0);
                  const units = new Set(due.map(l => unitOf(l.unit)));
                  return (
                    <div key={po.id} style={{ border: `1px solid ${on ? T.ac3 : T.bd}`, borderRadius: 10, background: on ? T.glass2 : T.glass1 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minHeight: 44, cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={() => tick(po)} style={{ accentColor: T.ac, width: 16, height: 16, margin: 0 }} />
                        <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.tx }}>PO #{po.po_number}</span>
                        <span style={{ fontSize: 11, color: T.tx3 }}>{shortDate(po.po_date)}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: st.color }}><span style={{ width: 8, height: 8, borderRadius: 999, background: st.color }} />{st.label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.tx3 }}>{units.size === 1 ? `${fmtQty(due.reduce((t, l) => t + left(l), 0))} ${[...units][0]} to come` : `${due.length} items to come`}</span>
                      </label>
                      {on && live(po).map(l => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: `1px solid ${T.bd}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemLabel(l)}</div>
                            <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, marginTop: 2 }}>Ordered {fmtQty(n(l.quantity))} {unitOf(l.unit)} · Received {fmtQty(n(l.received_qty))} · <span style={{ color: left(l) > 0 ? T.yl : T.gr }}>Remaining {fmtQty(left(l))}</span></div>
                          </div>
                          <input value={qty[l.id] ?? ''} onChange={e => setQty(m => ({ ...m, [l.id]: e.target.value }))} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') submit(); }}
                            inputMode="decimal" placeholder="0" aria-label={`Received now — ${itemLabel(l)}`} style={{ ...S.fInput, width: 84, fontFamily: T.mono, textAlign: 'right' }} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {error && <div ref={errRef} style={{ marginTop: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {vendor && !given && <button type="button" onClick={() => { setVendor(null); setPos(null); setTicked(new Set()); setQty({}); }} style={{ ...S.btnGhost, minHeight: 44, marginRight: 'auto' }}>Other vendor</button>}
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          {vendor && <button type="button" onClick={submit} disabled={saving} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : orders > 1 ? `Receive on ${orders} orders` : 'Confirm receipt'}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
