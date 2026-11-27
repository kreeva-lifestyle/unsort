-- "Receive a challan": say when the challan number was already entered for
-- that vendor (owner's pick of 27 Nov 2026 — "solve this").
--
-- WHY: the same vendor challan can be typed twice — once per order, by two
-- people, or again a week later — and nothing said so; a double entry doubles
-- the received total. The receive sheets now ask this function as the number
-- is typed and show a note (never a block: one challan often covers several
-- orders, entered one at a time — 17 challan numbers sit on more than one PO).
--
-- Looks at challan_no and, for receipts from before 22 Oct 2026 (when the
-- number was typed into "remarks": 74 receipts), at remarks — both as a whole,
-- ignoring case and outer spaces. The vendor is matched by its record or, for
-- older orders with a typed name only, by that name.
-- SECURITY INVOKER: RLS on both tables applies. The table is small (one row
-- per delivery line), so the scan needs no new index.
create or replace function public.po_challan_seen(p_vendor_id uuid, p_vendor_name text, p_challan_no text)
returns table (po_number integer, receipt_date date)
language sql
stable
security invoker
set search_path = public
as $$
  select o.po_number, max(r.receipt_date)
  from purchase_order_receipts r
  join purchase_orders o on o.id = r.po_id
  where btrim(coalesce(p_challan_no, '')) <> ''
    and (lower(btrim(r.challan_no)) = lower(btrim(p_challan_no)) or lower(btrim(r.remarks)) = lower(btrim(p_challan_no)))
    and ((p_vendor_id is not null and o.vendor_id = p_vendor_id)
      or lower(btrim(o.vendor_name)) = lower(btrim(coalesce(p_vendor_name, ''))))
  group by o.po_number
  order by o.po_number desc
  limit 20;
$$;

comment on function public.po_challan_seen(uuid, text, text) is
  'The orders (newest first, 20 at most) on which this vendor''s challan number was already entered — a hint for the receive sheets, never a block.';
revoke all on function public.po_challan_seen(uuid, text, text) from public, anon;
grant execute on function public.po_challan_seen(uuid, text, text) to authenticated, service_role;
