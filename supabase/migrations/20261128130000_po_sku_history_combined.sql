-- Repeat orders: po_sku_history, after the second review of 28 Nov 2026.
--
-- WHY each change
-- 1. vendor_active: a tap on an earlier order sets the form's vendor only
--    while Contacts still has that vendor switched on. The vendor picker
--    offers only active contacts; a tap must not bring back one that was
--    switched off.
-- 2. One fabric of a vendor's range = one row, by its CODE when the code
--    holds a number, whatever name was typed with it. "micro 1573" and
--    "LINING 1573" are one fabric on two orders of one design: the name box
--    used to carry what the fabric was for. A code without a number is a
--    colour word ("Green", "Pink") that several fabrics share, so there the
--    name still counts. On the live orders this merges only that pair (and
--    the "FENDI / fendy" pairs the previous version already merged).
-- 3. A fabric on two lines of its latest order — one line per part, as
--    Raise POs from costing writes it now that "Fabric is for" is compulsory
--    — comes back as ONE row: the quantities added up and the parts joined
--    ("BLOUSE, LEHENGA"), so a repeat order does not silently miss a part.
--    Name, code and unit are the first line's.
-- The order's piece count stays null when that order carried more than one
-- design: what it counted is not known, so the form does not scale from it.
-- The return type changes (vendor_active), so the function is dropped and
-- created again; no released app calls it yet. SECURITY INVOKER: RLS applies.
drop function if exists public.po_sku_history(text);

create function public.po_sku_history(p_sku text)
returns table (
  item_name text, fabric_code text, component text, unit text,
  quantity numeric, for_pieces integer, lump_sum boolean,
  po_number integer, po_date date, po_type text,
  vendor_id uuid, vendor_name text, vendor_phone text, vendor_active boolean, orders integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select i.item_name, nullif(btrim(i.fabric_code), '') as fabric_code, nullif(btrim(i.component), '') as component,
           nullif(btrim(i.unit), '') as unit, i.quantity, i.sort_order,
           case when (select count(distinct regexp_replace(upper(coalesce(x.sku, '')), '[^A-Z0-9]', '', 'g'))
                      from purchase_order_items x where x.po_id = o.id and x.cancelled_at is null) = 1
                then o.for_pieces end as for_pieces,
           o.lump_sum, o.po_number, o.po_date, o.po_type, o.created_at, o.id as po_id,
           o.vendor_id, coalesce(v.name, o.vendor_name) as vendor_name, v.phone as vendor_phone,
           coalesce(v.is_active, true) as vendor_active,
           coalesce(o.vendor_id::text, 'n:' || regexp_replace(lower(coalesce(o.vendor_name, '')), '[^a-z0-9]', '', 'g'))
             || '|' || lower(coalesce(btrim(i.fabric_code), ''))
             || '|' || case when coalesce(i.fabric_code, '') ~ '[0-9]' then '' else lower(btrim(i.item_name)) end as fk
    from purchase_order_items i
    join purchase_orders o on o.id = i.po_id
    left join po_vendors v on v.id = o.vendor_id
    where regexp_replace(upper(coalesce(i.sku, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(coalesce(p_sku, '')), '[^A-Z0-9]', '', 'g')
      and regexp_replace(upper(coalesce(p_sku, '')), '[^A-Z0-9]', '', 'g') <> ''
      and o.status <> 'cancelled' and i.cancelled_at is null
  ), per_order as (
    -- one row per fabric and order: the first line's name, code and unit, the quantities added up, the parts joined
    select fk, po_id, created_at, po_number, po_date, po_type, for_pieces, lump_sum,
           vendor_id, vendor_name, vendor_phone, vendor_active,
           (array_agg(item_name order by sort_order))[1] as item_name,
           (array_agg(fabric_code order by sort_order))[1] as fabric_code,
           (array_agg(unit order by sort_order))[1] as unit,
           sum(quantity) as quantity,
           string_agg(distinct component, ', ') as component,
           min(sort_order) as first_sort
    from src
    group by fk, po_id, created_at, po_number, po_date, po_type, for_pieces, lump_sum,
             vendor_id, vendor_name, vendor_phone, vendor_active
  ), ranked as (
    select p.*, row_number() over (partition by fk order by created_at desc, po_id) as rn,
           count(*) over (partition by fk) as orders_n
    from per_order p
  )
  select r.item_name, r.fabric_code, r.component, r.unit, r.quantity, r.for_pieces, r.lump_sum,
         r.po_number, r.po_date, r.po_type, r.vendor_id, r.vendor_name, r.vendor_phone, r.vendor_active, r.orders_n::int
  from ranked r
  where r.rn = 1
  order by r.created_at desc, r.po_id, r.first_sort
  limit 12;
$$;

comment on function public.po_sku_history(text) is
  'Every fabric ordered before for a design (SKU matched on letters and digits), one row per vendor and fabric as on its latest order (its lines there added up), newest first, 12 at most — the order form offers them for one tap each.';
revoke all on function public.po_sku_history(text) from public, anon;
grant execute on function public.po_sku_history(text) to authenticated, service_role;
