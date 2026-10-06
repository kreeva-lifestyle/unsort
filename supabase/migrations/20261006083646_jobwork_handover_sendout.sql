-- Jobwork: let the first Send out record the hand-over on its own.
-- Why: a job with no materials (e.g. handwork on cut pieces) had nothing to
-- enter in Send out, so the RPC refused it and the job stayed "Not sent yet"
-- forever. The first OUT may now be empty — it records the day the work was
-- handed to the jobworker. Later empty movements are still refused.
-- Only the final "nothing to record" check changes; signature unchanged.
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

  -- An empty OUT is the hand-over itself (a job with no materials to track),
  -- allowed once: the first send-out. Any other empty movement is a mistake.
  if v_lines = 0 and v_ok + v_rej + v_rew = 0 and not (p_kind = 'out' and not exists (
      select 1 from jobwork_entries where order_id = p_order_id and kind = 'out' and id <> v_id)) then
    raise exception 'Nothing to record — enter pieces or a material quantity';
  end if;
  perform audit_write('jobwork', case when p_kind = 'out' then 'SEND' else 'RECEIVE' end, p_order_id::text,
    'JW #' || o.jw_number || ' — ' || case when p_kind = 'out' then 'sent out' else 'received ' || v_ok || ' OK, ' || v_rej || ' rejected' end);
  return v_id;
end $$;
