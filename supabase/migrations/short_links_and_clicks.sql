-- Short N Track: URL shortener with click analytics.
-- Two tables: short_links (owner's links) and link_clicks (per-click telemetry).
-- RPC record_link_click is SECURITY DEFINER so the edge function can insert
-- clicks without exposing the link_clicks table to anon reads.

-- ── short_links ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS short_links (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  short_code text        UNIQUE NOT NULL,
  long_url   text        NOT NULL,
  title      text,
  clicks     integer     DEFAULT 0,
  created_by uuid        REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_short_links_short_code ON short_links (short_code);
CREATE INDEX idx_short_links_created_by ON short_links (created_by);

ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own links"
  ON short_links FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert own links"
  ON short_links FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own links"
  ON short_links FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete own links"
  ON short_links FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- ── link_clicks ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS link_clicks (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id     uuid        NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  clicked_at  timestamptz DEFAULT now(),
  user_agent  text,
  device_type text,
  browser     text,
  os          text,
  referrer    text,
  country     text,
  city        text
);

CREATE INDEX idx_link_clicks_link_id    ON link_clicks (link_id);
CREATE INDEX idx_link_clicks_clicked_at ON link_clicks (clicked_at);

ALTER TABLE link_clicks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read clicks for their own links
CREATE POLICY "Users can view clicks for own links"
  ON link_clicks FOR SELECT TO authenticated
  USING (link_id IN (SELECT id FROM short_links WHERE created_by = auth.uid()));

-- ── Trigger: auto-increment short_links.clicks ─────────────────────────────

CREATE OR REPLACE FUNCTION increment_link_clicks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE short_links SET clicks = clicks + 1, updated_at = now()
  WHERE id = NEW.link_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_increment_link_clicks
  AFTER INSERT ON link_clicks
  FOR EACH ROW EXECUTE FUNCTION increment_link_clicks();

-- ── RPC: record_link_click (edge function entry point) ─────────────────────
-- SECURITY DEFINER so anon/service role can insert without direct table access.

CREATE OR REPLACE FUNCTION record_link_click(
  p_short_code text,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_browser text DEFAULT NULL,
  p_os text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_city text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_link_id uuid;
  v_long_url text;
BEGIN
  SELECT id, long_url INTO v_link_id, v_long_url
  FROM short_links WHERE short_code = p_short_code;

  IF v_link_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO link_clicks (link_id, user_agent, device_type, browser, os, referrer, country, city)
  VALUES (v_link_id, p_user_agent, p_device_type, p_browser, p_os, p_referrer, p_country, p_city);

  RETURN v_long_url;
END;
$$;
