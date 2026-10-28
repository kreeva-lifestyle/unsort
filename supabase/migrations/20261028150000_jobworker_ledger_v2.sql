-- Jobworker ledger v2: everything the redesigned statement screen needs in
-- one read (owner: "too hard to understand" — rebuilt on the research in
-- reports/Jobworker ledger made understandable.md). Same signature; adds to
-- the jsonb:
--   jobs         one card per job (pieces given / OK / rejected / rework /
--                pending, bill = OK × rate, paid, due, status, dates)
--   month_work   billed since the 1st of this month (IST)
--   month_paid   paid since the 1st of this month (IST)
--   oldest_open  job date of the oldest open job
-- Still read-only and SECURITY INVOKER.
create or replace function public.jobworker_ledger(p_worker_key text, p_from date default null, p_to date default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with jobs as (
    select o.* from public.jobwork_orders o
    join public.jobwork_order_worker w on w.order_id = o.id
    where w.worker_key = p_worker_key
  ),
  ent as (
    select e.*, j.rate,
      sum(e.pcs_ok) over (partition by e.order_id order by e.entry_date, e.created_at, e.id) as cum_ok
    from public.jobwork_entries e join jobs j on j.id = e.order_id
  ),
  lines as (
    select l.entry_id,
      jsonb_agg(jsonb_build_object('name', m.name, 'qty', l.qty, 'unit', m.unit) order by m.name) as materials
    from public.jobwork_entry_lines l
    join public.jobwork_materials m on m.id = l.material_id
    where l.qty > 0 and l.entry_id in (select id from ent)
    group by l.entry_id
  ),
  ev as (
    select coalesce(j.job_date, j.created_at::date) as d, 0 as ord, j.created_at as ts, 'given'::text as kind, j.id as order_id,
      j.pieces as qty, 0::numeric as rejected, 0::numeric as amount, 0::numeric as paid,
      null::jsonb as materials, j.notes as note, null::text as mode, null::text as reference
    from jobs j
    union all
    select e.entry_date, case when e.kind = 'out' then 1 else 2 end, e.created_at, e.kind, e.order_id,
      case when e.kind = 'out' then e.pcs_rework else e.pcs_ok end, e.pcs_rejected,
      case when e.kind = 'in' then round(e.cum_ok * e.rate, 2) - round((e.cum_ok - e.pcs_ok) * e.rate, 2) else 0 end, 0,
      l.materials, e.note, null, null
    from ent e left join lines l on l.entry_id = e.id
    union all
    select p.pay_date, 3, p.created_at, 'payment', p.order_id, 0, 0, 0, p.amount, null, p.note, p.mode, p.reference
    from public.jobwork_payments p join jobs j on j.id = p.order_id
  ),
  month_start as (select date_trunc('month', now() at time zone 'Asia/Kolkata')::date as d),
  opening as (select coalesce(sum(amount - paid), 0) as bal from ev where p_from is not null and d < p_from),
  inrange as (select * from ev where (p_from is null or d >= p_from) and (p_to is null or d <= p_to)),
  ordered as (
    select r.*,
      (select bal from opening) + sum(r.amount - r.paid) over (order by r.d, r.ord, r.ts, r.order_id rows unbounded preceding) as balance,
      row_number() over (order by r.d, r.ord, r.ts, r.order_id) as rn
    from inrange r
  )
  select jsonb_build_object(
    'opening', (select bal from opening),
    'work', (select coalesce(sum(amount), 0) from inrange),
    'paid', (select coalesce(sum(paid), 0) from inrange),
    'closing', (select bal from opening) + (select coalesce(sum(amount - paid), 0) from inrange),
    'count', (select count(*) from inrange),
    'month_work', (select coalesce(sum(amount), 0) from ev where d >= (select d from month_start)),
    'month_paid', (select coalesce(sum(paid), 0) from ev where d >= (select d from month_start)),
    'oldest_open', (select min(coalesce(job_date, created_at::date)) from jobs where status = 'open'),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'jw', s.jw_number, 'sku', s.sku, 'job_type', s.job_type, 'component', s.component, 'unit', s.qty_unit,
        'pieces', s.pieces, 'ok', s.pcs_ok, 'rejected', s.pcs_rejected, 'rework', s.pcs_rework, 'pending', s.pcs_remaining,
        'rate', s.rate, 'bill', s.bill, 'paid', s.paid, 'due', s.due, 'status', s.status, 'job_date', s.job_date,
        'expected_date', s.expected_date, 'last_entry_date', s.last_entry_date, 'out_count', s.out_count)
        order by (s.status = 'open') desc, s.job_date desc nulls last, s.jw_number desc)
      from public.jobwork_order_summary s where s.id in (select id from jobs)), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'd', o.d, 'kind', o.kind, 'order_id', o.order_id, 'jw', j.jw_number, 'sku', j.sku, 'job_type', j.job_type,
        'component', j.component, 'unit', j.qty_unit, 'rate', j.rate, 'status', j.status, 'qty', o.qty,
        'rejected', o.rejected, 'amount', o.amount, 'paid', o.paid, 'balance', o.balance,
        'materials', o.materials, 'note', o.note, 'mode', o.mode, 'reference', o.reference) order by o.rn)
      from ordered o join jobs j on j.id = o.order_id
      where o.rn <= 2000), '[]'::jsonb)
  );
$$;
