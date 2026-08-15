-- WHY: the performance advisor found three pairs of byte-identical indexes
-- on inventory_items (the busiest write table): every insert/update
-- maintained both copies of each pair for zero read benefit. Keep the
-- descriptive names, drop the short-named duplicates.
-- Applied 2026-08-15 via MCP as drop_duplicate_inventory_indexes.
drop index if exists public.idx_inv_created;
drop index if exists public.idx_inv_product;
drop index if exists public.idx_inv_status;
