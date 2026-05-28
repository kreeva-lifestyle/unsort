-- Trackly security + unique visitor tracking.
--
-- 1) Add visitor_hash to link_clicks for unique visitor counting.
--    Hash = SHA-256 of (IP + User-Agent + date). Same visitor on the
--    same day produces the same hash; different days = different hash
--    (preserves privacy while enabling "unique visitors" metric).
--
-- 2) Lock record_link_click to service_role only — prevents anon users
--    from calling the RPC directly via PostgREST to inflate clicks.
--
-- 3) Add URL validation inside the RPC as defense-in-depth (rejects
--    anything not starting with http:// or https://).

ALTER TABLE link_clicks ADD COLUMN IF NOT EXISTS visitor_hash text;
CREATE INDEX IF NOT EXISTS idx_link_clicks_visitor_hash ON link_clicks (link_id, visitor_hash);

CREATE OR REPLACE FUNCTION record_link_click(
  p_short_code text,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_browser text DEFAULT NULL,
  p_os text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_visitor_hash text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_link_id uuid;
  v_long_url text;
BEGIN
  -- Only the edge function (service_role) may call this
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id, long_url INTO v_link_id, v_long_url
  FROM short_links WHERE short_code = p_short_code;

  IF v_link_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Defense-in-depth: reject non-http(s) URLs at the DB level
  IF v_long_url !~ '^https?://' THEN
    RETURN NULL;
  END IF;

  INSERT INTO link_clicks (link_id, user_agent, device_type, browser, os, referrer, country, city, visitor_hash)
  VALUES (v_link_id, p_user_agent, p_device_type, p_browser, p_os, p_referrer, p_country, p_city, p_visitor_hash);

  RETURN v_long_url;
END;
$$;
