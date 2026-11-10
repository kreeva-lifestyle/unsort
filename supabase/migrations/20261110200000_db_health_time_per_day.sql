-- Dashboard "Database & server" tile: make "Where the server spends its time"
-- honest (owner, 2026-11-10, after asking why "Live updates" was on top).
--
-- WHY. Three things in the first version misled:
--   * The footer said "since the last database restart". The counters come from
--     pg_stat_statements, which survives restarts: they run from its last reset
--     (24 Mar 2026), not from the restart (14 Apr).
--   * It showed each line's share of the TOP FIVE, with no idea of size. The
--     top line was 68% of roughly 7 minutes of database work a day.
--   * The same job appeared up to three times, because the database counts one
--     query under several statement shapes.
-- The snapshot now groups the shapes, and also stores the total of all work
-- and the date the counters started; the tile shows a share of everything and
-- "about N minutes a day". Only private.take_db_stats() changes.

-- Takes one snapshot. Cheap catalog reads; the storage sum is one aggregate.
create or replace function private.take_db_stats()
returns void language plpgsql security definer
set search_path = pg_catalog, public, storage, extensions, pg_temp as $$
declare v jsonb; slow jsonb := '[]'::jsonb; slow_total numeric; slow_since timestamptz;
begin
  if exists (select 1 from pg_extension where extname = 'pg_stat_statements') then
    -- One line per kind of work: the same job is counted under several
    -- statement shapes, so group by the shortened text before taking the top 5.
    execute $q$
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select s.q, sum(s.calls)::bigint as calls,
               round((sum(s.total_exec_time) / nullif(sum(s.calls), 0))::numeric, 1) as mean_ms,
               round((sum(s.total_exec_time) / 1000)::numeric, 1) as total_s
        from (select left(regexp_replace(query, '\s+', ' ', 'g'), 140) as q, calls, total_exec_time
              from extensions.pg_stat_statements
              where dbid = (select oid from pg_database where datname = current_database())
                and query not ilike '%pg_stat_statements%' and query not ilike '%take_db_stats%') s
        group by s.q order by sum(s.total_exec_time) desc limit 5) x $q$ into slow;
    -- All database work, and the day the counters started, so the tile can
    -- say "N% of everything" and "about N minutes a day".
    execute $q$
      select round((sum(total_exec_time) / 1000)::numeric, 1) from extensions.pg_stat_statements
      where dbid = (select oid from pg_database where datname = current_database()) $q$ into slow_total;
    execute 'select stats_reset from extensions.pg_stat_statements_info' into slow_since;
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
    'slow', slow, 'slow_total_s', slow_total, 'slow_since', slow_since);

  insert into private.app_db_stats (db_bytes, storage_bytes, stats)
  values (pg_database_size(current_database()),
          (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects), v);
  delete from private.app_db_stats where taken_at < now() - interval '7 days';
end $$;
