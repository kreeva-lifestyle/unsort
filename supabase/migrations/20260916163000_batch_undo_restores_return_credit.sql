-- Bulk Pay can settle a customer's return credits in the same batch as the
-- sales it pays ("settle and refund"). Undo Batch reversed the sales only:
-- the returns stayed consumed (amount_paid = total), so after an undo the
-- customer owed the full sale again AND had lost the credit — a real loss
-- until an admin repaired it by hand. settle_return_refund now records the
-- batch id on its payment row (20260916143000), so the undo can find those
-- legs; this migration makes it restore them.
--
--   1. protect_challan_immutability learns one more RPC-only transition: a
--      return's amount_paid may FALL (credit handed back) while it stays
--      'paid' and every other column is pinned.
--   2. undo_challan_batch reverses the return legs of the batch too: the
--      credit comes back (amount_paid -= settled amount), a reversal row is
--      written, and the audit row says so. Sales are handled as before.
-- The "already undone" guard is unchanged (one undo per batch).

create or replace function public.protect_challan_immutability()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  -- Handover stamping: only handover_id changed, inside the handover trigger.
  if (new.handover_id is distinct from old.handover_id)
     and current_setting('app.challan_rpc', true) = 'on'
     and row(new.id, new.challan_number, new.customer_id, new.customer_name,
             new.customer_phone, new.status, new.subtotal, new.discount_type,
             new.discount_value, new.discount_amount, new.round_off, new.total,
             new.amount_paid, new.payment_mode, new.payment_date, new.notes,
             new.tags, new.created_by, new.modified_by, new.voided_by,
             new.voided_at, new.shipping_charges, new.is_return,
             new.source_challan_id, new.inventory_deducted)
       is not distinct from
         row(old.id, old.challan_number, old.customer_id, old.customer_name,
             old.customer_phone, old.status, old.subtotal, old.discount_type,
             old.discount_value, old.discount_amount, old.round_off, old.total,
             old.amount_paid, old.payment_mode, old.payment_date, old.notes,
             old.tags, old.created_by, old.modified_by, old.voided_by,
             old.voided_at, old.shipping_charges, old.is_return,
             old.source_challan_id, old.inventory_deducted)
  then
    return new;
  end if;

  -- If only inventory_deducted changed, always allow it
  if (new.inventory_deducted is distinct from old.inventory_deducted)
     and row(new.id, new.challan_number, new.customer_id, new.customer_name,
             new.status, new.subtotal, new.discount_type, new.discount_value,
             new.discount_amount, new.round_off, new.total, new.amount_paid,
             new.payment_mode, new.payment_date, new.notes, new.tags,
             new.created_by, new.modified_by, new.voided_by, new.voided_at,
             new.shipping_charges, new.is_return, new.source_challan_id)
       is not distinct from
         row(old.id, old.challan_number, old.customer_id, old.customer_name,
             old.status, old.subtotal, old.discount_type, old.discount_value,
             old.discount_amount, old.round_off, old.total, old.amount_paid,
             old.payment_mode, old.payment_date, old.notes, old.tags,
             old.created_by, old.modified_by, old.voided_by, old.voided_at,
             old.shipping_charges, old.is_return, old.source_challan_id)
  then
    return new;
  end if;

  -- If only notes changed, allow it (non-financial metadata edit)
  if (new.notes is distinct from old.notes)
     and row(new.id, new.challan_number, new.customer_id, new.customer_name,
             new.customer_phone, new.status, new.subtotal, new.discount_type,
             new.discount_value, new.discount_amount, new.round_off, new.total,
             new.amount_paid, new.payment_mode, new.payment_date, new.tags,
             new.created_by, new.modified_by, new.voided_by, new.voided_at,
             new.shipping_charges, new.is_return, new.source_challan_id,
             new.inventory_deducted)
       is not distinct from
         row(old.id, old.challan_number, old.customer_id, old.customer_name,
             old.customer_phone, old.status, old.subtotal, old.discount_type,
             old.discount_value, old.discount_amount, old.round_off, old.total,
             old.amount_paid, old.payment_mode, old.payment_date, old.tags,
             old.created_by, old.modified_by, old.voided_by, old.voided_at,
             old.shipping_charges, old.is_return, old.source_challan_id,
             old.inventory_deducted)
  then
    return new;
  end if;

  if old.status = 'voided' then
    raise exception 'Voided challans cannot be modified — this is a permanent financial record.';
  end if;

  if old.status = 'paid' then
    if new.status = 'voided' then
      return new;
    end if;
    if new.status = 'unpaid' and new.amount_paid = 0
       and current_setting('app.challan_rpc', true) = 'on' then
      return new;
    end if;
    if new.status = 'partial'
       and new.amount_paid > 0 and new.amount_paid < old.amount_paid
       and current_setting('app.challan_rpc', true) = 'on'
       and not old.is_return
       and new.total = old.total
       and new.subtotal = old.subtotal
       and new.discount_amount is not distinct from old.discount_amount
       and new.shipping_charges is not distinct from old.shipping_charges
       and new.round_off is not distinct from old.round_off
       and new.is_return = old.is_return
    then
      return new;
    end if;
    -- Return-credit settlement (settle_return_refund / apply_return_credit)
    -- and its undo (undo_challan_batch / void_challan): inside an RPC a
    -- return's amount_paid may RISE up to total (credit consumed) or FALL
    -- to no less than 0 (credit handed back); payment_mode / payment_date /
    -- modified_by may be stamped; every other column (incl. handover_id) is
    -- pinned; status stays 'paid'.
    if old.is_return
       and new.status = 'paid'
       and current_setting('app.challan_rpc', true) = 'on'
       and new.amount_paid is distinct from coalesce(old.amount_paid, 0)
       and new.amount_paid >= 0
       and new.amount_paid <= old.total
       and row(new.id, new.challan_number, new.customer_id, new.customer_name,
               new.customer_phone, new.status, new.subtotal, new.discount_type,
               new.discount_value, new.discount_amount, new.round_off, new.total,
               new.notes, new.tags, new.created_by, new.voided_by,
               new.voided_at, new.shipping_charges, new.is_return,
               new.source_challan_id, new.inventory_deducted, new.handover_id)
         is not distinct from
           row(old.id, old.challan_number, old.customer_id, old.customer_name,
               old.customer_phone, old.status, old.subtotal, old.discount_type,
               old.discount_value, old.discount_amount, old.round_off, old.total,
               old.notes, old.tags, old.created_by, old.voided_by,
               old.voided_at, old.shipping_charges, old.is_return,
               old.source_challan_id, old.inventory_deducted, old.handover_id)
    then
      return new;
    end if;
    raise exception 'Paid challans cannot be edited — unpay them through the app first.';
  end if;

  return new;
end;
$function$;

create or replace function public.undo_challan_batch(p_batch_id text, p_undo_batch_id text, p_user uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_pay record;
  v_challan record;
  v_remaining numeric;
  v_results jsonb := '[]'::jsonb;
  v_actor uuid := coalesce(auth.uid(), p_user);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform set_config('app.challan_rpc', 'on', true);
  -- A batch may be undone exactly once. Without this, replaying an undo after
  -- a challan was independently re-paid would reverse it a second time.
  if exists (
    select 1 from cash_challan_payments
    where is_reversal and notes = 'Undo ' || p_batch_id
  ) then
    raise exception 'Batch % has already been undone.', p_batch_id using errcode = '23514';
  end if;
  for v_pay in
    select p.challan_id, p.amount, p.payment_mode, c.is_return
    from cash_challan_payments p join cash_challans c on c.id = p.challan_id
    where p.batch_id = p_batch_id and not p.is_reversal
  loop
    select id, challan_number, coalesce(amount_paid, 0) as amount_paid, status, total
      into v_challan from cash_challans where id = v_pay.challan_id for update;
    if not found or v_challan.status <> 'paid' then
      continue; -- challan changed since the batch (voided/unpaid elsewhere): skip
    end if;
    if v_pay.is_return then
      -- Settled credit comes back: amount_paid falls, the return stays 'paid'.
      v_remaining := greatest(round((v_challan.amount_paid - v_pay.amount)::numeric, 2), 0);
      update cash_challans
        set amount_paid = v_remaining, modified_by = v_actor, updated_at = now()
        where id = v_challan.id;
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id)
      values (v_challan.id, v_pay.amount, v_pay.payment_mode, v_today, v_actor, 'Undo ' || p_batch_id, true, p_undo_batch_id);
      perform audit_write('cash_challan', 'BATCH_UNDO', v_challan.id::text,
        'Undo batch ' || p_batch_id || ' (reversal ' || p_undo_batch_id || ') — return credit ₹' || inr_text(v_pay.amount) || ' restored on #' || v_challan.challan_number,
        jsonb_build_object('amount_paid', jsonb_build_object('from', v_challan.amount_paid, 'to', v_remaining)));
      v_results := v_results || jsonb_build_object(
        'challan_id', v_challan.id, 'challan_number', v_challan.challan_number, 'is_return', true,
        'prev_paid', v_challan.amount_paid, 'remaining', v_remaining);
      continue;
    end if;
    v_remaining := greatest(round((v_challan.amount_paid - v_pay.amount)::numeric, 2), 0);
    if v_remaining > 0 then
      update cash_challans
        set status = 'partial', amount_paid = v_remaining, modified_by = v_actor, updated_at = now()
        where id = v_challan.id;
    else
      update cash_challans
        set status = 'unpaid', amount_paid = 0, payment_mode = null, payment_date = null,
            modified_by = v_actor, updated_at = now()
        where id = v_challan.id;
    end if;
    insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id)
    values (v_challan.id, v_pay.amount, v_pay.payment_mode, v_today, v_actor, 'Undo ' || p_batch_id, true, p_undo_batch_id);
    perform audit_write('cash_challan', 'BATCH_UNDO', v_challan.id::text,
      'Undo batch ' || p_batch_id || ' (reversal ' || p_undo_batch_id || ') — ₹' || inr_text(v_pay.amount) || ' reversed on #' || v_challan.challan_number,
      jsonb_build_object('status', jsonb_build_object('from', 'paid', 'to', case when v_remaining > 0 then 'partial' else 'unpaid' end),
                         'amount_paid', jsonb_build_object('from', v_challan.amount_paid, 'to', v_remaining)));
    v_results := v_results || jsonb_build_object(
      'challan_id', v_challan.id,
      'challan_number', v_challan.challan_number,
      'prev_paid', v_challan.amount_paid,
      'remaining', v_remaining
    );
  end loop;
  return v_results;
end;
$function$;
