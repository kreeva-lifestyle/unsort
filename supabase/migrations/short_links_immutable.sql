-- Lock short_links to insert-only by users.
-- Once created, a link's destination, code, or title cannot be edited
-- via PostgREST. Delete remains allowed. Prevents "rug pull" attacks
-- where a shared link's destination is silently swapped post-share.
--
-- Defense in depth:
--   1) Drop the UPDATE RLS policy (no policy = denied for authenticated)
--   2) Add a BEFORE UPDATE trigger that raises if any of the immutable
--      columns change. The clicks-counter trigger still works because
--      this trigger's WHEN clause excludes clicks/updated_at.

DROP POLICY IF EXISTS "Users can update own links" ON short_links;

CREATE OR REPLACE FUNCTION block_short_links_mutate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'short_links rows are immutable; delete and re-create instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_short_links_mutate ON short_links;
CREATE TRIGGER trg_block_short_links_mutate
  BEFORE UPDATE ON short_links
  FOR EACH ROW
  WHEN (
    OLD.short_code IS DISTINCT FROM NEW.short_code
    OR OLD.long_url IS DISTINCT FROM NEW.long_url
    OR OLD.title    IS DISTINCT FROM NEW.title
  )
  EXECUTE FUNCTION block_short_links_mutate();
