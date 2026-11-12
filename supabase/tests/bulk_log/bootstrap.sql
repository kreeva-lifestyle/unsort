create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.app_is_staff() returns boolean language sql stable as $$ select true $$;
create table public.profiles (id uuid primary key default gen_random_uuid(), full_name text);
create function public.pb_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create table public.pb_websites (id uuid primary key default gen_random_uuid(), name text not null, shop_domain text not null, active boolean not null default true, tag_rules jsonb not null default '{}', content jsonb not null default '{}', pricing jsonb not null default '{}');
create table public.pb_products (
  id uuid primary key default gen_random_uuid(), vendor_id uuid, source text not null default 'manual', source_ref text, raw_text text, sku text, name text, category text, fabric text, color text,
  sizes text[] not null default '{}', cost_price numeric, attributes jsonb not null default '{}', status text not null default 'new', locked text[] not null default '{}',
  ai_read_at timestamptz, ai_error text, claimed_at timestamptz, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  less_amount numeric, source_url text, intake_notes text[] not null default '{}', sell_price numeric, price_note text,
  in_stock boolean not null default true, temp_out_at timestamptz, perm_out_at timestamptz);
create table public.pb_product_images (id uuid primary key default gen_random_uuid(), product_id uuid references public.pb_products on delete cascade, path text, position int, kind text default 'image');
create table public.pb_listings (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.pb_products on delete cascade, website_id uuid not null references public.pb_websites on delete cascade,
  status text not null default 'queued', rule_id uuid, price numeric, compare_at_price numeric, title text, locked text[] not null default '{}', generated_at timestamptz, shopify_product_id text, shopify_status text,
  published_at timestamptz, attempts int not null default 0, claimed_at timestamptz, error text, created_at timestamptz default now(), updated_at timestamptz default now(),
  stock_due boolean not null default false, stock_tried_at timestamptz, media_checked_at timestamptz, unique (product_id, website_id));
create table public.pb_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table public.pb_activity (id bigint generated always as identity primary key, product_id uuid, website_id uuid, listing_id uuid, action text not null, details jsonb not null default '{}', user_id uuid, created_at timestamptz not null default now());
create table public.pb_import_runs (id uuid primary key default gen_random_uuid(), host text, added int default 0, found int default 0, skipped int default 0, status text, created_by uuid, created_at timestamptz default now(), finished_at timestamptz);
