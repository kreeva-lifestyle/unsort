-- WHY: owner replaced the manual Master-Assistant spelling report with a
-- weekly AUTOFIX: master-sync's new 'spellfix' mode corrects dictionary-
-- verified garment/fabric misspellings directly in the Google master sheet
-- (the one sanctioned write-back; corrections only ever move toward a fixed
-- vocabulary, so trade names cannot be touched). Audit-trail table for every
-- cell changed + the weekly cron trigger. The regular 2-minute mirror sync
-- then brings corrections into the database automatically.
-- Applied 2026-08-15 via MCP as master_spellfix_log_and_weekly_cron.

create table if not exists public.master_spellfix_log (
  id uuid primary key default gen_random_uuid(),
  tab text not null,
  cell text not null,
  column_name text not null,
  sku text,
  before_text text not null,
  after_text text not null,
  words text,
  created_at timestamptz not null default now()
);
alter table public.master_spellfix_log enable row level security;
create policy spellfix_log_admin_read on public.master_spellfix_log
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

select cron.schedule('master-spellfix-weekly', '30 2 * * 0', $$select public.trigger_master_sync('spellfix')$$);
