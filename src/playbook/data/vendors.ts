// Vendors (who supplies the products). Explicit columns, paginated; the
// product count (archived products left out) comes from an embedded count in
// the same query (no N+1).
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import type { PbVendor } from '../types';

export const VENDOR_PAGE = 25;

export type VendorRow = Pick<PbVendor, 'id' | 'name' | 'code' | 'notes' | 'active' | 'created_at'> & { products: number };
type Raw = Omit<VendorRow, 'products'> & { pb_products: { count: number }[] | null };

export async function listVendors(search: string, showInactive: boolean, page: number): Promise<{ rows: VendorRow[]; count: number }> {
  let q = supabase.from('pb_vendors').select('id,name,code,notes,active,created_at,pb_products(count)', { count: 'exact' });
  // Filter on the embedded rows only (not !inner), so a vendor with 0 products still shows.
  q = q.neq('pb_products.status', 'archived');
  if (!showInactive) q = q.eq('active', true);
  const s = search.replace(/[,()"\\%*:]/g, ' ').trim();
  if (s) q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%`);
  const { data, error, count } = await q.order('active', { ascending: false }).order('name')
    .range(page * VENDOR_PAGE, page * VENDOR_PAGE + VENDOR_PAGE - 1);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as Raw[]).map(({ pb_products, ...v }) => ({ ...v, products: pb_products?.[0]?.count ?? 0 }));
  return { rows, count: count ?? 0 };
}

const logActivity = (action: string, details: Record<string, unknown>) => {
  supabase.from('pb_activity').insert({ action, details }).then(({ error }) => { if (error) logSwallowed('pb_activity insert', error); });
};

/** A clearer message for the unique-name index than the raw constraint error. */
const nameTaken = (e: { code?: string } | null) => e?.code === '23505' ? new Error('A vendor with this name already exists.') : e;

export type VendorInput = { name: string; code: string | null; notes: string | null };

export async function saveVendor(id: string | null, v: VendorInput) {
  const { data, error } = id
    ? await supabase.from('pb_vendors').update(v).eq('id', id).select('id').single()
    : await supabase.from('pb_vendors').insert(v).select('id').single();
  if (error) throw nameTaken(error);
  logActivity(id ? 'vendor_edited' : 'vendor_added', { vendor_id: data.id, name: v.name });
}

/** Inactive vendors drop out of pickers; their products and rules stay as they are. */
export async function setVendorActive(id: string, active: boolean) {
  const { error } = await supabase.from('pb_vendors').update({ active }).eq('id', id);
  if (error) throw error;
  logActivity(active ? 'vendor_reactivated' : 'vendor_deactivated', { vendor_id: id });
}
