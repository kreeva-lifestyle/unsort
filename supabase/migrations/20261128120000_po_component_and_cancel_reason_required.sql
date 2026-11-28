-- Purchase orders: the owner's picks of 27 Nov 2026, database side (step 2 of 2).
--
-- WHY: step 1 (20261127150000) added "Fabric is for" (purchase_order_items
-- .component) and the cancel reason (cancel_po) but could not make them
-- compulsory on the server: phones still running the app from before that
-- day could not send them. The new app is now live on every device (the app
-- forces "Update Now" within a minute of being opened), so the server takes
-- over the two rules the owner asked for:
-- 1. "It is necessary to select the component": a fabric line without one is
--    refused — on a new order, on a draft being edited, and on a line added
--    in a revision. A line that was already on an order being revised
--    without one may stay so (orders from before the rule have none), but a
--    revision may not blank it on a line that had one.
-- 2. "Cancel PO: ask reason": set_po_status no longer cancels; cancel_po
--    (reason compulsory) is the only way. The app has used it since step 1.
--
-- Each message is under 80 characters so that even an app left open on an
-- old version shows it as written, and says to refresh.
-- Patched in place; a patch refuses to run unless its text is found exactly once.

do $do$
declare
  r record; def text;
begin
  for r in
    select * from (values
      ('public.create_po_with_items(jsonb,jsonb)',
        $o$if v_fabric and coalesce(btrim(v_item->>'fabric_code'),'') = '' then raise exception 'Every fabric item needs a fabric code' using errcode='23514'; end if;$o$,
        $n$if v_fabric and coalesce(btrim(v_item->>'fabric_code'),'') = '' then raise exception 'Every fabric item needs a fabric code' using errcode='23514'; end if;
    if v_fabric and coalesce(btrim(v_item->>'component'),'') = '' then raise exception 'Every fabric item must say what it is for — refresh the app if you see no box'; end if;$n$),
      ('public.update_po_with_items(uuid,jsonb,jsonb)',
        $o$if v_fabric and coalesce(btrim(v_item->>'fabric_code'),'') = '' then raise exception 'Every fabric item needs a fabric code' using errcode='23514'; end if;$o$,
        $n$if v_fabric and coalesce(btrim(v_item->>'fabric_code'),'') = '' then raise exception 'Every fabric item needs a fabric code' using errcode='23514'; end if;
    if v_fabric and coalesce(btrim(v_item->>'component'),'') = '' then raise exception 'Every fabric item must say what it is for — refresh the app if you see no box'; end if;$n$),
      -- a revision: only a line added in it
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$v_sort := v_sort + 1;$o$,
        $n$if v_fabric and v_comp is null then raise exception 'A fabric item added here must say what it is for — refresh if you see no box'; end if;
      v_sort := v_sort + 1;$n$),
      -- a revision may not blank it on a line that had one
      ('public.amend_po(uuid,jsonb,jsonb,text)',
        $o$if v_line.component is distinct from v_comp then$o$,
        $n$if v_fabric and v_comp is null and v_line.component is not null then raise exception '%: say what it is for — it cannot be left blank', v_label; end if;
      if v_line.component is distinct from v_comp then$n$),
      -- cancelling needs a reason: cancel_po only
      ('public.set_po_status(uuid,text)',
        $o$update purchase_orders set status='cancelled', cancelled_by=auth.uid(), cancelled_at=now(), modified_by=auth.uid(), updated_at=now() where id=p_po_id;$o$,
        $n$raise exception 'Say why the order is being cancelled — refresh the app to get the reason box';$n$),
      ('public.set_po_status(uuid,text)',
        $o$perform audit_write('purchase_order', 'CANCELLED', p_po_id::text, 'PO #' || v_num || ' cancelled');$o$,
        $n$-- (cancelled only through cancel_po, which writes the audit row with the reason)$n$)
    ) as t(fn, find, put)
  loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if (length(def) - length(replace(def, r.find, ''))) / length(r.find) <> 1 then
      raise exception '% does not contain "%" exactly once — not patched', r.fn, left(r.find, 60);
    end if;
    execute replace(def, r.find, r.put);
  end loop;
end $do$;
