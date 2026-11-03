// The Cash Book's money-in list for a date range: one row per PAYMENT, on the
// day it was received — the same rule as handover_breakdown() (owner,
// 2026-11-03). Every money mode counts; Return Credit and Write-off rows are
// adjustments, not money, and voided challans stay out. Reversals come back
// negative, so a plain sum is the net. Paged past PostgREST's 1000-row cap.
import { supabase } from '../../lib/supabase';
import { fetchPaged } from '../../lib/fetchPaged';

/** amount_paid is this payment's signed amount (named so the list and CSV keep working). */
export type CashSaleRow = { id: string; challan_number: number; customer_name: string; is_return: boolean; amount_paid: number; payment_mode: string | null; payment_date: string | null };
type PayRow = { id: string; amount: number; payment_mode: string; payment_date: string; is_reversal: boolean; challan: { challan_number: number; customer_name: string; is_return: boolean } };

export async function loadPeriodPayments(from: string, to: string): Promise<{ rows: CashSaleRow[]; error: unknown }> {
  const { data, error } = await fetchPaged((a, z) => supabase.from('cash_challan_payments')
    .select('id, amount, payment_mode, payment_date, is_reversal, challan:cash_challans!cash_challan_payments_challan_id_fkey!inner(challan_number, customer_name, is_return, status)')
    .gte('payment_date', from).lte('payment_date', to)
    .not('payment_mode', 'in', '("Return Credit","Write-off")').neq('challan.status', 'voided')
    .order('payment_date', { ascending: false }).order('created_at', { ascending: false }).range(a, z), 20000);
  const rows = (data as unknown as PayRow[]).map(r => ({
    id: r.id, challan_number: r.challan.challan_number, customer_name: r.challan.customer_name, is_return: r.challan.is_return,
    amount_paid: (r.is_reversal ? -1 : 1) * Number(r.amount || 0),
    payment_mode: r.is_reversal ? `${r.payment_mode} · reversed` : r.payment_mode,
    payment_date: r.payment_date,
  }));
  return { rows, error };
}
