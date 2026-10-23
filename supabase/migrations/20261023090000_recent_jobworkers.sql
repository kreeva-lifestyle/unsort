-- Jobwork: the last 5 jobworkers, as one-tap chips under "Jobworker" on the
-- New job form (owner's ask, 2026-10-23).
--
-- Why a function: "the last 5 different jobworkers" needs a DISTINCT over
-- the jobs — a client read of the latest N jobs comes back short whenever
-- one jobworker had the last several jobs (8 of the latest 15 are one name).
-- One row per jobworker name (current master name when the job is linked),
-- so a name typed before it was in the vendor master and the master entry
-- don't show twice; the newest job decides which entry, id and phone the
-- chip carries. Deactivated master vendors are left out (the picker leaves
-- them out too). SECURITY INVOKER: what the caller may read of jobs and
-- vendors is what it gets. A full pass over jobwork_orders (36 rows today);
-- revisit with an index only if jobs reach the tens of thousands.
create or replace function public.recent_jobworkers(p_limit int default 5)
 returns table (vendor_id uuid, vendor_name text, vendor_phone text)
 language sql
 stable
 set search_path to 'public'
as $function$
  select r.vendor_id, r.vendor_name, r.vendor_phone from (
    select distinct on (lower(btrim(coalesce(v.name, o.vendor_name))))
      o.vendor_id, btrim(coalesce(v.name, o.vendor_name)) as vendor_name, coalesce(nullif(btrim(v.phone), ''), nullif(btrim(o.vendor_phone), '')) as vendor_phone, o.created_at
    from jobwork_orders o
    left join po_vendors v on v.id = o.vendor_id
    where btrim(coalesce(v.name, o.vendor_name, '')) <> '' and (o.vendor_id is null or v.is_active)
    order by lower(btrim(coalesce(v.name, o.vendor_name))), o.created_at desc
  ) r
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$function$;

revoke execute on function public.recent_jobworkers(int) from public, anon;
grant execute on function public.recent_jobworkers(int) to authenticated;
