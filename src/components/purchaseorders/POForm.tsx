// Create / edit a Purchase Order. Self-contained: owns form state, computes
// a live preview total (the server recomputes authoritatively on save), and
// calls create_po_with_items / update_po_with_items. Only item name + qty are
// mandatory (owner decision) — unit, rate and all header charges are optional.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { poAuditLog } from './poAudit';
import VendorPicker from './VendorPicker';
import { PO_TYPES, PO_TYPE_LABELS } from '../../types/database';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

type FormItem = { item_name: string; quantity: string; unit: string; rate: string };
export type EditingPO = PurchaseOrder & { items?: PurchaseOrderItem[] };

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const blankItem = (): FormItem => ({ item_name: '', quantity: '1', unit: '', rate: '' });
const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

export default function POForm({ editing, duplicateFrom, onClose, onSaved, addToast }: {
  editing: EditingPO | null;
  duplicateFrom?: EditingPO | null;
  onClose: () => void;
  onSaved: (r: { id: string; po_number: number }, isNew: boolean) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const src = editing || duplicateFrom || null;
  const [vendor, setVendor] = useState<{ id: string | null; name: string; phone: string }>({ id: src?.vendor_id ?? null, name: src?.vendor_name ?? '', phone: src?.vendor_phone ?? '' });
  const [poType, setPoType] = useState(src?.po_type ?? 'material');
  const [poDate, setPoDate] = useState(editing?.po_date ?? localToday());
  const [expectedDate, setExpectedDate] = useState(src?.expected_date ?? '');
  const [paymentTerms, setPaymentTerms] = useState(src?.payment_terms ?? '');
  const [notes, setNotes] = useState(src?.notes ?? '');
  const [items, setItems] = useState<FormItem[]>(
    src?.items?.length ? src.items.map(it => ({ item_name: it.item_name, quantity: String(it.quantity), unit: it.unit ?? '', rate: it.rate == null ? '' : String(it.rate) })) : [blankItem()]
  );
  const [showCharges, setShowCharges] = useState(!!(src?.discount_value || src?.tax_percent || src?.other_charges));
  const [discountType, setDiscountType] = useState(src?.discount_type ?? 'flat');
  const [discountValue, setDiscountValue] = useState(src?.discount_value ? String(src.discount_value) : '');
  const [taxPercent, setTaxPercent] = useState(src?.tax_percent ? String(src.tax_percent) : '');
  const [otherCharges, setOtherCharges] = useState(src?.other_charges ? String(src.other_charges) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.body.classList.add('modal-open'); return () => { document.body.classList.remove('modal-open'); }; }, []);

  // Live preview — the server is authoritative, this just mirrors its formula.
  const subtotal = items.reduce((s, it) => s + num(it.quantity) * num(it.rate), 0);
  const discAmt = discountType === 'percentage' ? Math.round(subtotal * num(discountValue) / 100 * 100) / 100 : Math.min(Math.max(num(discountValue), 0), subtotal);
  const afterDisc = subtotal - discAmt;
  const taxAmt = Math.round(afterDisc * num(taxPercent) / 100 * 100) / 100;
  const grand = Math.round((afterDisc + taxAmt + num(otherCharges)) * 100) / 100;

  const setItem = (i: number, patch: Partial<FormItem>) => setItems(list => list.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addRow = () => setItems(list => [...list, blankItem()]);
  const removeRow = (i: number) => setItems(list => list.length > 1 ? list.filter((_, idx) => idx !== i) : list);

  const save = async () => {
    if (saving) return;
    setError('');
    if (!vendor.name.trim()) { setError('Select or enter a vendor'); return; }
    const clean = items.filter(it => it.item_name.trim() || num(it.quantity) > 0 || it.rate);
    if (clean.length === 0) { setError('Add at least one item'); return; }
    for (let i = 0; i < clean.length; i++) {
      if (!clean[i].item_name.trim()) { setError(`Row ${i + 1}: item name is required`); return; }
      if (num(clean[i].quantity) <= 0) { setError(`Row ${i + 1} (${clean[i].item_name}): quantity must be greater than 0`); return; }
      if (clean[i].rate && num(clean[i].rate) < 0) { setError(`Row ${i + 1} (${clean[i].item_name}): rate cannot be negative`); return; }
    }
    setSaving(true);
    try {
      const p_po = {
        vendor_id: vendor.id, vendor_name: vendor.name.trim(), vendor_phone: vendor.phone.trim() || null,
        po_type: poType, po_date: poDate || null, expected_date: expectedDate || null,
        payment_terms: paymentTerms.trim() || null, notes: notes.trim() || null,
        discount_type: showCharges && num(discountValue) > 0 ? discountType : null,
        discount_value: showCharges ? num(discountValue) : 0,
        tax_percent: showCharges ? num(taxPercent) : 0,
        other_charges: showCharges ? num(otherCharges) : 0,
      };
      const p_items = clean.map(it => ({ item_name: it.item_name.trim(), quantity: num(it.quantity), unit: it.unit.trim() || null, rate: it.rate === '' ? null : num(it.rate) }));
      if (editing) {
        const { error: e } = await supabase.rpc('update_po_with_items', { p_po_id: editing.id, p_po, p_items });
        if (e) throw new Error(e.message);
        await poAuditLog('UPDATE', editing.id, `PO #${editing.po_number} updated`);
        onSaved({ id: editing.id, po_number: editing.po_number }, false);
      } else {
        const { data, error: e } = await supabase.rpc('create_po_with_items', { p_po, p_items });
        if (e || !data?.id) throw new Error(e?.message || 'Could not create the purchase order');
        await poAuditLog('CREATE', data.id, `PO #${data.po_number} raised for ${vendor.name.trim()}${grand > 0 ? ` — ₹${grand.toLocaleString('en-IN')}` : ''}`);
        onSaved({ id: data.id, po_number: data.po_number }, true);
      }
    } catch (e) { setError(friendlyError(e)); setSaving(false); return; }
    setSaving(false);
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 640 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{editing ? `Edit PO #${editing.po_number}` : duplicateFrom ? 'Duplicate Purchase Order' : 'New Purchase Order'}</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&times;</span>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.fLabel}>Vendor *</label>
              <VendorPicker value={vendor.name} phone={vendor.phone} onPick={setVendor} addToast={addToast} />
            </div>
            <div>
              <label style={S.fLabel}>Type</label>
              <select value={poType} onChange={e => setPoType(e.target.value as typeof poType)} style={S.fInput}>
                {PO_TYPES.map(t => <option key={t} value={t}>{PO_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={S.fLabel}>PO Date</label>
              <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)} style={{ ...S.fDate, width: '100%' }} />
            </div>
            <div>
              <label style={S.fLabel}>Expected</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} style={{ ...S.fDate, width: '100%' }} />
            </div>
            <div>
              <label style={S.fLabel}>Payment terms</label>
              <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days" style={S.fInput} />
            </div>
          </div>

          <label style={S.fLabel}>Items *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {items.map((it, i) => {
              const amt = num(it.quantity) * num(it.rate);
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={it.item_name} onChange={e => setItem(i, { item_name: e.target.value })} placeholder="Item name *" style={{ ...S.fInput, flex: '2 1 160px', minWidth: 120 }} />
                  <input value={it.quantity} onChange={e => setItem(i, { quantity: e.target.value })} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="Qty" style={{ ...S.fInput, flex: '1 1 60px', minWidth: 56, fontFamily: T.mono }} />
                  <input value={it.unit} onChange={e => setItem(i, { unit: e.target.value })} placeholder="Unit" style={{ ...S.fInput, flex: '1 1 60px', minWidth: 56 }} />
                  <input value={it.rate} onChange={e => setItem(i, { rate: e.target.value })} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="Rate" style={{ ...S.fInput, flex: '1 1 70px', minWidth: 60, fontFamily: T.mono }} />
                  <span style={{ flex: '1 1 70px', minWidth: 60, textAlign: 'right', fontSize: 12, fontFamily: T.mono, color: amt > 0 ? T.tx2 : T.tx3 }}>{amt > 0 ? `₹${amt.toLocaleString('en-IN')}` : '—'}</span>
                  <button onClick={() => removeRow(i)} disabled={items.length === 1} style={{ border: 'none', background: 'none', cursor: items.length === 1 ? 'not-allowed' : 'pointer', color: T.re, opacity: items.length === 1 ? 0.25 : 0.7, fontSize: 18, padding: '0 4px', lineHeight: 1 }} aria-label="Remove item">&times;</button>
                </div>
              );
            })}
          </div>
          <button onClick={addRow} style={{ ...S.btnGhost, ...S.btnSm, marginTop: 8 }}>+ Add item</button>

          <div style={{ marginTop: 14, borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
            <button onClick={() => setShowCharges(s => !s)} style={{ border: 'none', background: 'none', color: T.tx3, fontSize: 11, cursor: 'pointer', padding: 0 }}>{showCharges ? '− Hide' : '+ Add'} discount / tax / charges</button>
            {showCharges && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={S.fLabel}>Discount</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input value={discountValue} onChange={e => setDiscountValue(e.target.value)} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="0" style={{ ...S.fInput, flex: 1, fontFamily: T.mono }} />
                    <select value={discountType} onChange={e => setDiscountType(e.target.value as typeof discountType)} style={{ ...S.fInput, width: 56, padding: '8px 6px' }}><option value="flat">₹</option><option value="percentage">%</option></select>
                  </div>
                </div>
                <div><label style={S.fLabel}>Tax %</label><input value={taxPercent} onChange={e => setTaxPercent(e.target.value)} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="0" style={{ ...S.fInput, fontFamily: T.mono }} /></div>
                <div><label style={S.fLabel}>Other charges</label><input value={otherCharges} onChange={e => setOtherCharges(e.target.value)} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="0" style={{ ...S.fInput, fontFamily: T.mono }} /></div>
              </div>
            )}
          </div>

          <div>
            <label style={{ ...S.fLabel, marginTop: 12, display: 'block' }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes for this order…" style={{ ...S.fInput, width: '100%', height: 'auto', resize: 'vertical', fontFamily: T.sans }} />
          </div>

          <div style={{ marginTop: 14, padding: '12px 14px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx3 }}><span>Subtotal</span><span style={{ fontFamily: T.mono }}>₹{subtotal.toLocaleString('en-IN')}</span></div>
            {showCharges && discAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx3 }}><span>Discount</span><span style={{ fontFamily: T.mono }}>−₹{discAmt.toLocaleString('en-IN')}</span></div>}
            {showCharges && taxAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx3 }}><span>Tax</span><span style={{ fontFamily: T.mono }}>₹{taxAmt.toLocaleString('en-IN')}</span></div>}
            {showCharges && num(otherCharges) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx3 }}><span>Other charges</span><span style={{ fontFamily: T.mono }}>₹{num(otherCharges).toLocaleString('en-IN')}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: T.tx, borderTop: `1px solid ${T.bd}`, paddingTop: 6, marginTop: 2 }}><span>Grand Total</span><span style={{ fontFamily: T.mono }}>₹{grand.toLocaleString('en-IN')}</span></div>
          </div>

          {error && <div style={{ marginTop: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save draft'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
