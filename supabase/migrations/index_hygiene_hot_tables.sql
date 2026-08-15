-- WHY (advisor follow-up, verified against live pg_stat_user_indexes AND the
-- client code): drop dead indexes on the two heaviest-write tables, add the
-- two FK indexes the UI genuinely queries per-item.
-- brand_tags (7,145 rows, 500-row import batches): idx_bt_ean / idx_bt_sku /
-- idx_bt_copies had 0 scans in 5 months - the UI searches with ilike, which
-- btree cannot serve. packtime_scans: idx_packtime_scans_awb is covered by
-- the composite awb+session index, which is KEPT because the Undo flow
-- filters exactly (awb, session_id). The other ~33 advisor-flagged unindexed
-- FKs are audit columns never filtered on - indexing them would just
-- recreate the unused-index problem. Applied 2026-08-15 via MCP.
drop index if exists public.idx_bt_ean;
drop index if exists public.idx_bt_sku;
drop index if exists public.idx_bt_copies;
drop index if exists public.idx_packtime_scans_awb;
create index if not exists idx_damage_reports_item on public.damage_reports (inventory_item_id);
create index if not exists idx_extras_history_related_item on public.inventory_extras_history (related_inventory_item_id);
