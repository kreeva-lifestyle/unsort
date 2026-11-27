// What was ordered before for a design (owner, 27 Nov 2026: "check the last
// PO of that SKU and auto fill the same on entering the code — make it
// smart"). po_sku_history gives every distinct fabric ever ordered for the
// design, newest first. The rule that makes it safe: a design is bought as
// several fabrics, and a re-order is the same fabric only 4 times in 10 — so
// ONE candidate is filled by itself, several are offered for one tap, and a
// fabric is never guessed. With a vendor chosen, only that vendor's fabrics
// count (a repeat of a fabric has always gone to the same vendor). Pure
// helpers + the cached look-up; the form parts are in POSkuHistory.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import type { PurchaseOrderType } from '../../types/database';

export interface SkuFabric {
  item_name: string; fabric_code: string | null; component: string | null; unit: string | null;
  /** The latest order of this fabric for the design: how much, for how many pieces (null on a lump sum). */
  quantity: number; for_pieces: number | null; lump_sum: boolean;
  po_number: number; po_date: string | null; po_type: PurchaseOrderType;
  /** The vendor as Contacts has it today; id and phone are null for an older order raised on a typed name. */
  vendor_id: string | null; vendor_name: string; vendor_phone: string | null;
  /** How many times this fabric was ordered for the design. */
  orders: number;
}

/** "drs 230" = "DRS-230" = "DRS230": letters and digits only, as the database matches it. */
export const skuKey = (sku: string): string => sku.toUpperCase().replace(/[^A-Z0-9]/g, '');
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
/** The same fabric: name and code alike, whatever the letter case. */
export const sameFabric = (a: { item_name: string; fabric_code?: string | null }, b: { item_name: string; fabric_code?: string | null }): boolean =>
  norm(a.item_name) !== '' && norm(a.item_name) === norm(b.item_name) && norm(a.fabric_code) === norm(b.fabric_code);

/** What to offer for a design. `list`: the chosen vendor's fabrics, or everyone's when no vendor is chosen or that
 *  vendor never supplied it (`foreign`). `auto`: the single candidate that is filled without asking — never across vendors. */
export function pickFor(rows: SkuFabric[], vendorId: string | null): { list: SkuFabric[]; auto: SkuFabric | null; foreign: boolean } {
  const mine = vendorId ? rows.filter(r => r.vendor_id === vendorId) : [];
  const foreign = !!vendorId && mine.length === 0;
  const list = vendorId && !foreign ? mine : rows;
  return { list, auto: !foreign && list.length === 1 ? list[0] : null, foreign };
}

/** The quantity to suggest: last time's, scaled to this order's pieces when both are known ("120 m for 48 pcs" → 150 for 60). */
export function suggestQty(f: SkuFabric, pieces: string): { qty: number; scaled: boolean } {
  const now = Number(pieces), then = Number(f.for_pieces);
  const q = Number(f.quantity);
  if (!f.lump_sum && now > 0 && then > 0 && now !== then) return { qty: Math.round((q / then) * now * 100) / 100, scaled: true };
  return { qty: q, scaled: false };
}

const cache = new Map<string, SkuFabric[]>();
/** A saved order changes the history: the next look-up reads it again. */
export const forgetSkuHistory = (): void => cache.clear();

/** The design's earlier fabrics, newest first; null while typing, loading, or when the look-up failed (the form works without it). */
export function usePoSkuHistory(sku: string): SkuFabric[] | null {
  const key = skuKey(sku);
  const [rows, setRows] = useState<{ key: string; list: SkuFabric[] } | null>(null);
  useEffect(() => {
    if (key.length < 3) return;
    const hit = cache.get(key);
    if (hit) { setRows({ key, list: hit }); return; }
    let alive = true;
    const t = window.setTimeout(() => {
      supabase.rpc('po_sku_history', { p_sku: key }).then(({ data, error }) => {
        if (!alive) return;
        if (error) { logSwallowed('PO design history', error); return; }
        const list = (data as SkuFabric[] | null) ?? [];
        cache.set(key, list); setRows({ key, list });
      });
    }, 450);
    return () => { alive = false; window.clearTimeout(t); };
  }, [key]);
  // Rows read for another code are never shown under this one.
  return rows && rows.key === key ? rows.list : null;
}
