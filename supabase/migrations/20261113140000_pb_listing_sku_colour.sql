-- Playbook: a listing remembers the colour part of its sizes' codes (pre-launch fix D19).
--
-- WHY: a vendor's design code is shared by every colour of the design, so two
-- colours kept as two products sent the same SKU and barcode for each size.
-- The colour now goes into the code ("KA-5070" in Wine, size M →
-- "KA-5070-WINE-M"; pb-products productInput.ts). But a product's colour is
-- text that the AI or a person can re-word later ("Maroon" → "Wine"), and a
-- code that is on a store must not follow that: orders, labels and stock
-- sheets carry it. So the listing keeps the colour part its sizes were FIRST
-- sent with, and every later send uses it.
--   null = not sent yet (worked out at the first send);
--   ''   = sent without a colour part.
-- A listing that is already on a store when this arrives is treated as '':
-- its codes stay exactly as they are.
--
-- Additive: one column.
alter table public.pb_listings add column if not exists sku_colour text;
comment on column public.pb_listings.sku_colour is 'The colour part its sizes'' SKUs and barcodes were first sent to the store with (pb-products productInput.ts); '''' = none, null = not sent yet. Kept, so codes on a store do not follow a re-worded colour.';
