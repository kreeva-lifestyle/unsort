-- Playbook bulk-change log: the bulk changes of the last 7 days, from what is on record.
--
-- WHY (owner, 2026-11-12): "Firstly log all bulk changes we did for past 7
-- days with option to revert them." The log (previous migration) only knows
-- changes made after it existed, so the two bulk changes of the last week are
-- written into it here from what the database already holds:
--   * imports from a website (pb_import_runs): the products each run added
--     are the ones with its host in source_ref, created while it ran;
--   * re-reads by the worker that changed a product that had been read before
--     (the reader logs what it changed: pb_activity 'read' → details.changed,
--     [what it was, what it is now] per field). One log entry per day of such
--     reads. The reader's log keeps the first 200 characters of each value, so
--     a field whose old value was that long cannot be put back and is left out
--     (counted in details.notes_cut: in practice the long "notes" text).
-- Data only, and only rows of the last 7 days; running it again adds nothing.

-- imports
insert into public.pb_bulk_runs (id, kind, label, details, status, created_by, created_at, finished_at)
select r.id, 'import', 'Imported products from ' || r.host,
       jsonb_build_object('host', r.host, 'added', r.added, 'found', r.found, 'skipped', r.skipped, 'backfilled', true),
       'done', r.created_by, r.created_at, r.finished_at
from public.pb_import_runs r
where r.added > 0 and r.finished_at is not null and r.created_at > now() - interval '7 days'
on conflict (id) do nothing;

insert into public.pb_bulk_items (run_id, tbl, op, pk, before, after, created_at)
select r.id, 'pb_products', 'I', jsonb_build_object('id', p.id), null,
       jsonb_build_object('sku', p.sku, 'source', p.source, 'source_ref', p.source_ref), p.created_at
from public.pb_import_runs r
join public.pb_bulk_runs b on b.id = r.id and b.kind = 'import' and b.details ->> 'backfilled' = 'true'
join public.pb_products p on p.source = 'import' and left(p.source_ref, length(r.host) + 1) = r.host || ':'
  and p.created_at >= r.created_at and p.created_at <= r.finished_at
where not exists (select 1 from public.pb_bulk_items i where i.run_id = r.id);

-- re-reads
do $$
declare d record; run uuid; cols constant text[] := array['name', 'fabric', 'color', 'category', 'sku'];
begin
  for d in
    select (a.created_at at time zone 'Asia/Kolkata')::date as day, min(a.created_at) as first_at, max(a.created_at) as last_at
    from public.pb_activity a
    where a.action = 'read' and a.user_id is null and a.product_id is not null and a.details -> 'changed' <> '{}'::jsonb
      and a.created_at > now() - interval '7 days'
    group by 1 having count(distinct a.product_id) >= 2
  loop
    if exists (select 1 from public.pb_bulk_runs b where b.kind = 'reread' and b.details ->> 'day' = d.day::text) then continue; end if;
    run := gen_random_uuid();
    insert into public.pb_bulk_runs (id, kind, label, details, status, created_at, finished_at)
    values (run, 'reread', 'Read all products again with the new reader rules', jsonb_build_object('day', d.day, 'backfilled', true), 'done', d.first_at, d.last_at);
    with e as (
      select a.product_id, a.created_at, k.key, k.value ->> 0 as was, k.value ->> 1 as now
      from public.pb_activity a, jsonb_each(a.details -> 'changed') k
      where a.action = 'read' and a.user_id is null and a.product_id is not null and a.created_at between d.first_at and d.last_at
    ), f as (select distinct on (product_id, key) product_id, key, was from e order by product_id, key, created_at asc),
       l as (select distinct on (product_id, key) product_id, key, now from e order by product_id, key, created_at desc),
       net as (select f.product_id, f.key, f.was, l.now, length(f.was) >= 200 as cut from f join l using (product_id, key) where f.was is distinct from l.now),
       per as (
         select n.product_id,
           coalesce(jsonb_object_agg(n.key, n.was) filter (where n.key = any(cols)), '{}'::jsonb)
             || case when count(*) filter (where n.key <> all(cols)) > 0 then jsonb_build_object('attributes', jsonb_object_agg(n.key, n.was) filter (where n.key <> all(cols))) else '{}'::jsonb end as before,
           coalesce(jsonb_object_agg(n.key, n.now) filter (where n.key = any(cols)), '{}'::jsonb)
             || case when count(*) filter (where n.key <> all(cols)) > 0 then jsonb_build_object('attributes', jsonb_object_agg(n.key, n.now) filter (where n.key <> all(cols))) else '{}'::jsonb end as after
         from net n where not n.cut group by n.product_id
       )
    insert into public.pb_bulk_items (run_id, tbl, op, pk, before, after, created_at)
    select run, 'pb_products', 'U', jsonb_build_object('id', per.product_id), per.before, per.after, d.last_at
    from per join public.pb_products p on p.id = per.product_id;
    update public.pb_bulk_runs b set details = b.details || jsonb_build_object(
      'products', (select count(distinct a.product_id) from public.pb_activity a where a.action = 'read' and a.user_id is null and a.created_at between d.first_at and d.last_at and a.details -> 'changed' <> '{}'::jsonb),
      'notes_cut', (select count(distinct a.product_id) from public.pb_activity a
                    where a.action = 'read' and a.user_id is null and a.created_at between d.first_at and d.last_at
                      and exists (select 1 from jsonb_each(a.details -> 'changed') k where length(k.value ->> 0) >= 200)))
    where b.id = run;
  end loop;
end $$;

update public.pb_bulk_runs b set items = (select count(*) from public.pb_bulk_items i where i.run_id = b.id)
where b.details ->> 'backfilled' = 'true' and b.items = 0;
