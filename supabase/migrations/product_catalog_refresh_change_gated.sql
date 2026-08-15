-- WHY: refresh_product_catalog() was the single heaviest statement on the
-- database: ~1.57 s of CPU every 2 minutes (pg_cron job 'product-catalog-
-- refresh'), rebuilding the catalog even when the master-sheet mirror had not
-- changed. Its delete pass also ran a correlated group-by subquery per
-- catalog row (~1,270 seq scans of master_sheet_rows per call - 16 M scans
-- accumulated). Applied 2026-08-15 via MCP as product_catalog_refresh_change_gated.
-- Output is byte-identical (checksum-verified); only WHEN and HOW it runs changed:
--   1. Change gate: skip unless a master sync with changed_rows > 0 completed
--      since the last refresh; 6-hour heartbeat as a self-healing backstop.
--      Measured: full run 1,573 ms -> 34 ms; gated tick -> 1.2 ms.
--   2. Set-based delete: one aggregated pass instead of per-row rescans.
-- See the full function body in the applied migration (supabase migration
-- history) - the CTE pipeline is unchanged from the original.

create table if not exists public.product_catalog_refresh_state (
  id boolean primary key default true check (id),
  last_refreshed_at timestamptz not null default '-infinity'
);
comment on table public.product_catalog_refresh_state is
  'Single-row bookmark: when refresh_product_catalog() last ran to completion. Written only by that SECURITY DEFINER function; no client access.';
alter table public.product_catalog_refresh_state enable row level security;
insert into public.product_catalog_refresh_state (id) values (true)
on conflict (id) do nothing;
-- (function body applied via MCP migration of the same name)
