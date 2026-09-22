-- Audit fix M4, post-deploy audit 21 Sep 2026.
--
-- Bulk Pay lets the operator tick "customer paid ₹X less — mark everything
-- fully paid anyway". Until now the whole outstanding was booked as ONE
-- cash-mode payment row per challan and the shortfall lived only in the
-- note, so the day's cash by mode came out higher than the money in the
-- drawer and nothing in the ledger explained the gap.
--
-- Now pay_challan_batch takes p_received (what the customer actually handed
-- over, net of any return credit consumed in the same batch). When it is
-- below the batch total, the gap is carved out of the LAST challans paid as
-- separate 'Write-off' rows: the cash-mode row keeps only the money that
-- came in, the write-off row carries the rest. Header status/amount_paid
-- are unchanged (the challan IS settled), the deferred ledger check still
-- balances (cash + write-off = outstanding), the mode breakdown shows
-- Write-off on its own line, and Bulk Unpay / batch Undo reverse the
-- write-off leg like any other mode (challan_reverse_payments groups by
-- mode). Refund batches (net below zero) never write off — the customer
-- receives money there, nothing is forgiven.
--
-- Signature changes (a 9th argument with a default), so the 8-arg version
-- is dropped to keep PostgREST's overload resolution unambiguous.

drop function if exists public.pay_challan_batch(uuid[], text, date, text, text, boolean, jsonb, uuid[]);

create or replace function public.pay_challan_batch(
  p_ids uuid[],
  p_mode text,
  p_date date,
  p_batch_id text,
  p_note text default null,
  p_refund boolean default false,
  p_extra jsonb default null,
  p_return_ids uuid[] default null,
  p_received numeric default null
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
  -- Write-off bookkeeping: the cash rows written, in order, and the totals.
  v_pay_ids uuid[] := '{}';
  v_pay_amts numeric[] := '{}';
  v_pay_challans uuid[] := '{}';
  v_pay_numbers int[] := '{}';
  v_pay_id uuid;
  v_collected numeric := 0;
  v_credit numeric := 0;
  v_gap numeric;
  v_take numeric;
  v_i int;
begin
  if auth.uid() is null then raise exception 'Sign in to record payments'; end if;
  if coalesce(btrim(p_mode), '') = '' then raise exception 'Pick a payment mode' using errcode = '23514'; end if;
  if p_mode in ('Return Credit', 'Write-off') then raise exception '% is reserved for the ledger''s own entries', p_mode using errcode = '23514'; end if;
  if p_date is null then raise exception 'Pick a payment date' using errcode = '23514'; end if;
  if p_date > v_today then raise exception 'Payment date cannot be in the future' using errcode = '23514'; end if;
  if coalesce(btrim(p_batch_id), '') = '' then raise exception 'Batch id is required' using errcode = '23514'; end if;
  if not v_has_sales and not v_has_returns then raise exception 'Nothing to pay' using errcode = '23514'; end if;
  if p_received is not null and p_received < 0 then raise exception 'Amount received cannot be negative' using errcode = '23514'; end if;
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
      values (v_id, v_outstanding, p_mode, p_date, auth.uid(), nullif(p_note, ''), p_batch_id, false)
      returning id into v_pay_id;
      perform audit_write('cash_challan', case when p_refund then 'SETTLE_REFUND' else 'BULK_PAY' end, v_id::text,
        case when p_refund then 'Settled against returns' else 'Bulk paid' end || ' (' || p_batch_id || ') — ₹' || inr_text(v_outstanding) || ' via ' || p_mode,
        jsonb_build_object('status', jsonb_build_object('from', v_c.status, 'to', 'paid'),
                           'amount_paid', jsonb_build_object('from', v_c.amount_paid, 'to', v_c.total)) || coalesce(p_extra, '{}'::jsonb));
      v_results := v_results || jsonb_build_object(
        'challan_id', v_id, 'challan_number', v_c.challan_number,
        'prev_status', v_c.status, 'prev_paid', v_c.amount_paid, 'paid', v_outstanding, 'total', v_c.total);
      v_pay_ids := v_pay_ids || v_pay_id; v_pay_amts := v_pay_amts || v_outstanding;
      v_pay_challans := v_pay_challans || v_id; v_pay_numbers := v_pay_numbers || v_c.challan_number;
      v_collected := v_collected + v_outstanding;
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
    v_credit := v_credit + v_remaining;
  end loop;

  -- Short payment: what the customer did not hand over is carved out of the
  -- last challans paid as 'Write-off' rows, so cash by mode is the real cash.
  if not coalesce(p_refund, false) and p_received is not null then
    v_gap := round(v_collected - v_credit - p_received, 2);
    v_i := coalesce(array_length(v_pay_ids, 1), 0);
    while v_gap > 0.009 and v_i >= 1 loop
      v_take := least(v_gap, v_pay_amts[v_i]);
      if v_take >= v_pay_amts[v_i] then
        delete from cash_challan_payments where id = v_pay_ids[v_i];
      else
        update cash_challan_payments set amount = round(amount - v_take, 2) where id = v_pay_ids[v_i];
      end if;
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal)
      values (v_pay_challans[v_i], v_take, 'Write-off', p_date, auth.uid(),
              'Short payment in batch ' || p_batch_id || ' — ₹' || inr_text(v_take) || ' written off', p_batch_id, false);
      perform audit_write('cash_challan', 'WRITE_OFF', v_pay_challans[v_i]::text,
        'Bulk paid (' || p_batch_id || ') — ₹' || inr_text(v_take) || ' of #' || v_pay_numbers[v_i] || ' written off (customer paid short)',
        jsonb_build_object('written_off', v_take, 'received', p_received));
      v_results := v_results || jsonb_build_object('challan_id', v_pay_challans[v_i], 'challan_number', v_pay_numbers[v_i], 'written_off', v_take);
      v_gap := round(v_gap - v_take, 2);
      v_i := v_i - 1;
    end loop;
  end if;

  return v_results;
end;
$function$;
revoke all on function public.pay_challan_batch(uuid[], text, date, text, text, boolean, jsonb, uuid[], numeric) from public, anon;
grant execute on function public.pay_challan_batch(uuid[], text, date, text, text, boolean, jsonb, uuid[], numeric) to authenticated;
