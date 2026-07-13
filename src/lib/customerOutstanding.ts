// Single definition of "what this customer owes", matching the ledger's
// credit model (CashChallan fetchLedger / exportLedgerPDF): open sale
// balances minus UNSETTLED return credits. amount_paid on a return records
// how much of its credit was already refunded to the customer in cash
// (settle_return_refund RPC, and the old refund-model rows) — a settled
// credit must not keep offsetting what the customer owes. Returns always
// carry status 'paid', so an open-sales query can never see them — credits
// need their own query.
import { supabase } from './supabase';

export async function fetchCustomerOutstanding(opts: {
  name: string;
  customerId?: string | null;
  excludeId?: string | null;
}): Promise<{ value: number; error: { message: string } | null }> {
  let salesQ = supabase.from('cash_challans').select('total, amount_paid')
    .in('status', ['unpaid', 'partial']).eq('is_return', false);
  let creditsQ = supabase.from('cash_challans').select('total, amount_paid')
    .eq('is_return', true).neq('status', 'voided');
  if (opts.customerId) {
    // id is authoritative — matching the name too would exclude a renamed
    // customer's older challans (they carry the old customer_name).
    salesQ = salesQ.eq('customer_id', opts.customerId);
    creditsQ = creditsQ.eq('customer_id', opts.customerId);
  } else {
    // Name-only path (manually typed): case-insensitive exact match, with
    // ilike wildcards escaped so "50%_off" style names can't widen the query.
    const pattern = opts.name.replace(/[%_]/g, '\\$&');
    salesQ = salesQ.ilike('customer_name', pattern);
    creditsQ = creditsQ.ilike('customer_name', pattern);
  }
  if (opts.excludeId) { salesQ = salesQ.neq('id', opts.excludeId); creditsQ = creditsQ.neq('id', opts.excludeId); }
  const [sales, credits] = await Promise.all([salesQ, creditsQ]);
  const error = sales.error || credits.error;
  if (error) return { value: 0, error };
  const open = (sales.data || []).reduce((s, c) => s + (Number(c.total) - Number(c.amount_paid || 0)), 0);
  const credit = (credits.data || []).reduce((s, c) => s + Math.max(0, Number(c.total) - Number(c.amount_paid || 0)), 0);
  // Paise-precision to match the ledger; floored at 0 (net credit shows clear).
  return { value: Math.max(0, Math.round((open - credit) * 100) / 100), error: null };
}
