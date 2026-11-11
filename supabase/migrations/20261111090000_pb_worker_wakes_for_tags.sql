-- Playbook: the every-minute wake-up also fires for tag work (2026-11-11).
--
-- Why: 20261110090000_pb_tags.sql gave the worker two more jobs
-- (pb-products/worker.ts → tagFill.ts): products queued for "Let AI decide"
-- (pb_products.tag_fill_run) and products a tag change made Ready
-- (pb_products.route_due). trigger_pb_worker() was never told about them, so
-- with nothing else waiting the worker was not called at all: a queued fill
-- sat at "N waiting", and a product made Ready by a tag change was not sent to
-- its websites, until an unrelated product, listing or import woke the worker
-- or someone pressed Settings → Run now.
--
-- What: the same body as 20261108090000_pb_website_import.sql plus those two
-- tests. The tag_fill_run test mirrors fillCandidates() (status ready /
-- needs_info), so a product the worker would not pick cannot keep it awake;
-- both tests are served by the partial indexes of the tags migration
-- (pb_products_fill_idx, pb_products_route_due_idx). The worker always takes a
-- product off either list once it has tried it, so neither can loop.
--
-- Privileges are not touched: create or replace keeps them (execute stays
-- revoked from public, anon and authenticated; pg_cron runs it as the owner).
create or replace function public.trigger_pb_worker()
returns bigint language plpgsql security definer
set search_path to 'public', 'extensions', 'vault' as $function$
declare v_secret text;
begin
  if coalesce((select (value->>'paused')::boolean from pb_settings where key = 'automation'), false) then return null; end if;
  if not exists (select 1 from pb_products
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
  then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pb_worker_secret';
  if v_secret is null then raise warning 'pb_worker_secret missing from vault'; return null; end if;
  return net.http_post(
    url := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-products',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('action', 'work'),
    timeout_milliseconds := 150000);
end $function$;
