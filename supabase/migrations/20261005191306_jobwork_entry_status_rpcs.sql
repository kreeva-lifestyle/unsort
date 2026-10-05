-- Jobwork module, part 5: movements and status (SECURITY INVOKER).
-- One movement. OUT: material sent and/or rejected pieces sent back for
-- rework. IN: pieces OK / rejected and/or leftover material returned.
-- The job row is locked so concurrent receipts cannot over-count.
create or replace function public.add_jobwork_entry(p_order_id uuid, p_kind text, p_date date,
  p_pcs_ok int, p_pcs_rejected int, p_pcs_rework int, p_note text, p_lines jsonb)
 returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  o jobwork_orders%rowtype; v_id uuid; v_l jsonb; v_qty numeric; v_mat uuid; v_name text;
  v_ok int := coalesce(p_pcs_ok, 0); v_rej int := coalesce(p_pcs_rejected, 0); v_rew int := coalesce(p_pcs_rework, 0);
  v_remaining int; v_rej_held int; v_sent numeric; v_back numeric; v_lines int := 0;
begin
  if coalesce(public.jw_role(), '') not in ('admin', 'manager', 'operator') then
    raise exception 'You do not have permission to change jobwork';
  end if;
  select * into o from jobwork_orders where id = p_order_id for update;
  if not found then raise exception 'Job not found'; end if;
  if o.status <> 'open' then raise exception 'This job is % — reopen it to make changes', o.status; end if;
  if p_kind not in ('out', 'in') then raise exception 'Unknown movement'; end if;
  if v_ok < 0 or v_rej < 0 or v_rew < 0 then raise exception 'Pieces cannot be negative'; end if;
  if p_date is not null and p_date > jw_today() then raise exception 'The date cannot be in the future'; end if;

  select o.pieces - coalesce(sum(pcs_ok + pcs_rejected - pcs_rework), 0), coalesce(sum(pcs_rejected - pcs_rework), 0)
    into v_remaining, v_rej_held from jobwork_entries where order_id = p_order_id;
  if p_kind = 'in' and v_ok + v_rej > v_remaining then
    raise exception 'Only % piece(s) are still with the jobworker', v_remaining;
  end if;
  if p_kind = 'out' and v_rew > v_rej_held then
    raise exception 'Only % rejected piece(s) can go back for rework', v_rej_held;
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

  if v_lines = 0 and v_ok + v_rej + v_rew = 0 then
    raise exception 'Nothing to record — enter pieces or a material quantity';
  end if;
  perform audit_write('jobwork', case when p_kind = 'out' then 'SEND' else 'RECEIVE' end, p_order_id::text,
    'JW #' || o.jw_number || ' — ' || case when p_kind = 'out' then 'sent out' else 'received ' || v_ok || ' OK, ' || v_rej || ' rejected' end);
  return v_id;
end $$;

-- open → closed (anyone who can edit; a reason when pieces are pending),
-- open → cancelled (admin/manager, nothing moved or paid yet),
-- closed/cancelled → open (admin/manager).
create or replace function public.set_jobwork_status(p_order_id uuid, p_status text, p_reason text)
 returns void language plpgsql security invoker set search_path = public
as $$
declare o jobwork_orders%rowtype; v_role text := coalesce(public.jw_role(), ''); v_left int;
begin
  select * into o from jobwork_orders where id = p_order_id for update;
  if not found then raise exception 'Job not found'; end if;
  if p_status = o.status then return; end if;
  if p_status = 'closed' then
    if v_role not in ('admin', 'manager', 'operator') then raise exception 'You do not have permission to change jobwork'; end if;
    select o.pieces - coalesce(sum(pcs_ok + pcs_rejected - pcs_rework), 0) into v_left from jobwork_entries where order_id = p_order_id;
    if v_left > 0 and nullif(btrim(p_reason), '') is null then
      raise exception 'Say why the job is closed with % piece(s) still pending', v_left;
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

revoke execute on function public.add_jobwork_entry(uuid, text, date, int, int, int, text, jsonb) from anon, public;
revoke execute on function public.set_jobwork_status(uuid, text, text) from anon, public;
grant execute on function public.add_jobwork_entry(uuid, text, date, int, int, int, text, jsonb) to authenticated;
grant execute on function public.set_jobwork_status(uuid, text, text) to authenticated;
