// The Cash Book's money-in rows: one row per PAYMENT, on the day it was
// received — the same rule as handover_breakdown() (owner, 2026-11-03). Every
// money mode counts; Return Credit and Write-off rows are adjustments, not
// money. A voided challan's rows stay in: its reversals net it to zero (and
// offset money an earlier handover counted). Reversals come back negative, so
// a plain sum is the net. Paged past PostgREST's 1000-row cap, with `id` as the
// last sort key so a page boundary can never repeat or skip a row.
import { supabase } from '../../lib/supabase';
import { fetchPaged } from '../../lib/fetchPaged';

/** amount_paid is this payment's signed amount (named so the list and CSV keep working); ho = the number of the signed handover that counted it. */
export type CashSaleRow = { id: string; challan_number: number; customer_name: string; is_return: boolean; amount_paid: number; payment_mode: string | null; payment_date: string | null; ho: number | null };
type PayRow = { id: string; amount: number; payment_mode: string; payment_date: string; is_reversal: boolean; challan: { challan_number: number; customer_name: string; is_return: boolean }; handover: { handover_number: number } | null };

async function load(filter: { from: string; to: string } | { handoverId: string }, newestFirst: boolean): Promise<{ rows: CashSaleRow[]; error: unknown }> {
  const { data, error } = await fetchPaged((a, z) => {
    let q = supabase.from('cash_challan_payments')
      .select('id, amount, payment_mode, payment_date, is_reversal, challan:cash_challans!cash_challan_payments_challan_id_fkey!inner(challan_number, customer_name, is_return, status), handover:cash_handovers(handover_number)')
      .not('payment_mode', 'in', '("Return Credit","Write-off")');
    q = 'handoverId' in filter ? q.eq('handover_id', filter.handoverId) : q.gte('payment_date', filter.from).lte('payment_date', filter.to);
    return q.order('payment_date', { ascending: !newestFirst }).order('created_at', { ascending: !newestFirst }).order('id').range(a, z);
  }, 20000);
  const rows = (data as unknown as PayRow[]).map(r => ({
    id: r.id, challan_number: r.challan.challan_number, customer_name: r.challan.customer_name, is_return: r.challan.is_return,
    amount_paid: (r.is_reversal ? -1 : 1) * Number(r.amount || 0),
    payment_mode: r.is_reversal ? `${r.payment_mode} · reversed` : r.payment_mode,
    payment_date: r.payment_date,
    ho: r.handover?.handover_number ?? null,
  }));
  return { rows, error };
}

/** Money received / refunded in a date range, newest first. */
export const loadPeriodPayments = (from: string, to: string) => load({ from, to }, true);
/** The payments a signed handover counted (stamped by its confirm), oldest first. */
export const loadHandoverPayments = (handoverId: string) => load({ handoverId }, false);
