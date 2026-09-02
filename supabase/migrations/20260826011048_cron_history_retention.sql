-- WHY (health sweep 2026-08-25): cron.job_run_details had 42,546 rows and no
-- retention - pg_cron never cleans its own history, and this project's
-- 2-minute sync jobs write ~1,450 rows a day, growing forever. Daily purge
-- keeping 7 days (plenty for debugging job failures, bounded forever), plus
-- an immediate purge that cleared the backlog to 10,256 rows on apply.
-- Applied 2026-08-25 via MCP as cron_history_retention.
select cron.schedule(
  'purge-cron-history',
  '40 3 * * *',
  $$delete from cron.job_run_details where start_time < now() - interval '7 days'$$
);
delete from cron.job_run_details where start_time < now() - interval '7 days';
