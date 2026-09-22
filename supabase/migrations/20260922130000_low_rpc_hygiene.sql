-- Audit Low fixes L2, L3, L5, L12 (post-deploy audit 21 Sep 2026).
--
-- L2  search_return_source_ids relied on AND short-circuit to keep the
--     ::int cast from running on a non-numeric term. SQL does not promise
--     evaluation order; a CASE makes the cast conditional for real.
-- L3  Fourteen RPCs added since the grants hygiene of #1196 still carried
--     the default PUBLIC/anon execute. RLS returned nothing to anon today,
--     but the standard is explicit: authenticated only.
-- L5  update_challan_notes / update_challan_item_sku changed the challan
--     without stamping modified_by, so "last edited by" lied after a notes
--     or SKU edit. Both now stamp the header (the SKU edit stamps its
--     parent challan) and run under the challan RPC flag like the rest.
-- L12 delete_po_receipt sent a PO back to 'approved' when its last receipt
--     was removed even if it had been marked SENT before receiving; the
--     audit trail knows (action SENT), so the status is restored from it.

-- L2 ───────────────────────────────────────────────────────────────────────
create or replace function public.search_return_source_ids(
  p_q text, p_customer_id uuid default null, p_customer_name text default null, p_limit int default 10)
 returns setof uuid
 language sql
 stable
 set search_path to 'public'
as $function$
  select c.id
    from cash_challans c
   where c.is_return = false and c.status <> 'voided'
     and (p_customer_id is null or c.customer_id = p_customer_id)
     and (p_customer_id is not null or coalesce(btrim(p_customer_name), '') = ''
          or c.customer_name ilike '%' || btrim(p_customer_name) || '%')
     and (
       c.challan_number = (case when btrim(p_q) ~ '^\d{1,9}$' then btrim(p_q)::int end)
       or c.customer_name ilike '%' || btrim(p_q) || '%'
       or exists (select 1 from cash_challan_items i where i.challan_id = c.id and i.sku ilike '%' || btrim(p_q) || '%')
     )
   order by c.created_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
$function$;

-- L5 ───────────────────────────────────────────────────────────────────────
create or replace function public.update_challan_notes(p_id uuid, p_notes text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_c cash_challans%rowtype; v_new text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in to edit notes'; end if;
  select * into v_c from cash_challans where id = p_id for update;
  if not found then raise exception 'Challan not found'; end if;
  if v_c.status = 'voided' then raise exception 'Voided challans cannot be modified' using errcode = '23514'; end if;
  if v_c.notes is not distinct from v_new then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  perform set_config('app.challan_rpc', 'on', true);
  update cash_challans set notes = v_new, modified_by = auth.uid(), updated_at = now() where id = p_id;
  perform audit_write('cash_challan', 'NOTES_EDIT', p_id::text,
    'Notes ' || case when v_new is null then 'removed' else 'updated' end || ' on challan #' || v_c.challan_number,
    jsonb_build_object('notes', jsonb_build_object('from', v_c.notes, 'to', v_new)));
  return jsonb_build_object('ok', true, 'notes', v_new);
end;
$function$;

create or replace function public.update_challan_item_sku(p_item_id uuid, p_sku text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_role text; v_active boolean; v_item cash_challan_items%rowtype; v_challan cash_challans%rowtype; v_sku text := btrim(coalesce(p_sku, ''));
begin
  select role, is_active into v_role, v_active from profiles where id = auth.uid();
  if v_role is distinct from 'admin' or v_active is distinct from true then
    raise exception 'Only an admin can change a SKU on a saved challan' using errcode = '42501';
  end if;
  if v_sku = '' then raise exception 'SKU cannot be empty' using errcode = '23514'; end if;
  select * into v_item from cash_challan_items where id = p_item_id for update;
  if not found then raise exception 'That line item no longer exists'; end if;
  select * into v_challan from cash_challans where id = v_item.challan_id for update;
  if v_challan.status = 'voided' then raise exception 'Voided challans cannot be modified' using errcode = '23514'; end if;
  if v_item.sku is not distinct from v_sku then
    return jsonb_build_object('ok', true, 'sku', v_sku, 'unchanged', true);
  end if;
  perform set_config('app.challan_rpc', 'on', true);
  update cash_challan_items set sku = v_sku where id = p_item_id;
  update cash_challans set modified_by = auth.uid(), updated_at = now() where id = v_challan.id;
  perform audit_write('cash_challan', 'SKU_EDIT', v_challan.id::text,
    'SKU changed: ' || coalesce(v_item.sku, '—') || ' → ' || v_sku || ' (challan #' || v_challan.challan_number || ')',
    jsonb_build_object('sku', jsonb_build_object('from', v_item.sku, 'to', v_sku)));
  return jsonb_build_object('ok', true, 'sku', v_sku, 'challan_number', v_challan.challan_number);
end;
$function$;

-- L12 ──────────────────────────────────────────────────────────────────────
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
  -- Nothing received any more: back to where the order stood before the
  -- first receipt — 'sent' if it was ever marked sent, else 'approved'.
  v_new := case when v_cur = 'closed' then 'closed'
                when v_full = v_total then 'completed'
                when v_any > 0 then 'partially_received'
                when exists (select 1 from audit_log a where a.module = 'purchase_order' and a.record_id = v_po_id::text and a.action = 'SENT') then 'sent'
                else 'approved' end;
  update purchase_orders set status = v_new, modified_by = auth.uid(), updated_at = now() where id = v_po_id;
  perform audit_write('purchase_order', 'RECEIPT_REMOVED', v_po_id::text,
    'PO #' || v_num || ' — removed receipt of +' || inr_text(v_qty) || coalesce(' (' || v_item_name || ')', ''));
  return jsonb_build_object('ok', true, 'status', v_new);
end $function$;

-- L3 ───────────────────────────────────────────────────────────────────────
revoke all on function public.create_challan_with_items(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_challan_with_items(jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.update_challan_with_items(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.update_challan_with_items(uuid, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.undo_challan_batch(text, text, uuid) from public, anon;
grant execute on function public.undo_challan_batch(text, text, uuid) to authenticated;
revoke all on function public.unpay_challan_batch(uuid[], text, uuid) from public, anon;
grant execute on function public.unpay_challan_batch(uuid[], text, uuid) to authenticated;
revoke all on function public.create_po_with_items(jsonb, jsonb) from public, anon;
grant execute on function public.create_po_with_items(jsonb, jsonb) to authenticated;
revoke all on function public.update_po_with_items(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_po_with_items(uuid, jsonb, jsonb) to authenticated;
revoke all on function public.set_po_status(uuid, text) from public, anon;
grant execute on function public.set_po_status(uuid, text) to authenticated;
revoke all on function public.receive_po_items(uuid, jsonb) from public, anon;
grant execute on function public.receive_po_items(uuid, jsonb) to authenticated;
revoke all on function public.delete_po_receipt(uuid) from public, anon;
grant execute on function public.delete_po_receipt(uuid) to authenticated;
revoke all on function public.close_po_short(uuid, text) from public, anon;
grant execute on function public.close_po_short(uuid, text) to authenticated;
revoke all on function public.search_po_ids(text) from public, anon;
grant execute on function public.search_po_ids(text) to authenticated;
revoke all on function public.po_fabric_codes() from public, anon;
grant execute on function public.po_fabric_codes() to authenticated;
revoke all on function public.po_recent_item_names(text, integer) from public, anon;
grant execute on function public.po_recent_item_names(text, integer) to authenticated;
revoke all on function public.search_return_source_ids(text, uuid, text, integer) from public, anon;
grant execute on function public.search_return_source_ids(text, uuid, text, integer) to authenticated;
