// Purchase-order lines the Price Projector reads as EVIDENCE: what fabric
// was actually bought for a SKU, from whom, how much, and — when the PO
// carries one — at what rate. One query per tool open (not per sheet),
// last 12 months, drafts and cancelled orders left out because neither is
// a purchase that happened.
import { supabase } from '../../../lib/supabase';

export interface PoLine {
  id: string; po: number; vendor: string; status: string; date: string | null;
  sku: string | null; item: string; qty: number; unit: string | null; rate: number | null;
}

export { norm } from './normName';

interface Row { id: string; item_name: string; sku: string | null; quantity: number | string; unit: string | null; rate: number | string | null; purchase_orders: { po_number: number; vendor_name: string; status: string; po_date: string | null } | { po_number: number; vendor_name: string; status: string; po_date: string | null }[] | null }

export async function loadPoLines(): Promise<{ lines: PoLine[]; error: unknown }> {
  const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('purchase_order_items')
    .select('id, item_name, sku, quantity, unit, rate, purchase_orders!inner(po_number, vendor_name, status, po_date)')
    .not('purchase_orders.status', 'in', '("draft","cancelled")')
    .gte('purchase_orders.po_date', since)
    .limit(500);
  if (error) return { lines: [], error };
  const lines: PoLine[] = ((data ?? []) as unknown as Row[]).flatMap(r => {
    const po = Array.isArray(r.purchase_orders) ? r.purchase_orders[0] : r.purchase_orders;
    if (!po) return [];
    const rate = r.rate === null || r.rate === undefined || r.rate === '' ? null : Number(r.rate);
    return [{ id: r.id, po: po.po_number, vendor: (po.vendor_name || '').trim(), status: po.status, date: po.po_date, sku: r.sku, item: (r.item_name || '').trim(), qty: Number(r.quantity) || 0, unit: r.unit, rate: rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null }];
  });
  // Newest first, so "the last purchase" is always index 0 of any filter.
  lines.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.po - a.po);
  return { lines, error: null };
}
