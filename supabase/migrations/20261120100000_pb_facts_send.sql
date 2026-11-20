-- Playbook: a store follows its products by itself (owner, 20 Nov 2026: "Category changes: a change does not reach
-- products already on the store. Corrected tags and fields: these are not sent again by themselves. … solve these
-- biggest issues with permanent fixes.")
-- WHY: a listing's Shopify product type and tags were worked out once, when the AI wrote it, and its custom fields
-- only rode on some other send. Renaming or moving a category, a person's edit, a corrected value or the revert of
-- any of these changed pb_products and nothing told the store: the product stayed in its old collection with its old
-- tags until someone tapped Regenerate, one listing at a time. Now, as stock has had since 13 Nov (stockSend.ts):
--   * pb_listings.facts_due marks a listing that is on sale on Shopify and whose product changed in a way the store
--     shows: its category (Shopify's product type, which files it in a collection), its chosen values
--     (pb_products.tags), fabric, colour, the read facts, its code, its sizes or its vendor (tag templates use
--     them). Triggers set it, so no path can be missed: the product page (a write straight from the browser), rename,
--     move, a re-read, retag, "Let AI decide" and every revert all end in an UPDATE of pb_products. An attribute's
--     name / key / prefix / "takes several values", a value's name or its category ticks, and a vendor's name or
--     short names change tags and fields without touching a product row: they mark the products that carry them.
--   * the worker's small send (factsSend.ts) sends only the product type, Playbook's own tags and the custom
--     fields — no title, text, price, size or photo — and writes what it sent to pb_listings.sent. A listing whose
--     record already equals what its product gives now is cleared without a call to the store, so marking too often
--     costs nothing on Shopify.
--   * pb_listings.ai_tags keeps the AI's extra tags on their own, so a listing's tags can be worked out again by
--     the website's rules without the AI (null = written before they were kept).
--   * pb_listings.facts_force: the website's button "Send tags and fields again" sends even when the record says
--     nothing changed (a field's kind changed on the store, or someone edited the product there).
-- Additive only: new columns, one index, one trigger function with four triggers, and the worker's wake-up check.
alter table public.pb_listings
  add column if not exists facts_due boolean not null default false,
  add column if not exists facts_force boolean not null default false,
  add column if not exists facts_tried_at timestamptz,
  add column if not exists sent jsonb,
  add column if not exists ai_tags text[];

comment on column public.pb_listings.facts_due is 'The store is owed this product''s type, tags and custom fields as they are now (factsSend.ts).';
comment on column public.pb_listings.sent is 'What the store was last sent: { type, tags, fields } (null = not on record).';
comment on column public.pb_listings.ai_tags is 'The AI''s extra tags, kept apart from the rule-built ones (null = written before they were kept).';

-- The worker asks for "owed and due for a try": never tried, or the last try is 5 minutes old.
create index if not exists pb_listings_facts_due_idx on public.pb_listings (facts_tried_at) where facts_due;

-- One function for the four tables. It runs with the owner's rights: the product page writes pb_products as the
-- signed-in person, and the mark must reach the listing whatever that person may change there. It cannot be called
-- on its own (a trigger function), and it writes nothing but the mark.
create or replace function public.pb_facts_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if tg_table_name = 'pb_products' then
    ids := array[new.id];
  elsif tg_table_name = 'pb_vendors' then
    select array_agg(p.id) into ids from pb_products p where p.vendor_id = new.id;
  elsif tg_table_name = 'pb_attribute_values' then
    select array_agg(distinct pv.product_id) into ids from pb_product_values pv where pv.value_id = new.id;
  else -- pb_attributes
    select array_agg(distinct pv.product_id) into ids
    from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id where v.attribute_id = new.id;
  end if;
  if ids is null then return null; end if;
  -- On sale on Shopify, by the rule pb_stock_save uses: it has a Shopify product that was not hidden or archived
  -- there. A listing already marked and never tried is left as it is (no second write for the same change).
  update pb_listings l set facts_due = true, facts_tried_at = null
  where l.product_id = any(ids) and l.shopify_product_id is not null
    and not (l.status = 'skipped' and coalesce(l.shopify_status, '') in ('DRAFT', 'ARCHIVED'))
    and (not l.facts_due or l.facts_tried_at is not null);
  return null;
end $$;

create or replace trigger pb_facts_follow after update on public.pb_products
  for each row when (new.category is distinct from old.category or new.fabric is distinct from old.fabric
    or new.color is distinct from old.color or new.tags is distinct from old.tags
    or new.attributes is distinct from old.attributes or new.sku is distinct from old.sku
    or new.sizes is distinct from old.sizes or new.vendor_id is distinct from old.vendor_id)
  execute function public.pb_facts_follow();

create or replace trigger pb_facts_follow after update on public.pb_attributes
  for each row when (new.name is distinct from old.name or new.key is distinct from old.key
    or new.multi is distinct from old.multi or new.shopify_prefix is distinct from old.shopify_prefix
    or new.by_category is distinct from old.by_category)
  execute function public.pb_facts_follow();

create or replace trigger pb_facts_follow after update on public.pb_attribute_values
  for each row when (new.name is distinct from old.name or new.categories is distinct from old.categories)
  execute function public.pb_facts_follow();

create or replace trigger pb_facts_follow after update on public.pb_vendors
  for each row when (new.name is distinct from old.name or new.codes is distinct from old.codes)
  execute function public.pb_facts_follow();

-- The worker wakes while such a listing waits on a website that is switched on (the live trigger_pb_worker:
-- 20261118120000_pb_tags_auto_select.sql). In the part a pause holds: only stock goes out while automation is paused.
do $do$
declare d text := pg_get_functiondef('public.trigger_pb_worker()'::regprocedure);
  old constant text := 'and not exists (select 1 from pb_products where route_due)';
begin
  if position('facts_due' in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'trigger_pb_worker is not the version this migration expects (20261118120000).'; end if;
  execute replace(d, old, old || E'\n     and not exists (select 1 from pb_listings l join pb_websites w on w.id = l.website_id and w.active\n                     where l.facts_due and (l.facts_tried_at is null or l.facts_tried_at < now() - interval ''5 minutes''))');
end $do$;
