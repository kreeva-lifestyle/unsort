// Smart defaults from a vendor's LATEST PO (owner's ask): picking a vendor
// loads that order's type and its items' unit, and the form fills ONLY what
// is still empty — never a choice already made. One single-row indexed
// look-up per pick; nothing runs on form open. Best effort: without it the
// form simply stays as it is. Split out of POForm (200-line limit).
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import type { PurchaseOrderType } from '../../types/database';

// Only the newest pick's answer is used: on a slow connection the answer for a vendor picked before — or one taken back
// by Clear (an empty pick) — must not fill the type in afterwards.
let latest = 0;

export async function vendorDefaults(v: { id: string | null; name: string }): Promise<{ type: PurchaseOrderType; unit: string } | null> {
  const mine = ++latest;
  if (!v.name.trim()) return null;
  let q = supabase.from('purchase_orders').select('po_type, purchase_order_items(unit)')
    .order('created_at', { ascending: false }).limit(1);
  q = v.id ? q.eq('vendor_id', v.id) : q.ilike('vendor_name', v.name.trim());
  const { data, error } = await q;
  if (mine !== latest) return null;
  if (error) { logSwallowed('PO vendor defaults', error); return null; }
  const last = data?.[0] as { po_type: PurchaseOrderType; purchase_order_items?: { unit: string | null }[] } | undefined;
  if (!last) return null;
  // Fabric is bought by the meter when the last order named no unit.
  const unit = (last.purchase_order_items || []).map(x => (x.unit || '').trim()).find(Boolean) || (last.po_type === 'fabric' ? 'Meter' : '');
  return { type: last.po_type, unit };
}
