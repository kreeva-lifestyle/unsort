-- WHY: owner wants each AI generation to show what it cost. The pricing-ai
-- function already receives token usage from Anthropic; store it with the
-- batch (usage jsonb) plus the estimated USD at the model's list price
-- (est_usd), so the saved card can show the cost later, not only at the
-- moment of generation. Additive. Applied via MCP as
-- pricing_ai_suggestions_cost.
alter table public.pricing_ai_suggestions
  add column if not exists usage jsonb,
  add column if not exists est_usd numeric(10,4);
