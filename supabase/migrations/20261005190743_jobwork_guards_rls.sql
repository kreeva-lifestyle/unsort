-- Jobwork module, part 3: guards, audit trail, RLS policies, summary view.
-- ── guards ──────────────────────────────────────────────────────────────
-- A closed or cancelled job is a record: its terms stop changing (status
-- itself moves only through set_jobwork_status). Movements need an open
-- job; payments are allowed on a closed job (bills are often settled
-- later) but never on a cancelled one.
create or replace function public.jobwork_guard()
 returns trigger language plpgsql set search_path = public
as $$
declare v_status text; v_order uuid;
begin
  if tg_table_name = 'jobwork_orders' then
    if old.status <> 'open' and new.status = old.status then
      raise exception 'This job is % — reopen it to make changes', old.status;
    end if;
    new.updated_at := now();
    return new;
  end if;
  if tg_table_name = 'jobwork_entry_lines' then
    select order_id into v_order from jobwork_entries where id = coalesce(new.entry_id, old.entry_id);
    -- Cascade from a deleted entry: the parent is already gone and its own
    -- guard has checked the job.
    if v_order is null and tg_op = 'DELETE' then return old; end if;
  else
    v_order := coalesce(new.order_id, old.order_id);
  end if;
  select status into v_status from jobwork_orders where id = v_order;
  if tg_table_name = 'jobwork_payments' then
    if v_status = 'cancelled' then raise exception 'This job is cancelled — no payments against it'; end if;
  elsif v_status is distinct from 'open' then
    raise exception 'This job is % — reopen it to make changes', coalesce(v_status, 'missing');
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_jobwork_orders_guard before update on public.jobwork_orders
  for each row execute function public.jobwork_guard();
create trigger trg_jobwork_materials_guard before insert or update or delete on public.jobwork_materials
  for each row execute function public.jobwork_guard();
create trigger trg_jobwork_entries_guard before insert or update or delete on public.jobwork_entries
  for each row execute function public.jobwork_guard();
create trigger trg_jobwork_entry_lines_guard before insert or update or delete on public.jobwork_entry_lines
  for each row execute function public.jobwork_guard();
create trigger trg_jobwork_payments_guard before insert or update or delete on public.jobwork_payments
  for each row execute function public.jobwork_guard();

-- Money and deletions leave a trail: payments are single-row client
-- writes (RLS-gated), and deleting a movement is an admin correction.
create or replace function public.jobwork_audit()
 returns trigger language plpgsql set search_path = public
as $$
declare v_no int;
begin
  select jw_number into v_no from jobwork_orders where id = coalesce(new.order_id, old.order_id);
  if tg_table_name = 'jobwork_payments' then
    perform audit_write('jobwork', case when tg_op = 'INSERT' then 'PAYMENT' else 'PAYMENT_DELETE' end,
      coalesce(new.order_id, old.order_id)::text,
      'JW #' || v_no || ' — ₹' || coalesce(new.amount, old.amount) || ' ' || coalesce(new.mode, old.mode)
        || case when tg_op = 'DELETE' then ' payment deleted' else ' paid' end);
  else
    perform audit_write('jobwork', 'ENTRY_DELETE', old.order_id::text,
      'JW #' || v_no || ' — deleted ' || old.kind || ' entry of ' || old.entry_date
        || ' (' || old.pcs_ok || ' OK, ' || old.pcs_rejected || ' rejected, ' || old.pcs_rework || ' rework)');
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_jobwork_payments_audit after insert or delete on public.jobwork_payments
  for each row execute function public.jobwork_audit();
create trigger trg_jobwork_entries_audit after delete on public.jobwork_entries
  for each row execute function public.jobwork_audit();

-- ── RLS ─────────────────────────────────────────────────────────────────
create policy "jw orders read" on public.jobwork_orders for select to authenticated using (true);
create policy "jw orders insert" on public.jobwork_orders for insert to authenticated with check ((select public.jw_role()) in ('admin', 'manager', 'operator'));
create policy "jw orders update" on public.jobwork_orders for update to authenticated using ((select public.jw_role()) in ('admin', 'manager', 'operator'));

create policy "jw materials read" on public.jobwork_materials for select to authenticated using (true);
create policy "jw materials write" on public.jobwork_materials for all to authenticated
  using ((select public.jw_role()) in ('admin', 'manager', 'operator'))
  with check ((select public.jw_role()) in ('admin', 'manager', 'operator'));

create policy "jw entries read" on public.jobwork_entries for select to authenticated using (true);
create policy "jw entries insert" on public.jobwork_entries for insert to authenticated with check ((select public.jw_role()) in ('admin', 'manager', 'operator'));
create policy "jw entries delete" on public.jobwork_entries for delete to authenticated using ((select public.jw_role()) in ('admin', 'manager'));

create policy "jw lines read" on public.jobwork_entry_lines for select to authenticated using (true);
create policy "jw lines insert" on public.jobwork_entry_lines for insert to authenticated with check ((select public.jw_role()) in ('admin', 'manager', 'operator'));
create policy "jw lines delete" on public.jobwork_entry_lines for delete to authenticated using ((select public.jw_role()) in ('admin', 'manager'));

create policy "jw payments read" on public.jobwork_payments for select to authenticated using (true);
create policy "jw payments insert" on public.jobwork_payments for insert to authenticated with check ((select public.jw_role()) in ('admin', 'manager'));
create policy "jw payments delete" on public.jobwork_payments for delete to authenticated using ((select public.jw_role()) in ('admin', 'manager'));

-- ── per-job summary (list, filters, jobworker statement) ───────────────
create view public.jobwork_order_summary with (security_invoker = true) as
select o.id, o.jw_number, o.vendor_id, o.vendor_name, o.vendor_phone, o.job_type, o.sku, o.component,
  o.costing_product_id, o.pieces, o.rate, o.job_date, o.expected_date, o.status, o.notes, o.close_reason,
  o.created_at, o.updated_at,
  coalesce(e.pcs_ok, 0)::int as pcs_ok,
  coalesce(e.pcs_rejected, 0)::int as pcs_rejected,
  coalesce(e.pcs_rework, 0)::int as pcs_rework,
  greatest(o.pieces - coalesce(e.pcs_ok, 0) - coalesce(e.pcs_rejected, 0) + coalesce(e.pcs_rework, 0), 0)::int as pcs_remaining,
  coalesce(e.outs, 0)::int as out_count,
  e.last_entry_date,
  round(coalesce(e.pcs_ok, 0) * o.rate, 2) as bill,
  coalesce(p.paid, 0) as paid,
  round(coalesce(e.pcs_ok, 0) * o.rate - coalesce(p.paid, 0), 2) as due,
  p.last_pay_date
from public.jobwork_orders o
left join lateral (
  select sum(pcs_ok) pcs_ok, sum(pcs_rejected) pcs_rejected, sum(pcs_rework) pcs_rework,
    count(*) filter (where kind = 'out') outs, max(entry_date) last_entry_date
  from public.jobwork_entries where order_id = o.id) e on true
left join lateral (
  select sum(amount) paid, max(pay_date) last_pay_date
  from public.jobwork_payments where order_id = o.id) p on true;

grant select on public.jobwork_order_summary to authenticated;
