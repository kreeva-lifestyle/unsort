// Create / edit / revise a Purchase Order. Self-contained: owns form state,
// computes a live preview total (the server recomputes authoritatively on
// save), and calls create_po_with_items / update_po_with_items (a draft) /
// amend_po (an approved, sent or part-received order — owner's ask: revise
// instead of cancel and re-raise). A revision keeps every line's id so the
// receipts on it stand, never lets a quantity drop below what arrived, keeps
// the vendor, type and PO date as raised, and asks what changed. Only item
// name + qty are mandatory (owner decision) — unit, rate and all header
// charges are optional. Rules and payload: poFormSave. A new order can be
// saved and approved in one step (create_po_approved) by whoever may approve.
// A tap on the dark area outside never closes the form (owner, 27 Nov 2026).
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { useBackClose } from '../../hooks/useBackClose';
import { friendlyError } from '../../lib/friendlyError';
import { logSwallowed } from '../../lib/errorLogger';
import POFormHeader from './POFormHeader';
import POItemRows, { blankItem } from './POItemRows';
import type { FormItem } from './POItemRows';
import POFormCharges, { type Charges } from './POFormCharges';
import { poPayload, num } from './poFormSave';
import { vendorNamed } from './VendorPicker';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderType } from '../../types/database';
import { useModalLock } from '../../hooks/useModalLock';

export type EditingPO = PurchaseOrder & { items?: PurchaseOrderItem[] };
/** A pre-filled NEW order (e.g. raised from a costing sheet's purchase plan): any header fields plus draft lines. */
export type POPrefill = Partial<PurchaseOrder> & { items?: Array<Pick<PurchaseOrderItem, 'sku' | 'item_name' | 'fabric_code' | 'quantity' | 'unit' | 'rate'> & Partial<Pick<PurchaseOrderItem, 'id' | 'received_qty' | 'cancelled_at' | 'buffer_qty' | 'component'>>> };

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function POForm({ editing, duplicateFrom, prefill, canApprove, onClose, onSaved, addToast }: {
  editing: EditingPO | null;
  duplicateFrom?: EditingPO | null;
  prefill?: POPrefill | null;
  /** Admin / manager on the PO page: a new order also offers "Save and approve". */
  canApprove?: boolean;
  onClose: () => void;
  /** `revision` is set when a revision saved a change; `changed: false` when it saved nothing; `approved` when a new order was saved and approved. */
  onSaved: (r: { id: string; po_number: number; revision?: number; changed?: boolean; approved?: boolean }, isNew: boolean) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const src: POPrefill | null = editing || duplicateFrom || prefill || null;
  // After approval an edit is a revision (amend_po), never the draft's delete-and-rewrite.
  const amend = !!editing && editing.status !== 'draft';
  // Costing link travels with the order it was raised from (or the one being edited).
  const costingId = src?.costing_product_id ?? null;
  const [vendor, setVendor] = useState<{ id: string | null; name: string; phone: string }>({ id: src?.vendor_id ?? null, name: src?.vendor_name ?? '', phone: src?.vendor_phone ?? '' });
  const [poType, setPoType] = useState<PurchaseOrderType | ''>(src?.po_type ?? '');
  const [poDate, setPoDate] = useState(editing?.po_date ?? localToday());
  const [expectedDate, setExpectedDate] = useState(src?.expected_date ?? '');
  const [paymentTerms, setPaymentTerms] = useState(src?.payment_terms ?? '');
  const [notes, setNotes] = useState(src?.notes ?? '');
  // Internal planning count (owner's ask): how many finished pieces this
  // purchase is for. Shown in the app only — never on the shared/printed PO.
  const [forPieces, setForPieces] = useState(src?.for_pieces ? String(src.for_pieces) : '');
  // Lump sum (owner's ask): priced as a whole, so the piece count is optional.
  const [lumpSum, setLumpSum] = useState(!!src?.lump_sum);
  // A cancelled line stays as it is (not on the form, not on a duplicate); an edited line keeps its id.
  const [items, setItems] = useState<FormItem[]>(() => {
    const lines = (src?.items ?? []).filter(it => !it.cancelled_at);
    return lines.length ? lines.map(it => ({ ...(editing && it.id ? { id: it.id, received: Number(it.received_qty || 0), ordered: Number(it.quantity), hadPart: !!(it.component || '').trim() } : {}), sku: it.sku ?? '', item_name: it.item_name ?? '', fabric_code: it.fabric_code ?? '', component: it.component ?? '', quantity: String(it.quantity), buffer: Number(it.buffer_qty || 0), unit: it.unit ?? '', rate: it.rate == null ? '' : String(it.rate) })) : [blankItem()];
  });
  const [showCharges, setShowCharges] = useState(!!(src?.discount_value || src?.tax_percent || src?.other_charges));
  const [charges, setCharges] = useState<Charges>({ discountType: src?.discount_type ?? 'flat', discountValue: src?.discount_value ? String(src.discount_value) : '', taxPercent: src?.tax_percent ? String(src.tax_percent) : '', otherCharges: src?.other_charges ? String(src.other_charges) : '' });
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  // A save refused for the vendor is said at the vendor box (vendorTry scrolls to it); a typed name with no contact opens "Add new vendor" (addSignal).
  const [vendorError, setVendorError] = useState(''); const [vendorTry, setVendorTry] = useState(0); const [addSignal, setAddSignal] = useState(0);
  const [saving, setSaving] = useState<'' | 'save' | 'approve'>('');

  useModalLock();
  // The error box sits at the bottom of a long scrolling sheet; on a phone the
  // user is usually scrolled up at the failing field, so bring it into view.
  const errRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);
  useBackClose(true, () => onClose());

  // Live preview — the server is authoritative, this just mirrors its formula.
  // A cancelled line keeps what arrived on it (quantity = received), and the server's total still counts it.
  const keptCancelled = (editing?.items ?? []).filter(it => it.cancelled_at).reduce((s, it) => s + Math.round(Number(it.rate || 0) * Number(it.quantity || 0) * 100) / 100, 0);
  const subtotal = keptCancelled + items.reduce((s, it) => s + num(it.quantity) * num(it.rate), 0);
  const discAmt = charges.discountType === 'percentage' ? Math.round(subtotal * num(charges.discountValue) / 100 * 100) / 100 : Math.min(Math.max(num(charges.discountValue), 0), subtotal);
  const afterDisc = subtotal - discAmt;
  const taxAmt = Math.round(afterDisc * num(charges.taxPercent) / 100 * 100) / 100;
  const grand = Math.round((afterDisc + taxAmt + num(charges.otherCharges)) * 100) / 100;

  const setItem = (i: number, patch: Partial<FormItem>) => setItems(list => list.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  // Fabric is bought by the meter (owner's rule): new rows on a fabric PO
  // start with unit Meter, and switching the type to fabric fills it into
  // any row whose unit is still empty — a typed unit is never overwritten.
  const addRow = () => setItems(list => [...list, { ...blankItem(), ...(poType === 'fabric' ? { unit: 'Meter' } : {}) }]);
  const changeType = (t: PurchaseOrderType | '') => {
    setPoType(t);
    if (t === 'fabric') setItems(list => list.map(it => (it.unit ? it : { ...it, unit: 'Meter' })));
  };

  // Smart defaults from the vendor's LATEST PO (owner's ask): picking a
  // vendor loads that PO's type and its items' unit — filling ONLY what is
  // still empty, never overwriting a choice already made. One single-row
  // indexed lookup per pick; nothing runs on form open.
  const pickVendor = async (v: { id: string | null; name: string; phone: string }) => {
    setVendor(v); if (v.id) setVendorError('');
    if (!v.name.trim()) return;
    let q = supabase.from('purchase_orders').select('po_type, purchase_order_items(unit)')
      .order('created_at', { ascending: false }).limit(1);
    q = v.id ? q.eq('vendor_id', v.id) : q.ilike('vendor_name', v.name.trim());
    const { data, error } = await q;
    if (error) { logSwallowed('PO vendor defaults', error); return; } // best-effort prefill
    const last = data?.[0] as { po_type: PurchaseOrderType; purchase_order_items?: { unit: string | null }[] } | undefined;
    if (!last) return;
    setPoType(prev => prev || last.po_type);
    const lastUnit = (last.purchase_order_items || []).map(x => (x.unit || '').trim()).find(Boolean)
      || (last.po_type === 'fabric' ? 'Meter' : '');
    if (lastUnit) setItems(list => list.map(it => (it.unit ? it : { ...it, unit: lastUnit })));
  };
  // A line that already has goods in is never removed here — its balance is cancelled from the order.
  const removeRow = (i: number) => setItems(list => list.length > 1 && !list[i]?.received ? list.filter((_, idx) => idx !== i) : list);

  const save = async (approve = false) => {
    if (saving) return;
    setError(''); setVendorError(''); setSaving(approve ? 'approve' : 'save');
    // A saved vendor's name typed in full but not tapped still finds its contact.
    let v = vendor;
    if (!amend && !v.id && v.name.trim()) { const hit = await vendorNamed(v.name); if (hit) { v = hit; setVendor(hit); } }
    const p = poPayload({ vendor: v, poType, poDate, expectedDate, paymentTerms, notes, forPieces, lumpSum, costingId, items, ...charges }, subtotal, amend);
    if ('error' in p) {
      if (p.vendor) { setVendorError(p.error); setVendorTry(n => n + 1); if (p.vendor === 'add') setAddSignal(n => n + 1); } else setError(p.error);
      setSaving(''); return;
    }
    try {
      if (editing && amend) {
        // base_revision: the server refuses the save if someone revised the order since this form opened.
        const { data, error: e } = await supabase.rpc('amend_po', { p_po_id: editing.id, p_po: { ...p.p_po, base_revision: editing.revision }, p_items: p.p_items, p_reason: reason.trim() || null });
        if (e) throw e;
        const r = data as { changed: boolean; revision: number };
        onSaved({ id: editing.id, po_number: editing.po_number, changed: r.changed, revision: r.changed ? r.revision : undefined }, false);
      } else if (editing) {
        const { error: e } = await supabase.rpc('update_po_with_items', { p_po_id: editing.id, p_po: p.p_po, p_items: p.p_items });
        if (e) throw e;
        onSaved({ id: editing.id, po_number: editing.po_number }, false);
      } else {
        const { data, error: e } = await supabase.rpc(approve ? 'create_po_approved' : 'create_po_with_items', { p_po: p.p_po, p_items: p.p_items });
        if (e) throw e;
        if (!data?.id) throw new Error('Could not create the purchase order');
        onSaved({ id: data.id, po_number: data.po_number, approved: approve }, true);
      }
    } catch (e) { setError(friendlyError(e)); setSaving(''); return; }
    setSaving('');
  };
  const wait: React.CSSProperties = { minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 };

  return createPortal(
    <div style={S.modalOverlay} onClick={e => e.stopPropagation()}>
      {/* Flex column: head fixed, ONE scrolling body, footer always visible.
          The old inner scroller was sized with desktop maths (90vh - 130px),
          taller than the mobile bottom sheet (85dvh) - the footer got pushed
          off-screen and two scroll areas fought over the touch. */}
      <div className="modal-inner" style={{ ...S.modalBox, width: 640, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{amend && editing ? `Revise PO #${editing.po_number} → Rev ${editing.revision + 1}` : editing ? `Edit PO #${editing.po_number}` : duplicateFrom ? 'Duplicate Purchase Order' : prefill ? 'New PO from costing' : 'New Purchase Order'}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          {amend && <div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5, marginBottom: 12 }}>The vendor, type and PO date stay as raised. What already arrived stays on record — a quantity can be cut only down to it. Every change is kept in the order’s history.</div>}
          <POFormHeader amend={amend} editing={!!editing} vendor={vendor} onPickVendor={pickVendor} vendorError={vendorError} vendorTry={vendorTry} addSignal={addSignal} poType={poType} onType={changeType} poDate={poDate} onPoDate={setPoDate}
            expectedDate={expectedDate} onExpected={setExpectedDate} paymentTerms={paymentTerms} onTerms={setPaymentTerms}
            forPieces={forPieces} onPieces={setForPieces} lumpSum={lumpSum} onLumpSum={setLumpSum} piecesMissing={!!error && !lumpSum && !forPieces.trim()} addToast={addToast} />

          <label style={S.fLabel}>Items *</label>
          <POItemRows items={items} poType={poType} forPieces={lumpSum ? '' : forPieces} amend={amend} tried={!!error} onChange={setItem} onRemove={removeRow} onAdd={addRow} />

          <POFormCharges show={showCharges} onToggle={() => setShowCharges(s => !s)} charges={charges} onCharges={c => setCharges(prev => ({ ...prev, ...c }))}
            notes={notes} onNotes={setNotes} totals={{ subtotal, discAmt, taxAmt, other: num(charges.otherCharges), grand }} />

          {amend && (
            <div style={{ marginTop: 12 }}>
              <label style={S.fLabel}>What changed and why</label>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional — e.g. vendor short on red" aria-label="Reason for the revision" style={{ ...S.fInput, width: '100%' }} />
            </div>
          )}

          {error && <div ref={errRef} style={{ marginTop: 12, background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', flexShrink: 0 }}>
          <button onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          {/* A new order: "Save draft" for someone else to approve, or save and approve it in one step. */}
          <button onClick={() => save()} disabled={!!saving} style={{ ...(canApprove && !editing ? S.btnGhost : S.btnPrimary), ...wait }}>{saving === 'save' ? 'Saving…' : amend ? 'Save revision' : editing ? 'Save changes' : 'Save draft'}</button>
          {canApprove && !editing && <button onClick={() => save(true)} disabled={!!saving} style={{ ...S.btnPrimary, ...wait }}>{saving === 'approve' ? 'Saving…' : 'Save and approve'}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
