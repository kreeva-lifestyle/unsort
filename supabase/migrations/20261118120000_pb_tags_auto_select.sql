-- Playbook: tags chosen by themselves, and "only if it fits" attributes (owner, 18 Nov 2026: "over here also AI should
-- auto select. No user inputs required. Product Type is not necessary if AI is not able to find a perfect fit. Here AI
-- should also have judgment skills whether the product type fits within the values we have or not. If not leave it.").
-- 130 products sat in Needs info, 122 of them "Missing: Product Type" (117 only that), because every attribute linked
-- to a category was a must and "Let AI decide" ran only when a person tapped it. Why each piece:
--   pb_attributes.required   true (default: every attribute stays as it was) = must have; false = only if it fits: the
--                            AI chooses a value only when one truly fits (tagPrompt.ts), and an empty one never holds
--                            a product. Product Type is set to false here, as the owner asked.
--   pb_products_refresh      the Ready check counts only must-have attributes as missing (patched in place: one
--                            condition added to the live definition, 20261113210000_pb_tag_value_categories.sql).
--                            And a product that gains a missing tag (a value deleted, a must-have linked or switched
--                            on, a category move) gets a new automatic try: tags_ai_at is cleared then.
--   pb_tag_link_stats        "N products need a tag" on the Tags page counts only must-have attributes (same way).
--                            pb_category_lacking still counts every attribute: linking an "only if it fits" one offers
--                            "Link and let AI decide" for the products that have none (the AI picks where one fits).
--   pb_bulk_capture / pb_tag_scope_back     `required` is recorded with an attribute and comes back with it when a
--                            reverted delete re-inserts it (else an "only if it fits" one would come back a must).
--   pb_products.tags_ai_at   when "Let AI decide" last ran by itself for the product. The worker (fillAuto.ts) fills a
--                            Needs-info product missing a tag ONCE per read: pb_tags_auto_claim takes it only while
--                            tags_ai_at is empty or older than its read (ai_read_at), so a product the AI cannot finish
--                            is never paid for again until it is read again (or gains a missing tag, above). Only a
--                            product waiting for nothing but tags: not a copy, not "Missing: Category", with a photo.
--   pb_products.tags_ai_retry_at  holds a product back: 30 minutes after an AI that could not be reached (the worker
--                            gives the try back), the next IST day while the day's AI limit is used up
--                            (pb_tags_auto_hold) — so neither wakes the worker every minute.
--   trigger_pb_worker        also wakes the worker while such a product waits (pb_tags_auto_due).
-- Additive: three columns (defaulted / nullable, no backfill), four new functions (service role only), four functions
-- replaced with the same signatures, one trigger re-created, one setting (Product Type → only if it fits). The products
-- held only for Product Type (~117) keep their "Missing: Product Type" for now, so the worker's automatic "Let AI
-- decide" takes each of them once: the AI picks a type where one truly fits, and that fill's Ready check releases them
-- either way. Only those it will never take (tags chosen by a person, a copy, no photo, queued, "Missing: Category")
-- are checked again here, so none is left held by an attribute that no longer holds anything.

alter table public.pb_attributes add column if not exists required boolean not null default true;
alter table public.pb_products add column if not exists tags_ai_at timestamptz;
alter table public.pb_products add column if not exists tags_ai_retry_at timestamptz;

-- The Ready check: only must-have attributes are missing.
do $do$
declare d text := pg_get_functiondef('public.pb_products_refresh(uuid[])'::regprocedure);
  old constant text := 'where lower(ca.category) = lower(c.category)';
begin
  if position(old || ' and a.required' in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'pb_products_refresh is not the version this migration expects (20261113210000).'; end if;
  execute replace(d, old, old || ' and a.required');
end $do$;
do $do$
declare d text := pg_get_functiondef('public.pb_products_refresh(uuid[])'::regprocedure);
  old constant text := 'update pb_products p set missing_attrs = g.miss,';
begin
  if position('tags_ai_at = case' in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'pb_products_refresh is not the version this migration expects (20261113210000).'; end if;
  execute replace(d, old, old || ' tags_ai_at = case when g.miss <@ coalesce(g.missing_attrs, ''{}'') then p.tags_ai_at end,');
end $do$;

-- The per-link counts on the Tags page ("N products need a tag"): must-have attributes only.
do $do$
declare d text := pg_get_functiondef('public.pb_tag_link_stats()'::regprocedure);
  old constant text := 'count(p.id) filter (where not exists';
begin
  if position('count(p.id) filter (where a.required and not exists' in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'pb_tag_link_stats is not the version this migration expects (20261113210000).'; end if;
  execute replace(d, old, 'count(p.id) filter (where a.required and not exists');
end $do$;

-- `required` travels with an attribute through the bulk-change log, and comes back with a reverted delete.
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_attributes
  for each row execute function public.pb_bulk_capture('id', 'id,name,key,multi,position,shopify_prefix,by_category,required');
create or replace function public.pb_tag_scope_back()
returns trigger
language plpgsql set search_path to 'public' as $function$
declare b jsonb;
begin
  -- The row's last recorded delete (pb_bulk_items_row_idx). A new attribute or value has a new id and finds none.
  select i.before into b from pb_bulk_items i
  where i.tbl = tg_table_name and i.pk = jsonb_build_object('id', new.id) and i.op = 'D'
  order by i.id desc limit 1;
  if b is null then return new; end if;
  if tg_table_name = 'pb_attributes' then
    if jsonb_typeof(b -> 'by_category') = 'boolean' then new.by_category := (b ->> 'by_category')::boolean; end if;
    if jsonb_typeof(b -> 'required') = 'boolean' then new.required := (b ->> 'required')::boolean; end if;
  elsif tg_table_name = 'pb_attribute_values' and jsonb_typeof(b -> 'categories') = 'array' and cardinality(new.categories) = 0 then
    new.categories := array(select jsonb_array_elements_text(b -> 'categories'));
  end if;
  return new;
end $function$;

-- Products "Let AI decide" may take by itself: Needs info with a tag missing and nothing else holding it back (not a
-- copy, not "Missing: Category", a photo there), not queued for a person's "Let AI decide", tags not locked by a person,
-- not filled by itself since its last read, and not held back (tags_ai_retry_at).
create or replace function public.pb_tags_auto_due()
returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from pb_products p
    where p.status = 'needs_info' and p.tag_fill_run is null and not ('tags' = any(coalesce(p.locked, '{}')))
      and cardinality(p.missing_attrs) > 0 and not ('Category' = any(p.missing_attrs)) and p.copy_of is null
      and (p.tags_ai_at is null or p.tags_ai_at < coalesce(p.ai_read_at, p.created_at))
      and (p.tags_ai_retry_at is null or p.tags_ai_retry_at < now())
      and exists (select 1 from pb_product_images i where i.product_id = p.id and i.kind = 'image'));
$$;

-- Takes up to p_limit of them, oldest change first, and stamps tags_ai_at: overlapping worker runs never take the same
-- product, and none is taken twice for one read.
create or replace function public.pb_tags_auto_claim(p_limit int)
returns table (id uuid)
language sql security invoker set search_path = public as $$
  update pb_products p set tags_ai_at = now()
  where p.id in (select x.id from pb_products x
                 where x.status = 'needs_info' and x.tag_fill_run is null and not ('tags' = any(coalesce(x.locked, '{}')))
                   and cardinality(x.missing_attrs) > 0 and not ('Category' = any(x.missing_attrs)) and x.copy_of is null
                   and (x.tags_ai_at is null or x.tags_ai_at < coalesce(x.ai_read_at, x.created_at))
                   and (x.tags_ai_retry_at is null or x.tags_ai_retry_at < now())
                   and exists (select 1 from pb_product_images i where i.product_id = x.id and i.kind = 'image')
                 order by x.updated_at
                 limit greatest(1, least(coalesce(p_limit, 5), 50))
                 for update skip locked)
  returning p.id;
$$;

-- The day's AI limit is used up: every product that is due waits until p_until (the next IST day), so it does not wake
-- the worker every minute meanwhile. Returns how many.
create or replace function public.pb_tags_auto_hold(p_until timestamptz)
returns integer
language sql security invoker set search_path = public as $$
  with h as (
    update pb_products p set tags_ai_retry_at = p_until
    where p.status = 'needs_info' and p.tag_fill_run is null and not ('tags' = any(coalesce(p.locked, '{}')))
      and cardinality(p.missing_attrs) > 0 and not ('Category' = any(p.missing_attrs)) and p.copy_of is null
      and (p.tags_ai_at is null or p.tags_ai_at < coalesce(p.ai_read_at, p.created_at))
      and (p.tags_ai_retry_at is null or p.tags_ai_retry_at < now())
    returning 1)
  select count(*)::int from h;
$$;

-- The products of a category with no value of an attribute it uses (what pb_category_lacking counts), for "Let AI
-- decide" on an "only if it fits" attribute (tags_ai_fill): only those are queued, not the whole category.
create or replace function public.pb_category_lacking_ids(p_category text, p_attribute uuid)
returns table (id uuid)
language sql stable security invoker set search_path = public as $$
  select p.id from pb_products p
  where lower(p.category) = lower(p_category) and p.status in ('ready', 'needs_info')
    and not exists (select 1 from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id join pb_attributes a on a.id = v.attribute_id
                    where pv.product_id = p.id and v.attribute_id = p_attribute and pb_tag_offered(a.by_category, v.categories, p.category))
  order by p.id limit 2000;
$$;

revoke execute on function public.pb_category_lacking_ids(text, uuid) from public, anon, authenticated;
grant execute on function public.pb_category_lacking_ids(text, uuid) to service_role;
revoke execute on function public.pb_tags_auto_hold(timestamptz) from public, anon, authenticated;
grant execute on function public.pb_tags_auto_hold(timestamptz) to service_role;
revoke execute on function public.pb_tags_auto_due() from public, anon, authenticated;
revoke execute on function public.pb_tags_auto_claim(int) from public, anon, authenticated;
grant execute on function public.pb_tags_auto_due() to service_role;
grant execute on function public.pb_tags_auto_claim(int) to service_role;

-- The worker wakes while such a product waits (the live trigger_pb_worker: 20261118090000_pb_tags_auto_file.sql).
do $do$
declare d text := pg_get_functiondef('public.trigger_pb_worker()'::regprocedure);
  old constant text := 'and not pb_tag_file_due()';
begin
  if position('pb_tags_auto_due()' in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'trigger_pb_worker is not the version this migration expects (20261118090000).'; end if;
  execute replace(d, old, old || ' and not pb_tags_auto_due()');
end $do$;

-- Owner, 18 Nov 2026: "Product Type is not necessary if AI is not able to find a perfect fit".
update public.pb_attributes set required = false where key = 'product type' and required;

-- Products held by an "only if it fits" attribute that the automatic fill will never take: checked again now (no AI).
-- The rest wait for that fill (see the header).
select count(*) from public.pb_products_refresh(array(
  select p.id from pb_products p
  where p.status = 'needs_info' and p.missing_attrs && array(select a.name from pb_attributes a where not a.required)
    and ('tags' = any(coalesce(p.locked, '{}')) or p.copy_of is not null or p.tag_fill_run is not null
         or 'Category' = any(p.missing_attrs)
         or not exists (select 1 from pb_product_images i where i.product_id = p.id and i.kind = 'image'))));
