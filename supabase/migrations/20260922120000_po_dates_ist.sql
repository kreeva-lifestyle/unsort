-- Audit fix M5, post-deploy audit 21 Sep 2026.
--
-- create_po_with_items / update_po_with_items (po_date) and receive_po_items
-- (receipt_date) fell back to current_date when the client sent an empty
-- date. current_date is the SERVER's date, UTC on this project, so a PO
-- raised or goods received between 00:00 and 05:30 IST with a cleared date
-- landed on the previous day. The challan RPCs already use the IST date;
-- these three now do the same. Bodies are otherwise identical to
-- 20260921180000 (PO create/update) and 20260916143000 (receive).

create or replace function public.create_po_with_items(p_po jsonb, p_items jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_id uuid; v_num int; v_item jsonb; v_i int := 0;
  v_subtotal numeric := 0; v_disc_amt numeric; v_after numeric; v_tax_amt numeric; v_grand numeric;
  v_disc_type text := nullif(p_po->>'discount_type',''); v_disc_val numeric := coalesce((p_po->>'discount_value')::numeric,0);
  v_tax_pct numeric := coalesce((p_po->>'tax_percent')::numeric,0); v_other numeric := coalesce((p_po->>'other_charges')::numeric,0);
  v_round numeric := coalesce((p_po->>'round_off')::numeric,0); v_qty numeric; v_rate numeric;
  v_pieces int := nullif(p_po->>'for_pieces','')::int;
  v_lump boolean := coalesce((p_po->>'lump_sum')::boolean, false);
  v_fabric boolean := (p_po->>'po_type') = 'fabric';
  v_costing uuid := nullif(p_po->>'costing_product_id','')::uuid;
begin
  perform set_config('app.po_rpc','on',true);
  if coalesce(btrim(p_po->>'vendor_name'),'') = '' then raise exception 'Select a vendor first' using errcode='23514'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'A purchase order needs at least one item' using errcode='23514'; end if;
  if v_lump then v_pieces := null;
  elsif v_pieces is null or v_pieces <= 0 then raise exception 'For how many pcs is required — a whole number above 0' using errcode='23514'; end if;
  if v_costing is not null and not exists (select 1 from costing_products where id = v_costing) then raise exception 'The linked product costing no longer exists' using errcode='23514'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(btrim(v_item->>'item_name'),'') = '' then raise exception 'Every item needs a name' using errcode='23514'; end if;
    if v_fabric and coalesce(btrim(v_item->>'fabric_code'),'') = '' then raise exception 'Every fabric item needs a fabric code' using errcode='23514'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Every item needs a quantity greater than 0' using errcode='23514'; end if;
    v_rate := nullif(v_item->>'rate','')::numeric;
    v_subtotal := v_subtotal + round(coalesce(v_rate,0) * v_qty, 2);
  end loop;
  perform po_check_money(p_po, p_items);
  v_disc_amt := case when v_disc_type = 'percentage' then round(v_subtotal * v_disc_val / 100, 2) else least(greatest(v_disc_val,0), v_subtotal) end;
  v_after := v_subtotal - v_disc_amt;
  v_tax_amt := round(v_after * v_tax_pct / 100, 2);
  v_grand := round(v_after + v_tax_amt + v_other + v_round, 2);
  insert into purchase_orders (vendor_id, vendor_name, vendor_phone, po_type, status, po_date, expected_date, payment_terms, notes, for_pieces, lump_sum, costing_product_id,
    subtotal, discount_type, discount_value, discount_amount, tax_percent, tax_amount, other_charges, round_off, grand_total, created_by, modified_by)
  values (nullif(p_po->>'vendor_id','')::uuid, btrim(p_po->>'vendor_name'), nullif(p_po->>'vendor_phone',''),
    p_po->>'po_type', 'draft',
    coalesce(nullif(p_po->>'po_date','')::date, (now() at time zone 'Asia/Kolkata')::date), nullif(p_po->>'expected_date','')::date,
    nullif(p_po->>'payment_terms',''), nullif(p_po->>'notes',''), v_pieces, v_lump, v_costing,
    v_subtotal, v_disc_type, v_disc_val, v_disc_amt, v_tax_pct, v_tax_amt, v_other, v_round, v_grand, auth.uid(), auth.uid())
  returning id, po_number into v_id, v_num;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric; v_rate := nullif(v_item->>'rate','')::numeric;
    insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order)
    values (v_id, btrim(v_item->>'item_name'), nullif(v_item->>'sku',''), nullif(btrim(v_item->>'fabric_code'),''), v_qty, nullif(v_item->>'unit',''), v_rate,
      case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_i);
    v_i := v_i + 1;
  end loop;
  perform audit_write('purchase_order', 'CREATE', v_id::text,
    'PO #' || v_num || ' raised for ' || btrim(p_po->>'vendor_name') || case when v_grand > 0 then ' — ₹' || inr_text(v_grand) else '' end
    || coalesce(' from costing ' || (select sku from costing_products where id = v_costing), ''));
  return jsonb_build_object('id', v_id, 'po_number', v_num);
end $function$;

create or replace function public.update_po_with_items(p_po_id uuid, p_po jsonb, p_items jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_old purchase_orders%rowtype; v_item jsonb; v_i int := 0; v_old_items int; v_changes jsonb := '{}'::jsonb;
  v_subtotal numeric := 0; v_disc_amt numeric; v_after numeric; v_tax_amt numeric; v_grand numeric;
  v_disc_type text := nullif(p_po->>'discount_type',''); v_disc_val numeric := coalesce((p_po->>'discount_value')::numeric,0);
  v_tax_pct numeric := coalesce((p_po->>'tax_percent')::numeric,0); v_other numeric := coalesce((p_po->>'other_charges')::numeric,0);
  v_round numeric := coalesce((p_po->>'round_off')::numeric,0); v_qty numeric; v_rate numeric;
  v_pieces int := nullif(p_po->>'for_pieces','')::int;
  v_lump boolean := coalesce((p_po->>'lump_sum')::boolean, false);
  v_vendor text := btrim(p_po->>'vendor_name'); v_type text := p_po->>'po_type';
  v_po_date date := coalesce(nullif(p_po->>'po_date','')::date, (now() at time zone 'Asia/Kolkata')::date); v_exp date := nullif(p_po->>'expected_date','')::date;
  v_fabric boolean := (p_po->>'po_type') = 'fabric';
  v_costing uuid := nullif(p_po->>'costing_product_id','')::uuid;
begin
  perform set_config('app.po_rpc','on',true);
  select * into v_old from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_old.status <> 'draft' then raise exception 'Only draft purchase orders can be edited — cancel and create a new one.'; end if;
  if coalesce(v_vendor,'') = '' then raise exception 'Select a vendor first' using errcode='23514'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'A purchase order needs at least one item' using errcode='23514'; end if;
  if v_lump then v_pieces := null;
  elsif v_pieces is null or v_pieces <= 0 then raise exception 'For how many pcs is required — a whole number above 0' using errcode='23514'; end if;
  if v_costing is not null and not exists (select 1 from costing_products where id = v_costing) then raise exception 'The linked product costing no longer exists' using errcode='23514'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(btrim(v_item->>'item_name'),'') = '' then raise exception 'Every item needs a name' using errcode='23514'; end if;
    if v_fabric and coalesce(btrim(v_item->>'fabric_code'),'') = '' then raise exception 'Every fabric item needs a fabric code' using errcode='23514'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Every item needs a quantity greater than 0' using errcode='23514'; end if;
    v_rate := nullif(v_item->>'rate','')::numeric;
    v_subtotal := v_subtotal + round(coalesce(v_rate,0) * v_qty, 2);
  end loop;
  perform po_check_money(p_po, p_items);
  v_disc_amt := case when v_disc_type = 'percentage' then round(v_subtotal * v_disc_val / 100, 2) else least(greatest(v_disc_val,0), v_subtotal) end;
  v_after := v_subtotal - v_disc_amt; v_tax_amt := round(v_after * v_tax_pct / 100, 2);
  v_grand := round(v_after + v_tax_amt + v_other + v_round, 2);
  select count(*) into v_old_items from purchase_order_items where po_id = p_po_id;
  delete from purchase_order_items where po_id = p_po_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric; v_rate := nullif(v_item->>'rate','')::numeric;
    insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order)
    values (p_po_id, btrim(v_item->>'item_name'), nullif(v_item->>'sku',''), nullif(btrim(v_item->>'fabric_code'),''), v_qty, nullif(v_item->>'unit',''), v_rate,
      case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_i);
    v_i := v_i + 1;
  end loop;
  update purchase_orders set vendor_id = nullif(p_po->>'vendor_id','')::uuid, vendor_name = v_vendor,
    vendor_phone = nullif(p_po->>'vendor_phone',''), po_type = v_type,
    po_date = v_po_date, expected_date = v_exp,
    payment_terms = nullif(p_po->>'payment_terms',''), notes = nullif(p_po->>'notes',''), for_pieces = v_pieces, lump_sum = v_lump,
    costing_product_id = v_costing,
    subtotal = v_subtotal, discount_type = v_disc_type, discount_value = v_disc_val, discount_amount = v_disc_amt,
    tax_percent = v_tax_pct, tax_amount = v_tax_amt, other_charges = v_other, round_off = v_round, grand_total = v_grand,
    modified_by = auth.uid(), updated_at = now()
  where id = p_po_id;
  if v_old.vendor_name is distinct from v_vendor then v_changes := v_changes || jsonb_build_object('vendor_name', jsonb_build_object('from', v_old.vendor_name, 'to', v_vendor)); end if;
  if v_old.po_type is distinct from v_type then v_changes := v_changes || jsonb_build_object('po_type', jsonb_build_object('from', v_old.po_type, 'to', v_type)); end if;
  if v_old.po_date is distinct from v_po_date then v_changes := v_changes || jsonb_build_object('po_date', jsonb_build_object('from', v_old.po_date, 'to', v_po_date)); end if;
  if v_old.expected_date is distinct from v_exp then v_changes := v_changes || jsonb_build_object('expected_date', jsonb_build_object('from', v_old.expected_date, 'to', v_exp)); end if;
  if v_old.for_pieces is distinct from v_pieces then v_changes := v_changes || jsonb_build_object('for_pieces', jsonb_build_object('from', v_old.for_pieces, 'to', v_pieces)); end if;
  if v_old.lump_sum is distinct from v_lump then v_changes := v_changes || jsonb_build_object('lump_sum', jsonb_build_object('from', v_old.lump_sum, 'to', v_lump)); end if;
  if coalesce(v_old.grand_total,0) <> v_grand then v_changes := v_changes || jsonb_build_object('grand_total', jsonb_build_object('from', v_old.grand_total, 'to', v_grand)); end if;
  if v_old_items <> v_i then v_changes := v_changes || jsonb_build_object('items', jsonb_build_object('from', v_old_items, 'to', v_i)); end if;
  perform audit_write('purchase_order', 'UPDATE', p_po_id::text, 'PO #' || v_old.po_number || ' updated', nullif(v_changes, '{}'::jsonb));
  return jsonb_build_object('id', p_po_id, 'ok', true);
end $function$;

create or replace function public.receive_po_items(p_po_id uuid, p_receipts jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_status text; v_num int; v_r jsonb; v_item_id uuid; v_qty numeric; v_ordered numeric; v_already numeric; v_total int; v_full int; v_n int := 0; v_sum numeric := 0;
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
    select quantity, received_qty into v_ordered, v_already from purchase_order_items where id = v_item_id and po_id = p_po_id for update;
    if not found then raise exception 'That item is not part of this purchase order'; end if;
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
