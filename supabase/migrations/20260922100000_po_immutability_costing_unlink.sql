-- Audit fix H1 (+ L1), post-deploy audit 21 Sep 2026.
--
-- purchase_orders.costing_product_id (20260917013000) is a foreign key with
-- ON DELETE SET NULL. Postgres performs that SET NULL as an UPDATE of the
-- purchase order, which fires protect_po_immutability (20260916133000);
-- outside an RPC that trigger only allows a notes-only edit, so deleting a
-- product costing that a PO had been raised from failed with "Purchase
-- orders change only through the app's actions" — the costing could never
-- be deleted, and the message blamed purchase orders. Reproduced on the
-- live project (rolled back) before this fix.
--
-- Now: the FK's own unlink (costing_product_id going NULL, nothing else
-- changing, including on a cancelled order — the referential action must
-- never be refused) is allowed; the notes-only comparison also pins
-- costing_product_id and lump_sum, which were added after the trigger and
-- left out of its row(...) list.
create or replace function public.protect_po_immutability()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_same_but_link boolean;
begin
  if current_setting('app.po_rpc', true) = 'on' then
    return new;
  end if;
  -- The costing FK's ON DELETE SET NULL: only the link goes away.
  v_same_but_link := old.costing_product_id is not null and new.costing_product_id is null
     and row(new.id,new.po_number,new.vendor_id,new.vendor_name,new.vendor_phone,new.po_type,new.status,new.po_date,new.expected_date,new.payment_terms,new.notes,new.for_pieces,new.lump_sum,new.subtotal,new.discount_type,new.discount_value,new.discount_amount,new.tax_percent,new.tax_amount,new.other_charges,new.round_off,new.grand_total,new.approved_by,new.approved_at,new.cancelled_by,new.cancelled_at,new.closed_by,new.closed_at,new.close_reason,new.created_by,new.created_at)
       is not distinct from
         row(old.id,old.po_number,old.vendor_id,old.vendor_name,old.vendor_phone,old.po_type,old.status,old.po_date,old.expected_date,old.payment_terms,old.notes,old.for_pieces,old.lump_sum,old.subtotal,old.discount_type,old.discount_value,old.discount_amount,old.tax_percent,old.tax_amount,old.other_charges,old.round_off,old.grand_total,old.approved_by,old.approved_at,old.cancelled_by,old.cancelled_at,old.closed_by,old.closed_at,old.close_reason,old.created_by,old.created_at);
  if v_same_but_link then
    return new;
  end if;
  if old.status = 'cancelled' then
    raise exception 'Cancelled purchase orders cannot be modified — this is a permanent record.';
  end if;
  -- notes-only metadata edit outside an RPC is allowed
  if (new.notes is distinct from old.notes)
     and row(new.id,new.po_number,new.vendor_id,new.vendor_name,new.vendor_phone,new.po_type,new.status,new.po_date,new.expected_date,new.payment_terms,new.for_pieces,new.lump_sum,new.costing_product_id,new.subtotal,new.discount_type,new.discount_value,new.discount_amount,new.tax_percent,new.tax_amount,new.other_charges,new.round_off,new.grand_total,new.approved_by,new.approved_at,new.cancelled_by,new.cancelled_at,new.closed_by,new.closed_at,new.close_reason,new.created_by,new.created_at)
       is not distinct from
         row(old.id,old.po_number,old.vendor_id,old.vendor_name,old.vendor_phone,old.po_type,old.status,old.po_date,old.expected_date,old.payment_terms,old.for_pieces,old.lump_sum,old.costing_product_id,old.subtotal,old.discount_type,old.discount_value,old.discount_amount,old.tax_percent,old.tax_amount,old.other_charges,old.round_off,old.grand_total,old.approved_by,old.approved_at,old.cancelled_by,old.cancelled_at,old.closed_by,old.closed_at,old.close_reason,old.created_by,old.created_at)
  then
    return new;
  end if;
  raise exception 'Purchase orders change only through the app''s actions' using errcode = '42501';
end $function$;
