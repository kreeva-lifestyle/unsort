-- SKU thumbnails from Dropbox, found once and served from Storage.
--
-- WHY: screens that list SKUs (Jobwork first) should show the product photo
-- that lives in the SKU's Dropbox folder. Searching Dropbox per row on every
-- view would be slow and would hammer both the edge function and Dropbox's
-- rate limit. Instead the odette-export edge function (action sku_thumbs)
-- finds a SKU's photo ONCE, asks Dropbox for a 256px JPEG thumbnail, and
-- stores it in the public sku-thumbs bucket as <SKU>.jpg; every later view
-- is a plain CDN image. This table records the outcome per SKU so the app
-- can tell in one query which SKUs have a thumbnail (and its version, used as
-- a cache-buster), which have no photo (re-checked after a few days, in case
-- the folder is added later), and which were never looked up.
--
-- Writes come only from the edge function with the service role; signed-in
-- users can read. The bucket is public-read (thumbnails of catalogue photos,
-- nothing private) with no client write policy.

create table public.sku_thumbs (
  sku text primary key check (sku <> '' and sku = upper(btrim(sku))),
  status text not null constraint chk_sku_thumbs_status check (status in ('ok', 'missing')),
  dropbox_path text,
  version bigint not null default 0,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sku_thumbs enable row level security;
create policy "sku thumbs read" on public.sku_thumbs for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sku-thumbs', 'sku-thumbs', true, 262144, array['image/jpeg'])
on conflict (id) do nothing;
