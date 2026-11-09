-- Playbook · Import from website (owner, 2026-11-08): "a tool where we enter
-- the website and it scrapes all in-stock products". The websites are other
-- (competitor) online stores; what is found is ADDED to Playbook as products
-- (source 'import'), read by the AI and routed to our websites as usual. The
-- price shown on the other store IS OUR SELLING PRICE — not a cost — so the
-- pricing formulas are skipped for these products.
--
-- Changes
--   pb_products      + sell_price   "sell at exactly this price on every website;
--                                    the website's pricing rules are skipped"
--                    + price_note   e.g. "Price copied from example.com on 8 Nov"
--   pb_import_runs   one import of one website: what was asked (url, options,
--                    vendor), where it is (status, cursor, counters) and the
--                    preview sample. ALL writes go through the pb-products edge
--                    function (service role) so the URL is validated there and
--                    robots.txt is respected; the app only reads.
--   trigger_pb_worker()  also fires while an import run is queued / running
--                    (the worker advances at most one run per minute).
-- Dedupe: source_ref = '<host>:<product id or handle>' under the existing
-- unique index pb_products_source_ref_key (source, source_ref), so running the
-- same website again skips products already imported.
-- Spec: docs/playbook/product-directory-spec.md ("Import from website").

-- ── products: selling price copied from the other store ───────────────────
alter table public.pb_products add column if not exists sell_price numeric(12,2)
  check (sell_price is null or sell_price >= 0);
alter table public.pb_products add column if not exists price_note text;
comment on column public.pb_products.sell_price is
  'Sell at exactly this price on every website; the website''s pricing rules are skipped (import from website).';
comment on column public.pb_products.price_note is 'Where the selling price came from, e.g. "Price copied from example.com on 8 Nov".';

-- ── import runs ───────────────────────────────────────────────────────────
create table if not exists public.pb_import_runs (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  host text not null,
  platform text check (platform in ('shopify', 'woocommerce', 'generic', 'unknown')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  in_stock_only boolean not null default true,
  use_their_price boolean not null default true,
  vendor_id uuid references public.pb_vendors(id) on delete set null,
  -- Where the next page starts (per platform, see pb-products/import/cursor.ts):
  -- Shopify { next: '/products.json?limit=50&page=2', currency } · WooCommerce { page }
  -- · generic { sitemaps[], si, off }. Also { errors: n } consecutive page errors.
  cursor jsonb not null default '{}'::jsonb,
  found int not null default 0,          -- products seen on the site so far
  added int not null default 0,          -- new Playbook products
  skipped int not null default 0,        -- already imported earlier (same source_ref)
  out_of_stock int not null default 0,   -- left out (in_stock_only)
  failed int not null default 0,         -- could not be added (error logged)
  sample jsonb,                          -- first 3 products { name, price, image, url } for the preview
  error text,                            -- plain sentence when failed; a note on done ("Stopped at 5000 products")
  claimed_at timestamptz,                -- the worker tick that holds it (released at the end of the tick)
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists pb_import_runs_status_idx on public.pb_import_runs (status, created_at desc);
-- One open run per site: two quick taps on Start (or two staff members) must not
-- make two runs that fetch the same store at twice the pace. The edge function
-- checks first and turns this index's 409 into the same "already running" sentence.
create unique index if not exists pb_import_runs_one_open on public.pb_import_runs (host) where status in ('queued', 'running');
drop trigger if exists pb_import_runs_touch on public.pb_import_runs;
create trigger pb_import_runs_touch before update on public.pb_import_runs for each row execute function public.pb_touch();

alter table public.pb_import_runs enable row level security;
revoke all on public.pb_import_runs from anon;
-- Staff read the list and the progress; every write is the edge function's.
revoke insert, update, delete, truncate on public.pb_import_runs from authenticated;
drop policy if exists "pb staff read" on public.pb_import_runs;
create policy "pb staff read" on public.pb_import_runs for select to authenticated using ((select public.app_is_staff()));

-- ── worker trigger: an import run is work too ─────────────────────────────
-- Same body as 20261105090000 plus the pb_import_runs test: a run that is
-- queued or running and that no tick holds (claimed_at null, or a tick that
-- crashed more than 5 minutes ago) keeps the function called every minute
-- until it is done, failed or cancelled.
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
  then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pb_worker_secret';
  if v_secret is null then raise warning 'pb_worker_secret missing from vault'; return null; end if;
  return net.http_post(
    url := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-products',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('action', 'work'),
    timeout_milliseconds := 150000);
end $function$;
revoke all on function public.trigger_pb_worker() from public, anon, authenticated;
