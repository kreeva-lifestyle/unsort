-- Brand Tags: do the heavy work in the database (owner, 2026-11-10: "How can
-- we optimise brand tags?" → "Start fixing everything").
--
-- WHY. Measured on the live table (8,071 labels, 17 MB, 11 indexes):
--   * Every order-sheet upload downloaded the WHOLE table to the browser
--     (9 requests, ~3 MB, paged with no ORDER BY) to match SKUs there. It
--     grew with every label added, a failed page silently became "missing
--     SKUs", and a label edited mid-download could be skipped or doubled.
--     brand_tags_by_skus() returns only the labels the sheet asks for.
--   * Every Excel import rewrote every row in the file, changed or not: a new
--     row version in all 11 indexes and a live-update message per row to each
--     open Brand Tags screen. import_brand_tags() writes only rows that are
--     new or really different, and says how many of each there were.
-- Both are SECURITY INVOKER: the table's own RLS decides (any signed-in user
-- reads; operator and above write), exactly as with the direct calls they
-- replace.

-- Order-sheet SKUs are matched ignoring case (19 labels are not upper-case).
create index if not exists idx_bt_sku_upper on public.brand_tags (upper(sku));

-- Labels whose SKU is one of p_skus, ignoring case. Returns ONE json value on
-- purpose: the API caps row sets at 1,000 rows, a single value is not capped.
-- Oldest first, so when two labels share a SKU the page keeps the newest.
create or replace function public.brand_tags_by_skus(p_skus text[])
returns jsonb language sql stable security invoker
set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'created_at' order by r.created_at, r.id), '[]'::jsonb)
  from (
    select t.id, t.brand, t.ean, t.sku, t.qty, t.mrp, t.size, t.product, t.color, t.mktd, t.jio_code, t.copies, t.created_at
    from brand_tags t
    where upper(t.sku) = any (array(select upper(x) from unnest(p_skus) x))
  ) r;
$$;
grant execute on function public.brand_tags_by_skus(text[]) to authenticated;

-- One import batch. A label is identified by (ean, sku, size), as before.
-- Repeats of the same label inside one batch are merged (the last one wins)
-- instead of failing the whole batch. Returns
-- { added, changed, unchanged, duplicates }.
create or replace function public.import_brand_tags(p_rows jsonb)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare v_total int; v_distinct int; v_added int; v_changed int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Nothing to import.';
  end if;
  v_total := jsonb_array_length(p_rows);

  with src as (
    select distinct on (x.ean, x.sku, x.size)
           x.brand, x.ean, x.sku, x.qty, x.mrp, x.size, x.product, x.color, x.mktd, x.jio_code, x.copies
    from (
      select coalesce(r.brand, '') as brand, coalesce(r.ean, '') as ean, coalesce(r.sku, '') as sku,
             coalesce(r.qty, '') as qty, coalesce(r.mrp, 0) as mrp, coalesce(r.size, '') as size,
             coalesce(r.product, '') as product, coalesce(r.color, '') as color, coalesce(r.mktd, '') as mktd,
             coalesce(r.jio_code, '') as jio_code, coalesce(r.copies, 0) as copies, o.ord
      from jsonb_array_elements(p_rows) with ordinality as o(j, ord),
           jsonb_to_record(o.j) as r(brand text, ean text, sku text, qty text, mrp numeric, size text,
                                     product text, color text, mktd text, jio_code text, copies integer)
    ) x
    order by x.ean, x.sku, x.size, x.ord desc
  ),
  up as (
    insert into brand_tags as t (brand, ean, sku, qty, mrp, size, product, color, mktd, jio_code, copies, updated_at)
    select s.brand, s.ean, s.sku, s.qty, s.mrp, s.size, s.product, s.color, s.mktd, s.jio_code, s.copies, now() from src s
    on conflict (ean, sku, size) do update set
      brand = excluded.brand, qty = excluded.qty, mrp = excluded.mrp, product = excluded.product,
      color = excluded.color, mktd = excluded.mktd, jio_code = excluded.jio_code, copies = excluded.copies,
      updated_at = now()
    where (t.brand, t.qty, t.mrp, t.product, t.color, t.mktd, t.jio_code, t.copies)
      is distinct from
          (excluded.brand, excluded.qty, excluded.mrp, excluded.product, excluded.color, excluded.mktd,
           excluded.jio_code, excluded.copies)
    returning (t.xmax = 0) as inserted
  )
  select (select count(*) from src), count(*) filter (where u.inserted), count(*) filter (where not u.inserted)
    into v_distinct, v_added, v_changed
  from up u;

  return jsonb_build_object('added', v_added, 'changed', v_changed,
    'unchanged', v_distinct - v_added - v_changed, 'duplicates', v_total - v_distinct);
end $$;
grant execute on function public.import_brand_tags(jsonb) to authenticated;
