-- "Select original invoice" on a Return used to match the challan number or
-- the customer name only. Owner's ask: also match a SKU that was sold, and
-- when the operator has already typed the customer, search only that
-- customer's invoices — so typing the SKU lands straight on the invoice it
-- was sold on.
--
-- Mirrors search_po_ids: the RPC returns ids, the page fetches the rows
-- with its usual column list. SECURITY INVOKER, so RLS still applies.
-- cash_challan_items.sku already has a trigram index
-- (idx_cash_challan_items_sku_trgm) for the ilike.
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
       (btrim(p_q) ~ '^\d{1,9}$' and c.challan_number = btrim(p_q)::int)
       or c.customer_name ilike '%' || btrim(p_q) || '%'
       or exists (select 1 from cash_challan_items i where i.challan_id = c.id and i.sku ilike '%' || btrim(p_q) || '%')
     )
   order by c.created_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
$function$;
