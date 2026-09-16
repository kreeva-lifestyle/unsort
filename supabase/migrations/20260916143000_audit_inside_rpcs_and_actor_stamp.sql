-- The audit trail for purchase orders and cash challans was written by the
-- browser AFTER the money write, best-effort, with user_id / user_email /
-- action / details all supplied by the client. Any signed-in user could
-- insert a row claiming any user did anything; a tab closed between the RPC
-- and the audit insert left a change with no trace; direct RPC calls never
-- produced one; and the challan RPCs took created_by / modified_by /
-- paid_by (and undo/unpay took p_user) from the payload.
--
-- Now:
--   1. audit_log_stamp_actor(): BEFORE INSERT on audit_log overwrites
--      user_id with auth.uid() and user_email with the caller's profile
--      name (or email) whenever there is a session. Client-written rows
--      (notes, SKU edits, inventory toggle, Cash Book) keep working and can
--      no longer name someone else. Service-role / cron inserts are untouched.
--   2. audit_write(): one helper the RPCs call inside their transaction, so
--      the audit row commits with the change or not at all.
--   3. Every PO RPC (create, update, set_po_status, receive, delete_po_receipt,
--      close_po_short) and every challan RPC (create, update, pay_challan_batch,
--      void_challan, undo_challan_batch, unpay_challan_batch,
--      settle_return_refund, apply_return_credit) writes its own audit row
--      with the same wording the client used to write.
--   4. Attribution comes from auth.uid(): challan create/update stamp
--      created_by / modified_by / paid_by from the session; undo/unpay ignore
--      p_user (kept only so older clients still call them).
--   5. While these two are rewritten: apply_return_credit and
--      settle_return_refund date their rows in IST instead of the server's
--      UTC current_date (between 00:00 and 05:30 IST both legs landed on
--      yesterday, into a period that may already be handed over), and
--      settle_return_refund takes an optional p_batch_id so a batch settle is
--      traceable to its batch.

-- 1. Actor stamp ------------------------------------------------------------
create or replace function public.audit_log_stamp_actor()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_name text;
begin
  if v_uid is not null then
    new.user_id := v_uid;
    select coalesce(nullif(btrim(full_name), ''), email) into v_name from profiles where id = v_uid;
    if v_name is not null then new.user_email := v_name; end if;
  end if;
  return new;
end $function$;

drop trigger if exists trg_audit_log_stamp_actor on public.audit_log;
create trigger trg_audit_log_stamp_actor
  before insert on public.audit_log
  for each row execute function public.audit_log_stamp_actor();

-- 2. Helpers ------------------------------------------------------------------
create or replace function public.audit_write(p_module text, p_action text, p_record text, p_details text, p_changes jsonb default null)
 returns void
 language sql
 set search_path to 'public'
as $function$
  insert into audit_log (module, action, record_id, details, changes)
  values (p_module, p_action, p_record, p_details, p_changes);
$function$;

revoke all on function public.audit_write(text, text, text, text, jsonb) from public, anon;
grant execute on function public.audit_write(text, text, text, text, jsonb) to authenticated;

-- "1350", "2042.5": the rupee text used inside audit sentences.
create or replace function public.inr_text(n numeric)
 returns text
 language sql
 immutable
as $function$
  select rtrim(rtrim(to_char(coalesce(n, 0), 'FM999999999990.99'), '0'), '.');
$function$;

-- 3a. Purchase orders ------------------------------------------------------------
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
  perform audit_write('purchase_order', 'CREATE', v_id::text,
    'PO #' || v_num || ' raised for ' || btrim(p_po->>'vendor_name') || case when v_grand > 0 then ' — ₹' || inr_text(v_grand) else '' end);
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
  v_vendor text := btrim(p_po->>'vendor_name'); v_type text := p_po->>'po_type';
  v_po_date date := coalesce(nullif(p_po->>'po_date','')::date, current_date); v_exp date := nullif(p_po->>'expected_date','')::date;
begin
  perform set_config('app.po_rpc','on',true);
  select * into v_old from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_old.status <> 'draft' then raise exception 'Only draft purchase orders can be edited — cancel and create a new one.'; end if;
  if coalesce(v_vendor,'') = '' then raise exception 'Select a vendor first' using errcode='23514'; end if;
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
  select count(*) into v_old_items from purchase_order_items where po_id = p_po_id;
  delete from purchase_order_items where po_id = p_po_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric; v_rate := nullif(v_item->>'rate','')::numeric;
    insert into purchase_order_items (po_id, item_name, sku, quantity, unit, rate, amount, sort_order)
    values (p_po_id, btrim(v_item->>'item_name'), nullif(v_item->>'sku',''), v_qty, nullif(v_item->>'unit',''), v_rate,
      case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_i);
    v_i := v_i + 1;
  end loop;
  update purchase_orders set vendor_id = nullif(p_po->>'vendor_id','')::uuid, vendor_name = v_vendor,
    vendor_phone = nullif(p_po->>'vendor_phone',''), po_type = v_type,
    po_date = v_po_date, expected_date = v_exp,
    payment_terms = nullif(p_po->>'payment_terms',''), notes = nullif(p_po->>'notes',''), for_pieces = v_pieces,
    subtotal = v_subtotal, discount_type = v_disc_type, discount_value = v_disc_val, discount_amount = v_disc_amt,
    tax_percent = v_tax_pct, tax_amount = v_tax_amt, other_charges = v_other, round_off = v_round, grand_total = v_grand,
    modified_by = auth.uid(), updated_at = now()
  where id = p_po_id;
  -- Field-level diff for the audit row (the old client logged only "updated").
  if v_old.vendor_name is distinct from v_vendor then v_changes := v_changes || jsonb_build_object('vendor_name', jsonb_build_object('from', v_old.vendor_name, 'to', v_vendor)); end if;
  if v_old.po_type is distinct from v_type then v_changes := v_changes || jsonb_build_object('po_type', jsonb_build_object('from', v_old.po_type, 'to', v_type)); end if;
  if v_old.po_date is distinct from v_po_date then v_changes := v_changes || jsonb_build_object('po_date', jsonb_build_object('from', v_old.po_date, 'to', v_po_date)); end if;
  if v_old.expected_date is distinct from v_exp then v_changes := v_changes || jsonb_build_object('expected_date', jsonb_build_object('from', v_old.expected_date, 'to', v_exp)); end if;
  if v_old.for_pieces is distinct from v_pieces then v_changes := v_changes || jsonb_build_object('for_pieces', jsonb_build_object('from', v_old.for_pieces, 'to', v_pieces)); end if;
  if coalesce(v_old.grand_total,0) <> v_grand then v_changes := v_changes || jsonb_build_object('grand_total', jsonb_build_object('from', v_old.grand_total, 'to', v_grand)); end if;
  if v_old_items <> v_i then v_changes := v_changes || jsonb_build_object('items', jsonb_build_object('from', v_old_items, 'to', v_i)); end if;
  perform audit_write('purchase_order', 'UPDATE', p_po_id::text, 'PO #' || v_old.po_number || ' updated', nullif(v_changes, '{}'::jsonb));
  return jsonb_build_object('id', p_po_id, 'ok', true);
end $function$;

create or replace function public.set_po_status(p_po_id uuid, p_status text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_old text; v_num int; v_role text; v_total int; v_full int; v_any numeric; v_new text;
begin
  perform set_config('app.po_rpc','on',true);
  select status, po_number into v_old, v_num from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  select role into v_role from profiles where id = auth.uid();
  if p_status = 'approved' then
    if v_old <> 'draft' then raise exception 'Only a draft can be approved'; end if;
    if v_role not in ('admin','manager') then raise exception 'Only an admin or manager can approve a purchase order'; end if;
    update purchase_orders set status='approved', approved_by=auth.uid(), approved_at=now(), modified_by=auth.uid(), updated_at=now() where id=p_po_id;
    perform audit_write('purchase_order', 'APPROVED', p_po_id::text, 'PO #' || v_num || ' approved');
  elsif p_status = 'sent' then
    if v_old <> 'approved' then raise exception 'Only an approved purchase order can be marked as sent'; end if;
    if v_role not in ('admin','manager') then raise exception 'Only an admin or manager can mark a purchase order as sent'; end if;
    update purchase_orders set status='sent', modified_by=auth.uid(), updated_at=now() where id=p_po_id;
    perform audit_write('purchase_order', 'SENT', p_po_id::text, 'PO #' || v_num || ' marked sent');
  elsif p_status = 'reopen' then
    if v_old <> 'closed' then raise exception 'Only a closed purchase order can be reopened'; end if;
    if v_role not in ('admin','manager') then raise exception 'Only an admin or manager can reopen a purchase order'; end if;
    select count(*), count(*) filter (where received_qty >= quantity - 0.0001), coalesce(sum(received_qty),0)
      into v_total, v_full, v_any from purchase_order_items where po_id = p_po_id;
    v_new := case when v_total > 0 and v_full = v_total then 'completed' when v_any > 0 then 'partially_received' else 'approved' end;
    update purchase_orders set status = v_new, closed_at = null, closed_by = null, close_reason = null,
      modified_by = auth.uid(), updated_at = now() where id = p_po_id;
    perform audit_write('purchase_order', 'REOPENED', p_po_id::text, 'PO #' || v_num || ' reopened');
    return jsonb_build_object('ok', true, 'status', v_new);
  elsif p_status = 'cancelled' then
    if v_old = 'cancelled' then raise exception 'This purchase order is already cancelled'; end if;
    if v_old = 'completed' then raise exception 'A completed purchase order cannot be cancelled'; end if;
    if v_role not in ('admin','manager') then raise exception 'Only an admin or manager can cancel a purchase order'; end if;
    update purchase_orders set status='cancelled', cancelled_by=auth.uid(), cancelled_at=now(), modified_by=auth.uid(), updated_at=now() where id=p_po_id;
    perform audit_write('purchase_order', 'CANCELLED', p_po_id::text, 'PO #' || v_num || ' cancelled');
  else
    raise exception 'Unsupported status change: %', p_status;
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
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
    values (p_po_id, v_item_id, v_qty, coalesce(nullif(v_r->>'receipt_date','')::date, current_date), nullif(v_r->>'remarks',''), auth.uid());
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

create or replace function public.delete_po_receipt(p_receipt_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_po_id uuid; v_item_id uuid; v_qty numeric; v_total int; v_full int; v_any numeric; v_new text; v_cur text; v_role text; v_num int; v_item_name text;
begin
  perform set_config('app.po_rpc','on',true);
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','manager') then
    raise exception 'Only an admin or manager can remove a receipt';
  end if;
  select po_id, po_item_id, received_qty into v_po_id, v_item_id, v_qty
    from purchase_order_receipts where id = p_receipt_id for update;
  if not found then raise exception 'That receipt no longer exists'; end if;
  select status, po_number into v_cur, v_num from purchase_orders where id = v_po_id for update;
  if v_cur = 'cancelled' then
    raise exception 'Cancelled purchase orders cannot be modified — this is a permanent record.';
  end if;
  select item_name into v_item_name from purchase_order_items where id = v_item_id;
  update purchase_order_items set received_qty = greatest(0, received_qty - v_qty) where id = v_item_id;
  delete from purchase_order_receipts where id = p_receipt_id;
  select count(*), count(*) filter (where received_qty >= quantity - 0.0001), coalesce(sum(received_qty),0)
    into v_total, v_full, v_any from purchase_order_items where po_id = v_po_id;
  v_new := case when v_cur = 'closed' then 'closed'
                when v_full = v_total then 'completed'
                when v_any > 0 then 'partially_received' else 'approved' end;
  update purchase_orders set status = v_new, modified_by = auth.uid(), updated_at = now() where id = v_po_id;
  perform audit_write('purchase_order', 'RECEIPT_REMOVED', v_po_id::text,
    'PO #' || v_num || ' — removed receipt of +' || inr_text(v_qty) || coalesce(' (' || v_item_name || ')', ''));
  return jsonb_build_object('ok', true, 'status', v_new);
end $function$;

create or replace function public.close_po_short(p_po_id uuid, p_reason text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_status text; v_num int; v_role text; v_reason text := btrim(coalesce(p_reason,'')); v_pending numeric;
begin
  perform set_config('app.po_rpc','on',true);
  select status, po_number into v_status, v_num from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_status not in ('approved','sent','partially_received') then
    raise exception 'Only an open purchase order can be closed (status: %)', v_status using errcode='23514';
  end if;
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','manager') then
    raise exception 'Only an admin or manager can close a purchase order';
  end if;
  if v_reason = '' then raise exception 'Say why the balance is being closed' using errcode='23514'; end if;
  select coalesce(sum(greatest(quantity - received_qty, 0)), 0) into v_pending from purchase_order_items where po_id = p_po_id;
  update purchase_orders
     set status = 'closed', closed_at = now(), closed_by = auth.uid(), close_reason = v_reason,
         modified_by = auth.uid(), updated_at = now()
   where id = p_po_id;
  perform audit_write('purchase_order', 'CLOSED', p_po_id::text,
    'PO #' || v_num || ' closed with ' || inr_text(v_pending) || ' pending — ' || v_reason);
  return jsonb_build_object('ok', true, 'status', 'closed');
end $function$;

-- 3b. Cash challans -------------------------------------------------------------
create or replace function public.create_challan_with_items(p_challan jsonb, p_items jsonb, p_payment jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_challan_id uuid;
  v_challan_number int;
  v_item jsonb;
  v_i int := 0;
  v_tags text[] := null;
  v_is_return boolean := coalesce((p_challan->>'is_return')::boolean, false);
  v_status text := p_challan->>'status';
  v_amount_paid numeric := coalesce((p_challan->>'amount_paid')::numeric, 0);
  v_total numeric := (p_challan->>'total')::numeric;
  v_pay_amount numeric := coalesce((p_payment->>'amount')::numeric, 0);
  v_actor uuid := coalesce(auth.uid(), (p_challan->>'created_by')::uuid);
begin
  perform set_config('app.challan_rpc', 'on', true);
  perform challan_check_money(p_challan, p_items, null);

  if v_is_return then
    -- Returns are credit notes: always closed, never cash. Enforce
    -- server-side regardless of what the client sent.
    v_status := 'paid';
    v_amount_paid := 0;
    p_payment := null;
  else
    if v_status = 'paid' and v_amount_paid is distinct from v_total then
      raise exception 'Status "paid" requires amount_paid (%) to equal total (%)', v_amount_paid, v_total using errcode = '23514';
    elsif v_status = 'partial' and not (v_amount_paid > 0 and v_amount_paid < v_total) then
      raise exception 'Status "partial" requires 0 < amount_paid (%) < total (%)', v_amount_paid, v_total using errcode = '23514';
    elsif v_status = 'unpaid' and v_amount_paid <> 0 then
      raise exception 'Status "unpaid" requires amount_paid 0, got %', v_amount_paid using errcode = '23514';
    end if;
    -- amount_paid and the payment ledger row must be written together and agree.
    if v_amount_paid > 0 and (p_payment is null or v_pay_amount is distinct from v_amount_paid) then
      raise exception 'amount_paid (%) requires a matching payment record (got %)', v_amount_paid, v_pay_amount using errcode = '23514';
    end if;
    if v_amount_paid = 0 and v_pay_amount > 0 then
      raise exception 'Payment record of % supplied but amount_paid is 0', v_pay_amount using errcode = '23514';
    end if;
  end if;

  if p_challan->'tags' is not null and jsonb_typeof(p_challan->'tags') = 'array' and jsonb_array_length(p_challan->'tags') > 0 then
    v_tags := array(select jsonb_array_elements_text(p_challan->'tags'));
  end if;

  insert into cash_challans (
    customer_id, customer_name, customer_phone, status,
    subtotal, discount_type, discount_value, discount_amount,
    shipping_charges, round_off, total, amount_paid,
    payment_mode, payment_date, notes, tags,
    created_by, is_return, source_challan_id, modified_by
  )
  values (
    (p_challan->>'customer_id')::uuid,
    p_challan->>'customer_name',
    nullif(p_challan->>'customer_phone', ''),
    v_status,
    (p_challan->>'subtotal')::numeric,
    nullif(p_challan->>'discount_type', ''),
    coalesce((p_challan->>'discount_value')::numeric, 0),
    coalesce((p_challan->>'discount_amount')::numeric, 0),
    coalesce((p_challan->>'shipping_charges')::numeric, 0),
    coalesce((p_challan->>'round_off')::numeric, 0),
    v_total,
    v_amount_paid,
    nullif(p_challan->>'payment_mode', ''),
    (nullif(p_challan->>'payment_date', ''))::date,
    nullif(p_challan->>'notes', ''),
    v_tags,
    v_actor,
    v_is_return,
    (p_challan->>'source_challan_id')::uuid,
    v_actor
  )
  returning id, challan_number into v_challan_id, v_challan_number;

  for v_item in select jsonb_array_elements(p_items)
  loop
    insert into cash_challan_items (
      challan_id, sku, description, quantity, price, total,
      discount_type, discount_value, discount_amount, sort_order
    ) values (
      v_challan_id,
      nullif(v_item->>'sku', ''),
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'total')::numeric,
      nullif(v_item->>'discount_type', ''),
      coalesce((v_item->>'discount_value')::numeric, 0),
      coalesce((v_item->>'discount_amount')::numeric, 0),
      v_i
    );
    v_i := v_i + 1;
  end loop;

  if p_payment is not null and (p_payment->>'amount')::numeric > 0 then
    insert into cash_challan_payments (
      challan_id, amount, payment_mode, payment_date, paid_by
    ) values (
      v_challan_id,
      (p_payment->>'amount')::numeric,
      coalesce(p_payment->>'payment_mode', 'Cash'),
      coalesce((p_payment->>'payment_date')::date, (now() at time zone 'Asia/Kolkata')::date),
      v_actor
    );
  end if;

  perform audit_write('cash_challan', 'CREATE', v_challan_id::text,
    case when v_is_return then 'Return' else 'Challan' end || ' #' || v_challan_number || ' created for ' || btrim(p_challan->>'customer_name') || ' — ₹' || inr_text(v_total));

  return jsonb_build_object('id', v_challan_id, 'challan_number', v_challan_number);
end;
$function$;

create or replace function public.update_challan_with_items(p_challan_id uuid, p_challan jsonb, p_items jsonb, p_payment jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_i int := 0;
  v_tags text[] := null;
  v_old cash_challans%rowtype;
  v_new_paid numeric;
  v_pay_diff numeric;
  v_is_return boolean := coalesce((p_challan->>'is_return')::boolean, false);
  v_new_status text := p_challan->>'status';
  v_new_total numeric := (p_challan->>'total')::numeric;
  v_actor uuid := coalesce(auth.uid(), (p_challan->>'modified_by')::uuid);
  v_changes jsonb := '{}'::jsonb;
  v_k text; v_from text; v_to text;
begin
  perform set_config('app.challan_rpc', 'on', true);
  perform challan_check_money(p_challan, p_items, p_challan_id);

  if p_challan->'tags' is not null and jsonb_typeof(p_challan->'tags') = 'array' and jsonb_array_length(p_challan->'tags') > 0 then
    v_tags := array(select jsonb_array_elements_text(p_challan->'tags'));
  end if;

  -- Lock the row so concurrent edits serialise their payment-diff math.
  select * into v_old from cash_challans where id = p_challan_id for update;
  if not found then
    raise exception 'Challan not found';
  end if;
  if v_old.status = 'voided' then
    raise exception 'Cannot edit a voided challan';
  end if;

  v_new_paid := coalesce((p_challan->>'amount_paid')::numeric, 0);
  v_pay_diff := v_new_paid - coalesce(v_old.amount_paid, 0);

  -- Coherence: status must match the money, and any amount_paid movement
  -- must carry a payment record so the ledger stays in sync.
  if not v_is_return then
    if v_new_status = 'paid' and v_new_paid is distinct from v_new_total then
      raise exception 'Status "paid" requires amount_paid (%) to equal total (%)', v_new_paid, v_new_total using errcode = '23514';
    elsif v_new_status = 'partial' and not (v_new_paid > 0 and v_new_paid < v_new_total) then
      raise exception 'Status "partial" requires 0 < amount_paid (%) < total (%)', v_new_paid, v_new_total using errcode = '23514';
    elsif v_new_status = 'unpaid' and v_new_paid <> 0 then
      raise exception 'Status "unpaid" requires amount_paid 0, got %', v_new_paid using errcode = '23514';
    end if;
  end if;
  if v_pay_diff <> 0 and p_payment is null then
    raise exception 'amount_paid changed by % without a payment record', v_pay_diff using errcode = '23514';
  end if;

  if v_pay_diff > 0 and p_payment is not null then
    insert into cash_challan_payments (
      challan_id, amount, payment_mode, payment_date, paid_by, is_reversal
    ) values (
      p_challan_id,
      v_pay_diff,
      coalesce(p_payment->>'payment_mode', 'Cash'),
      coalesce((p_payment->>'payment_date')::date, (now() at time zone 'Asia/Kolkata')::date),
      v_actor,
      false
    );
  elsif v_pay_diff < 0 and p_payment is not null then
    insert into cash_challan_payments (
      challan_id, amount, payment_mode, payment_date, paid_by, is_reversal, notes
    ) values (
      p_challan_id,
      abs(v_pay_diff),
      coalesce(p_payment->>'payment_mode', 'Cash'),
      (now() at time zone 'Asia/Kolkata')::date,
      v_actor,
      true,
      'Payment removed/reduced'
    );
  end if;

  delete from cash_challan_items where challan_id = p_challan_id;

  for v_item in select jsonb_array_elements(p_items)
  loop
    insert into cash_challan_items (
      challan_id, sku, description, quantity, price, total,
      discount_type, discount_value, discount_amount, sort_order
    ) values (
      p_challan_id,
      nullif(v_item->>'sku', ''),
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'total')::numeric,
      nullif(v_item->>'discount_type', ''),
      coalesce((v_item->>'discount_value')::numeric, 0),
      coalesce((v_item->>'discount_amount')::numeric, 0),
      v_i
    );
    v_i := v_i + 1;
  end loop;

  update cash_challans set
    customer_id = (p_challan->>'customer_id')::uuid,
    customer_name = p_challan->>'customer_name',
    customer_phone = nullif(p_challan->>'customer_phone', ''),
    status = p_challan->>'status',
    subtotal = (p_challan->>'subtotal')::numeric,
    discount_type = nullif(p_challan->>'discount_type', ''),
    discount_value = coalesce((p_challan->>'discount_value')::numeric, 0),
    discount_amount = coalesce((p_challan->>'discount_amount')::numeric, 0),
    shipping_charges = coalesce((p_challan->>'shipping_charges')::numeric, 0),
    round_off = coalesce((p_challan->>'round_off')::numeric, 0),
    total = (p_challan->>'total')::numeric,
    amount_paid = v_new_paid,
    payment_mode = nullif(p_challan->>'payment_mode', ''),
    payment_date = (nullif(p_challan->>'payment_date', ''))::date,
    notes = nullif(p_challan->>'notes', ''),
    tags = v_tags,
    is_return = coalesce((p_challan->>'is_return')::boolean, false),
    modified_by = v_actor,
    updated_at = now()
  where id = p_challan_id;

  -- Field-level diff, same keys the client used to log.
  foreach v_k in array array['status','amount_paid','payment_mode','payment_date','total','round_off','customer_name','shipping_charges','notes'] loop
    v_from := coalesce(to_jsonb(v_old) ->> v_k, '');
    v_to := coalesce(p_challan ->> v_k, '');
    if v_k in ('amount_paid','total','round_off','shipping_charges') then
      if abs(coalesce(nullif(v_from,'')::numeric, 0) - coalesce(nullif(v_to,'')::numeric, 0)) > 0.001 then
        v_changes := v_changes || jsonb_build_object(v_k, jsonb_build_object('from', to_jsonb(v_old) -> v_k, 'to', p_challan -> v_k));
      end if;
    elsif v_from <> v_to then
      v_changes := v_changes || jsonb_build_object(v_k, jsonb_build_object('from', to_jsonb(v_old) -> v_k, 'to', p_challan -> v_k));
    end if;
  end loop;
  perform audit_write('cash_challan', 'UPDATE', p_challan_id::text, 'Challan #' || v_old.challan_number || ' updated', nullif(v_changes, '{}'::jsonb));

  return jsonb_build_object('id', p_challan_id, 'ok', true);
end;
$function$;

drop function if exists public.pay_challan_batch(uuid[], text, date, text, text);
create or replace function public.pay_challan_batch(
  p_ids uuid[],
  p_mode text,
  p_date date,
  p_batch_id text,
  p_note text default null,
  p_refund boolean default false,
  p_extra jsonb default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_c record;
  v_outstanding numeric;
  v_ledger numeric;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to record payments'; end if;
  if coalesce(btrim(p_mode), '') = '' then raise exception 'Pick a payment mode' using errcode = '23514'; end if;
  if p_mode = 'Return Credit' then raise exception 'Return Credit is reserved for credit applications' using errcode = '23514'; end if;
  if p_date is null then raise exception 'Pick a payment date' using errcode = '23514'; end if;
  if p_date > v_today then raise exception 'Payment date cannot be in the future' using errcode = '23514'; end if;
  if coalesce(btrim(p_batch_id), '') = '' then raise exception 'Batch id is required' using errcode = '23514'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then raise exception 'Nothing to pay' using errcode = '23514'; end if;

  perform set_config('app.challan_rpc', 'on', true);

  foreach v_id in array p_ids loop
    select id, challan_number, status, is_return, total, coalesce(amount_paid, 0) as amount_paid
      into v_c from cash_challans where id = v_id for update;
    if not found then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'skipped', 'not found');
      continue;
    end if;
    if v_c.is_return then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'is a return');
      continue;
    end if;
    if v_c.status not in ('unpaid', 'partial') then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'already ' || v_c.status);
      continue;
    end if;
    v_outstanding := round(v_c.total - v_c.amount_paid, 2);
    if v_outstanding <= 0 then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'nothing outstanding');
      continue;
    end if;
    select coalesce(sum(case when is_reversal then -amount else amount end), 0) into v_ledger
      from cash_challan_payments where challan_id = v_id;
    if v_ledger is distinct from v_c.amount_paid then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'payment ledger out of sync');
      continue;
    end if;

    begin
      update cash_challans set
        status = 'paid', amount_paid = total, payment_mode = p_mode, payment_date = p_date,
        modified_by = auth.uid(), updated_at = now()
      where id = v_id;
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal)
      values (v_id, v_outstanding, p_mode, p_date, auth.uid(), nullif(p_note, ''), p_batch_id, false);
      perform audit_write('cash_challan', case when p_refund then 'SETTLE_REFUND' else 'BULK_PAY' end, v_id::text,
        case when p_refund then 'Settled against returns' else 'Bulk paid' end || ' (' || p_batch_id || ') — ₹' || inr_text(v_outstanding) || ' via ' || p_mode,
        jsonb_build_object('status', jsonb_build_object('from', v_c.status, 'to', 'paid'),
                           'amount_paid', jsonb_build_object('from', v_c.amount_paid, 'to', v_c.total)) || coalesce(p_extra, '{}'::jsonb));
      v_results := v_results || jsonb_build_object(
        'challan_id', v_id, 'challan_number', v_c.challan_number,
        'prev_status', v_c.status, 'prev_paid', v_c.amount_paid, 'paid', v_outstanding, 'total', v_c.total);
    exception when others then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', sqlerrm);
    end;
  end loop;

  return v_results;
end;
$function$;

revoke all on function public.pay_challan_batch(uuid[], text, date, text, text, boolean, jsonb) from public, anon;
grant execute on function public.pay_challan_batch(uuid[], text, date, text, text, boolean, jsonb) to authenticated;

create or replace function public.void_challan(p_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_c cash_challans%rowtype;
  v_sale cash_challans%rowtype;
  v_leg record;
  v_new_paid numeric;
  v_new_status text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_batch text := 'VD-' || upper(to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'));
  v_withdrawn jsonb := '[]'::jsonb;
  v_refund numeric := 0;
  v_trail text := '';
begin
  if auth.uid() is null then raise exception 'Sign in to void a challan'; end if;
  select * into v_c from cash_challans where id = p_id for update;
  if not found then raise exception 'Challan not found'; end if;
  if v_c.status = 'voided' then raise exception 'Already voided' using errcode = '23514'; end if;

  perform set_config('app.challan_rpc', 'on', true);

  if v_c.is_return then
    for v_leg in
      select p.challan_id, sum(case when p.is_reversal then -p.amount else p.amount end) as net
        from cash_challan_payments p
       where p.settled_against = v_c.id and p.challan_id <> v_c.id and p.payment_mode = 'Return Credit'
       group by p.challan_id
      having sum(case when p.is_reversal then -p.amount else p.amount end) > 0
    loop
      select * into v_sale from cash_challans where id = v_leg.challan_id for update;
      if not found or v_sale.status = 'voided' then continue; end if;
      v_new_paid := greatest(round(coalesce(v_sale.amount_paid, 0) - v_leg.net, 2), 0);
      v_new_status := case when v_new_paid <= 0 then 'unpaid' when v_new_paid < v_sale.total then 'partial' else 'paid' end;
      update cash_challans set
        amount_paid = v_new_paid, status = v_new_status,
        payment_mode = case when v_new_paid <= 0 then null else payment_mode end,
        payment_date = case when v_new_paid <= 0 then null else payment_date end,
        modified_by = auth.uid(), updated_at = now()
      where id = v_sale.id;
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal, settled_against)
      values (v_sale.id, v_leg.net, 'Return Credit', v_today, auth.uid(),
              'Return #' || v_c.challan_number || ' voided — its credit withdrawn', v_batch, true, v_c.id);
      perform audit_write('cash_challan', 'CREDIT_WITHDRAWN', v_sale.id::text,
        'Return #' || v_c.challan_number || ' voided — ₹' || inr_text(v_leg.net) || ' credit withdrawn from challan #' || v_sale.challan_number || ' (now ' || v_new_status || ')',
        jsonb_build_object('status', jsonb_build_object('from', v_sale.status, 'to', v_new_status),
                           'amount_paid', jsonb_build_object('from', v_sale.amount_paid, 'to', v_new_paid)));
      v_withdrawn := v_withdrawn || jsonb_build_object('challan_id', v_sale.id, 'challan_number', v_sale.challan_number, 'amount', v_leg.net, 'status', v_new_status);
      v_trail := v_trail || '; ₹' || inr_text(v_leg.net) || ' credit withdrawn from #' || v_sale.challan_number || ' (now ' || v_new_status || ')';
    end loop;

    for v_leg in
      select payment_mode, sum(case when is_reversal then -amount else amount end) as net
        from cash_challan_payments where challan_id = v_c.id
       group by payment_mode having sum(case when is_reversal then -amount else amount end) > 0
    loop
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal)
      values (v_c.id, v_leg.net, v_leg.payment_mode, v_today, auth.uid(),
              case when v_leg.payment_mode = 'Return Credit'
                   then 'Return #' || v_c.challan_number || ' voided — credit consumption reversed'
                   else 'Return #' || v_c.challan_number || ' voided — refund of ₹' || inr_text(v_leg.net) || ' received back' end,
              v_batch, true);
      if v_leg.payment_mode <> 'Return Credit' then v_refund := v_refund + v_leg.net; end if;
    end loop;
    if v_refund > 0 then v_trail := v_trail || '; refund ₹' || inr_text(v_refund) || ' reversed'; end if;

    update cash_challans set status = 'voided', amount_paid = 0, voided_by = auth.uid(), voided_at = now(),
      modified_by = auth.uid(), updated_at = now()
    where id = v_c.id;
  else
    if v_c.status = 'paid' then
      raise exception 'Cannot void a fully paid challan — unpay it first' using errcode = '23514';
    end if;
    if coalesce(v_c.amount_paid, 0) > 0 then
      raise exception 'Remove the ₹% payment on challan #% first, then void', v_c.amount_paid, v_c.challan_number using errcode = '23514';
    end if;
    update cash_challans set status = 'voided', voided_by = auth.uid(), voided_at = now(),
      modified_by = auth.uid(), updated_at = now()
    where id = v_c.id;
  end if;

  perform audit_write('cash_challan', 'VOID', v_c.id::text,
    case when v_c.is_return then 'Return' else 'Challan' end || ' #' || v_c.challan_number || ' (' || coalesce(v_c.customer_name, '') || ') voided — was ₹' || inr_text(v_c.total) || v_trail,
    jsonb_build_object('status', jsonb_build_object('from', v_c.status, 'to', 'voided')));

  return jsonb_build_object('ok', true, 'challan_number', v_c.challan_number, 'customer_name', v_c.customer_name,
    'total', v_c.total, 'is_return', v_c.is_return, 'inventory_deducted', v_c.inventory_deducted,
    'prev_status', v_c.status, 'prev_paid', coalesce(v_c.amount_paid, 0),
    'credit_withdrawn', v_withdrawn, 'refund_reversed', v_refund, 'batch', v_batch);
end;
$function$;

create or replace function public.undo_challan_batch(p_batch_id text, p_undo_batch_id text, p_user uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_pay record;
  v_challan record;
  v_remaining numeric;
  v_results jsonb := '[]'::jsonb;
  v_actor uuid := coalesce(auth.uid(), p_user);
begin
  perform set_config('app.challan_rpc', 'on', true);
  -- A batch may be undone exactly once. Without this, replaying an undo after
  -- a challan was independently re-paid would reverse it a second time.
  if exists (
    select 1 from cash_challan_payments
    where is_reversal and notes = 'Undo ' || p_batch_id
  ) then
    raise exception 'Batch % has already been undone.', p_batch_id using errcode = '23514';
  end if;
  for v_pay in
    select challan_id, amount, payment_mode
    from cash_challan_payments
    where batch_id = p_batch_id and not is_reversal
  loop
    select id, challan_number, coalesce(amount_paid, 0) as amount_paid, status
      into v_challan from cash_challans where id = v_pay.challan_id for update;
    if not found or v_challan.status <> 'paid' then
      continue; -- challan changed since the batch (voided/unpaid elsewhere): skip
    end if;
    v_remaining := greatest(round((v_challan.amount_paid - v_pay.amount)::numeric, 2), 0);
    if v_remaining > 0 then
      update cash_challans
        set status = 'partial', amount_paid = v_remaining, modified_by = v_actor, updated_at = now()
        where id = v_challan.id;
    else
      update cash_challans
        set status = 'unpaid', amount_paid = 0, payment_mode = null, payment_date = null,
            modified_by = v_actor, updated_at = now()
        where id = v_challan.id;
    end if;
    insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id)
    values (v_challan.id, v_pay.amount, v_pay.payment_mode, (now() at time zone 'Asia/Kolkata')::date, v_actor, 'Undo ' || p_batch_id, true, p_undo_batch_id);
    perform audit_write('cash_challan', 'BATCH_UNDO', v_challan.id::text,
      'Undo batch ' || p_batch_id || ' (reversal ' || p_undo_batch_id || ') — ₹' || inr_text(v_pay.amount) || ' reversed on #' || v_challan.challan_number,
      jsonb_build_object('status', jsonb_build_object('from', 'paid', 'to', case when v_remaining > 0 then 'partial' else 'unpaid' end),
                         'amount_paid', jsonb_build_object('from', v_challan.amount_paid, 'to', v_remaining)));
    v_results := v_results || jsonb_build_object(
      'challan_id', v_challan.id,
      'challan_number', v_challan.challan_number,
      'prev_paid', v_challan.amount_paid,
      'remaining', v_remaining
    );
  end loop;
  return v_results;
end;
$function$;

create or replace function public.unpay_challan_batch(p_ids uuid[], p_undo_batch_id text, p_user uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_challan record;
  v_results jsonb := '[]'::jsonb;
  v_actor uuid := coalesce(auth.uid(), p_user);
begin
  perform set_config('app.challan_rpc', 'on', true);
  foreach v_id in array p_ids loop
    select id, challan_number, coalesce(amount_paid, 0) as amount_paid, status, payment_mode
      into v_challan from cash_challans where id = v_id for update;
    if not found or v_challan.status <> 'paid' or v_challan.amount_paid <= 0 then
      continue; -- changed since selection (voided/unpaid elsewhere): skip
    end if;
    update cash_challans
      set status = 'unpaid', amount_paid = 0, payment_mode = null, payment_date = null,
          modified_by = v_actor, updated_at = now()
      where id = v_id;
    insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id)
    values (v_id, v_challan.amount_paid, coalesce(v_challan.payment_mode, 'Cash'), (now() at time zone 'Asia/Kolkata')::date, v_actor, 'Bulk unpay reversal', true, p_undo_batch_id);
    perform audit_write('cash_challan', 'BULK_UNPAY', v_id::text,
      'Bulk unpaid (' || p_undo_batch_id || ') — was ₹' || inr_text(v_challan.amount_paid) || ' on #' || v_challan.challan_number,
      jsonb_build_object('status', jsonb_build_object('from', 'paid', 'to', 'unpaid'),
                         'amount_paid', jsonb_build_object('from', v_challan.amount_paid, 'to', 0)));
    v_results := v_results || jsonb_build_object(
      'challan_id', v_challan.id,
      'challan_number', v_challan.challan_number,
      'prev_paid', v_challan.amount_paid
    );
  end loop;
  return v_results;
end;
$function$;

drop function if exists public.settle_return_refund(uuid, text);
create or replace function public.settle_return_refund(p_challan_id uuid, p_mode text default 'Cash'::text, p_batch_id text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text;
  v_active boolean;
  v_row cash_challans%rowtype;
  v_remaining numeric;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select role, is_active into v_role, v_active from profiles where id = auth.uid();
  if v_role is null or v_active is distinct from true or v_role not in ('admin','manager','operator') then
    raise exception 'Only admin/manager/operator can settle a return refund';
  end if;
  if coalesce(btrim(p_mode), '') = '' or p_mode = 'Return Credit' then
    raise exception 'Pick a refund mode' using errcode = '23514';
  end if;

  select * into v_row from cash_challans where id = p_challan_id for update;
  if not found then raise exception 'Return not found'; end if;
  if v_row.is_return is distinct from true then raise exception 'Not a return challan'; end if;
  if v_row.status = 'voided' then raise exception 'This return is voided'; end if;

  v_remaining := v_row.total - coalesce(v_row.amount_paid, 0);
  if v_remaining <= 0 then raise exception 'This return''s credit is already settled'; end if;

  perform set_config('app.challan_rpc', 'on', true);

  update cash_challans
     set amount_paid = total,
         payment_mode = p_mode,
         payment_date = v_today,
         modified_by = auth.uid(),
         updated_at = now()
   where id = p_challan_id;

  insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id)
  values (p_challan_id, v_remaining, p_mode, v_today, auth.uid(),
          'Return credit settled — refunded to customer', nullif(p_batch_id, ''));

  perform audit_write('cash_challan', 'RETURN_SETTLED', p_challan_id::text,
    'Return credit ₹' || inr_text(v_remaining) || ' consumed' || coalesce(' in batch ' || nullif(p_batch_id, ''), '') || ' via ' || p_mode,
    jsonb_build_object('amount_paid', jsonb_build_object('from', v_row.amount_paid, 'to', v_row.total)));

  return jsonb_build_object('ok', true, 'refunded', v_remaining, 'challan_number', v_row.challan_number);
end;
$function$;

revoke all on function public.settle_return_refund(uuid, text, text) from public, anon;
grant execute on function public.settle_return_refund(uuid, text, text) to authenticated;

create or replace function public.apply_return_credit(p_return_id uuid, p_challan_id uuid, p_amount numeric default null::numeric)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text; v_active boolean;
  v_ret cash_challans%rowtype; v_sale cash_challans%rowtype;
  v_credit numeric; v_outstanding numeric; v_amount numeric;
  v_batch text; v_new_paid numeric; v_sale_sum numeric; v_ret_sum numeric;
  v_ho record;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_details text;
begin
  select role, is_active into v_role, v_active from profiles where id = auth.uid();
  if v_role is null or v_active is distinct from true or v_role not in ('admin','manager','operator') then
    raise exception 'Only admin/manager/operator can apply return credit';
  end if;
  if p_return_id = p_challan_id then raise exception 'Pick two different records'; end if;

  -- Deterministic lock order avoids deadlocks between concurrent applications.
  if p_return_id < p_challan_id then
    select * into v_ret  from cash_challans where id = p_return_id  for update;
    select * into v_sale from cash_challans where id = p_challan_id for update;
  else
    select * into v_sale from cash_challans where id = p_challan_id for update;
    select * into v_ret  from cash_challans where id = p_return_id  for update;
  end if;
  if v_ret.id  is null then raise exception 'Return not found'; end if;
  if v_sale.id is null then raise exception 'Challan not found'; end if;
  if v_ret.is_return is distinct from true then raise exception 'Not a return challan'; end if;
  if v_sale.is_return then raise exception 'Credit can only be applied to a sales challan'; end if;
  if v_ret.status = 'voided' or v_sale.status = 'voided' then raise exception 'Voided challans cannot be settled'; end if;
  if v_sale.status not in ('unpaid','partial') then raise exception 'Challan #% has no pending amount', v_sale.challan_number; end if;

  -- Same customer only: the credit belongs to the return's customer.
  if not (
    (v_ret.customer_id is not null and v_ret.customer_id = v_sale.customer_id)
    or (v_ret.customer_id is null and v_sale.customer_id is null
        and btrim(lower(coalesce(v_ret.customer_name,''))) <> ''
        and btrim(lower(coalesce(v_ret.customer_name,''))) = btrim(lower(coalesce(v_sale.customer_name,''))))
  ) then
    raise exception 'Return credit can only go to the same customer''s challan';
  end if;

  v_credit := v_ret.total - coalesce(v_ret.amount_paid, 0);
  v_outstanding := v_sale.total - coalesce(v_sale.amount_paid, 0);
  if v_credit <= 0 then raise exception 'This return''s credit is already fully used'; end if;
  if v_outstanding <= 0 then raise exception 'Challan #% has no pending amount', v_sale.challan_number; end if;
  v_amount := round(coalesce(p_amount, least(v_credit, v_outstanding)), 2);
  if v_amount <= 0 or v_amount > least(v_credit, v_outstanding) then
    raise exception 'Amount exceeds the remaining credit or the pending amount';
  end if;

  -- Challan-level dates cannot split one credit across two handover periods:
  -- once part of this return's consumption is locked in a signed/pending
  -- handover, further consumption must wait (payment-level membership fixes
  -- this permanently).
  if coalesce(v_ret.amount_paid, 0) > 0 and exists (
    select 1 from cash_handovers
    where status in ('confirmed','pending')
      and coalesce(period_from, date) <= coalesce(v_ret.payment_date, v_ret.created_at::date)
      and coalesce(period_to,   date) >= coalesce(v_ret.payment_date, v_ret.created_at::date)
  ) then
    raise exception 'Part of this return was settled inside a confirmed or pending cash handover period — its remaining credit cannot be applied yet.';
  end if;

  -- Friendly, DATED guidance before the generic lock trigger can fire with
  -- its terse refusal. The credit payment is dated TODAY (IST); a confirmed
  -- or pending handover covering today seals the period, so say exactly when
  -- the credit WILL work instead of just refusing.
  select h.status as st, coalesce(h.period_from, h.date) as pf, coalesce(h.period_to, h.date) as pt
    into v_ho
    from cash_handovers h
   where h.status in ('confirmed','pending')
     and coalesce(h.period_from, h.date) <= v_today
     and coalesce(h.period_to,   h.date) >= v_today
   order by coalesce(h.period_to, h.date) desc limit 1;
  if v_ho.pt is not null then
    raise exception 'Cash for % – % was already % — the credit payment would be dated today, inside that sealed period. Apply this credit on or after %.',
      to_char(v_ho.pf, 'DD Mon'), to_char(v_ho.pt, 'DD Mon'),
      case when v_ho.st = 'confirmed' then 'counted and signed for (handover confirmed)' else 'submitted for handover (awaiting confirmation)' end,
      to_char(v_ho.pt + 1, 'DD Mon YYYY');
  end if;

  -- Old-side lock: this challan's EARLIER payment already sits inside a
  -- sealed period, so any further payment would change that period's signed
  -- totals. Waiting does not clear this one — say what actually would.
  if v_sale.status in ('paid','partial') and exists (
    select 1 from cash_handovers
    where status in ('confirmed','pending')
      and coalesce(period_from, date) <= coalesce(v_sale.payment_date, v_sale.created_at::date)
      and coalesce(period_to,   date) >= coalesce(v_sale.payment_date, v_sale.created_at::date)
  ) then
    raise exception 'Challan #%''s earlier payment was already counted in a cash handover — it cannot take more payments unless that handover is reopened by an admin.', v_sale.challan_number;
  end if;

  -- Both ledgers must reconcile BEFORE we write, so the payment-sync trigger
  -- cannot abort halfway with a confusing message.
  select coalesce(sum(case when is_reversal then -amount else amount end),0) into v_sale_sum from cash_challan_payments where challan_id = v_sale.id;
  select coalesce(sum(case when is_reversal then -amount else amount end),0) into v_ret_sum  from cash_challan_payments where challan_id = v_ret.id;
  if v_sale_sum is distinct from coalesce(v_sale.amount_paid,0) then raise exception 'Challan #% payment ledger is out of sync', v_sale.challan_number; end if;
  if v_ret_sum  is distinct from coalesce(v_ret.amount_paid,0)  then raise exception 'Return #% payment ledger is out of sync', v_ret.challan_number; end if;

  v_batch := 'RC-' || upper(to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'));
  perform set_config('app.challan_rpc', 'on', true);

  -- Leg 1: pay down the sale (challan first, then its payment row, so the
  -- sync trigger always sees a reconciled ledger).
  v_new_paid := coalesce(v_sale.amount_paid,0) + v_amount;
  update cash_challans set
    status = case when v_new_paid >= v_sale.total then 'paid' else 'partial' end,
    amount_paid = v_new_paid, payment_mode = 'Return Credit',
    payment_date = v_today, modified_by = auth.uid(), updated_at = now()
  where id = v_sale.id;
  insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, settled_against)
  values (v_sale.id, v_amount, 'Return Credit', v_today, auth.uid(),
          'Return credit from #' || v_ret.challan_number || ' applied', v_batch, v_ret.id);

  -- Leg 2: consume the return's credit (same day, so both legs land in the
  -- same handover period and net to zero).
  update cash_challans set
    amount_paid = coalesce(amount_paid,0) + v_amount, payment_mode = 'Return Credit',
    payment_date = v_today, modified_by = auth.uid(), updated_at = now()
  where id = v_ret.id;
  insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, settled_against)
  values (v_ret.id, v_amount, 'Return Credit', v_today, auth.uid(),
          'Credit applied to challan #' || v_sale.challan_number, v_batch, v_sale.id);

  v_details := 'Return credit ₹' || inr_text(v_amount) || ' from #' || v_ret.challan_number || ' applied to challan #' || v_sale.challan_number
    || ' (' || v_batch || ') — pending now ₹' || inr_text(v_sale.total - v_new_paid) || ', credit left ₹' || inr_text(v_credit - v_amount);
  perform audit_write('cash_challan', 'CREDIT_APPLIED', v_sale.id::text, v_details);
  perform audit_write('cash_challan', 'CREDIT_APPLIED', v_ret.id::text, v_details);

  return jsonb_build_object('ok', true, 'applied', v_amount, 'batch', v_batch,
    'challan_number', v_sale.challan_number, 'return_number', v_ret.challan_number,
    'challan_pending', v_sale.total - v_new_paid,
    'credit_remaining', v_credit - v_amount);
end;
$function$;
