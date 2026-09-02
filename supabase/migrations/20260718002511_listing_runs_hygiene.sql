-- Listing AI: saved-runs hygiene (documents already-applied remote state).
--
-- These objects were applied to the remote project via the audit pass but
-- lived only in the database; this file makes them auditable in the repo.
-- Every statement is idempotent, so applying it against the live project is a
-- no-op. It assumes the listing_runs / listing_mappings / listing_templates /
-- profiles tables already exist (they were created earlier via MCP; capturing
-- the full listing_ai schema in the repo is tracked separately).
--
-- What this records:
--   1. listing_runs foreign keys (both ON DELETE SET NULL, so deleting a
--      template or a user never orphans or destroys a saved run).
--   2. A btree index on listing_mappings(updated_at DESC) - the edge function
--      pages taught mappings newest-first, so this backs that ORDER BY.
--   3. listing_runs RLS: read is restricted to active admin/manager (this is
--      the fix for the earlier anon-read leak); insert/delete to admin/manager.
--   4. A pg_cron job purging saved runs older than 5 days (matches the 5-day
--      retention the UI promises).

-- 1. Foreign keys -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listing_runs_created_by_fk') THEN
    ALTER TABLE public.listing_runs
      ADD CONSTRAINT listing_runs_created_by_fk
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listing_runs_template_fk') THEN
    ALTER TABLE public.listing_runs
      ADD CONSTRAINT listing_runs_template_fk
      FOREIGN KEY (template_id) REFERENCES public.listing_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Newest-first index for the taught-mappings paginated fetch -------------
CREATE INDEX IF NOT EXISTS listing_mappings_updated_idx
  ON public.listing_mappings USING btree (updated_at DESC);

-- 3. Row-level security on saved runs --------------------------------------
ALTER TABLE public.listing_runs ENABLE ROW LEVEL SECURITY;

-- Read: active admin/manager only. (Was the anon-read leak - a run's rows,
-- SKUs and cost are internal business data, never world-readable.)
DROP POLICY IF EXISTS "lr read" ON public.listing_runs;
CREATE POLICY "lr read" ON public.listing_runs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.role = ANY (ARRAY['admin','manager'])));

-- insert/delete are granted TO public but gated by the same profiles check
-- (anon has no auth.uid(), so the EXISTS fails for them) - documenting the
-- exact live roles, not tightening them.
DROP POLICY IF EXISTS "lr insert" ON public.listing_runs;
CREATE POLICY "lr insert" ON public.listing_runs
  FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager'])));

DROP POLICY IF EXISTS "lr delete" ON public.listing_runs;
CREATE POLICY "lr delete" ON public.listing_runs
  FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = ANY (ARRAY['admin','manager'])));

-- 4. Daily purge of runs older than 5 days ---------------------------------
-- cron.schedule upserts by name, so re-running just refreshes the schedule.
SELECT cron.schedule(
  'purge_listing_runs',
  '17 3 * * *',
  $cron$delete from public.listing_runs where created_at < now() - interval '5 days'$cron$
);
