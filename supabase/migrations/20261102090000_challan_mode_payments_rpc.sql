-- challan_mode_payments(): the challans behind one row of Analytics →
-- "Payment Mode Breakup" (owner's ask, 2026-11-02: tap UPI → every UPI
-- challan, tap Cash → every cash challan).
--
-- Same rule as challan_analytics()'s by_mode, so the list adds up to the
-- figure on that row: payments by payment_date in the range, a reversal
-- subtracts, money on a RETURN challan is a refund (money out, negative).
-- One row per challan (several payments on one challan in the range are
-- summed); a challan whose payments cancel out (voided and reversed in the
-- range) is left out. p_mode 'Unset' = payments with no mode, as by_mode
-- labels them.
--
-- SECURITY INVOKER: cash_* RLS (staff only) applies to the caller.

create or replace function public.challan_mode_payments(p_mode text, p_from date, p_to date)
returns table (
  challan_id uuid, challan_number int, customer_name text, is_return boolean, status text,
  created_at timestamptz, paid_on date, payments int, amount numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.challan_number, c.customer_name, c.is_return, c.status, c.created_at,
         max(p.payment_date), count(*)::int,
         sum((case when p.is_reversal then -p.amount else p.amount end) * (case when c.is_return then -1 else 1 end))
    from cash_challan_payments p join cash_challans c on c.id = p.challan_id
   where p.payment_date >= p_from and p.payment_date <= p_to
     and case when p_mode = 'Unset' then p.payment_mode is null else p.payment_mode = p_mode end
   group by c.id
  having sum((case when p.is_reversal then -p.amount else p.amount end) * (case when c.is_return then -1 else 1 end)) <> 0
   order by max(p.payment_date) desc, c.challan_number desc
   limit 2000
$$;

revoke all on function public.challan_mode_payments(text, date, date) from public, anon;
grant execute on function public.challan_mode_payments(text, date, date) to authenticated, service_role;
