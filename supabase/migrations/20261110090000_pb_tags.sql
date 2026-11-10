-- Playbook · Tags as a controlled taxonomy (owner, 2026-11-10).
-- Owner: "manually enter all tags and from that AI choose automatically …
-- structure first category then attribute then attribute tags … tags will grow
-- a lot and would be difficult to manage", "a UX where it recommends new tags
-- and on simple click adds to our library … we don't want look-alike tags",
-- "We will create category, attributes and attribute values from the backend
-- called Tags", and "for each attribute of its category a tag is a must".
--
-- WHY this shape: a free tag library filled itself with another store's junk
-- (_altnew_KBSUIT25, SIZE_CHART) and spellings of one thing. Now the owner
-- builds the list by hand and Playbook only ever CHOOSES from it:
--   pb_attributes            Colour, Work, Fabric… (one value or several; an
--                            optional Shopify prefix for "Colour_Black" tags)
--   pb_attribute_values      Black, Pink… with "also known as" words (aliases,
--                            stored as normalized keys); the edge function
--                            refuses a key or alias another value of the same
--                            attribute already uses, and warns on look-alikes
--   pb_category_attributes   which attributes a category uses, in order; every
--                            linked attribute is REQUIRED for the gate below
--   pb_product_values        a product's chosen values: 'rules' (found in its
--                            text), 'ai' (the reader / "Let AI decide"),
--                            'manual' (staff — never overwritten)
--   pb_tag_suggestions       phrases seen that are not values yet (store tags,
--                            the AI's "other", label lines), with uses and up
--                            to 5 example products; an ignored phrase is never
--                            suggested again
--   pb_tag_fill_runs         "Let AI decide" progress (queued products point
--                            at their run through pb_products.tag_fill_run)
--   pb_products.tags         cache of the chosen value names ({tags}, filters)
--   pb_products.missing_attrs required attributes still empty → Needs info
--   pb_products.route_due    became Ready by a tag change: the worker routes it
-- The ready gate (pb_products_refresh) is the SQL twin of the edge function's
-- tagGate.ts: Ready needs a price, a category and a value for each attribute of
-- the category. Structure writes go through the pb-products edge function
-- (service role: look-alike checks, admin / manager only); staff read
-- everything. Replaces the never-applied first draft of this file (free tags).
-- Safe to re-run: every statement is "if not exists" / "or replace".

-- ── pb_products ──────────────────────────────────────────────────────────
alter table public.pb_products add column if not exists tags text[] not null default '{}';
alter table public.pb_products add column if not exists missing_attrs text[] not null default '{}';
alter table public.pb_products add column if not exists tag_fill_run uuid;
alter table public.pb_products add column if not exists route_due boolean not null default false;
create index if not exists pb_products_tags_idx on public.pb_products using gin (tags);
create index if not exists pb_products_fill_idx on public.pb_products (tag_fill_run, updated_at) where tag_fill_run is not null;
create index if not exists pb_products_route_due_idx on public.pb_products (updated_at) where route_due;

-- ── taxonomy ─────────────────────────────────────────────────────────────
create table if not exists public.pb_attributes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  key text not null unique check (key <> ''),
  multi boolean not null default true,
  position int not null default 0,
  shopify_prefix text check (shopify_prefix is null or length(shopify_prefix) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pb_attributes_position_idx on public.pb_attributes (position, name);

create table if not exists public.pb_attribute_values (
  id uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references public.pb_attributes(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  key text not null check (key <> ''),
  aliases text[] not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attribute_id, key)
);
create index if not exists pb_attribute_values_attr_idx on public.pb_attribute_values (attribute_id, position, name);
create index if not exists pb_attribute_values_alias_idx on public.pb_attribute_values using gin (aliases);

create table if not exists public.pb_category_attributes (
  category text not null check (length(category) between 1 and 60),
  attribute_id uuid not null references public.pb_attributes(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  primary key (category, attribute_id)
);
create index if not exists pb_category_attributes_attr_idx on public.pb_category_attributes (attribute_id);

create table if not exists public.pb_product_values (
  product_id uuid not null references public.pb_products(id) on delete cascade,
  value_id uuid not null references public.pb_attribute_values(id) on delete cascade,
  source text not null check (source in ('rules','ai','manual')),
  created_at timestamptz not null default now(),
  primary key (product_id, value_id)
);
create index if not exists pb_product_values_value_idx on public.pb_product_values (value_id);

create table if not exists public.pb_tag_suggestions (
  id uuid primary key default gen_random_uuid(),
  phrase text not null check (length(phrase) between 1 and 80),
  key text not null check (key <> ''),
  attribute_id uuid references public.pb_attributes(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','added','aliased','ignored')),
  uses int not null default 0,
  examples uuid[] not null default '{}' check (cardinality(examples) <= 5),
  source text not null default 'store' check (source in ('store','ai','text')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_value_id uuid references public.pb_attribute_values(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists pb_tag_suggestions_key_attr on public.pb_tag_suggestions (key, (coalesce(attribute_id, '00000000-0000-0000-0000-000000000000'::uuid)));
create index if not exists pb_tag_suggestions_queue_idx on public.pb_tag_suggestions (status, uses desc, last_seen_at desc);
create index if not exists pb_tag_suggestions_attr_idx on public.pb_tag_suggestions (attribute_id, status);

create table if not exists public.pb_tag_fill_runs (
  id uuid primary key default gen_random_uuid(),
  total int not null default 0,
  filled int not null default 0,
  left_empty int not null default 0,
  scope jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists pb_tag_fill_runs_recent_idx on public.pb_tag_fill_runs (created_at desc);

do $$ declare t text; begin
  foreach t in array array['pb_attributes','pb_attribute_values','pb_tag_suggestions','pb_tag_fill_runs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.pb_touch()', t || '_touch', t);
  end loop;
  -- Staff read; every write goes through the pb-products edge function (service role, which RLS does not stop).
  foreach t in array array['pb_attributes','pb_attribute_values','pb_category_attributes','pb_product_values','pb_tag_suggestions','pb_tag_fill_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('drop policy if exists "pb staff read" on public.%I', t);
    execute format('create policy "pb staff read" on public.%I for select to authenticated using ((select public.app_is_staff()))', t);
  end loop;
end $$;

-- ── websites: {tags} in new stores' templates; tag style + cap ───────────
alter table public.pb_websites alter column tag_rules set default
  '{"templates": ["{category}", "{fabric}", "{color}", "Vendor_{vendor}", "{tags}"], "static": [], "case": "as_is", "ai_extra": true, "ai_extra_max": 5, "max_tags": 30, "tag_style": "plain"}'::jsonb;


-- ── the ready gate + the tags cache (tagGate.ts is the edge twin) ────────
-- For each product: missing_attrs = the category's attributes with no value
-- (in the category's order), tags = the chosen value names (taxonomy order),
-- and Ready ↔ Needs info: Ready needs a price (cost or a copied selling price),
-- a category and nothing missing. new / reading / archived never move, and a
-- Needs-info product that was never read (held while its photos upload from
-- the app) is not made Ready. route_due marks one that just became Ready (the
-- worker routes it). Rows are written only when something changed (no
-- updated_at churn); every product asked about is returned.
create index if not exists pb_products_category_lower_idx on public.pb_products (lower(category), status);
create or replace function public.pb_products_refresh(p_ids uuid[])
returns table (id uuid, status text, was text, missing text[])
language sql security invoker set search_path = public as $$
  with cur as (
    select p.id, p.status as was, p.category, p.cost_price, p.sell_price, p.ai_read_at, p.ai_error, p.missing_attrs, p.tags, p.route_due
    from pb_products p where p.id = any(coalesce(p_ids, '{}')) for update
  ), calc as (
    select c.*,
      coalesce((select array_agg(a.name order by ca.position, a.position, a.name)
        from pb_category_attributes ca join pb_attributes a on a.id = ca.attribute_id
        where lower(ca.category) = lower(c.category)
          and not exists (select 1 from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id
                          where pv.product_id = c.id and v.attribute_id = a.id)), '{}') as miss,
      coalesce((select array_agg(v.name order by a.position, a.name, v.position, v.name)
        from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id join pb_attributes a on a.id = v.attribute_id
        where pv.product_id = c.id), '{}') as names
    from cur c
  ), gate as (
    select calc.*, case
      when calc.was not in ('ready', 'needs_info') then calc.was
      when not ((calc.cost_price is not null or calc.sell_price is not null) and coalesce(trim(calc.category), '') <> '' and cardinality(calc.miss) = 0) then 'needs_info'
      when calc.was = 'needs_info' and calc.ai_read_at is null and calc.ai_error is null then 'needs_info'
      else 'ready' end as next
    from calc
  ), upd as (
    update pb_products p set missing_attrs = g.miss, tags = g.names, status = g.next,
      route_due = case when g.next = 'ready' and g.was = 'needs_info' then true when g.next <> 'ready' then false else g.route_due end
    from gate g
    where p.id = g.id and (g.missing_attrs is distinct from g.miss or g.tags is distinct from g.names or g.was is distinct from g.next)
    returning p.id
  )
  select g.id, g.next, g.was, g.miss from gate g;
$$;

-- ── a product's values in one transaction ────────────────────────────────
-- p_rows = [{"value_id": uuid, "source": "rules"|"ai"}]. Modes:
--   auto    the rules / AI rows are replaced; an attribute holding a 'manual'
--           value is left alone (reader, retag, ingest)
--   manual  staff's choice: the rows of p_attributes (or all) are replaced, as
--           'manual' (product_values_set)
--   add     only attributes with no value at all get the rows ("Let AI decide")
-- Unknown value ids are skipped. Returns the product after the gate.
create or replace function public.pb_product_values_set(p_product uuid, p_rows jsonb, p_mode text default 'auto', p_attributes uuid[] default null)
returns table (id uuid, status text, was text, missing text[])
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
begin
  if p_mode not in ('auto', 'manual', 'add') then raise exception 'Unknown way to save values.'; end if;
  perform 1 from pb_products p where p.id = p_product for update;
  if not found then raise exception 'That product no longer exists.'; end if;
  if p_mode in ('auto', 'manual') then
    delete from pb_product_values pv using pb_attribute_values v
    where pv.product_id = p_product and v.id = pv.value_id and (p_mode = 'manual' or pv.source <> 'manual')
      and (p_attributes is null or v.attribute_id = any(p_attributes));
  end if;
  insert into pb_product_values (product_id, value_id, source)
  select p_product, v.id, case when p_mode = 'manual' then 'manual' else r.src end
  from (select (x->>'value_id') vid, coalesce(nullif(x->>'source', ''), 'rules') src from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x) r
  join pb_attribute_values v on v.id::text = r.vid
  where (p_mode = 'manual' or r.src in ('rules', 'ai'))
    and (p_mode = 'manual' or not exists (
      select 1 from pb_product_values x join pb_attribute_values xv on xv.id = x.value_id
      where x.product_id = p_product and xv.attribute_id = v.attribute_id and (x.source = 'manual' or p_mode = 'add')))
  on conflict on constraint pb_product_values_pkey do nothing;
  return query select * from pb_products_refresh(array[p_product]);
end $$;

-- Retag in batches: p_rows = [{"product_id": uuid, "rows": [...]}, …] in 'auto' mode; gone products skipped.
create or replace function public.pb_product_values_bulk(p_rows jsonb)
returns table (id uuid, status text, was text, missing text[])
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare x jsonb;
begin
  for x in select e from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e order by e->>'product_id' loop
    if exists (select 1 from pb_products p where p.id::text = x->>'product_id') then
      return query select * from pb_product_values_set((x->>'product_id')::uuid, x->'rows', 'auto', null);
    end if;
  end loop;
end $$;

-- ── structure changes that move products ────────────────────────────────
-- Products in a category that lack a value of an attribute (the "12 products will need a Colour" warning).
create or replace function public.pb_category_lacking(p_category text, p_attribute uuid) returns int
language sql security invoker stable set search_path = public as $$
  select count(*)::int from pb_products p
  where lower(p.category) = lower(p_category) and p.status <> 'archived'
    and not exists (select 1 from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id
                    where pv.product_id = p.id and v.attribute_id = p_attribute);
$$;

-- Per link: products in the category and how many lack the attribute; per category: products.
create or replace function public.pb_tag_link_stats()
returns table (category text, attribute_id uuid, products int, lacking int)
language sql security invoker stable set search_path = public as $$
  select ca.category, ca.attribute_id, count(p.id)::int,
    count(p.id) filter (where not exists (select 1 from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id
                                          where pv.product_id = p.id and v.attribute_id = ca.attribute_id))::int
  from pb_category_attributes ca
  left join pb_products p on lower(p.category) = lower(ca.category) and p.status <> 'archived'
  group by ca.category, ca.attribute_id;
$$;
-- How many products carry each value (the Tags page chips).
create or replace function public.pb_tag_value_uses()
returns table (value_id uuid, n int)
language sql security invoker stable set search_path = public as $$
  select pv.value_id, count(*)::int from pb_product_values pv group by pv.value_id;
$$;
create or replace function public.pb_tag_category_counts()
returns table (category text, products int)
language sql security invoker stable set search_path = public as $$
  select p.category, count(*)::int from pb_products p where p.status <> 'archived' and coalesce(p.category, '') <> '' group by p.category;
$$;

-- A category's attributes, replaced in the given order; its products re-gated.
create or replace function public.pb_category_links_set(p_category text, p_attribute_ids uuid[])
returns table (to_needs_info int, to_ready int)
language plpgsql security invoker set search_path = public as $$
begin
  if coalesce(trim(p_category), '') = '' then raise exception 'Pick a category.'; end if;
  delete from pb_category_attributes ca where lower(ca.category) = lower(p_category);
  insert into pb_category_attributes (category, attribute_id, position)
  select trim(p_category), a.id, u.ord::int from unnest(coalesce(p_attribute_ids, '{}')) with ordinality u(aid, ord)
  join pb_attributes a on a.id = u.aid
  on conflict (category, attribute_id) do nothing;
  return query
    select (count(*) filter (where r.was = 'ready' and r.status = 'needs_info'))::int, (count(*) filter (where r.was = 'needs_info' and r.status = 'ready'))::int
    from pb_products_refresh(array(select p.id from pb_products p where lower(p.category) = lower(p_category) and p.status <> 'archived')) r;
end $$;

-- Categories removed from the list (Tags page) lose their links; their products are re-gated.
create or replace function public.pb_categories_prune(p_keep text[]) returns int
language plpgsql security invoker set search_path = public as $$
declare gone text[]; n int;
begin
  select coalesce(array_agg(distinct lower(ca.category)), '{}') into gone from pb_category_attributes ca
  where not (lower(ca.category) = any(array(select lower(k) from unnest(coalesce(p_keep, '{}')) k)));
  delete from pb_category_attributes ca where lower(ca.category) = any(gone);
  select count(*) into n from pb_products_refresh(array(select p.id from pb_products p where lower(p.category) = any(gone) and p.status <> 'archived'));
  return n;
end $$;

-- Delete an attribute (its values, links and product values cascade); the products it touched are re-gated.
create or replace function public.pb_attribute_delete(p_id uuid) returns int
language plpgsql security invoker set search_path = public as $$
declare ids uuid[]; n int;
begin
  select array(select p.id from pb_products p where p.status <> 'archived' and (
      exists (select 1 from pb_category_attributes ca where ca.attribute_id = p_id and lower(ca.category) = lower(p.category))
      or exists (select 1 from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id where pv.product_id = p.id and v.attribute_id = p_id)))
    into ids;
  delete from pb_attributes where pb_attributes.id = p_id;
  if not found then raise exception 'That attribute no longer exists.'; end if;
  select count(*) into n from pb_products_refresh(ids);
  return n;
end $$;

create or replace function public.pb_value_delete(p_id uuid) returns int
language plpgsql security invoker set search_path = public as $$
declare ids uuid[]; n int;
begin
  select array(select pv.product_id from pb_product_values pv where pv.value_id = p_id) into ids;
  delete from pb_attribute_values where pb_attribute_values.id = p_id;
  if not found then raise exception 'That value no longer exists.'; end if;
  select count(*) into n from pb_products_refresh(ids);
  return n;
end $$;

-- Merge p_from into p_into (same attribute): products move over (a 'manual' choice stays manual),
-- p_from's name and "also known as" words become p_into's, p_from is deleted. Returns products moved.
create or replace function public.pb_value_merge(p_from uuid, p_into uuid) returns int
language plpgsql security invoker set search_path = public as $$
declare f pb_attribute_values; i pb_attribute_values; ids uuid[];
begin
  select * into f from pb_attribute_values where pb_attribute_values.id = p_from for update;
  select * into i from pb_attribute_values where pb_attribute_values.id = p_into for update;
  if f.id is null or i.id is null then raise exception 'That value no longer exists.'; end if;
  if f.id = i.id then raise exception 'Pick another value to merge into.'; end if;
  if f.attribute_id <> i.attribute_id then raise exception 'Values can only be merged within one attribute.'; end if;
  select array(select pv.product_id from pb_product_values pv where pv.value_id = f.id) into ids;
  insert into pb_product_values (product_id, value_id, source)
    select pv.product_id, i.id, pv.source from pb_product_values pv where pv.value_id = f.id
    on conflict on constraint pb_product_values_pkey do update set source = case when excluded.source = 'manual' then 'manual' else pb_product_values.source end;
  update pb_attribute_values set aliases = array(select distinct x from unnest(i.aliases || f.key || f.aliases) x where x <> i.key and x <> '' order by 1)
    where pb_attribute_values.id = i.id;
  update pb_tag_suggestions set resolved_value_id = i.id where resolved_value_id = f.id;
  delete from pb_attribute_values where pb_attribute_values.id = f.id;
  perform 1 from pb_products_refresh(ids);
  return coalesce(cardinality(ids), 0);
end $$;

-- ── suggestions ──────────────────────────────────────────────────────────
-- p_rows = [{"phrase", "key", "attribute_id"?, "source", "product_id"?}]. A key staff ignored (under any
-- attribute) is skipped; a pending one gets uses + 1 for a product not yet counted in its examples (≤ 5
-- examples kept) and last_seen_at; added / aliased ones are left as they are. Returns rows written.
create or replace function public.pb_tag_suggest(p_rows jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare r jsonb; k text; a uuid; pid uuid; src text; n int := 0;
begin
  for r in select x from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x order by x->>'key', x->>'attribute_id' loop
    k := nullif(trim(r->>'key'), '');
    if k is null or length(k) > 80 then continue; end if;
    if exists (select 1 from pb_tag_suggestions s where s.key = k and s.status = 'ignored') then continue; end if;
    select at.id into a from pb_attributes at where at.id::text = r->>'attribute_id';
    select p.id into pid from pb_products p where p.id::text = r->>'product_id';
    src := case when r->>'source' in ('store', 'ai', 'text') then r->>'source' else 'store' end;
    insert into pb_tag_suggestions (phrase, key, attribute_id, uses, examples, source)
    values (left(coalesce(nullif(trim(r->>'phrase'), ''), k), 80), k, a, 1, case when pid is null then '{}' else array[pid] end, src)
    on conflict (key, (coalesce(attribute_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update set
      uses = pb_tag_suggestions.uses + case when pid is null or pid = any(pb_tag_suggestions.examples) then 0 else 1 end,
      examples = case when pid is null or pid = any(pb_tag_suggestions.examples) or cardinality(pb_tag_suggestions.examples) >= 5
                      then pb_tag_suggestions.examples else pb_tag_suggestions.examples || pid end,
      last_seen_at = now()
    where pb_tag_suggestions.status = 'pending';
    n := n + 1;
    a := null; pid := null;
  end loop;
  return n;
end $$;

-- ── "Let AI decide" progress: one product done ───────────────────────────
create or replace function public.pb_tag_fill_tick(p_run uuid, p_filled int, p_left int) returns void
language sql security invoker set search_path = public as $$
  update pb_tag_fill_runs r set filled = r.filled + greatest(0, p_filled), left_empty = r.left_empty + greatest(0, p_left),
    finished_at = case when exists (select 1 from pb_products p where p.tag_fill_run = p_run) then null else coalesce(r.finished_at, now()) end
  where r.id = p_run;
$$;

do $$ declare f text; begin
  foreach f in array array[
    'pb_product_values_set(uuid, jsonb, text, uuid[])', 'pb_product_values_bulk(jsonb)', 'pb_category_lacking(text, uuid)',
    'pb_tag_link_stats()', 'pb_tag_value_uses()', 'pb_tag_category_counts()', 'pb_category_links_set(text, uuid[])', 'pb_categories_prune(text[])',
    'pb_attribute_delete(uuid)', 'pb_value_delete(uuid)', 'pb_value_merge(uuid, uuid)', 'pb_tag_suggest(jsonb)', 'pb_tag_fill_tick(uuid, int, int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- The product page re-applies the gate after a facts save (ProductFacts.tsx): staff may run it (RLS applies).
  revoke all on function public.pb_products_refresh(uuid[]) from public, anon;
  grant execute on function public.pb_products_refresh(uuid[]) to authenticated, service_role;
end $$;
