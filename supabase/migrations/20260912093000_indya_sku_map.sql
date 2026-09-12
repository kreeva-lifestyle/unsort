-- WHY: Indya's product master carries many misspelt design codes. The owner
-- wants a permanent map — the code as Indya has it → the correct code —
-- typed once and applied every time the Indya file is processed (the SKU
-- sheet for vendors, the stock lookup, the results). Codes only, never a
-- size: one entry fixes every size of that product. Same access shape as
-- virtual_stock (any signed-in user can manage it). wrong_norm is the
-- case/space-insensitive key the app upserts on.
-- Additive. Applied via MCP as indya_sku_map.

create table if not exists public.indya_sku_map (
  id uuid primary key default gen_random_uuid(),
  wrong text not null,
  wrong_norm text generated always as (upper(btrim(wrong))) stored,
  correct text not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint indya_sku_map_wrong_norm_key unique (wrong_norm)
);

comment on table public.indya_sku_map is
  'Indya Import: design code as Indya sends it → the correct code. Codes only, no sizes.';

alter table public.indya_sku_map enable row level security;

drop policy if exists "Authenticated users can manage indya sku map" on public.indya_sku_map;
create policy "Authenticated users can manage indya sku map"
  on public.indya_sku_map for all to authenticated
  using (true) with check (true);
