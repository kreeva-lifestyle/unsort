// Single definition of "what this customer owes", matching the ledger's
// credit model (CashChallan fetchLedger / exportLedgerPDF): open sale
// balances minus ALL active return credits. A return is a credit for its
// full total (never cash), regardless of any historical amount_paid
// recorded under the old refund model. Returns always carry status 'paid',
// so an open-sales query can never see them — credits need their own query.
import { supabase } from './supabase';

export async function fetchCustomerOutstanding(opts: {
  name: string;
  customerId?: string | null;
  excludeId?: string | null;
}): Promise<{ value: number; error: { message: string } | null }> {
  let salesQ = supabase.from('cash_challans').select('total, amount_paid')
    .eq('customer_name', opts.name).in('status', ['unpaid', 'partial']).eq('is_return', false);
  let creditsQ = supabase.from('cash_challans').select('total')
    .eq('customer_name', opts.name).eq('is_return', true).neq('status', 'voided');
  if (opts.customerId) { salesQ = salesQ.eq('customer_id', opts.customerId); creditsQ = creditsQ.eq('customer_id', opts.customerId); }
  if (opts.excludeId) { salesQ = salesQ.neq('id', opts.excludeId); creditsQ = creditsQ.neq('id', opts.excludeId); }
  const [sales, credits] = await Promise.all([salesQ, creditsQ]);
  const error = sales.error || credits.error;
  if (error) return { value: 0, error };
  const open = (sales.data || []).reduce((s, c) => s + (Number(c.total) - Number(c.amount_paid || 0)), 0);
  const credit = (credits.data || []).reduce((s, c) => s + Number(c.total), 0);
  return { value: Math.max(0, Math.round(open - credit)), error: null };
}
