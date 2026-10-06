-- Jobwork: a job is counted in pieces OR meters.
-- Why: some work is given by length (e.g. 8.80 m of all-over fabric for
-- handwork), and the job, every receipt/rework and the server checks only
-- took whole pieces. Each job now has qty_unit ('pcs' | 'm'). Quantities
-- become numeric(12,2): pieces must still be whole (table check on the job,
-- RPC check on movements); meters allow up to 2 decimals. Existing jobs are
-- all 'pcs' and their integer values are unchanged.
--
-- Nothing is dropped. The summary view depends on the quantity columns, so
-- the old one is first emptied (same columns, no table reference), renamed
-- jobwork_order_summary_retired with all access revoked, and a new view is
-- created under the original name (same columns + qty_unit, quantities no
-- longer cast to int). add_jobwork_entry's quantity arguments change
-- int → numeric: the old signature is renamed add_jobwork_entry_int_retired
-- with execute revoked, and the new one takes the original name. Both
-- retired objects are inert and can be dropped later.
-- save_jobwork_order / set_jobwork_status keep their signatures.
create or replace view public.jobwork_order_summary with (security_invoker = true) as
select null::uuid as id, null::integer as jw_number, null::uuid as vendor_id, null::text as vendor_name, null::text as vendor_phone, null::text as job_type, null::text as sku, null::text as component, null::uuid as costing_product_id, null::integer as pieces, null::numeric as rate, null::date as job_date, null::date as expected_date, null::text as status, null::text as notes, null::text as close_reason, null::timestamp with time zone as created_at, null::timestamp with time zone as updated_at, null::integer as pcs_ok, null::integer as pcs_rejected, null::integer as pcs_rework, null::integer as pcs_remaining, null::integer as out_count, null::date as last_entry_date, null::numeric as bill, null::numeric as paid, null::numeric as due, null::date as last_pay_date where false;
alter view public.jobwork_order_summary rename to jobwork_order_summary_retired;
revoke all on public.jobwork_order_summary_retired from anon, authenticated, public;

alter table public.jobwork_orders
  add column qty_unit text not null default 'pcs' constraint chk_jobwork_qty_unit check (qty_unit in ('pcs', 'm'));
alter table public.jobwork_orders alter column pieces type numeric(12,2);
alter table public.jobwork_orders
  add constraint chk_jobwork_pieces_whole check (qty_unit = 'm' or pieces = trunc(pieces));
alter table public.jobwork_entries
  alter column pcs_ok type numeric(12,2),
  alter column pcs_rejected type numeric(12,2),
  alter column pcs_rework type numeric(12,2);

create view public.jobwork_order_summary with (security_invoker = true) as
select o.id, o.jw_number, o.vendor_id, o.vendor_name, o.vendor_phone, o.job_type, o.sku, o.component,
  o.costing_product_id, o.pieces, o.qty_unit, o.rate, o.job_date, o.expected_date, o.status, o.notes, o.close_reason,
  o.created_at, o.updated_at,
  coalesce(e.pcs_ok, 0) as pcs_ok,
  coalesce(e.pcs_rejected, 0) as pcs_rejected,
  coalesce(e.pcs_rework, 0) as pcs_rework,
  greatest(o.pieces - coalesce(e.pcs_ok, 0) - coalesce(e.pcs_rejected, 0) + coalesce(e.pcs_rework, 0), 0) as pcs_remaining,
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

revoke all on public.jobwork_order_summary from anon, public;
grant select on public.jobwork_order_summary to authenticated;

alter function public.add_jobwork_entry(uuid, text, date, int, int, int, text, jsonb) rename to add_jobwork_entry_int_retired;
revoke execute on function public.add_jobwork_entry_int_retired(uuid, text, date, int, int, int, text, jsonb) from anon, authenticated, public;

create function public.add_jobwork_entry(p_order_id uuid, p_kind text, p_date date,
  p_pcs_ok numeric, p_pcs_rejected numeric, p_pcs_rework numeric, p_note text, p_lines jsonb)
 returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  o jobwork_orders%rowtype; v_id uuid; v_l jsonb; v_qty numeric; v_mat uuid; v_name text;
  v_ok numeric := coalesce(p_pcs_ok, 0); v_rej numeric := coalesce(p_pcs_rejected, 0); v_rew numeric := coalesce(p_pcs_rework, 0);
  v_remaining numeric; v_rej_held numeric; v_sent numeric; v_back numeric; v_lines int := 0;
begin
  if coalesce(public.jw_role(), '') not in ('admin', 'manager', 'operator') then
    raise exception 'You do not have permission to change jobwork';
  end if;
  select * into o from jobwork_orders where id = p_order_id for update;
  if not found then raise exception 'Job not found'; end if;
  if o.status <> 'open' then raise exception 'This job is % — reopen it to make changes', o.status; end if;
  if p_kind not in ('out', 'in') then raise exception 'Unknown movement'; end if;
  if v_ok < 0 or v_rej < 0 or v_rew < 0 then raise exception 'Quantities cannot be negative'; end if;
  if o.qty_unit = 'pcs' and (v_ok <> trunc(v_ok) or v_rej <> trunc(v_rej) or v_rew <> trunc(v_rew)) then
    raise exception 'Pieces must be whole numbers';
  end if;
  if v_ok <> round(v_ok, 2) or v_rej <> round(v_rej, 2) or v_rew <> round(v_rew, 2) then
    raise exception 'Use at most 2 decimals';
  end if;
  if p_date is not null and p_date > jw_today() then raise exception 'The date cannot be in the future'; end if;

  select o.pieces - coalesce(sum(pcs_ok + pcs_rejected - pcs_rework), 0), coalesce(sum(pcs_rejected - pcs_rework), 0)
    into v_remaining, v_rej_held from jobwork_entries where order_id = p_order_id;
  if p_kind = 'in' and v_ok + v_rej > v_remaining then
    raise exception 'Only % % still with the jobworker', trim_scale(v_remaining), case when o.qty_unit = 'm' then 'm' else 'piece(s)' end;
  end if;
  if p_kind = 'out' and v_rew > v_rej_held then
    raise exception 'Only % rejected % can go back for rework', trim_scale(v_rej_held), case when o.qty_unit = 'm' then 'm' else 'piece(s)' end;
  end if;

  insert into jobwork_entries (order_id, kind, entry_date, pcs_ok, pcs_rejected, pcs_rework, note)
  values (p_order_id, p_kind, coalesce(p_date, jw_today()),
    case when p_kind = 'in' then v_ok else 0 end, case when p_kind = 'in' then v_rej else 0 end,
    case when p_kind = 'out' then v_rew else 0 end, nullif(btrim(p_note), ''))
  returning id into v_id;

  for v_l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := (v_l->>'qty')::numeric;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then raise exception 'Quantities cannot be negative'; end if;
    v_mat := (v_l->>'material_id')::uuid;
    select name into v_name from jobwork_materials where id = v_mat and order_id = p_order_id and not removed;
    if v_name is null then raise exception 'Material not found on this job'; end if;
    if p_kind = 'in' then
      select coalesce(sum(l.qty) filter (where e.kind = 'out'), 0), coalesce(sum(l.qty) filter (where e.kind = 'in'), 0)
        into v_sent, v_back from jobwork_entry_lines l join jobwork_entries e on e.id = l.entry_id where l.material_id = v_mat;
      if v_back + v_qty > v_sent then
        raise exception 'More % returned than was sent (sent %, already back %)', v_name, v_sent, v_back;
      end if;
    end if;
    insert into jobwork_entry_lines (entry_id, material_id, qty) values (v_id, v_mat, v_qty);
    v_lines := v_lines + 1;
  end loop;

  -- An empty OUT is the hand-over itself (a job with no materials to track),
  -- allowed once: the first send-out. Any other empty movement is a mistake.
  if v_lines = 0 and v_ok + v_rej + v_rew = 0 and not (p_kind = 'out' and not exists (
      select 1 from jobwork_entries where order_id = p_order_id and kind = 'out' and id <> v_id)) then
    raise exception 'Nothing to record — enter pieces or a material quantity';
  end if;
  perform audit_write('jobwork', case when p_kind = 'out' then 'SEND' else 'RECEIVE' end, p_order_id::text,
    'JW #' || o.jw_number || ' — ' || case when p_kind = 'out' then 'sent out' else 'received ' || trim_scale(v_ok) || ' OK, ' || trim_scale(v_rej) || ' rejected' end);
  return v_id;
end $$;

revoke execute on function public.add_jobwork_entry(uuid, text, date, numeric, numeric, numeric, text, jsonb) from anon, public;
grant execute on function public.add_jobwork_entry(uuid, text, date, numeric, numeric, numeric, text, jsonb) to authenticated;

create or replace function public.save_jobwork_order(p_id uuid, p_order jsonb, p_materials jsonb)
 returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := p_id; v_m jsonb; v_keep uuid[] := '{}'; v_mid uuid; v_i int := 0;
  v_pieces numeric := (p_order->>'pieces')::numeric; v_done numeric; v_name text;
  v_unit text := coalesce(nullif(p_order->>'qty_unit', ''), 'pcs');
begin
  if coalesce(public.jw_role(), '') not in ('admin', 'manager', 'operator') then
    raise exception 'You do not have permission to change jobwork';
  end if;
  if v_unit not in ('pcs', 'm') then raise exception 'Unit must be pieces or meters'; end if;
  if v_pieces is null or v_pieces <= 0 then
    raise exception '% must be above 0', case when v_unit = 'm' then 'Meters' else 'Pieces' end;
  end if;
  if v_unit = 'pcs' and v_pieces <> trunc(v_pieces) then raise exception 'Pieces must be a whole number'; end if;
  if v_pieces <> round(v_pieces, 2) then raise exception 'Use at most 2 decimals'; end if;
  if nullif(btrim(p_order->>'vendor_name'), '') is null then raise exception 'Pick the jobworker'; end if;
  if nullif(btrim(p_order->>'sku'), '') is null then raise exception 'Enter the SKU'; end if;
  if nullif(btrim(p_order->>'job_type'), '') is null then raise exception 'Pick the type of job'; end if;

  if v_id is null then
    insert into jobwork_orders (vendor_id, vendor_name, vendor_phone, job_type, sku, component, costing_product_id,
      pieces, qty_unit, rate, job_date, expected_date, notes)
    values ((p_order->>'vendor_id')::uuid, btrim(p_order->>'vendor_name'), nullif(btrim(p_order->>'vendor_phone'), ''),
      btrim(p_order->>'job_type'), upper(btrim(p_order->>'sku')), nullif(btrim(p_order->>'component'), ''),
      (p_order->>'costing_product_id')::uuid, v_pieces, v_unit, coalesce((p_order->>'rate')::numeric, 0),
      coalesce((p_order->>'job_date')::date, jw_today()), (p_order->>'expected_date')::date, nullif(btrim(p_order->>'notes'), ''))
    returning id into v_id;
  else
    select coalesce(sum(pcs_ok + pcs_rejected - pcs_rework), 0) into v_done from jobwork_entries where order_id = v_id;
    if v_pieces < v_done then raise exception 'The quantity cannot be below the % already received', trim_scale(v_done); end if;
    if v_unit = 'pcs' and exists (select 1 from jobwork_entries where order_id = v_id
        and (pcs_ok <> trunc(pcs_ok) or pcs_rejected <> trunc(pcs_rejected) or pcs_rework <> trunc(pcs_rework))) then
      raise exception 'This job already has part quantities — it must stay in meters';
    end if;
    update jobwork_orders set vendor_id = (p_order->>'vendor_id')::uuid, vendor_name = btrim(p_order->>'vendor_name'),
      vendor_phone = nullif(btrim(p_order->>'vendor_phone'), ''), job_type = btrim(p_order->>'job_type'),
      sku = upper(btrim(p_order->>'sku')), component = nullif(btrim(p_order->>'component'), ''),
      costing_product_id = (p_order->>'costing_product_id')::uuid, pieces = v_pieces, qty_unit = v_unit,
      rate = coalesce((p_order->>'rate')::numeric, 0), job_date = coalesce((p_order->>'job_date')::date, job_date),
      expected_date = (p_order->>'expected_date')::date, notes = nullif(btrim(p_order->>'notes'), '')
    where id = v_id;
    if not found then raise exception 'Job not found'; end if;
  end if;

  for v_m in select * from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) loop
    v_i := v_i + 1;
    if nullif(btrim(v_m->>'name'), '') is null or nullif(btrim(v_m->>'unit'), '') is null then
      raise exception 'Every material needs a name and a unit';
    end if;
    v_mid := nullif(v_m->>'id', '')::uuid;
    if v_mid is null then
      insert into jobwork_materials (order_id, name, unit, per_piece, sort_order)
      values (v_id, btrim(v_m->>'name'), btrim(v_m->>'unit'), (v_m->>'per_piece')::numeric, v_i) returning id into v_mid;
    else
      update jobwork_materials set name = btrim(v_m->>'name'), unit = btrim(v_m->>'unit'),
        per_piece = (v_m->>'per_piece')::numeric, sort_order = v_i, removed = false, updated_at = now()
      where id = v_mid and order_id = v_id;
      if not found then raise exception 'Material not found on this job'; end if;
    end if;
    v_keep := v_keep || v_mid;
  end loop;

  select m.name into v_name from jobwork_materials m
  where m.order_id = v_id and not m.removed and not (m.id = any (v_keep))
    and exists (select 1 from jobwork_entry_lines l where l.material_id = m.id) limit 1;
  if v_name is not null then raise exception '% already has movements — it cannot be removed', v_name; end if;
  update jobwork_materials set removed = true, updated_at = now()
  where order_id = v_id and not removed and not (id = any (v_keep));

  perform audit_write('jobwork', case when p_id is null then 'CREATE' else 'UPDATE' end, v_id::text,
    'JW #' || (select jw_number from jobwork_orders where id = v_id) || ' — ' || upper(btrim(p_order->>'sku')) || ' · ' || btrim(p_order->>'vendor_name'));
  return v_id;
end $$;

create or replace function public.set_jobwork_status(p_order_id uuid, p_status text, p_reason text)
 returns void language plpgsql security invoker set search_path = public
as $$
declare o jobwork_orders%rowtype; v_role text := coalesce(public.jw_role(), ''); v_left numeric;
begin
  select * into o from jobwork_orders where id = p_order_id for update;
  if not found then raise exception 'Job not found'; end if;
  if p_status = o.status then return; end if;
  if p_status = 'closed' then
    if v_role not in ('admin', 'manager', 'operator') then raise exception 'You do not have permission to change jobwork'; end if;
    select o.pieces - coalesce(sum(pcs_ok + pcs_rejected - pcs_rework), 0) into v_left from jobwork_entries where order_id = p_order_id;
    if v_left > 0 and nullif(btrim(p_reason), '') is null then
      raise exception 'Say why the job is closed with % % still pending', trim_scale(v_left), case when o.qty_unit = 'm' then 'm' else 'piece(s)' end;
    end if;
  elsif p_status = 'cancelled' then
    if v_role not in ('admin', 'manager') then raise exception 'Only an admin or manager can cancel a job'; end if;
    if exists (select 1 from jobwork_entries where order_id = p_order_id) or exists (select 1 from jobwork_payments where order_id = p_order_id) then
      raise exception 'This job already has movements or payments — close it instead of cancelling';
    end if;
  elsif p_status = 'open' then
    if v_role not in ('admin', 'manager') then raise exception 'Only an admin or manager can reopen a job'; end if;
  else
    raise exception 'Unknown status';
  end if;
  update jobwork_orders set status = p_status,
    close_reason = case when p_status = 'open' then null else nullif(btrim(p_reason), '') end,
    closed_at = case when p_status = 'open' then null else now() end,
    closed_by = case when p_status = 'open' then null else auth.uid() end
  where id = p_order_id;
  perform audit_write('jobwork', upper(p_status), p_order_id::text,
    'JW #' || o.jw_number || ' — ' || o.status || ' → ' || p_status || coalesce(' (' || nullif(btrim(p_reason), '') || ')', ''));
end $$;
