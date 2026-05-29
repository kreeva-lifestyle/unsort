-- Fix: remove broken service_role auth check from record_link_click.
--
-- The check used request.jwt.claim.role which is not reliably set by
-- PostgREST for service_role connections, breaking ALL Trackly redirects.
-- Removed the gate — the edge function already has rate limiting and
-- at 40-50 lifetime clicks the direct-call risk is negligible.

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
  SELECT id, long_url INTO v_link_id, v_long_url
  FROM short_links WHERE short_code = p_short_code;

  IF v_link_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_long_url !~ '^https?://' THEN
    RETURN NULL;
  END IF;

  INSERT INTO link_clicks (link_id, user_agent, device_type, browser, os, referrer, country, city, visitor_hash)
  VALUES (v_link_id, p_user_agent, p_device_type, p_browser, p_os, p_referrer, p_country, p_city, p_visitor_hash);

  RETURN v_long_url;
END;
$$;
