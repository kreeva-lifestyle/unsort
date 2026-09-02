-- Retention policy for link_clicks.
-- Deletes click records older than 365 days to prevent unbounded growth.
-- Call manually: SELECT cleanup_old_link_clicks();
-- Or schedule via pg_cron: SELECT cron.schedule('cleanup-clicks', '0 3 * * 0', 'SELECT cleanup_old_link_clicks()');

CREATE OR REPLACE FUNCTION cleanup_old_link_clicks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted integer;
BEGIN
  DELETE FROM link_clicks WHERE clicked_at < now() - interval '365 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
