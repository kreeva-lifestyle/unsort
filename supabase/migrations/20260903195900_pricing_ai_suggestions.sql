-- WHY: Price Projector "AI-powered suggestions" (owner spec, 2026-09-03).
-- One saved batch of AI cost-cutting suggestions per costing product. The
-- pricing-ai edge function DELETES the product's old batch and INSERTS the
-- new one on every generation, so at most one batch exists per product.
-- input_hash fingerprints the numbers the batch was generated from; the
-- client compares it with the live sheet to offer "Regenerate" when the
-- details changed. Cascade: deleting a costing sheet drops its batch.
-- Applied via MCP as pricing_ai_suggestions.
create table if not exists public.pricing_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  costing_product_id uuid not null references public.costing_products(id) on delete cascade,
  input_hash text not null,
  model text not null,
  suggestions jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists pricing_ai_suggestions_product_idx on public.pricing_ai_suggestions (costing_product_id, created_at desc);
alter table public.pricing_ai_suggestions enable row level security;
create policy "Authenticated can read" on public.pricing_ai_suggestions
  for select to authenticated using ((select auth.role()) = 'authenticated');
create policy "Operator+ can write" on public.pricing_ai_suggestions
  for all to authenticated
  using ((select auth.role()) = 'authenticated' and exists (
    select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role in ('admin','manager','operator')))
  with check (exists (
    select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role in ('admin','manager','operator')));
