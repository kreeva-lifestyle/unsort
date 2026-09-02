-- Mirror of the offline Google master sheet (tabs ARYA + DRESSTIVE).
--
-- WHY: every master-sheet feature (Listing AI generate/validate, Bulk Teach,
-- Master Assistant, rate card, public seller link) downloads the FULL used
-- range of both tabs from the Sheets API on each request. The 60s in-isolate
-- cache in listing-ai misses on every cold isolate, so a 60-SKU run could pull
-- both tabs up to 40 times, and an anonymous seller-link visit reaches Google
-- directly. This table lets those reads come from Postgres, with the sheet
-- still the only place data is edited (one-way: sheet -> DB, never back).
--
-- SHAPE: `cells` is a POSITIONAL jsonb array, not a header-keyed object. Every
-- consumer in listing-ai indexes rows by column position (rows: string[][]),
-- and an object would silently collapse duplicate headers. Trailing blanks are
-- trimmed so appending an empty column to the sheet writes nothing.
create table public.master_sheet_rows (
  tab          text not null,
  row_num      int  not null,        -- 1-based sheet row; data starts at 2
  sku          text,                  -- raw SKU cell, as typed
  sku_norm     text,                  -- trim+upper  -> exact lookup
  sku_compact  text,                  -- separators stripped -> fuzzy tiers
  catalog      text,                  -- CATALOG NAME cell, when the tab has one
  cells        jsonb not null,        -- ["v0","v1",...] aligned to column ordinal
  content_hash text not null,         -- md5(cells) - drives skip-if-unchanged
  synced_at    timestamptz not null default now(),
  primary key (tab, row_num)
) with (fillfactor = 85);             -- update-heavy + tiny: leave room for HOT updates

comment on table public.master_sheet_rows is
  'Read-only mirror of the Google master sheet. Written only by the master-sync edge function (service role).';

-- Only the lookups the readers actually perform. No GIN on `cells` and no trgm
-- index yet: fuzzy SKU matching still runs in the edge function, so those would
-- be pure write cost on every sync with nothing reading them.
create index master_sheet_rows_sku_norm    on public.master_sheet_rows (sku_norm)    where sku_norm    is not null;
create index master_sheet_rows_sku_compact on public.master_sheet_rows (sku_compact) where sku_compact is not null;
create index master_sheet_rows_catalog     on public.master_sheet_rows (catalog)     where catalog     is not null;

-- Header catalogue per tab. Keyed by ordinal (not header text) because a sheet
-- may legitimately repeat a header; ordinal is the only lossless key.
create table public.master_sheet_columns (
  tab         text not null,
  ordinal     int  not null,
  header      text not null,          -- exactly as displayed in the sheet
  header_norm text not null,          -- normHeader(): lowercase, alphanumeric only
  non_empty   int  not null default 0,-- rows with a value -> rate card colCounts
  primary key (tab, ordinal)
);
create index master_sheet_columns_norm on public.master_sheet_columns (header_norm);

-- One row per tab: sync ledger AND the concurrency lease. A sync claims its tab
-- by flipping status to 'running'; a crashed run self-heals after 5 minutes.
create table public.master_sheet_sync (
  tab             text primary key,
  status          text not null default 'idle',   -- idle | running | error
  started_at      timestamptz,
  last_success_at timestamptz,
  last_error      text,
  sheet_modified  timestamptz,        -- Drive modifiedTime seen at last success
  row_count       int  not null default 0,
  changed_rows    int  not null default 0,        -- rows written by the last sync
  duration_ms     int
);

insert into public.master_sheet_sync (tab) values ('ARYA'), ('DRESSTIVE');

alter table public.master_sheet_rows    enable row level security;
alter table public.master_sheet_columns enable row level security;
alter table public.master_sheet_sync    enable row level security;

-- Read for signed-in admin/manager only, matching ratecard_share.
-- Deliberately NO anon policy: the public seller link must keep going through
-- the edge function's share-token check, or the URL becomes a read key to every
-- price in the master sheet.
-- Deliberately NO insert/update/delete policy: the sync writes with the service
-- role, which bypasses RLS. Nothing else may write.
create policy master_sheet_rows_read on public.master_sheet_rows
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.is_active
                   and p.role = any (array['admin', 'manager'])));

create policy master_sheet_columns_read on public.master_sheet_columns
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.is_active
                   and p.role = any (array['admin', 'manager'])));

-- Freshness is not sensitive: any signed-in user may see "master synced N min ago".
create policy master_sheet_sync_read on public.master_sheet_sync
  for select to authenticated using (true);
