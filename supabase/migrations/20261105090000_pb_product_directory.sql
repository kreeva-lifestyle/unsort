-- Playbook · Product Directory (owner, 2026-11-04).
--
-- WHY: the owner wants every vendor product that reaches us (Telegram later,
-- typed in by staff today) in one directory, and from there an automatic,
-- rule-driven upload to several Shopify websites: which vendor's products go
-- to which site, at what price (cost + that site's margin), with that site's
-- tag structure and its own AI-written title / description / SEO, using a
-- model and effort chosen per site. Owner's answers (2026-11-04): publish
-- fully automatically and live (each site can be paused or set to review /
-- draft); the price in a vendor post is the vendor's COST; Telegram intake is
-- stitched later (the `ingest` action of the pb-products edge function is
-- ready for it).
--
-- Tables (all pb_ = Playbook, staff-only RLS):
--   pb_vendors          who supplies the product
--   pb_products         one product as received (+ AI-read attributes)
--   pb_product_images   its photos (bucket playbook-products, public so
--                       Shopify can fetch them; uploads staff-only)
--   pb_websites         one Shopify store each: connection, publishing mode,
--                       pricing, tag rules, AI content settings
--   pb_website_secrets  store credentials — NO policies: service role only
--   pb_routing_rules    ordered include/exclude rules per website
--   pb_listings         one product on one website: price, content, status,
--                       Shopify id
--   pb_settings         division-wide settings (AI for reading products,
--                       category list, pause switch)
--   pb_activity         what happened, for the product timeline
-- The worker: pg_cron every minute calls trigger_pb_worker(), which pokes the
-- pb-products edge function only when there is work (x-sync-secret from
-- Vault, matched against app_secrets.pb_worker_secret — the packtime pattern).

-- ── tables ────────────────────────────────────────────────────────────────
create table public.pb_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  notes text,
  active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pb_vendors_name_key on public.pb_vendors (lower(name));

create table public.pb_products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.pb_vendors(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'telegram', 'import')),
  source_ref text,
  raw_text text,
  sku text,
  name text,
  category text,
  fabric text,
  color text,
  sizes text[] not null default '{}',
  cost_price numeric(12,2) check (cost_price is null or cost_price >= 0),
  attributes jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'reading', 'needs_info', 'ready', 'archived')),
  locked text[] not null default '{}',
  ai_read_at timestamptz,
  ai_error text,
  claimed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pb_products_source_ref_key on public.pb_products (source, source_ref) where source_ref is not null;
create index pb_products_status_idx on public.pb_products (status, created_at);
create index pb_products_vendor_idx on public.pb_products (vendor_id, created_at desc);
create index pb_products_created_idx on public.pb_products (created_at desc);

create table public.pb_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.pb_products(id) on delete cascade,
  path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index pb_product_images_product_idx on public.pb_product_images (product_id, position);

create table public.pb_websites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shop_domain text not null,
  auth_mode text not null default 'token' check (auth_mode in ('token', 'client_credentials')),
  api_version text not null default '2026-10', -- = API_VERSION in pb-products/shopify.ts
  active boolean not null default false,
  publish_mode text not null default 'live' check (publish_mode in ('live', 'draft', 'review')),
  routing_default text not null default 'none' check (routing_default in ('all', 'none')),
  track_inventory boolean not null default false,
  pricing jsonb not null default '{"markup_pct": 100, "add_flat": 0, "rounding": "end_99", "compare_at_pct": 0, "min_price": null}'::jsonb,
  tag_rules jsonb not null default '{"templates": ["{category}", "{fabric}", "{color}", "Vendor_{vendor}"], "static": [], "case": "as_is", "ai_extra": true, "ai_extra_max": 5}'::jsonb,
  content jsonb not null default '{"model": "claude-haiku-5-5", "effort": "", "language": "English", "brand_voice": "", "title_template": "{ai_title}", "title_max": 70, "description_words": 120, "meta_title_max": 60, "meta_desc_max": 155, "extra_instructions": "", "alt_text": true}'::jsonb,
  connected_at timestamptz,
  shop_name text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pb_websites_domain_key on public.pb_websites (lower(shop_domain));
-- Only real Shopify addresses: the edge function sends the store's credentials
-- to this host, so it must never be pointed elsewhere.
alter table public.pb_websites add constraint pb_websites_domain_shape check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$');
-- A website can only be switched on once a connection test has passed.
alter table public.pb_websites add constraint pb_websites_active_needs_connection check (not active or connected_at is not null);

create table public.pb_website_secrets (
  website_id uuid primary key references public.pb_websites(id) on delete cascade,
  access_token text,
  client_id text,
  client_secret text,
  token_expires_at timestamptz,
  online_store_publication_id text,
  updated_at timestamptz not null default now()
);

create table public.pb_routing_rules (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.pb_websites(id) on delete cascade,
  position integer not null default 0,
  name text not null default '',
  enabled boolean not null default true,
  action text not null default 'include' check (action in ('include', 'exclude')),
  conditions jsonb not null default '{}'::jsonb,
  price_override jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pb_routing_rules_site_idx on public.pb_routing_rules (website_id, position);

create table public.pb_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.pb_products(id) on delete cascade,
  website_id uuid not null references public.pb_websites(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'generating', 'review', 'publishing', 'published', 'failed', 'skipped')),
  rule_id uuid references public.pb_routing_rules(id) on delete set null,
  price numeric(12,2),
  compare_at_price numeric(12,2),
  title text,
  description_html text,
  seo_title text,
  seo_description text,
  handle text,
  tags text[] not null default '{}',
  product_type text,
  image_alts text[] not null default '{}',
  locked text[] not null default '{}',
  ai_model text,
  ai_effort text,
  ai_cost_usd numeric(10,4),
  generated_at timestamptz,
  shopify_product_id text,
  shopify_status text,
  published_at timestamptz,
  attempts integer not null default 0,
  claimed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, website_id)
);
create index pb_listings_status_idx on public.pb_listings (status, updated_at);
create index pb_listings_site_idx on public.pb_listings (website_id, status);

create table public.pb_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.pb_settings (key, value) values
  ('reader', '{"model": "claude-haiku-5-5", "effort": ""}'::jsonb),
  ('categories', '["Saree", "Lehenga", "Kurta Set", "Kurti", "Anarkali", "Salwar Suit", "Gown", "Co-ord Set", "Dupatta", "Blouse", "Indo-Western", "Kids Wear"]'::jsonb),
  ('automation', '{"paused": false}'::jsonb)
on conflict (key) do nothing;

create table public.pb_activity (
  id bigserial primary key,
  product_id uuid references public.pb_products(id) on delete cascade,
  website_id uuid references public.pb_websites(id) on delete set null,
  listing_id uuid references public.pb_listings(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index pb_activity_product_idx on public.pb_activity (product_id, created_at desc);

-- ── updated_at ────────────────────────────────────────────────────────────
create or replace function public.pb_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['pb_vendors','pb_products','pb_websites','pb_routing_rules','pb_listings','pb_settings','pb_website_secrets'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.pb_touch()', t || '_touch', t);
  end loop;
end $$;

-- ── RLS: staff only; secrets: service role only ───────────────────────────
do $$ declare t text; begin
  foreach t in array array['pb_vendors','pb_products','pb_product_images','pb_websites','pb_routing_rules','pb_listings','pb_settings','pb_activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "pb staff read" on public.%I for select to authenticated using ((select public.app_is_staff()))', t);
    execute format('create policy "pb staff insert" on public.%I for insert to authenticated with check ((select public.app_is_staff()))', t);
    execute format('create policy "pb staff update" on public.%I for update to authenticated using ((select public.app_is_staff())) with check ((select public.app_is_staff()))', t);
    execute format('create policy "pb staff delete" on public.%I for delete to authenticated using ((select public.app_is_staff()))', t);
  end loop;
end $$;
-- The activity log is append-only for people, and a person can only write
-- rows in their own name (the edge function writes as service role).
drop policy "pb staff update" on public.pb_activity;
drop policy "pb staff delete" on public.pb_activity;
drop policy "pb staff insert" on public.pb_activity;
create policy "pb staff insert" on public.pb_activity for insert to authenticated
  with check ((select public.app_is_staff()) and (user_id is null or user_id = (select auth.uid())));
-- Websites: staff edit settings only. The store address, credentials mode,
-- API version and connection fields are written by the edge function
-- (save_credentials / test_connection, admin/manager), never by the app.
-- A new website is only its name + store address; everything else starts
-- from the column defaults (inactive, not connected).
revoke update on public.pb_websites from authenticated;
grant update (name, active, publish_mode, routing_default, track_inventory, pricing, tag_rules, content) on public.pb_websites to authenticated;
revoke insert on public.pb_websites from authenticated;
grant insert (name, shop_domain) on public.pb_websites to authenticated;
alter table public.pb_website_secrets enable row level security;
revoke all on public.pb_website_secrets from anon, authenticated;

-- ── photos ───────────────────────────────────────────────────────────────
-- Public read: Shopify downloads the photos by URL, and they are going on a
-- public website anyway. Upload / delete are staff only; 15 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('playbook-products', 'playbook-products', true, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "playbook-products staff read" on storage.objects for select to authenticated
  using (bucket_id = 'playbook-products' and (select public.app_is_staff()));
create policy "playbook-products staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'playbook-products' and (select public.app_is_staff()));
create policy "playbook-products staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'playbook-products' and (select public.app_is_staff()));

-- ── worker trigger (pg_cron → edge function, only when there is work) ────
do $$ declare s text := encode(extensions.gen_random_bytes(32), 'hex'); begin
  if not exists (select 1 from vault.secrets where name = 'pb_worker_secret') then
    perform vault.create_secret(s, 'pb_worker_secret');
    insert into public.app_secrets (key, value) values ('pb_worker_secret', s)
      on conflict (key) do update set value = excluded.value;
  end if;
end $$;

create or replace function public.trigger_pb_worker()
returns bigint language plpgsql security definer
set search_path to 'public', 'extensions', 'vault' as $function$
declare v_secret text;
begin
  if coalesce((select (value->>'paused')::boolean from pb_settings where key = 'automation'), false) then return null; end if;
  -- Exactly what the function's read / generate / publish steps would pick up
  -- (reader.ts, generate.ts, publish.ts due()): a claim younger than 5 minutes
  -- (a run holds it, the ingest photo hold, an AI retry wait) and listings of
  -- switched-off websites are not work — otherwise the function is called every
  -- minute for nothing.
  if not exists (select 1 from pb_products
                 where (status = 'new' and (claimed_at is null or claimed_at < now() - interval '5 minutes'))
                    or (status = 'reading' and claimed_at < now() - interval '5 minutes'))
     and not exists (select 1 from pb_listings l join pb_websites w on w.id = l.website_id and w.active
                     where (l.status in ('queued', 'publishing') and (l.claimed_at is null or l.claimed_at < now() - interval '5 minutes'))
                        or (l.status = 'generating' and l.claimed_at < now() - interval '5 minutes')
                        or (l.status = 'failed' and l.attempts < 3 and l.updated_at < now() - interval '10 minutes'))
  then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pb_worker_secret';
  if v_secret is null then raise warning 'pb_worker_secret missing from vault'; return null; end if;
  return net.http_post(
    url := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-products',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('action', 'work'),
    timeout_milliseconds := 150000);
end $function$;
revoke all on function public.trigger_pb_worker() from public, anon, authenticated;

select cron.schedule('pb-product-worker', '* * * * *', $$select public.trigger_pb_worker()$$);
