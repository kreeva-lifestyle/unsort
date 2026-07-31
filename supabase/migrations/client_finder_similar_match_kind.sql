-- client_finder_hits.match_kind gained 'similar' in PR #1008, but only the
-- live database's CHECK was widened — the repo's client_finder.sql still
-- forbids it. On any environment rebuilt from these migrations, the first
-- search returning even one visually-similar image had its WHOLE hits batch
-- rejected (PostgREST inserts atomically), which the 24h sha-dedupe then
-- served as a cached "no results" for a photo that had matches. Idempotent:
-- recreates the same constraint production already has.
alter table public.client_finder_hits
  drop constraint if exists client_finder_hits_match_kind_check;
alter table public.client_finder_hits
  add constraint client_finder_hits_match_kind_check
  check (match_kind in ('full', 'partial', 'page', 'similar'));
