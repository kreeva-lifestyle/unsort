-- Master sheet push: the sheet tells the app it changed, instead of the app
-- re-downloading it every few minutes.
--
-- Why: the Drive API is not enabled on the Google project, so the 2-minute
-- `master-sync-probe` cannot ask "did the file change?" — it downloads every
-- tab every 4 minutes (~360 full reads a day) to find out. A small Apps
-- Script in the sheet (docs/master-sheet-push.gs) now calls
-- master_sheet_touch() on every change; a 1-minute job syncs only when a
-- touch arrived since the last sync. Edits reach the app within a minute,
-- and a quiet sheet costs nothing.
--
-- Safety:
--   * master_sheet_touch() is callable with the public anon key (no secret in
--     the script). It only stamps a time; the most a stranger can cause is one
--     sheet sync per minute — the load the 2-minute probe already produced.
--   * The 2-minute probe stays as a safety net and slows itself to every 30
--     minutes only while pushes are arriving (one in the last 7 days). If the
--     script is removed or breaks, the probe returns to every 2 minutes.
--   * The hourly full reconcile and the product_catalog refresh (already
--     change-gated) are unchanged.

create table if not exists public.master_sheet_push (
  id                 boolean primary key default true check (id),
  touched_at         timestamptz,
  touches            bigint not null default 0,
  last_dispatched_at timestamptz
);
insert into public.master_sheet_push (id) values (true) on conflict do nothing;

alter table public.master_sheet_push enable row level security;
-- Readable by signed-in staff (freshness display); written only by the functions below.
create policy master_sheet_push_read on public.master_sheet_push
  for select to authenticated using (true);

-- Called by the Apps Script (anon key). Stamps the time; nothing else.
create or replace function public.master_sheet_touch()
returns void
language sql
security definer
set search_path = public
as $$
  update public.master_sheet_push set touched_at = now(), touches = touches + 1 where id;
$$;
revoke all on function public.master_sheet_touch() from public;
grant execute on function public.master_sheet_touch() to anon, authenticated;

-- Every minute: sync when the sheet was touched since the last dispatch and
-- no sync is mid-run (a running one would skip its tabs; retry next minute).
create or replace function public.dispatch_master_push()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v public.master_sheet_push;
begin
  select * into v from public.master_sheet_push where id for update;
  if v.touched_at is null or v.touched_at <= coalesce(v.last_dispatched_at, '-infinity') then return false; end if;
  if exists (select 1 from public.master_sheet_sync where status = 'running' and started_at > now() - interval '5 minutes') then return false; end if;
  update public.master_sheet_push set last_dispatched_at = now() where id;
  perform public.trigger_master_sync('full');   -- 'full': 'auto' would skip a tab synced in the last 4 minutes
  return true;
end;
$$;
revoke all on function public.dispatch_master_push() from public, anon, authenticated;

select cron.schedule('master-sheet-push', '* * * * *', $$select public.dispatch_master_push()$$);

-- The probe: every 2 minutes while no push has arrived in 7 days, otherwise
-- only at :00 and :30 (the push covers the rest).
select cron.schedule('master-sync-probe', '*/2 * * * *', $$
  select public.trigger_master_sync('auto')
  where coalesce((select touched_at from public.master_sheet_push where id), '-infinity') < now() - interval '7 days'
     or extract(minute from now())::int % 30 = 0
$$);
