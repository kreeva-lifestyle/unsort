-- Money-leak guards on cash challans (ledger audit, 13 Oct 2026).
--
-- Trigger: the owner settled RAWLIKE returns #220-#224 against bills and asked
-- for a full audit. That ledger reconciles to the rupee; the audit found
-- paths where the next such settlement could lose money. Fixed here:
--
-- 1. pay_challan_batch (Bulk Pay with returns)
--    a. A batch that nets returns must be ONE customer's challans — before,
--       one customer's return credit could pay another customer's bill.
--    b. Return credit now pays each sale as a mirrored 'Return Credit' pair
--       (settled_against both ways, exactly like apply_return_credit)
--       instead of a plain cash-mode row on the return. So a later Bulk
--       Unpay of the sale hands the credit back to the return, and voiding
--       the return withdraws it from the sale (the customer owes it again)
--       — before, both silently lost the credit / the money owed.
--    c. A refund hands back all the credit left; a typed amount that does
--       not match it is refused (before, the typed figure was ignored and
--       the full credit was booked as refunded whatever was handed over).
--    d. With returns in the batch, any sale that cannot be paid aborts the
--       whole batch (the net figure assumed every selected bill).
-- 2. undo_challan_batch works per challan: a short-paid bill's money row and
--    'Write-off' row come back together (before, one stayed recorded as
--    paid); a challan unpaid or re-paid after the batch is skipped instead
--    of having its newer payment reversed; credit legs go back to their
--    return, refunds taken out of a return come back as credit.
-- 3. void_challan refuses to void a sale while a live return was made from
--    it ("void that return first") — before, the return's credit outlived
--    the sale and the customer was relieved twice.
-- 4. (update_challan_with_items lives in 20261013121000 — applied
--    separately because the SQL tool needs an owner confirmation for it.)
-- 5. challan_check_money (returns): same customer as the source bill, unit
--    price never above what the source charged, round-off up by less than a
--    rupee (was ±999.99 — a typo could add up to ₹999 of credit), and all
--    live returns of a bill together never credit more than it charged for
--    its goods (total less shipping). create_challan_with_items locks the
--    source bill so two returns saved at once cannot both pass the caps.
-- 6. protect_challan_immutability: status -> 'voided' only through
--    void_challan (a bare update lost payments and credit from the books).
-- 7. prevent_backdated_challan_payment: a new challan carrying money may not
--    be dated inside a confirmed/pending handover period, today included
--    (IST). Before, a sale paid after the day's handover was confirmed was
--    never counted in any handover (#104, ₹3,250 UPI, 15 Jul is one).
--
-- Verified before applying with rolled-back transactions on throwaway rows
-- (netted batch, undo, refund partial/over, short payment + undo, re-paid
-- skip, unpay restores credit, void return withdraws credit, every guard).
-- No data change: no live Bulk Pay batch ever included a return and no
-- Write-off rows exist, so nothing was written the old way.

CREATE OR REPLACE FUNCTION public.challan_check_money(p_challan jsonb, p_items jsonb, p_self uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_qty numeric; v_price numeric; v_dt text; v_dv numeric; v_line numeric; v_disc numeric;
  v_sum_line numeric := 0; v_sum_disc numeric := 0;
  v_subtotal numeric := (p_challan->>'subtotal')::numeric;
  v_discount numeric := COALESCE((p_challan->>'discount_amount')::numeric, 0);
  v_shipping numeric := COALESCE((p_challan->>'shipping_charges')::numeric, 0);
  v_round numeric := COALESCE((p_challan->>'round_off')::numeric, 0);
  v_total numeric := (p_challan->>'total')::numeric;
  v_is_return boolean := COALESCE((p_challan->>'is_return')::boolean, false);
  v_source uuid := NULLIF(p_challan->>'source_challan_id', '')::uuid;
  v_sku text; v_src_qty numeric; v_prev_qty numeric; v_n int;
  v_src record; v_unit numeric; v_src_unit numeric; v_used numeric;
BEGIN
  IF COALESCE(btrim(p_challan->>'customer_name'), '') = '' THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = '23514';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A challan needs at least one item' USING ERRCODE = '23514';
  END IF;
  IF v_subtotal IS NULL OR v_total IS NULL THEN
    RAISE EXCEPTION 'Subtotal and total are required' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE(btrim(v_item->>'sku'), '') = '' AND COALESCE(btrim(v_item->>'description'), '') = '' THEN
      RAISE EXCEPTION 'Every item needs a SKU or a description' USING ERRCODE = '23514';
    END IF;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    v_dt := NULLIF(v_item->>'discount_type', '');
    v_dv := COALESCE((v_item->>'discount_value')::numeric, 0);
    IF v_qty IS NULL OR v_qty < 1 OR v_qty <> trunc(v_qty) THEN
      RAISE EXCEPTION 'Quantity must be a whole number of at least 1' USING ERRCODE = '23514';
    END IF;
    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Price cannot be negative' USING ERRCODE = '23514';
    END IF;
    IF v_dt IS NOT NULL AND v_dt NOT IN ('flat', 'percentage') THEN
      RAISE EXCEPTION 'Unknown discount type' USING ERRCODE = '23514';
    END IF;
    IF v_dv < 0 OR (v_dt = 'percentage' AND v_dv > 100) THEN
      RAISE EXCEPTION 'Discount is out of range' USING ERRCODE = '23514';
    END IF;
    v_line := round(v_qty * v_price, 2);
    v_disc := round(CASE WHEN v_dt = 'percentage' THEN v_qty * v_price * v_dv / 100 ELSE v_dv END, 2);
    IF v_disc > v_line THEN
      RAISE EXCEPTION 'Item discount exceeds the line amount' USING ERRCODE = '23514';
    END IF;
    IF abs(COALESCE((v_item->>'discount_amount')::numeric, 0) - v_disc) > 0.01 THEN
      RAISE EXCEPTION 'Item discount does not match its discount value' USING ERRCODE = '23514';
    END IF;
    IF abs(COALESCE((v_item->>'total')::numeric, -1) - round(v_line - v_disc, 2)) > 0.01 THEN
      RAISE EXCEPTION 'Item total does not match quantity x price' USING ERRCODE = '23514';
    END IF;
    v_sum_line := v_sum_line + v_line;
    v_sum_disc := v_sum_disc + v_disc;
  END LOOP;

  IF abs(v_subtotal - v_sum_line) > 0.01 THEN
    RAISE EXCEPTION 'Subtotal does not match the items' USING ERRCODE = '23514';
  END IF;
  IF abs(v_discount - v_sum_disc) > 0.01 THEN
    RAISE EXCEPTION 'Discount does not match the item discounts' USING ERRCODE = '23514';
  END IF;
  IF v_shipping < 0 OR (v_is_return AND v_shipping <> 0) THEN
    RAISE EXCEPTION 'Shipping charges are out of range' USING ERRCODE = '23514';
  END IF;
  IF abs(v_round) > 999.99 THEN
    RAISE EXCEPTION 'Round-off must be within 999.99' USING ERRCODE = '23514';
  END IF;
  IF abs(v_total - round(v_subtotal - v_discount + v_shipping + v_round, 2)) > 0.01 THEN
    RAISE EXCEPTION 'Total does not match subtotal, discount, shipping and round-off' USING ERRCODE = '23514';
  END IF;
  IF v_total < 0 THEN
    RAISE EXCEPTION 'Total cannot be negative' USING ERRCODE = '23514';
  END IF;

  -- Returns: only the source invoice's SKUs, never more than it still holds.
  IF v_is_return THEN
    IF v_source IS NULL THEN RAISE EXCEPTION 'A return must name its source invoice' USING ERRCODE = '23514'; END IF;
    SELECT id, challan_number, customer_id, customer_name, total, COALESCE(shipping_charges, 0) AS shipping INTO v_src FROM cash_challans WHERE id = v_source AND NOT is_return AND status <> 'voided';
    IF NOT FOUND THEN RAISE EXCEPTION 'The source invoice is not an open sale' USING ERRCODE = '23514'; END IF;
    -- The credit belongs to the customer who bought the goods.
    IF NOT (
      (v_src.customer_id IS NOT NULL AND v_src.customer_id = NULLIF(p_challan->>'customer_id', '')::uuid)
      OR (v_src.customer_id IS NULL
          AND btrim(lower(coalesce(v_src.customer_name, ''))) = btrim(lower(coalesce(p_challan->>'customer_name', ''))))
    ) THEN
      RAISE EXCEPTION 'A return must be for the same customer as its source challan' USING ERRCODE = '23514';
    END IF;
    -- Round-off on a return may go down freely but up by less than a rupee
    -- (the automatic rounding); the cap below bounds the total anyway.
    IF v_round >= 1 THEN
      RAISE EXCEPTION 'A return can round up by less than 1 rupee' USING ERRCODE = '23514';
    END IF;
    -- All live returns of a bill together never credit more than the bill
    -- charged for its goods (total less shipping, after its own discounts
    -- and round-off). Shipping is not refunded.
    SELECT COALESCE(SUM(total), 0) INTO v_used FROM cash_challans
     WHERE source_challan_id = v_source AND is_return AND status <> 'voided' AND (p_self IS NULL OR id <> p_self);
    IF v_total > v_src.total - v_src.shipping - v_used + 0.009 THEN
      RAISE EXCEPTION 'This return can credit at most ₹% — what is left of challan #%''s charge. Round it down.',
        inr_text(greatest(v_src.total - v_src.shipping - v_used, 0)), v_src.challan_number USING ERRCODE = '23514';
    END IF;
    FOR v_sku, v_qty IN
      SELECT COALESCE(NULLIF(btrim(value->>'sku'), ''), ''), SUM((value->>'quantity')::numeric)
        FROM jsonb_array_elements(p_items) GROUP BY 1
    LOOP
      SELECT COALESCE(SUM(quantity), 0), COUNT(*) INTO v_src_qty, v_n
        FROM cash_challan_items WHERE challan_id = v_source AND COALESCE(sku, '') = v_sku;
      IF v_n = 0 THEN
        RAISE EXCEPTION 'SKU % is not on the source invoice', v_sku USING ERRCODE = '23514';
      END IF;
      SELECT COALESCE(SUM(i.quantity), 0) INTO v_prev_qty
        FROM cash_challan_items i JOIN cash_challans r ON r.id = i.challan_id
       WHERE r.source_challan_id = v_source AND r.is_return AND r.status <> 'voided'
         AND (p_self IS NULL OR r.id <> p_self) AND COALESCE(i.sku, '') = v_sku;
      IF v_qty > v_src_qty - v_prev_qty THEN
        RAISE EXCEPTION 'SKU %: only % left to return', v_sku, (v_src_qty - v_prev_qty)::int USING ERRCODE = '23514';
      END IF;
      -- Never credit a piece above what the source bill charged for it.
      SELECT max(round((value->>'total')::numeric / NULLIF((value->>'quantity')::numeric, 0), 2)) INTO v_unit
        FROM jsonb_array_elements(p_items) WHERE COALESCE(NULLIF(btrim(value->>'sku'), ''), '') = v_sku;
      SELECT max(round(total / NULLIF(quantity, 0), 2)) INTO v_src_unit
        FROM cash_challan_items WHERE challan_id = v_source AND COALESCE(sku, '') = v_sku;
      IF v_unit > COALESCE(v_src_unit, 0) + 0.01 THEN
        RAISE EXCEPTION 'SKU %: return price is above what the source challan charged', v_sku USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_challan_with_items(p_challan jsonb, p_items jsonb, p_payment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_challan_id uuid;
  v_challan_number int;
  v_item jsonb;
  v_i int := 0;
  v_tags text[] := null;
  v_is_return boolean := coalesce((p_challan->>'is_return')::boolean, false);
  v_status text := p_challan->>'status';
  v_amount_paid numeric := coalesce((p_challan->>'amount_paid')::numeric, 0);
  v_total numeric := (p_challan->>'total')::numeric;
  v_pay_amount numeric := coalesce((p_payment->>'amount')::numeric, 0);
  v_actor uuid := coalesce(auth.uid(), (p_challan->>'created_by')::uuid);
begin
  perform set_config('app.challan_rpc', 'on', true);
  -- Two returns saved at once against one bill: the second waits here and
  -- then sees the first in the returned-quantity check.
  if v_is_return and nullif(p_challan->>'source_challan_id', '') is not null then
    perform 1 from cash_challans where id = (p_challan->>'source_challan_id')::uuid for update;
  end if;
  perform challan_check_money(p_challan, p_items, null);

  if v_is_return then
    -- Returns are credit notes: always closed, never cash. Enforce
    -- server-side regardless of what the client sent.
    v_status := 'paid';
    v_amount_paid := 0;
    p_payment := null;
  else
    if v_status = 'paid' and v_amount_paid is distinct from v_total then
      raise exception 'Status "paid" requires amount_paid (%) to equal total (%)', v_amount_paid, v_total using errcode = '23514';
    elsif v_status = 'partial' and not (v_amount_paid > 0 and v_amount_paid < v_total) then
      raise exception 'Status "partial" requires 0 < amount_paid (%) < total (%)', v_amount_paid, v_total using errcode = '23514';
    elsif v_status = 'unpaid' and v_amount_paid <> 0 then
      raise exception 'Status "unpaid" requires amount_paid 0, got %', v_amount_paid using errcode = '23514';
    end if;
    -- amount_paid and the payment ledger row must be written together and agree.
    if v_amount_paid > 0 and (p_payment is null or v_pay_amount is distinct from v_amount_paid) then
      raise exception 'amount_paid (%) requires a matching payment record (got %)', v_amount_paid, v_pay_amount using errcode = '23514';
    end if;
    if v_amount_paid = 0 and v_pay_amount > 0 then
      raise exception 'Payment record of % supplied but amount_paid is 0', v_pay_amount using errcode = '23514';
    end if;
  end if;

  if p_challan->'tags' is not null and jsonb_typeof(p_challan->'tags') = 'array' and jsonb_array_length(p_challan->'tags') > 0 then
    v_tags := array(select jsonb_array_elements_text(p_challan->'tags'));
  end if;

  insert into cash_challans (
    customer_id, customer_name, customer_phone, status,
    subtotal, discount_type, discount_value, discount_amount,
    shipping_charges, round_off, total, amount_paid,
    payment_mode, payment_date, notes, tags,
    created_by, is_return, source_challan_id, modified_by
  )
  values (
    (p_challan->>'customer_id')::uuid,
    p_challan->>'customer_name',
    nullif(p_challan->>'customer_phone', ''),
    v_status,
    (p_challan->>'subtotal')::numeric,
    nullif(p_challan->>'discount_type', ''),
    coalesce((p_challan->>'discount_value')::numeric, 0),
    coalesce((p_challan->>'discount_amount')::numeric, 0),
    coalesce((p_challan->>'shipping_charges')::numeric, 0),
    coalesce((p_challan->>'round_off')::numeric, 0),
    v_total,
    v_amount_paid,
    nullif(p_challan->>'payment_mode', ''),
    (nullif(p_challan->>'payment_date', ''))::date,
    nullif(p_challan->>'notes', ''),
    v_tags,
    v_actor,
    v_is_return,
    (p_challan->>'source_challan_id')::uuid,
    v_actor
  )
  returning id, challan_number into v_challan_id, v_challan_number;

  for v_item in select jsonb_array_elements(p_items)
  loop
    insert into cash_challan_items (
      challan_id, sku, description, quantity, price, total,
      discount_type, discount_value, discount_amount, sort_order
    ) values (
      v_challan_id,
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

  if p_payment is not null and (p_payment->>'amount')::numeric > 0 then
    insert into cash_challan_payments (
      challan_id, amount, payment_mode, payment_date, paid_by
    ) values (
      v_challan_id,
      (p_payment->>'amount')::numeric,
      coalesce(p_payment->>'payment_mode', 'Cash'),
      coalesce((p_payment->>'payment_date')::date, (now() at time zone 'Asia/Kolkata')::date),
      v_actor
    );
  end if;

  perform audit_write('cash_challan', 'CREATE', v_challan_id::text,
    case when v_is_return then 'Return' else 'Challan' end || ' #' || v_challan_number || ' created for ' || btrim(p_challan->>'customer_name') || ' — ₹' || inr_text(v_total));

  return jsonb_build_object('id', v_challan_id, 'challan_number', v_challan_number);
end;
$function$;
CREATE OR REPLACE FUNCTION public.pay_challan_batch(p_ids uuid[], p_mode text, p_date date, p_batch_id text, p_note text DEFAULT NULL::text, p_refund boolean DEFAULT false, p_extra jsonb DEFAULT NULL::jsonb, p_return_ids uuid[] DEFAULT NULL::uuid[], p_received numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  -- Write-off bookkeeping: the money rows written on sales, in order.
  v_pay_ids uuid[] := '{}';
  v_pay_amts numeric[] := '{}';
  v_pay_challans uuid[] := '{}';
  v_pay_numbers int[] := '{}';
  v_pay_id uuid;
  v_collected numeric := 0;      -- money due on the sales after credit
  v_gap numeric;
  v_take numeric;
  v_i int;
  -- The returns' credit pool, in the order given.
  v_ret_ids uuid[] := '{}';
  v_ret_nums int[] := '{}';
  v_ret_left numeric[] := '{}';
  v_ret_used numeric[] := '{}';
  v_ret_paid numeric[] := '{}';
  v_k int;
  v_x numeric;
  v_cash numeric;
  v_cust text;
  v_key text;
  v_refund numeric;
  v_left_total numeric;
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

  -- 1. Returns first: lock each one and pool its unused credit. A return
  --    belongs to its customer, so every return (and, below, every sale)
  --    in a batch that nets returns must be the same customer's.
  foreach v_id in array coalesce(p_return_ids, '{}'::uuid[]) loop
    if v_id = any(v_ret_ids) then raise exception 'A return is listed twice in this batch' using errcode = '23514'; end if;
    select id, challan_number, status, is_return, total, coalesce(amount_paid, 0) as amount_paid, customer_id, customer_name
      into v_c from cash_challans where id = v_id for update;
    if not found then raise exception 'Return not found'; end if;
    if v_c.is_return is distinct from true then raise exception 'Challan #% is not a return', v_c.challan_number using errcode = '23514'; end if;
    if v_c.status = 'voided' then raise exception 'Return #% is voided', v_c.challan_number using errcode = '23514'; end if;
    v_remaining := round(v_c.total - v_c.amount_paid, 2);
    if v_remaining <= 0 then raise exception 'Return #% — its credit is already settled', v_c.challan_number using errcode = '23514'; end if;
    select coalesce(sum(case when is_reversal then -amount else amount end), 0) into v_ledger
      from cash_challan_payments where challan_id = v_id;
    if v_ledger is distinct from v_c.amount_paid then raise exception 'Return #% payment ledger is out of sync', v_c.challan_number; end if;
    v_key := coalesce(v_c.customer_id::text, 'name:' || btrim(lower(coalesce(v_c.customer_name, ''))));
    if v_cust is null then v_cust := v_key;
    elsif v_cust <> v_key then
      raise exception 'Returns can only settle the same customer''s challans' using errcode = '23514';
    end if;
    v_ret_ids := v_ret_ids || v_id; v_ret_nums := v_ret_nums || v_c.challan_number;
    v_ret_left := v_ret_left || v_remaining; v_ret_used := v_ret_used || 0::numeric;
    v_ret_paid := v_ret_paid || v_c.amount_paid;
  end loop;

  -- 2. Sales. Each one is paid from the pooled credit first — as mirrored
  --    'Return Credit' pairs, exactly like apply_return_credit, so a later
  --    unpay / void / undo hands that credit back to the right return —
  --    and the rest in p_mode. When returns are netted, a sale that cannot
  --    be paid aborts the whole batch: the customer's figure was counted
  --    net of every selected bill.
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    select id, challan_number, status, is_return, total, coalesce(amount_paid, 0) as amount_paid, customer_id, customer_name
      into v_c from cash_challans where id = v_id for update;
    if not found then
      if v_has_returns then raise exception 'A selected challan no longer exists — nothing was saved' using errcode = '23514'; end if;
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'skipped', 'not found');
      continue;
    end if;
    if v_c.is_return then
      if v_has_returns then raise exception 'Challan #% is a return — nothing was saved', v_c.challan_number using errcode = '23514'; end if;
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'is a return');
      continue;
    end if;
    if v_c.status not in ('unpaid', 'partial') then
      if v_has_returns then raise exception 'Challan #% is already % — nothing was saved', v_c.challan_number, v_c.status using errcode = '23514'; end if;
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'already ' || v_c.status);
      continue;
    end if;
    v_outstanding := round(v_c.total - v_c.amount_paid, 2);
    if v_outstanding <= 0 then
      if v_has_returns then raise exception 'Challan #% has nothing outstanding — nothing was saved', v_c.challan_number using errcode = '23514'; end if;
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'nothing outstanding');
      continue;
    end if;
    select coalesce(sum(case when is_reversal then -amount else amount end), 0) into v_ledger
      from cash_challan_payments where challan_id = v_id;
    if v_ledger is distinct from v_c.amount_paid then
      if v_has_returns then raise exception 'Challan #% payment ledger is out of sync — nothing was saved', v_c.challan_number; end if;
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'payment ledger out of sync');
      continue;
    end if;
    if v_has_returns then
      v_key := coalesce(v_c.customer_id::text, 'name:' || btrim(lower(coalesce(v_c.customer_name, ''))));
      if v_key <> v_cust then
        raise exception 'Returns can only settle the same customer''s challans' using errcode = '23514';
      end if;
    end if;

    begin
      v_cash := v_outstanding;
      v_k := 1;
      while v_cash > 0.009 and v_k <= coalesce(array_length(v_ret_ids, 1), 0) loop
        v_x := least(v_cash, v_ret_left[v_k]);
        if v_x > 0.009 then
          insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal, settled_against)
          values (v_id, v_x, 'Return Credit', p_date, auth.uid(),
                  'Return credit from #' || v_ret_nums[v_k] || ' applied (batch ' || p_batch_id || ')', p_batch_id, false, v_ret_ids[v_k]);
          insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal, settled_against)
          values (v_ret_ids[v_k], v_x, 'Return Credit', p_date, auth.uid(),
                  'Credit applied to challan #' || v_c.challan_number || ' (batch ' || p_batch_id || ')', p_batch_id, false, v_id);
          v_ret_left[v_k] := round(v_ret_left[v_k] - v_x, 2);
          v_ret_used[v_k] := round(v_ret_used[v_k] + v_x, 2);
          v_cash := round(v_cash - v_x, 2);
        end if;
        v_k := v_k + 1;
      end loop;

      update cash_challans set
        status = 'paid', amount_paid = total,
        payment_mode = case when v_cash > 0.009 then p_mode else 'Return Credit' end,
        payment_date = p_date, modified_by = auth.uid(), updated_at = now()
      where id = v_id;
      if v_cash > 0.009 then
        insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal)
        values (v_id, v_cash, p_mode, p_date, auth.uid(), nullif(p_note, ''), p_batch_id, false)
        returning id into v_pay_id;
        v_pay_ids := v_pay_ids || v_pay_id; v_pay_amts := v_pay_amts || v_cash;
        v_pay_challans := v_pay_challans || v_id; v_pay_numbers := v_pay_numbers || v_c.challan_number;
        v_collected := v_collected + v_cash;
      end if;
      perform audit_write('cash_challan', case when p_refund then 'SETTLE_REFUND' else 'BULK_PAY' end, v_id::text,
        case when p_refund then 'Settled against returns' else 'Bulk paid' end || ' (' || p_batch_id || ') — ₹' || inr_text(v_outstanding)
          || case when v_outstanding - v_cash > 0.009 then ' (₹' || inr_text(v_outstanding - v_cash) || ' return credit'
                    || case when v_cash > 0.009 then ' + ₹' || inr_text(v_cash) || ' via ' || p_mode else '' end || ')'
                  else ' via ' || p_mode end,
        jsonb_build_object('status', jsonb_build_object('from', v_c.status, 'to', 'paid'),
                           'amount_paid', jsonb_build_object('from', v_c.amount_paid, 'to', v_c.total)) || coalesce(p_extra, '{}'::jsonb));
      v_results := v_results || jsonb_build_object(
        'challan_id', v_id, 'challan_number', v_c.challan_number,
        'prev_status', v_c.status, 'prev_paid', v_c.amount_paid, 'paid', v_outstanding, 'total', v_c.total,
        'credit', round(v_outstanding - v_cash, 2));
    exception when others then
      -- Netted batches must be all-or-nothing (the credit arrays above are
      -- plain variables and do not roll back with the subtransaction).
      if v_has_returns then raise; end if;
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', sqlerrm);
    end;
  end loop;

  -- 3. Credit left after the sales: a refund batch hands ALL of it back.
  --    An amount typed by the operator must match it — a part refund would
  --    book money that was not handed over (or leave credit behind that a
  --    later handover locks), so it is refused instead of guessed.
  v_left_total := 0;
  for v_k in 1 .. coalesce(array_length(v_ret_ids, 1), 0) loop v_left_total := v_left_total + v_ret_left[v_k]; end loop;
  if coalesce(p_refund, false) and v_has_returns then
    v_refund := round(v_left_total, 2);
    if p_received is not null and abs(round(p_received, 2) - v_refund) > 0.009 then
      raise exception 'Refund ₹% does not match the ₹% credit left — refund it all, or apply part of the credit from the return', inr_text(p_received), inr_text(v_refund) using errcode = '23514';
    end if;
    for v_k in 1 .. coalesce(array_length(v_ret_ids, 1), 0) loop
      exit when v_refund <= 0.009;
      v_x := least(v_refund, v_ret_left[v_k]);
      if v_x > 0.009 then
        insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal)
        values (v_ret_ids[v_k], v_x, p_mode, p_date, auth.uid(), 'Refunded to customer in batch ' || p_batch_id, p_batch_id, false);
        v_ret_left[v_k] := round(v_ret_left[v_k] - v_x, 2);
        v_ret_used[v_k] := round(v_ret_used[v_k] + v_x, 2);
        v_refund := round(v_refund - v_x, 2);
      end if;
    end loop;
  end if;

  -- 4. Stamp each return with what this batch used of it.
  for v_k in 1 .. coalesce(array_length(v_ret_ids, 1), 0) loop
    continue when v_ret_used[v_k] <= 0;
    update cash_challans set
      amount_paid = round(v_ret_paid[v_k] + v_ret_used[v_k], 2),
      payment_mode = 'Return Credit', payment_date = p_date,
      modified_by = auth.uid(), updated_at = now()
    where id = v_ret_ids[v_k];
    perform audit_write('cash_challan', 'RETURN_SETTLED', v_ret_ids[v_k]::text,
      'Return credit ₹' || inr_text(v_ret_used[v_k]) || ' used in batch ' || p_batch_id
        || case when v_ret_left[v_k] > 0.009 then ' — ₹' || inr_text(v_ret_left[v_k]) || ' credit left' else '' end,
      jsonb_build_object('amount_paid', jsonb_build_object('from', v_ret_paid[v_k], 'to', round(v_ret_paid[v_k] + v_ret_used[v_k], 2))));
    v_results := v_results || jsonb_build_object('challan_id', v_ret_ids[v_k], 'challan_number', v_ret_nums[v_k],
      'is_return', true, 'settled', v_ret_used[v_k], 'credit_left', v_ret_left[v_k]);
  end loop;

  -- 5. Short payment: what the customer did not hand over is carved out of
  --    the last money rows as 'Write-off' rows, so cash by mode is real cash.
  if not coalesce(p_refund, false) and p_received is not null then
    v_gap := round(v_collected - p_received, 2);
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
    if v_gap > 0.009 then
      raise exception 'Amount received is ₹% short of what the batch can write off', inr_text(v_gap) using errcode = '23514';
    end if;
  end if;

  return v_results;
end;
$function$;
CREATE OR REPLACE FUNCTION public.undo_challan_batch(p_batch_id text, p_undo_batch_id text, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_ch record;
  v_challan record;
  v_leg record;
  v_ret record;
  v_rev numeric;
  v_remaining numeric;
  v_x numeric;
  v_results jsonb := '[]'::jsonb;
  v_actor uuid := coalesce(auth.uid(), p_user);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_note text := 'Undo ' || p_batch_id;
begin
  if v_actor is null then raise exception 'Sign in to undo a batch'; end if;
  if coalesce(btrim(p_batch_id), '') = '' then raise exception 'Batch id is required' using errcode = '23514'; end if;
  perform set_config('app.challan_rpc', 'on', true);
  -- A batch may be undone exactly once.
  if exists (
    select 1 from cash_challan_payments
    where is_reversal and notes = v_note
  ) then
    raise exception 'Batch % has already been undone.', p_batch_id using errcode = '23514';
  end if;

  -- One step per challan (not per row): a short-paid bill carries both a
  -- money row and a 'Write-off' row, and a credit-paid bill carries
  -- 'Return Credit' rows — all of them come back together.
  for v_ch in
    select p.challan_id, max(p.created_at) as at, bool_or(c.is_return) as is_ret
      from cash_challan_payments p join cash_challans c on c.id = p.challan_id
     where p.batch_id = p_batch_id and not p.is_reversal
     group by p.challan_id
     order by bool_or(c.is_return), p.challan_id
  loop
    select id, challan_number, coalesce(amount_paid, 0) as amount_paid, status, total
      into v_challan from cash_challans where id = v_ch.challan_id for update;
    if not found or v_challan.status = 'voided' then
      v_results := v_results || jsonb_build_object('challan_id', v_ch.challan_id, 'challan_number', v_challan.challan_number, 'skipped', 'voided since the batch');
      continue;
    end if;

    if v_ch.is_ret then
      -- A return's credit legs are undone from the sale's side (below,
      -- already done because sales sort first); here only a refund paid out
      -- of it in this batch comes back.
      v_rev := 0;
      for v_leg in
        select payment_mode, sum(amount) as amt from cash_challan_payments
         where challan_id = v_challan.id and batch_id = p_batch_id and not is_reversal and payment_mode <> 'Return Credit'
         group by payment_mode having sum(amount) > 0
      loop
        v_x := least(round(v_leg.amt, 2), round(v_challan.amount_paid - v_rev, 2));
        continue when v_x <= 0;
        insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id)
        values (v_challan.id, v_x, v_leg.payment_mode, v_today, v_actor, v_note, true, p_undo_batch_id);
        v_rev := v_rev + v_x;
      end loop;
      continue when v_rev <= 0;
      v_remaining := greatest(round(v_challan.amount_paid - v_rev, 2), 0);
      update cash_challans set amount_paid = v_remaining, modified_by = v_actor, updated_at = now() where id = v_challan.id;
      perform audit_write('cash_challan', 'BATCH_UNDO', v_challan.id::text,
        'Undo batch ' || p_batch_id || ' (reversal ' || p_undo_batch_id || ') — refund ₹' || inr_text(v_rev) || ' taken back, credit restored on return #' || v_challan.challan_number,
        jsonb_build_object('amount_paid', jsonb_build_object('from', v_challan.amount_paid, 'to', v_remaining)));
      v_results := v_results || jsonb_build_object('challan_id', v_challan.id, 'challan_number', v_challan.challan_number,
        'is_return', true, 'prev_paid', v_challan.amount_paid, 'remaining', v_remaining);
      continue;
    end if;

    -- A sale is undone only if nothing touched its payments after the
    -- batch: a bill unpaid and re-paid since must keep the newer payment.
    if v_challan.status <> 'paid' or exists (
      select 1 from cash_challan_payments
       where challan_id = v_challan.id and created_at > v_ch.at and batch_id is distinct from p_batch_id
    ) then
      v_results := v_results || jsonb_build_object('challan_id', v_challan.id, 'challan_number', v_challan.challan_number, 'skipped', 'changed since the batch');
      continue;
    end if;

    v_rev := 0;
    -- Money legs (the batch's mode and any Write-off).
    for v_leg in
      select payment_mode, sum(amount) as amt from cash_challan_payments
       where challan_id = v_challan.id and batch_id = p_batch_id and not is_reversal and payment_mode <> 'Return Credit'
       group by payment_mode having sum(amount) > 0
    loop
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id)
      values (v_challan.id, round(v_leg.amt, 2), v_leg.payment_mode, v_today, v_actor, v_note, true, p_undo_batch_id);
      v_rev := v_rev + round(v_leg.amt, 2);
    end loop;
    -- Credit legs: each goes back to the return it came from.
    for v_leg in
      select settled_against, sum(amount) as amt from cash_challan_payments
       where challan_id = v_challan.id and batch_id = p_batch_id and not is_reversal and payment_mode = 'Return Credit'
       group by settled_against having sum(amount) > 0
    loop
      insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id, settled_against)
      values (v_challan.id, round(v_leg.amt, 2), 'Return Credit', v_today, v_actor, v_note, true, p_undo_batch_id, v_leg.settled_against);
      v_rev := v_rev + round(v_leg.amt, 2);
      select id, challan_number, coalesce(amount_paid, 0) as amount_paid, status into v_ret
        from cash_challans where id = v_leg.settled_against for update;
      if found and v_ret.status <> 'voided' then
        v_x := least(round(v_leg.amt, 2), v_ret.amount_paid);
        update cash_challans set amount_paid = round(v_ret.amount_paid - v_x, 2), modified_by = v_actor, updated_at = now()
         where id = v_ret.id;
        insert into cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, is_reversal, batch_id, settled_against)
        values (v_ret.id, v_x, 'Return Credit', v_today, v_actor,
                'Credit restored — batch ' || p_batch_id || ' undone', true, p_undo_batch_id, v_challan.id);
        perform audit_write('cash_challan', 'CREDIT_RESTORED', v_ret.id::text,
          'Return #' || v_ret.challan_number || ' — ₹' || inr_text(v_x) || ' credit handed back (batch ' || p_batch_id || ' undone)',
          jsonb_build_object('amount_paid', jsonb_build_object('from', v_ret.amount_paid, 'to', round(v_ret.amount_paid - v_x, 2))));
      end if;
    end loop;
    continue when v_rev <= 0;

    v_remaining := greatest(round(v_challan.amount_paid - v_rev, 2), 0);
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
    perform audit_write('cash_challan', 'BATCH_UNDO', v_challan.id::text,
      'Undo batch ' || p_batch_id || ' (reversal ' || p_undo_batch_id || ') — ₹' || inr_text(v_rev) || ' reversed on #' || v_challan.challan_number,
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
CREATE OR REPLACE FUNCTION public.void_challan(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  v_n int;
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
    -- A bill that goods were returned from backs that return's credit:
    -- voiding it would leave the credit standing on a sale that no longer
    -- exists (the customer relieved twice). The return goes first.
    select r.challan_number into v_n from cash_challans r
     where r.source_challan_id = v_c.id and r.is_return and r.status <> 'voided'
     order by r.challan_number limit 1;
    if v_n is not null then
      raise exception 'Return #% was made from this challan — void that return first', v_n using errcode = '23514';
    end if;
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
CREATE OR REPLACE FUNCTION public.protect_challan_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

  -- Voiding unwinds payments and return credit; only void_challan does
  -- that, so a bare status flip would lose money from the books.
  if new.status = 'voided' and current_setting('app.challan_rpc', true) is distinct from 'on' then
    raise exception 'Void a challan from the app — it has to unwind its payments';
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
CREATE OR REPLACE FUNCTION public.prevent_backdated_challan_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_date date;
BEGIN
  -- All modes. Only rows that carry money into a period are guarded (a new return is
  -- 'paid' with nothing paid yet). Today counts too: a payment dated inside
  -- a period that was already handed over would never be stamped into any
  -- handover. Same rule the update path (prevent_locked_challan_mutation)
  -- already applies.
  IF NEW.status NOT IN ('paid', 'partial') OR COALESCE(NEW.amount_paid, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  target_date := COALESCE(NEW.payment_date, (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Kolkata')::date);
  PERFORM challan_check_handover_open(target_date);
  RETURN NEW;
END;
$function$;
