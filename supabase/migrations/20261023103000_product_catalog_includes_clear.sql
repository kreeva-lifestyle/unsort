-- refresh_product_catalog_includes (20261023100000): a tab that loses its
-- INCLUDES column clears its lists instead of keeping the last ones.
--
-- Why (found in review): the first version skipped tabs whose header row no
-- longer has INCLUDES, so a renamed or deleted column left every SKU on that
-- tab saying "the master sheet includes …" for pieces it no longer states —
-- while refresh_product_catalog() blanks title and price for the same tab.
-- Now a missing column parses to '{}' like any other missing cell, the job
-- form falls back to the typed box and the costing stops prefilling: a
-- visible signal, and self-healing once the header is back.
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
    where r.sku is not null and btrim(r.sku) <> ''
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
