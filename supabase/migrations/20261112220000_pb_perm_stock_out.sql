-- Playbook: a PERMANENT stock-out archives the product (owner, 2026-11-12, asked
-- "keep it visible as Sold out, or take it off the websites?": "Archive it").
-- WHY: a vendor's notice that says "permanent" means the design will not come
-- back. Showing it as Sold out for ever clutters the store, so the product is
-- taken off the websites (archived on Shopify) and archived in Playbook.
-- `perm_out_at` records that the vendor said so, and when: the publish step
-- reads it (with in_stock = false) to archive the Shopify product instead of
-- updating it, and the product page shows it. Switching Stock back on clears
-- it. Null = no such notice. Additive only.
alter table public.pb_products add column if not exists perm_out_at timestamptz;
comment on column public.pb_products.perm_out_at is 'When a vendor notice said PERMANENT stock out: with in_stock = false the product is archived on Shopify and in Playbook (pb-products stock.ts / publish.ts). Null = no such notice.';
