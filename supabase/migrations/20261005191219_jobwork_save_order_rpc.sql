-- Jobwork module, part 4: create or edit a job and its material list in one
-- transaction (SECURITY INVOKER — RLS still applies). Materials come with
-- their id when they already exist. A material taken off the job is marked
-- removed rather than deleted, so the record keeps its full history; one
-- that already has movements cannot be taken off at all. Pieces cannot drop
-- below what has already come back.
alter table public.jobwork_materials add column removed boolean not null default false;

create or replace function public.save_jobwork_order(p_id uuid, p_order jsonb, p_materials jsonb)
 returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := p_id; v_m jsonb; v_keep uuid[] := '{}'; v_mid uuid; v_i int := 0;
  v_pieces int := (p_order->>'pieces')::int; v_done int; v_name text;
begin
  if coalesce(public.jw_role(), '') not in ('admin', 'manager', 'operator') then
    raise exception 'You do not have permission to change jobwork';
  end if;
  if v_pieces is null or v_pieces <= 0 then raise exception 'Pieces must be a whole number above 0'; end if;
  if nullif(btrim(p_order->>'vendor_name'), '') is null then raise exception 'Pick the jobworker'; end if;
  if nullif(btrim(p_order->>'sku'), '') is null then raise exception 'Enter the SKU'; end if;
  if nullif(btrim(p_order->>'job_type'), '') is null then raise exception 'Pick the type of job'; end if;

  if v_id is null then
    insert into jobwork_orders (vendor_id, vendor_name, vendor_phone, job_type, sku, component, costing_product_id,
      pieces, rate, job_date, expected_date, notes)
    values ((p_order->>'vendor_id')::uuid, btrim(p_order->>'vendor_name'), nullif(btrim(p_order->>'vendor_phone'), ''),
      btrim(p_order->>'job_type'), upper(btrim(p_order->>'sku')), nullif(btrim(p_order->>'component'), ''),
      (p_order->>'costing_product_id')::uuid, v_pieces, coalesce((p_order->>'rate')::numeric, 0),
      coalesce((p_order->>'job_date')::date, jw_today()), (p_order->>'expected_date')::date, nullif(btrim(p_order->>'notes'), ''))
    returning id into v_id;
  else
    select coalesce(sum(pcs_ok + pcs_rejected - pcs_rework), 0) into v_done from jobwork_entries where order_id = v_id;
    if v_pieces < v_done then raise exception 'Pieces cannot be below the % already received', v_done; end if;
    update jobwork_orders set vendor_id = (p_order->>'vendor_id')::uuid, vendor_name = btrim(p_order->>'vendor_name'),
      vendor_phone = nullif(btrim(p_order->>'vendor_phone'), ''), job_type = btrim(p_order->>'job_type'),
      sku = upper(btrim(p_order->>'sku')), component = nullif(btrim(p_order->>'component'), ''),
      costing_product_id = (p_order->>'costing_product_id')::uuid, pieces = v_pieces,
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

revoke execute on function public.save_jobwork_order(uuid, jsonb, jsonb) from anon, public;
grant execute on function public.save_jobwork_order(uuid, jsonb, jsonb) to authenticated;
