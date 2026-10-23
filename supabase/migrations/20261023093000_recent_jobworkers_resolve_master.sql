-- recent_jobworkers (20261023090000): resolve a typed name to the vendor
-- master before choosing what a chip carries.
--
-- Why (found in review): the first version took the id and phone from the
-- newest job of each name. A job saved with the name typed but not picked
-- from the suggestions has no vendor link and no phone, so once such a job
-- was the newest of its name the chip filled the jobworker unlinked and
-- without a phone — and every job saved from that chip kept it that way.
-- And a deactivated vendor came back as a typed chip through any old
-- unlinked job of the same name.
--
-- Now every job is resolved to its jobworker first: its linked vendor, else
-- the master vendor of that name (an active one first — names are unique only
-- with the phone), else the typed name as it is. A job whose jobworker is
-- inactive is left out; one chip per resolved vendor (or per typed name when
-- no master entry has it), newest job first. Two master vendors sharing a
-- name stay two chips (the app adds the phone's last digits to tell them
-- apart). A vendor deleted from the master falls back to its typed name.
create or replace function public.recent_jobworkers(p_limit int default 5)
 returns table (vendor_id uuid, vendor_name text, vendor_phone text)
 language sql
 stable
 set search_path to 'public'
as $function$
  select r.vid, r.nm, r.ph from (
    select distinct on (coalesce(x.vid::text, 'n:' || lower(x.nm))) x.vid, x.nm, x.ph, x.created_at
    from (
      select o.created_at,
        coalesce(v.id, m.id) as vid,
        btrim(coalesce(v.name, m.name, o.vendor_name)) as nm,
        case when coalesce(v.id, m.id) is not null then nullif(btrim(coalesce(v.phone, m.phone)), '') else nullif(btrim(o.vendor_phone), '') end as ph,
        coalesce(v.is_active, m.is_active, true) as active
      from jobwork_orders o
      left join po_vendors v on v.id = o.vendor_id
      left join lateral (
        select p.id, p.name, p.phone, p.is_active from po_vendors p
        where v.id is null and lower(btrim(p.name)) = lower(btrim(o.vendor_name))
        order by p.is_active desc nulls last, p.created_at desc nulls last, p.id
        limit 1
      ) m on true
      where btrim(coalesce(v.name, o.vendor_name, '')) <> ''
    ) x
    where x.active
    order by coalesce(x.vid::text, 'n:' || lower(x.nm)), x.created_at desc
  ) r
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$function$;

revoke execute on function public.recent_jobworkers(int) from public, anon;
grant execute on function public.recent_jobworkers(int) to authenticated;
