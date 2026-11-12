-- Playbook: "already added?" step 3 — the same photo, saved again (owner, 2026-11-12).
--
-- Why: a supplier's Telegram photo and the copy of it on a store's website are
-- the same picture at another size or JPEG quality, and the product may carry
-- no design code at all (or a different one). The design-code check
-- (20261112150000_pb_duplicates.sql) cannot see that; a print of the photo can.
--
-- How:
--   * The edge function pb-photo-prints reads each product photo once and
--     works out its print: 256 bits of where the picture is light and dark
--     (supabase/functions/pb-photo-prints/print.ts), from the block averages
--     the JPEG already stores (jpegDc.ts) — the photos kept here are 15 to 19
--     megapixel originals, too large to decode inside an edge function. The
--     same photo re-saved or resized differs in a handful of bits; another
--     photo in about half of them.
--   * private.pb_photo_prints keeps one row per photo (also the queue: a photo
--     with no row is waiting). private.pb_photo_pairs keeps, per two products,
--     their closest two photos when those are near enough to be the same.
--   * A match is only ever a SUGGESTION ("Could this be already added? · Same
--     photo"): the print ignores colour, so a recoloured photo matches too, and
--     only a person can tell. Nothing is held by a photo alone. A person's
--     "It is a copy" is remembered as before, and then holds.
--   * A picture that is on many products (a size chart, a banner) says nothing
--     about any of them and is left out.
--
-- Everything here is additive (two private tables, functions, a cron job). No
-- AI is used and nothing is paid per photo. The REVOKEs at the end go in the
-- owner's paste-in file where the migration tool cannot apply them; the
-- functions check the caller themselves.

-- ── 1. One row per photo: its print, or why it has none ──────────────────
create table if not exists private.pb_photo_prints (
  image_id uuid primary key references public.pb_product_images (id) on delete cascade,
  product_id uuid not null references public.pb_products (id) on delete cascade,
  state text not null default 'working' check (state in ('working', 'done', 'skipped')),
  print bit(256),                 -- null unless done
  detail smallint,                -- 0–100: how much there is to tell apart
  width int,
  height int,
  tries smallint not null default 1,
  note text,                      -- why it was skipped
  claimed_at timestamptz not null default now(),
  done_at timestamptz
);
comment on table private.pb_photo_prints is 'Playbook: the print of each product photo (pb-photo-prints). A photo with no row here is waiting. Written only through pb_photo_claim / pb_photo_put.';
create index if not exists pb_photo_prints_product_idx on private.pb_photo_prints (product_id) where state = 'done';
create index if not exists pb_photo_prints_working_idx on private.pb_photo_prints (claimed_at) where state = 'working';

-- ── 2. Two products whose closest photos are near enough (a < b) ─────────
create table if not exists private.pb_photo_pairs (
  a uuid not null references public.pb_products (id) on delete cascade,
  b uuid not null references public.pb_products (id) on delete cascade,
  a_image uuid not null references public.pb_product_images (id) on delete cascade,
  b_image uuid not null references public.pb_product_images (id) on delete cascade,
  apart smallint not null,        -- bits that differ, of 256
  found_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
comment on table private.pb_photo_pairs is 'Playbook: two products that share a photo (their closest two photos and how many of 256 bits differ). Read through pb_dup_matches.';
create index if not exists pb_photo_pairs_b_idx on private.pb_photo_pairs (b);
create index if not exists pb_photo_pairs_a_image_idx on private.pb_photo_pairs (a_image);
create index if not exists pb_photo_pairs_b_image_idx on private.pb_photo_pairs (b_image);

-- ── 3. The queue: hand out photos to print, take the answers back ────────
-- Newest first, so a product that has just arrived is compared before the
-- backlog. A photo claimed more than 10 minutes ago and never answered (the
-- worker was stopped) is handed out again, three times at most.
create or replace function public.pb_photo_claim(p_n int)
returns table (image_id uuid, product_id uuid, path text, bytes bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Only the automation can do this.' using errcode = '42501';
  end if;
  -- One claim at a time: several workers start in the same second, and without this two of them could
  -- pick the same waiting photo (each chose it before the other's claim was saved).
  perform pg_advisory_xact_lock(hashtext('pb_photo_claim'));
  return query
  with pick as (
    select i.id, i.product_id, i.path, i.bytes
    from public.pb_product_images i
    join public.pb_products p on p.id = i.product_id and p.status <> 'archived'
    left join private.pb_photo_prints pr on pr.image_id = i.id
    where i.kind = 'image'
      and (pr.image_id is null or (pr.state = 'working' and pr.claimed_at < now() - interval '10 minutes'))
    order by i.created_at desc, i.id
    limit least(greatest(coalesce(p_n, 1), 1), 10)
    for update of i skip locked
  ), ins as (
    insert into private.pb_photo_prints as t (image_id, product_id, state, tries, claimed_at)
    select k.id, k.product_id, 'working', 1, now() from pick k
    on conflict on constraint pb_photo_prints_pkey do update set
      tries = t.tries + 1, claimed_at = now(),
      state = case when t.tries >= 3 then 'skipped' else 'working' end,
      note = case when t.tries >= 3 then 'Could not be read in 3 tries.' else t.note end,
      done_at = case when t.tries >= 3 then now() else null end
    returning t.image_id, t.state
  )
  select k.id, k.product_id, k.path, k.bytes from pick k join ins on ins.image_id = k.id where ins.state = 'working';
end $$;

-- The answer for one photo: its print (64 hex characters), or null with the reason it has none.
-- Returns how many products it was paired with. A pair keeps the closest two photos of the two products.
create or replace function public.pb_photo_put(p_image uuid, p_print text, p_detail int, p_width int, p_height int, p_note text)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_product uuid;
  v_bits bit(256);
  v_n int := 0;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Only the automation can do this.' using errcode = '42501';
  end if;
  if p_print is not null and p_print !~ '^[0-9a-f]{64}$' then raise exception 'A print is 64 hex characters.'; end if;
  if p_print is not null then v_bits := ('x' || p_print)::bit(256); end if;
  update private.pb_photo_prints t
    set state = case when v_bits is null then 'skipped' else 'done' end, print = v_bits,
        detail = p_detail, width = p_width, height = p_height, note = left(p_note, 200), done_at = now()
    where t.image_id = p_image
    returning t.product_id into v_product;
  if v_product is null or v_bits is null then return 0; end if;
  insert into private.pb_photo_pairs as q (a, b, a_image, b_image, apart)
  select least(v_product, m.product_id), greatest(v_product, m.product_id),
         case when v_product < m.product_id then p_image else m.image_id end,
         case when v_product < m.product_id then m.image_id else p_image end, m.apart
  from (
    select distinct on (o.product_id) o.product_id, o.image_id, bit_count(o.print # v_bits)::int as apart
    from private.pb_photo_prints o
    where o.state = 'done' and o.product_id <> v_product and bit_count(o.print # v_bits) <= 40
    order by o.product_id, bit_count(o.print # v_bits), o.image_id
  ) m
  order by m.apart, m.product_id
  limit 40
  on conflict (a, b) do update set a_image = excluded.a_image, b_image = excluded.b_image, apart = excluded.apart, found_at = now()
    where excluded.apart < q.apart;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.pb_photo_claim(int) to service_role;
grant execute on function public.pb_photo_put(uuid, text, int, int, int, text) to service_role;

-- ── 4. Matches: the design-code scan also keeps a remembered "same" ──────
-- As 20261112150000_pb_duplicates.sql, with two changes: a product without a
-- design code is no longer left out (it can still carry a person's answer),
-- and a pair a person called "same" is always a candidate, whatever matched
-- it first — so a copy found by its photo, archived and later restored, is
-- held again by the Ready gate (pb_dup_held) like one found by its code.
create or replace function private.pb_dup_scan(p_ids uuid[])
returns table (product_id uuid, other_id uuid, kind text, how text, other_name text, other_sku text, other_color text,
               other_source text, other_ref text, other_status text, other_created timestamptz, other_photo text)
language sql stable set search_path = '' as $$
  with me as (
    select p.id, p.vendor_id, p.created_at, public.pb_code_key(p.sku) as key, public.pb_code_num(p.sku) as num,
           public.pb_colour_keys(p.sku, p.color) as cols
    from public.pb_products p
    where p.id = any(coalesce(p_ids, '{}')) and p.status <> 'archived'
  ), cand as (
    select m.id, o.id as oid
    from me m
    join public.pb_products o on o.id <> m.id and o.status <> 'archived'
      and (public.pb_code_key(o.sku) = m.key
           or (m.vendor_id is not null and o.vendor_id = m.vendor_id and public.pb_code_num(o.sku) = m.num))
    where m.key is not null
    union
    select m.id, case when v.a = m.id then v.b else v.a end
    from me m join private.pb_dup_verdicts v on (v.a = m.id or v.b = m.id) and v.verdict = 'same'
  ), pair as (
    select m.id, o.id as oid, o.name, o.sku, o.color, o.source, o.source_ref, o.status, o.created_at as ocreated,
      (o.created_at, o.id) < (m.created_at, m.id) as other_first,
      coalesce(public.pb_code_key(o.sku) = m.key, false) as same_key,
      coalesce(m.vendor_id = o.vendor_id, false) as same_vendor,
      coalesce(m.vendor_id = o.vendor_id and public.pb_code_num(o.sku) = m.num, false) as same_num,
      coalesce(left(m.key, 1) = '#', false) as bare,
      m.cols, public.pb_colour_keys(o.sku, o.color) as ocols
    from cand c
    join me m on m.id = c.id
    join public.pb_products o on o.id = c.oid and o.status <> 'archived'
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
    case when j.same_key and j.same_vendor then 'code' when j.same_key then 'other_vendor' when j.same_num then 'near_code' else 'photo' end,
    j.name, j.sku, j.color, j.source, j.source_ref, j.status, j.ocreated,
    (select i.path from public.pb_product_images i where i.product_id = j.oid and i.kind = 'image' order by i.position limit 1)
  from judged j
  order by j.id, j.ocreated
$$;

-- Two products that share a photo and are not told apart by anything else. kind: maybe (a suggestion), or
-- what a person answered (colour / different; "same" is the scan's). The other product's photo shown is the
-- one that matched. Left out: a picture that pairs this product with more than 8 others (a size chart, a banner).
create or replace function private.pb_photo_scan(p_ids uuid[])
returns table (product_id uuid, other_id uuid, kind text, how text, other_name text, other_sku text, other_color text,
               other_source text, other_ref text, other_status text, other_created timestamptz, other_photo text)
language sql stable set search_path = '' as $$
  with hit as (
    select m.id, q.a, q.b,
           case when q.a = m.id then q.b else q.a end as oid,
           case when q.a = m.id then q.a_image else q.b_image end as my_image,
           case when q.a = m.id then q.b_image else q.a_image end as o_image
    from public.pb_products m
    join private.pb_photo_pairs q on q.a = m.id or q.b = m.id
    where m.id = any(coalesce(p_ids, '{}')) and m.status <> 'archived' and q.apart <= 32
  )
  select h.id, o.id,
    case v.verdict when 'different' then 'different' when 'colour' then 'colour' else 'maybe' end, 'photo',
    o.name, o.sku, o.color, o.source, o.source_ref, o.status, o.created_at,
    (select i.path from public.pb_product_images i where i.id = h.o_image)
  from hit h
  join public.pb_products o on o.id = h.oid and o.status <> 'archived'
  left join private.pb_dup_verdicts v on v.a = h.a and v.b = h.b
  where coalesce(v.verdict, '') <> 'same'
    and (select count(*) from private.pb_photo_pairs c where c.a_image = h.my_image or c.b_image = h.my_image) <= 8
  order by h.id, o.created_at
$$;

-- What the app reads: the design-code matches, then the photo matches for pairs the code said nothing about.
create or replace function public.pb_dup_matches(p_ids uuid[])
returns table (product_id uuid, other_id uuid, kind text, how text, other_name text, other_sku text, other_color text,
               other_source text, other_ref text, other_status text, other_created timestamptz, other_photo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
          or (select public.app_is_staff())) then
    raise exception 'Only staff can read this.' using errcode = '42501';
  end if;
  return query
  with s as materialized (select * from private.pb_dup_scan(p_ids))
  select * from s
  union all
  select f.* from private.pb_photo_scan(p_ids) f
  where not exists (select 1 from s where s.product_id = f.product_id and s.other_id = f.other_id);
end $$;

-- ── 5. Every minute, while photos are waiting ────────────────────────────
-- One call a minute, two when more than 40 photos wait; a call takes up to 20
-- photos (work.ts). Kept this low on purpose: an edge function's 2 seconds of
-- CPU are counted per worker across the calls it is serving, and eight calls
-- at once were cut off together in the trial. Only pg_cron and the service
-- role may start it; paused automation pauses it too.
create or replace function public.trigger_pb_photo_prints()
returns int
language plpgsql security definer set search_path to 'public', 'extensions', 'vault' as $$
declare
  v_secret text;
  v_left int;
  v_calls int;
begin
  if session_user = 'authenticator'
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Only the automation can do this.' using errcode = '42501';
  end if;
  if coalesce((select (value->>'paused')::boolean from pb_settings where key = 'automation'), false) then return 0; end if;
  select count(*) into v_left from (
    select 1
    from pb_product_images i
    join pb_products p on p.id = i.product_id and p.status <> 'archived'
    left join private.pb_photo_prints pr on pr.image_id = i.id
    where i.kind = 'image'
      and (pr.image_id is null or (pr.state = 'working' and pr.claimed_at < now() - interval '10 minutes'))
    limit 41) w;
  if v_left = 0 then return 0; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pb_worker_secret';
  if v_secret is null then raise warning 'pb_worker_secret missing from vault'; return 0; end if;
  v_calls := case when v_left > 40 then 2 else 1 end;
  for n in 1..v_calls loop
    perform net.http_post(
      url := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-photo-prints',
      headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
      body := jsonb_build_object('action', 'work'),
      timeout_milliseconds := 60000);
  end loop;
  return v_calls;
end $$;

select cron.schedule('pb-photo-prints', '* * * * *', 'select public.trigger_pb_photo_prints()');

-- ── 6. Nobody but the automation needs these ─────────────────────────────
revoke all on function public.pb_photo_claim(int) from public, anon, authenticated;
revoke all on function public.pb_photo_put(uuid, text, int, int, int, text) from public, anon, authenticated;
revoke all on function public.trigger_pb_photo_prints() from public, anon, authenticated;
