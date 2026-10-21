-- Jobwork from a received fabric PO (owner's ask, 2026-10-21): "Start
-- jobwork" on a PO opens the new-job form with the SKU, the pieces and the
-- fabric lines filled in, and the fabric that arrived can go to the jobworker
-- with the job in the same step.
--
-- Why the shape:
-- * jobwork_orders.po_id / jobwork_materials.po_item_id: the explicit link
--   (one PO feeds several jobs, and a SKU alone cannot say which PO a job's
--   fabric came from — 11 of 21 matching jobs match several POs). Set null if
--   the PO or its line ever goes.
-- * start_jobwork_from_po: the job, its fabric materials, their PO link and
--   the first send-out of fabric are one transaction (CLAUDE.md: a write
--   across tables goes through one RPC). It reuses save_jobwork_order and
--   add_jobwork_entry, so every jobwork rule stays where it is, and refuses
--   to hand over more of a PO line than arrived minus what earlier jobs from
--   that line still hold. Serialised per PO with an advisory lock (locking the
--   PO row would need PO update rights a jobwork operator may not have).
-- * jobwork_order_summary gains po_id and po_number (appended, so the view
--   is replaced in place and keeps its grants and security_invoker).
-- Applied live as jobwork_from_po + jobwork_from_po_handover_date (the
-- hand-over is dated on the job's date, today when none was picked).

alter table public.jobwork_orders add column po_id uuid references public.purchase_orders(id) on delete set null;
create index jobwork_orders_po_idx on public.jobwork_orders (po_id) where po_id is not null;
alter table public.jobwork_materials add column po_item_id uuid references public.purchase_order_items(id) on delete set null;
create index jobwork_materials_po_item_idx on public.jobwork_materials (po_item_id) where po_item_id is not null;

create or replace view public.jobwork_order_summary with (security_invoker = true) as
 SELECT o.id,
    o.jw_number,
    o.vendor_id,
    o.vendor_name,
    o.vendor_phone,
    o.job_type,
    o.sku,
    o.component,
    o.costing_product_id,
    o.pieces,
    o.qty_unit,
    o.rate,
    o.job_date,
    o.expected_date,
    o.status,
    o.notes,
    o.close_reason,
    o.created_at,
    o.updated_at,
    COALESCE(e.pcs_ok, 0::numeric) AS pcs_ok,
    COALESCE(e.pcs_rejected, 0::numeric) AS pcs_rejected,
    COALESCE(e.pcs_rework, 0::numeric) AS pcs_rework,
    GREATEST(o.pieces - COALESCE(e.pcs_ok, 0::numeric) - COALESCE(e.pcs_rejected, 0::numeric) + COALESCE(e.pcs_rework, 0::numeric), 0::numeric) AS pcs_remaining,
    COALESCE(e.outs, 0::bigint)::integer AS out_count,
    e.last_entry_date,
    round(COALESCE(e.pcs_ok, 0::numeric) * o.rate, 2) AS bill,
    COALESCE(p.paid, 0::numeric) AS paid,
    round(COALESCE(e.pcs_ok, 0::numeric) * o.rate - COALESCE(p.paid, 0::numeric), 2) AS due,
    p.last_pay_date,
    o.po_id,
    po.po_number
   FROM jobwork_orders o
     LEFT JOIN LATERAL ( SELECT sum(jobwork_entries.pcs_ok) AS pcs_ok,
            sum(jobwork_entries.pcs_rejected) AS pcs_rejected,
            sum(jobwork_entries.pcs_rework) AS pcs_rework,
            count(*) FILTER (WHERE jobwork_entries.kind = 'out'::text) AS outs,
            max(jobwork_entries.entry_date) AS last_entry_date
           FROM jobwork_entries
          WHERE jobwork_entries.order_id = o.id) e ON true
     LEFT JOIN LATERAL ( SELECT sum(jobwork_payments.amount) AS paid,
            max(jobwork_payments.pay_date) AS last_pay_date
           FROM jobwork_payments
          WHERE jobwork_payments.order_id = o.id) p ON true
     LEFT JOIN purchase_orders po ON po.id = o.po_id;

-- What jobs started from a PO line still hold of its fabric (sent out minus returned).
create or replace function public.po_item_carried(p_po_item_id uuid)
 returns numeric
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(sum(case when e.kind = 'out' then l.qty else -l.qty end), 0)
  from jobwork_materials m
  join jobwork_entry_lines l on l.material_id = m.id
  join jobwork_entries e on e.id = l.entry_id
  where m.po_item_id = p_po_item_id;
$function$;

create or replace function public.start_jobwork_from_po(p_po_id uuid, p_order jsonb, p_materials jsonb, p_handover boolean)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_po purchase_orders%rowtype; v_m jsonb; v_i int := 0; v_item purchase_order_items%rowtype; v_send numeric; v_left numeric;
  v_id uuid; v_lines jsonb := '[]'::jsonb; v_given numeric := 0; v_jw int; v_label text;
begin
  if coalesce(public.jw_role(), '') not in ('admin', 'manager', 'operator') then
    raise exception 'You do not have permission to change jobwork';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('jw_po:' || p_po_id::text, 0));
  select * into v_po from purchase_orders where id = p_po_id;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_po.po_type <> 'fabric' then raise exception 'Only a fabric purchase order can start a jobwork'; end if;
  if v_po.status not in ('partially_received', 'completed', 'closed') then
    raise exception 'PO #% has no fabric received yet', v_po.po_number;
  end if;
  -- Every fabric line must belong to this PO; a hand-over never exceeds what arrived minus what earlier jobs hold.
  for v_m in select value from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) loop
    continue when nullif(v_m->>'po_item_id', '') is null;
    select * into v_item from purchase_order_items where id = (v_m->>'po_item_id')::uuid and po_id = p_po_id;
    if not found then raise exception 'That fabric is not part of PO #%', v_po.po_number; end if;
    v_send := coalesce(nullif(v_m->>'send_qty', '')::numeric, 0);
    if v_send < 0 then raise exception 'Quantities cannot be negative'; end if;
    if p_handover and v_send > 0 then
      v_left := v_item.received_qty - po_item_carried(v_item.id);
      if v_send > v_left + 0.0001 then
        v_label := v_item.item_name || coalesce(' · ' || nullif(btrim(v_item.fabric_code), ''), '');
        raise exception 'Only % of % is left from PO #%', trim_scale(greatest(v_left, 0)), v_label, v_po.po_number;
      end if;
    end if;
  end loop;

  v_id := save_jobwork_order(null, p_order, p_materials);
  update jobwork_orders set po_id = p_po_id where id = v_id;
  -- save_jobwork_order numbers the materials 1, 2, 3 … in the order given.
  update jobwork_materials m set po_item_id = nullif(p_materials->(m.sort_order - 1)->>'po_item_id', '')::uuid
  where m.order_id = v_id;

  if p_handover then
    for v_m in select value from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) loop
      v_i := v_i + 1;
      v_send := coalesce(nullif(v_m->>'send_qty', '')::numeric, 0);
      continue when v_send <= 0;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('material_id', (select id from jobwork_materials where order_id = v_id and sort_order = v_i), 'qty', v_send));
      v_given := v_given + v_send;
    end loop;
    if jsonb_array_length(v_lines) > 0 then
      -- Handed over on the job's date (today when none was picked).
      perform add_jobwork_entry(v_id, 'out', nullif(p_order->>'job_date', '')::date, 0, 0, 0, 'Fabric from PO #' || v_po.po_number, v_lines);
    end if;
  end if;

  select jw_number into v_jw from jobwork_orders where id = v_id;
  perform audit_write('purchase_order', 'JOBWORK', p_po_id::text,
    'PO #' || v_po.po_number || ' — JW #' || v_jw || ' started' || case when v_given > 0 then ' (' || inr_text(v_given) || ' given with it)' else '' end);
  return v_id;
end $function$;

revoke execute on function public.po_item_carried(uuid) from public, anon;
revoke execute on function public.start_jobwork_from_po(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.po_item_carried(uuid) to authenticated;
grant execute on function public.start_jobwork_from_po(uuid, jsonb, jsonb, boolean) to authenticated;
