-- WHY: the owner found the AI cost suggestions impractical ("bundle
-- suppliers", "negotiate"). AI insights are now built ONLY from evidence
-- the app computes from its own data — purchase-order lines for the SKU,
-- paid rates versus sheet rates, stitching heads that double-count sheet
-- labour lines, peer sheets — and every insight must cite evidence ids.
-- Store the evidence the batch cited (so the E-refs still resolve after the
-- data moves on) and the model's note on which data would unlock more.
-- Additive. Applied via MCP as pricing_ai_suggestions_evidence.
alter table public.pricing_ai_suggestions
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists note text;
