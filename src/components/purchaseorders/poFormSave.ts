// The PO form's save rules and payload, split out of POForm so that file
// stays under the 200-line limit. Pure: the form state in, either the first
// thing to fix (shown in the form's error box) or the RPC payload out. The
// server checks all of it again (create / update / amend_po).
import type { FormItem } from './POItemRows';
import { cleanComponent } from './POComponentField';
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
  p_items: Array<{ id?: string; item_name: string; sku: string | null; fabric_code: string | null; component: string | null; quantity: number; buffer_qty: number; unit: string | null; rate: number | null }>;
}

/** A card the user typed into. The unit alone does not count: a fabric row gets "Meter" by itself, and an
 *  extra empty card must not block the save with "item name is required". */
export const touchedRow = (it: FormItem): boolean => !!(it.id || it.sku.trim() || it.item_name.trim() || it.fabric_code.trim() || it.component.trim() || it.quantity.trim() || it.rate.trim());
/** A fabric line may be saved without "Fabric is for" only on a revision, and only if it was already on the order without one. */
export const partOptional = (it: FormItem, amend: boolean): boolean => amend && !!it.id && !it.hadPart;

/** The first problem with the form, or the payload to save. `vendor` says the problem is the vendor: 'add' = a typed name with
 *  no contact (the form opens "Add new vendor"), 'pick' = none chosen, or a contact without a phone.
 *  A revision keeps each line's id (amend_po updates it in place). */
export function poPayload(f: POFormState, subtotal: number, keepIds: boolean): { error: string; vendor?: 'pick' | 'add' } | POPayload {
  const vendor = f.vendor.name.trim();
  if (!vendor) return { error: 'Choose the vendor', vendor: 'pick' };
  // Owner's rule (27 Nov 2026): an order goes only to a vendor saved in Contacts with a phone number —
  // a typed name has no chat to send or remind on. A revision keeps the vendor it was raised with.
  if (!keepIds && !f.vendor.id) return { error: `“${vendor}” is not saved in Contacts. Pick the vendor from the list, or add the name and phone number right here and tap “Save vendor”.`, vendor: 'add' };
  if (!keepIds && f.vendor.phone.replace(/\D/g, '').length < 10) return { error: `${vendor} has no phone number saved. Add the number in Contacts, then pick the vendor again.`, vendor: 'pick' };
  if (!f.poType) return { error: 'Select a PO type — Fabric, Job Work, or Material' };
  // Only the cards the user typed into; the ORIGINAL index is kept so errors point at the visual row.
  const clean = f.items.map((it, idx) => ({ it, idx })).filter(({ it }) => touchedRow(it));
  if (clean.length === 0) return { error: 'Add at least one item' };
  const skuRequired = f.poType === 'fabric' || f.poType === 'material';
  for (const { it, idx } of clean) {
    if (!it.item_name.trim()) return { error: `Row ${idx + 1}: item name is required` };
    if (skuRequired && !it.sku.trim()) return { error: `Row ${idx + 1} (${it.item_name}): SKU is required for Fabric / Material items` };
    // Owner's rule: every fabric line names its fabric code (the RPC refuses it too).
    if (f.poType === 'fabric' && !it.fabric_code.trim()) return { error: `Row ${idx + 1} (${it.item_name}): fabric code is required for fabric items` };
    // Owner's rule (27 Nov 2026): a fabric line says which part of the design it is for. Only a line that was
    // already on an order being revised WITHOUT one may stay so (orders from before the rule have none).
    if (f.poType === 'fabric' && !cleanComponent(it.component) && !partOptional(it, keepIds)) return { error: `Row ${idx + 1} (${it.item_name}): choose what this fabric is for — lehenga, blouse, dupatta…` };
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
    component: f.poType === 'fabric' ? cleanComponent(it.component) || null : null,
    // Buffer (from Raise POs) is part of the quantity, never more than it.
    quantity: num(it.quantity), buffer_qty: Math.min(it.buffer ?? 0, num(it.quantity)), unit: it.unit.trim() || null, rate: it.rate === '' ? null : num(it.rate),
  }));
  return { p_po, p_items };
}
