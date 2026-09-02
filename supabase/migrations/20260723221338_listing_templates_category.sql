-- listing_templates.category: owner-picked garment-category id ('kurta-set',
-- 'lehenga-choli', ...) used by the listing-ai edge fn to warn BEFORE any AI
-- spend when pasted SKUs don't look like the template's garment type.
-- NULL = auto: the edge fn detects it from the template name at request time,
-- so existing templates need no backfill and renames self-heal.
alter table public.listing_templates add column if not exists category text;
comment on column public.listing_templates.category is
  'Garment category id for pre-AI SKU validation; NULL = detect from name';
