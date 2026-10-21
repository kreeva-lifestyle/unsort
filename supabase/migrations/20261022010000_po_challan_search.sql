-- Purchase orders: challan search, from the review of 20261022000000.
--
-- * search_po_ids also matches receipt remarks: every challan number booked
--   before the challan column existed was typed into Remarks (74 of 109
--   receipts, all of them challan or bill numbers), so without this a search
--   for last week's challan finds nothing.
-- * A trigram index serves the search's `ilike '%…%'` on challan_no (the
--   pattern sku / fabric_code already use). The btree on lower(challan_no)
--   from 20261022000000 cannot serve it; dropping it needs the SQL Editor (the
--   MCP times out on a DROP), so it stays, harmless.
create index if not exists idx_po_receipts_challan_no_trgm on public.purchase_order_receipts using gin (challan_no gin_trgm_ops) where challan_no is not null;

create or replace function public.search_po_ids(q text)
 returns setof uuid
 language sql
 stable
 set search_path to 'public'
as $function$
  select po_id from purchase_order_items
  where sku ilike '%' || q || '%' or fabric_code ilike '%' || q || '%' or item_name ilike '%' || q || '%'
  union
  select po_id from purchase_order_receipts where challan_no ilike '%' || q || '%' or remarks ilike '%' || q || '%';
$function$;
