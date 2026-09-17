-- Owner's asks on the PO form's item name:
--   1. Chips of the last 5 item names (one tap fills the box), scoped to the
--      PO type when one is chosen. Names are deduped case-insensitively so
--      "micro" / "Micro" / "MICRO" never show as three chips — the most
--      recent spelling wins.
--   2. "Combine all micro to Micro": 35 items were typed as micro (21),
--      Micro (7) and MICRO (7). One spelling from now on, each change
--      audited on its PO like the fabric-code split was.

create or replace function public.po_recent_item_names(p_type text default null, p_limit int default 5)
 returns setof text
 language sql
 stable
 set search_path to 'public'
as $function$
  select item_name from (
    select distinct on (lower(btrim(i.item_name))) btrim(i.item_name) as item_name, i.created_at
      from purchase_order_items i join purchase_orders po on po.id = i.po_id
     where (p_type is null or po.po_type = p_type) and btrim(coalesce(i.item_name, '')) <> ''
     order by lower(btrim(i.item_name)), i.created_at desc
  ) s
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$function$;

do $$
declare r record;
begin
  perform set_config('app.po_rpc', 'on', true);
  for r in
    select i.id, i.item_name, i.po_id, po.po_number
      from purchase_order_items i join purchase_orders po on po.id = i.po_id
     where lower(btrim(i.item_name)) = 'micro' and i.item_name <> 'Micro'
  loop
    update purchase_order_items set item_name = 'Micro' where id = r.id;
    insert into audit_log (module, action, record_id, details, user_email, changes)
    values ('purchase_order', 'UPDATE', r.po_id::text,
      'PO #' || r.po_number || ' — item name spelling combined: "' || r.item_name || '" → "Micro"',
      'migration',
      jsonb_build_object('item_name', jsonb_build_object('from', r.item_name, 'to', 'Micro')));
  end loop;
end $$;
