-- Editor redesign (owner-approved mockup, 2026-08-26): the new hero shows
-- cost/pc next to a selling-price + margin strip, so the selling price needs
-- a home. Purely ADDITIVE - nullable, no default, nothing existing changes.
alter table public.costing_products
  add column if not exists selling_price numeric;
