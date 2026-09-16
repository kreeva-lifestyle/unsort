-- Purchase orders are meant to change only through their RPCs (create,
-- update, set_po_status, receive, delete_po_receipt, close). The RPCs set
-- app.po_rpc = 'on' and protect_po_immutability checked that flag — but only
-- on UPDATE of the header, and it waved through every update of a draft. RLS
-- lets any operator write the three PO tables directly, so with their own
-- JWT they could insert a header already 'approved' (skipping the manager
-- gate), flip a draft to 'approved' with a plain UPDATE, change quantities
-- and rates on an approved order's items without the header totals moving,
-- or set received_qty by hand (the receipt-sum check only watches receipt
-- rows). Two RPCs also lacked the role check their buttons imply, and
-- removing a receipt from a cancelled order silently un-cancelled it.
--
-- This migration:
--   1. po_require_rpc(): BEFORE INSERT/DELETE on purchase_orders and BEFORE
--      INSERT/UPDATE/DELETE on purchase_order_items and
--      purchase_order_receipts refuse any write outside an RPC.
--   2. protect_po_immutability: outside an RPC only a notes-only edit of a
--      non-cancelled order is allowed, whatever its status. Inside an RPC a
--      cancelled order stays untouchable.
--   3. set_po_status('sent'): admin/manager only, and only from 'approved'
--      (marking a partially received order as sent hid its progress).
--   4. delete_po_receipt: admin/manager only; a closed OR cancelled order
--      keeps its status after the tally is reversed.
--   5. create/update_po_with_items validate what the client already checks:
--      discount type and range, tax 0-100, charges >= 0, round-off within
--      999.99, a non-negative grand total, an explicit po_type; the subtotal
--      accumulates the rounded line amounts so it equals the sum of the lines
--      shown on the order.

-- 1. Writes outside an RPC are refused on all three PO tables.
create or replace function public.po_require_rpc()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_setting('app.po_rpc', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Purchase orders change only through the app''s actions' using errcode = '42501';
end $function$;

drop trigger if exists trg_po_header_rpc_only on public.purchase_orders;
create trigger trg_po_header_rpc_only
  before insert or delete on public.purchase_orders
  for each row execute function public.po_require_rpc();

drop trigger if exists trg_po_items_rpc_only on public.purchase_order_items;
create trigger trg_po_items_rpc_only
  before insert or update or delete on public.purchase_order_items
  for each row execute function public.po_require_rpc();

drop trigger if exists trg_po_receipts_rpc_only on public.purchase_order_receipts;
create trigger trg_po_receipts_rpc_only
  before insert or update or delete on public.purchase_order_receipts
  for each row execute function public.po_require_rpc();

-- 2. Header updates: RPC, or a notes-only edit.
create or replace function public.protect_po_immutability()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if old.status = 'cancelled' then
    raise exception 'Cancelled purchase orders cannot be modified — this is a permanent record.';
  end if;
  if current_setting('app.po_rpc', true) = 'on' then
    return new;
  end if;
  -- notes-only metadata edit outside an RPC is allowed
  if (new.notes is distinct from old.notes)
     and row(new.id,new.po_number,new.vendor_id,new.vendor_name,new.vendor_phone,new.po_type,new.status,new.po_date,new.expected_date,new.payment_terms,new.for_pieces,new.subtotal,new.discount_type,new.discount_value,new.discount_amount,new.tax_percent,new.tax_amount,new.other_charges,new.round_off,new.grand_total,new.approved_by,new.approved_at,new.cancelled_by,new.cancelled_at,new.closed_by,new.closed_at,new.close_reason,new.created_by,new.created_at)
       is not distinct from
         row(old.id,old.po_number,old.vendor_id,old.vendor_name,old.vendor_phone,old.po_type,old.status,old.po_date,old.expected_date,old.payment_terms,old.for_pieces,old.subtotal,old.discount_type,old.discount_value,old.discount_amount,old.tax_percent,old.tax_amount,old.other_charges,old.round_off,old.grand_total,old.approved_by,old.approved_at,old.cancelled_by,old.cancelled_at,old.closed_by,old.closed_at,old.close_reason,old.created_by,old.created_at)
  then
    return new;
  end if;
  raise exception 'Purchase orders change only through the app''s actions' using errcode = '42501';
end $function$;

-- 3. Status changes: 'sent' is a manager action from 'approved' only.
create or replace function public.set_po_status(p_po_id uuid, p_status text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_old text; v_role text; v_total int; v_full int; v_any numeric; v_new text;
begin
  perform set_config('app.po_rpc','on',true);
  select status into v_old from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  select role into v_role from profiles where id = auth.uid();
  if p_status = 'approved' then
    if v_old <> 'draft' then raise exception 'Only a draft can be approved'; end if;
    if v_role not in ('admin','manager') then raise exception 'Only an admin or manager can approve a purchase order'; end if;
    update purchase_orders set status='approved', approved_by=auth.uid(), approved_at=now(), modified_by=auth.uid(), updated_at=now() where id=p_po_id;
  elsif p_status = 'sent' then
    if v_old <> 'approved' then raise exception 'Only an approved purchase order can be marked as sent'; end if;
    if v_role not in ('admin','manager') then raise exception 'Only an admin or manager can mark a purchase order as sent'; end if;
    update purchase_orders set status='sent', modified_by=auth.uid(), updated_at=now() where id=p_po_id;
  elsif p_status = 'reopen' then
    if v_old <> 'closed' then raise exception 'Only a closed purchase order can be reopened'; end if;
    if v_role not in ('admin','manager') then raise exception 'Only an admin or manager can reopen a purchase order'; end if;
    select count(*), count(*) filter (where received_qty >= quantity - 0.0001), coalesce(sum(received_qty),0)
      into v_total, v_full, v_any from purchase_order_items where po_id = p_po_id;
    v_new := case when v_total > 0 and v_full = v_total then 'completed' when v_any > 0 then 'partially_received' else 'approved' end;
    update purchase_orders set status = v_new, closed_at = null, closed_by = null, close_reason = null,
      modified_by = auth.uid(), updated_at = now() where id = p_po_id;
    return jsonb_build_object('ok', true, 'status', v_new);
  elsif p_status = 'cancelled' then
    if v_old = 'cancelled' then raise exception 'This purchase order is already cancelled'; end if;
    if v_old = 'completed' then raise exception 'A completed purchase order cannot be cancelled'; end if;
    if v_role not in ('admin','manager') then raise exception 'Only an admin or manager can cancel a purchase order'; end if;
    update purchase_orders set status='cancelled', cancelled_by=auth.uid(), cancelled_at=now(), modified_by=auth.uid(), updated_at=now() where id=p_po_id;
  else
    raise exception 'Unsupported status change: %', p_status;
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end $function$;

-- 4. Removing a receipt: manager action; closed and cancelled stay as they are.
create or replace function public.delete_po_receipt(p_receipt_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_po_id uuid; v_item_id uuid; v_qty numeric; v_total int; v_full int; v_any numeric; v_new text; v_cur text; v_role text;
begin
  perform set_config('app.po_rpc','on',true);
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','manager') then
    raise exception 'Only an admin or manager can remove a receipt';
  end if;
  select po_id, po_item_id, received_qty into v_po_id, v_item_id, v_qty
    from purchase_order_receipts where id = p_receipt_id for update;
  if not found then raise exception 'That receipt no longer exists'; end if;
  select status into v_cur from purchase_orders where id = v_po_id for update;
  if v_cur = 'cancelled' then
    raise exception 'Cancelled purchase orders cannot be modified — this is a permanent record.';
  end if;
  update purchase_order_items set received_qty = greatest(0, received_qty - v_qty) where id = v_item_id;
  delete from purchase_order_receipts where id = p_receipt_id;
  select count(*), count(*) filter (where received_qty >= quantity - 0.0001), coalesce(sum(received_qty),0)
    into v_total, v_full, v_any from purchase_order_items where po_id = v_po_id;
  v_new := case when v_cur = 'closed' then 'closed'
                when v_full = v_total then 'completed'
                when v_any > 0 then 'partially_received' else 'approved' end;
  update purchase_orders set status = v_new, modified_by = auth.uid(), updated_at = now() where id = v_po_id;
  return jsonb_build_object('ok', true, 'status', v_new);
end $function$;

-- 5. Money validation shared by create and update.
create or replace function public.po_check_money(p_po jsonb, p_items jsonb)
 returns void
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v_item jsonb; v_qty numeric; v_rate numeric; v_subtotal numeric := 0; v_disc_amt numeric; v_after numeric; v_tax_amt numeric; v_grand numeric;
  v_disc_type text := nullif(p_po->>'discount_type',''); v_disc_val numeric := coalesce((p_po->>'discount_value')::numeric,0);
  v_tax_pct numeric := coalesce((p_po->>'tax_percent')::numeric,0); v_other numeric := coalesce((p_po->>'other_charges')::numeric,0);
  v_round numeric := coalesce((p_po->>'round_off')::numeric,0);
begin
  if coalesce(nullif(p_po->>'po_type',''), '') not in ('fabric','job_work','material') then
    raise exception 'Pick the purchase order type' using errcode='23514';
  end if;
  if v_disc_type is not null and v_disc_type not in ('flat','percentage') then
    raise exception 'Unknown discount type' using errcode='23514';
  end if;
  if v_disc_val < 0 or (v_disc_type = 'percentage' and v_disc_val > 100) then
    raise exception 'Discount is out of range' using errcode='23514';
  end if;
  if v_tax_pct < 0 or v_tax_pct > 100 then raise exception 'Tax must be between 0 and 100 percent' using errcode='23514'; end if;
  if v_other < 0 then raise exception 'Other charges cannot be negative' using errcode='23514'; end if;
  if abs(v_round) > 999.99 then raise exception 'Round-off must be within 999.99' using errcode='23514'; end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_qty := (v_item->>'quantity')::numeric; v_rate := nullif(v_item->>'rate','')::numeric;
    if v_rate is not null and v_rate < 0 then raise exception 'Rate cannot be negative' using errcode='23514'; end if;
    v_subtotal := v_subtotal + round(coalesce(v_rate,0) * coalesce(v_qty,0), 2);
  end loop;
  v_disc_amt := case when v_disc_type = 'percentage' then round(v_subtotal * v_disc_val / 100, 2) else least(greatest(v_disc_val,0), v_subtotal) end;
  v_after := v_subtotal - v_disc_amt; v_tax_amt := round(v_after * v_tax_pct / 100, 2);
  v_grand := round(v_after + v_tax_amt + v_other + v_round, 2);
  if v_grand < 0 then raise exception 'Grand total cannot be negative' using errcode='23514'; end if;
end $function$;

revoke all on function public.po_check_money(jsonb, jsonb) from public, anon;
grant execute on function public.po_check_money(jsonb, jsonb) to authenticated;

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
    v_subtotal := v_subtotal + round(coalesce(v_rate,0) * v_qty, 2);
  end loop;
  perform po_check_money(p_po, p_items);
  v_disc_amt := case when v_disc_type = 'percentage' then round(v_subtotal * v_disc_val / 100, 2) else least(greatest(v_disc_val,0), v_subtotal) end;
  v_after := v_subtotal - v_disc_amt;
  v_tax_amt := round(v_after * v_tax_pct / 100, 2);
  v_grand := round(v_after + v_tax_amt + v_other + v_round, 2);
  insert into purchase_orders (vendor_id, vendor_name, vendor_phone, po_type, status, po_date, expected_date, payment_terms, notes, for_pieces,
    subtotal, discount_type, discount_value, discount_amount, tax_percent, tax_amount, other_charges, round_off, grand_total, created_by, modified_by)
  values (nullif(p_po->>'vendor_id','')::uuid, btrim(p_po->>'vendor_name'), nullif(p_po->>'vendor_phone',''),
    p_po->>'po_type', 'draft',
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
  if coalesce(btrim(p_po->>'vendor_name'),'') = '' then raise exception 'Select a vendor first' using errcode='23514'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'A purchase order needs at least one item' using errcode='23514'; end if;
  if v_pieces is not null and v_pieces <= 0 then raise exception 'For how many pcs must be greater than 0' using errcode='23514'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(btrim(v_item->>'item_name'),'') = '' then raise exception 'Every item needs a name' using errcode='23514'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Every item needs a quantity greater than 0' using errcode='23514'; end if;
    v_rate := nullif(v_item->>'rate','')::numeric;
    v_subtotal := v_subtotal + round(coalesce(v_rate,0) * v_qty, 2);
  end loop;
  perform po_check_money(p_po, p_items);
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
    vendor_phone = nullif(p_po->>'vendor_phone',''), po_type = p_po->>'po_type',
    po_date = coalesce(nullif(p_po->>'po_date','')::date, current_date), expected_date = nullif(p_po->>'expected_date','')::date,
    payment_terms = nullif(p_po->>'payment_terms',''), notes = nullif(p_po->>'notes',''), for_pieces = v_pieces,
    subtotal = v_subtotal, discount_type = v_disc_type, discount_value = v_disc_val, discount_amount = v_disc_amt,
    tax_percent = v_tax_pct, tax_amount = v_tax_amt, other_charges = v_other, round_off = v_round, grand_total = v_grand,
    modified_by = auth.uid(), updated_at = now()
  where id = p_po_id;
  return jsonb_build_object('id', p_po_id, 'ok', true);
end $function$;
