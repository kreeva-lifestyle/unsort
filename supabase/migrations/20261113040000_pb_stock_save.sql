-- Playbook: a stock change is saved and its listings marked in ONE call, and
-- "on sale on Shopify" means the same thing everywhere.
--
-- WHY (independent review of the pre-launch fixes, 2026-11-13):
-- 1. A stock change was saved in one call and its listings were marked in a
--    second one. If the second failed, the change was never sent: asking again
--    found the product already changed and did nothing, and a vendor's notice
--    read again took the "already out of stock" path. pb_stock_save does both
--    in one transaction (the project's rule for writes to more than one table).
-- 2. Which listings are marked: every listing that is ON SALE on Shopify. It
--    has a Shopify product that was not hidden (Remove from site → DRAFT) or
--    archived there. The Playbook status does not decide this: a listing set
--    aside while its product was archived is still on the store, and an
--    archived product's listings stay live until staff remove them. Before,
--    such listings were skipped, so a "sold out" could stay on sale.
-- 3. pb_stock_candidates left archived products out, so a vendor's stock
--    notice skipped a product that was archived in Playbook yet still on a
--    store. It now returns an archived product while one of its listings is
--    on sale.
--
-- Additive: one new function, one function replaced with the same signature
-- and columns. SECURITY INVOKER: the caller's row policies apply (the server
-- calls with the service role; a signed-in staff member can do no more than
-- their own policies allow).

-- p_change holds only the fields to change: in_stock (boolean), temp_out_at,
-- perm_out_at (a timestamp, or null to clear). Returns how many listings now
-- owe their store the stock, or -1 when the product does not exist.
create or replace function public.pb_stock_save(p_product uuid, p_change jsonb)
returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update pb_products p set
    in_stock    = case when p_change ? 'in_stock'    then coalesce((p_change ->> 'in_stock')::boolean, p.in_stock) else p.in_stock end,
    temp_out_at = case when p_change ? 'temp_out_at' then (p_change ->> 'temp_out_at')::timestamptz else p.temp_out_at end,
    perm_out_at = case when p_change ? 'perm_out_at' then (p_change ->> 'perm_out_at')::timestamptz else p.perm_out_at end
  where p.id = p_product;
  if not found then return -1; end if;
  update pb_listings l set stock_due = true, stock_tried_at = null
  where l.product_id = p_product and l.shopify_product_id is not null
    and not (l.status = 'skipped' and coalesce(l.shopify_status, '') in ('DRAFT', 'ARCHIVED'));
  get diagnostics n = row_count;
  return n;
end $$;
comment on function public.pb_stock_save(uuid, jsonb) is 'Save a product''s stock and mark its listings on sale on Shopify as owing their store the change, in one transaction (pb-products stock.ts).';
grant execute on function public.pb_stock_save(uuid, jsonb) to authenticated, service_role;

create or replace function public.pb_stock_candidates(p_vendor uuid, p_code text)
returns table (id uuid, name text, sku text, color text, in_stock boolean, status text,
               code_key text, colour_keys text[], same_vendor boolean, notice_key text)
language sql stable security invoker set search_path = '' as $$
  with n as (select public.pb_code_key(p_code) as k, public.pb_code_num(p_code) as num)
  select p.id, p.name, p.sku, p.color, p.in_stock, p.status,
         public.pb_code_key(p.sku), public.pb_colour_keys(p.sku, p.color),
         (p_vendor is not null and p.vendor_id = p_vendor), n.k
  from n
  join public.pb_products p
    on n.num <> ''
   and (p.status <> 'archived' or exists (
         select 1 from public.pb_listings l
         where l.product_id = p.id and l.shopify_product_id is not null
           and not (l.status = 'skipped' and coalesce(l.shopify_status, '') in ('DRAFT', 'ARCHIVED'))))
   and ((p_vendor is not null and p.vendor_id = p_vendor and public.pb_code_num(p.sku) = n.num)
     or (n.k ~ '^[A-Z]{2,}' and public.pb_code_key(p.sku) = n.k))
  order by p.created_at
  limit 200
$$;
comment on function public.pb_stock_candidates(uuid, text) is 'The products a vendor''s stock-out notice can mean for one design code (pb-products stockNotice.ts): not archived, or archived with a listing still on sale. Reads only.';
