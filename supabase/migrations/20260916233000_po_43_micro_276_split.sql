-- One fabric item the 20260916203000 split skipped: PO #43's "micro 276"
-- has its code after a space, not a "-" / ":". Surfaced by the new
-- item-name chips (it showed as its own chip beside "Micro"). Same split,
-- same audit row, by item name rather than by id so the file replays.
do $$
declare r record;
begin
  perform set_config('app.po_rpc', 'on', true);
  for r in
    select i.id, i.item_name, i.po_id, po.po_number
      from purchase_order_items i join purchase_orders po on po.id = i.po_id
     where po.po_type = 'fabric' and i.fabric_code is null and lower(btrim(i.item_name)) = 'micro 276'
  loop
    update purchase_order_items set item_name = 'Micro', fabric_code = '276' where id = r.id;
    insert into audit_log (module, action, record_id, details, user_email, changes)
    values ('purchase_order', 'UPDATE', r.po_id::text,
      'PO #' || r.po_number || ' — fabric code split from item name: "' || r.item_name || '" → "Micro" + "276"',
      'migration',
      jsonb_build_object('item_name', jsonb_build_object('from', r.item_name, 'to', 'Micro'), 'fabric_code', jsonb_build_object('from', null, 'to', '276')));
  end loop;
end $$;
