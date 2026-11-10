-- Live updates: stop publishing two tables no screen listens to (owner
-- approved, 2026-11-10).
--
-- WHY. purchase_order_items and purchase_order_receipts were added to the
-- realtime publication on 2026-08-31 together with purchase_orders. The PO
-- list has since listened to the header table only (usePoList.ts: every PO
-- RPC that touches items or receipts also stamps the header in the same
-- transaction), so nothing subscribes to these two. Every live-update check
-- still looked them up. This removes them from the publication only: the
-- tables, their rows and the PO screens are untouched.
do $$
declare t text;
begin
  foreach t in array array['purchase_order_items', 'purchase_order_receipts'] loop
    if exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
