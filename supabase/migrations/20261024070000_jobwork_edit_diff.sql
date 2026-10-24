-- Jobwork: an edit's audit row says WHAT changed and by how much
-- (owner, 2026-10-24: "it does not show what was edited — I created this
-- job with 29 pcs, later it was edited to 30").
--
-- save_jobwork_order used to write "JW #44 — DRS177-L · Reena" for every
-- save. Now an edit snapshots the job and its materials first and writes
-- the differences: "Pieces 29 → 30 · Rate ₹0 → ₹50 · Expected back 24 Oct
-- → 28 Oct · + Lining 0.5 Meter · − Thread". The same list goes into
-- audit_log.changes as a JSON array. A save that changed nothing writes no
-- row (it was not an edit). Creating a job is unchanged.
-- jw_change: one "Label old → new" line, or null when the two are the same.

create or replace function public.jw_change(p_label text, p_old text, p_new text)
 returns text
 language sql
 immutable
as $function$
  select case when p_old is distinct from p_new then p_label || ' ' || coalesce(nullif(p_old, ''), '—') || ' → ' || coalesce(nullif(p_new, ''), '—') end;
$function$;

create or replace function public.save_jobwork_order(p_id uuid, p_order jsonb, p_materials jsonb)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_id uuid := p_id; v_m jsonb; v_keep uuid[] := '{}'; v_mid uuid; v_i int := 0;
  v_pieces numeric := (p_order->>'pieces')::numeric; v_done numeric; v_name text;
  v_unit text := coalesce(nullif(p_order->>'qty_unit', ''), 'pcs');
  v_old jobwork_orders%rowtype; v_new jobwork_orders%rowtype; v_r record;
  v_diff text[] := '{}'; v_gone text[]; v_qty_label text;
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
    -- The job as it was, for the audit row's "what changed".
    select * into v_old from jobwork_orders where id = v_id for update;
    if not found then raise exception 'Job not found'; end if;
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
  end if;

  -- Materials: what changed is collected as each one is kept, changed or added.
  for v_m in select * from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) loop
    v_i := v_i + 1;
    if nullif(btrim(v_m->>'name'), '') is null or nullif(btrim(v_m->>'unit'), '') is null then
      raise exception 'Every material needs a name and a unit';
    end if;
    v_mid := nullif(v_m->>'id', '')::uuid;
    if v_mid is null then
      insert into jobwork_materials (order_id, name, unit, per_piece, sort_order)
      values (v_id, btrim(v_m->>'name'), btrim(v_m->>'unit'), (v_m->>'per_piece')::numeric, v_i) returning id into v_mid;
      if p_id is not null then
        v_diff := v_diff || ('+ ' || btrim(v_m->>'name') || coalesce(' ' || trim_scale((v_m->>'per_piece')::numeric)::text || ' ' || btrim(v_m->>'unit') || '/pc', ''));
      end if;
    else
      select name, unit, per_piece, removed into v_r from jobwork_materials where id = v_mid and order_id = v_id;
      if not found then raise exception 'Material not found on this job'; end if;
      if v_r.removed then
        v_diff := v_diff || ('+ ' || btrim(v_m->>'name'));
      else
        v_diff := v_diff || array_remove(array[
          jw_change(btrim(v_m->>'name') || ' usage', trim_scale(coalesce(v_r.per_piece, 0))::text || ' ' || v_r.unit, trim_scale(coalesce((v_m->>'per_piece')::numeric, 0))::text || ' ' || btrim(v_m->>'unit')),
          case when v_r.name <> btrim(v_m->>'name') then 'Material ' || v_r.name || ' → ' || btrim(v_m->>'name') end
        ], null);
      end if;
      update jobwork_materials set name = btrim(v_m->>'name'), unit = btrim(v_m->>'unit'),
        per_piece = (v_m->>'per_piece')::numeric, sort_order = v_i, removed = false, updated_at = now()
      where id = v_mid and order_id = v_id;
    end if;
    v_keep := v_keep || v_mid;
  end loop;

  select m.name into v_name from jobwork_materials m
  where m.order_id = v_id and not m.removed and not (m.id = any (v_keep))
    and exists (select 1 from jobwork_entry_lines l where l.material_id = m.id) limit 1;
  if v_name is not null then raise exception '% already has movements — it cannot be removed', v_name; end if;
  select coalesce(array_agg('− ' || name order by sort_order), '{}') into v_gone from jobwork_materials
  where order_id = v_id and not removed and not (id = any (v_keep));
  v_diff := v_diff || v_gone;
  update jobwork_materials set removed = true, updated_at = now()
  where order_id = v_id and not removed and not (id = any (v_keep));

  if p_id is null then
    perform audit_write('jobwork', 'CREATE', v_id::text,
      'JW #' || (select jw_number from jobwork_orders where id = v_id) || ' — ' || upper(btrim(p_order->>'sku')) || ' · ' || btrim(p_order->>'vendor_name'));
    return v_id;
  end if;

  select * into v_new from jobwork_orders where id = v_id;
  v_qty_label := case when v_new.qty_unit = 'm' then 'Meters' else 'Pieces' end;
  v_diff := array_remove(array[
    jw_change('Jobworker', v_old.vendor_name, v_new.vendor_name),
    jw_change('Phone', v_old.vendor_phone, v_new.vendor_phone),
    jw_change('Type', v_old.job_type, v_new.job_type),
    jw_change('SKU', v_old.sku, v_new.sku),
    jw_change('Component', v_old.component, v_new.component),
    case when v_old.qty_unit <> v_new.qty_unit then 'Unit ' || v_old.qty_unit || ' → ' || v_new.qty_unit end,
    jw_change(v_qty_label, trim_scale(v_old.pieces)::text, trim_scale(v_new.pieces)::text),
    jw_change('Rate', '₹' || inr_text(v_old.rate), '₹' || inr_text(v_new.rate)),
    jw_change('Job date', to_char(v_old.job_date, 'DD Mon'), to_char(v_new.job_date, 'DD Mon')),
    jw_change('Expected back', to_char(v_old.expected_date, 'DD Mon'), to_char(v_new.expected_date, 'DD Mon')),
    case when v_old.notes is distinct from v_new.notes then 'Notes changed' end
  ], null) || v_diff;

  -- A save that changed nothing was not an edit.
  if cardinality(v_diff) > 0 then
    perform audit_write('jobwork', 'UPDATE', v_id::text, 'JW #' || v_new.jw_number || ' — ' || array_to_string(v_diff, ' · '), to_jsonb(v_diff));
  end if;
  return v_id;
end $function$;

revoke execute on function public.jw_change(text, text, text) from public, anon;
grant execute on function public.jw_change(text, text, text) to authenticated;
