-- Brand Tags: remove four search indexes nothing uses (owner approved,
-- 2026-11-10). Verified against live pg_stat_user_indexes (9 months of
-- counts) AND the client code: the page searches one combined column
-- (search_text, which already contains SKU, EAN, colour and product), filters
-- brand and size, and sorts by created_at. Nothing filters on these columns
-- one by one.
--   idx_bt_ean_trgm   1,384 kB   1 scan
--   idx_bt_sku_trgm   1,264 kB   1 scan
--   idx_bt_product      176 kB  12 scans
--   idx_bt_color        112 kB   1 scan
-- About 2.9 MB of the table's 17 MB, and four fewer indexes to maintain on
-- every label import and edit. Dropping an index removes no data; any of
-- them can be re-created at any time.
drop index if exists public.idx_bt_ean_trgm;
drop index if exists public.idx_bt_sku_trgm;
drop index if exists public.idx_bt_product;
drop index if exists public.idx_bt_color;
