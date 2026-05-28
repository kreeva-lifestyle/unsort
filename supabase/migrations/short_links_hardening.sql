-- Schema hardening for short_links + link_clicks. Addresses the audit findings:
--   1) FK on created_by uses ON DELETE SET NULL so deleting a Supabase user
--      doesn't fail because of pinned short_links rows.
--   2) Length CHECK constraints prevent multi-MB text bombs on short_code,
--      long_url, title.
--   3) clicks is bigint (was integer, which caps at 2.1B).
--   4) Composite index on link_clicks(link_id, clicked_at DESC) speeds up
--      the analytics range query (.eq link_id + .gte clicked_at + .lte).

-- 1) Recreate FK with ON DELETE SET NULL
ALTER TABLE short_links DROP CONSTRAINT IF EXISTS short_links_created_by_fkey;
ALTER TABLE short_links
  ADD CONSTRAINT short_links_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Length CHECKs
ALTER TABLE short_links
  ADD CONSTRAINT short_links_short_code_len_chk CHECK (length(short_code) BETWEEN 3 AND 64),
  ADD CONSTRAINT short_links_long_url_len_chk   CHECK (length(long_url)   BETWEEN 1 AND 4096),
  ADD CONSTRAINT short_links_title_len_chk      CHECK (title IS NULL OR length(title) <= 200);

-- 3) clicks bigint
ALTER TABLE short_links ALTER COLUMN clicks TYPE bigint;

-- 4) Composite index
CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id_clicked_at
  ON link_clicks (link_id, clicked_at DESC);
