-- WHY: Price Projector (owner spec, 2026-09-03). A projection needs the
-- product's category (per-category margin/cost thresholds) and a small
-- per-product pricing document (stitching-head overrides, profit target,
-- threshold override). Both are ADDITIVE on costing_products so a costing
-- sheet stays one atomic row; nothing existing changes meaning.
-- Applied via MCP as price_projector_costing_columns.
alter table public.costing_products
  add column if not exists category text,
  add column if not exists pricing jsonb not null default '{}'::jsonb;
comment on column public.costing_products.category is 'Catalog category (auto-filled from product_catalog by SKU, editable); drives per-category pricing thresholds.';
comment on column public.costing_products.pricing is 'Price Projector per-product document: { stitching: {headId: {enabled, qty, rate}}, profit: {pct, fixed}, thresholds: {minMarginPct, maxCost}, maintenanceBase }.';
