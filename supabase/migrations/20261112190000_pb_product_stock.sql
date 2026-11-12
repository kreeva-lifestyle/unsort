-- Playbook: a product is in stock or out of stock (owner, 2026-11-12: "If stock
-- out/in-stock on playbook that same happens in shopify stores").
-- WHY: Playbook had no stock state at all. A product copied from another store
-- kept selling on our Shopify stores after it sold out at the source, because
-- nothing recorded that it had. `in_stock` is that record: the importer sets it
-- from the source store on every run (also for products already here), staff
-- can flip it on the product page, and the publish step mirrors it on Shopify
-- (out of stock → the sizes show as Sold out; in stock → orderable again).
-- Additive only: every existing product starts in stock, which is how each of
-- them is treated today. The partial index serves the "Out of stock" filter of
-- the Products list (few rows are ever out of stock).
alter table public.pb_products add column if not exists in_stock boolean not null default true;
create index if not exists pb_products_out_of_stock_idx on public.pb_products (created_at desc) where not in_stock;
comment on column public.pb_products.in_stock is 'false = out of stock: mirrored on Shopify as Sold out (pb-products productInput.ts). Set by the importer from the source store and by staff.';
