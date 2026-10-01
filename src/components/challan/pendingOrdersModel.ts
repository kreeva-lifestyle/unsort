// Pending Orders — data access and the pure bits, kept out of the views so
// they stay small. A pending order is "who ordered what" before a challan
// exists; "Make challan" hands its lines to the challan form (prices blank)
// and, once the challan is saved, the order is marked converted.
import { supabase } from '../../lib/supabase';
import type { CashChallanOrder, CashChallanOrderItem, CashChallanOrderStatus } from '../../types/database';

export const ORDER_COLS = 'id, customer_id, customer_name, customer_phone, items, notes, status, challan_id, created_by, created_at, updated_at, converted_at, converted_by, cash_challans(challan_number)';
const MAX_ROWS = 500;

/** A list row: the converted order also carries its challan number. */
export type OrderRow = CashChallanOrder & { cash_challans: { challan_number: number } | null };

export const blankItem = (): CashChallanOrderItem => ({ sku: '', description: '', quantity: 1 });

export type RecentCustomer = { id: string | null; name: string; phone: string | null };

/** The last five customers across challans and pending orders, newest
 *  first, one entry per name — the one-tap pills on the order form. */
export async function recentCustomers(): Promise<RecentCustomer[]> {
  const cols = 'customer_id, customer_name, customer_phone, created_at';
  const [c, o] = await Promise.all([
    supabase.from('cash_challans').select(cols).neq('status', 'voided').order('created_at', { ascending: false }).limit(15),
    supabase.from('cash_challan_orders').select(cols).order('created_at', { ascending: false }).limit(15),
  ]);
  if (c.error) throw c.error;
  if (o.error) throw o.error;
  type R = { customer_id: string | null; customer_name: string; customer_phone: string | null; created_at: string };
  const all = ([...(c.data || []), ...(o.data || [])] as R[]).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const seen = new Set<string>();
  const out: RecentCustomer[] = [];
  for (const r of all) {
    const name = (r.customer_name || '').trim();
    const k = name.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ id: r.customer_id, name, phone: r.customer_phone });
    if (out.length === 5) break;
  }
  return out;
}

export const pieceCount = (o: Pick<CashChallanOrder, 'items'>): number =>
  o.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

/** Lines ready for the challan form: same shape as its items, price 0 so
 *  the operator types the rate (the order never carried one). */
export const toChallanItems = (o: Pick<CashChallanOrder, 'items'>) =>
  o.items.map(it => ({ sku: it.sku, description: it.description, quantity: Number(it.quantity) || 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }));

/** Validation shared by the form and (defensively) the save. Returns the
 *  first problem in plain words, or null. */
export function orderProblem(customerName: string, items: CashChallanOrderItem[]): string | null {
  if (!customerName.trim()) return 'Enter the customer name';
  const live = items.filter(it => it.sku.trim() || it.description.trim());
  if (!live.length) return 'Add at least one item with a SKU';
  const bad = live.find(it => !(Number(it.quantity) > 0));
  if (bad) return `Quantity must be at least 1 (${bad.sku || bad.description})`;
  return null;
}

export async function fetchOrders(status: CashChallanOrderStatus | '', search: string): Promise<OrderRow[]> {
  let q = supabase.from('cash_challan_orders').select(ORDER_COLS).order('created_at', { ascending: false }).limit(MAX_ROWS);
  if (status) q = q.eq('status', status);
  const s = search.trim();
  if (s) q = q.ilike('customer_name', `%${s.replace(/[%_]/g, '\\$&')}%`);
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as unknown as OrderRow[]).map(o => ({ ...o, items: Array.isArray(o.items) ? o.items : [] }));
}

/** Insert or update. Blank lines are dropped; quantities stored as whole numbers. */
export async function saveOrder(o: { id?: string; customer_id: string | null; customer_name: string; customer_phone: string; items: CashChallanOrderItem[]; notes: string }): Promise<void> {
  const items = o.items.filter(it => it.sku.trim() || it.description.trim())
    .map(it => ({ sku: it.sku.trim().toUpperCase(), description: it.description.trim(), quantity: Math.max(1, Math.round(Number(it.quantity) || 1)) }));
  const row = { customer_id: o.customer_id, customer_name: o.customer_name.trim(), customer_phone: o.customer_phone.trim() || null, items, notes: o.notes.trim() || null, updated_at: new Date().toISOString() };
  if (o.id) {
    const { error } = await supabase.from('cash_challan_orders').update(row).eq('id', o.id).eq('status', 'pending');
    if (error) throw error;
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('cash_challan_orders').insert({ ...row, created_by: user?.id ?? null });
  if (error) throw error;
}

export async function cancelOrder(id: string): Promise<void> {
  const { error } = await supabase.from('cash_challan_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
  if (error) throw error;
}

export async function reopenOrder(id: string): Promise<void> {
  const { error } = await supabase.from('cash_challan_orders').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'cancelled');
  if (error) throw error;
}

/** Called by the challan page right after create_challan_with_items succeeds. */
export async function markOrderConverted(id: string, challanId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const { error } = await supabase.from('cash_challan_orders')
    .update({ status: 'converted', challan_id: challanId, converted_at: now, converted_by: user?.id ?? null, updated_at: now })
    .eq('id', id).eq('status', 'pending');
  if (error) throw error;
}

/** Customer picker for the order form — same lookup the challan form uses. */
export async function searchOrderCustomers(q: string): Promise<{ id: string; name: string; phone: string | null }[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  const { data, error } = await supabase.from('cash_challan_customers').select('id, name, phone').ilike('name', `%${s.replace(/[%_]/g, '\\$&')}%`).limit(6);
  if (error) throw error;
  return (data || []) as { id: string; name: string; phone: string | null }[];
}
