-- Playbook: "temporarily out of stock" is a note, not a stock change (owner,
-- 2026-11-12: "If temporary word mentioned then ignore it. And just note that
-- product as temporary which can be filterable; nothing is to be done").
-- WHY: a vendor's stock-out picture says either "permanent" or "temporary".
-- Permanent takes the product off sale (in_stock = false). Temporary must
-- change nothing on the websites, but the owner wants to see and filter the
-- products a vendor called temporarily out. `temp_out_at` is that note: the
-- time the vendor's notice was read, null when there is none. It is set by the
-- notice reader (pb-products stockNotice.ts), cleared by staff on the product
-- page or by a later permanent notice, and never sent to Shopify.
-- Additive only; the partial index serves the "Temporarily out" list filter.
alter table public.pb_products add column if not exists temp_out_at timestamptz;
create index if not exists pb_products_temp_out_idx on public.pb_products (created_at desc) where temp_out_at is not null;
comment on column public.pb_products.temp_out_at is 'When a vendor notice called this product TEMPORARILY out of stock (a note only: nothing changes on Shopify). Null = no such note.';
