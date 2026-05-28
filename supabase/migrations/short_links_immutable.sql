-- Lock short_links to insert-only by users.
-- Once created, a link's destination, code, or title cannot be edited
-- via PostgREST. Delete remains allowed (owner can revoke a link by
-- removing it). This prevents "rug pull" attacks where a shared link's
-- destination is silently swapped to a malicious URL after the fact.
-- The trigger that bumps clicks via record_link_click RPC runs as
-- SECURITY DEFINER and bypasses RLS, so click counts still increment.

DROP POLICY IF EXISTS "Users can update own links" ON short_links;
