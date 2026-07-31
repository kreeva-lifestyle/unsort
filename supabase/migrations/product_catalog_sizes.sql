-- product_catalog_sizes: the sizes-aware, duplicate-skipping catalog refresh.
--
-- WHY THIS FILE EXISTS NOW: product_catalog.sql's tail comment has referenced
-- this migration since PR #1003, but it was only ever applied to the live
-- database — the repo kept the OLDER function body. Anyone rebuilding from
-- supabase/migrations (fresh env, branch DB, db reset) silently downgraded
-- the function: `sizes` never populated (killing the size-chip feature), and
-- duplicate SKUs were "resolved" by guessing a winner — the exact behaviour
-- the table's own comments forbid, because a guessed row puts a wrong price
-- on a real invoice. This file makes the repo match production.
--
-- ONE ADDITION over the live version: the refresh now no-ops while any
-- master-sync tab is mid-swap. The sync writes rows THEN columns in separate
-- transactions, and `cells` is positional — a refresh landing in that ~1s
-- window when a sheet column was inserted could pair new cell positions with
-- old headers and persist a price from the wrong column. Skipping one 2-min
-- tick is free; a wrong price on a challan is not.

create or replace function public.refresh_product_catalog()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_rows int;
begin
  -- Mid-swap mirror: rows and columns may be positionally inconsistent.
  if exists (select 1 from master_sheet_sync where status = 'running') then
    return 0;
  end if;

  with cols as (
    select tab,
      max(ordinal) filter (where header_norm = 'sku')          as c_sku,
      max(ordinal) filter (where header_norm = 'stockstatus')  as c_status,
      max(ordinal) filter (where header_norm = 'catalog')      as c_catalog,
      max(ordinal) filter (where header_norm = 'category')     as c_category,
      max(ordinal) filter (where header_norm = 'title')        as c_title,
      max(ordinal) filter (where header_norm = 'size')         as c_size,
      max(ordinal) filter (where header_norm = 'priceexcgst')  as c_exc,
      max(ordinal) filter (where header_norm = 'priceinclgst') as c_inc
    from master_sheet_columns
    group by tab
  ),
  src as (
    select
      upper(btrim(r.sku))                                        as sku_norm,
      btrim(r.sku)                                               as sku,
      r.tab,
      nullif(btrim(coalesce(r.cells->>c.c_title, '')), '')       as title,
      nullif(btrim(coalesce(r.cells->>c.c_catalog, '')), '')     as catalog,
      nullif(btrim(coalesce(r.cells->>c.c_category, '')), '')    as category,
      nullif(btrim(coalesce(r.cells->>c.c_size, '')), '')        as size,
      case when btrim(coalesce(r.cells->>c.c_exc, '')) ~ '^[0-9]+(\.[0-9]+)?$'
           then btrim(r.cells->>c.c_exc)::numeric end            as price_exc_gst,
      case when btrim(coalesce(r.cells->>c.c_inc, '')) ~ '^[0-9]+(\.[0-9]+)?$'
           then btrim(r.cells->>c.c_inc)::numeric end            as price_inc_gst,
      lower(btrim(coalesce(r.cells->>c.c_status, ''))) = 'active' as is_active,
      -- Stitch types are not sizes. Letters-only comparison so SEMI-STITCHED,
      -- Semi-Stitched and "semi stitched" all collapse to the same test.
      case
        when upper(regexp_replace(coalesce(r.cells->>c.c_size, ''), '[^A-Za-z]', '', 'g'))
             in ('SEMISTITCHED', 'UNSTITCHED', 'FREESIZE', 'STANDARD')
          then '{}'::text[]
        else coalesce((
          select array_agg(upper(btrim(s)) order by ord)
          from unnest(string_to_array(coalesce(r.cells->>c.c_size, ''), ',')) with ordinality t(s, ord)
          where btrim(s) <> ''
        ), '{}'::text[])
      end                                                        as sizes
    from master_sheet_rows r
    join cols c on c.tab = r.tab
    where r.sku is not null and btrim(r.sku) <> ''
  ),
  -- Duplicate SKUs are SKIPPED, not merged. Six SKUs appear twice in the
  -- sheet; guessing which row is authoritative would put a wrong price on a
  -- real invoice, and a missing suggestion is a far cheaper failure than a
  -- confidently wrong one. They stay typeable by hand.
  deduped as (
    select * from src
    where sku_norm in (select sku_norm from src group by sku_norm having count(*) = 1)
  ),
  up as (
    insert into product_catalog
      (sku_norm, sku, tab, title, catalog, category, size, sizes,
       price_exc_gst, price_inc_gst, is_active, updated_at)
    select sku_norm, sku, tab, title, catalog, category, size, sizes,
           price_exc_gst, price_inc_gst, is_active, now()
    from deduped
    on conflict (sku_norm) do update set
      sku = excluded.sku, tab = excluded.tab, title = excluded.title,
      catalog = excluded.catalog, category = excluded.category,
      size = excluded.size, sizes = excluded.sizes,
      price_exc_gst = excluded.price_exc_gst, price_inc_gst = excluded.price_inc_gst,
      is_active = excluded.is_active, updated_at = now()
    where (product_catalog.sku, product_catalog.tab, product_catalog.title,
           product_catalog.catalog, product_catalog.category, product_catalog.size,
           product_catalog.sizes,
           product_catalog.price_exc_gst, product_catalog.price_inc_gst,
           product_catalog.is_active)
      is distinct from
          (excluded.sku, excluded.tab, excluded.title,
           excluded.catalog, excluded.category, excluded.size,
           excluded.sizes,
           excluded.price_exc_gst, excluded.price_inc_gst,
           excluded.is_active)
    returning 1
  )
  select count(*) into v_rows from up;

  -- Removes SKUs deleted from the sheet AND any that have just become
  -- duplicates. An Active/Inactive flip is still only the is_active update.
  delete from product_catalog pc
  where not exists (
    select 1 from master_sheet_rows r
    where upper(btrim(r.sku)) = pc.sku_norm and btrim(coalesce(r.sku, '')) <> ''
    group by upper(btrim(r.sku)) having count(*) = 1
  );

  return v_rows;
end;
$function$;

-- The redefine must not re-widen the ACL: pg_cron (as postgres) is the only
-- intended caller. See restrict_refresh_product_catalog_to_service_role.
revoke all on function public.refresh_product_catalog() from public, anon, authenticated;
grant execute on function public.refresh_product_catalog() to service_role;
