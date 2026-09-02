-- Poll the master sheet. Two jobs, both async via pg_net so no Postgres worker
-- ever waits on Google.
--
--   probe (*/2)  mode=auto: syncs only when the sheet looks changed. With the
--                Drive API enabled this is a ~200-byte metadata call; without
--                it the function falls back to a 4-minute timed resync, which
--                is why a 2-minute tick is safe either way.
--   full  (:23)  mode=full: unconditional hourly reconcile. Catches a broken
--                probe, deleted rows and header changes.
--
-- The secret lives in Vault; these bodies never contain it.

create or replace function public.trigger_master_sync(p_mode text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'master_sync_secret';
  if v_secret is null then
    raise warning 'master_sync_secret missing from vault - sync not triggered';
    return null;
  end if;

  return net.http_post(
    url     := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/master-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body    := jsonb_build_object('mode', p_mode),
    timeout_milliseconds := 120000
  );
end;
$$;

comment on function public.trigger_master_sync is
  'Fires the master-sync edge function via pg_net. Called by pg_cron only; reads the shared secret from Vault so it never appears in a job definition.';

-- Nobody but the scheduler needs this.
revoke all on function public.trigger_master_sync(text) from public, anon, authenticated;

select cron.schedule('master-sync-probe', '*/2 * * * *', $$select public.trigger_master_sync('auto')$$);
select cron.schedule('master-sync-full',  '23 * * * *',  $$select public.trigger_master_sync('full')$$);
