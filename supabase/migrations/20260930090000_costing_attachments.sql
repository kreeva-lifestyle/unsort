-- Product Costing: attachments (owner's ask — "attachment option in product
-- costing with image compression").
--
-- Why a jsonb column and not a table: attachments belong to exactly one
-- costing sheet, are only ever read with it (never filtered or joined), and
-- the sheet already stores its components the same way. Each element is
--   { path, url, name, type, size, uploaded_at }
-- where path is the object key in the existing public `costing-images`
-- bucket under attachments/<costing id>/<random uuid>.<ext>. Photos are
-- resized and re-encoded on the phone before upload; PDFs go up as-is.
--
-- RLS: unchanged and already correct for a new column — the table's
-- "Authenticated can read" / "Operator+ can write" policies cover it, and
-- the bucket's authenticated insert/delete policies cover the files.
-- No index: the column is never used as a filter.

alter table public.costing_products
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.costing_products.attachments is
  'Files attached to the costing sheet: [{path,url,name,type,size,uploaded_at}]; objects live in storage bucket costing-images under attachments/<id>/.';
