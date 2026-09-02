-- WHY: new "Product Costing" Mini (owner spec). One costing sheet per
-- product: SKU + photo + main components -> sub-components, each sub carrying
-- qty/unit and one or more suppliers (name + material code + rate, one
-- selected as the costing rate). The tree is a JSONB document on ONE row so
-- every save is a single-row atomic write - a sheet is always edited as a
-- whole and never queried across products. Bucket costing-images holds the
-- product photos. Applied 2026-08-19 via MCP as product_costing_module.

create table if not exists public.costing_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  image_url text,
  maintenance_pct numeric not null default 0,
  components jsonb not null default '[]',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists costing_products_sku_key on public.costing_products (upper(btrim(sku)));
alter table public.costing_products enable row level security;
create policy "Authenticated can read" on public.costing_products
  for select to authenticated using ((select auth.role()) = 'authenticated');
create policy "Operator+ can write" on public.costing_products
  for all to authenticated
  using ((select auth.role()) = 'authenticated' and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = any (array['admin','manager','operator'])));

insert into storage.buckets (id, name, public)
values ('costing-images', 'costing-images', true)
on conflict (id) do nothing;
create policy "costing-images staff insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'costing-images');
create policy "costing-images staff update" on storage.objects
  for update to authenticated using (bucket_id = 'costing-images');
create policy "costing-images staff delete" on storage.objects
  for delete to authenticated using (bucket_id = 'costing-images');
