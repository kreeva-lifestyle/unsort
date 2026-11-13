-- Product Type: an attribute whose values depend on the category (owner, 13 Nov 2026: "there is new Attribute named
-- Product Type but there is a catch in this attribute in tis attribute the values are to be mapped against the
-- category. so no mistake can happen. make this feature dynamic if toggle on for category map then...... Also add this
-- Product Type attribute everywhere in setting wherever is required.")
--
-- WHY: Colour, Fabric, Work and Occasion offer every value to every category. A Product Type value only fits one kind
-- of garment ("Bridal Lehenga" is a Lehenga, "Banarasi Saree" a Saree): offered everywhere, the word rules and the AI
-- could tag a saree "Bridal Lehenga", and staff could pick it.
-- HOW (the owner's answers, 13 Nov 2026: "You create it", "No, nowhere", "No, keep the category"):
--   pb_attributes.by_category       the attribute's switch "Values depend on the category". Off (every attribute
--                                   until now) = as before.
--   pb_attribute_values.categories  the categories a value is ticked for, read only while its attribute's switch is on.
--                                   Then a value is offered (by the word rules, the AI and staff) only for a product
--                                   whose category is ticked on it, compared without case or extra spaces like the
--                                   category list; a value with none ticked is offered nowhere.
--   pb_tag_offered()                that rule, in one place, for the functions below. Server twin: pb-products
--                                   taxonomy.ts offered().
--   pb_products_refresh             (the Ready check, the tags cache behind {tags}, the filters and the writer's facts)
--                                   a value counts only where it is offered: a "Bridal Lehenga" left on a product that
--                                   is now a Saree does not finish its Product Type and is not sent as a tag.
--                                   Otherwise the same function as 20261113150000_pb_gate_category_list.sql.
--   pb_category_lacking, pb_tag_link_stats  the "N products will need a Product Type" counts, by the same rule.
--   bulk-change log                 the two columns are recorded with their rows. A revert that puts back a deleted
--                                   attribute or value (pb_bulk_revert_tags re-inserts a fixed list of columns) gets
--                                   its switch / categories back from the recorded row: pb_tag_scope_back, a BEFORE
--                                   INSERT trigger that looks up the row's last recorded delete (only a revert inserts
--                                   a row with an id the log has seen deleted).
--   "Product Type"                  created with the switch on, one value per product, linked to no category: the owner
--                                   adds its values and links it to categories on Settings → Tags.
-- The Shopify "Product type" field keeps the category ("No, keep the category").
-- Additive: two columns with defaults (nothing changes for the existing attributes), one function and trigger added,
-- four functions and two recording triggers replaced (longer column lists), one attribute added.

-- ── 1. the switch and the ticks ──────────────────────────────────────────
alter table public.pb_attributes add column if not exists by_category boolean not null default false;
alter table public.pb_attribute_values add column if not exists categories text[] not null default '{}' check (cardinality(categories) <= 100);
comment on column public.pb_attributes.by_category is 'Values depend on the category: a value is offered only for products of the categories ticked on it (pb_attribute_values.categories); none ticked = offered nowhere. Rule: pb_tag_offered().';
comment on column public.pb_attribute_values.categories is 'The categories this value is offered for, read only while its attribute''s by_category is on.';

-- ── 2. the rule ──────────────────────────────────────────────────────────
create or replace function public.pb_tag_offered(p_by_category boolean, p_categories text[], p_category text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select not coalesce(p_by_category, false) or (btrim(coalesce(p_category, '')) <> '' and exists (
    select 1 from unnest(coalesce(p_categories, '{}'::text[])) x
    where lower(regexp_replace(btrim(x), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_category), '\s+', ' ', 'g'))));
$$;
comment on function public.pb_tag_offered(boolean, text[], text) is 'Is a value offered for a product of this category? Always, unless its attribute''s values depend on the category; then only when the category is ticked on the value.';

-- ── 3. the Ready check ───────────────────────────────────────────────────
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
                          where pv.product_id = c.id and v.attribute_id = a.id
                            and pb_tag_offered(a.by_category, v.categories, c.category))), '{}') as miss,
      coalesce((select array_agg(v.name order by a.position, a.name, v.position, v.name)
        from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id join pb_attributes a on a.id = v.attribute_id
        where pv.product_id = c.id and pb_tag_offered(a.by_category, v.categories, c.category)), '{}') as names,
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

-- ── 4. "N products will need a Product Type" ─────────────────────────────
create or replace function public.pb_category_lacking(p_category text, p_attribute uuid) returns int
language sql security invoker stable set search_path = public as $$
  select count(*)::int from pb_products p
  where lower(p.category) = lower(p_category) and p.status <> 'archived'
    and not exists (select 1 from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id join pb_attributes a on a.id = v.attribute_id
                    where pv.product_id = p.id and v.attribute_id = p_attribute and pb_tag_offered(a.by_category, v.categories, p.category));
$$;

create or replace function public.pb_tag_link_stats()
returns table (category text, attribute_id uuid, products int, lacking int)
language sql security invoker stable set search_path = public as $$
  select ca.category, ca.attribute_id, count(p.id)::int,
    count(p.id) filter (where not exists (select 1 from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id
                                          where pv.product_id = p.id and v.attribute_id = ca.attribute_id
                                            and pb_tag_offered(a.by_category, v.categories, p.category)))::int
  from pb_category_attributes ca
  join pb_attributes a on a.id = ca.attribute_id
  left join pb_products p on lower(p.category) = lower(ca.category) and p.status <> 'archived'
  group by ca.category, ca.attribute_id;
$$;

-- ── 5. the bulk-change log keeps them, and a revert puts them back ───────
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_attributes
  for each row execute function public.pb_bulk_capture('id', 'id,name,key,multi,position,shopify_prefix,by_category');
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_attribute_values
  for each row execute function public.pb_bulk_capture('id', 'id,attribute_id,name,key,aliases,position,categories');

create or replace function public.pb_tag_scope_back() returns trigger
language plpgsql security invoker set search_path = public as $$
declare b jsonb;
begin
  -- The row's last recorded delete (pb_bulk_items_row_idx). A new attribute or value has a new id and finds none.
  select i.before into b from pb_bulk_items i
  where i.tbl = tg_table_name and i.pk = jsonb_build_object('id', new.id) and i.op = 'D'
  order by i.id desc limit 1;
  if b is null then return new; end if;
  if tg_table_name = 'pb_attributes' and jsonb_typeof(b -> 'by_category') = 'boolean' then
    new.by_category := (b ->> 'by_category')::boolean;
  elsif tg_table_name = 'pb_attribute_values' and jsonb_typeof(b -> 'categories') = 'array' and cardinality(new.categories) = 0 then
    new.categories := array(select jsonb_array_elements_text(b -> 'categories'));
  end if;
  return new;
end $$;
comment on function public.pb_tag_scope_back() is 'An attribute or value put back by a bulk-change revert gets back its "values depend on the category" switch / ticked categories (pb_bulk_revert_tags re-inserts a fixed list of columns).';
create or replace trigger pb_tag_scope_back before insert on public.pb_attributes
  for each row execute function public.pb_tag_scope_back();
create or replace trigger pb_tag_scope_back before insert on public.pb_attribute_values
  for each row execute function public.pb_tag_scope_back();

-- ── 6. the Product Type attribute ────────────────────────────────────────
insert into public.pb_attributes (name, key, multi, position, by_category)
select 'Product Type', 'product type', false, coalesce((select max(a.position) from public.pb_attributes a), 0) + 1, true
where not exists (select 1 from public.pb_attributes a where a.key = 'product type');
