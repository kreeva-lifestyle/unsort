-- Buyer Spider: Brave Search's free plan is 1,000 searches a month, and the
-- owner's rule is "never exceed 1,000, warn from 900". The count must be
-- exact and shared across users, runs and devices, so it lives in ONE row per
-- UTC month and is taken BEFORE each search, not tallied after it:
--
--   buyer_search_usage      month 'YYYY-MM' (UTC) -> searches used
--   buyer_search_reserve()  takes one search for the month, or returns null
--                           when the cap is reached. The upsert's row lock
--                           serialises two steppers, so two runs that both see
--                           999 cannot both search — the 1,000th is the last.
--                           A reserved search that then fails at Brave still
--                           counts (Brave saw the request). Service role only.
--
-- buyer_run_bump keeps the per-run counters; it gained an 8th parameter
-- (p_month) in an earlier version of this change that counted the month
-- there. That counting moved into buyer_search_reserve; the parameter cannot be
-- removed in place (Postgres keeps parameter defaults), so the 8-parameter
-- overload stays, accepts p_month and ignores it, and the edge function sends
-- p_month: null so PostgREST resolves that overload unambiguously. The old
-- 7-parameter overload is unused and may be dropped:
--   drop function buyer_run_bump(uuid, int, int, int, text, text, text);

create table if not exists buyer_search_usage (
  month      text primary key,
  used       int  not null default 0,
  updated_at timestamptz not null default now()
);
alter table buyer_search_usage enable row level security;
create policy buyer_search_usage_read on buyer_search_usage for select to authenticated using (true);

create or replace function buyer_search_reserve(p_month text, p_cap int) returns int
language sql security invoker set search_path = public as $$
  insert into buyer_search_usage (month, used) values (p_month, 1)
  on conflict (month) do update
    set used = buyer_search_usage.used + 1, updated_at = now()
    where buyer_search_usage.used < p_cap
  returning used;
$$;
revoke execute on function buyer_search_reserve(text, int) from public, anon, authenticated;

create or replace function buyer_run_bump(
  p_run uuid, p_pages int default 0, p_queries int default 0, p_leads int default 0,
  p_note text default null, p_error text default null, p_status text default null, p_month text default null
) returns buyer_runs
language sql security invoker set search_path = public as $$
  update buyer_runs
     set pages_fetched = pages_fetched + coalesce(p_pages, 0),
         queries_used  = queries_used  + coalesce(p_queries, 0),
         leads_found   = leads_found   + coalesce(p_leads, 0),
         step_note     = coalesce(p_note, step_note),
         last_error    = case when p_status = 'running' then null else coalesce(p_error, last_error) end,
         status        = coalesce(p_status, status),
         updated_at    = now()
   where id = p_run
  returning *;
$$;
revoke execute on function buyer_run_bump(uuid, int, int, int, text, text, text, text) from public, anon, authenticated;

comment on table buyer_search_usage is 'Buyer Spider: Brave searches used per UTC month. Reserved one at a time by buyer_search_reserve(); the free plan cap (1,000) is enforced there.';
comment on function buyer_search_reserve(text, int) is 'Buyer Spider: atomically takes one of the month''s searches (returns the new count) or returns null when p_cap is reached. Service role only.';
comment on function buyer_run_bump(uuid, int, int, int, text, text, text, text) is 'Additive counter update for a Buyer Spider run (service role only). p_month is unused: the monthly search count is taken by buyer_search_reserve() before each search; the parameter stays because a default cannot be removed in place.';
