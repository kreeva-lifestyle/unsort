-- Purchase orders: the RPCs behind "Revise PO" and "Cancel line"
-- (owner's ask, 2026-10-21; schema in 20261021193000).
--
-- * amend_po — revise an approved / sent / part-received order. Lines are
--   updated IN PLACE by id (update_po_with_items deletes and re-inserts every
--   line, which would cascade away the receipts), new lines are added, a line
--   left out is cancelled (only when nothing arrived on it). Quantity never
--   drops below what was received. Vendor, type and PO date stay as raised.
--   Only a real change bumps the revision and writes history.
-- * cancel_po_line — cancel one line's balance: quantity drops to what was
--   received, the rest moves to cancelled_qty. At least one live line must
--   stay (the last one is Cancel PO / Close remaining).
-- * set_po_revision_notified — the vendor was sent (or already told) the
--   revision, so the detail stops asking.
-- * po_recompute_totals / po_settle_status — the money and the status after a
--   line change, in one place for both RPCs.
-- * receive_po_items refuses a cancelled line; a trigger keeps a cancelled
--   line fully settled when one of its receipts is undone.
-- * protect_po_immutability: the new revision columns join the "only through
--   the app's actions" comparison, so a notes-only edit cannot touch them.
-- Every role check uses coalesce(role, '') — a caller with no profile row
-- would otherwise slip through `not in (...)` as NULL.
-- Applied live in five parts (the whole file timed out on the MCP):
-- po_amend_helpers_and_guard, po_amend_rpc, po_cancel_line_and_notify_rpcs,
-- po_receive_refuses_cancelled_line, po_cancelled_line_stays_settled.

create or replace function public.protect_po_immutability()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_same_but_link boolean;
begin
  if current_setting('app.po_rpc', true) = 'on' then
    return new;
  end if;
  v_same_but_link := old.costing_product_id is not null and new.costing_product_id is null
     and row(new.id,new.po_number,new.vendor_id,new.vendor_name,new.vendor_phone,new.po_type,new.status,new.po_date,new.expected_date,new.payment_terms,new.notes,new.for_pieces,new.lump_sum,new.subtotal,new.discount_type,new.discount_value,new.discount_amount,new.tax_percent,new.tax_amount,new.other_charges,new.round_off,new.grand_total,new.approved_by,new.approved_at,new.cancelled_by,new.cancelled_at,new.closed_by,new.closed_at,new.close_reason,new.created_by,new.created_at,new.revision,new.revised_at,new.revised_by)
       is not distinct from
         row(old.id,old.po_number,old.vendor_id,old.vendor_name,old.vendor_phone,old.po_type,old.status,old.po_date,old.expected_date,old.payment_terms,old.notes,old.for_pieces,old.lump_sum,old.subtotal,old.discount_type,old.discount_value,old.discount_amount,old.tax_percent,old.tax_amount,old.other_charges,old.round_off,old.grand_total,old.approved_by,old.approved_at,old.cancelled_by,old.cancelled_at,old.closed_by,old.closed_at,old.close_reason,old.created_by,old.created_at,old.revision,old.revised_at,old.revised_by);
  if v_same_but_link then
    return new;
  end if;
  if old.status = 'cancelled' then
    raise exception 'Cancelled purchase orders cannot be modified — this is a permanent record.';
  end if;
  if (new.notes is distinct from old.notes)
     and row(new.id,new.po_number,new.vendor_id,new.vendor_name,new.vendor_phone,new.po_type,new.status,new.po_date,new.expected_date,new.payment_terms,new.for_pieces,new.lump_sum,new.costing_product_id,new.subtotal,new.discount_type,new.discount_value,new.discount_amount,new.tax_percent,new.tax_amount,new.other_charges,new.round_off,new.grand_total,new.approved_by,new.approved_at,new.cancelled_by,new.cancelled_at,new.closed_by,new.closed_at,new.close_reason,new.created_by,new.created_at,new.revision,new.revised_at,new.revised_by)
       is not distinct from
         row(old.id,old.po_number,old.vendor_id,old.vendor_name,old.vendor_phone,old.po_type,old.status,old.po_date,old.expected_date,old.payment_terms,old.for_pieces,old.lump_sum,old.costing_product_id,old.subtotal,old.discount_type,old.discount_value,old.discount_amount,old.tax_percent,old.tax_amount,old.other_charges,old.round_off,old.grand_total,old.approved_by,old.approved_at,old.cancelled_by,old.cancelled_at,old.closed_by,old.closed_at,old.close_reason,old.created_by,old.created_at,old.revision,old.revised_at,old.revised_by)
  then
    return new;
  end if;
  raise exception 'Purchase orders change only through the app''s actions' using errcode = '42501';
end $function$;

-- The header money from the lines as they stand (same formula as create).
create or replace function public.po_recompute_totals(p_po_id uuid)
 returns numeric
 language plpgsql
 set search_path to 'public'
as $function$
declare h purchase_orders%rowtype; v_sub numeric; v_disc numeric; v_after numeric; v_tax numeric; v_grand numeric;
begin
  select * into h from purchase_orders where id = p_po_id;
  select coalesce(sum(round(coalesce(rate, 0) * quantity, 2)), 0) into v_sub from purchase_order_items where po_id = p_po_id;
  v_disc := case when h.discount_type = 'percentage' then round(v_sub * coalesce(h.discount_value, 0) / 100, 2)
                 else least(greatest(coalesce(h.discount_value, 0), 0), v_sub) end;
  v_after := v_sub - v_disc;
  v_tax := round(v_after * coalesce(h.tax_percent, 0) / 100, 2);
  v_grand := round(v_after + v_tax + coalesce(h.other_charges, 0) + coalesce(h.round_off, 0), 2);
  update purchase_orders set subtotal = v_sub, discount_amount = v_disc, tax_amount = v_tax, grand_total = v_grand where id = p_po_id;
  return v_grand;
end $function$;

-- An open order's status after its lines changed: everything in → completed,
-- something in → part received, nothing in → where it stood (approved / sent).
create or replace function public.po_settle_status(p_po_id uuid)
 returns text
 language plpgsql
 set search_path to 'public'
as $function$
declare v_cur text; v_total int; v_full int; v_any numeric; v_new text;
begin
  select status into v_cur from purchase_orders where id = p_po_id;
  if v_cur not in ('approved', 'sent', 'partially_received', 'completed') then return v_cur; end if;
  select count(*), count(*) filter (where received_qty >= quantity - 0.0001), coalesce(sum(received_qty), 0)
    into v_total, v_full, v_any from purchase_order_items where po_id = p_po_id;
  v_new := case when v_any > 0 and v_full = v_total then 'completed'
                when v_any > 0 then 'partially_received'
                when v_cur in ('approved', 'sent') then v_cur
                when exists (select 1 from audit_log a where a.module = 'purchase_order' and a.record_id = p_po_id::text and a.action = 'SENT') then 'sent'
                else 'approved' end;
  if v_new <> v_cur then update purchase_orders set status = v_new where id = p_po_id; end if;
  return v_new;
end $function$;

create or replace function public.amend_po(p_po_id uuid, p_po jsonb, p_items jsonb, p_reason text default null)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_old purchase_orders%rowtype; v_line purchase_order_items%rowtype; v_item jsonb;
  v_changes jsonb := '[]'::jsonb; v_keep uuid[] := '{}'; v_id uuid; v_sort int;
  v_name text; v_code text; v_sku text; v_unit text; v_qty numeric; v_rate numeric; v_label text; v_new_label text;
  v_fabric boolean; v_pieces int; v_lump boolean; v_exp date; v_notes text; v_terms text;
  v_disc_type text; v_disc_val numeric; v_tax numeric; v_other numeric;
  v_grand numeric; v_rev int; v_status text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_field jsonb := '{}'::jsonb; v_k text;
begin
  perform set_config('app.po_rpc', 'on', true);
  select * into v_old from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if coalesce((select role from profiles where id = auth.uid()), '') not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can revise a purchase order';
  end if;
  if v_old.status = 'draft' then raise exception 'A draft is edited, not revised — use Edit'; end if;
  if v_old.status not in ('approved', 'sent', 'partially_received') then
    raise exception 'Only an open purchase order can be revised (it is %)', replace(v_old.status, '_', ' ');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase order needs at least one item';
  end if;

  v_fabric := v_old.po_type = 'fabric';
  v_lump := coalesce((p_po->>'lump_sum')::boolean, false);
  v_pieces := nullif(p_po->>'for_pieces', '')::int;
  if v_lump then v_pieces := null;
  elsif v_pieces is null or v_pieces <= 0 then raise exception 'For how many pcs is required — a whole number above 0'; end if;
  v_exp := nullif(p_po->>'expected_date', '')::date;
  v_notes := nullif(btrim(coalesce(p_po->>'notes', '')), '');
  v_terms := nullif(btrim(coalesce(p_po->>'payment_terms', '')), '');
  v_disc_type := nullif(p_po->>'discount_type', '');
  v_disc_val := coalesce((p_po->>'discount_value')::numeric, 0);
  v_tax := coalesce((p_po->>'tax_percent')::numeric, 0);
  v_other := coalesce((p_po->>'other_charges')::numeric, 0);
  perform po_check_money(p_po || jsonb_build_object('po_type', v_old.po_type), p_items);

  select coalesce(max(sort_order), -1) into v_sort from purchase_order_items where po_id = p_po_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := btrim(coalesce(v_item->>'item_name', ''));
    v_code := nullif(btrim(coalesce(v_item->>'fabric_code', '')), '');
    v_sku := nullif(btrim(coalesce(v_item->>'sku', '')), '');
    v_unit := nullif(btrim(coalesce(v_item->>'unit', '')), '');
    v_qty := (v_item->>'quantity')::numeric;
    v_rate := nullif(v_item->>'rate', '')::numeric;
    if v_name = '' then raise exception 'Every item needs a name'; end if;
    if v_fabric and v_code is null then raise exception 'Every fabric item needs a fabric code'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'Every item needs a quantity greater than 0'; end if;
    v_new_label := v_name || coalesce(' · ' || v_code, '');
    v_id := nullif(v_item->>'id', '')::uuid;
    if v_id is null then
      v_sort := v_sort + 1;
      insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order)
      values (p_po_id, v_name, v_sku, v_code, v_qty, v_unit, v_rate,
        case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_sort)
      returning id into v_id;
      v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'added', 'item_id', v_id, 'label', v_new_label, 'unit', v_unit, 'to', v_qty));
    else
      if v_id = any (v_keep) then raise exception 'The same item is listed twice'; end if;
      select * into v_line from purchase_order_items where id = v_id and po_id = p_po_id for update;
      if not found then raise exception 'That item is not part of this purchase order'; end if;
      v_label := v_line.item_name || coalesce(' · ' || nullif(btrim(v_line.fabric_code), ''), '');
      if v_line.cancelled_at is not null then raise exception '% was cancelled — it cannot be changed', v_label; end if;
      if v_qty < v_line.received_qty - 0.0001 then
        raise exception '%: cannot go below the % already received', v_label, trim_scale(v_line.received_qty);
      end if;
      if v_line.item_name is distinct from v_name then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'item', 'field', 'item_name', 'item_id', v_id, 'label', v_new_label, 'from', v_line.item_name, 'to', v_name));
      end if;
      if nullif(btrim(v_line.fabric_code), '') is distinct from v_code then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'item', 'field', 'fabric_code', 'item_id', v_id, 'label', v_new_label, 'from', v_line.fabric_code, 'to', v_code));
      end if;
      if v_line.sku is distinct from v_sku then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'item', 'field', 'sku', 'item_id', v_id, 'label', v_new_label, 'from', v_line.sku, 'to', v_sku));
      end if;
      if v_line.unit is distinct from v_unit then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'item', 'field', 'unit', 'item_id', v_id, 'label', v_new_label, 'from', v_line.unit, 'to', v_unit));
      end if;
      if v_line.quantity is distinct from v_qty then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'qty', 'item_id', v_id, 'label', v_new_label, 'unit', v_unit, 'from', v_line.quantity, 'to', v_qty, 'received', v_line.received_qty));
      end if;
      if v_line.rate is distinct from v_rate then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'rate', 'item_id', v_id, 'label', v_new_label, 'from', v_line.rate, 'to', v_rate));
      end if;
      if row(v_line.item_name, nullif(btrim(v_line.fabric_code), ''), v_line.sku, v_line.unit, v_line.quantity, v_line.rate)
         is distinct from row(v_name, v_code, v_sku, v_unit, v_qty, v_rate) then
        update purchase_order_items set item_name = v_name, fabric_code = v_code, sku = v_sku, unit = v_unit, quantity = v_qty, rate = v_rate,
          amount = case when v_rate is null then null else round(v_rate * v_qty, 2) end
        where id = v_id;
      end if;
    end if;
    v_keep := v_keep || v_id;
  end loop;

  -- A live line left out of the revision is cancelled — only when nothing arrived on it.
  for v_line in select * from purchase_order_items where po_id = p_po_id and cancelled_at is null and not (id = any (v_keep)) for update loop
    v_label := v_line.item_name || coalesce(' · ' || nullif(btrim(v_line.fabric_code), ''), '');
    if v_line.received_qty > 0 then
      raise exception '% has goods received — cancel its balance from the order', v_label;
    end if;
    update purchase_order_items set cancelled_qty = quantity, quantity = 0, amount = case when rate is null then null else 0 end,
      cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = coalesce(v_reason, 'Removed in a revision')
    where id = v_line.id;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'cancelled', 'item_id', v_line.id, 'label', v_label, 'unit', v_line.unit, 'from', v_line.quantity, 'received', 0));
  end loop;

  -- Header fields (vendor, type and PO date stay as raised).
  if v_old.expected_date is distinct from v_exp then v_field := v_field || jsonb_build_object('expected_date', jsonb_build_array(v_old.expected_date, v_exp)); end if;
  if nullif(btrim(coalesce(v_old.notes, '')), '') is distinct from v_notes then v_field := v_field || jsonb_build_object('notes', jsonb_build_array(v_old.notes, v_notes)); end if;
  if nullif(btrim(coalesce(v_old.payment_terms, '')), '') is distinct from v_terms then v_field := v_field || jsonb_build_object('payment_terms', jsonb_build_array(v_old.payment_terms, v_terms)); end if;
  if v_old.for_pieces is distinct from v_pieces then v_field := v_field || jsonb_build_object('for_pieces', jsonb_build_array(v_old.for_pieces, v_pieces)); end if;
  if v_old.lump_sum is distinct from v_lump then v_field := v_field || jsonb_build_object('lump_sum', jsonb_build_array(v_old.lump_sum, v_lump)); end if;
  -- A type on a zero discount means nothing (old rows carry 'flat' with 0).
  if coalesce(v_old.discount_value, 0) <> v_disc_val
     or (v_disc_val > 0 and coalesce(v_old.discount_type, 'flat') is distinct from coalesce(v_disc_type, 'flat')) then
    v_field := v_field || jsonb_build_object('discount', jsonb_build_array(
      case when coalesce(v_old.discount_value, 0) > 0 then jsonb_build_object('type', v_old.discount_type, 'value', v_old.discount_value) end,
      case when v_disc_val > 0 then jsonb_build_object('type', v_disc_type, 'value', v_disc_val) end));
  end if;
  if coalesce(v_old.tax_percent, 0) <> v_tax then v_field := v_field || jsonb_build_object('tax_percent', jsonb_build_array(v_old.tax_percent, v_tax)); end if;
  if coalesce(v_old.other_charges, 0) <> v_other then v_field := v_field || jsonb_build_object('other_charges', jsonb_build_array(v_old.other_charges, v_other)); end if;
  for v_k in select jsonb_object_keys(v_field) loop
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'field', 'field', v_k, 'from', v_field->v_k->0, 'to', v_field->v_k->1));
  end loop;

  if jsonb_array_length(v_changes) = 0 then
    return jsonb_build_object('changed', false, 'revision', v_old.revision, 'status', v_old.status, 'changes', v_changes);
  end if;

  if v_field <> '{}'::jsonb then
    update purchase_orders set expected_date = v_exp, notes = v_notes, payment_terms = v_terms, for_pieces = v_pieces, lump_sum = v_lump,
      discount_type = case when v_disc_val > 0 then v_disc_type end, discount_value = v_disc_val, tax_percent = v_tax, other_charges = v_other
    where id = p_po_id;
  end if;
  v_grand := po_recompute_totals(p_po_id);
  if coalesce(v_old.grand_total, 0) <> v_grand then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', 'total', 'from', coalesce(v_old.grand_total, 0), 'to', v_grand));
  end if;
  v_status := po_settle_status(p_po_id);
  v_rev := v_old.revision + 1;
  update purchase_orders set revision = v_rev, revised_at = now(), revised_by = auth.uid(), modified_by = auth.uid(), updated_at = now()
  where id = p_po_id;
  insert into purchase_order_revisions (po_id, revision, kind, changes, reason) values (p_po_id, v_rev, 'amend', v_changes, v_reason);
  perform audit_write('purchase_order', 'REVISED', p_po_id::text,
    'PO #' || v_old.po_number || ' revised to Rev ' || v_rev || coalesce(' — ' || v_reason, ''));
  return jsonb_build_object('changed', true, 'revision', v_rev, 'status', v_status, 'changes', v_changes);
end $function$;

create or replace function public.cancel_po_line(p_item_id uuid, p_reason text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_po_id uuid; v_po purchase_orders%rowtype; v_line purchase_order_items%rowtype;
  v_reason text := btrim(coalesce(p_reason, '')); v_pending numeric; v_label text; v_changes jsonb; v_rev int; v_status text;
begin
  perform set_config('app.po_rpc', 'on', true);
  select po_id into v_po_id from purchase_order_items where id = p_item_id;
  if v_po_id is null then raise exception 'That item no longer exists'; end if;
  select * into v_po from purchase_orders where id = v_po_id for update;
  if coalesce((select role from profiles where id = auth.uid()), '') not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can cancel an item';
  end if;
  if v_po.status not in ('approved', 'sent', 'partially_received') then
    raise exception 'Only an open purchase order can have an item cancelled (it is %)', replace(v_po.status, '_', ' ');
  end if;
  if v_reason = '' then raise exception 'Say why this item is being cancelled'; end if;
  select * into v_line from purchase_order_items where id = p_item_id for update;
  v_label := v_line.item_name || coalesce(' · ' || nullif(btrim(v_line.fabric_code), ''), '');
  if v_line.cancelled_at is not null then raise exception '% is already cancelled', v_label; end if;
  v_pending := v_line.quantity - v_line.received_qty;
  if v_pending <= 0.0001 then raise exception 'All of % has arrived — nothing left to cancel', v_label; end if;
  if not exists (select 1 from purchase_order_items where po_id = v_po_id and id <> p_item_id and cancelled_at is null) then
    raise exception 'This is the last item on PO #% — use Cancel PO or Close remaining', v_po.po_number;
  end if;
  update purchase_order_items set cancelled_qty = v_pending, quantity = received_qty,
    amount = case when rate is null then null else round(rate * received_qty, 2) end,
    cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_reason
  where id = p_item_id;
  perform po_recompute_totals(v_po_id);
  v_status := po_settle_status(v_po_id);
  v_changes := jsonb_build_array(jsonb_build_object('kind', 'cancelled', 'item_id', p_item_id, 'label', v_label, 'unit', v_line.unit,
    'from', v_pending, 'received', v_line.received_qty));
  v_rev := v_po.revision + 1;
  update purchase_orders set revision = v_rev, revised_at = now(), revised_by = auth.uid(), modified_by = auth.uid(), updated_at = now()
  where id = v_po_id;
  insert into purchase_order_revisions (po_id, revision, kind, changes, reason) values (v_po_id, v_rev, 'line_cancel', v_changes, v_reason);
  perform audit_write('purchase_order', 'LINE_CANCELLED', v_po_id::text,
    'PO #' || v_po.po_number || ' — cancelled ' || v_label || ' (' || inr_text(v_pending) || coalesce(' ' || v_line.unit, '') || ') — ' || v_reason);
  return jsonb_build_object('ok', true, 'revision', v_rev, 'status', v_status, 'changes', v_changes);
end $function$;

create or replace function public.set_po_revision_notified(p_revision_id uuid, p_how text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_po_id uuid; v_rev int; v_num int; v_done timestamptz;
begin
  perform set_config('app.po_rpc', 'on', true);
  if p_how not in ('whatsapp', 'told') then raise exception 'Unknown way of telling the vendor'; end if;
  select po_id, revision, notified_at into v_po_id, v_rev, v_done from purchase_order_revisions where id = p_revision_id for update;
  if v_po_id is null then raise exception 'That revision no longer exists'; end if;
  if v_done is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  update purchase_order_revisions set notified_at = now(), notified_by = auth.uid(), notified_how = p_how where id = p_revision_id;
  if not found then raise exception 'You do not have permission to change purchase orders'; end if;
  select po_number into v_num from purchase_orders where id = v_po_id;
  perform audit_write('purchase_order', 'REVISION_SENT', v_po_id::text,
    'PO #' || v_num || ' — ' || case when p_how = 'whatsapp' then 'Rev ' || v_rev || ' sent to the vendor on WhatsApp' else 'vendor already told about Rev ' || v_rev end);
  return jsonb_build_object('ok', true);
end $function$;

-- Receiving: as before, plus a cancelled line can no longer take goods.
create or replace function public.receive_po_items(p_po_id uuid, p_receipts jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_status text; v_num int; v_r jsonb; v_item_id uuid; v_qty numeric; v_ordered numeric; v_already numeric; v_total int; v_full int; v_n int := 0; v_sum numeric := 0;
  v_cancelled timestamptz; v_label text;
begin
  perform set_config('app.po_rpc','on',true);
  select status, po_number into v_status, v_num from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_status not in ('approved','sent','partially_received') then
    raise exception 'This purchase order is not open for receiving (status: %)', v_status using errcode='23514';
  end if;
  if p_receipts is null or jsonb_array_length(p_receipts) = 0 then raise exception 'Nothing to receive' using errcode='23514'; end if;
  for v_r in select value from jsonb_array_elements(p_receipts) loop
    v_item_id := (v_r->>'po_item_id')::uuid;
    v_qty := (v_r->>'received_qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select quantity, received_qty, cancelled_at, item_name || coalesce(' · ' || nullif(btrim(fabric_code), ''), '')
      into v_ordered, v_already, v_cancelled, v_label from purchase_order_items where id = v_item_id and po_id = p_po_id for update;
    if not found then raise exception 'That item is not part of this purchase order'; end if;
    if v_cancelled is not null then raise exception '% was cancelled on this order — it cannot be received', v_label; end if;
    -- Over-receipt is allowed (manufacturing over-delivery is normal). No <= ordered cap.
    insert into purchase_order_receipts (po_id, po_item_id, received_qty, receipt_date, remarks, received_by)
    values (p_po_id, v_item_id, v_qty, coalesce(nullif(v_r->>'receipt_date','')::date, (now() at time zone 'Asia/Kolkata')::date), nullif(v_r->>'remarks',''), auth.uid());
    update purchase_order_items set received_qty = received_qty + v_qty where id = v_item_id;
    v_n := v_n + 1; v_sum := v_sum + v_qty;
  end loop;
  if v_n = 0 then raise exception 'Enter a received quantity for at least one item' using errcode='23514'; end if;
  select count(*), count(*) filter (where received_qty >= quantity - 0.0001) into v_total, v_full from purchase_order_items where po_id = p_po_id;
  update purchase_orders set status = case when v_full = v_total then 'completed' else 'partially_received' end, modified_by = auth.uid(), updated_at = now() where id = p_po_id;
  perform audit_write('purchase_order', 'RECEIVE', p_po_id::text,
    'PO #' || v_num || ' — received ' || inr_text(v_sum) || ' across ' || v_n || ' item' || case when v_n = 1 then '' else 's' end);
  return jsonb_build_object('ok', true, 'received_count', v_n);
end $function$;

-- A cancelled line always stays settled (quantity = received). When a
-- receipt on it is undone (delete_po_receipt lowers received_qty), the undone
-- amount joins the cancelled balance instead of showing up as pending again,
-- and the order's money follows. A trigger owns this derived rule, so every
-- path that lowers received_qty keeps it (and delete_po_receipt itself, whose
-- body the MCP refuses to replace without an interactive confirmation, stays
-- as it was).
create or replace function public.po_item_cancelled_settle()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if old.cancelled_at is not null and new.cancelled_at is not null and new.received_qty < old.received_qty then
    new.cancelled_qty := new.cancelled_qty + (new.quantity - greatest(new.received_qty, 0));
    new.quantity := greatest(new.received_qty, 0);
    new.amount := case when new.rate is null then null else round(new.rate * new.quantity, 2) end;
  end if;
  return new;
end $function$;

create or replace function public.po_item_cancelled_totals()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  perform po_recompute_totals(new.po_id);
  return null;
end $function$;

create trigger trg_po_item_cancelled_settle
  before update of received_qty on public.purchase_order_items
  for each row when (old.cancelled_at is not null and new.received_qty < old.received_qty)
  execute function public.po_item_cancelled_settle();

create trigger trg_po_item_cancelled_totals
  after update of received_qty on public.purchase_order_items
  for each row when (old.cancelled_at is not null and new.received_qty < old.received_qty)
  execute function public.po_item_cancelled_totals();

revoke execute on function public.po_recompute_totals(uuid) from public, anon;
revoke execute on function public.po_settle_status(uuid) from public, anon;
revoke execute on function public.amend_po(uuid, jsonb, jsonb, text) from public, anon;
revoke execute on function public.cancel_po_line(uuid, text) from public, anon;
revoke execute on function public.set_po_revision_notified(uuid, text) from public, anon;
grant execute on function public.po_recompute_totals(uuid) to authenticated;
grant execute on function public.po_settle_status(uuid) to authenticated;
grant execute on function public.amend_po(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.cancel_po_line(uuid, text) to authenticated;
grant execute on function public.set_po_revision_notified(uuid, text) to authenticated;
