-- Audit fixes C1 + C2 (post-deploy audit, 21 Sep 2026).
--
-- C1. Reversing a sale's payments lost the customer's return credit. A sale
--     settled (partly) by return credit carries 'Return Credit' legs stamped
--     settled_against = the return, and the return carries a matching
--     consumption leg. unpay_challan_batch and the amount-decrease branch of
--     update_challan_with_items wrote ONE reversal row for the whole amount
--     in the header's mode, never touched the return, and left the credit
--     "fully used" — money owed to the customer vanished. void_challan on
--     that return then re-withdrew the credit and tripped the ledger-sync
--     trigger. Now every reversal goes through challan_reverse_payments,
--     which unwinds the sale's real legs (cash-type modes first, then each
--     return-credit leg with its settled_against) and hands the credit back
--     to the return in the same transaction. void_challan caps a withdrawal
--     at the credit the sale still carries, so legacy rows can never abort it.
--
-- C2. Bulk Pay ran pay_challan_batch (sales) and then one
--     settle_return_refund per return as separate requests. A failed settle
--     left the sales fully "paid" while the return's credit stayed spendable
--     — the customer could be credited twice. pay_challan_batch now takes
--     p_return_ids and consumes those returns inside the same transaction;
--     any return that cannot be settled rolls the whole batch back. Both
--     pay_challan_batch and settle_return_refund refuse up front, with the
--     dated message apply_return_credit already uses, when the payment date
--     falls inside a confirmed or pending handover period.
--
-- No data repair: the one sale with an unstamped reversal (#105) was
-- un-paid BEFORE its credit was applied, and its ledger nets correctly.

-- ─────────────────────────────────────────────────────────────────────────
-- Helper: reverse up to p_amount of a sale's net payments, leg by leg.
-- Returns the amount actually reversed. Callers hold app.challan_rpc.
create or replace function public.challan_reverse_payments(p_challan_id uuid, p_amount numeric, p_note text, p_batch text, p_actor uuid)
returns numeric
language plpgsql
set search_path to 'public'
as $function$
declare
  v_left numeric := round(coalesce(p_amount, 0), 2);
  v_done numeric := 0;
  v_leg record;
  v_x numeric;
  v_ret record;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if v_left <= 0 then return 0; end if;

  -- 1. Cash-type legs (Cash / UPI / Bank …), grouped by mode: money handed back.
  for v_leg in
    select payment_mode, sum(case when is_reversal then -amount else amount end) as net
      from cash_challan_payments
     where challan_id = p_challan_id and payment_mode <> 'Return Credit'
     group by payment_mode having sum(case when is_reversal then -amount else amount end) > 0
     order by payment_mode
  loop
    exit when v_left <= 0;
    v_x := least(v_left, round(v_leg.net, 2));
    insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id)
    values (p_challan_id, v_x, v_leg.payment_mode, v_today, p_actor, p_note, true, nullif(p_batch, ''));
    v_left := round(v_left - v_x, 2); v_done := v_done + v_x;
  end loop;

  -- 2. Return-credit legs, one per return: reverse on the sale AND restore
  --    the credit on the return (its consumption leg is settled_against = sale).
  for v_leg in
    select settled_against, sum(case when is_reversal then -amount else amount end) as net
      from cash_challan_payments
     where challan_id = p_challan_id and payment_mode = 'Return Credit'
     group by settled_against having sum(case when is_reversal then -amount else amount end) > 0
     order by settled_against
  loop
    exit when v_left <= 0;
    v_x := least(v_left, round(v_leg.net, 2));
    insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id, settled_against)
    values (p_challan_id, v_x, 'Return Credit', v_today, p_actor, p_note, true, nullif(p_batch, ''), v_leg.settled_against);
    if v_leg.settled_against is not null then
      select id, challan_number, coalesce(amount_paid, 0) as amount_paid, status into v_ret
        from cash_challans where id = v_leg.settled_against for update;
      if found and v_ret.status <> 'voided' then
        update cash_challans set amount_paid = greatest(round(v_ret.amount_paid - v_x, 2), 0), modified_by = p_actor, updated_at = now()
         where id = v_ret.id;
        insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id, settled_against)
        values (v_ret.id, least(v_x, v_ret.amount_paid), 'Return Credit', v_today, p_actor,
                'Credit restored — payment on challan reversed (' || p_note || ')', true, nullif(p_batch, ''), p_challan_id);
        perform audit_write('cash_challan', 'CREDIT_RESTORED', v_ret.id::text,
          'Return #' || v_ret.challan_number || ' — ₹' || inr_text(v_x) || ' credit handed back (' || p_note || ')',
          jsonb_build_object('amount_paid', jsonb_build_object('from', v_ret.amount_paid, 'to', greatest(round(v_ret.amount_paid - v_x, 2), 0))));
      end if;
    end if;
    v_left := round(v_left - v_x, 2); v_done := v_done + v_x;
  end loop;

  -- 3. Anything the ledger cannot explain (legacy rows): plain reversal so
  --    the header and the ledger still agree.
  if v_left > 0 then
    insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id)
    values (p_challan_id, v_left, 'Cash', v_today, p_actor, p_note || ' (unmatched legacy amount)', true, nullif(p_batch, ''));
    v_done := v_done + v_left;
  end if;
  return v_done;
end;
$function$;
revoke all on function public.challan_reverse_payments(uuid, numeric, text, text, uuid) from public, anon;
grant execute on function public.challan_reverse_payments(uuid, numeric, text, text, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.unpay_challan_batch(p_ids uuid[], p_undo_batch_id text, p_user uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_challan record;
  v_results jsonb := '[]'::jsonb;
  v_actor uuid := coalesce(auth.uid(), p_user);
begin
  perform set_config('app.challan_rpc', 'on', true);
  foreach v_id in array p_ids loop
    select id, challan_number, coalesce(amount_paid, 0) as amount_paid, status, payment_mode
      into v_challan from cash_challans where id = v_id for update;
    if not found or v_challan.status <> 'paid' or v_challan.amount_paid <= 0 then
      continue; -- changed since selection (voided/unpaid elsewhere): skip
    end if;
    update cash_challans
      set status = 'unpaid', amount_paid = 0, payment_mode = null, payment_date = null,
          modified_by = v_actor, updated_at = now()
      where id = v_id;
    perform challan_reverse_payments(v_id, v_challan.amount_paid, 'Bulk unpay reversal', p_undo_batch_id, v_actor);
    perform audit_write('cash_challan', 'BULK_UNPAY', v_id::text,
      'Bulk unpaid (' || p_undo_batch_id || ') — was ₹' || inr_text(v_challan.amount_paid) || ' on #' || v_challan.challan_number,
      jsonb_build_object('status', jsonb_build_object('from', 'paid', 'to', 'unpaid'),
                         'amount_paid', jsonb_build_object('from', v_challan.amount_paid, 'to', 0)));
    v_results := v_results || jsonb_build_object(
      'challan_id', v_challan.id,
      'challan_number', v_challan.challan_number,
      'prev_paid', v_challan.amount_paid
    );
  end loop;
  return v_results;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- update_challan_with_items: identical to 20260916143000 except the
-- amount-decrease branch, which now unwinds the real legs.
create or replace function public.update_challan_with_items(p_challan_id uuid, p_challan jsonb, p_items jsonb, p_payment jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_i int := 0;
  v_tags text[] := null;
  v_old cash_challans%rowtype;
  v_new_paid numeric;
  v_pay_diff numeric;
  v_is_return boolean := coalesce((p_challan->>'is_return')::boolean, false);
  v_new_status text := p_challan->>'status';
  v_new_total numeric := (p_challan->>'total')::numeric;
  v_actor uuid := coalesce(auth.uid(), (p_challan->>'modified_by')::uuid);
  v_changes jsonb := '{}'::jsonb;
  v_k text; v_from text; v_to text;
begin
  perform set_config('app.challan_rpc', 'on', true);
  perform challan_check_money(p_challan, p_items, p_challan_id);

  if p_challan->'tags' is not null and jsonb_typeof(p_challan->'tags') = 'array' and jsonb_array_length(p_challan->'tags') > 0 then
    v_tags := array(select jsonb_array_elements_text(p_challan->'tags'));
  end if;

  select * into v_old from cash_challans where id = p_challan_id for update;
  if not found then
    raise exception 'Challan not found';
  end if;
  if v_old.status = 'voided' then
    raise exception 'Cannot edit a voided challan';
  end if;

  v_new_paid := coalesce((p_challan->>'amount_paid')::numeric, 0);
  v_pay_diff := v_new_paid - coalesce(v_old.amount_paid, 0);

  if not v_is_return then
    if v_new_status = 'paid' and v_new_paid is distinct from v_new_total then
      raise exception 'Status "paid" requires amount_paid (%) to equal total (%)', v_new_paid, v_new_total using errcode = '23514';
    elsif v_new_status = 'partial' and not (v_new_paid > 0 and v_new_paid < v_new_total) then
      raise exception 'Status "partial" requires 0 < amount_paid (%) < total (%)', v_new_paid, v_new_total using errcode = '23514';
    elsif v_new_status = 'unpaid' and v_new_paid <> 0 then
      raise exception 'Status "unpaid" requires amount_paid 0, got %', v_new_paid using errcode = '23514';
    end if;
  end if;
  if v_pay_diff <> 0 and p_payment is null then
    raise exception 'amount_paid changed by % without a payment record', v_pay_diff using errcode = '23514';
  end if;

  if v_pay_diff > 0 and p_payment is not null then
    insert into cash_challan_payments (
      challan_id, amount, payment_mode, payment_date, paid_by, is_reversal
    ) values (
      p_challan_id,
      v_pay_diff,
      coalesce(p_payment->>'payment_mode', 'Cash'),
      coalesce((p_payment->>'payment_date')::date, (now() at time zone 'Asia/Kolkata')::date),
      v_actor,
      false
    );
  elsif v_pay_diff < 0 and p_payment is not null then
    -- Unwind the real legs (cash first, then return credit, restoring the
    -- return) instead of one row in whatever mode the form happened to hold.
    perform challan_reverse_payments(p_challan_id, abs(v_pay_diff), 'Payment removed/reduced', null, v_actor);
  end if;

  delete from cash_challan_items where challan_id = p_challan_id;

  for v_item in select jsonb_array_elements(p_items)
  loop
    insert into cash_challan_items (
      challan_id, sku, description, quantity, price, total,
      discount_type, discount_value, discount_amount, sort_order
    ) values (
      p_challan_id,
      nullif(v_item->>'sku', ''),
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'total')::numeric,
      nullif(v_item->>'discount_type', ''),
      coalesce((v_item->>'discount_value')::numeric, 0),
      coalesce((v_item->>'discount_amount')::numeric, 0),
      v_i
    );
    v_i := v_i + 1;
  end loop;

  update cash_challans set
    customer_id = (p_challan->>'customer_id')::uuid,
    customer_name = p_challan->>'customer_name',
    customer_phone = nullif(p_challan->>'customer_phone', ''),
    status = p_challan->>'status',
    subtotal = (p_challan->>'subtotal')::numeric,
    discount_type = nullif(p_challan->>'discount_type', ''),
    discount_value = coalesce((p_challan->>'discount_value')::numeric, 0),
    discount_amount = coalesce((p_challan->>'discount_amount')::numeric, 0),
    shipping_charges = coalesce((p_challan->>'shipping_charges')::numeric, 0),
    round_off = coalesce((p_challan->>'round_off')::numeric, 0),
    total = (p_challan->>'total')::numeric,
    amount_paid = v_new_paid,
    payment_mode = nullif(p_challan->>'payment_mode', ''),
    payment_date = (nullif(p_challan->>'payment_date', ''))::date,
    notes = nullif(p_challan->>'notes', ''),
    tags = v_tags,
    is_return = coalesce((p_challan->>'is_return')::boolean, false),
    modified_by = v_actor,
    updated_at = now()
  where id = p_challan_id;

  foreach v_k in array array['status','amount_paid','payment_mode','payment_date','total','round_off','customer_name','shipping_charges','notes'] loop
    v_from := coalesce(to_jsonb(v_old) ->> v_k, '');
    v_to := coalesce(p_challan ->> v_k, '');
    if v_k in ('amount_paid','total','round_off','shipping_charges') then
      if abs(coalesce(nullif(v_from,'')::numeric, 0) - coalesce(nullif(v_to,'')::numeric, 0)) > 0.001 then
        v_changes := v_changes || jsonb_build_object(v_k, jsonb_build_object('from', to_jsonb(v_old) -> v_k, 'to', p_challan -> v_k));
      end if;
    elsif v_from <> v_to then
      v_changes := v_changes || jsonb_build_object(v_k, jsonb_build_object('from', to_jsonb(v_old) -> v_k, 'to', p_challan -> v_k));
    end if;
  end loop;
  perform audit_write('cash_challan', 'UPDATE', p_challan_id::text, 'Challan #' || v_old.challan_number || ' updated', nullif(v_changes, '{}'::jsonb));

  return jsonb_build_object('id', p_challan_id, 'ok', true);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Shared guard: the friendly, DATED refusal when a payment dated p_date
-- would land inside a confirmed or pending cash handover period.
create or replace function public.challan_check_handover_open(p_date date)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare v_ho record;
begin
  select h.status as st, coalesce(h.period_from, h.date) as pf, coalesce(h.period_to, h.date) as pt
    into v_ho
    from cash_handovers h
   where h.status in ('confirmed','pending')
     and coalesce(h.period_from, h.date) <= p_date
     and coalesce(h.period_to,   h.date) >= p_date
   order by coalesce(h.period_to, h.date) desc limit 1;
  if v_ho.pt is not null then
    raise exception 'Cash for % – % was already % — a payment dated % falls inside that sealed period. Record it on or after %.',
      to_char(v_ho.pf, 'DD Mon'), to_char(v_ho.pt, 'DD Mon'),
      case when v_ho.st = 'confirmed' then 'counted and signed for (handover confirmed)' else 'submitted for handover (awaiting confirmation)' end,
      to_char(p_date, 'DD Mon'), to_char(v_ho.pt + 1, 'DD Mon YYYY');
  end if;
end;
$function$;
revoke all on function public.challan_check_handover_open(date) from public, anon;
grant execute on function public.challan_check_handover_open(date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- pay_challan_batch: + p_return_ids, settled in the SAME transaction.
drop function if exists public.pay_challan_batch(uuid[], text, date, text, text, boolean, jsonb);
create or replace function public.pay_challan_batch(
  p_ids uuid[],
  p_mode text,
  p_date date,
  p_batch_id text,
  p_note text default null,
  p_refund boolean default false,
  p_extra jsonb default null,
  p_return_ids uuid[] default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_c record;
  v_outstanding numeric;
  v_ledger numeric;
  v_remaining numeric;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_results jsonb := '[]'::jsonb;
  v_has_sales boolean := p_ids is not null and array_length(p_ids, 1) is not null;
  v_has_returns boolean := p_return_ids is not null and array_length(p_return_ids, 1) is not null;
begin
  if auth.uid() is null then raise exception 'Sign in to record payments'; end if;
  if coalesce(btrim(p_mode), '') = '' then raise exception 'Pick a payment mode' using errcode = '23514'; end if;
  if p_mode = 'Return Credit' then raise exception 'Return Credit is reserved for credit applications' using errcode = '23514'; end if;
  if p_date is null then raise exception 'Pick a payment date' using errcode = '23514'; end if;
  if p_date > v_today then raise exception 'Payment date cannot be in the future' using errcode = '23514'; end if;
  if coalesce(btrim(p_batch_id), '') = '' then raise exception 'Batch id is required' using errcode = '23514'; end if;
  if not v_has_sales and not v_has_returns then raise exception 'Nothing to pay' using errcode = '23514'; end if;
  -- Refuse before any write when the whole batch would land in a sealed period.
  if v_has_returns then perform challan_check_handover_open(p_date); end if;

  perform set_config('app.challan_rpc', 'on', true);

  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    select id, challan_number, status, is_return, total, coalesce(amount_paid, 0) as amount_paid
      into v_c from cash_challans where id = v_id for update;
    if not found then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'skipped', 'not found');
      continue;
    end if;
    if v_c.is_return then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'is a return');
      continue;
    end if;
    if v_c.status not in ('unpaid', 'partial') then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'already ' || v_c.status);
      continue;
    end if;
    v_outstanding := round(v_c.total - v_c.amount_paid, 2);
    if v_outstanding <= 0 then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'nothing outstanding');
      continue;
    end if;
    select coalesce(sum(case when is_reversal then -amount else amount end), 0) into v_ledger
      from cash_challan_payments where challan_id = v_id;
    if v_ledger is distinct from v_c.amount_paid then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'payment ledger out of sync');
      continue;
    end if;

    begin
      update cash_challans set
        status = 'paid', amount_paid = total, payment_mode = p_mode, payment_date = p_date,
        modified_by = auth.uid(), updated_at = now()
      where id = v_id;
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal)
      values (v_id, v_outstanding, p_mode, p_date, auth.uid(), nullif(p_note, ''), p_batch_id, false);
      perform audit_write('cash_challan', case when p_refund then 'SETTLE_REFUND' else 'BULK_PAY' end, v_id::text,
        case when p_refund then 'Settled against returns' else 'Bulk paid' end || ' (' || p_batch_id || ') — ₹' || inr_text(v_outstanding) || ' via ' || p_mode,
        jsonb_build_object('status', jsonb_build_object('from', v_c.status, 'to', 'paid'),
                           'amount_paid', jsonb_build_object('from', v_c.amount_paid, 'to', v_c.total)) || coalesce(p_extra, '{}'::jsonb));
      v_results := v_results || jsonb_build_object(
        'challan_id', v_id, 'challan_number', v_c.challan_number,
        'prev_status', v_c.status, 'prev_paid', v_c.amount_paid, 'paid', v_outstanding, 'total', v_c.total);
    exception when others then
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', sqlerrm);
    end;
  end loop;

  -- The returns: the batch was counted NET of their credit, so a return that
  -- cannot be consumed is not a skip — it rolls the whole batch back.
  foreach v_id in array coalesce(p_return_ids, '{}'::uuid[]) loop
    select id, challan_number, status, is_return, total, coalesce(amount_paid, 0) as amount_paid
      into v_c from cash_challans where id = v_id for update;
    if not found then raise exception 'Return not found'; end if;
    if v_c.is_return is distinct from true then raise exception 'Challan #% is not a return', v_c.challan_number using errcode = '23514'; end if;
    if v_c.status = 'voided' then raise exception 'Return #% is voided', v_c.challan_number using errcode = '23514'; end if;
    v_remaining := round(v_c.total - v_c.amount_paid, 2);
    if v_remaining <= 0 then raise exception 'Return #% — its credit is already settled', v_c.challan_number using errcode = '23514'; end if;
    select coalesce(sum(case when is_reversal then -amount else amount end), 0) into v_ledger
      from cash_challan_payments where challan_id = v_id;
    if v_ledger is distinct from v_c.amount_paid then raise exception 'Return #% payment ledger is out of sync', v_c.challan_number; end if;

    update cash_challans set amount_paid = total, payment_mode = p_mode, payment_date = p_date,
      modified_by = auth.uid(), updated_at = now()
    where id = v_id;
    insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id)
    values (v_id, v_remaining, p_mode, p_date, auth.uid(), 'Return credit settled in batch ' || p_batch_id, p_batch_id);
    perform audit_write('cash_challan', 'RETURN_SETTLED', v_id::text,
      'Return credit ₹' || inr_text(v_remaining) || ' consumed in batch ' || p_batch_id || ' via ' || p_mode,
      jsonb_build_object('amount_paid', jsonb_build_object('from', v_c.amount_paid, 'to', v_c.total)));
    v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'is_return', true, 'settled', v_remaining);
  end loop;

  return v_results;
end;
$function$;
revoke all on function public.pay_challan_batch(uuid[], text, date, text, text, boolean, jsonb, uuid[]) from public, anon;
grant execute on function public.pay_challan_batch(uuid[], text, date, text, text, boolean, jsonb, uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- settle_return_refund: same body as 20260916143000 plus the dated
-- handover guard before any write.
create or replace function public.settle_return_refund(p_challan_id uuid, p_mode text default 'Cash'::text, p_batch_id text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text;
  v_active boolean;
  v_row cash_challans%rowtype;
  v_remaining numeric;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select role, is_active into v_role, v_active from profiles where id = auth.uid();
  if v_role is null or v_active is distinct from true or v_role not in ('admin','manager','operator') then
    raise exception 'Only admin/manager/operator can settle a return refund';
  end if;
  if coalesce(btrim(p_mode), '') = '' or p_mode = 'Return Credit' then
    raise exception 'Pick a refund mode' using errcode = '23514';
  end if;

  select * into v_row from cash_challans where id = p_challan_id for update;
  if not found then raise exception 'Return not found'; end if;
  if v_row.is_return is distinct from true then raise exception 'Not a return challan'; end if;
  if v_row.status = 'voided' then raise exception 'This return is voided'; end if;

  v_remaining := v_row.total - coalesce(v_row.amount_paid, 0);
  if v_remaining <= 0 then raise exception 'This return''s credit is already settled'; end if;
  perform challan_check_handover_open(v_today);

  perform set_config('app.challan_rpc', 'on', true);

  update cash_challans
     set amount_paid = total,
         payment_mode = p_mode,
         payment_date = v_today,
         modified_by = auth.uid(),
         updated_at = now()
   where id = p_challan_id;

  insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id)
  values (p_challan_id, v_remaining, p_mode, v_today, auth.uid(),
          'Return credit settled — refunded to customer', nullif(p_batch_id, ''));

  perform audit_write('cash_challan', 'RETURN_SETTLED', p_challan_id::text,
    'Return credit ₹' || inr_text(v_remaining) || ' consumed' || coalesce(' in batch ' || nullif(p_batch_id, ''), '') || ' via ' || p_mode,
    jsonb_build_object('amount_paid', jsonb_build_object('from', v_row.amount_paid, 'to', v_row.total)));

  return jsonb_build_object('ok', true, 'refunded', v_remaining, 'challan_number', v_row.challan_number);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- void_challan: same body as 20260916143000; step 1 caps each withdrawal at
-- the return credit the sale still carries and at its amount_paid, so a
-- legacy unstamped reversal can never make the withdrawal overshoot and
-- trip the ledger-sync trigger.
create or replace function public.void_challan(p_id uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_c cash_challans%rowtype;
  v_sale cash_challans%rowtype;
  v_leg record;
  v_net numeric;
  v_rc_net numeric;
  v_new_paid numeric;
  v_new_status text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_batch text := 'VD-' || upper(to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'));
  v_withdrawn jsonb := '[]'::jsonb;
  v_refund numeric := 0;
  v_trail text := '';
begin
  if auth.uid() is null then raise exception 'Sign in to void a challan'; end if;
  select * into v_c from cash_challans where id = p_id for update;
  if not found then raise exception 'Challan not found'; end if;
  if v_c.status = 'voided' then raise exception 'Already voided' using errcode = '23514'; end if;

  perform set_config('app.challan_rpc', 'on', true);

  if v_c.is_return then
    for v_leg in
      select p.challan_id, sum(case when p.is_reversal then -p.amount else p.amount end) as net
        from cash_challan_payments p
       where p.settled_against = v_c.id and p.challan_id <> v_c.id and p.payment_mode = 'Return Credit'
       group by p.challan_id
      having sum(case when p.is_reversal then -p.amount else p.amount end) > 0
    loop
      select * into v_sale from cash_challans where id = v_leg.challan_id for update;
      if not found or v_sale.status = 'voided' then continue; end if;
      select coalesce(sum(case when is_reversal then -amount else amount end), 0) into v_rc_net
        from cash_challan_payments where challan_id = v_sale.id and payment_mode = 'Return Credit';
      v_net := least(round(v_leg.net, 2), round(v_rc_net, 2), round(coalesce(v_sale.amount_paid, 0), 2));
      if v_net <= 0 then continue; end if;
      v_new_paid := greatest(round(coalesce(v_sale.amount_paid, 0) - v_net, 2), 0);
      v_new_status := case when v_new_paid <= 0 then 'unpaid' when v_new_paid < v_sale.total then 'partial' else 'paid' end;
      update cash_challans set
        amount_paid = v_new_paid, status = v_new_status,
        payment_mode = case when v_new_paid <= 0 then null else payment_mode end,
        payment_date = case when v_new_paid <= 0 then null else payment_date end,
        modified_by = auth.uid(), updated_at = now()
      where id = v_sale.id;
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal, settled_against)
      values (v_sale.id, v_net, 'Return Credit', v_today, auth.uid(),
              'Return #' || v_c.challan_number || ' voided — its credit withdrawn', v_batch, true, v_c.id);
      perform audit_write('cash_challan', 'CREDIT_WITHDRAWN', v_sale.id::text,
        'Return #' || v_c.challan_number || ' voided — ₹' || inr_text(v_net) || ' credit withdrawn from challan #' || v_sale.challan_number || ' (now ' || v_new_status || ')',
        jsonb_build_object('status', jsonb_build_object('from', v_sale.status, 'to', v_new_status),
                           'amount_paid', jsonb_build_object('from', v_sale.amount_paid, 'to', v_new_paid)));
      v_withdrawn := v_withdrawn || jsonb_build_object('challan_id', v_sale.id, 'challan_number', v_sale.challan_number, 'amount', v_net, 'status', v_new_status);
      v_trail := v_trail || '; ₹' || inr_text(v_net) || ' credit withdrawn from #' || v_sale.challan_number || ' (now ' || v_new_status || ')';
    end loop;

    for v_leg in
      select payment_mode, sum(case when is_reversal then -amount else amount end) as net
        from cash_challan_payments where challan_id = v_c.id
       group by payment_mode having sum(case when is_reversal then -amount else amount end) > 0
    loop
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal)
      values (v_c.id, v_leg.net, v_leg.payment_mode, v_today, auth.uid(),
              case when v_leg.payment_mode = 'Return Credit'
                   then 'Return #' || v_c.challan_number || ' voided — credit consumption reversed'
                   else 'Return #' || v_c.challan_number || ' voided — refund of ₹' || inr_text(v_leg.net) || ' received back' end,
              v_batch, true);
      if v_leg.payment_mode <> 'Return Credit' then v_refund := v_refund + v_leg.net; end if;
    end loop;
    if v_refund > 0 then v_trail := v_trail || '; refund ₹' || inr_text(v_refund) || ' reversed'; end if;

    update cash_challans set status = 'voided', amount_paid = 0, voided_by = auth.uid(), voided_at = now(),
      modified_by = auth.uid(), updated_at = now()
    where id = v_c.id;
  else
    if v_c.status = 'paid' then
      raise exception 'Cannot void a fully paid challan — unpay it first' using errcode = '23514';
    end if;
    if coalesce(v_c.amount_paid, 0) > 0 then
      raise exception 'Remove the ₹% payment on challan #% first, then void', v_c.amount_paid, v_c.challan_number using errcode = '23514';
    end if;
    update cash_challans set status = 'voided', voided_by = auth.uid(), voided_at = now(),
      modified_by = auth.uid(), updated_at = now()
    where id = v_c.id;
  end if;

  perform audit_write('cash_challan', 'VOID', v_c.id::text,
    case when v_c.is_return then 'Return' else 'Challan' end || ' #' || v_c.challan_number || ' (' || coalesce(v_c.customer_name, '') || ') voided — was ₹' || inr_text(v_c.total) || v_trail,
    jsonb_build_object('status', jsonb_build_object('from', v_c.status, 'to', 'voided')));

  return jsonb_build_object('ok', true, 'challan_number', v_c.challan_number, 'customer_name', v_c.customer_name,
    'total', v_c.total, 'is_return', v_c.is_return, 'inventory_deducted', v_c.inventory_deducted,
    'prev_status', v_c.status, 'prev_paid', coalesce(v_c.amount_paid, 0),
    'credit_withdrawn', v_withdrawn, 'refund_reversed', v_refund, 'batch', v_batch);
end;
$function$;
