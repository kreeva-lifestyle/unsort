-- A sale's edit can no longer outrun its returns (ledger audit, 13 Oct 2026;
-- companion to 20261013120000_challan_money_leak_guards).
--
-- update_challan_with_items:
--  * a challan cannot be switched between sale and return (a direct RPC call
--    could turn an unpaid sale into a "return" and mint credit);
--  * a sale with live returns cannot be edited so it charges less than they
--    credited (total less shipping) — otherwise the return's credit
--    outlives the goods it paid for and the customer is relieved twice;
--  * returns or applied return credit pin the bill's customer (credit
--    could otherwise follow the bill to another customer).
-- Everything else is unchanged from the live version.

CREATE OR REPLACE FUNCTION public.update_challan_with_items(p_challan_id uuid, p_challan jsonb, p_items jsonb, p_payment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  v_has_returns boolean := false;
  v_ret_credit numeric;
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
  if v_is_return is distinct from coalesce(v_old.is_return, false) then
    raise exception 'A challan cannot be switched between sale and return' using errcode = '23514';
  end if;
  if not v_is_return then
    v_has_returns := exists (select 1 from cash_challans r where r.source_challan_id = p_challan_id and r.is_return and r.status <> 'voided');
    -- Returns and applied return credit tie this bill to its customer.
    if (case when v_old.customer_id is not null
             then nullif(p_challan->>'customer_id', '')::uuid is distinct from v_old.customer_id
             else btrim(lower(coalesce(p_challan->>'customer_name', ''))) <> btrim(lower(coalesce(v_old.customer_name, ''))) end)
       and (v_has_returns or exists (
         select 1 from cash_challan_payments where challan_id = p_challan_id and payment_mode = 'Return Credit'
         group by challan_id having sum(case when is_reversal then -amount else amount end) > 0)) then
      raise exception 'Return credit is tied to this customer — the customer cannot be changed' using errcode = '23514';
    end if;
    -- The bill must still charge at least what its returns credited, or the
    -- credit would outlive the sale (customer relieved twice).
    if v_has_returns then
      select coalesce(sum(total), 0) into v_ret_credit from cash_challans
       where source_challan_id = p_challan_id and is_return and status <> 'voided';
      if v_new_total - coalesce((p_challan->>'shipping_charges')::numeric, 0) < v_ret_credit - 0.009 then
        raise exception 'Returns from this challan were credited ₹% — its charge cannot go below that', inr_text(v_ret_credit) using errcode = '23514';
      end if;
    end if;
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
