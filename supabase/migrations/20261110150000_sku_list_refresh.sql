-- SKU list: refresh on demand, and right after every sheet sync (owner,
-- 2026-11-10): "a small refresh button near sku if the product is not found …
-- After every refresh the refresh button should disable for a minute … The
-- automatic check should be set on every 1 hour instead."
--
-- WHY this shape. product_catalog (the list behind every SKU box) was rebuilt
-- by pg_cron every 2 minutes. The rebuild was already gated (it skips unless a
-- sheet sync changed rows), but 720 checks a day is a timer mostly doing
-- nothing, and a plain hourly timer would make a new SKU wait up to an hour.
-- So:
--   1. A sheet sync that actually changed rows refreshes the list itself, at
--      once (trigger on master_sheet_sync below). New SKUs still appear within
--      seconds of the sheet push, with no timer involved.
--   2. The timer becomes an hourly backstop (job product-catalog-refresh, :41,
--      clear of the :17 health snapshot and the :23 full sync).
--   3. A SKU box whose text matches nothing offers "Refresh list"
--      (SkuRefreshHint.tsx), which calls refresh_sku_list(): it brings the list
--      up to date and, at most once a minute whoever asks, checks the master
--      sheet (mode 'auto': Drive's modified time first, a download only when
--      the sheet really changed). The button then rests for a minute.
-- The INCLUDES refresh used to re-parse every row every 2 minutes; it now runs
-- only when the main refresh did real work. One advisory lock serialises the
-- trigger, the button and the timer so they never deadlock on product_catalog.
--
-- Internal helpers live in schema `private`: the API serves `public` only and
-- anon/authenticated have no USAGE on `private`, so they cannot be called from
-- the app at all — no REVOKE needed. Written purely additively (no DROP/REVOKE)
-- because the Supabase MCP server now stops on those for a confirmation the
-- app does not show.

create schema if not exists private;

create or replace function private.refresh_catalog_now()
returns integer language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_before timestamptz; v_after timestamptz; v_rows int;
begin
  perform pg_advisory_xact_lock(hashtext('product_catalog_refresh'));
  select last_refreshed_at into v_before from product_catalog_refresh_state where id;
  v_rows := public.refresh_product_catalog();             -- change-gated, cheap when nothing moved
  select last_refreshed_at into v_after from product_catalog_refresh_state where id;
  if v_after is distinct from v_before then                -- the gate opened: real work was done
    v_rows := v_rows + public.refresh_product_catalog_includes();
  end if;
  return v_rows;
end $$;

-- Fires only when master-sync writes changed_rows, which it does only on a run
-- that downloaded the sheet (the lease claim, the "sheet unchanged" probe and
-- the error path never set that column). Wrapped so a refresh problem can
-- never fail the sync's own bookkeeping: a lease left 'running' would block
-- every sync for 5 minutes. The hourly backstop retries.
create or replace function private.master_sync_refresh_catalog()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  begin
    perform private.refresh_catalog_now();
  exception when others then
    raise warning 'SKU list refresh after master sync failed: %', sqlerrm;
  end;
  return null;
end $$;

create or replace trigger master_sync_refresh_catalog
  after update of changed_rows on public.master_sheet_sync
  for each row when (new.status = 'idle' and coalesce(new.changed_rows, 0) > 0)
  execute function private.master_sync_refresh_catalog();

-- What the "Refresh list" button calls. Any signed-in, active staff member
-- (anyone else gets 42501). Returns sheet = 'started' (a sheet check was just
-- started), 'running' (one was already under way) or 'recent' (one ran in the
-- last minute, so the list is already current), plus the server time.
create or replace function public.refresh_sku_list()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_sheet text := 'recent';
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_active is distinct from false) then
    raise exception 'Sign in to refresh the SKU list.' using errcode = '42501';
  end if;
  perform private.refresh_catalog_now();
  if exists (select 1 from master_sheet_sync
             where status = 'running' and started_at > now() - interval '5 minutes') then
    v_sheet := 'running';
  elsif not exists (select 1 from master_sheet_sync where started_at > now() - interval '60 seconds') then
    if public.trigger_master_sync('auto') is not null then v_sheet := 'started'; end if;
  end if;
  return jsonb_build_object('sheet', v_sheet, 'asked_at', now());
end $$;
grant execute on function public.refresh_sku_list() to authenticated;

-- Every 2 minutes → hourly backstop. Same job name, so this replaces it.
select cron.schedule('product-catalog-refresh', '41 * * * *', $$select private.refresh_catalog_now()$$);
