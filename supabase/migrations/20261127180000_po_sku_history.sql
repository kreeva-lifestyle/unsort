-- Repeat orders fill themselves (owner, 27 Nov 2026: "our database already has
-- the product details when a PO is saved … check the last PO of that SKU and
-- auto fill the same on entering the code — make it smart").
--
-- WHY a function and not "the last order's line": a design is bought as
-- several fabrics (75 designs: 31 have two or more), and when a design is
-- ordered again it is the SAME fabric only 4 times in 10 (then always from the
-- same vendor) — 6 times in 10 it is another fabric of that design. Filling
-- "the last one" blind would put the wrong fabric code on an order. So the
-- form asks for every distinct fabric ever ordered for the design, newest
-- first, and decides: one candidate = filled by itself, several = one tap.
--
-- One row per fabric (name + code, letter case ignored): its latest order
-- (number, date, quantity, unit, for how many pieces), what the fabric is for
-- (the latest that was recorded — orders before 27 Nov 2026 have none), the
-- vendor as Contacts has it today (name and phone, so the form can pick it),
-- and how many times it was ordered. Cancelled orders and cancelled lines are
-- left out: they are not something to repeat. The SKU is matched on letters
-- and digits only ("drs 230" = "DRS-230" = "DRS230": 99 spellings are stored
-- for 84 designs).
-- SECURITY INVOKER: RLS on the three tables applies. The expression index
-- keeps the look-up off a full scan as the table grows.
create index if not exists idx_po_items_sku_key
  on public.purchase_order_items ((regexp_replace(upper(coalesce(sku, '')), '[^A-Z0-9]', '', 'g')));

create or replace function public.po_sku_history(p_sku text)
returns table (
  item_name text, fabric_code text, component text, unit text,
  quantity numeric, for_pieces integer, lump_sum boolean,
  po_number integer, po_date date, po_type text,
  vendor_id uuid, vendor_name text, vendor_phone text, orders integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select i.item_name, nullif(btrim(i.fabric_code), '') as fabric_code, nullif(btrim(i.component), '') as component,
           nullif(btrim(i.unit), '') as unit, i.quantity, o.for_pieces, o.lump_sum, o.po_number, o.po_date, o.po_type,
           o.vendor_id, coalesce(v.name, o.vendor_name) as vendor_name, v.phone as vendor_phone, o.created_at, i.sort_order,
           lower(btrim(i.item_name)) || '|' || lower(coalesce(btrim(i.fabric_code), '')) as fk
    from purchase_order_items i
    join purchase_orders o on o.id = i.po_id
    left join po_vendors v on v.id = o.vendor_id
    where regexp_replace(upper(coalesce(i.sku, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(coalesce(p_sku, '')), '[^A-Z0-9]', '', 'g')
      and regexp_replace(upper(coalesce(p_sku, '')), '[^A-Z0-9]', '', 'g') <> ''
      and o.status <> 'cancelled' and i.cancelled_at is null
  ), ranked as (
    select src.*,
           row_number() over (partition by fk order by created_at desc, sort_order) as rn,
           count(*) over (partition by fk) as lines_n,
           first_value(src.component) over (partition by fk order by (src.component is null), created_at desc) as last_component
    from src
  )
  select r.item_name, r.fabric_code, r.last_component, r.unit, r.quantity, r.for_pieces, r.lump_sum,
         r.po_number, r.po_date, r.po_type, r.vendor_id, r.vendor_name, r.vendor_phone, r.lines_n::int
  from ranked r
  where r.rn = 1
  order by r.created_at desc
  limit 12;
$$;

comment on function public.po_sku_history(text) is
  'Every distinct fabric ordered before for a design (SKU matched on letters and digits), newest first, 12 at most — feeds the order form''s repeat-order autofill.';
revoke all on function public.po_sku_history(text) from public, anon;
grant execute on function public.po_sku_history(text) to authenticated, service_role;
