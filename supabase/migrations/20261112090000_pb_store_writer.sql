-- Playbook: one store, one voice (owner, 2026-11-12).
--
-- Why:
--   1. "Different content, alt, title, description, meta … for each store":
--      a listing now also carries the search phrase it was written for, its
--      two questions (FAQ), the facts the writer missed and what the program
--      checks noted. These live beside the listing in private.pb_listing_seo
--      (the `private` schema is not served by the API), reached only through
--      two SECURITY DEFINER functions that let in the service role (the
--      pb-products edge function) and signed-in staff, and nobody else.
--   2. "If a few necessary details are not there … do not auto generate until
--      everything is ok": the Ready gate (pb_products_refresh) now also needs
--      a fabric, a colour and at least one photo. A product missing one stays
--      Needs info, so it is not routed and nothing is written for it.
--   3. "AI costing for each listing in rupees, combined of all websites":
--      pb_ai_costs adds up what the reader, the tag filler and the writer
--      spent per product (pb_activity details.usd); pb_ai_cost_since gives the
--      total since a date for the dashboard. The app turns dollars into rupees.
--
-- Everything here is additive (new table, new / replaced functions, one
-- index, grants). The REVOKEs that take EXECUTE away from anon are at the
-- end; where they cannot be applied by the migration tool they go in the
-- owner's paste-in file. The functions check the caller themselves, so they
-- are safe either way.

-- ── 1. What a listing carries besides its row ────────────────────────────
create table if not exists private.pb_listing_seo (
  listing_id uuid primary key references public.pb_listings (id) on delete cascade,
  keyword text,                                  -- the search phrase the listing was written for
  keyword_locked boolean not null default false, -- typed by hand: Regenerate keeps it
  faq jsonb not null default '[]'::jsonb,        -- [{ "q": …, "a": … }]
  faq_locked boolean not null default false,     -- edited by hand: Regenerate keeps it
  missing text[] not null default '{}',          -- facts the writer wanted and was not given
  notes text[] not null default '{}',            -- what the checks found, in plain sentences
  rewrites int not null default 0,
  updated_at timestamptz not null default now()
);
comment on table private.pb_listing_seo is 'Playbook: per-listing search phrase, FAQ, missed facts and check notes. Read / written only through pb_listing_seo_get / pb_listing_seo_put.';

create or replace function public.pb_listing_seo_get(p_ids uuid[])
returns table (listing_id uuid, keyword text, keyword_locked boolean, faq jsonb, faq_locked boolean, missing text[], notes text[], rewrites int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
          or (select public.app_is_staff())) then
    raise exception 'Only staff can read this.' using errcode = '42501';
  end if;
  return query
    select s.listing_id, s.keyword, s.keyword_locked, s.faq, s.faq_locked, s.missing, s.notes, s.rewrites
    from private.pb_listing_seo s
    where s.listing_id = any(coalesce(p_ids, '{}'));
end $$;

-- Only the keys present in p_set are changed: keyword, keyword_locked, faq, faq_locked, missing, notes, rewrites.
create or replace function public.pb_listing_seo_put(p_listing uuid, p_set jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  arr constant jsonb := '[]'::jsonb;
begin
  if not (coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
          or (select public.app_is_staff())) then
    raise exception 'Only staff can change this.' using errcode = '42501';
  end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' or pg_column_size(p_set) > 20000 then
    raise exception 'That is too much text to save here.';
  end if;
  if not exists (select 1 from public.pb_listings l where l.id = p_listing) then
    raise exception 'That listing no longer exists.';
  end if;
  insert into private.pb_listing_seo as s (listing_id, keyword, keyword_locked, faq, faq_locked, missing, notes, rewrites)
  values (
    p_listing,
    nullif(left(btrim(p_set ->> 'keyword'), 120), ''),
    coalesce((p_set ->> 'keyword_locked')::boolean, false),
    case when jsonb_typeof(p_set -> 'faq') = 'array' then p_set -> 'faq' else arr end,
    coalesce((p_set ->> 'faq_locked')::boolean, false),
    array(select jsonb_array_elements_text(case when jsonb_typeof(p_set -> 'missing') = 'array' then p_set -> 'missing' else arr end)),
    array(select jsonb_array_elements_text(case when jsonb_typeof(p_set -> 'notes') = 'array' then p_set -> 'notes' else arr end)),
    coalesce((p_set ->> 'rewrites')::int, 0)
  )
  on conflict (listing_id) do update set
    keyword = case when p_set ? 'keyword' then excluded.keyword else s.keyword end,
    keyword_locked = case when p_set ? 'keyword_locked' then excluded.keyword_locked else s.keyword_locked end,
    faq = case when p_set ? 'faq' then excluded.faq else s.faq end,
    faq_locked = case when p_set ? 'faq_locked' then excluded.faq_locked else s.faq_locked end,
    missing = case when p_set ? 'missing' then excluded.missing else s.missing end,
    notes = case when p_set ? 'notes' then excluded.notes else s.notes end,
    rewrites = case when p_set ? 'rewrites' then excluded.rewrites else s.rewrites end,
    updated_at = now();
end $$;

grant execute on function public.pb_listing_seo_get(uuid[]) to authenticated, service_role;
grant execute on function public.pb_listing_seo_put(uuid, jsonb) to authenticated, service_role;

-- ── 2. The Ready gate also needs fabric, colour and a photo ──────────────
-- As 20261110090000_pb_tags.sql, plus three necessary details. missing_attrs
-- stays the list of required TAG attributes only ("Let AI decide" fills those);
-- the app names a missing fabric / colour / photo from the product itself.
create or replace function public.pb_products_refresh(p_ids uuid[])
returns table (id uuid, status text, was text, missing text[])
language sql security invoker set search_path = public as $$
  with cur as (
    select p.id, p.status as was, p.category, p.cost_price, p.sell_price, p.fabric, p.color, p.ai_read_at, p.ai_error, p.missing_attrs, p.tags, p.route_due
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
        where pv.product_id = c.id), '{}') as names,
      (coalesce(btrim(c.fabric), '') <> '' and coalesce(btrim(c.color), '') <> ''
        and exists (select 1 from pb_product_images i where i.product_id = c.id and i.kind = 'image')) as has_details
    from cur c
  ), gate as (
    select calc.*, case
      when calc.was not in ('ready', 'needs_info') then calc.was
      when not ((calc.cost_price is not null or calc.sell_price is not null) and coalesce(trim(calc.category), '') <> '' and cardinality(calc.miss) = 0 and calc.has_details) then 'needs_info'
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

-- ── 3. What the AI cost, per product and since a date ────────────────────
-- SECURITY INVOKER: pb_activity's own staff-read policy applies. A details.usd
-- that is not a number (a row typed by hand) counts as 0 instead of failing.
create index if not exists pb_activity_ai_cost_idx on public.pb_activity (created_at) where details ? 'usd';

create or replace function public.pb_ai_costs(p_ids uuid[])
returns table (product_id uuid, read_usd numeric, tag_usd numeric, write_usd numeric, writes int)
language sql stable security invoker set search_path = public as $$
  select a.product_id,
    coalesce(sum(u.usd) filter (where a.action = 'read'), 0),
    coalesce(sum(u.usd) filter (where a.action = 'tags_filled'), 0),
    coalesce(sum(u.usd) filter (where a.action = 'generated'), 0),
    (count(*) filter (where a.action = 'generated'))::int
  from pb_activity a
  cross join lateral (select case when jsonb_typeof(a.details -> 'usd') = 'number' then (a.details ->> 'usd')::numeric else 0 end as usd) u
  where a.product_id = any(coalesce(p_ids, '{}')) and a.details ? 'usd' and a.action in ('read', 'tags_filled', 'generated')
  group by a.product_id;
$$;

create or replace function public.pb_ai_cost_since(p_since timestamptz)
returns table (usd numeric, products int, writes int)
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(u.usd), 0), (count(distinct a.product_id))::int, (count(*) filter (where a.action = 'generated'))::int
  from pb_activity a
  cross join lateral (select case when jsonb_typeof(a.details -> 'usd') = 'number' then (a.details ->> 'usd')::numeric else 0 end as usd) u
  where a.created_at >= p_since and a.details ? 'usd' and a.action in ('read', 'tags_filled', 'generated');
$$;

grant execute on function public.pb_ai_costs(uuid[]) to authenticated, service_role;
grant execute on function public.pb_ai_cost_since(timestamptz) to authenticated, service_role;

-- ── 4. Nobody signed out needs these ─────────────────────────────────────
revoke all on function public.pb_listing_seo_get(uuid[]) from public, anon;
revoke all on function public.pb_listing_seo_put(uuid, jsonb) from public, anon;
revoke all on function public.pb_ai_costs(uuid[]) from public, anon;
revoke all on function public.pb_ai_cost_since(timestamptz) from public, anon;
