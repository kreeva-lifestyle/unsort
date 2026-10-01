-- Cash Challan: Pending Orders (owner's ask — "Introduce Pending Orders tab in
-- Cash Challan. Make pending orders to cash challan").
--
-- WHY: a customer orders before the goods are ready. Until now that lived in
-- the owner's head or on WhatsApp. A pending order records who ordered what
-- (SKU + description + quantity — no prices, no advance: owner's choice) so
-- that when the goods are ready, "Make challan" opens the challan form
-- pre-filled and the operator only adds prices. The order is then marked
-- converted and linked to the challan it became, so it leaves the Pending
-- list but stays visible under "Converted".
--
-- Items are jsonb ([{sku, description, quantity}]) like costing components:
-- they are only ever read with the order, never filtered or joined.
-- Access mirrors cash_challan_customers: any signed-in user reads, operator+
-- writes. Indexes: the list filters on status and orders by created_at; the
-- customer index serves the eventual "orders of this customer" lookup.
-- Additive. Applied via MCP as cash_challan_orders.

create table if not exists public.cash_challan_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.cash_challan_customers(id) on delete set null,
  customer_name text not null check (btrim(customer_name) <> ''),
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'converted', 'cancelled')),
  challan_id uuid references public.cash_challans(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  converted_at timestamptz,
  converted_by uuid
);

comment on table public.cash_challan_orders is
  'Cash Challan pending orders: what a customer ordered before a challan exists. items = [{sku, description, quantity}]. converted orders link the challan they became.';

create index if not exists cash_challan_orders_status_created_idx
  on public.cash_challan_orders (status, created_at desc);
create index if not exists cash_challan_orders_customer_idx
  on public.cash_challan_orders (customer_id);

alter table public.cash_challan_orders enable row level security;

drop policy if exists "Authenticated can read" on public.cash_challan_orders;
create policy "Authenticated can read" on public.cash_challan_orders
  for select to authenticated using (true);

drop policy if exists "Operator+ can write" on public.cash_challan_orders;
create policy "Operator+ can write" on public.cash_challan_orders
  for all to authenticated
  using (exists (select 1 from public.profiles
                 where profiles.id = (select auth.uid())
                   and profiles.role = any (array['admin', 'manager', 'operator'])))
  with check (exists (select 1 from public.profiles
                      where profiles.id = (select auth.uid())
                        and profiles.role = any (array['admin', 'manager', 'operator'])));
