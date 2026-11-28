-- Repeat orders: po_sku_history, as the review of 28 Nov 2026 corrected it
-- (the first version, 20261127180000, was never called by a released app).
--
-- WHY each change
-- 1. One row per fabric PER VENDOR. The first version kept only the latest
--    vendor of a fabric, so a vendor who supplied it earlier was told "never
--    supplied this design". An order raised on a typed name (no contact
--    record) is grouped by that name on letters and digits only, so
--    "L.K fab" and "lk fab" are one vendor — the form matches them the same
--    way once the vendor is in Contacts.
-- 2. One fabric under two spellings is one row. Live cases: the same vendor,
--    design and code as "FENDI 965" and "fendy 965". When the fabric code
--    holds a number, the code plus the first three letters of the name
--    decide; a code without a number is a colour word ("Green", "Pink") that
--    repeats across fabrics, so there the whole name still counts.
-- 3. "For how many pieces" is the ORDER's count. On an order that carries
--    more than one design it says nothing about one of them, so it comes back
--    null there and the form does not scale a quantity from it.
-- 4. Everything on a row now comes from ONE line — the first line of the
--    fabric's latest order — including what the fabric is for. The first
--    version could take the part from another line when two lines shared a
--    moment.
-- The form shows these rows for one tap each; it never types one in by
-- itself (replayed on the real orders, a design's single earlier fabric was
-- the fabric ordered next only 12 times in 22).
-- Same signature, so the grants stand. SECURITY INVOKER: RLS applies.
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
           nullif(btrim(i.unit), '') as unit, i.quantity,
           case when (select count(distinct regexp_replace(upper(coalesce(x.sku, '')), '[^A-Z0-9]', '', 'g'))
                      from purchase_order_items x where x.po_id = o.id and x.cancelled_at is null) = 1
                then o.for_pieces end as for_pieces,
           o.lump_sum, o.po_number, o.po_date, o.po_type,
           o.vendor_id, coalesce(v.name, o.vendor_name) as vendor_name, v.phone as vendor_phone,
           o.created_at, o.id as po_id, i.sort_order,
           coalesce(o.vendor_id::text, 'n:' || regexp_replace(lower(coalesce(o.vendor_name, '')), '[^a-z0-9]', '', 'g'))
             || '|' || lower(coalesce(btrim(i.fabric_code), ''))
             || '|' || case when coalesce(i.fabric_code, '') ~ '[0-9]'
                            then left(regexp_replace(lower(i.item_name), '[^a-z0-9]', '', 'g'), 3)
                            else lower(btrim(i.item_name)) end as fk
    from purchase_order_items i
    join purchase_orders o on o.id = i.po_id
    left join po_vendors v on v.id = o.vendor_id
    where regexp_replace(upper(coalesce(i.sku, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(coalesce(p_sku, '')), '[^A-Z0-9]', '', 'g')
      and regexp_replace(upper(coalesce(p_sku, '')), '[^A-Z0-9]', '', 'g') <> ''
      and o.status <> 'cancelled' and i.cancelled_at is null
  ), ranked as (
    select src.*,
           row_number() over (partition by fk order by created_at desc, po_id, sort_order) as rn,
           -- on the newest order's row this is how many orders carried the fabric
           dense_rank() over (partition by fk order by created_at, po_id) as orders_n
    from src
  )
  select r.item_name, r.fabric_code, r.component, r.unit, r.quantity, r.for_pieces, r.lump_sum,
         r.po_number, r.po_date, r.po_type, r.vendor_id, r.vendor_name, r.vendor_phone, r.orders_n::int
  from ranked r
  where r.rn = 1
  order by r.created_at desc, r.po_id, r.sort_order
  limit 12;
$$;

comment on function public.po_sku_history(text) is
  'Every fabric ordered before for a design (SKU matched on letters and digits), one row per vendor and fabric as on its latest order, newest first, 12 at most — the order form offers them for one tap each.';
