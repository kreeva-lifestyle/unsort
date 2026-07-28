-- Client Finder — reverse image search over Google Cloud Vision WEB_DETECTION.
--
-- WHY these two tables rather than one: a search is worth keeping even when it
-- returns nothing (it is proof we looked, and it is the rate-limit ledger), and
-- hits are 1:N per search. Splitting them also lets the sha256 cache return a
-- prior search's hits without re-paying Google.
--
-- Access is "any logged-in user" by owner's decision, but scoped to OWN rows:
-- one user's competitor research is not everybody's business. Spend is bounded
-- in the edge function by a per-user daily cap counted off cfs_by_user_day.

create table if not exists client_finder_searches (
  id           uuid primary key default gen_random_uuid(),
  searched_by  uuid not null references profiles(id) on delete cascade,
  source       text not null check (source in ('upload','sku')),
  sku          text,
  image_sha256 text not null,
  best_guess   text,
  hit_count    int  not null default 0,
  created_at   timestamptz not null default now()
);

-- Drives the rate-limit count (searched_by + time window) and the history list.
create index if not exists cfs_by_user_day on client_finder_searches (searched_by, created_at desc);
-- Drives the dedupe lookup: same bytes searched again costs no Vision call.
create index if not exists cfs_by_sha on client_finder_searches (image_sha256, created_at desc);

create table if not exists client_finder_hits (
  id         uuid primary key default gen_random_uuid(),
  search_id  uuid not null references client_finder_searches(id) on delete cascade,
  domain     text not null,
  url        text not null,
  page_title text,
  -- full    = byte-identical image found on that page
  -- partial = cropped / resized / rewatermarked variant
  -- page    = Google lists the page as hosting a match without classifying it
  match_kind text not null check (match_kind in ('full','partial','page')),
  score      real
);

create index if not exists cfh_by_search on client_finder_hits (search_id);
create index if not exists cfh_by_domain on client_finder_hits (domain);

alter table client_finder_searches enable row level security;
alter table client_finder_hits     enable row level security;

-- Own rows only. No INSERT/UPDATE/DELETE policy anywhere: every write goes
-- through the service-role edge function, which bypasses RLS.
create policy cfs_own_read on client_finder_searches for select to authenticated
  using (searched_by = auth.uid());

create policy cfh_own_read on client_finder_hits for select to authenticated
  using (exists (select 1 from client_finder_searches s
                 where s.id = client_finder_hits.search_id
                   and s.searched_by = auth.uid()));

comment on table client_finder_searches is
  'Reverse image searches (Google Vision WEB_DETECTION). Also the rate-limit ledger and the sha256 dedupe cache.';
comment on table client_finder_hits is
  'Pages found hosting a searched image. match_kind full > partial > page in confidence order.';
