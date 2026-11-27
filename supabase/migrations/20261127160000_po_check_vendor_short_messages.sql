-- po_check_vendor: the two refusals in under 80 characters.
--
-- WHY: the vendor rule (20261127150000) is enforced by the server from the
-- moment it was applied, but a phone can still be showing the app from before
-- that change for a minute (until "Update Now"). That older app shows a
-- server sentence as written only when it is shorter than 80 characters; the
-- first wording (99 and 88 characters) came out as "Something went wrong.
-- Please try again." with no hint to pick the vendor from the list. Same
-- rule, same checks — shorter words. The phrases "is not in Contacts" and
-- "has no phone number" are what the new app's friendlyError keys on.
create or replace function public.po_check_vendor(p_po jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from po_vendors where id = nullif(p_po->>'vendor_id', '')::uuid) then
    raise exception 'This vendor is not in Contacts — pick from the list, or add the name and phone';
  end if;
  if length(regexp_replace(coalesce(p_po->>'vendor_phone', ''), '\D', '', 'g')) < 10 then
    raise exception 'This vendor has no phone number — add it in Contacts and pick the vendor again';
  end if;
end $$;
