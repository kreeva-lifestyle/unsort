-- Buyer Spider: `step` can be called by two tabs or devices at once (a run can
-- be resumed from anywhere). Two additions so that never costs double:
--
--   buyer_queue.claimed_at  a step claims its item with a conditional PATCH
--                           (pending AND unclaimed, or claimed > 3 min ago —
--                           an edge timeout leaves no other trace) before it
--                           reads and judges the site, so one site is never
--                           judged twice in one run.
--   buyer_run_bump()        the run's counters are ADDED in SQL instead of
--                           being written from the function's stale snapshot,
--                           so no increment is lost and the per-run caps hold.
--                           Service role only: never callable from the browser.

alter table buyer_queue add column if not exists claimed_at timestamptz;

create or replace function buyer_run_bump(
  p_run uuid, p_pages int default 0, p_queries int default 0, p_leads int default 0,
  p_note text default null, p_error text default null, p_status text default null
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
revoke execute on function buyer_run_bump(uuid, int, int, int, text, text, text) from public, anon, authenticated;

comment on column buyer_queue.claimed_at is 'Set by the step that is working this item; re-claimable 3 minutes later if the step never finished.';
comment on function buyer_run_bump(uuid, int, int, int, text, text, text) is 'Additive counter update for a Buyer Spider run (service role only).';
