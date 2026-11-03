// Everything Flow can find for one design SKU, so nobody has to hunt for it:
// the costing sheet (its photo and id), and every purchase order and job-work
// order raised for that design — matched the way Cash Challan matches a SKU:
// case-insensitive, the design itself or any of its sizes (DRS241, DRS241-M),
// plus POs / job work raised from the design's costing sheet.
// Cached per SKU for the session; `forget` after a write that changes it.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { useProductCatalog, resolveSku } from '../../hooks/useProductCatalog';

export type SkuOrder = {
  kind: 'po' | 'jobwork'; id: string; no: number; vendor: string;
  /** "fabric", "material", or the job type ("Handwork"). */
  what: string;
  status: string; open: boolean;
  qty: number | null; unit: string | null;
  /** Pieces the PO was planned for (raised from costing), else null. */
  forPieces: number | null;
  due: string | null; date: string;
  /** Job work: the size SKU it covers (DRS177-M) when not the design itself. */
  sku: string | null;
};
export type SkuFinds = { sku: string; costingId: string | null; image: string | null; orders: SkuOrder[] };

const PO_COLS = 'id, po_number, vendor_name, po_type, status, expected_date, for_pieces, created_at';
const PO_DONE = ['completed', 'closed', 'cancelled'];
type PoRow = { id: string; po_number: number; vendor_name: string; po_type: string; status: string; expected_date: string | null; for_pieces: number | null; created_at: string };

/** The SKU as stored everywhere: upper case, letters / digits / dashes only. */
export const skuKey = (s: string | null | undefined) => (s || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

const cache = new Map<string, Promise<SkuFinds>>();
export const forget = (sku: string) => { cache.delete(skuKey(sku)); };

export function findForSku(sku: string): Promise<SkuFinds> {
  const k = skuKey(sku);
  if (!k) return Promise.resolve({ sku: '', costingId: null, image: null, orders: [] });
  let p = cache.get(k);
  if (!p) { p = load(k); cache.set(k, p); p.catch(() => cache.delete(k)); }
  return p;
}

async function load(k: string): Promise<SkuFinds> {
  const match = `sku.ilike.${k},sku.ilike.${k}-%`;
  const costing = await supabase.from('costing_products').select('id, image_url, updated_at').ilike('sku', k).order('updated_at', { ascending: false }).limit(5);
  if (costing.error) throw costing.error;
  const cIds = (costing.data || []).map(c => c.id as string);
  const [items, byCosting, jw] = await Promise.all([
    supabase.from('purchase_order_items').select(`sku, quantity, unit, purchase_orders!purchase_order_items_po_id_fkey!inner(${PO_COLS})`)
      .or(match).neq('purchase_orders.status', 'cancelled').limit(200),
    cIds.length
      ? supabase.from('purchase_orders').select(`${PO_COLS}, purchase_order_items(quantity, unit)`).in('costing_product_id', cIds).neq('status', 'cancelled').limit(50)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('jobwork_orders').select('id, jw_number, vendor_name, job_type, sku, status, pieces, qty_unit, expected_date, created_at')
      .neq('status', 'cancelled').or(cIds.length ? `${match},costing_product_id.in.(${cIds.join(',')})` : match)
      .order('created_at', { ascending: false }).limit(100),
  ]);
  for (const r of [items, byCosting, jw]) if (r.error) throw r.error;

  // One entry per PO: matching lines summed (all lines for a costing-raised PO).
  const pos = new Map<string, SkuOrder>();
  const addPo = (po: PoRow, qty: number, unit: string | null) => {
    const cur = pos.get(po.id);
    if (cur) { cur.qty = (cur.qty ?? 0) + qty; return; }
    pos.set(po.id, {
      kind: 'po', id: po.id, no: po.po_number, vendor: po.vendor_name, what: po.po_type.replace('_', ' '),
      status: po.status.replace(/_/g, ' '), open: !PO_DONE.includes(po.status), qty, unit, forPieces: po.for_pieces,
      due: po.expected_date, date: po.created_at, sku: null,
    });
  };
  for (const it of (items.data || []) as unknown as { quantity: number; unit: string | null; purchase_orders: PoRow }[]) addPo(it.purchase_orders, Number(it.quantity || 0), it.unit);
  for (const po of (byCosting.data || []) as unknown as (PoRow & { purchase_order_items: { quantity: number; unit: string | null }[] })[]) {
    if (pos.has(po.id)) continue;
    addPo(po, po.purchase_order_items.reduce((t, i) => t + Number(i.quantity || 0), 0), po.purchase_order_items[0]?.unit ?? null);
  }
  const jws: SkuOrder[] = ((jw.data || []) as { id: string; jw_number: number; vendor_name: string; job_type: string; sku: string; status: string; pieces: number; qty_unit: string; expected_date: string | null; created_at: string }[])
    .map(j => ({
      kind: 'jobwork' as const, id: j.id, no: j.jw_number, vendor: j.vendor_name, what: j.job_type, status: j.status, open: j.status === 'open',
      qty: Number(j.pieces || 0), unit: j.qty_unit, forPieces: null, due: j.expected_date, date: j.created_at,
      sku: skuKey(j.sku) !== k ? j.sku : null,
    }));
  const order = (a: SkuOrder, b: SkuOrder) => Number(b.open) - Number(a.open) || b.date.localeCompare(a.date);
  const c0 = costing.data?.[0];
  return { sku: k, costingId: c0?.id ?? null, image: (costing.data || []).find(c => c.image_url)?.image_url ?? null, orders: [...[...pos.values()].sort(order), ...jws.sort(order)] };
}

/** Pieces to suggest for a new batch: the newest open PO's plan, else the open job work total. */
export function suggestPieces(f: SkuFinds): number | null {
  const po = f.orders.find(o => o.kind === 'po' && o.open && o.forPieces);
  if (po?.forPieces) return po.forPieces;
  const jw = f.orders.filter(o => o.kind === 'jobwork' && o.open && o.unit === 'pcs').reduce((t, o) => t + (o.qty || 0), 0);
  return jw > 0 ? jw : null;
}

export const orderLabel = (o: SkuOrder) => `${o.kind === 'po' ? 'PO' : 'JW'} #${o.no}`;
export const orderSub = (o: SkuOrder) => [o.vendor, o.what, o.sku, o.qty ? `${o.qty.toLocaleString('en-IN')} ${o.unit || ''}`.trim() : null].filter(Boolean).join(' · ');

/** findForSku as a hook: waits until the text is a real design, then loads. `bump` re-reads. */
export function useSkuFinds(sku: string | null | undefined, bump = 0) {
  const { index } = useProductCatalog();
  const k = skuKey(sku);
  const real = !!k && !!resolveSku(index, k);
  const [st, setSt] = useState<{ k: string; finds: SkuFinds | null; error: string }>({ k: '', finds: null, error: '' });
  useEffect(() => {
    if (!real) { setSt({ k: '', finds: null, error: '' }); return; }
    let alive = true;
    setSt({ k, finds: null, error: '' });
    findForSku(k).then(f => { if (alive) setSt({ k, finds: f, error: '' }); })
      .catch(e => { if (alive) setSt({ k, finds: null, error: friendlyError(e) }); });
    return () => { alive = false; };
  }, [k, real, bump]);
  return { real, key: k, finds: st.k === k ? st.finds : null, error: st.k === k ? st.error : '' };
}
