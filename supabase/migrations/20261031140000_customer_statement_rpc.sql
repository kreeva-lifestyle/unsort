-- customer_statement(): a bank-statement view of one Cash Challan customer
-- (owner's ask, 2026-10-31). The ledger's old period figures counted a return
-- once as "returns" and again (negatively) as "received" when its credit had
-- cleared bills from an EARLIER period — RAWLIKE's October showed
-- "Received ₹-13,500". The owner approved a statement that reads like a bank
-- passbook instead:
--
--   pending at the start  + bills  − goods returned  − money received
--   (+ refunds paid out)  = to collect
--
-- with every bill, return and payment in date order (the app adds the running
-- balance) and the bills still open today.
--
-- The model, consistent with the ledger's credit model and with
-- customer_ledger(): a return counts once, on its own date, at its full value.
-- "Return Credit" payment rows only move that credit between a return and the
-- sale it cleared, so they are NOT money and are used only to say which bills
-- a return cleared. Real money = every other payment row (reversals negative):
-- on a sale it is money received, on a return it is a refund paid out.
-- Voided challans and their payments are left out entirely. Days are IST.
--
-- SECURITY INVOKER: cash_* RLS (staff only) applies to the caller.

create or replace function public.customer_statement(
  p_customer_id uuid, p_customer_name text, p_from date default null, p_to date default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ch as (
    select c.id, c.challan_number as no, c.is_return, c.total, c.amount_paid, c.created_at,
           (c.created_at at time zone 'Asia/Kolkata')::date as d
    from cash_challans c
    where c.status <> 'voided'
      and case when p_customer_id is not null then c.customer_id = p_customer_id
               else c.customer_name ilike replace(replace(replace(coalesce(p_customer_name, ''), '\', '\\'), '%', '\%'), '_', '\_') end
  ),
  pay as (
    select p.challan_id, p.payment_mode as mode, p.payment_date as d, p.created_at,
           case when p.is_reversal then -p.amount else p.amount end as amt,
           p.settled_against, c.is_return, c.no
    from cash_challan_payments p join ch c on c.id = p.challan_id
  ),
  money as (select * from pay where mode is distinct from 'Return Credit'),
  inr as (  -- what falls inside the period
    select * from ch where (p_from is null or d >= p_from) and (p_to is null or d <= p_to)
  ),
  events as (
    -- bills
    select d, created_at as ts, 'bill' as kind, no, total as amount, null::text as mode, '[]'::jsonb as refs
    from inr where not is_return
    union all
    -- goods returned, with the bills each one cleared
    select r.d, r.created_at, 'return', r.no, r.total, null,
      coalesce((select jsonb_agg(jsonb_build_object('no', s.no, 'd', s.d) order by s.no)
                from (select distinct sa.no, sa.d from pay x join ch sa on sa.id = x.settled_against
                      where x.challan_id = r.id and x.mode = 'Return Credit') s), '[]'::jsonb)
    from inr r where r.is_return
    union all
    -- money in (sales) / refunds out (returns), one line per day + mode
    select m.d, min(m.created_at), case when m.is_return then 'refund' else 'received' end, null, sum(m.amt), m.mode,
      coalesce(jsonb_agg(distinct m.no) filter (where m.amt > 0), '[]'::jsonb)
    from money m
    where (p_from is null or m.d >= p_from) and (p_to is null or m.d <= p_to)
    group by m.d, m.mode, m.is_return
    having sum(m.amt) <> 0
  )
  select jsonb_build_object(
    'opening', coalesce((select sum(case when is_return then -total else total end) from ch where p_from is not null and d < p_from), 0)
             - coalesce((select sum(case when is_return then -amt else amt end) from money where p_from is not null and d < p_from), 0),
    'events', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'kind', kind, 'no', no, 'amount', amount, 'mode', mode, 'refs', refs)
                                         order by d, ts, kind) from events), '[]'::jsonb),
    'open_bills', coalesce((select jsonb_agg(jsonb_build_object('no', no, 'd', d, 'total', total, 'due', total - amount_paid) order by d, no)
                            from ch where not is_return and total - amount_paid > 0.009), '[]'::jsonb),
    'unused_credit', coalesce((select sum(total - amount_paid) from ch where is_return and total - amount_paid > 0.009), 0),
    'outstanding', coalesce((select sum(case when is_return then -(total - amount_paid) else total - amount_paid end) from ch), 0)
  )
$$;

revoke all on function public.customer_statement(uuid, text, date, date) from public, anon;
grant execute on function public.customer_statement(uuid, text, date, date) to authenticated, service_role;
