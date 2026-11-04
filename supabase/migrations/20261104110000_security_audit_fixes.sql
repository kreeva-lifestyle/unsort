-- Security audit fixes (owner, 2026-11-04: "Fix rest").
-- A read-only audit (2026-11-04) confirmed these holes; each section says WHY.
-- Part 1: log tables + notifications + master_sheet_touch
-- Part 2: staff-only writes on the "signed in = trusted" tables, staff-only
--         reads of the Minis tables that hold customer data / print jobs,
--         narrower staff directory, deleted Program module's share links off
-- Part 3: storage — program-voice-notes policies dropped (bucket and files are
--         removed through the Storage API, not SQL), costing-images reads
--         staff-only.
-- Policies, triggers and grants only: no column/table changes, so
-- src/types/database.ts is unchanged. Idempotent.

-- Security fix: notifications / audit_log / activity_logs / error_logs writes,
-- and master_sheet_touch() grants.  (Security audit 2026-10-31, owner: "FIX".)
-- Idempotent: safe to run twice.  No column, table or type changes, so
-- src/types/database.ts does not change.
--
-- WHY, per table (every writer traced on the live DB and in src/ +
-- supabase/functions/ before this was written):
--
-- 1. notifications — policy "System can insert notifications" was WITH CHECK
--    (true) and `authenticated` held INSERT, so any signed-in account could
--    drop a fake "system" message into anyone's bell (in-app phishing).
--    Real writers: master-sync and packtime edge functions, both with the
--    SERVICE ROLE (bypasses RLS and keeps its own grant).  The only DB
--    function that inserts notifications, check_pair_completion(), is not
--    attached to any trigger (dead code).  The app itself only SELECTs and
--    marks is_read (UPDATE own rows) — both untouched.  So: drop the INSERT
--    policy and revoke INSERT from anon/authenticated.  Nobody legitimate
--    loses anything.
--
-- 2. audit_log — "Authenticated can insert audit_log" WITH CHECK (true).
--    Writers: client inserts (CashChallan ccAuditLog without user_id,
--    CashBook with user_id = own id), audit_write() (INVOKER, used by the
--    PO/challan/jobwork RPCs and PODetail), log_audit_trigger() (DEFINER,
--    owner postgres → bypasses RLS), packcam edge fn (service role).
--    The BEFORE INSERT trigger audit_log_stamp_actor() already overwrites
--    user_id/user_email from the session.  Two gaps remain and are closed:
--      a) user_email was left caller-controlled when the caller had no
--         profiles row → now falls back to the JWT email, never the payload;
--      b) created_at was caller-controlled (back-dated entries) → stamped
--         now() for any session caller.  Data-backfill SQL run without a JWT
--         (migrations, SQL editor, cron) is untouched, as before.
--    The policy now also pins user_id = auth.uid(), so if the stamp trigger
--    is ever dropped, a forged actor is rejected instead of stored.
--
-- 3. activity_logs — "System can insert logs" WITH CHECK (true) and NO stamp
--    trigger: anyone could insert a row with another user's user_id that the
--    Inventory item history joins to that person's name.  Writers:
--    log_activity() (INVOKER trigger on products / inventory_items /
--    damage_reports; inserts user_id NULL), complete_item_with_extra() and
--    revert_item_with_extra() (INVOKER; user_id = auth.uid()).  No client
--    code inserts.  Fix mirrors audit_log: a BEFORE INSERT trigger stamps
--    user_id = auth.uid() and created_at = now() for session callers, and the
--    policy requires user_id = auth.uid().  log_activity rows written during
--    a signed-in user's edit now carry that user instead of NULL (the
--    Inventory history renders only date + description, so nothing changes
--    on screen).  Service role / cron / SQL editor (no JWT) are untouched.
--
-- 4. error_logs — "Anyone can insert error logs" lets anon write unbounded
--    rows.  anon must stay: src/main.tsx installs the global error handlers
--    before sign-in, and 6 of the 13 rows on file came from signed-out
--    sessions (login screen).  So instead of removing anon:
--      * a SECURITY DEFINER BEFORE INSERT trigger stamps user_id/user_email
--        from the JWT (no more "logged as someone else"), stamps created_at,
--        truncates every text column to the sizes errorLogger.ts already
--        sends (message 2000, stack 8000; url 2000, user_agent 512,
--        source 32), and silently drops signed-out rows beyond 60 per hour
--        (RETURN NULL — the client sees success, and logging is best-effort
--        anyway).  DEFINER is needed because anon cannot SELECT error_logs
--        to count.  Signed-in users are not capped server-side (they are
--        identified by the stamp; the client caps 50 per page load).
--      * the policy pins user_id to auth.uid() (NULL for anon).
--    Truncating instead of a CHECK constraint means a legitimate long URL
--    still gets logged rather than rejected.
--
-- 5. master_sheet_touch() — EXECUTE-able by anon ON PURPOSE: its only caller
--    is the Apps Script in the master sheet (docs/master-sheet-push.gs),
--    which posts with the public publishable key and no user session.
--    Revoking anon would silently stop sheet pushes (edits would then take
--    up to 30 minutes to reach the app via the probe).  What a stranger can
--    do with it is cause at most one full sheet sync per minute — the load
--    the old 2-minute probe already produced (see 20261027120000 header).
--    Tightened instead:
--      * revoked from `authenticated` (no app code calls it);
--      * while a touch is already waiting for the next dispatch, further
--        touches are a no-op, so a flood of calls no longer rewrites the row
--        (no dead tuples / WAL churn).  An edit made after a dispatch always
--        opens a new pending touch, so no change is ever missed.
--    If the owner wants anon gone entirely, that needs a shared secret in
--    the Apps Script (re-paste) — a separate change, not done here.

-- ── 1. notifications ────────────────────────────────────────────────────
drop policy if exists "System can insert notifications" on public.notifications;
revoke insert on public.notifications from anon, authenticated;

-- ── 2. audit_log ────────────────────────────────────────────────────────
create or replace function public.audit_log_stamp_actor()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare v_uid uuid := auth.uid(); v_name text;
begin
  if v_uid is not null then
    new.user_id := v_uid;
    select coalesce(nullif(btrim(full_name), ''), email) into v_name from profiles where id = v_uid;
    -- Never keep a caller-supplied name: profile name, else the JWT email.
    new.user_email := coalesce(v_name, nullif(auth.jwt() ->> 'email', ''));
    new.created_at := now();
  end if;
  return new;
end $fn$;

drop policy if exists "Authenticated can insert audit_log" on public.audit_log;
drop policy if exists "Insert audit_log as self" on public.audit_log;
create policy "Insert audit_log as self" on public.audit_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ── 3. activity_logs ────────────────────────────────────────────────────
create or replace function public.activity_logs_stamp_actor()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    new.user_id := v_uid;
    new.created_at := now();
  end if;
  return new;
end $fn$;
revoke all on function public.activity_logs_stamp_actor() from public, anon, authenticated;

drop trigger if exists trg_activity_logs_stamp_actor on public.activity_logs;
create trigger trg_activity_logs_stamp_actor
  before insert on public.activity_logs
  for each row execute function public.activity_logs_stamp_actor();

drop policy if exists "System can insert logs" on public.activity_logs;
drop policy if exists "Insert activity_logs as self" on public.activity_logs;
create policy "Insert activity_logs as self" on public.activity_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ── 4. error_logs ───────────────────────────────────────────────────────
create index if not exists idx_error_logs_anon_created
  on public.error_logs (created_at) where user_id is null;

create or replace function public.error_logs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare v_uid uuid := auth.uid();
begin
  new.user_id    := v_uid;
  new.user_email := case when v_uid is null then null else nullif(left(auth.jwt() ->> 'email', 320), '') end;
  new.created_at := now();
  new.message    := left(new.message, 2000);
  new.stack      := left(new.stack, 8000);
  new.source     := left(new.source, 32);
  new.url        := left(new.url, 2000);
  new.user_agent := left(new.user_agent, 512);
  if v_uid is null and (
       select count(*) from error_logs
       where user_id is null and created_at > now() - interval '1 hour'
     ) >= 60 then
    return null;   -- signed-out flood: drop quietly (best-effort log)
  end if;
  return new;
end $fn$;
revoke all on function public.error_logs_guard() from public, anon, authenticated;

drop trigger if exists trg_error_logs_guard on public.error_logs;
create trigger trg_error_logs_guard
  before insert on public.error_logs
  for each row execute function public.error_logs_guard();

drop policy if exists "Anyone can insert error logs" on public.error_logs;
drop policy if exists "Insert error logs as self" on public.error_logs;
create policy "Insert error logs as self" on public.error_logs
  for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));

-- ── 5. master_sheet_touch() ─────────────────────────────────────────────
create or replace function public.master_sheet_touch()
returns void
language sql
security definer
set search_path = public
as $fn$
  update public.master_sheet_push
     set touched_at = now(), touches = touches + 1
   where id
     and (touched_at is null or touched_at <= coalesce(last_dispatched_at, '-infinity'));
$fn$;
revoke all on function public.master_sheet_touch() from public;
revoke execute on function public.master_sheet_touch() from authenticated;
grant execute on function public.master_sheet_touch() to anon;   -- Apps Script (publishable key)

-- ═════════════════════════════════════════════════════════════════════════
-- Part 2
-- Staff-only writes on the "signed in = trusted" tables + narrower staff directory
-- (2026-11-04 security audit, findings "Family of tables allow full write with
-- USING true / WITH CHECK true" and "Full staff directory readable by every
-- authenticated user").
--
-- WHY: these tables let ANY signed-in account insert/update/delete, because
-- their policies are USING (true) / WITH CHECK (true) (or the equivalent
-- auth.role() = 'authenticated') with no role or is_active check:
--   programs, program_prices, program_price_parts, program_matchings,
--   program_history, program_lookup_brands, program_lookup_fabric_names,
--   program_lookup_part_names, program_user_preferences (own row only, but no
--   is_active check), virtual_stock, indya_sku_map, address_labels,
--   print_queue, utsav_ignored_skus, buyer_leads (buyer_leads_outreach UPDATE),
--   return_labels (found on re-scan: auth.role() = 'authenticated' == true).
-- So a deactivated employee whose session is still alive, or an invited
-- account that still has the default 'viewer' role, could change or wipe
-- this data with a direct API call; the app only hid the screens.
--
-- FIX: the same pattern the 2026-10-31 lockdown used for cash_*/attendance_*
-- ("staff only read"): a RESTRICTIVE policy that is ANDed with the existing
-- permissive ones, one per write command (insert / update / delete). public.app_is_staff() = active admin/manager/operator.
-- * Every screen that writes these tables is used by admins/managers/operators
--   (Minis, Print Station, Settings > Printers, Client Finder), so today's
--   staff (1 admin, 5 managers, all active) keep everything they do now;
--   module_access still only hides tabs, as before.
-- * service_role (buyer-spider writes buyer_leads), pg_cron and SECURITY
--   DEFINER functions owned by postgres (log_program_change -> program_history,
--   get_shared_program) bypass RLS and are unaffected.
-- * The Program module is deleted from the app; its tables and data are kept,
--   only writes are limited to staff. (Its voice-notes bucket is removed
--   separately.)
-- Not here (own findings / own fixes): notifications, audit_log,
-- activity_logs, error_logs insert policies.
--
-- profiles SELECT: "Signed-in users can view profiles" was USING (true), so
-- any signed-in account read every employee's email, phone, role and
-- module_access. Now: your own row always (sign-in, deactivation sign-out,
-- My Profile, own-role checks inside RLS/functions), everyone's rows only
-- for active staff (user management, cash book/handovers, PO/jobwork names,
-- check_pair_completion notifications). app_is_staff() is SECURITY DEFINER
-- owned by postgres (BYPASSRLS), so calling it from a profiles policy does not
-- recurse into profiles RLS.
--
-- Idempotent: drop-if-exists then create.

do $$
declare
  t text;
begin
  foreach t in array array[
    'programs', 'program_prices', 'program_price_parts', 'program_matchings',
    'program_history', 'program_lookup_brands', 'program_lookup_fabric_names',
    'program_lookup_part_names', 'program_user_preferences',
    'virtual_stock', 'indya_sku_map', 'address_labels', 'print_queue',
    'utsav_ignored_skus', 'buyer_leads', 'return_labels'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "staff only insert" on public.%I', t);
      execute format('drop policy if exists "staff only update" on public.%I', t);
      execute format('drop policy if exists "staff only delete" on public.%I', t);
      execute format('create policy "staff only insert" on public.%I as restrictive for insert to authenticated with check ((select public.app_is_staff()))', t);
      execute format('create policy "staff only update" on public.%I as restrictive for update to authenticated using ((select public.app_is_staff())) with check ((select public.app_is_staff()))', t);
      execute format('create policy "staff only delete" on public.%I as restrictive for delete to authenticated using ((select public.app_is_staff()))', t);
    end if;
  end loop;
end $$;

-- ── profiles: own row, or everyone's for active staff ─────────────────────
drop policy if exists "Signed-in users can view profiles" on public.profiles;
create policy "Signed-in users can view profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.app_is_staff()));

-- Reads of the Minis tables: print_queue holds the full HTML of every queued
-- print (salary slips included), address_labels customer names / phones /
-- addresses. They were readable by any signed-in account, active or not.
-- Every screen that reads them (Minis, Print Station, Settings > Printers) is
-- a staff screen; edge functions use the service role.
do $$
declare t text;
begin
  foreach t in array array['virtual_stock','indya_sku_map','address_labels','print_queue','utsav_ignored_skus','return_labels'] loop
    execute format('drop policy if exists "staff only read" on public.%I', t);
    execute format('create policy "staff only read" on public.%I as restrictive for select to authenticated using ((select public.app_is_staff()))', t);
  end loop;
end $$;

-- The Program module is deleted from the app: its anonymous share links
-- (x-share-token SELECT policies) still let anyone holding an old link read
-- programs, prices, parts, matchings and history. Drop them, take anon's
-- write grants off the tables above (no anon write policy exists, so this is
-- defence in depth), and take the module's RPCs away from anon/public.
drop policy if exists anon_programs_share on public.programs;
drop policy if exists anon_prices_share on public.program_prices;
drop policy if exists anon_parts_share on public.program_price_parts;
drop policy if exists anon_matchings_share on public.program_matchings;
drop policy if exists anon_history_share on public.program_history;
do $$
declare t text;
begin
  foreach t in array array['programs','program_prices','program_price_parts','program_matchings','program_history',
    'program_lookup_brands','program_lookup_fabric_names','program_lookup_part_names','program_user_preferences',
    'virtual_stock','indya_sku_map','address_labels','print_queue','utsav_ignored_skus','buyer_leads','return_labels'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete, truncate on public.%I from anon', t);
    end if;
  end loop;
end $$;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('upsert_program', 'upsert_program_price') loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════
-- Part 3 (storage)
-- WHY
-- 1. program-voice-notes: the Program module was removed from the app (#1245)
--    and the owner has asked for its voice-notes bucket and files to be removed
--    entirely (2026-11-04). The bucket is public=true, so its recordings were
--    readable by anyone with a link. Its two remaining policies (staff
--    upload/delete, added 2026-11-02) have no caller left in src/ and would be
--    dead once the bucket is gone. Dropping them now also means only the
--    service role can write there between this migration and the purge.
--    The bucket and its blobs are removed by the purge-voice-notes edge
--    function (part B): Supabase forbids DELETE on storage tables from SQL
--    (trigger storage.protect_delete) and a SQL delete would orphan the blobs.
-- 2. costing-images: reads were open to ANY signed-in account while every
--    write (and the Costing feature itself) is staff-only. Reads now require
--    app_is_staff() (active admin/manager/operator), mirroring the writes.
--    This SELECT policy must stay (not be dropped): the client uploads with
--    upsert:true, and INSERT .. ON CONFLICT DO UPDATE needs the row visible
--    (see 20260820145553). Staff still pass, so upload/upsert/remove keep working.
--    NOTE: the bucket is public=true and the app stores getPublicUrl() URLs in
--    costing_products.image_url / attachments[].url and renders them via
--    /storage/v1/object/public/... which bypasses RLS. So this policy only
--    governs the authenticated Storage API (list / download / createSignedUrl /
--    upsert visibility). It does NOT stop anyone holding a public URL from
--    fetching the file. Making the bucket private is a separate change that
--    needs the app to switch to signed URLs (and a rewrite of stored URLs).
-- Today's users: 1 admin + 5 managers, all active staff — no behaviour change.

drop policy if exists "program-voice-notes staff upload" on storage.objects;
drop policy if exists "program-voice-notes staff delete" on storage.objects;
-- legacy names from before 20261102130000, in case any environment still has them
drop policy if exists auth_voice_upload on storage.objects;
drop policy if exists auth_voice_delete on storage.objects;

drop policy if exists "costing-images auth read" on storage.objects;
drop policy if exists "costing-images staff read" on storage.objects;
create policy "costing-images staff read" on storage.objects for select to authenticated
  using (bucket_id = 'costing-images' and (select public.app_is_staff()));

