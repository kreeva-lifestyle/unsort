-- Playbook · Tags (owner, 2026-11-10): "product tags are not getting fetched;
-- we need a unified way to tackle a lot of tags — scraping a website gives a
-- lot of them."
--
-- Before: a product's tags lived only in attributes.store_tags (one comma
-- string copied from the other store, junk included: _altnew_KBSUIT25,
-- _label_BUY 1 GET 1 FREE, SIZE_CHART…) and reached a website only through
-- the {attr:store_tags} template. Now:
--   pb_products.tags   the product's OWN clean tag set — the one source every
--                      website builds from ({tags} in a site's templates).
--                      Built by the edge function's tag engine (tagEngine.ts)
--                      from the facts (category, fabric, colour, occasion,
--                      work, pattern), the store's tags after cleaning, the
--                      AI's extra tags and what staff typed.
--   pb_tags            the library: one row per distinct tag with its kind,
--                      hidden (never sent to any website; a tag staff hid STAYS
--                      on the products so un-hiding restores it; a tag the
--                      rules hid is listed hidden with 0 products so staff can
--                      see it and un-hide it), merged_into (alias → canonical),
--                      source, uses (how many products carry it — kept by a
--                      trigger on pb_products.tags, never by hand), reviewed_at
--                      (the review queue = never reviewed; rows the rules hid
--                      arrive reviewed so the queue holds only real decisions).
--   pb_settings 'tags' the cleaning rules (hide patterns, max per product…).
-- SQL functions (staff + service role): pb_tags_bump (library rows for new
-- names), pb_tag_merge, pb_tag_hide, pb_tag_rename, pb_tags_review (queue with
-- example products), pb_products_set_tags (bulk re-clean write),
-- pb_product_add_tags (the writer's extra tags, added in one statement so two
-- websites writing the same product never lose each other's tags).
-- Every writer takes pb_tags row locks in KEY ORDER (the trigger, pb_tags_bump),
-- so two products saved at once cannot deadlock on their shared tags.
-- Safe to re-run: every statement is "if not exists" / "or replace" and the
-- backfill touches only products whose tags are still empty.

-- ── pb_products.tags ──────────────────────────────────────────────────────
alter table public.pb_products add column if not exists tags text[] not null default '{}';
create index if not exists pb_products_tags_idx on public.pb_products using gin (tags);

-- ── pb_tags (the library) ─────────────────────────────────────────────────
create table if not exists public.pb_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,                               -- display form ("Kurtas & Suits")
  key text not null unique,                         -- lower, trimmed, single spaces
  kind text not null default 'other' check (kind in ('collection','category','fabric','colour','occasion','style','work','size','other')),
  hidden boolean not null default false,            -- never sent to a website; stays on the products
  merged_into uuid references public.pb_tags(id) on delete set null,  -- alias → canonical tag
  source text not null default 'store' check (source in ('store','ai','manual','facts')),
  uses int not null default 0,                      -- products carrying it (trigger-owned)
  reviewed_at timestamptz,                          -- null = still in the review queue
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pb_tags_uses_idx on public.pb_tags (uses desc, name);
create index if not exists pb_tags_kind_idx on public.pb_tags (kind, hidden);
create index if not exists pb_tags_review_idx on public.pb_tags (first_seen_at desc) where reviewed_at is null;
create index if not exists pb_tags_merged_idx on public.pb_tags (merged_into) where merged_into is not null;
-- The rows the tag engine loads on every run (tagStore.ts loadLibrary): hidden, aliases and reviewed tags.
create index if not exists pb_tags_engine_idx on public.pb_tags (key) where hidden or merged_into is not null or reviewed_at is not null;
drop trigger if exists pb_tags_touch on public.pb_tags;
create trigger pb_tags_touch before update on public.pb_tags for each row execute function public.pb_touch();

alter table public.pb_tags enable row level security;
revoke all on public.pb_tags from anon;
drop policy if exists "pb staff read" on public.pb_tags;
drop policy if exists "pb staff insert" on public.pb_tags;
drop policy if exists "pb staff update" on public.pb_tags;
drop policy if exists "pb staff delete" on public.pb_tags;
create policy "pb staff read" on public.pb_tags for select to authenticated using ((select public.app_is_staff()));
create policy "pb staff insert" on public.pb_tags for insert to authenticated with check ((select public.app_is_staff()));
create policy "pb staff update" on public.pb_tags for update to authenticated using ((select public.app_is_staff())) with check ((select public.app_is_staff()));
create policy "pb staff delete" on public.pb_tags for delete to authenticated using ((select public.app_is_staff()));

-- ── settings: cleaning rules (the edge function validates edits) ─────────
insert into public.pb_settings (key, value) values
  ('tags', '{"hide_patterns": ["^_", "^size[_ ]?chart$", "^label[_ ]", "^[a-z]{1,3}\\d{2,}$"], "hide_exact": [], "max_per_product": 25, "min_len": 2, "title_case": true, "auto_hide_codes": true}'::jsonb)
on conflict (key) do nothing;

-- New websites start with {tags} in their templates and a 30-tag cap; existing sites keep their rules.
-- Vendor_{vendor} comes before {tags} so a big tag set never pushes the vendor tag past the cap.
alter table public.pb_websites alter column tag_rules set default
  '{"templates": ["{category}", "{fabric}", "{color}", "Vendor_{vendor}", "{tags}"], "static": [], "case": "as_is", "ai_extra": true, "ai_extra_max": 5, "max_tags": 30}'::jsonb;

-- ── helpers ──────────────────────────────────────────────────────────────
-- The library key of a display name: lower, trimmed, single spaces (tagClean.ts tagKey does the same).
create or replace function public.pb_tag_key(p_name text) returns text
language sql immutable strict set search_path = public as $$
  select lower(trim(regexp_replace(p_name, '\s+', ' ', 'g')));
$$;

-- Replace one tag by another in a product's tag array (matched by key), keeping order and dropping repeats.
create or replace function public.pb_tags_replace(p_tags text[], p_from text, p_to text) returns text[]
language plpgsql immutable set search_path = public as $$
declare t text; out_tags text[] := '{}'; seen text[] := '{}'; k text; v text;
begin
  foreach t in array coalesce(p_tags, '{}') loop
    v := case when pb_tag_key(t) = pb_tag_key(p_from) then p_to else t end;
    k := pb_tag_key(v);
    if k is null or k = '' or k = any(seen) then continue; end if;
    seen := seen || k; out_tags := out_tags || v;
  end loop;
  return out_tags;
end $$;

-- ── library rows for names (first spelling kept; counts are the trigger's) ─
-- p_hidden = true: rows for tags the RULES hid (so staff can see and un-hide them); they arrive
-- reviewed, so the queue stays for real decisions. An existing row only gets last_seen_at.
drop function if exists public.pb_tags_bump(text[], text);
create or replace function public.pb_tags_bump(p_names text[], p_source text default 'store', p_hidden boolean default false) returns int
language plpgsql security invoker set search_path = public as $$
declare n int := 0; t text; k text;
begin
  if p_source not in ('store','ai','manual','facts') then p_source := 'store'; end if;
  -- key order: every writer locks pb_tags rows in the same order (no deadlocks)
  foreach t in array (select coalesce(array_agg(x order by pb_tag_key(x)), '{}') from unnest(coalesce(p_names, '{}')) x) loop
    t := trim(regexp_replace(t, '\s+', ' ', 'g')); k := pb_tag_key(t);
    if k = '' or length(t) > 255 then continue; end if;
    insert into pb_tags (name, key, source, hidden, reviewed_at) values (t, k, p_source, p_hidden, case when p_hidden then now() end)
      on conflict (key) do update set last_seen_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

-- uses = products carrying the tag. One trigger owns it (CLAUDE.md: let triggers own derived fields):
-- added keys +1 (a missing library row is created as 'manual'), removed keys −1. Rows are touched
-- one at a time in key order (see pb_tags_bump). SECURITY INVOKER: every writer of pb_products is
-- staff (RLS lets staff insert / update pb_tags) or the service role.
create or replace function public.pb_products_tags_count() returns trigger
language plpgsql security invoker set search_path = public as $$
declare old_keys text[] := '{}'; new_keys text[] := '{}'; t text; k text;
begin
  -- pb_tag_rename rewrites the same tag under a new name: the counts do not move
  if current_setting('pb.skip_tag_count', true) = '1' then return null; end if;
  if tg_op <> 'INSERT' then select coalesce(array_agg(distinct pb_tag_key(x)), '{}') into old_keys from unnest(old.tags) x; end if;
  if tg_op <> 'DELETE' then
    foreach t in array (select coalesce(array_agg(x order by pb_tag_key(x)), '{}') from unnest(coalesce(new.tags, '{}')) x) loop
      k := pb_tag_key(t);
      if k = '' or k = any(new_keys) then continue; end if;
      new_keys := new_keys || k;
      if not (k = any(old_keys)) then
        insert into pb_tags (name, key, source) values (trim(regexp_replace(t, '\s+', ' ', 'g')), k, 'manual')
          on conflict (key) do update set last_seen_at = now();
      end if;
    end loop;
  end if;
  for k in select x from unnest(new_keys) x except select x from unnest(old_keys) x order by 1 loop
    update pb_tags set uses = uses + 1 where key = k;
  end loop;
  for k in select x from unnest(old_keys) x except select x from unnest(new_keys) x order by 1 loop
    update pb_tags set uses = greatest(0, uses - 1) where key = k;
  end loop;
  return null;
end $$;
drop trigger if exists pb_products_tags_count on public.pb_products;
create trigger pb_products_tags_count after insert or update of tags or delete on public.pb_products
  for each row execute function public.pb_products_tags_count();

-- ── staff actions on the library ─────────────────────────────────────────
-- Merge: p_from becomes an alias of p_into (and so does anything already merged into p_from);
-- every product's tags are rewritten from the alias to the canonical name (uses follow via the trigger).
create or replace function public.pb_tag_merge(p_from uuid, p_into uuid) returns int
language plpgsql security invoker set search_path = public as $$
declare f pb_tags; i pb_tags; n int;
begin
  select * into f from pb_tags where id = p_from;
  select * into i from pb_tags where id = p_into;
  if f.id is null or i.id is null then raise exception 'That tag no longer exists.'; end if;
  -- the target must be canonical: follow one alias hop, never a loop
  if i.merged_into is not null then select * into i from pb_tags where id = i.merged_into; end if;
  if i.id = f.id or i.merged_into is not null then raise exception 'Those tags cannot be merged into each other.'; end if;
  update pb_tags set merged_into = i.id, reviewed_at = coalesce(reviewed_at, now()) where id = f.id or merged_into = f.id;
  update pb_products set tags = pb_tags_replace(tags, f.name, i.name) where tags && array[f.name] or exists (select 1 from unnest(tags) x where pb_tag_key(x) = f.key);
  get diagnostics n = row_count;
  return n;
end $$;

-- Hide / un-hide: a hidden tag is left out of every website's tags but stays on the products.
create or replace function public.pb_tag_hide(p_id uuid, p_hidden boolean) returns void
language sql security invoker set search_path = public as $$
  update pb_tags set hidden = p_hidden, reviewed_at = coalesce(reviewed_at, now()) where id = p_id;
$$;

-- Rename: new display name + key (must stay unique: merge instead when a real tag has it; an alias
-- row that holds the key is dropped, since the renamed tag takes its place); products are rewritten.
create or replace function public.pb_tag_rename(p_id uuid, p_name text) returns int
language plpgsql security invoker set search_path = public as $$
declare r pb_tags; nm text; k text; n int;
begin
  nm := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); k := pb_tag_key(nm);
  if k = '' or length(nm) > 255 then raise exception 'Give the tag a name.'; end if;
  select * into r from pb_tags where id = p_id;
  if r.id is null then raise exception 'That tag no longer exists.'; end if;
  if exists (select 1 from pb_tags where key = k and id <> p_id and merged_into is null) then raise exception 'A tag with that name already exists — merge into it instead.'; end if;
  delete from pb_tags where key = k and id <> p_id and merged_into is not null;
  update pb_tags set name = nm, key = k, reviewed_at = coalesce(reviewed_at, now()) where id = p_id;
  -- the same products keep the same tag under its new name: the counting trigger must not move uses
  perform set_config('pb.skip_tag_count', '1', true);
  update pb_products set tags = pb_tags_replace(tags, r.name, nm) where exists (select 1 from unnest(tags) x where pb_tag_key(x) = r.key);
  get diagnostics n = row_count;
  perform set_config('pb.skip_tag_count', '', true);
  return n;
end $$;

-- The review queue: never reviewed, or first seen in the last p_days days; canonical tags only;
-- with up to 3 example product names each.
create or replace function public.pb_tags_review(p_days int default 30, p_limit int default 200)
returns table (id uuid, name text, key text, kind text, hidden boolean, source text, uses int, reviewed_at timestamptz, first_seen_at timestamptz, examples text[])
language sql security invoker stable set search_path = public as $$
  select t.id, t.name, t.key, t.kind, t.hidden, t.source, t.uses, t.reviewed_at, t.first_seen_at,
    coalesce((select array_agg(x.nm) from (select coalesce(p.name, p.sku, 'Untitled') nm from pb_products p
      where p.tags && array[t.name] and p.status <> 'archived' order by p.created_at desc limit 3) x), '{}')
  from pb_tags t
  where t.merged_into is null and (t.reviewed_at is null or t.first_seen_at > now() - make_interval(days => greatest(1, p_days)))
  order by t.reviewed_at nulls first, t.uses desc, t.name
  limit greatest(1, least(p_limit, 1000));
$$;

-- Bulk tag write for the re-clean: p_rows = [{"id": uuid, "tags": [..]}, …]; only existing products change.
create or replace function public.pb_products_set_tags(p_rows jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update pb_products p set tags = r.tags
  from (select (x->>'id')::uuid id, coalesce(array(select e from jsonb_array_elements_text(x->'tags') e where e is not null), '{}') tags
        from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x) r
  where p.id = r.id and p.tags is distinct from r.tags;
  get diagnostics n = row_count;
  return n;
end $$;

-- The writer's extra tags (generate.ts): added to the product's tags in ONE statement, so two websites
-- writing the same product at once, or staff saving tags meanwhile, never overwrite each other. The
-- tags already there always stay; new ones fill the room up to p_max. Null = not added (the product is
-- being read, its 'tags' are locked, or it no longer exists).
create or replace function public.pb_product_add_tags(p_id uuid, p_names text[], p_max int default 25) returns text[]
language plpgsql security invoker set search_path = public as $$
declare cur text[]; out_tags text[] := '{}'; seen text[] := '{}'; t text; k text;
begin
  select tags into cur from pb_products where id = p_id and status <> 'reading' and not ('tags' = any(locked)) for update;
  if not found then return null; end if;
  foreach t in array coalesce(cur, '{}') loop
    k := pb_tag_key(t);
    if k = '' or k = any(seen) then continue; end if;
    seen := seen || k; out_tags := out_tags || t;
  end loop;
  foreach t in array coalesce(p_names, '{}') loop
    t := trim(regexp_replace(t, '\s+', ' ', 'g')); k := pb_tag_key(t);
    if k = '' or length(t) > 255 or k = any(seen) then continue; end if;
    if coalesce(array_length(out_tags, 1), 0) >= greatest(1, p_max) then exit; end if;
    seen := seen || k; out_tags := out_tags || t;
  end loop;
  if out_tags is distinct from cur then update pb_products set tags = out_tags where id = p_id; end if;
  return out_tags;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'pb_tag_key(text)', 'pb_tags_replace(text[], text, text)', 'pb_tags_bump(text[], text, boolean)', 'pb_tag_merge(uuid, uuid)',
    'pb_tag_hide(uuid, boolean)', 'pb_tag_rename(uuid, text)', 'pb_tags_review(int, int)', 'pb_products_set_tags(jsonb)',
    'pb_product_add_tags(uuid, text[], int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- The counting trigger fires inside every staff write of pb_products.tags, so the
  -- writer keeps EXECUTE (a trigger function cannot be called directly anyway).
  revoke all on function public.pb_products_tags_count() from public, anon;
  grant execute on function public.pb_products_tags_count() to authenticated, service_role;
end $$;

-- ── BACKFILL (one-off, safe to re-run: only products with no tags yet and 'tags' not locked) ──
-- Mirrors tagEngine.ts for the products that exist today: facts (category, fabric, colour,
-- occasion, work, pattern — each split on commas, short pieces only), then the store's tags,
-- cleaned with the DEFAULT rules (hide patterns, min length 2, codes: '_' prefix, letters+digits
-- without a vowel, letters then a number like KBSUIT25, > 60 % digits; sizes like XL / 3XL are
-- words), title-cased when all lower / all upper (short all-caps words such as XL, UK, USA stay),
-- deduped by key, at most 25. Library rows are made first with the right source (facts, then
-- store, then the store tags the rules hid as hidden + reviewed); the trigger then only counts.
create or replace function pg_temp.pb_tag_title(s text) returns text language plpgsql immutable as $$
-- tagClean.ts titleCase: every word lower-cased with its first letter (and the one after - _ /) upper;
-- in an all-upper tag a word of 1–2 letters, a word with a digit, a size (XXL) or a 3-letter tag on its own stays.
declare words text[] := string_to_array(s, ' '); up boolean := s = upper(s); w text; r text; c text; prev text; i int; out_w text[] := '{}';
begin
  foreach w in array words loop
    if up and (w ~ '^[A-Z]{1,2}$' or w ~ '\d' or w ~ '^X{0,4}[SML]$' or (array_length(words, 1) = 1 and w ~ '^[A-Z]{1,3}$')) then
      out_w := out_w || w; continue;
    end if;
    r := ''; prev := '';
    for i in 1..length(w) loop
      c := substr(w, i, 1);
      r := r || case when i = 1 or prev in ('-', '_', '/') then upper(c) else lower(c) end;
      prev := c;
    end loop;
    out_w := out_w || r;
  end loop;
  return array_to_string(out_w, ' ');
end $$;
create or replace function pg_temp.pb_tag_norm(s text) returns text language sql immutable as $$
  -- tagClean.ts normalizeTag: commas → spaces, single spaces, surrounding quotes / # off, Title Case when all lower or all upper
  select case when x = lower(x) or x = upper(x) then pg_temp.pb_tag_title(x) else x end
  from (select trim(both '"''#' from trim(regexp_replace(regexp_replace(coalesce(s, ''), ',', ' ', 'g'), '\s+', ' ', 'g')))) v(x);
$$;
create or replace function pg_temp.pb_tag_keep(s text) returns boolean language sql immutable as $$
  select s is not null and length(s) >= 2 and length(s) <= 255
    and s !~ '^_' and s !~* '^size[_ ]?chart$' and s !~* '^label[_ ]' and s !~* '^[a-z]{1,3}\d{2,}$'
    and (s ~* '^\d?x{0,4}[sml]$' or (
      s !~* '^[a-z]+\d{2,}$' and not (s ~* '^[a-z0-9_-]+$' and s ~ '\d' and s !~* '[aeiou]')
      and not (length(regexp_replace(s, '\D', '', 'g'))::numeric / length(s) > 0.6)));
$$;
drop table if exists pb_tag_fill;
create temp table pb_tag_fill as
with cand as (
  select p.id, c.ord, pg_temp.pb_tag_norm(c.raw) tag, c.src
  from pb_products p
  cross join lateral (
    select u.i ord, u.v raw, 'facts' src
      from unnest(string_to_array(concat_ws(',', p.category, p.fabric, p.color, p.attributes->>'occasion', p.attributes->>'work', p.attributes->>'pattern'), ',')) with ordinality u(v, i)
    union all
    select 100 + u.i, u.st, 'store' from unnest(string_to_array(coalesce(p.attributes->>'store_tags', ''), ',')) with ordinality u(st, i)
  ) c
  where p.tags = '{}' and not ('tags' = any(p.locked)) and c.raw is not null and trim(c.raw) <> ''
    and (c.src = 'store' or (length(trim(c.raw)) <= 40 and array_length(regexp_split_to_array(trim(c.raw), '\s+'), 1) <= 4))
), dedup as (
  select id, ord, tag, src, pg_temp.pb_tag_keep(tag) keep, row_number() over (partition by id, pb_tag_key(tag) order by ord) dup from cand where tag <> ''
), ranked as (
  select id, tag, src, keep, row_number() over (partition by id order by ord) n from dedup where dup = 1 and keep
)
select id, tag, src, keep, n from ranked where n <= 25
union all
select id, tag, src, keep, null from dedup where dup = 1 and not keep and src = 'store' and length(tag) >= 2 and length(tag) <= 255;
-- library rows in source order, then the junk the rules hid (hidden, reviewed), then the products
select pb_tags_bump(array_agg(tag), 'facts') from pb_tag_fill where keep and src = 'facts';
select pb_tags_bump(array_agg(tag), 'store') from pb_tag_fill where keep and src = 'store';
select pb_tags_bump(array_agg(tag), 'store', true) from pb_tag_fill where not keep;
update pb_products p set tags = r.tags
from (select id, array_agg(tag order by n) tags from pb_tag_fill where keep group by id) r
where p.id = r.id;
drop table pb_tag_fill;
