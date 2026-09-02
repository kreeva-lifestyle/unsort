-- The Purchase Orders page has subscribed to realtime changes on these three
-- tables since the module was built, but they were never added to the
-- supabase_realtime publication - the database never broadcast anything, so
-- a PO created on one device never appeared on another without a manual
-- reload (owner's report, 2026-08-31). Publication only; RLS still governs
-- who receives which rows.
alter publication supabase_realtime add table public.purchase_orders;
alter publication supabase_realtime add table public.purchase_order_items;
alter publication supabase_realtime add table public.purchase_order_receipts;
