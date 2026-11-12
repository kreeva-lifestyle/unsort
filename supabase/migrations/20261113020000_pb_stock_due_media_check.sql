-- Playbook pre-launch fixes, batch 2 (owner, 2026-11-13: "Fix all"): D5, D6, D7.
--
-- D6 WHY: a sold-out change did not always reach Shopify. It travelled as a full re-send of
-- the listing, which is refused or never started when the product is in Needs info, the
-- listing waits in Needs review or Failed, the website is switched off or automation is
-- paused. Every missed change is an order for goods the vendor no longer has.
-- HOW: stock gets its own small send (pb-products stockSend.ts): pb_listings.stock_due marks
-- a listing whose Shopify product does not yet show the product's stock; stock_tried_at is
-- when the last try failed (tried again after 5 minutes). The worker sends these first, for
-- every website (on or off), and trigger_pb_worker() wakes it for them even while paused.
--
-- D5 WHY: Shopify processes photos after it has answered, so a photo it could not fetch or
-- process went unnoticed. HOW: pb_listings.media_checked_at — null after a publish that
-- uploaded photos; the worker looks at the product's media a few minutes later
-- (mediaCheck.ts) and notes the photos that failed on the listing.
--
-- D7 WHY: the cost of an AI call that failed after the model had answered (cut off, refused,
-- unreadable) was never recorded, so the rupee figures under-reported. HOW: such a failure
-- now carries details.usd on its 'failed' activity row, and the two cost functions add it:
-- per product by its step (read / tags / generate), and in the total since a moment (which
-- the worker also reads for the daily AI limit).
--
-- Additive: three columns (existing rows: not due, not tried, to be checked), two partial
-- indexes, three functions replaced with the same signatures (privileges are kept).

alter table public.pb_listings
  add column if not exists stock_due boolean not null default false,
  add column if not exists stock_tried_at timestamptz,
  add column if not exists media_checked_at timestamptz;
comment on column public.pb_listings.stock_due is 'The product''s stock (in / out / permanently out) is still to be sent to this listing''s Shopify product (stockSend.ts).';
comment on column public.pb_listings.stock_tried_at is 'When the last stock send failed; tried again 5 minutes later. Null = not tried yet.';
comment on column public.pb_listings.media_checked_at is 'When Shopify''s processing of the photos of the last publish was looked at (mediaCheck.ts). Null = still to check.';

create index if not exists pb_listings_stock_due_idx on public.pb_listings (stock_tried_at) where stock_due;
create index if not exists pb_listings_media_check_idx on public.pb_listings (published_at)
  where status = 'published' and media_checked_at is null and shopify_product_id is not null;

create or replace function public.pb_ai_costs(p_ids uuid[])
returns table (product_id uuid, read_usd numeric, tag_usd numeric, write_usd numeric, writes int)
language sql stable security invoker set search_path = public as $$
  select a.product_id,
    coalesce(sum(u.usd) filter (where a.action = 'read' or (a.action = 'failed' and a.details ->> 'step' = 'read')), 0),
    coalesce(sum(u.usd) filter (where a.action = 'tags_filled' or (a.action = 'failed' and a.details ->> 'step' in ('tags', 'tags_fill'))), 0),
    coalesce(sum(u.usd) filter (where a.action = 'generated' or (a.action = 'failed' and a.details ->> 'step' = 'generate')), 0),
    (count(*) filter (where a.action = 'generated'))::int
  from pb_activity a
  cross join lateral (select case when jsonb_typeof(a.details -> 'usd') = 'number' then (a.details ->> 'usd')::numeric else 0 end as usd) u
  where a.product_id = any(coalesce(p_ids, '{}')) and a.details ? 'usd' and a.action in ('read', 'tags_filled', 'generated', 'failed')
  group by a.product_id;
$$;

create or replace function public.pb_ai_cost_since(p_since timestamptz)
returns table (usd numeric, products int, writes int)
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(u.usd), 0), (count(distinct a.product_id))::int, (count(*) filter (where a.action = 'generated'))::int
  from pb_activity a
  cross join lateral (select case when jsonb_typeof(a.details -> 'usd') = 'number' then (a.details ->> 'usd')::numeric else 0 end as usd) u
  where a.created_at >= p_since and a.details ? 'usd' and a.action in ('read', 'tags_filled', 'generated', 'failed');
$$;

-- The every-minute wake-up. Same body as 20261111090000_pb_worker_wakes_for_tags.sql, plus:
--   * stock still owed to a store wakes the worker even while automation is paused (the
--     function then sends the stock and nothing else: pb-products actions.ts doWork);
--   * a published listing whose photos are still to be looked at wakes it too.
create or replace function public.trigger_pb_worker()
returns bigint language plpgsql security definer
set search_path to 'public', 'extensions', 'vault' as $function$
declare v_secret text; v_paused boolean; v_stock boolean;
begin
  v_paused := coalesce((select (value->>'paused')::boolean from pb_settings where key = 'automation'), false);
  v_stock := exists (select 1 from pb_listings where stock_due and (stock_tried_at is null or stock_tried_at < now() - interval '5 minutes'));
  if v_paused and not v_stock then return null; end if;
  if not v_stock
     and not exists (select 1 from pb_products
                     where (status = 'new' and (claimed_at is null or claimed_at < now() - interval '5 minutes'))
                        or (status = 'reading' and claimed_at < now() - interval '5 minutes'))
     and not exists (select 1 from pb_listings l join pb_websites w on w.id = l.website_id and w.active
                     where (l.status in ('queued', 'publishing') and (l.claimed_at is null or l.claimed_at < now() - interval '5 minutes'))
                        or (l.status = 'generating' and l.claimed_at < now() - interval '5 minutes')
                        or (l.status = 'failed' and l.attempts < 3 and l.updated_at < now() - interval '10 minutes'))
     and not exists (select 1 from pb_import_runs
                     where status in ('queued', 'running') and (claimed_at is null or claimed_at < now() - interval '5 minutes'))
     and not exists (select 1 from pb_products where route_due)
     and not exists (select 1 from pb_products where tag_fill_run is not null and status in ('ready', 'needs_info'))
     and not exists (select 1 from pb_listings where status = 'published' and media_checked_at is null and shopify_product_id is not null
                       and published_at < now() - interval '3 minutes')
  then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pb_worker_secret';
  if v_secret is null then raise warning 'pb_worker_secret missing from vault'; return null; end if;
  return net.http_post(
    url := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-products',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('action', 'work'),
    timeout_milliseconds := 150000);
end $function$;
