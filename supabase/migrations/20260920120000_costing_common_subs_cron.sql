-- Product Costing garment templates, second pass (owner's ask): "+ Add the
-- usual lines" for LEHANGA / BLOUSE / TOP… used to copy the NEWEST sheet's
-- lines wholesale (a one-off LACE on the last TOP came along). Now the
-- template is what is COMMON to that main component across sheets: every
-- sub-component that appears in at least half of the sheets carrying that
-- component (a component seen on one sheet only keeps all its lines), each
-- line's unit / qty / suppliers taken from the newest sheet that has it,
-- ordered most-shared first, then by its usual position.
-- Scanning every sheet's JSON on each editor open would load the server, so
-- pg_cron recounts every 4 days (03:20 UTC, offset from costing-top-subs)
-- into app_settings.costing_common_subs and the app reads that one row:
--   { "LEHANGA": { name, sheets, subs: [ { name, unit, qty, suppliers, uses } ] }, … }
-- Seeded immediately below so it works without waiting for the first run.
select cron.schedule('costing-common-subs', '20 3 */4 * *', $$
insert into app_settings (key, value, updated_at)
values ('costing_common_subs', coalesce((
  with comps as (
    select p.id, p.updated_at, upper(trim(c.value->>'name')) as ck, trim(c.value->>'name') as cname, c.value as c
    from costing_products p cross join lateral jsonb_array_elements(p.components) with ordinality c
    where trim(coalesce(c.value->>'name','')) <> ''
  ), subs as (
    select ck, id, updated_at, upper(trim(s.value->>'name')) as sk, s.value as s, s.ordinality as pos
    from comps cross join lateral jsonb_array_elements(c->'subs') with ordinality s
    where trim(coalesce(s.value->>'name','')) <> ''
  ), sheets as (
    select ck, count(distinct id) as n, (array_agg(cname order by updated_at desc))[1] as cname from comps group by ck
  ), agg as (
    select ck, sk, count(distinct id) as uses, avg(pos) as apos, (array_agg(s order by updated_at desc))[1] as latest
    from subs group by ck, sk
  )
  select jsonb_object_agg(ck, jsonb_build_object('name', cname, 'sheets', n, 'subs', coalesce(subs, '[]'::jsonb)))
  from (
    select sh.ck, sh.cname, sh.n,
      (select jsonb_agg(jsonb_build_object('name', trim(latest->>'name'), 'unit', coalesce(latest->>'unit',''), 'qty', coalesce(latest->>'qty',''),
                                           'suppliers', coalesce(latest->'suppliers','[]'::jsonb), 'uses', uses) order by uses desc, apos asc)
         from agg a where a.ck = sh.ck and a.uses * 2 >= sh.n) as subs
    from sheets sh
  ) t), '{}'::jsonb), now())
on conflict (key) do update set value = excluded.value, updated_at = now();
$$);

-- Seed once now (same statement as the cron body).
insert into app_settings (key, value, updated_at)
values ('costing_common_subs', coalesce((
  with comps as (
    select p.id, p.updated_at, upper(trim(c.value->>'name')) as ck, trim(c.value->>'name') as cname, c.value as c
    from costing_products p cross join lateral jsonb_array_elements(p.components) with ordinality c
    where trim(coalesce(c.value->>'name','')) <> ''
  ), subs as (
    select ck, id, updated_at, upper(trim(s.value->>'name')) as sk, s.value as s, s.ordinality as pos
    from comps cross join lateral jsonb_array_elements(c->'subs') with ordinality s
    where trim(coalesce(s.value->>'name','')) <> ''
  ), sheets as (
    select ck, count(distinct id) as n, (array_agg(cname order by updated_at desc))[1] as cname from comps group by ck
  ), agg as (
    select ck, sk, count(distinct id) as uses, avg(pos) as apos, (array_agg(s order by updated_at desc))[1] as latest
    from subs group by ck, sk
  )
  select jsonb_object_agg(ck, jsonb_build_object('name', cname, 'sheets', n, 'subs', coalesce(subs, '[]'::jsonb)))
  from (
    select sh.ck, sh.cname, sh.n,
      (select jsonb_agg(jsonb_build_object('name', trim(latest->>'name'), 'unit', coalesce(latest->>'unit',''), 'qty', coalesce(latest->>'qty',''),
                                           'suppliers', coalesce(latest->'suppliers','[]'::jsonb), 'uses', uses) order by uses desc, apos asc)
         from agg a where a.ck = sh.ck and a.uses * 2 >= sh.n) as subs
    from sheets sh
  ) t), '{}'::jsonb), now())
on conflict (key) do update set value = excluded.value, updated_at = now();
