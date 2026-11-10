-- Database & storage health for the Dashboard (owner, 2026-11-10): "a Supabase
-- widget on the dashboard … insight on database storage and server loads. Built
-- smart so that it doesn't load our server."
--
-- WHY this shape: the numbers come from catalog views and storage.objects, which
-- are cheap but not free. So they are measured ONCE AN HOUR by pg_cron into a
-- small snapshot table (one row per hour, 7 days kept = 168 rows), and the app
-- only ever reads the latest row plus the size history — one tiny query when an
-- admin opens the Dashboard, no polling. "Refresh now" re-measures at most once
-- every 5 minutes, whoever presses it.
--
-- Plan limits shown in the widget (Pro): 8 GB database, 100 GB storage included;
-- connections are compared with max_connections.
--
-- The snapshot table and the measuring function live in schema `private`: the
-- API serves `public` only and anon/authenticated have no USAGE on `private`,
-- so the app can reach them only through get_db_stats() — no REVOKE needed.
-- Written purely additively (no DROP/REVOKE) because the Supabase MCP server
-- now stops on those for a confirmation the app does not show.

create schema if not exists private;

create table if not exists private.app_db_stats (
  id bigserial primary key,
  taken_at timestamptz not null default now(),
  db_bytes bigint not null,
  storage_bytes bigint not null,
  stats jsonb not null default '{}'::jsonb   -- tables, buckets, connections, cache, slow queries
);
create index if not exists app_db_stats_taken_idx on private.app_db_stats (taken_at desc);
alter table private.app_db_stats enable row level security;
-- No policies: only the two functions below (SECURITY DEFINER) touch it.

-- Takes one snapshot. Cheap catalog reads; the storage sum is one aggregate.
create or replace function private.take_db_stats()
returns void language plpgsql security definer
set search_path = pg_catalog, public, storage, extensions, pg_temp as $$
declare v jsonb; slow jsonb := '[]'::jsonb;
begin
  if exists (select 1 from pg_extension where extname = 'pg_stat_statements') then
    execute $q$
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select left(regexp_replace(query, '\s+', ' ', 'g'), 140) as q, calls,
               round(mean_exec_time::numeric, 1) as mean_ms, round(total_exec_time::numeric / 1000, 1) as total_s
        from extensions.pg_stat_statements
        where dbid = (select oid from pg_database where datname = current_database())
          and query not ilike '%pg_stat_statements%' and query not ilike '%take_db_stats%'
        order by total_exec_time desc limit 5) x $q$ into slow;
  end if;

  v := jsonb_build_object(
    'tables', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select relname as name, pg_total_relation_size(relid) as bytes, n_live_tup as rows
        from pg_stat_user_tables where schemaname = 'public'
        order by pg_total_relation_size(relid) desc limit 8) t),
    'buckets', (select coalesce(jsonb_agg(b), '[]'::jsonb) from (
        select bucket_id as name, sum(coalesce((metadata->>'size')::bigint, 0)) as bytes, count(*) as files
        from storage.objects group by bucket_id order by 2 desc limit 8) b),
    'connections', (select jsonb_build_object(
        'total', count(*), 'active', count(*) filter (where state = 'active'),
        'idle', count(*) filter (where state = 'idle'),
        'max', (select setting::int from pg_settings where name = 'max_connections'))
      from pg_stat_activity),
    'cache_hit', (select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2)
      from pg_stat_database where datname = current_database()),
    'commits', (select xact_commit from pg_stat_database where datname = current_database()),
    'deadlocks', (select deadlocks from pg_stat_database where datname = current_database()),
    'slow', slow);

  insert into private.app_db_stats (db_bytes, storage_bytes, stats)
  values (pg_database_size(current_database()),
          (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects), v);
  delete from private.app_db_stats where taken_at < now() - interval '7 days';
end $$;

-- What the widget reads: admins only. p_refresh = true re-measures first, but
-- only when the latest snapshot is older than 5 minutes.
create or replace function public.get_db_stats(p_refresh boolean default false)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare last_at timestamptz;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active) then
    raise exception 'Only admins can see database health.' using errcode = '42501';
  end if;
  select max(taken_at) into last_at from private.app_db_stats;
  if last_at is null or (p_refresh and last_at < now() - interval '5 minutes') then
    perform private.take_db_stats();
  end if;
  return jsonb_build_object(
    'latest', (select to_jsonb(s) from private.app_db_stats s order by taken_at desc limit 1),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('t', taken_at, 'db', db_bytes, 'st', storage_bytes) order by taken_at), '[]'::jsonb)
                from private.app_db_stats where taken_at > now() - interval '7 days'));
end $$;
grant execute on function public.get_db_stats(boolean) to authenticated;

-- Hourly snapshot (minute 17 so it does not pile onto the on-the-hour jobs).
select cron.schedule('db-health-snapshot', '17 * * * *', $$select private.take_db_stats()$$);
select private.take_db_stats();
