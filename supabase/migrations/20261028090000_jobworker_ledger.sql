-- Jobworker ledger: one running account per jobworker across all their jobs
-- (owner: "Ledger for jobworker needed"). Read-only — no new table, nothing
-- stored twice; everything is derived from jobs, movements and payments.
--
-- Who is one jobworker: the linked master vendor (po_vendors), else the master
-- vendor whose name matches the typed name, else the typed name itself — the
-- same resolution recent_jobworkers() uses, so a job typed "Reena" before
-- she was in the master lands in her account, not a second one.
--
-- Money agrees with the job list to the paisa: jobwork_order_summary bills a
-- job as round(total OK × rate, 2), so each receipt is booked as the change
-- in that rounded running total, and a jobworker's ledger closes on exactly
-- the sum of their jobs' "due".
--
-- SECURITY INVOKER throughout: the caller's RLS applies (as for the view).

create or replace view public.jobwork_order_worker with (security_invoker = on) as
select o.id as order_id,
  coalesce(v.id, m.id) as vendor_id,
  coalesce(coalesce(v.id, m.id)::text, 'n:' || lower(btrim(o.vendor_name))) as worker_key,
  btrim(coalesce(v.name, m.name, o.vendor_name)) as worker_name,
  case when coalesce(v.id, m.id) is not null then nullif(btrim(coalesce(v.phone, m.phone)), '')
       else nullif(btrim(o.vendor_phone), '') end as worker_phone
from public.jobwork_orders o
left join public.po_vendors v on v.id = o.vendor_id
left join lateral (
  select p.id, p.name, p.phone from public.po_vendors p
  where v.id is null and lower(btrim(p.name)) = lower(btrim(o.vendor_name))
  order by p.is_active desc nulls last, p.created_at desc nulls last, p.id
  limit 1
) m on true;
grant select on public.jobwork_order_worker to authenticated;

-- One line per jobworker: what was billed, paid, is due, and is still with them.
create or replace function public.jobworker_accounts()
returns table(worker_key text, vendor_id uuid, worker_name text, worker_phone text, jobs int, open_jobs int,
              billed numeric, paid numeric, due numeric, pending_pcs numeric, pending_m numeric, last_activity date)
language sql stable security invoker set search_path = public as $$
  select w.worker_key,
    (array_agg(w.vendor_id) filter (where w.vendor_id is not null))[1],
    (array_agg(w.worker_name order by s.created_at desc))[1],
    (array_agg(w.worker_phone order by s.created_at desc) filter (where w.worker_phone is not null))[1],
    count(*)::int,
    (count(*) filter (where s.status = 'open'))::int,
    coalesce(sum(s.bill), 0), coalesce(sum(s.paid), 0), coalesce(sum(s.due), 0),
    coalesce(sum(s.pcs_remaining) filter (where s.status = 'open' and s.qty_unit <> 'm'), 0),
    coalesce(sum(s.pcs_remaining) filter (where s.status = 'open' and s.qty_unit = 'm'), 0),
    greatest(max(s.job_date), max(s.last_entry_date), max(s.last_pay_date))
  from public.jobwork_order_summary s
  join public.jobwork_order_worker w on w.order_id = s.id
  where w.worker_name <> ''
  group by w.worker_key
  order by 9 desc, 12 desc nulls last;
$$;

-- One jobworker's statement for a period (null = open-ended): opening balance,
-- every dated line (work given, rework/material sent, received = billed,
-- payment) with a running balance, and the period totals. Rows are capped at
-- 2000; the totals and closing balance always cover the whole period.
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

revoke all on function public.jobworker_accounts() from public, anon;
revoke all on function public.jobworker_ledger(text, date, date) from public, anon;
grant execute on function public.jobworker_accounts() to authenticated;
grant execute on function public.jobworker_ledger(text, date, date) to authenticated;
