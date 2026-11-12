-- Playbook pre-launch fixes, batch 3 (owner, 2026-11-13: "Fix all"): D9.
--
-- WHY: the row policies let any active staff member (admin, manager or operator) DELETE rows
-- of pb_products, pb_listings and pb_websites straight through the database API. The app
-- never does that. "Delete product" goes through the pb-products edge function (admins only),
-- which first makes sure the product is off Shopify and then removes its photos; listings and
-- websites have no delete in the app at all. A direct delete skipped all of that, and deleting
-- a website took its saved keys, rules and listings with it (cascade).
--
-- HOW: one RESTRICTIVE delete policy per table that is never true. Restrictive policies are
-- ANDed with the permissive "pb staff delete" ones, so no signed-in user can delete these rows
-- through the API any more. The edge functions use the service role, which bypasses row
-- security, so the app's own "Delete product" keeps working.
--
-- Additive: three policies, nothing dropped or revoked. To undo: drop the policy
-- "pb server only delete" on the table.
do $$
declare t text;
begin
  foreach t in array array['pb_products', 'pb_listings', 'pb_websites'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'pb server only delete') then
      execute format('create policy "pb server only delete" on public.%I as restrictive for delete to public using (false)', t);
    end if;
  end loop;
end $$;
