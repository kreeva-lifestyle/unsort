-- Playbook bulk-change log, step 1: which bulk change a database write belongs to.
--
-- WHY (owner, 2026-11-12): "log all bulk changes … with option to revert them
-- … only allow those bulk changes which can be reverted". To take a bulk change
-- back, every row it changes must be recorded at the moment it changes, in the
-- same transaction. The server (pb-products) marks the database calls of one
-- bulk change with a request header, x-pb-bulk: <run id>; this function reads
-- it. The recording triggers (next migration) call it.
--
-- It only reads the caller's own request header and returns it as a uuid, or
-- null when there is none or it is not a uuid. It touches no table.
create or replace function public.pb_bulk_run() returns uuid
language plpgsql stable security invoker set search_path = '' as $$
declare h text; v text;
begin
  h := current_setting('request.headers', true);
  if h is null or h = '' or position('x-pb-bulk' in h) = 0 then return null; end if;
  v := h::json ->> 'x-pb-bulk';
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return v::uuid; end if;
  return null;
exception when others then
  return null;
end $$;
comment on function public.pb_bulk_run() is 'The bulk change (pb_bulk_runs.id) the current request belongs to, from its x-pb-bulk header; null when none. Reads only the caller''s own header.';
