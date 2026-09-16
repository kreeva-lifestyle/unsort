-- The detail sheet's "Edit SKU (admin)" was an admin-only BUTTON over a plain
-- UPDATE of cash_challan_items: RLS lets any operator run that update, and
-- protect_challan_items_immutability explicitly allowed a SKU change on a
-- paid challan, so the admin gate lived only in the browser. The notes edit
-- was a direct UPDATE followed by a separate, best-effort audit insert.
--
-- update_challan_item_sku(p_item_id, p_sku): admin only (checked here, not
-- in the UI), refuses voided challans, changes the SKU and writes the
-- SKU_EDIT audit row in the same transaction. The items trigger no longer
-- allows any change to a paid/voided challan's items outside an RPC.
-- update_challan_notes(p_id, p_notes): notes + NOTES_EDIT audit row in one
-- transaction (RLS decides who may edit: operator and above).

create or replace function public.protect_challan_items_immutability()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_challan_id uuid := coalesce(new.challan_id, old.challan_id);
  v_status text;
begin
  if current_setting('app.challan_rpc', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select status into v_status from cash_challans where id = v_challan_id;
  if v_status is null or v_status not in ('paid', 'voided') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Line items of a % challan cannot be modified — this is a financial record. Unpay or void through the app first.',
    v_status using errcode = '23514';
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
  perform audit_write('cash_challan', 'SKU_EDIT', v_challan.id::text,
    'SKU changed: ' || coalesce(v_item.sku, '—') || ' → ' || v_sku || ' (challan #' || v_challan.challan_number || ')',
    jsonb_build_object('sku', jsonb_build_object('from', v_item.sku, 'to', v_sku)));
  return jsonb_build_object('ok', true, 'sku', v_sku, 'challan_number', v_challan.challan_number);
end;
$function$;

revoke all on function public.update_challan_item_sku(uuid, text) from public, anon;
grant execute on function public.update_challan_item_sku(uuid, text) to authenticated;

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
  update cash_challans set notes = v_new, updated_at = now() where id = p_id;
  perform audit_write('cash_challan', 'NOTES_EDIT', p_id::text,
    'Notes ' || case when v_new is null then 'removed' else 'updated' end || ' on challan #' || v_c.challan_number,
    jsonb_build_object('notes', jsonb_build_object('from', v_c.notes, 'to', v_new)));
  return jsonb_build_object('ok', true, 'notes', v_new);
end;
$function$;

revoke all on function public.update_challan_notes(uuid, text) from public, anon;
grant execute on function public.update_challan_notes(uuid, text) to authenticated;
