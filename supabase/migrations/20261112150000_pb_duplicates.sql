-- Playbook: "was this product already added?" (owner, 2026-11-12).
--
-- Why: the same design reaches Playbook several times: from the supplier's
-- Telegram post ("Kb-302") and from stores that are copied ("KB 302 XS blue").
-- The owner asked for an automatic judgement: link on an exact design-code
-- match, show the nearest matches as suggestions otherwise, and never treat
-- another colour of the same design as a copy.
--
-- How it is judged (all of it here, so the app, the worker and the gate agree):
--   pb_code_key(sku)        the design code cleaned: "Kb-302", "KB 302 XS blue"
--                           and "KB302" all give KB302; a bare number ("D.No.
--                           302") gives #302 and never links by itself.
--   pb_colour_keys(sku, color)  the colour(s): from the words after the code
--                           ("ROYAL BLUE" → royalblue), else from the product's
--                           colour ("Pink, Wine" → {pink, wine}).
--   same supplier + same design code + colours that overlap (or are unknown)
--                           → the LATER product is a copy: the Ready gate holds
--                           it in Needs info until a person says otherwise.
--   same supplier + same design code + different colours → another colour of
--                           the same design: shown, never held.
--   same code at another supplier, the same number with other letters (KB 25 /
--                           NKB 25), a bare number → a suggestion only.
-- A person's answer per pair is kept in private.pb_dup_verdicts ("same",
-- "colour", "different"), so no pair is asked twice and a wrong link is undone
-- by answering again. Records are linked, never merged: nothing is deleted.
--
-- Everything here is additive (functions, one private table, two indexes,
-- grants). The REVOKEs at the end go in the owner's paste-in file where the
-- migration tool cannot apply them; the functions check the caller themselves.

-- ── 1. The design code and the colours, from what the product already has ──
create or replace function public.pb_code_key(p_sku text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when m.l is not null then m.l[1] || coalesce(nullif(ltrim(m.l[2], '0'), ''), '0')
    when b.n is not null then '#' || coalesce(nullif(ltrim(b.n[1], '0'), ''), '0')
  end
  from (select upper(regexp_replace(coalesce(p_sku, ''), '[^A-Za-z0-9]+', ' ', 'g')) as flat) f
  left join lateral (select regexp_match(f.flat, '^\s*([A-Z]{1,6})\s*([0-9]{2,6}[A-Z]?)(?![A-Z0-9])') as l) m on true
  left join lateral (select regexp_match(f.flat, '^\s*(?:D\s*NO|DNO|DESIGN\s*NO|DESIGN|CODE|NO)?\s*([0-9]{3,6})(?![A-Z0-9])') as n) b on true
$$;

-- The number part alone ("302"), for the near match "same number, other letters".
create or replace function public.pb_code_num(p_sku text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(public.pb_code_key(p_sku), '^[A-Z#]+', '')
$$;

create or replace function public.pb_colour_keys(p_sku text, p_color text) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  with f as (
    select upper(regexp_replace(coalesce(p_sku, ''), '[^A-Za-z0-9]+', ' ', 'g')) as flat, public.pb_code_key(p_sku) is not null as coded
  ), rest as (
    -- what follows the design code, without size words and loose numbers: the colour words
    select case when f.coded then btrim(regexp_replace(
      regexp_replace(f.flat, '^\s*(?:[A-Z]{1,6}\s*[0-9]{2,6}[A-Z]?|(?:D\s*NO|DNO|DESIGN\s*NO|DESIGN|CODE|NO)?\s*[0-9]{3,6})', ''),
      '\m(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|FREE|SIZE|FS|[0-9]{1,3})\M', ' ', 'g')) else '' end as words
    from f
  )
  select case
    when r.words <> '' then array[lower(regexp_replace(r.words, '\s+', '', 'g'))]
    else coalesce((select array_agg(distinct k order by k) from (
      select lower(regexp_replace(c, '[^A-Za-z]+', '', 'g')) as k
      from regexp_split_to_table(coalesce(p_color, ''), '\s*[,/|]\s*') c) x where k <> ''), '{}')
  end
  from rest r
$$;

create index if not exists pb_products_code_key_idx on public.pb_products (public.pb_code_key(sku)) where status <> 'archived';
create index if not exists pb_products_code_num_idx on public.pb_products (vendor_id, public.pb_code_num(sku)) where status <> 'archived';

-- ── 2. What a person answered for a pair (a < b) ─────────────────────────
create table if not exists private.pb_dup_verdicts (
  a uuid not null references public.pb_products (id) on delete cascade,
  b uuid not null references public.pb_products (id) on delete cascade,
  verdict text not null check (verdict in ('same', 'colour', 'different')),
  decided_by uuid,
  decided_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
comment on table private.pb_dup_verdicts is 'Playbook: a person''s answer for two products that look alike (same / colour / different). Read and written only through pb_dup_matches / pb_dup_verdict_set.';
create index if not exists pb_dup_verdicts_b_idx on private.pb_dup_verdicts (b);

-- ── 3. The matches of some products ──────────────────────────────────────
-- kind: held      this product looks like a copy of `other_id`, which was added first (the gate holds it)
--       original  `other_id` was added later and is held as a copy of this product
--       colour    another colour of the same design (also after a person said so)
--       maybe     a suggestion: nearest match, for a person to answer
--       different what a person answered ("same" keeps the pair as held / original)
-- how:  code (same design code, same supplier) · other_vendor (same code, another supplier) · near_code (same number, other letters)
-- The scan itself lives in the private schema (not served by the API, no role check): only the two
-- functions below call it. pb_dup_matches is what the app reads; pb_dup_held is what the gate asks.
create or replace function private.pb_dup_scan(p_ids uuid[])
returns table (product_id uuid, other_id uuid, kind text, how text, other_name text, other_sku text, other_color text,
               other_source text, other_ref text, other_status text, other_created timestamptz, other_photo text)
language sql stable set search_path = '' as $$
  with me as (
    select p.id, p.vendor_id, p.created_at, public.pb_code_key(p.sku) as key, public.pb_code_num(p.sku) as num,
           public.pb_colour_keys(p.sku, p.color) as cols
    from public.pb_products p
    where p.id = any(coalesce(p_ids, '{}')) and p.status <> 'archived' and public.pb_code_key(p.sku) is not null
  ), pair as (
    select m.id, o.id as oid, o.name, o.sku, o.color, o.source, o.source_ref, o.status, o.created_at as ocreated,
      (o.created_at, o.id) < (m.created_at, m.id) as other_first,
      public.pb_code_key(o.sku) = m.key as same_key,
      m.vendor_id is not null and m.vendor_id = o.vendor_id as same_vendor,
      left(m.key, 1) = '#' as bare,
      m.cols, public.pb_colour_keys(o.sku, o.color) as ocols
    from me m
    join public.pb_products o on o.id <> m.id and o.status <> 'archived'
      and (public.pb_code_key(o.sku) = m.key
           or (m.vendor_id is not null and o.vendor_id = m.vendor_id and public.pb_code_num(o.sku) = m.num))
  ), judged as (
    select x.*, v.verdict,
      case
        when x.same_key and x.same_vendor and not x.bare then
          case when cardinality(x.cols) > 0 and cardinality(x.ocols) > 0 and not (x.cols && x.ocols) then 'colour' else 'copy' end
        else 'maybe' end as rel
    from pair x
    left join private.pb_dup_verdicts v on v.a = least(x.id, x.oid) and v.b = greatest(x.id, x.oid)
  )
  select j.id, j.oid,
    case
      when j.verdict = 'different' then 'different'
      when j.verdict = 'colour' then 'colour'
      when j.verdict = 'same' or j.rel = 'copy' then case when j.other_first then 'held' else 'original' end
      else j.rel end,
    case when j.same_key and j.same_vendor then 'code' when j.same_key then 'other_vendor' else 'near_code' end,
    j.name, j.sku, j.color, j.source, j.source_ref, j.status, j.ocreated,
    (select i.path from public.pb_product_images i where i.product_id = j.oid and i.kind = 'image' order by i.position limit 1)
  from judged j
  order by j.id, j.ocreated
$$;

create or replace function public.pb_dup_matches(p_ids uuid[])
returns table (product_id uuid, other_id uuid, kind text, how text, other_name text, other_sku text, other_color text,
               other_source text, other_ref text, other_status text, other_created timestamptz, other_photo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
          or (select public.app_is_staff())) then
    raise exception 'Only staff can read this.' using errcode = '42501';
  end if;
  return query select * from private.pb_dup_scan(p_ids);
end $$;

-- The product this one is held as a copy of (the earliest), or null. Asked by the Ready gate, whoever runs it;
-- it gives away one product id and nothing else.
create or replace function public.pb_dup_held(p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.other_id from private.pb_dup_scan(array[p_id]) m where m.kind = 'held' order by m.other_created limit 1
$$;

-- A person's answer for two products (one pair; the app answers through pb_dup_answer below).
-- Answering again replaces the earlier answer.
create or replace function public.pb_dup_verdict_set(p_a uuid, p_b uuid, p_verdict text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
          or (select public.app_is_staff())) then
    raise exception 'Only staff can change this.' using errcode = '42501';
  end if;
  if p_a is null or p_b is null or p_a = p_b then raise exception 'Pick two different products.'; end if;
  if p_verdict not in ('same', 'colour', 'different') then raise exception 'Unknown answer.'; end if;
  insert into private.pb_dup_verdicts as v (a, b, verdict, decided_by)
  values (least(p_a, p_b), greatest(p_a, p_b), p_verdict, (select auth.uid()))
  on conflict (a, b) do update set verdict = excluded.verdict, decided_by = excluded.decided_by, decided_at = now();
end $$;

-- One tap on the product page: the same answer for this product against every product listed in its part,
-- and what follows from it, in one transaction. "same" archives THIS product (the earlier one stays);
-- "colour" / "different" re-apply the Ready gate, so a held product is let go. SECURITY INVOKER: the product's
-- own row policy applies to the archive and the gate; pb_dup_verdict_set checks the caller for the answers.
create or replace function public.pb_dup_answer(p_id uuid, p_others uuid[], p_verdict text)
returns table (status text, was text)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  o uuid;
  v_was text;
  v_now text;
begin
  if p_id is null or coalesce(cardinality(p_others), 0) = 0 or cardinality(p_others) > 50 then
    raise exception 'Pick the products this answer is for.';
  end if;
  foreach o in array p_others loop
    perform public.pb_dup_verdict_set(p_id, o, p_verdict);
  end loop;
  if p_verdict = 'same' then
    select p.status into v_was from public.pb_products p where p.id = p_id for update;
    if v_was is null then raise exception 'That product no longer exists.'; end if;
    update public.pb_products p set status = 'archived' where p.id = p_id and p.status <> 'archived';
    v_now := 'archived';
  else
    select r.status, r.was into v_now, v_was from public.pb_products_refresh(array[p_id]) r;
    if v_now is null then raise exception 'That product no longer exists.'; end if;
  end if;
  return query select v_now, v_was;
end $$;

grant execute on function public.pb_code_key(text) to authenticated, service_role;
grant execute on function public.pb_code_num(text) to authenticated, service_role;
grant execute on function public.pb_colour_keys(text, text) to authenticated, service_role;
grant execute on function public.pb_dup_matches(uuid[]) to authenticated, service_role;
grant execute on function public.pb_dup_held(uuid) to authenticated, service_role;
grant execute on function public.pb_dup_verdict_set(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.pb_dup_answer(uuid, uuid[], text) to authenticated, service_role;

-- ── 4. The Ready gate also holds a product that looks already added ──────
-- As 20261112090000_pb_store_writer.sql, plus `copy_of`: a held copy stays in
-- Needs info (nothing is written or published for it) until a person answers.
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
        and exists (select 1 from pb_product_images i where i.product_id = c.id and i.kind = 'image')) as has_details,
      case when c.was in ('ready', 'needs_info') then pb_dup_held(c.id) end as copy_of
    from cur c
  ), gate as (
    select calc.*, case
      when calc.was not in ('ready', 'needs_info') then calc.was
      when not ((calc.cost_price is not null or calc.sell_price is not null) and coalesce(trim(calc.category), '') <> '' and cardinality(calc.miss) = 0
                and calc.has_details and calc.copy_of is null) then 'needs_info'
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

-- ── 5. Nobody signed out needs these ─────────────────────────────────────
revoke all on function public.pb_dup_matches(uuid[]) from public, anon;
revoke all on function public.pb_dup_held(uuid) from public, anon;
revoke all on function public.pb_dup_verdict_set(uuid, uuid, text) from public, anon;
revoke all on function public.pb_dup_answer(uuid, uuid[], text) from public, anon;
