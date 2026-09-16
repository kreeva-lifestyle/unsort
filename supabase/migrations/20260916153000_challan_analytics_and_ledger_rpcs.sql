-- Analytics and the customer ledger were computed in the browser from raw
-- rows: four capped fetches for analytics (limit 10,000) and the last 100
-- (+500 per click) challans for the ledger, then reduce / group in JS. On
-- this project PostgREST answers at most 1000 rows per request and a
-- client-side .limit() never raises that, so every "truncated" guard
-- compared against a number that could never be reached: past 1000 rows
-- revenue, top customers, payment-mode breakup and outstanding balances
-- silently dropped data. The ledger also aggregated only the most recent
-- challans, so an old unpaid balance simply disappeared from a customer's
-- outstanding.
--
-- challan_analytics() and customer_ledger() compute the same figures in SQL
-- (a 1:1 port of the reduce/group code in CashChallan.tsx, same sign rules:
-- a return subtracts, a reversal subtracts, a refund on a return is money
-- out) and return one payload each. SECURITY INVOKER: RLS applies exactly as
-- the direct reads did.

create or replace function public.challan_analytics(
  p_from timestamptz, p_to timestamptz,
  p_prev_from timestamptz, p_prev_to timestamptz,
  p_pay_from date, p_pay_to date
)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with cur as (
    select total, is_return, customer_name from cash_challans
     where created_at >= p_from and created_at <= p_to and status <> 'voided'
  ), prev as (
    select total, is_return from cash_challans
     where created_at >= p_prev_from and created_at <= p_prev_to and status <> 'voided'
  ), cust as (
    select coalesce(nullif(btrim(customer_name), ''), '(no name)') as name,
           sum(case when is_return then -total else total end) as value
      from cur group by 1
    having sum(case when is_return then -total else total end) > 0
  ), modes as (
    select coalesce(p.payment_mode, 'Unset') as mode,
           sum((case when p.is_reversal then -p.amount else p.amount end) * (case when c.is_return then -1 else 1 end)) as amount
      from cash_challan_payments p join cash_challans c on c.id = p.challan_id
     where p.payment_date >= p_pay_from and p.payment_date <= p_pay_to
     group by 1
  )
  select jsonb_build_object(
    'total_revenue', (select coalesce(sum(case when is_return then -total else total end), 0) from cur),
    'sales_count',   (select count(*) from cur where not is_return),
    'returns_count', (select count(*) from cur where is_return),
    'voided_count',  (select count(*) from cash_challans where created_at >= p_from and created_at <= p_to and status = 'voided'),
    'prev_revenue',  (select coalesce(sum(case when is_return then -total else total end), 0) from prev),
    'prev_count',    (select count(*) from prev where not is_return),
    'top_customers', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) order by value desc), '[]'::jsonb)
                        from (select name, value from cust order by value desc limit 10) t),
    'customer_count', (select count(*) from cust),
    'by_mode',       (select coalesce(jsonb_object_agg(mode, amount), '{}'::jsonb) from modes)
  );
$function$;

revoke all on function public.challan_analytics(timestamptz, timestamptz, timestamptz, timestamptz, date, date) from public, anon;
grant execute on function public.challan_analytics(timestamptz, timestamptz, timestamptz, timestamptz, date, date) to authenticated;

-- One row per customer (keyed on customer_id, name fallback for legacy rows),
-- over EVERY non-voided challan, customers with a balance first. p_query is a
-- plain substring match on the name (no wildcard escaping needed).
create or replace function public.customer_ledger(p_query text default null, p_limit int default 500)
returns table (
  id uuid, name text, total numeric, paid numeric, outstanding numeric, count int,
  aging_current numeric, aging_d30 numeric, aging_d60 numeric, aging_d90plus numeric
)
language sql
stable
set search_path to 'public'
as $function$
  with rows as (
    select coalesce(customer_id::text, 'name:' || customer_name) as key, customer_id, customer_name, total,
           coalesce(amount_paid, 0) as amount_paid, is_return, status, created_at,
           floor(extract(epoch from (now() - created_at)) / 86400) as days
      from cash_challans
     where status <> 'voided'
       and (p_query is null or btrim(p_query) = '' or position(lower(btrim(p_query)) in lower(coalesce(customer_name, ''))) > 0)
  ), agg as (
    select key,
           (array_agg(customer_id order by created_at desc))[1] as id,
           (array_agg(customer_name order by created_at desc))[1] as name,
           sum(case when is_return then -total else total end) as total,
           sum(case when is_return then -amount_paid else amount_paid end) as paid,
           count(*)::int as count,
           sum(case when not is_return and status <> 'paid' and total - amount_paid > 0 and days <= 30 then total - amount_paid else 0 end) as aging_current,
           sum(case when not is_return and status <> 'paid' and total - amount_paid > 0 and days > 30 and days <= 60 then total - amount_paid else 0 end) as aging_d30,
           sum(case when not is_return and status <> 'paid' and total - amount_paid > 0 and days > 60 and days <= 90 then total - amount_paid else 0 end) as aging_d60,
           sum(case when not is_return and status <> 'paid' and total - amount_paid > 0 and days > 90 then total - amount_paid else 0 end) as aging_d90plus
      from rows group by key
  )
  select id, name, total, paid, total - paid as outstanding, count, aging_current, aging_d30, aging_d60, aging_d90plus
    from agg
   order by (total - paid > 0) desc, (total - paid) desc, name
   limit greatest(coalesce(p_limit, 500), 1);
$function$;

revoke all on function public.customer_ledger(text, int) from public, anon;
grant execute on function public.customer_ledger(text, int) to authenticated;
