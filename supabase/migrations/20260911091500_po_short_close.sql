-- WHY: nothing could end a purchase order that will never fully arrive. A
-- vendor delivers 47 of 50 meters and calls it finished, so the order sits
-- at partially_received for ever: it keeps ageing in red on the vendor
-- pendency report that now goes out to vendors, and it never leaves the
-- pending list. Cancelling is the wrong tool — the goods that did arrive
-- were real and their receipts must stand.
--
-- So: a sixth status, 'closed', meaning "we are not waiting for the rest".
-- It carries who closed it, when, and why (the reason is required — a
-- written-off balance without a reason is how disputes start). Reopen
-- exists because a mis-tap must not be a dead end; it recomputes the
-- status from the receipts, exactly as removing a receipt does.
-- Additive. Applied via MCP as po_short_close.

alter table public.purchase_orders drop constraint if exists chk_po_status;
alter table public.purchase_orders add constraint chk_po_status
  check (status = any (array['draft','approved','sent','partially_received','completed','closed','cancelled']));

alter table public.purchase_orders
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid,
  add column if not exists close_reason text;

comment on column public.purchase_orders.close_reason is
  'Why the undelivered balance was written off. Required when status = closed.';

-- Close the balance of an open order. Manager+ only, same gate as cancel.
create or replace function public.close_po_short(p_po_id uuid, p_reason text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_status text; v_role text; v_reason text := btrim(coalesce(p_reason,''));
begin
  perform set_config('app.po_rpc','on',true);
  select status into v_status from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_status not in ('approved','sent','partially_received') then
    raise exception 'Only an open purchase order can be closed (status: %)', v_status using errcode='23514';
  end if;
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','manager') then
    raise exception 'Only an admin or manager can close a purchase order';
  end if;
  if v_reason = '' then raise exception 'Say why the balance is being closed' using errcode='23514'; end if;
  update purchase_orders
     set status = 'closed', closed_at = now(), closed_by = auth.uid(), close_reason = v_reason,
         modified_by = auth.uid(), updated_at = now()
   where id = p_po_id;
  return jsonb_build_object('ok', true, 'status', 'closed');
end $function$;

-- set_po_status gains 'reopen': back to whatever the receipts say.
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
    if v_old not in ('approved','partially_received') then raise exception 'Only an approved purchase order can be marked as sent'; end if;
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

-- Removing a receipt recomputed the status from the tallies unconditionally,
-- which would silently reopen a closed order. A close is a decision; only
-- Reopen undoes it.
create or replace function public.delete_po_receipt(p_receipt_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_po_id uuid; v_item_id uuid; v_qty numeric; v_total int; v_full int; v_any numeric; v_new text; v_cur text;
begin
  perform set_config('app.po_rpc','on',true);
  select po_id, po_item_id, received_qty into v_po_id, v_item_id, v_qty
    from purchase_order_receipts where id = p_receipt_id for update;
  if not found then raise exception 'That receipt no longer exists'; end if;
  select status into v_cur from purchase_orders where id = v_po_id for update;
  -- reverse the item tally, then delete the receipt (same txn keeps the deferred
  -- sync trigger satisfied: SUM(receipts) == item.received_qty at commit)
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
