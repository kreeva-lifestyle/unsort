-- Product Costing quick-entry chips (owner's spec, 2026-08-26): the editor
-- shows the MOST-REPEATED sub-components as one-tap chips. Counting them on
-- every page load would rescan every sheet's JSON, so a pg_cron job recounts
-- every 4 days (days 1,5,9,… at 03:10 UTC) into app_settings.costing_top_subs
-- (jsonb array of names, most-used first, case-insensitively deduped keeping
-- the first-seen spelling) and the app just reads that. Seeded immediately
-- below so chips appear without waiting for the first cron run.
select cron.schedule('costing-top-subs', '10 3 */4 * *', $$
insert into app_settings (key, value, updated_at)
values ('costing_top_subs', coalesce((
  select jsonb_agg(display order by uses desc)
  from (
    select (array_agg(trim(s->>'name')))[1] as display, count(*) as uses
    from costing_products p
         cross join lateral jsonb_array_elements(p.components) c
         cross join lateral jsonb_array_elements(c->'subs') s
    where trim(coalesce(s->>'name','')) <> ''
    group by upper(trim(s->>'name'))
    order by count(*) desc
    limit 10
  ) t), '[]'::jsonb), now())
on conflict (key) do update set value = excluded.value, updated_at = now();
$$);

-- Seed once now (same statement as the cron body).
insert into app_settings (key, value, updated_at)
values ('costing_top_subs', coalesce((
  select jsonb_agg(display order by uses desc)
  from (
    select (array_agg(trim(s->>'name')))[1] as display, count(*) as uses
    from costing_products p
         cross join lateral jsonb_array_elements(p.components) c
         cross join lateral jsonb_array_elements(c->'subs') s
    where trim(coalesce(s->>'name','')) <> ''
    group by upper(trim(s->>'name'))
    order by count(*) desc
    limit 10
  ) t), '[]'::jsonb), now())
on conflict (key) do update set value = excluded.value, updated_at = now();
