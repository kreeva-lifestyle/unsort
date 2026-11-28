// What was ordered before for a design (owner, 27 Nov 2026: "check the last
// PO of that SKU and auto fill the same on entering the code — make it
// smart"). po_sku_history gives every fabric ordered for the design, one row
// per vendor and fabric as on its latest order. The form shows them under the
// code and ONE TAP fills the line; nothing is typed in by itself. Why:
// replayed on the real orders, a design's single earlier fabric was the one
// ordered next only 12 times in 22 — the other 10 were the design's next
// fabric (same name, another code), the slip hardest to see on a phone. With
// a vendor chosen, only that vendor's fabrics are offered. Pure helpers and
// the look-up; what a tap writes is in poSkuFill, the screen in POSkuHistory.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import type { PurchaseOrderType } from '../../types/database';

export interface SkuFabric {
  item_name: string; fabric_code: string | null; component: string | null; unit: string | null;
  /** The latest order of this fabric: how much, and for how many pieces (null on a lump sum, or when that order carried more than one design). */
  quantity: number; for_pieces: number | null; lump_sum: boolean;
  po_number: number; po_date: string | null; po_type: PurchaseOrderType;
  /** The vendor as Contacts has it today; id and phone are null for an older order raised on a typed name. */
  vendor_id: string | null; vendor_name: string; vendor_phone: string | null;
  /** False when Contacts has the vendor switched off: a tap then fills the fabric but not the vendor. */
  vendor_active: boolean;
  /** How many orders carried this fabric for the design (its lines on one order are added up into one row). */
  orders: number;
}
type Fab = { item_name: string; fabric_code?: string | null };

/** "drs 230" = "DRS-230" = "DRS230": letters and digits only, as the database matches it. */
export const skuKey = (sku: string): string => sku.toUpperCase().replace(/[^A-Z0-9]/g, '');
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
/** Letters and digits only: "L.K fab" = "lk fab", and "Fendi" starts like "fendy". */
const letters = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The same fabric, as po_sku_history groups it within one vendor: a code with a number names one fabric of that vendor's
 *  range whatever name was typed with it ("FENDI 965" = "fendy 965", "micro 1573" = "LINING 1573"). A code without a
 *  number is a colour word ("Green") that several fabrics share, so there the whole name must match too. Across vendors
 *  (`sameVendor` false) a numbered code is not enough — two vendors use 157 for different fabrics — so the name must also
 *  start alike. */
export const sameFabric = (a: Fab, b: Fab, sameVendor = true): boolean => {
  const code = lower(a.fabric_code);
  if (code !== lower(b.fabric_code)) return false;
  if (!/\d/.test(code)) return lower(a.item_name) !== '' && lower(a.item_name) === lower(b.item_name);
  return sameVendor || (letters(a.item_name) !== '' && letters(a.item_name).slice(0, 3) === letters(b.item_name).slice(0, 3));
};

/** An earlier order of this vendor: the same contact or — for an order raised without one — the same name on letters and digits. */
export const isMine = (r: SkuFabric, v: { id: string | null; name: string }): boolean =>
  v.id && r.vendor_id ? r.vendor_id === v.id : letters(v.name) !== '' && letters(r.vendor_name) === letters(v.name);

/** What to offer for a design on this form — only the form's type once one is chosen. With a vendor chosen or typed:
 *  that vendor's fabrics (`mine`), or — when it never supplied the design (`foreign`) — everyone's, shown for reference
 *  only (a code from another vendor's range is not this vendor's code). No vendor yet: everyone's. */
export function offerFor(rows: SkuFabric[], vendor: { id: string | null; name: string }, poType: string): { list: SkuFabric[]; mine: SkuFabric[]; foreign: boolean; partial: boolean } {
  const typed = poType ? rows.filter(r => r.po_type === poType) : rows;
  const name = letters(vendor.name);
  if (!vendor.id && !name) return { list: typed, mine: [], foreign: false, partial: false };
  const mine = typed.filter(r => isMine(r, vendor));
  if (mine.length) return { list: mine, mine, foreign: false, partial: false };
  // `partial`: the name typed so far is the start of a vendor in the list — most likely still being typed or not yet picked.
  return { list: typed, mine, foreign: true, partial: !vendor.id && typed.some(r => letters(r.vendor_name).startsWith(name)) };
}

/** The quantity to offer: last time's scaled to this order's pieces ("120 m for 48 pcs" → 240 for 96), rounded up to a
 *  whole unit, or as it was when both counts are equal. Null when there is nothing sound to offer: this order's pieces
 *  are not typed yet, last time's count is not known, or last time was a 1-2 piece sample. A lump-sum order (no pieces)
 *  is offered last time's amount as it was. Replayed on the real orders, offers with both counts known were within 10%
 *  of what was ordered 10 times in 11; the others only 7 times in 17. */
export function suggestQty(f: SkuFabric, pieces: string, lumpSum: boolean): { qty: number; scaled: boolean } | null {
  const q = Number(f.quantity), now = Number(pieces), then = Number(f.for_pieces);
  if (!(q > 0)) return null;
  const sample = then > 0 && then < 3;
  if (!(now > 0)) return lumpSum && !sample ? { qty: q, scaled: false } : null;
  if (!(then > 0) || (sample && now !== then)) return null;
  if (now === then) return { qty: q, scaled: false };
  return { qty: Math.ceil(Math.round((q / then) * now * 1e6) / 1e6), scaled: true };
}

// One read per code while a form is open, shared by every line that carries it (also while the read is in flight).
const cache = new Map<string, Promise<SkuFabric[] | null>>();
/** The history is read afresh when the order form opens and after a save: an order raised or cancelled since changes it. */
export const forgetSkuHistory = (): void => cache.clear();
const load = (key: string): Promise<SkuFabric[] | null> => {
  let p = cache.get(key);
  if (!p) {
    p = Promise.resolve(supabase.rpc('po_sku_history', { p_sku: key })).then(({ data, error }) => {
      if (!error) return (data as SkuFabric[] | null) ?? [];
      // Best effort: the form works without it, and the next look-up tries again.
      logSwallowed('PO design history', error); cache.delete(key); return null;
    });
    cache.set(key, p);
  }
  return p;
};

/** The design's earlier fabrics, newest first; null while typing, loading, or when the look-up failed. */
export function usePoSkuHistory(sku: string): SkuFabric[] | null {
  const key = skuKey(sku);
  const [rows, setRows] = useState<{ key: string; list: SkuFabric[] } | null>(null);
  useEffect(() => {
    if (key.length < 3) return;
    let alive = true;
    // After a pause in the typing — also for a code already read, so rows do not flash by under a longer code.
    const t = window.setTimeout(() => { void load(key).then(list => { if (alive && list) setRows({ key, list }); }); }, 450);
    return () => { alive = false; window.clearTimeout(t); };
  }, [key]);
  // Rows read for another code are never shown under this one.
  return rows && rows.key === key ? rows.list : null;
}
