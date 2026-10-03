-- Rate Card Studio: a "Refresh now" for the master sheet copy (owner's ask —
-- "refresh button in case user wish to refresh instantly").
--
-- WHY: master-sync runs on pg_cron every two minutes; when the owner has just
-- edited the sheet they do not want to wait for the next tick. This wraps the
-- existing trigger_master_sync('full') for signed-in staff:
--   - SECURITY DEFINER because trigger_master_sync reads the sync secret from
--     the vault and only postgres/service_role may execute it; this function
--     is the one narrow door for operator+ users;
--   - throttled: if every tab synced within the last 60 seconds nothing is
--     fired and the caller is told the copy is already current — a tapped
--     button can never queue a pile of full syncs;
--   - 'full' (not 'auto'): the Drive change probe is not available on this
--     Google project, and an explicit refresh should read the sheet whatever
--     Drive says.
-- Returns {triggered, reason, request_id}. Applied via MCP as
-- request_master_sync.

create or replace function public.request_master_sync()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_newest timestamptz;
  v_req bigint;
begin
  select role into v_role from profiles where id = auth.uid() and is_active is distinct from false;
  if v_role is null or v_role not in ('admin', 'manager', 'operator') then
    raise exception 'Sign in as admin, manager or operator to refresh the master copy';
  end if;
  select min(last_success_at) into v_newest from master_sheet_sync;
  if v_newest is not null and v_newest > now() - interval '60 seconds' then
    return jsonb_build_object('triggered', false, 'reason', 'fresh', 'last_success_at', v_newest);
  end if;
  v_req := public.trigger_master_sync('full');
  if v_req is null then
    raise exception 'Master sync is not configured — ask an admin';
  end if;
  return jsonb_build_object('triggered', true, 'reason', 'started', 'request_id', v_req, 'last_success_at', v_newest);
end
$$;

comment on function public.request_master_sync is 'Rate Card Studio "Refresh now": fires trigger_master_sync(''full'') for operator+ users unless every tab synced within the last 60 s. SECURITY DEFINER (the trigger reads the vault).';
revoke all on function public.request_master_sync() from public, anon;
grant execute on function public.request_master_sync() to authenticated;
