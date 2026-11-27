-- Purchase orders: the owner's picks of 27 Nov 2026, database side (step 1 of 2).
--
-- WHY
-- 1. "Cancel PO — ask reason, save in database." 28 of 147 orders were
--    cancelled and none says why. purchase_orders.cancel_reason + cancel_po()
--    (reason compulsory). set_po_status('cancelled') keeps working until the
--    new app is live everywhere; step 2 (a later migration) retires it.
-- 2. "It is necessary to select the component": a fabric line now says what
--    the fabric is for (LEHENGA, BLOUSE, DUPATTA …, from the design's
--    INCLUDES). purchase_order_items.component, stored by create / update /
--    amend. Not compulsory on the server yet: an app that is still open on
--    the old version cannot send it. Step 2 makes it compulsory.
-- 3. "Compulsory number": an order can only be raised for a vendor who is in
--    Contacts (po_vendors) with a phone — 13 orders carry a typed name with
--    no phone, so reminders cannot open the vendor's chat. Enforced now: the
--    old app can already comply (pick from the list, or "+ Add new vendor").
--    Revising an older order is not blocked (its vendor stays as raised).
-- 4. "Save and approve at once": create_po_approved() raises and approves in
--    one transaction (95% of orders are approved by the person who raised
--    them, seconds later). Admin / manager only, as approval is today.
--
-- The three existing functions are patched in place (their bodies otherwise
-- unchanged); each patch refuses to run unless the text it replaces is found
-- exactly once, so a function that drifted is never half-patched.

alter table public.purchase_orders add column if not exists cancel_reason text;
comment on column public.purchase_orders.cancel_reason is
  'Why the order was cancelled (compulsory from cancel_po; NULL on orders cancelled before 27 Nov 2026).';

alter table public.purchase_order_items add column if not exists component text;
comment on column public.purchase_order_items.component is
  'What the fabric is for — the design''s component(s), e.g. LEHENGA or "LEHENGA, BLOUSE". Internal: not printed or shared with the vendor.';

-- The vendor rule, shared by create and update (a draft's vendor can change).
create or replace function public.po_check_vendor(p_po jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from po_vendors where id = nullif(p_po->>'vendor_id', '')::uuid) then
    raise exception 'This vendor is not in Contacts — pick the vendor from the list, or add the name with a phone number';
  end if;
  if length(regexp_replace(coalesce(p_po->>'vendor_phone', ''), '\D', '', 'g')) < 10 then
    raise exception 'This vendor has no phone number — add the number in Contacts, then pick the vendor again';
  end if;
end $$;

comment on function public.po_check_vendor(jsonb) is
  'PO create/update guard: the vendor must be a po_vendors row and the order must carry a 10-digit phone.';
revoke all on function public.po_check_vendor(jsonb) from public, anon;
grant execute on function public.po_check_vendor(jsonb) to authenticated, service_role;

-- Cancel with a reason. Same rules as set_po_status('cancelled'): not an
-- already cancelled or completed order, admin / manager only.
create or replace function public.cancel_po(p_po_id uuid, p_reason text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old text; v_num int;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
begin
  perform set_config('app.po_rpc', 'on', true);
  select status, po_number into v_old, v_num from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_old = 'cancelled' then raise exception 'This purchase order is already cancelled'; end if;
  if v_old = 'completed' then raise exception 'A completed purchase order cannot be cancelled'; end if;
  if coalesce((select role from profiles where id = auth.uid()), '') not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can cancel a purchase order';
  end if;
  if v_reason is null then raise exception 'Say why the order is being cancelled'; end if;
  update purchase_orders set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = v_reason,
    modified_by = auth.uid(), updated_at = now()
  where id = p_po_id;
  perform audit_write('purchase_order', 'CANCELLED', p_po_id::text, 'PO #' || v_num || ' cancelled — ' || v_reason);
  return jsonb_build_object('ok', true, 'status', 'cancelled');
end $$;

comment on function public.cancel_po(uuid, text) is
  'Cancel a purchase order with a compulsory reason (saved on the order and in the audit trail). SECURITY INVOKER; admin / manager.';
revoke all on function public.cancel_po(uuid, text) from public, anon;
grant execute on function public.cancel_po(uuid, text) to authenticated, service_role;

-- Raise and approve in one transaction: if the approval is refused, no draft is left behind.
create or replace function public.create_po_approved(p_po jsonb, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v jsonb;
begin
  if coalesce((select role from profiles where id = auth.uid()), '') not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can approve a purchase order';
  end if;
  v := create_po_with_items(p_po, p_items);
  perform set_po_status((v->>'id')::uuid, 'approved');
  return v || jsonb_build_object('status', 'approved');
end $$;

comment on function public.create_po_approved(jsonb, jsonb) is
  'create_po_with_items + set_po_status(approved) in one transaction ("Save and approve"). SECURITY INVOKER; admin / manager.';
revoke all on function public.create_po_approved(jsonb, jsonb) from public, anon;
grant execute on function public.create_po_approved(jsonb, jsonb) to authenticated, service_role;

do $do$
declare
  r record; def text;
begin
  for r in
    select * from (values
      -- create: the vendor rule, then the component on every line
      ('public.create_po_with_items(jsonb,jsonb)',
        $o$if coalesce(btrim(p_po->>'vendor_name'),'') = '' then raise exception 'Select a vendor first' using errcode='23514'; end if;$o$,
        $n$if coalesce(btrim(p_po->>'vendor_name'),'') = '' then raise exception 'Select a vendor first' using errcode='23514'; end if;
  perform po_check_vendor(p_po);$n$),
      ('public.create_po_with_items(jsonb,jsonb)',
        $o$insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order, buffer_qty)$o$,
        $n$insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order, buffer_qty, component)$n$),
      ('public.create_po_with_items(jsonb,jsonb)',
        $o$least(greatest(coalesce(nullif(v_item->>'buffer_qty','')::numeric, 0), 0), v_qty));$o$,
        $n$least(greatest(coalesce(nullif(v_item->>'buffer_qty','')::numeric, 0), 0), v_qty),
      nullif(left(upper(btrim(coalesce(v_item->>'component',''))), 120), ''));$n$),
      -- update (a draft): the same two
      ('public.update_po_with_items(uuid,jsonb,jsonb)',
        $o$if coalesce(v_vendor,'') = '' then raise exception 'Select a vendor first' using errcode='23514'; end if;$o$,
        $n$if coalesce(v_vendor,'') = '' then raise exception 'Select a vendor first' using errcode='23514'; end if;
  perform po_check_vendor(p_po);$n$),
      ('public.update_po_with_items(uuid,jsonb,jsonb)',
        $o$insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order, buffer_qty)$o$,
        $n$insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order, buffer_qty, component)$n$),
      ('public.update_po_with_items(uuid,jsonb,jsonb)',
        $o$least(greatest(coalesce(nullif(v_item->>'buffer_qty','')::numeric, 0), 0), v_qty));$o$,
        $n$least(greatest(coalesce(nullif(v_item->>'buffer_qty','')::numeric, 0), 0), v_qty),
      nullif(left(upper(btrim(coalesce(v_item->>'component',''))), 120), ''));$n$),
      -- amend (a revision): the component is kept, changed and logged like the fabric code
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$v_name text; v_code text; v_sku text; v_unit text; v_qty numeric; v_rate numeric; v_label text; v_new_label text;$o$,
        $n$v_name text; v_code text; v_sku text; v_unit text; v_comp text; v_qty numeric; v_rate numeric; v_label text; v_new_label text;$n$),
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');$o$,
        $n$v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');
    -- What the fabric is for (LEHENGA, DUPATTA …): kept in capitals, internal to us.
    v_comp := nullif(left(upper(btrim(coalesce(v_item->>'component', ''))), 120), '');$n$),
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order)$o$,
        $n$insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order, component)$n$),
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_sort)$o$,
        $n$case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_sort, v_comp)$n$),
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$if v_line.quantity is distinct from v_qty then$o$,
        $n$-- A save from an app that does not send the component leaves it as it is.
      if not (v_item ? 'component') then v_comp := v_line.component; end if;
      if v_line.component is distinct from v_comp then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'item', 'field', 'component', 'item_id', v_id, 'label', v_new_label, 'from', v_line.component, 'to', v_comp));
      end if;
      if v_line.quantity is distinct from v_qty then$n$),
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$if row(v_line.item_name, nullif(btrim(v_line.fabric_code), ''), v_line.sku, v_line.unit, v_line.quantity, v_line.rate)$o$,
        $n$if row(v_line.item_name, nullif(btrim(v_line.fabric_code), ''), v_line.sku, v_line.unit, v_line.quantity, v_line.rate, v_line.component)$n$),
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$is distinct from row(v_name, v_code, v_sku, v_unit, v_qty, v_rate) then$o$,
        $n$is distinct from row(v_name, v_code, v_sku, v_unit, v_qty, v_rate, v_comp) then$n$),
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$update purchase_order_items set item_name = v_name, fabric_code = v_code, sku = v_sku, unit = v_unit, quantity = v_qty, rate = v_rate,$o$,
        $n$update purchase_order_items set item_name = v_name, fabric_code = v_code, sku = v_sku, unit = v_unit, quantity = v_qty, rate = v_rate, component = v_comp,$n$)
    ) as t(fn, find, put)
  loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if (length(def) - length(replace(def, r.find, ''))) / length(r.find) <> 1 then
      raise exception '% does not contain "%" exactly once — not patched', r.fn, left(r.find, 60);
    end if;
    execute replace(def, r.find, r.put);
  end loop;
end $do$;
