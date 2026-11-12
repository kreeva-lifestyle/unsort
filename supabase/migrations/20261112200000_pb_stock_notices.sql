-- Playbook: which products does a vendor's "stock out" notice mean? (owner,
-- 2026-11-12: "these are the out of stock example … let make a solution").
-- WHY: vendors announce sold-out designs as a picture with the design code
-- written on it ("Permanent stock Out D no 5081", "KB:-273 WINE", "D-7182
-- white, black, maroon"). The AI reader reads the codes and colours off the
-- picture (pb-products reader / stockNotice.ts); this function finds the
-- products they can mean, with the SAME code and colour rules the "already
-- added?" check uses (pb_code_key / pb_code_num / pb_colour_keys), so a code is
-- understood one way everywhere:
--   * the vendor's own products with the same design NUMBER ("D no 5081",
--     "D-5081" and "5081" are one design at one vendor);
--   * for a code with real letters ("KB 273"), also the same code at another
--     vendor: shown to a person, never acted on (same_vendor = false).
-- It only reads; what is marked out of stock is decided in stockNotice.ts.
-- Additive: one function. SECURITY INVOKER, so the caller's row policy on
-- pb_products applies (staff only; the worker calls it with the service role).
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
    on p.status <> 'archived' and n.num <> ''
   and ((p_vendor is not null and p.vendor_id = p_vendor and public.pb_code_num(p.sku) = n.num)
     or (n.k ~ '^[A-Z]{2,}' and public.pb_code_key(p.sku) = n.k))
  order by p.created_at
  limit 200
$$;
comment on function public.pb_stock_candidates(uuid, text) is 'The products a vendor''s stock-out notice can mean for one design code (pb-products stockNotice.ts). Reads only.';
