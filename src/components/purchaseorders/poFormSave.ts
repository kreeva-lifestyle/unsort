// The PO form's save rules and payload, split out of POForm so that file
// stays under the 200-line limit. Pure: the form state in, either the first
// thing to fix (shown in the form's error box) or the RPC payload out. The
// server checks all of it again (create / update / amend_po).
import type { FormItem } from './POItemRows';
import type { PurchaseOrderType } from '../../types/database';

export const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
/** Money to the paisa, as the database keeps it (a revision would otherwise record 10.555 → stored 10.56 as a change). */
const paise = (s: string) => Math.round(num(s) * 100) / 100;

export interface POFormState {
  vendor: { id: string | null; name: string; phone: string };
  poType: PurchaseOrderType | '';
  poDate: string; expectedDate: string; paymentTerms: string; notes: string;
  forPieces: string; lumpSum: boolean;
  costingId: string | null;
  items: FormItem[];
  discountType: 'flat' | 'percentage'; discountValue: string; taxPercent: string; otherCharges: string;
}

export interface POPayload {
  p_po: Record<string, unknown>;
  p_items: Array<{ id?: string; item_name: string; sku: string | null; fabric_code: string | null; quantity: number; buffer_qty: number; unit: string | null; rate: number | null }>;
}

/** The first problem with the form, or the payload to save. A revision keeps each line's id (amend_po updates it in place). */
export function poPayload(f: POFormState, subtotal: number, keepIds: boolean): { error: string } | POPayload {
  if (!f.vendor.name.trim()) return { error: 'Select or enter a vendor' };
  if (!f.poType) return { error: 'Select a PO type — Fabric, Job Work, or Material' };
  // A row counts as "touched" only if the user typed something into it — the
  // default quantity of '1' alone must not keep an untouched "+ Add item" row
  // alive (it would then fail "item name is required" for a row the user
  // never used). Keep the ORIGINAL index so errors point at the visual row.
  const clean = f.items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.id || it.sku.trim() || it.item_name.trim() || it.fabric_code.trim() || it.unit.trim() || it.rate.trim());
  if (clean.length === 0) return { error: 'Add at least one item' };
  const skuRequired = f.poType === 'fabric' || f.poType === 'material';
  for (const { it, idx } of clean) {
    if (!it.item_name.trim()) return { error: `Row ${idx + 1}: item name is required` };
    if (skuRequired && !it.sku.trim()) return { error: `Row ${idx + 1} (${it.item_name}): SKU is required for Fabric / Material items` };
    // Owner's rule: every fabric line names its fabric code (the RPC refuses it too).
    if (f.poType === 'fabric' && !it.fabric_code.trim()) return { error: `Row ${idx + 1} (${it.item_name}): fabric code is required for fabric items` };
    if (num(it.quantity) <= 0) return { error: `Row ${idx + 1} (${it.item_name}): quantity must be greater than 0` };
    // Only a cut is held at what arrived — a line that got more than ordered may stay as it is.
    if (it.received && num(it.quantity) < it.received && num(it.quantity) < (it.ordered ?? Infinity)) return { error: `Row ${idx + 1} (${it.item_name}): ${it.received} already arrived — the quantity cannot go below that` };
    if (it.rate && num(it.rate) < 0) return { error: `Row ${idx + 1} (${it.item_name}): rate cannot be negative` };
  }
  if (f.discountType === 'percentage' && num(f.discountValue) > 100) return { error: 'Discount cannot exceed 100%' };
  if (f.discountType === 'flat' && num(f.discountValue) > subtotal) return { error: 'Discount cannot exceed the subtotal' };
  if (num(f.taxPercent) > 100) return { error: 'Tax % cannot exceed 100' };
  // Owner's rule: compulsory, digits only (the input already strips anything
  // else) — unless the order is a lump sum, where it is optional.
  const pieces = f.lumpSum ? (f.forPieces.trim() ? Number(f.forPieces) : null) : Number(f.forPieces);
  if (!f.lumpSum && !f.forPieces.trim()) return { error: 'For how many pcs is required — or tick Lump sum' };
  if (pieces !== null && (!Number.isInteger(pieces) || pieces <= 0)) return { error: 'For how many pcs must be a whole number greater than 0' };
  const p_po = {
    vendor_id: f.vendor.id, vendor_name: f.vendor.name.trim(), vendor_phone: f.vendor.phone.trim() || null,
    po_type: f.poType, po_date: f.poDate || null, expected_date: f.expectedDate || null,
    payment_terms: f.paymentTerms.trim() || null, notes: f.notes.trim() || null,
    for_pieces: pieces, lump_sum: f.lumpSum,
    costing_product_id: f.costingId,
    // Always send the values held in state — the Grand Total preview
    // includes them whether or not the charges section is expanded, so
    // collapsing the section must never silently strip an existing
    // discount/tax from the saved PO.
    discount_type: paise(f.discountValue) > 0 ? f.discountType : null,
    discount_value: paise(f.discountValue),
    tax_percent: paise(f.taxPercent),
    other_charges: paise(f.otherCharges),
  };
  // The code travels only on fabric POs — a type switched away from
  // fabric must not carry a stale code into a job-work / material item.
  const p_items = clean.map(({ it }) => ({
    ...(keepIds && it.id ? { id: it.id } : {}),
    item_name: it.item_name.trim(), sku: it.sku.trim() || null, fabric_code: f.poType === 'fabric' ? it.fabric_code.trim() || null : null,
    // Buffer (from Raise POs) is part of the quantity, never more than it.
    quantity: num(it.quantity), buffer_qty: Math.min(it.buffer ?? 0, num(it.quantity)), unit: it.unit.trim() || null, rate: it.rate === '' ? null : num(it.rate),
  }));
  return { p_po, p_items };
}
