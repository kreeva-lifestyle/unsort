-- Nearest match for tag suggestions (owner, 2026-11-13: "AI suggestion needed which suggest us to
-- select existing which is the nearest match").
--
-- WHY: each suggestion card on Settings → Tags should show the closest value already in the lists,
-- with one tap to file the phrase under it. The word rules (pb-products tagNearest.ts) work it out
-- on every list for free; what they cannot settle is asked of the AI once per phrase. The answer
-- must be KEPT, or every visit to the Tags page would pay for the same phrases again.
-- HOW: pb_tag_suggestions.nearest jsonb = the AI's answer { value_id: uuid | null (none close),
-- why: text, at: timestamptz }; null = not asked yet. Written only by the pb-products edge
-- function (service role); the existing RLS policies on the table are unchanged.
-- The AI calls log their cost as pb_activity action 'tags_matched' (details.usd, no product), so
-- pb_ai_cost_since — the daily AI limit and the dashboard's AI cost — now counts that action too.
-- Paid failures already arrive as 'failed' (step tags_match) and were counted before.
--
-- Additive: one nullable column (no backfill), one function replaced with the same signature and
-- body apart from the action list (privileges are kept).

alter table public.pb_tag_suggestions add column if not exists nearest jsonb;
comment on column public.pb_tag_suggestions.nearest is
  'The AI''s nearest existing value for this phrase: {value_id (null = none close), why, at}. Null = not asked yet (pb-products tagsNearest.ts).';

create or replace function public.pb_ai_cost_since(p_since timestamptz)
returns table (usd numeric, products int, writes int)
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(u.usd), 0), (count(distinct a.product_id))::int, (count(*) filter (where a.action = 'generated'))::int
  from pb_activity a
  cross join lateral (select case when jsonb_typeof(a.details -> 'usd') = 'number' then (a.details ->> 'usd')::numeric else 0 end as usd) u
  where a.created_at >= p_since and a.details ? 'usd' and a.action in ('read', 'tags_filled', 'generated', 'failed', 'tags_matched');
$$;
