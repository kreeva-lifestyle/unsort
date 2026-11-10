-- SKU list refresh: fire whenever a tab's sheet sync ENDS, not only when that
-- same update reports changed rows (follow-up to 20261110150000, same day).
--
-- WHY: two sync runs can overlap — the every-minute sheet-push job and the
-- :00 / :23 / :30 jobs start in the same second. Run X finishes tab A with new
-- rows while run Y is still on tab B, so the refresh is (rightly) skipped:
-- the mirror is mid-swap. Y then finishes B with nothing changed, and under
-- the first trigger nobody refreshed again — the new SKU waited for the
-- hourly backstop. Now every running → idle transition asks, and
-- refresh_product_catalog()'s own change gate decides whether there is work.
-- When there is none this costs three tiny reads, about 150 times a day
-- (it replaced a timer that asked 720 times a day).
create or replace trigger master_sync_refresh_catalog
  after update of status on public.master_sheet_sync
  for each row when (old.status = 'running' and new.status = 'idle')
  execute function private.master_sync_refresh_catalog();
