// The customer's usual way of paying: the payment mode on their latest
// non-voided sale challan that carries one. The FULL shortcut and Status →
// Paid pre-select it (owner: a customer mostly pays the same way every
// time); the operator can still change it. Nothing for a new customer, so
// the form then behaves exactly as before.
import { supabase } from '../../lib/supabase';

export async function fetchLastPaymentMode(customerId: string | null, customerName: string, excludeChallanId?: string | null): Promise<string | null> {
  const name = customerName.trim();
  if (!customerId && !name) return null;
  let q = supabase.from('cash_challans').select('payment_mode')
    .neq('status', 'voided').not('payment_mode', 'is', null).neq('payment_mode', 'Return Credit')
    .or('is_return.is.null,is_return.eq.false')
    .order('created_at', { ascending: false }).limit(1);
  q = customerId ? q.eq('customer_id', customerId) : q.ilike('customer_name', name.replace(/[%_]/g, '\\$&'));
  if (excludeChallanId) q = q.neq('id', excludeChallanId);
  const { data, error } = await q;
  if (error) throw error;
  const m = (data?.[0] as { payment_mode: string | null } | undefined)?.payment_mode;
  return m && m.trim() ? m : null;
}
