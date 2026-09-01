-- Top-5 vendor chips on the PO form (owner's spec, 2026-09-01): ranked by
-- PO count over the LAST 30 DAYS. Owner: "design in a way that it doesn't
-- load our server - not too important" - so, like costing_top_subs, a
-- pg_cron job recounts every 4 days (03:20 UTC) into
-- app_settings.po_top_vendors and the form just reads that one row.
-- Case-insensitive vendor grouping; each chip carries the most recent
-- id/name/phone snapshot so a tap fills the form exactly like a pick.
select cron.schedule('po-top-vendors', '20 3 */4 * *', $$
insert into app_settings (key, value, updated_at)
values ('po_top_vendors', coalesce((
  with recent as (
    select vendor_id, trim(vendor_name) as name, vendor_phone, created_at
    from purchase_orders
    where created_at > now() - interval '30 days'
      and coalesce(status, '') <> 'cancelled'
      and trim(coalesce(vendor_name, '')) <> ''
  ),
  counts as (
    select upper(name) as key, count(*) as uses
    from recent group by 1 order by count(*) desc limit 5
  ),
  latest as (
    select distinct on (upper(name)) upper(name) as key, vendor_id, name, vendor_phone
    from recent order by upper(name), created_at desc
  )
  select jsonb_agg(jsonb_build_object('id', l.vendor_id, 'name', l.name, 'phone', coalesce(l.vendor_phone, '')) order by c.uses desc)
  from counts c join latest l using (key)
), '[]'::jsonb), now())
on conflict (key) do update set value = excluded.value, updated_at = now();
$$);

-- Seed once now (same statement as the cron body).
insert into app_settings (key, value, updated_at)
values ('po_top_vendors', coalesce((
  with recent as (
    select vendor_id, trim(vendor_name) as name, vendor_phone, created_at
    from purchase_orders
    where created_at > now() - interval '30 days'
      and coalesce(status, '') <> 'cancelled'
      and trim(coalesce(vendor_name, '')) <> ''
  ),
  counts as (
    select upper(name) as key, count(*) as uses
    from recent group by 1 order by count(*) desc limit 5
  ),
  latest as (
    select distinct on (upper(name)) upper(name) as key, vendor_id, name, vendor_phone
    from recent order by upper(name), created_at desc
  )
  select jsonb_agg(jsonb_build_object('id', l.vendor_id, 'name', l.name, 'phone', coalesce(l.vendor_phone, '')) order by c.uses desc)
  from counts c join latest l using (key)
), '[]'::jsonb), now())
on conflict (key) do update set value = excluded.value, updated_at = now();
