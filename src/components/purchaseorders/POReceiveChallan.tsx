// Receive one vendor challan against several POs at once (owner's ask: a
// challan often covers several orders — 14 challans covered 40 POs, each
// received one PO at a time). Pick the vendor (or come in with one), type the
// challan number, tick the orders on it — a tick fills each line with what is
// still to come, editable — and confirm: one transaction books every order
// (receive_po_challan → receive_po_items per PO), the challan number on every
// receipt. Before writing, the received totals are re-read: if someone else
// received on one of these orders meanwhile, the numbers refresh and the user
// confirms again (as POReceive does). Each order shows what is on it before it
// is ticked (POChallanOrders), and a challan number this vendor's receipts
// already carry is pointed out (POChallanSeen). A tap outside the sheet does
// not close it — what was typed would be lost.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useBackClose } from '../../hooks/useBackClose';
import { useModalLock } from '../../hooks/useModalLock';
import DateInput from '../ui/DateInput';
import { fileDate } from '../../lib/exportName';
import POChallanVendors, { OPEN, type ChallanVendor } from './POChallanVendors';
import POChallanOrders, { CHALLAN_COLS, n, left, live, type OpenPo } from './POChallanOrders';
import ChallanSeenNote, { useChallanSeen } from './POChallanSeen';

/** What was typed in a PO's receive sheet before "Receive them together": it carries over
 *  (`recvd`: what each line had received when it was typed — the quantities hold only while that is unchanged). */
export type ChallanStart = { challanNo: string; date: string; remarks: string; qty: Record<string, string>; recvd: Record<string, number> };

export default function POReceiveChallan({ vendor: given, poId, init, onClose, onReceived, addToast }: {
  /** The vendor, when opened from one of its orders; null = pick one first. */
  vendor: ChallanVendor | null;
  /** An order to tick from the start. */
  poId?: string;
  init?: ChallanStart;
  onClose: () => void;
  onReceived: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [vendor, setVendor] = useState<ChallanVendor | null>(given);
  const [pos, setPos] = useState<OpenPo[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, string>>({});
  const [challan, setChallan] = useState(init?.challanNo ?? '');
  const [date, setDate] = useState(init?.date || fileDate());
  const [remarks, setRemarks] = useState(init?.remarks ?? '');
  // A failed read of the orders offers a retry instead of a sheet stuck on "Loading…".
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  const seen = useChallanSeen(vendor, challan);
  useModalLock();
  useBackClose(true, onClose);
  useEffect(() => { if (error) errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);

  // The vendor's open orders — matched the way the server matches them (vendor record, else the typed name).
  const loadPos = async (v: ChallanVendor): Promise<OpenPo[] | null> => {
    let q = supabase.from('purchase_orders').select(CHALLAN_COLS)
      .in('status', OPEN).order('po_number');
    q = v.id ? q.eq('vendor_id', v.id) : q.is('vendor_id', null).ilike('vendor_name', v.name.trim());
    const { data, error: e } = await q;
    if (e) { setError(friendlyError(e)); return null; }
    return ((data as unknown as OpenPo[] | null) ?? []).filter(po => live(po).some(l => left(l) > 0));
  };
  useEffect(() => {
    if (!vendor) return;
    let alive = true;
    setLoadFailed(false);
    loadPos(vendor).then(list => {
      if (!alive) return;
      if (!list) { setLoadFailed(true); return; }
      setPos(list);
      // The order it was opened from comes ticked, with what was typed for it — unless someone received on it
      // since (then what is still to come, and the user is told).
      const first = list.find(po => po.id === poId);
      if (!first) return;
      const moved = !!init && live(first).some(l => init.recvd[l.id] === undefined || Math.abs(n(l.received_qty) - init.recvd[l.id]) > 1e-6);
      setTicked(new Set([first.id]));
      setQty(Object.fromEntries(live(first).map(l => [l.id, (moved ? undefined : init?.qty[l.id]) ?? String(left(l))])));
      if (moved) setError(`PO #${first.po_number} changed since you opened it — the quantities now show what is still to come. Check them before you confirm.`);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once per vendor (and on Retry)
  }, [vendor, reload]);

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
      // Stale guard: someone received on one of these orders, or cancelled one of its items, while this was open.
      const { data: fresh, error: fe } = await supabase.from('purchase_order_items').select('id, received_qty, cancelled_at').in('id', lines.map(x => x.l.id));
      if (fe) throw fe;
      const now = new Map(((fresh as { id: string; received_qty: number; cancelled_at: string | null }[] | null) ?? []).map(r => [r.id, r]));
      if (lines.some(x => { const r = now.get(x.l.id); return !r || !!r.cancelled_at || n(r.received_qty) !== n(x.l.received_qty); })) {
        const list = await loadPos(vendor);
        // A failed re-read keeps its own error (set by loadPos) rather than claiming the numbers are fresh.
        if (list) { setPos(list); setError('One of these orders changed while this was open (a receipt, or an item cancelled) — the list above is now up to date; check the quantities and confirm again.'); }
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
    <div style={S.modalOverlay} onClick={e => e.stopPropagation()}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Receive a challan{vendor ? ` · ${vendor.name}` : ''}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          {!vendor ? <POChallanVendors onPick={setVendor} onError={e => setError(friendlyError(e))} /> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                <div><label style={S.fLabel}>Challan no. *</label><input value={challan} onChange={e => setChallan(e.target.value)} maxLength={40} autoFocus={!init?.challanNo} placeholder="e.g. TK/4411" style={{ ...S.fInput, fontFamily: T.mono }} /></div>
                <div><label style={S.fLabel}>Receipt date</label><DateInput value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%' }} /></div>
                <div><label style={S.fLabel}>Remarks</label><input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional" style={S.fInput} /></div>
              </div>
              <ChallanSeenNote no={challan} seen={seen} />
              <label style={{ ...S.fLabel, marginTop: seen.length ? 12 : 0 }}>Orders on this challan</label>
              {pos === null && (loadFailed
                ? <div style={{ textAlign: 'center', padding: '14px 0' }}><button type="button" onClick={() => { setError(''); setReload(r => r + 1); }} style={{ ...S.btnGhost, minHeight: 44 }}>Try again</button></div>
                : <div style={{ fontSize: 12, color: T.tx3, padding: '20px 0', textAlign: 'center' }}>Loading…</div>)}
              {pos?.length === 0 && <div style={{ fontSize: 12, color: T.tx3, padding: '20px 0', textAlign: 'center' }}>{vendor.name} has nothing still to come.</div>}
              {pos && <POChallanOrders pos={pos} ticked={ticked} qty={qty} onTick={tick} onQty={(id, v) => setQty(m => ({ ...m, [id]: v }))} onEnter={submit} />}
            </>
          )}
          {error && <div ref={errRef} style={{ marginTop: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {vendor && !given && <button type="button" onClick={() => { setVendor(null); setPos(null); setTicked(new Set()); setQty({}); }} style={{ ...S.btnGhost, minHeight: 44, marginRight: 'auto' }}>Other vendor</button>}
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          {vendor && <button type="button" onClick={submit} disabled={saving || !pos} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving || !pos ? 'none' : 'auto', opacity: saving || !pos ? 0.5 : 1 }}>{saving ? 'Saving…' : orders > 1 ? `Receive on ${orders} orders` : 'Confirm receipt'}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
