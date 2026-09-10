-- WHY: while raising a purchase order the owner wants to note how many
-- finished pieces the purchase is for (fabric for 120 kurtas, job work for
-- 80 sets). It is internal planning data: the app shows it in the form,
-- the detail sheet and the list, but the shared image and the printed A4
-- sheet that go to vendors never carry it (poPdf.ts / poImage.ts pick their
-- header fields by hand and leave it out). Saves go only through the two
-- RPCs below, which build the insert/update column by column, so they are
-- re-created with the new column; nothing else in them changes (totals,
-- validation, the app.po_rpc guard, the draft-only edit rule).
-- Additive. Applied via MCP as purchase_orders_for_pieces.

alter table public.purchase_orders
  add column if not exists for_pieces integer
    check (for_pieces is null or for_pieces > 0);

comment on column public.purchase_orders.for_pieces is
  'Internal: how many finished pieces this purchase is for. Never printed or shared.';

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
begin
  perform set_config('app.po_rpc','on',true);
  if coalesce(btrim(p_po->>'vendor_name'),'') = '' then raise exception 'Select a vendor first' using errcode='23514'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'A purchase order needs at least one item' using errcode='23514'; end if;
  if v_pieces is not null and v_pieces <= 0 then raise exception 'For how many pcs must be greater than 0' using errcode='23514'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(btrim(v_item->>'item_name'),'') = '' then raise exception 'Every item needs a name' using errcode='23514'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Every item needs a quantity greater than 0' using errcode='23514'; end if;
    v_rate := nullif(v_item->>'rate','')::numeric;
    v_subtotal := v_subtotal + coalesce(v_rate,0) * v_qty;
  end loop;
  v_disc_amt := case when v_disc_type = 'percentage' then round(v_subtotal * v_disc_val / 100, 2) else least(greatest(v_disc_val,0), v_subtotal) end;
  v_after := v_subtotal - v_disc_amt;
  v_tax_amt := round(v_after * v_tax_pct / 100, 2);
  v_grand := round(v_after + v_tax_amt + v_other + v_round, 2);
  insert into purchase_orders (vendor_id, vendor_name, vendor_phone, po_type, status, po_date, expected_date, payment_terms, notes, for_pieces,
    subtotal, discount_type, discount_value, discount_amount, tax_percent, tax_amount, other_charges, round_off, grand_total, created_by, modified_by)
  values (nullif(p_po->>'vendor_id','')::uuid, btrim(p_po->>'vendor_name'), nullif(p_po->>'vendor_phone',''),
    coalesce(nullif(p_po->>'po_type',''),'material'), 'draft',
    coalesce(nullif(p_po->>'po_date','')::date, current_date), nullif(p_po->>'expected_date','')::date,
    nullif(p_po->>'payment_terms',''), nullif(p_po->>'notes',''), v_pieces,
    v_subtotal, v_disc_type, v_disc_val, v_disc_amt, v_tax_pct, v_tax_amt, v_other, v_round, v_grand, auth.uid(), auth.uid())
  returning id, po_number into v_id, v_num;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric; v_rate := nullif(v_item->>'rate','')::numeric;
    insert into purchase_order_items (po_id, item_name, sku, quantity, unit, rate, amount, sort_order)
    values (v_id, btrim(v_item->>'item_name'), nullif(v_item->>'sku',''), v_qty, nullif(v_item->>'unit',''), v_rate,
      case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_i);
    v_i := v_i + 1;
  end loop;
  return jsonb_build_object('id', v_id, 'po_number', v_num);
end $function$;

create or replace function public.update_po_with_items(p_po_id uuid, p_po jsonb, p_items jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_status text; v_item jsonb; v_i int := 0;
  v_subtotal numeric := 0; v_disc_amt numeric; v_after numeric; v_tax_amt numeric; v_grand numeric;
  v_disc_type text := nullif(p_po->>'discount_type',''); v_disc_val numeric := coalesce((p_po->>'discount_value')::numeric,0);
  v_tax_pct numeric := coalesce((p_po->>'tax_percent')::numeric,0); v_other numeric := coalesce((p_po->>'other_charges')::numeric,0);
  v_round numeric := coalesce((p_po->>'round_off')::numeric,0); v_qty numeric; v_rate numeric;
  v_pieces int := nullif(p_po->>'for_pieces','')::int;
begin
  perform set_config('app.po_rpc','on',true);
  select status into v_status from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_status <> 'draft' then raise exception 'Only draft purchase orders can be edited — cancel and create a new one.'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'A purchase order needs at least one item' using errcode='23514'; end if;
  if v_pieces is not null and v_pieces <= 0 then raise exception 'For how many pcs must be greater than 0' using errcode='23514'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(btrim(v_item->>'item_name'),'') = '' then raise exception 'Every item needs a name' using errcode='23514'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Every item needs a quantity greater than 0' using errcode='23514'; end if;
    v_rate := nullif(v_item->>'rate','')::numeric;
    v_subtotal := v_subtotal + coalesce(v_rate,0) * v_qty;
  end loop;
  v_disc_amt := case when v_disc_type = 'percentage' then round(v_subtotal * v_disc_val / 100, 2) else least(greatest(v_disc_val,0), v_subtotal) end;
  v_after := v_subtotal - v_disc_amt; v_tax_amt := round(v_after * v_tax_pct / 100, 2);
  v_grand := round(v_after + v_tax_amt + v_other + v_round, 2);
  delete from purchase_order_items where po_id = p_po_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric; v_rate := nullif(v_item->>'rate','')::numeric;
    insert into purchase_order_items (po_id, item_name, sku, quantity, unit, rate, amount, sort_order)
    values (p_po_id, btrim(v_item->>'item_name'), nullif(v_item->>'sku',''), v_qty, nullif(v_item->>'unit',''), v_rate,
      case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_i);
    v_i := v_i + 1;
  end loop;
  update purchase_orders set vendor_id = nullif(p_po->>'vendor_id','')::uuid, vendor_name = btrim(p_po->>'vendor_name'),
    vendor_phone = nullif(p_po->>'vendor_phone',''), po_type = coalesce(nullif(p_po->>'po_type',''),'material'),
    po_date = coalesce(nullif(p_po->>'po_date','')::date, current_date), expected_date = nullif(p_po->>'expected_date','')::date,
    payment_terms = nullif(p_po->>'payment_terms',''), notes = nullif(p_po->>'notes',''), for_pieces = v_pieces,
    subtotal = v_subtotal, discount_type = v_disc_type, discount_value = v_disc_val, discount_amount = v_disc_amt,
    tax_percent = v_tax_pct, tax_amount = v_tax_amt, other_charges = v_other, round_off = v_round, grand_total = v_grand,
    modified_by = auth.uid(), updated_at = now()
  where id = p_po_id;
  return jsonb_build_object('id', p_po_id, 'ok', true);
end $function$;
