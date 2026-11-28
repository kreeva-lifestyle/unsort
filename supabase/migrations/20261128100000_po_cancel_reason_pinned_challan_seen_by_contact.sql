-- Purchase orders: two small gaps the database review of the 27 Nov change found.
--
-- WHY
-- 1. purchase_orders.cancel_reason (added by 20261127150000) was not among
--    the columns protect_po_immutability pins. That trigger lets a direct
--    UPDATE through when only the notes changed (or a costing was unlinked)
--    and compares a fixed list of columns to decide that — the new column was
--    in neither list, so such an update could also plant or rewrite the saved
--    reason, with no audit row. It now sits beside close_reason in both
--    comparisons: only cancel_po (which sets app.po_rpc) can write it.
-- 2. po_challan_seen ("this challan number was already entered for this
--    vendor") matched by the vendor's NAME even when the vendor's record was
--    passed, so two contacts with the same name — allowed, the unique index
--    is on name + phone — were treated as one, while the challan sheet's own
--    order list matches strictly by record. The name now decides only when
--    one side has no contact record (orders raised on a typed name). For
--    today's receipts it returns the same orders as before.
--
-- The trigger is patched in place; the patch refuses to run unless each text
-- is found exactly twice (the two comparisons).

do $do$
declare
  r record; def text;
begin
  for r in
    select * from (values
      ('public.protect_po_immutability()', 2, 'new.close_reason,new.created_by', 'new.close_reason,new.cancel_reason,new.created_by'),
      ('public.protect_po_immutability()', 2, 'old.close_reason,old.created_by', 'old.close_reason,old.cancel_reason,old.created_by')
    ) as t(fn, n, find, put)
  loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if (length(def) - length(replace(def, r.find, ''))) / length(r.find) <> r.n then
      raise exception '% does not contain "%" exactly % times — not patched', r.fn, r.find, r.n;
    end if;
    execute replace(def, r.find, r.put);
  end loop;
end $do$;

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
      or ((p_vendor_id is null or o.vendor_id is null)
          and lower(btrim(o.vendor_name)) = lower(btrim(coalesce(p_vendor_name, '')))))
  group by o.po_number
  order by o.po_number desc
  limit 20;
$$;
