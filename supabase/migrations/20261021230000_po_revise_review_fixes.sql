-- Purchase orders: fixes from the review of revise / cancel-item
-- (20261021193000 / 20261021194500).
--
-- * amend_po
--   - refuses a stale form: the client sends the revision it opened
--     (p_po.base_revision); without the check a second person's save silently
--     undid the first revision and cancelled the lines it had added;
--   - holds a quantity at what arrived only when the quantity is cut, so a
--     line that got more than ordered (normal over-delivery) no longer blocks
--     every revision of the order;
--   - rounds quantity and rate to the columns' scale before comparing and
--     storing, so the line amount, the order total and the history agree.
-- * A receipt on a cancelled item can no longer be undone. Undoing it folded
--   the goods into the cancelled balance, and since a cancelled item takes no
--   more goods (and a completed order takes none at all) the right amount
--   could never be received again. Its receipts now stay as recorded; the
--   cancel sheet says so before the cancel. (trg_po_item_cancelled_totals is
--   now never reached; dropping it needs the SQL Editor — the MCP times out
--   on a DROP — so it stays, harmless.)

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
  -- The form says which revision it was opened at; a revision saved since
  -- would otherwise be quietly undone (its lines rewritten, its new lines cancelled).
  if nullif(p_po->>'base_revision', '')::int is distinct from v_old.revision then
    raise exception 'PO #% changed since you opened it (now Rev %) — close it and revise again', v_old.po_number, v_old.revision;
  end if;
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
    -- Rounded to the columns' scale, so the stored row, its amount, the totals and the history agree.
    v_qty := round((v_item->>'quantity')::numeric, 3);
    v_rate := round(nullif(v_item->>'rate', '')::numeric, 2);
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
      -- Only a cut is held at what arrived: a line that got more than ordered stays as it is.
      if v_qty < v_line.quantity - 0.0001 and v_qty < v_line.received_qty - 0.0001 then
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

create or replace function public.po_item_cancelled_settle()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if old.cancelled_at is not null and new.cancelled_at is not null and new.received_qty < old.received_qty then
    raise exception '% was cancelled on this order — its receipts stay as recorded', new.item_name || coalesce(' · ' || nullif(btrim(new.fabric_code), ''), '');
  end if;
  return new;
end $function$;
