-- Playbook bulk-change log: only the server may look into a bulk change's rows.
--
-- WHY (own review of 20261113060000_pb_bulk_log.sql before it shipped): the
-- entry point pb_bulk_revert checks that the caller is the server before it
-- changes anything, but the per-kind functions behind it (pb_bulk_revert_prices,
-- _send, _retry, _unread, _fields) did not. They run with the caller's own
-- rights, so a signed-in member of staff could call one directly and put
-- prices back without being an admin or manager, and without the bulk change
-- being marked as reverted. Functions cannot be taken away from a role here,
-- so the one function they all start with now refuses anyone but the server:
-- pb_bulk_net (what a run changed, net). Same name, arguments and columns.
create or replace function public.pb_bulk_net(p_run uuid)
returns table (tbl text, pk jsonb, before jsonb, after jsonb)
language plpgsql stable security invoker set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  return query
    select f.tbl, f.pk, f.before, l.after
    from (select distinct on (i.tbl, i.pk) i.tbl, i.pk, i.before from pb_bulk_items i where i.run_id = p_run and not i.done order by i.tbl, i.pk, i.id asc) f
    join (select distinct on (i.tbl, i.pk) i.tbl, i.pk, i.after from pb_bulk_items i where i.run_id = p_run and not i.done order by i.tbl, i.pk, i.id desc) l
      on l.tbl = f.tbl and l.pk = f.pk;
end $$;
