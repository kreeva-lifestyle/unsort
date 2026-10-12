// Orders (Cash Challan) — data access and the pure bits, kept out of the
// views so they stay small. An order is "who ordered what" before the goods
// are ready. "Make challan" lets the operator pick what goes out now and
// hands those lines to the challan form (prices blank); the save runs
// create_challan_from_order, which records what the challan delivered line
// by line. Whatever is left keeps the order pending; when nothing is left
// it is Completed. Voiding such a challan hands its pieces back.
import { supabase } from '../../lib/supabase';
import type { CashChallanOrder, CashChallanOrderItem, CashChallanOrderStatus, CashChallanOrderDelivery, AuditLog } from '../../types/database';

export const ORDER_COLS = 'id, order_number, customer_id, customer_name, customer_phone, items, notes, status, challan_id, created_by, created_at, updated_at, converted_at, converted_by, cash_challan_order_deliveries(id, challan_id, lines, reversed_at, created_at, cash_challans(challan_number, status))';
const MAX_ROWS = 500;

/** The order ID everyone uses: "ORD-0012" (same shape as HO-0012). */
export const fmtOrderNo = (n: number | null | undefined): string => (n == null ? 'ORD-—' : `ORD-${String(n).padStart(4, '0')}`);
/** The order a challan was made from, if any — read from the challan list's
 *  `order_links` embed (cash_challan_order_deliveries → cash_challan_orders). */
export const orderNoOf = (c: unknown): number | null =>
  (c as { order_links?: { cash_challan_orders: { order_number: number } | null }[] }).order_links?.find(l => l.cash_challan_orders)?.cash_challan_orders?.order_number ?? null;
/** What the challan list adds to its select for that. */
export const CHALLAN_ORDER_EMBED = 'order_links:cash_challan_order_deliveries(reversed_at, cash_challan_orders(order_number))';

type DeliveryRow = Pick<CashChallanOrderDelivery, 'id' | 'challan_id' | 'lines' | 'reversed_at' | 'created_at'> & { cash_challans: { challan_number: number; status: string } | null };
/** A list row with the challans made from it, oldest first. */
export type OrderRow = CashChallanOrder & { cash_challan_order_deliveries: DeliveryRow[] };

const n = (v: unknown) => Number(v) || 0;
/** Pieces of a line still to go out. */
export const lineLeft = (it: CashChallanOrderItem): number => Math.max(0, n(it.quantity) - n(it.delivered));
export const deliveredCount = (o: Pick<CashChallanOrder, 'items'>): number => o.items.reduce((s, it) => s + Math.min(n(it.delivered), n(it.quantity)), 0);
export const leftCount = (o: Pick<CashChallanOrder, 'items'>): number => o.items.reduce((s, it) => s + lineLeft(it), 0);
/** The challans that took pieces from this order (a voided one no longer counts). */
export const challansOf = (o: OrderRow): number[] => [...(o.cash_challan_order_deliveries || [])]
  .filter(d => !d.reversed_at).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  .map(d => d.cash_challans?.challan_number).filter((x): x is number => x != null);

export const blankItem = (): CashChallanOrderItem => ({ sku: '', description: '', quantity: 1 });

export type RecentCustomer = { id: string | null; name: string; phone: string | null };

/** The last five customers across challans and orders, newest
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

/** The lines going on this challan, ready for the challan form: `picks[i]`
 *  pieces of order line i (lines with 0 are left out), price 0 so the
 *  operator types the rate (the order never carried one). */
export const toChallanItems = (o: Pick<CashChallanOrder, 'items'>, picks: number[]) =>
  o.items.flatMap((it, i) => picks[i] > 0
    ? [{ sku: it.sku, description: it.description, quantity: picks[i], price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]
    : []);

/** Validation shared by the form and (defensively) the save. Returns the
 *  first problem in plain words, or null. A line cannot drop below what
 *  has already gone out on a challan. */
export function orderProblem(customerName: string, items: CashChallanOrderItem[]): string | null {
  if (!customerName.trim()) return 'Enter the customer name';
  const live = items.filter(it => it.sku.trim() || it.description.trim());
  if (!live.length) return 'Add at least one item with a SKU';
  const bad = live.find(it => !(Number(it.quantity) > 0));
  if (bad) return `Quantity must be at least 1 (${bad.sku || bad.description})`;
  const under = live.find(it => n(it.delivered) > 0 && Number(it.quantity) < n(it.delivered));
  if (under) return `${under.sku || under.description}: ${n(under.delivered)} already went out on a challan — the quantity can't be less`;
  return null;
}

/** Search matches the order ID ("ORD-12", "12"), the customer, the phone,
 *  a SKU on any line, or the notes — server-side (search_order_ids). */
export async function fetchOrders(status: CashChallanOrderStatus | '', search: string): Promise<OrderRow[]> {
  let q = supabase.from('cash_challan_orders').select(ORDER_COLS).order('created_at', { ascending: false }).limit(MAX_ROWS);
  if (status) q = q.eq('status', status);
  const s = search.trim();
  if (s) {
    const { data: ids, error: sErr } = await supabase.rpc('search_order_ids', { p_q: s });
    if (sErr) throw sErr;
    const list = ((ids || []) as (string | { search_order_ids: string })[]).map(x => (typeof x === 'string' ? x : x.search_order_ids));
    if (!list.length) return [];
    q = q.in('id', list.slice(0, MAX_ROWS));
  }
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as unknown as OrderRow[]).map(o => ({ ...o, items: Array.isArray(o.items) ? o.items : [], cash_challan_order_deliveries: o.cash_challan_order_deliveries || [] }));
}

/** Insert or update. Blank lines are dropped; quantities stored as whole
 *  numbers; what a line already delivered is kept. An edit only lands if
 *  nobody changed the order since it was opened (a challan made from it in
 *  the meantime would otherwise be overwritten). */
export async function saveOrder(o: { id?: string; seenAt?: string; customer_id: string | null; customer_name: string; customer_phone: string; items: CashChallanOrderItem[]; notes: string }): Promise<void> {
  const items = o.items.filter(it => it.sku.trim() || it.description.trim())
    .map(it => ({ sku: it.sku.trim().toUpperCase(), description: it.description.trim(), quantity: Math.max(1, Math.round(Number(it.quantity) || 1)), ...(n(it.delivered) > 0 ? { delivered: n(it.delivered) } : {}) }));
  const row = { customer_id: o.customer_id, customer_name: o.customer_name.trim(), customer_phone: o.customer_phone.trim() || null, items, notes: o.notes.trim() || null, updated_at: new Date().toISOString() };
  if (o.id) {
    let q = supabase.from('cash_challan_orders').update(row).eq('id', o.id).eq('status', 'pending');
    if (o.seenAt) q = q.eq('updated_at', o.seenAt);
    const { data, error } = await q.select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('This order changed since you opened it (a challan may have been made from it) — close and open it again');
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

/** order_over_due: pieces of an ordered SKU on the challan beyond what was due (sent meanwhile by someone else, or added on purpose). */
export type FromOrderResult = { id: string; challan_number: string; order_delivered: number; order_remaining: number; order_over_due: number; order_number: number; order_status: CashChallanOrderStatus };

/** The challan page's save for a challan made from an order: the challan
 *  and what it delivered, in one transaction (create_challan_from_order
 *  takes the same payload as create_challan_with_items). */
export async function createChallanFromOrder(orderId: string, payload: { p_challan: unknown; p_items: unknown; p_payment: unknown }): Promise<FromOrderResult> {
  const { data, error } = await supabase.rpc('create_challan_from_order', { p_order_id: orderId, ...payload });
  if (error) throw error;
  return data as FromOrderResult;
}

/** One order, fresh — the pick sheet starts from what is due now, not from a list read minutes ago. */
export async function fetchOrder(id: string): Promise<OrderRow | null> {
  const { data, error } = await supabase.from('cash_challan_orders').select(ORDER_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const o = data as unknown as OrderRow;
  return { ...o, items: Array.isArray(o.items) ? o.items : [], cash_challan_order_deliveries: o.cash_challan_order_deliveries || [] };
}

/** An order's track record (audit_log, module cash_challan_order), newest
 *  first: created, edited, a challan made (and what it took), a challan
 *  voided (pieces back), processed, cancelled, reopened. */
export async function loadOrderHistory(orderId: string): Promise<AuditLog[]> {
  const { data, error } = await supabase.from('audit_log').select('id, action, module, record_id, details, user_id, user_email, created_at, changes')
    .eq('module', 'cash_challan_order').eq('record_id', orderId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []) as AuditLog[];
}

/** Customer picker for the order form — same lookup the challan form uses. */
export async function searchOrderCustomers(q: string): Promise<{ id: string; name: string; phone: string | null }[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  const { data, error } = await supabase.from('cash_challan_customers').select('id, name, phone').ilike('name', `%${s.replace(/[%_]/g, '\\$&')}%`).limit(6);
  if (error) throw error;
  return (data || []) as { id: string; name: string; phone: string | null }[];
}
