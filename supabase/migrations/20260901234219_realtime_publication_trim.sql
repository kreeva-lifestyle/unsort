-- Server-load reduction (owner-approved plan, 2026-09-01): these three
-- tables were in the realtime publication but NOTHING in the app subscribes
-- to them (verified: zero .on('postgres_changes') references in src/), so
-- every write to them paid realtime WAL fan-out work for no listener -
-- realtime WAL polling is the single largest total-time item in
-- pg_stat_statements.
--
-- !! If a future feature subscribes to one of these, ADD IT BACK first:
--    alter publication supabase_realtime add table public.<name>;
-- (A subscription to an unpublished table sits silent - see the Purchase
-- Orders bug fixed on 2026-08-31.)
alter publication supabase_realtime drop table public.activity_logs;
alter publication supabase_realtime drop table public.damage_reports;
alter publication supabase_realtime drop table public.inventory_extras_history;
