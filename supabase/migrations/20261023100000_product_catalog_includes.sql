-- Product catalog: the master sheet's INCLUDES, parsed into a list of
-- components per SKU (owner, 2026-10-23: "component" in the app IS the
-- sheet's INCLUDES — "1 LEHENGA, 1 BLOUSE, 1 DUPATTA" = LEHENGA · BLOUSE ·
-- DUPATTA — and the server's copy of the sheet is the source, never a live
-- read).
--
-- Why here: product_catalog is the mirror-derived table every SKU box
-- already loads (useProductCatalog, cached on the device), so the job form
-- and the costing sheet get a design's components with no extra read. The
-- mirror itself (master_sheet_rows) is admin/manager-only, which a jobwork
-- operator is not.
--
-- Why its own function: refresh_product_catalog() owns the rows and stays as
-- it is; refresh_product_catalog_includes() only fills the new column from
-- the mirror, bumping updated_at where a list changed so the device cache's
-- fingerprint moves. The catalog cron runs the two back to back, so a SKU
-- new to the sheet gets its pieces in the same tick. Same mid-swap guard as
-- the main refresh; duplicate SKUs are left alone as there. Pieces are
-- split on comma, +, &, / or "and"; a leading count ("1 ", "2 x ") is
-- dropped; stored upper-case in sheet order.

alter table public.product_catalog add column if not exists includes text[] not null default '{}';

create or replace function public.refresh_product_catalog_includes()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_rows int;
begin
  if exists (select 1 from master_sheet_sync where status = 'running') then return 0; end if;
  with cols as (
    select tab, max(ordinal) filter (where header_norm = 'includes') as c_inc from master_sheet_columns group by tab
  ),
  src as (
    select upper(btrim(r.sku)) as sku_norm,
      coalesce((
        select array_agg(upper(btrim(regexp_replace(s, '^\s*\d+\s*[xX×]?\s*', ''))) order by ord)
        from unnest(regexp_split_to_array(coalesce(r.cells->>c.c_inc, ''), '\s*(?:,|\+|&|/|\yand\y)\s*', 'i')) with ordinality t(s, ord)
        where btrim(regexp_replace(s, '^\s*\d+\s*[xX×]?\s*', '')) <> ''
      ), '{}'::text[]) as includes
    from master_sheet_rows r join cols c on c.tab = r.tab
    where c.c_inc is not null and r.sku is not null and btrim(r.sku) <> ''
  ),
  one as (select * from src where sku_norm in (select sku_norm from src group by sku_norm having count(*) = 1)),
  up as (
    update product_catalog pc set includes = o.includes, updated_at = now()
    from one o where o.sku_norm = pc.sku_norm and pc.includes is distinct from o.includes
    returning 1
  )
  select count(*) into v_rows from up;
  return v_rows;
end;
$function$;

revoke execute on function public.refresh_product_catalog_includes() from public, anon, authenticated;

-- The catalog cron (product-catalog-refresh, every 2 min) runs both refreshes back to back.
select cron.alter_job((select jobid from cron.job where jobname = 'product-catalog-refresh'),
  command := 'select public.refresh_product_catalog(); select public.refresh_product_catalog_includes();');

-- First fill now, not on the next tick.
select public.refresh_product_catalog_includes();
