-- Home dashboard "Cash in Hand": count money the same way as the Cash Book and
-- the handover (owner, 2026-11-03; see 20261103120000_handover_counts_payments).
--
-- cashSales / cashReturns used to sum each challan's whole amount_paid under
-- its LATEST payment_date, so a later payment dragged earlier money into the
-- later month, and return credit counted as money. They now sum the payment
-- rows themselves on their own payment_date: every money mode, Return Credit
-- and Write-off left out, voided challans out, reversals negative; refunds are
-- the payments on return challans. Everything else in the function is
-- unchanged (body copied from the live definition).

create or replace function public.dashboard_summary(p_month_start date, p_today timestamp with time zone, p_week_ago timestamp with time zone)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with ch as (
  select total, amount_paid, status, is_return, customer_name, created_at, payment_date
  from cash_challans where status <> 'voided'
),
paid_month as (
  select * from ch
  where status in ('paid','partial') and payment_date is not null and payment_date >= p_month_start
),
pays_month as (
  select c.is_return, (case when p.is_reversal then -1 else 1 end) * coalesce(p.amount, 0) as amt
  from cash_challan_payments p
  join cash_challans c on c.id = p.challan_id
  where c.status <> 'voided'
    and p.payment_mode not in ('Return Credit', 'Write-off')
    and p.payment_date >= p_month_start
),
hand as (
  select handover_number, amount, status, date, from_user_name, created_at from cash_handovers
),
inv as (select status, status_changed_at from inventory_items)
select jsonb_build_object(
  'scans', (select count(*) from packtime_scans where scanned_at >= p_today),
  'monthRev', round(coalesce((select sum(case when is_return then -1 else 1 end * coalesce(total,0)) from paid_month), 0)),
  'unsorted', (select count(*) from inv where status = 'unsorted'),
  'opening', coalesce((select opening_balance from cash_book_balances where date = p_month_start), 0),
  'cashSales', coalesce((select sum(amt) from pays_month where not is_return), 0),
  'cashReturns', coalesce((select sum(amt) from pays_month where is_return), 0),
  'totalExp', coalesce((select sum(amount) from cash_expenses where date >= p_month_start), 0),
  'confirmedHandMonth', coalesce((select sum(amount) from hand where status = 'confirmed' and date >= p_month_start), 0),
  'handoverTotal', round(coalesce((select sum(amount) from hand where status = 'confirmed'), 0)),
  'invBreakdown', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from inv group by status) b), '{}'::jsonb),
  'overdue', coalesce((select jsonb_agg(jsonb_build_object(
      'name', customer_name,
      'amount', coalesce(total,0) - coalesce(amount_paid,0),
      'days', floor(extract(epoch from (now() - created_at)) / 86400)))
    from ch where not is_return and status in ('unpaid','partial') and created_at < now() - interval '7 days'), '[]'::jsonb),
  'dryClean', coalesce((select jsonb_agg(jsonb_build_object(
      'days', floor(extract(epoch from (now() - coalesce(status_changed_at, now()))) / 86400)))
    from inv where status = 'dry_clean'), '[]'::jsonb),
  'pendingHandovers', coalesce((select jsonb_agg(jsonb_build_object(
      'number', handover_number, 'from', from_user_name, 'amount', amount,
      'ageDays', floor(extract(epoch from (now() - coalesce(created_at, now()))) / 86400)))
    from hand where status = 'pending'), '[]'::jsonb),
  'disputedCount', (select count(*) from hand where status = 'disputed'),
  'topCustomers', coalesce((select jsonb_agg(jsonb_build_object('name', customer_name, 'outstanding', outstanding) order by outstanding desc)
    from (select customer_name, sum(coalesce(total,0) - coalesce(amount_paid,0)) as outstanding
          from ch where not is_return and status in ('unpaid','partial')
          group by customer_name order by 2 desc limit 5) t), '[]'::jsonb),
  'scanTrend', (select jsonb_agg(jsonb_build_object('date', (d::date)::text, 'count', coalesce(n, 0)) order by d)
    from generate_series(((now() at time zone 'UTC')::date - 6), (now() at time zone 'UTC')::date, '1 day') d
    left join (select (scanned_at at time zone 'UTC')::date sd, count(*) n
               from packtime_scans where scanned_at >= p_week_ago group by 1) s on s.sd = d::date),
  'revTrend', (select jsonb_agg(jsonb_build_object('date', (d::date)::text, 'amount', round(coalesce(amt, 0))) order by d)
    from generate_series(((now() at time zone 'UTC')::date - 29), (now() at time zone 'UTC')::date, '1 day') d
    left join (select payment_date pd, sum(case when is_return then -1 else 1 end * coalesce(amount_paid,0)) amt
               from ch where payment_date is not null and status in ('paid','partial') group by 1) r on r.pd = d::date)
)
$function$;
