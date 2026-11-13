-- Categories: rename one, and move a category's products to another (owner, 13 Nov 2026: "I deleted the category called
-- anarkali … After deleting the app says missing:category. If deleted than it has to be moved to correct category and
-- let ai decide which product type is it for that category. also Im unable to rename the category even if there are no
-- product linked to it.")
--
-- WHY: a category name lives in five places — the list (pb_settings 'categories'), its must-have tags
-- (pb_category_attributes), its products (pb_products.category), the Product Type ticks (pb_attribute_values.categories)
-- and the websites' rules (pb_routing_rules.conditions.categories). The app could only add and remove names: removing
-- one left its products waiting with "Missing: Category" (96 Anarkali and 23 Kurta Set products on 13 Nov), and a
-- rename was impossible.
-- HOW: two functions, called only by the pb-products edge function (service role; refused for anyone else), each one
-- transaction, updates only:
--   pb_category_rename(from, to)  the name changes in all five places (case-only renames too); refused when `to` is
--                                 already on the list (that is a move). Returns the products renamed. The server
--                                 records it as a bulk change ("category_rename") whose revert renames it back.
--   pb_category_move(from, to)    every product filed under `from` (on the list or not, any status) is filed under
--                                 `to`, which must be on the list (its spelling is used), and checked again
--                                 (pb_products_refresh). Returns those rows. The server records it as a bulk change
--                                 ("category_move"), removes `from` from the list when asked, and queues "Let AI
--                                 decide" for the moved products that miss a must-have tag (Product Type…).
--   pb_bulk_capture on pb_products now records `category` too, so a move can be taken back product by product: the
--                                 server's revert (categoryRevert.ts) files back each product still in `to`.
-- Additive: two functions added, one recording trigger replaced with a longer column list.

-- ── 1. the bulk-change log records a product's category ──────────────────
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_products
  for each row execute function public.pb_bulk_capture('id', 'status,ai_error,name,sku,source,source_ref,in_stock,temp_out_at,perm_out_at,category');

-- ── 2. rename ────────────────────────────────────────────────────────────
create or replace function public.pb_category_rename(p_from text, p_to text) returns int
language plpgsql security invoker set search_path = public as $$
declare
  f text := lower(btrim(regexp_replace(coalesce(p_from, ''), '\s+', ' ', 'g')));
  t text := btrim(regexp_replace(coalesce(p_to, ''), '\s+', ' ', 'g'));
  list jsonb; ids uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  if f = '' or t = '' then raise exception 'Give the category a name.'; end if;
  if length(t) > 60 then raise exception 'A category name can be at most 60 letters.'; end if;
  select s.value into list from pb_settings s where s.key = 'categories' for update;
  if jsonb_typeof(list) is distinct from 'array'
     or not exists (select 1 from jsonb_array_elements_text(list) x where lower(btrim(x)) = f) then
    raise exception 'That category is no longer in the list.';
  end if;
  if lower(t) <> f and exists (select 1 from jsonb_array_elements_text(list) x where lower(btrim(x)) = lower(t)) then
    raise exception '% is already in the list. To put the products of both together, move them there instead.', t;
  end if;
  if lower(t) <> f and exists (select 1 from pb_category_attributes ca where lower(ca.category) = lower(t)) then
    raise exception 'Tags are still linked to the name %. Try another name.', t;
  end if;
  update pb_settings s set value = (select jsonb_agg(case when lower(btrim(e.x)) = f then to_jsonb(t) else to_jsonb(e.x) end order by e.o)
                                    from jsonb_array_elements_text(list) with ordinality e(x, o))
  where s.key = 'categories';
  update pb_category_attributes ca set category = t where lower(ca.category) = f;
  update pb_attribute_values v set categories = array(select case when lower(btrim(c)) = f then t else c end from unnest(v.categories) c)
  where exists (select 1 from unnest(v.categories) c where lower(btrim(c)) = f);
  update pb_routing_rules r set conditions = jsonb_set(r.conditions, '{categories}',
      (select jsonb_agg(case when lower(btrim(c)) = f then to_jsonb(t) else to_jsonb(c) end) from jsonb_array_elements_text(r.conditions -> 'categories') c))
  where jsonb_typeof(r.conditions -> 'categories') = 'array'
    and exists (select 1 from jsonb_array_elements_text(r.conditions -> 'categories') c where lower(btrim(c)) = f);
  with m as (update pb_products p set category = t where lower(regexp_replace(btrim(coalesce(p.category, '')), '\s+', ' ', 'g')) = f returning p.id)
  select coalesce(array_agg(m.id), '{}') into ids from m;
  perform 1 from pb_products_refresh(ids);
  return cardinality(ids);
end $$;
comment on function public.pb_category_rename(text, text) is 'Renames a category in the list, its must-have tags, its products, the Product Type ticks and the website rules (pb-products category_rename).';

-- ── 3. move ──────────────────────────────────────────────────────────────
create or replace function public.pb_category_move(p_from text, p_to text)
returns table (id uuid, status text, was text, missing text[])
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  f text := lower(btrim(regexp_replace(coalesce(p_from, ''), '\s+', ' ', 'g')));
  t text; ids uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  select btrim(x.name) into t
  from pb_settings s, jsonb_array_elements_text(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) x(name)
  where s.key = 'categories' and lower(btrim(x.name)) = lower(btrim(regexp_replace(coalesce(p_to, ''), '\s+', ' ', 'g')))
  limit 1;
  if f = '' then raise exception 'Say which category the products move from.'; end if;
  if t is null then raise exception 'Pick a category from the list to move them to.'; end if;
  if lower(t) = f then raise exception 'Pick another category to move them to.'; end if;
  with m as (update pb_products p set category = t where lower(regexp_replace(btrim(coalesce(p.category, '')), '\s+', ' ', 'g')) = f returning p.id)
  select coalesce(array_agg(m.id), '{}') into ids from m;
  return query select * from pb_products_refresh(ids);
end $$;
comment on function public.pb_category_move(text, text) is 'Files every product of one category under another one from the list and checks them again (pb-products category_move).';
