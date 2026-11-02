-- challan_mode_receipts(): challan_mode_payments() plus WHO received the money (owner's ask,
-- 2026-11-02: "show who have received the cash"). Each payment row records
-- the staff member who took it (cash_challan_payments.paid_by → profiles);
-- every challan row now carries `receivers` = [{name, amount}], split by
-- that person, so a challan paid partly to two people shows both. Same
-- totals rule as before (and as challan_analytics by_mode). A new return
-- type needs a new function (CREATE OR REPLACE cannot change it), so this is
-- challan_mode_receipts(); the app moves to it and challan_mode_payments()
-- is left unused (dropping it is a separate, confirmed cleanup).
--
-- SECURITY INVOKER: cash_* RLS (staff only) applies; profiles names are
-- readable to signed-in users.

create or replace function public.challan_mode_receipts(p_mode text, p_from date, p_to date)
returns table (
  challan_id uuid, challan_number int, customer_name text, is_return boolean, status text,
  created_at timestamptz, paid_on date, payments int, amount numeric, receivers jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with pay as (
    select c.id, c.challan_number, c.customer_name, c.is_return, c.status, c.created_at, p.payment_date,
           (case when p.is_reversal then -p.amount else p.amount end) * (case when c.is_return then -1 else 1 end) as amt,
           coalesce(nullif(btrim(pr.full_name), ''), pr.email, 'Not recorded') as who
      from cash_challan_payments p
      join cash_challans c on c.id = p.challan_id
      left join profiles pr on pr.id = p.paid_by
     where p.payment_date >= p_from and p.payment_date <= p_to
       and case when p_mode = 'Unset' then p.payment_mode is null else p.payment_mode = p_mode end
  ),
  per as (select id, who, sum(amt) as amt from pay group by id, who having sum(amt) <> 0)
  select g.id, g.challan_number, g.customer_name, g.is_return, g.status, g.created_at, g.paid_on, g.n, g.amt,
         coalesce((select jsonb_agg(jsonb_build_object('name', per.who, 'amount', per.amt) order by per.amt desc)
                   from per where per.id = g.id), '[]'::jsonb)
    from (select id, challan_number, customer_name, is_return, status, created_at,
                 max(payment_date) as paid_on, count(*)::int as n, sum(amt) as amt
            from pay group by id, challan_number, customer_name, is_return, status, created_at
          having sum(amt) <> 0) g
   order by g.paid_on desc, g.challan_number desc
   limit 2000
$$;

revoke all on function public.challan_mode_receipts(text, date, date) from public, anon;
grant execute on function public.challan_mode_receipts(text, date, date) to authenticated, service_role;
