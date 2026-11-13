-- Playbook: the Ready check holds a product whose category is no longer on the owner's list, and "Retag all"
-- replaces only the attributes it checked again. Owner, 13 Nov 2026 ("Perform and go ahead"), after the research
-- into why imported products did not land on the owner's categories and tags found both.
--
-- 1. pb_products_refresh (the Ready check). Removing a category in Settings → Tags deletes its must-have tags
--    and checks its products again, but their category text stays. With nothing linked the check asked for
--    nothing, so such a product stayed Ready under a category that no longer exists (one product was filed as
--    "Indo-Western" on 13 Nov). Now a category that is not on the list (pb_settings 'categories', compared
--    without case or extra spaces) counts as missing: missing_attrs gets 'Category' first, so the app says
--    "Missing: Category" and the product waits in Needs info until a category from the list is chosen. With no
--    list saved (no row, not a list, or an empty one) nothing is held for this, as before. Otherwise the same
--    function as 20261113120000_pb_copies.sql. The server's twin is tagGate.ts categoryGone.
-- 2. pb_product_values_bulk ("Retag all", in batches). It wrote each product with p_attributes null, and
--    pb_product_values_set then deletes the rules / AI values of EVERY attribute, though the server had checked
--    only the attributes linked to the product's category: values found at import for the others were lost, and
--    with nothing linked every value was. A row may now carry "attributes": [uuid…], and only those attributes
--    are replaced ([] replaces nothing). A row without it behaves as before (a server not yet updated).
-- 3. The products already off the list are checked once now.

-- ── 1. the Ready check ────────────────────────────────────────────────────
create or replace function public.pb_products_refresh(p_ids uuid[])
returns table (id uuid, status text, was text, missing text[])
language sql security invoker set search_path = public as $$
  with cur as (
    select p.id, p.status as was, p.category, p.cost_price, p.sell_price, p.fabric, p.color, p.ai_read_at, p.ai_error, p.missing_attrs, p.tags, p.route_due,
           p.copy_of as held_as
    from pb_products p where p.id = any(coalesce(p_ids, '{}')) for update
  ), list as (
    select coalesce((select array_agg(lower(regexp_replace(btrim(x.name), '\s+', ' ', 'g')))
      from pb_settings s, jsonb_array_elements_text(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) as x(name)
      where s.key = 'categories'), '{}'::text[]) as cats
  ), calc as (
    select c.*,
      (case when cardinality(l.cats) > 0 and coalesce(btrim(c.category), '') <> ''
                 and not (lower(regexp_replace(btrim(c.category), '\s+', ' ', 'g')) = any(l.cats))
            then array['Category'] else '{}'::text[] end)
      || coalesce((select array_agg(a.name order by ca.position, a.position, a.name)
        from pb_category_attributes ca join pb_attributes a on a.id = ca.attribute_id
        where lower(ca.category) = lower(c.category)
          and not exists (select 1 from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id
                          where pv.product_id = c.id and v.attribute_id = a.id)), '{}') as miss,
      coalesce((select array_agg(v.name order by a.position, a.name, v.position, v.name)
        from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id join pb_attributes a on a.id = v.attribute_id
        where pv.product_id = c.id), '{}') as names,
      (coalesce(btrim(c.fabric), '') <> '' and coalesce(btrim(c.color), '') <> ''
        and exists (select 1 from pb_product_images i where i.product_id = c.id and i.kind = 'image')) as has_details,
      case when c.was in ('ready', 'needs_info') then pb_dup_held(c.id) end as copy_of
    from cur c cross join list l
  ), gate as (
    select calc.*, case
      when calc.was not in ('ready', 'needs_info') then calc.was
      when not ((calc.cost_price is not null or calc.sell_price is not null) and coalesce(trim(calc.category), '') <> '' and cardinality(calc.miss) = 0
                and calc.has_details and calc.copy_of is null) then 'needs_info'
      when calc.was = 'needs_info' and calc.ai_read_at is null and calc.ai_error is null then 'needs_info'
      else 'ready' end as next
    from calc
  ), upd as (
    update pb_products p set missing_attrs = g.miss, tags = g.names, status = g.next, copy_of = g.copy_of,
      route_due = case when g.next = 'ready' and g.was = 'needs_info' then true when g.next <> 'ready' then false else g.route_due end
    from gate g
    where p.id = g.id and (g.missing_attrs is distinct from g.miss or g.tags is distinct from g.names or g.was is distinct from g.next
                           or g.held_as is distinct from g.copy_of)
    returning p.id
  )
  select g.id, g.next, g.was, g.miss from gate g;
$$;

-- ── 2. "Retag all" replaces only the attributes it checked ────────────────
create or replace function public.pb_product_values_bulk(p_rows jsonb)
returns table (id uuid, status text, was text, missing text[])
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare x jsonb;
begin
  for x in select e from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e order by e->>'product_id' loop
    if exists (select 1 from pb_products p where p.id::text = x->>'product_id') then
      return query select * from pb_product_values_set((x->>'product_id')::uuid, x->'rows', 'auto',
        case when jsonb_typeof(x->'attributes') = 'array' then array(select jsonb_array_elements_text(x->'attributes')::uuid) end);
    end if;
  end loop;
end $$;

-- ── 3. the products already off the list, checked once ────────────────────
select count(*) as checked_again from public.pb_products_refresh(array(
  select p.id from public.pb_products p
  where p.status in ('ready', 'needs_info') and coalesce(btrim(p.category), '') <> ''
    and exists (select 1 from public.pb_settings s where s.key = 'categories' and jsonb_typeof(s.value) = 'array' and jsonb_array_length(s.value) > 0)
    and not exists (
      select 1 from public.pb_settings s, jsonb_array_elements_text(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) as x(name)
      where s.key = 'categories' and lower(regexp_replace(btrim(x.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p.category), '\s+', ' ', 'g')))));
