-- The fabric-code box on the PO form offers previously used codes as you
-- type (SuggestInput). Distinct codes, most-used first, capped — the
-- browser must not pull every purchase_order_items row to build the list.
-- SECURITY INVOKER: RLS on purchase_order_items still applies.
create or replace function public.po_fabric_codes()
 returns setof text
 language sql
 stable
 set search_path to 'public'
as $function$
  select fabric_code from purchase_order_items
  where fabric_code is not null
  group by fabric_code
  order by count(*) desc, max(created_at) desc
  limit 300;
$function$;
