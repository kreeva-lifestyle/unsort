-- PackStation: the Google Sheet is written by the SERVER, not the phone.
--
-- A packer reported tracking numbers missing from the sheet (and sometimes
-- the app) after a Wi-Fi drop. Until now the phone saved the scan to the
-- database and then, separately, posted the sheet row through the packtime
-- edge function from an in-memory queue — a reload, an evicted tab or a
-- "Dismiss" tap lost rows the app already had. Now the phone's only job is
-- to get the scan into packtime_scans once (it keeps an on-phone outbox
-- until the server confirms); everything below carries it to the sheet.
--
-- * packtime_scans.sheet_by_server marks scans inserted by the new app;
--   old app versions still post their own sheet rows, so the trigger leaves
--   those alone (no double rows during the rollout). sheet_synced_at /
--   sheet_row / sheet_error record the sheet copy.
-- * packtime_sheet_queue: one 'append' op per new scan (trigger on insert),
--   one 'clear' op when a scan that already reached the sheet is deleted
--   (undo, history delete). An append still waiting when its scan is
--   deleted is cancelled; one in flight is cleared by packtime_sheet_done.
-- * packtime_sheet_claim / packtime_sheet_done: the sync job's two calls,
--   SECURITY DEFINER, service role only; the claim is atomic (skip locked)
--   so a cron run and a phone-kicked run never append the same row twice.
--   An op stops retrying after 20 attempts and shows up in the sheet check.
-- * pg_cron: every minute, trigger_packtime_sheet_sync('sync') fires the
--   edge function via pg_net when the queue has work; daily at 20:35 IST
--   ('verify') it compares the day's scans with the sheet, re-queues
--   anything missing and notifies admins/managers of mismatches. The
--   shared secret lives in Vault (cron side) and app_secrets (edge side),
--   as master-sync does.
--
-- Applied live as packtime_sheet_queue.

alter table public.packtime_scans
  add column sheet_by_server boolean not null default false,
  add column sheet_synced_at timestamptz,
  add column sheet_row integer,
  add column sheet_error text;
create index packtime_scans_sheet_pending_idx on public.packtime_scans (scanned_at) where sheet_by_server and sheet_synced_at is null;

create table public.packtime_sheet_queue (
  id bigserial primary key,
  kind text not null check (kind in ('append', 'clear')),
  scan_id uuid,
  sheet_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts integer not null default 0,
  done_at timestamptz,
  last_error text
);
comment on table public.packtime_sheet_queue is 'Sheet rows still to append / clear for PackStation scans. Written by triggers on packtime_scans and by the packtime edge function (service role); read by admins/managers for the sheet check.';
create index packtime_sheet_queue_open_idx on public.packtime_sheet_queue (id) where done_at is null;
create index packtime_sheet_queue_scan_idx on public.packtime_sheet_queue (scan_id) where done_at is null;
alter table public.packtime_sheet_queue enable row level security;
create policy "Managers can read the sheet queue" on public.packtime_sheet_queue
  for select using (exists (select 1 from profiles where id = (select auth.uid()) and role in ('admin', 'manager')));
-- No client write policy: the triggers below (definer) and the service role are the only writers.

create or replace function public.packtime_sheet_enqueue()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.sheet_by_server then
      insert into packtime_sheet_queue (kind, scan_id, sheet_name, payload)
      values ('append', new.id, new.sheet_name, jsonb_build_object('awb', new.awb, 'scanned_at', new.scanned_at, 'camera', new.camera, 'brand', new.brand));
    end if;
    return new;
  end if;
  if old.sheet_row is not null then
    insert into packtime_sheet_queue (kind, scan_id, sheet_name, payload)
    values ('clear', old.id, old.sheet_name, jsonb_build_object('sheet_row', old.sheet_row, 'awb', old.awb));
  elsif old.sheet_by_server then
    -- Not in the sheet yet and nobody is writing it right now: never append it.
    update packtime_sheet_queue set done_at = now(), last_error = 'cancelled: scan removed before it reached the sheet'
     where scan_id = old.id and kind = 'append' and done_at is null and claimed_at is null;
  end if;
  return old;
end $function$;

create trigger packtime_sheet_enqueue_ins after insert on public.packtime_scans for each row execute function public.packtime_sheet_enqueue();
create trigger packtime_sheet_enqueue_del after delete on public.packtime_scans for each row execute function public.packtime_sheet_enqueue();

-- The sync job takes up to p_limit open ops, oldest first. A claim older than
-- 3 minutes is a run that died; the op goes out again.
create or replace function public.packtime_sheet_claim(p_limit integer default 100)
 returns setof public.packtime_sheet_queue
 language sql
 security definer
 set search_path to 'public'
as $function$
  update packtime_sheet_queue q set claimed_at = now(), attempts = q.attempts + 1
   where q.id in (
     select id from packtime_sheet_queue
      where done_at is null and attempts < 20 and (claimed_at is null or claimed_at < now() - interval '3 minutes')
      order by id limit p_limit for update skip locked)
  returning q.*;
$function$;
revoke all on function public.packtime_sheet_claim(integer) from public, anon, authenticated;

-- p_done:   [{op, scan, row, sheet}] — appended (row = its sheet row) or cleared (scan/row null)
-- p_failed: [{op, scan, error}]      — goes out again next run
-- A scan deleted while its row was being appended gets a clear op here, so the
-- sheet never keeps a row the app no longer has.
create or replace function public.packtime_sheet_done(p_done jsonb, p_failed jsonb default '[]'::jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v jsonb; v_scan uuid; v_row integer; v_n integer; v_gone integer := 0;
begin
  for v in select * from jsonb_array_elements(coalesce(p_done, '[]'::jsonb)) loop
    update packtime_sheet_queue set done_at = now(), last_error = null, claimed_at = null where id = (v->>'op')::bigint;
    v_scan := nullif(v->>'scan', '')::uuid; v_row := nullif(v->>'row', '')::integer;
    if v_scan is not null and v_row is not null then
      update packtime_scans set sheet_synced_at = now(), sheet_row = v_row, sheet_error = null where id = v_scan;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        insert into packtime_sheet_queue (kind, scan_id, sheet_name, payload)
        values ('clear', v_scan, v->>'sheet', jsonb_build_object('sheet_row', v_row, 'awb', v->>'awb'));
        v_gone := v_gone + 1;
      end if;
    end if;
  end loop;
  for v in select * from jsonb_array_elements(coalesce(p_failed, '[]'::jsonb)) loop
    update packtime_sheet_queue set claimed_at = null, last_error = left(v->>'error', 500) where id = (v->>'op')::bigint;
    if nullif(v->>'scan', '') is not null then
      update packtime_scans set sheet_error = left(v->>'error', 500) where id = (v->>'scan')::uuid;
    end if;
  end loop;
  return v_gone;
end $function$;
revoke all on function public.packtime_sheet_done(jsonb, jsonb) from public, anon, authenticated;

-- The sheet check re-queues scans the sheet is missing (old-app scans included).
create or replace function public.packtime_sheet_requeue(p_scan_ids uuid[])
 returns integer
 language sql
 security definer
 set search_path to 'public'
as $function$
  with ins as (
    insert into packtime_sheet_queue (kind, scan_id, sheet_name, payload)
    select 'append', s.id, s.sheet_name, jsonb_build_object('awb', s.awb, 'scanned_at', s.scanned_at, 'camera', s.camera, 'brand', s.brand)
      from packtime_scans s
     where s.id = any (p_scan_ids)
       and not exists (select 1 from packtime_sheet_queue q where q.scan_id = s.id and q.kind = 'append' and q.done_at is null)
    returning 1)
  select count(*)::integer from ins;
$function$;
revoke all on function public.packtime_sheet_requeue(uuid[]) from public, anon, authenticated;

-- Shared secret: Vault for the scheduler, app_secrets for the edge function.
do $$
declare v text := encode(gen_random_bytes(24), 'hex');
begin
  insert into app_secrets (key, value) values ('packtime_sync_secret', v)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform vault.create_secret(v, 'packtime_sync_secret');
end $$;

create or replace function public.trigger_packtime_sheet_sync(p_action text default 'sync')
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'vault'
as $function$
declare v_secret text;
begin
  -- A quiet minute costs nothing: only fire when there is work (verify always runs).
  if p_action = 'sync' and not exists (select 1 from packtime_sheet_queue where done_at is null and attempts < 20) then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'packtime_sync_secret';
  if v_secret is null then raise warning 'packtime_sync_secret missing from vault - sheet sync not triggered'; return null; end if;
  return net.http_post(
    url     := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/packtime',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body    := jsonb_build_object('action', p_action, 'notify', p_action = 'verify', 'repair', true),
    timeout_milliseconds := 120000
  );
end $function$;
revoke all on function public.trigger_packtime_sheet_sync(text) from public, anon, authenticated;

select cron.schedule('packtime-sheet-sync',  '* * * * *', $$select public.trigger_packtime_sheet_sync('sync')$$);
select cron.schedule('packtime-sheet-check', '5 15 * * *', $$select public.trigger_packtime_sheet_sync('verify')$$);  -- 20:35 IST
