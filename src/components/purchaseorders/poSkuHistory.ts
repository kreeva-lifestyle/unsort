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
  /** How many orders carried this fabric for the design. */
  orders: number;
}
type Fab = { item_name: string; fabric_code?: string | null };

/** "drs 230" = "DRS-230" = "DRS230": letters and digits only, as the database matches it. */
export const skuKey = (sku: string): string => sku.toUpperCase().replace(/[^A-Z0-9]/g, '');
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
/** Letters and digits only: "L.K fab" = "lk fab", and "Fendi" starts like "fendy". */
const letters = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The same fabric, as po_sku_history groups it: the same code and, when the code holds a number, a name that starts
 *  alike ("FENDI 965" = "fendy 965"). A code without a number is a colour word, so there the whole name must match. */
export const sameFabric = (a: Fab, b: Fab): boolean => {
  const code = lower(a.fabric_code), name = letters(a.item_name);
  if (!name || code !== lower(b.fabric_code)) return false;
  return /\d/.test(code) ? name.slice(0, 3) === letters(b.item_name).slice(0, 3) : lower(a.item_name) === lower(b.item_name);
};

/** What to offer for a design on this form — only the form's type once one is chosen. With a vendor chosen or typed:
 *  that vendor's fabrics (`mine`), or — when it never supplied the design (`foreign`) — everyone's, to be labelled.
 *  An older order raised on a typed name counts as the vendor's by its name. No vendor yet: everyone's. */
export function offerFor(rows: SkuFabric[], vendor: { id: string | null; name: string }, poType: string): { list: SkuFabric[]; mine: SkuFabric[]; foreign: boolean } {
  const typed = poType ? rows.filter(r => r.po_type === poType) : rows;
  const name = letters(vendor.name);
  if (!vendor.id && !name) return { list: typed, mine: [], foreign: false };
  const mine = typed.filter(r => (vendor.id && r.vendor_id ? r.vendor_id === vendor.id : letters(r.vendor_name) === name));
  return mine.length ? { list: mine, mine, foreign: false } : { list: typed, mine, foreign: true };
}

/** The quantity to offer: last time's, or scaled to this order's pieces when both counts are known ("120 m for 48 pcs" →
 *  240 for 96), rounded up to a whole unit. Null when there is nothing sound to offer: an earlier order for 1 or 2
 *  pieces was a sample, not a rate per piece. */
export function suggestQty(f: SkuFabric, pieces: string): { qty: number; scaled: boolean } | null {
  const q = Number(f.quantity), now = Number(pieces), then = Number(f.for_pieces);
  if (!(q > 0)) return null;
  if (f.lump_sum || !(now > 0) || !(then > 0) || now === then) return { qty: q, scaled: false };
  if (then < 3) return null;
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
