-- Product catalog — the SKU autosuggest source, derived from the master sheet
-- mirror. A narrow projection of master_sheet_rows: seven fields a billing
-- screen needs, rather than the whole master.
--
-- WHY a separate table instead of querying master_sheet_rows directly:
--   1. master_sheet_rows is admin/manager only. Cash Challan is operator-
--      writable, so an operator could bill but see no suggestions.
--   2. It carries every column of the sheet. Autosuggest needs seven.
--
-- Inactive products ARE stored, carrying is_active=false, so a discontinued
-- design can still be billed with the right price — the owner sells leftover
-- stock. A status flip is then one boolean update rather than a delete and
-- re-insert, so the row survives and flipping back needs no re-import.

create table if not exists product_catalog (
  sku_norm      text primary key,        -- upper(trim(sku)); the lookup key
  sku           text not null,           -- as written in the sheet
  tab           text not null,           -- ARYA | DRESSTIVE
  title         text,
  catalog       text,
  category      text,
  size          text,
  price_exc_gst numeric(12,2),
  price_inc_gst numeric(12,2),
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- Prefix search ("710" -> 7101, 7102...). text_pattern_ops is required: the
-- default opclass will not serve LIKE 'x%' under a non-C collation.
create index if not exists pc_sku_prefix on product_catalog (sku_norm text_pattern_ops);
create index if not exists pc_active     on product_catalog (is_active) where is_active;
create index if not exists pc_title_trgm on product_catalog using gin (title gin_trgm_ops);

alter table product_catalog enable row level security;

-- Deliberately wider than master_sheet_rows (admin/manager): billing needs it.
-- Only the seven suggestion fields are exposed, never the full master row.
-- No write policy — refresh_product_catalog() is the only writer.
drop policy if exists pc_read on product_catalog;
create policy pc_read on product_catalog for select to authenticated using (true);

comment on table product_catalog is
  'SKU autosuggest source, rebuilt from master_sheet_rows by refresh_product_catalog(). Inactive rows are kept with is_active=false so discontinued stock can still be billed at the right price.';

-- ---------------------------------------------------------------------------
-- Rebuild from the master sheet mirror.
--
-- Columns are resolved BY HEADER NAME from master_sheet_columns, never by
-- hardcoded ordinal. The owner adds and reorders sheet columns freely; a
-- literal cells->>20 would silently start reading the wrong column the day a
-- column is inserted, and prices would be wrong with nothing to notice it.
--
-- Write discipline matches the mirror's: a refresh over unchanged data writes
-- ZERO rows. Without the IS DISTINCT FROM guard, ON CONFLICT DO UPDATE would
-- rewrite all 1,276 rows every 2 minutes, churning updated_at and bloating the
-- table for nothing. The return value is the count of rows ACTUALLY changed,
-- so a quiet poll reports 0.
create or replace function public.refresh_product_catalog()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_rows int;
begin
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
      -- Guarded cast: every cell is a clean number today, but a stray currency
      -- symbol or comma typed into the sheet must yield NULL for that one SKU,
      -- not abort the entire refresh.
      case when btrim(coalesce(r.cells->>c.c_exc, '')) ~ '^[0-9]+(\.[0-9]+)?$'
           then btrim(r.cells->>c.c_exc)::numeric end            as price_exc_gst,
      case when btrim(coalesce(r.cells->>c.c_inc, '')) ~ '^[0-9]+(\.[0-9]+)?$'
           then btrim(r.cells->>c.c_inc)::numeric end            as price_inc_gst,
      lower(btrim(coalesce(r.cells->>c.c_status, ''))) = 'active' as is_active,
      r.row_num
    from master_sheet_rows r
    join cols c on c.tab = r.tab
    where r.sku is not null and btrim(r.sku) <> ''
  ),
  -- One suggestion per SKU. The sheet holds six duplicate SKUs; prefer the
  -- Active row, then the later sheet row — a decision, not an accident of
  -- which one happened to sort first.
  ranked as (
    select *, row_number() over (
      partition by sku_norm order by is_active desc, row_num desc
    ) as rn
    from src
  ),
  up as (
    insert into product_catalog
      (sku_norm, sku, tab, title, catalog, category, size,
       price_exc_gst, price_inc_gst, is_active, updated_at)
    select sku_norm, sku, tab, title, catalog, category, size,
           price_exc_gst, price_inc_gst, is_active, now()
    from ranked where rn = 1
    on conflict (sku_norm) do update set
      sku = excluded.sku, tab = excluded.tab, title = excluded.title,
      catalog = excluded.catalog, category = excluded.category, size = excluded.size,
      price_exc_gst = excluded.price_exc_gst, price_inc_gst = excluded.price_inc_gst,
      is_active = excluded.is_active, updated_at = now()
    -- updated_at is excluded from the comparison or every row would always
    -- differ and the guard would be pointless.
    where (product_catalog.sku, product_catalog.tab, product_catalog.title,
           product_catalog.catalog, product_catalog.category, product_catalog.size,
           product_catalog.price_exc_gst, product_catalog.price_inc_gst,
           product_catalog.is_active)
      is distinct from
          (excluded.sku, excluded.tab, excluded.title,
           excluded.catalog, excluded.category, excluded.size,
           excluded.price_exc_gst, excluded.price_inc_gst,
           excluded.is_active)
    returning 1
  )
  select count(*) into v_rows from up;

  -- SKUs removed from the sheet leave the catalog. An Active/Inactive flip is
  -- NOT a delete — it is the is_active update above.
  delete from product_catalog pc
  where not exists (
    select 1 from master_sheet_rows r
    where upper(btrim(r.sku)) = pc.sku_norm and btrim(coalesce(r.sku, '')) <> ''
  );

  return v_rows;
end;
$$;

comment on function public.refresh_product_catalog is
  'Rebuilds product_catalog from master_sheet_rows. Resolves sheet columns by header name, never by ordinal. Writes only rows that actually changed.';

revoke all on function public.refresh_product_catalog() from public, anon;
grant execute on function public.refresh_product_catalog() to service_role;

-- Every 2 minutes, matching the mirror's own cadence. Free when nothing
-- changed thanks to the guard above, so the frequency costs nothing.
select cron.unschedule('product-catalog-refresh')
where exists (select 1 from cron.job where jobname = 'product-catalog-refresh');
select cron.schedule('product-catalog-refresh', '*/2 * * * *',
  $$select public.refresh_product_catalog()$$);
