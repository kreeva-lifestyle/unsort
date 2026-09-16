-- Challan money was stored exactly as the browser computed it: neither
-- create_challan_with_items nor update_challan_with_items recomputed the
-- subtotal, discounts or total from the items, and nothing checked the items
-- against a return's source invoice. A stale tab, a float bug or a tampered
-- request could store any total, and every downstream figure (outstanding,
-- ledger, analytics, return credit, handover totals) trusts the stored total.
-- The purchase-order RPCs already recompute server-side; this brings the
-- challan RPCs to the same standard without changing what a correct client
-- sends: the rules below are challanTotals.ts (src/components/challan)
-- expressed in SQL, compared at 2 dp with a 1 paisa tolerance.
--
-- challan_check_money(p_challan, p_items, p_self) raises (errcode 23514, short
-- messages so friendlyError passes them through) when:
--   - an item has no SKU/description, quantity < 1, price < 0, a bad
--     discount type, or a line total / discount that does not follow from
--     qty x price and the discount
--   - subtotal <> sum(line totals), discount_amount <> sum(item discounts),
--     shipping < 0 (or non-zero on a return), |round_off| > 999.99,
--     total <> subtotal - discount + shipping + round_off
--   - a return names a SKU its source invoice never had, or returns more of
--     a SKU than the source still has unreturned (earlier non-voided returns
--     count; p_self excludes the return being edited)
-- Both RPCs call it first, before any write.

CREATE OR REPLACE FUNCTION public.challan_check_money(p_challan jsonb, p_items jsonb, p_self uuid DEFAULT NULL)
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
    PERFORM 1 FROM cash_challans WHERE id = v_source AND NOT is_return AND status <> 'voided';
    IF NOT FOUND THEN RAISE EXCEPTION 'The source invoice is not an open sale' USING ERRCODE = '23514'; END IF;
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
    END LOOP;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.challan_check_money(jsonb, jsonb, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.challan_check_money(jsonb, jsonb, uuid) TO authenticated;

-- create_challan_with_items: unchanged except for the check before any write.
CREATE OR REPLACE FUNCTION public.create_challan_with_items(p_challan jsonb, p_items jsonb, p_payment jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_challan_id uuid;
  v_challan_number int;
  v_item jsonb;
  v_i int := 0;
  v_tags text[] := NULL;
  v_is_return boolean := COALESCE((p_challan->>'is_return')::boolean, false);
  v_status text := p_challan->>'status';
  v_amount_paid numeric := COALESCE((p_challan->>'amount_paid')::numeric, 0);
  v_total numeric := (p_challan->>'total')::numeric;
  v_pay_amount numeric := COALESCE((p_payment->>'amount')::numeric, 0);
BEGIN
  PERFORM set_config('app.challan_rpc', 'on', true);
  PERFORM challan_check_money(p_challan, p_items, NULL);

  IF v_is_return THEN
    -- Returns are credit notes: always closed, never cash. Enforce
    -- server-side regardless of what the client sent.
    v_status := 'paid';
    v_amount_paid := 0;
    p_payment := NULL;
  ELSE
    IF v_status = 'paid' AND v_amount_paid IS DISTINCT FROM v_total THEN
      RAISE EXCEPTION 'Status "paid" requires amount_paid (%) to equal total (%)', v_amount_paid, v_total USING ERRCODE = '23514';
    ELSIF v_status = 'partial' AND NOT (v_amount_paid > 0 AND v_amount_paid < v_total) THEN
      RAISE EXCEPTION 'Status "partial" requires 0 < amount_paid (%) < total (%)', v_amount_paid, v_total USING ERRCODE = '23514';
    ELSIF v_status = 'unpaid' AND v_amount_paid <> 0 THEN
      RAISE EXCEPTION 'Status "unpaid" requires amount_paid 0, got %', v_amount_paid USING ERRCODE = '23514';
    END IF;
    -- amount_paid and the payment ledger row must be written together and agree.
    IF v_amount_paid > 0 AND (p_payment IS NULL OR v_pay_amount IS DISTINCT FROM v_amount_paid) THEN
      RAISE EXCEPTION 'amount_paid (%) requires a matching payment record (got %)', v_amount_paid, v_pay_amount USING ERRCODE = '23514';
    END IF;
    IF v_amount_paid = 0 AND v_pay_amount > 0 THEN
      RAISE EXCEPTION 'Payment record of % supplied but amount_paid is 0', v_pay_amount USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_challan->'tags' IS NOT NULL AND jsonb_typeof(p_challan->'tags') = 'array' AND jsonb_array_length(p_challan->'tags') > 0 THEN
    v_tags := ARRAY(SELECT jsonb_array_elements_text(p_challan->'tags'));
  END IF;

  INSERT INTO cash_challans (
    customer_id, customer_name, customer_phone, status,
    subtotal, discount_type, discount_value, discount_amount,
    shipping_charges, round_off, total, amount_paid,
    payment_mode, payment_date, notes, tags,
    created_by, is_return, source_challan_id, modified_by
  )
  VALUES (
    (p_challan->>'customer_id')::uuid,
    p_challan->>'customer_name',
    NULLIF(p_challan->>'customer_phone', ''),
    v_status,
    (p_challan->>'subtotal')::numeric,
    NULLIF(p_challan->>'discount_type', ''),
    COALESCE((p_challan->>'discount_value')::numeric, 0),
    COALESCE((p_challan->>'discount_amount')::numeric, 0),
    COALESCE((p_challan->>'shipping_charges')::numeric, 0),
    COALESCE((p_challan->>'round_off')::numeric, 0),
    v_total,
    v_amount_paid,
    NULLIF(p_challan->>'payment_mode', ''),
    (NULLIF(p_challan->>'payment_date', ''))::date,
    NULLIF(p_challan->>'notes', ''),
    v_tags,
    (p_challan->>'created_by')::uuid,
    v_is_return,
    (p_challan->>'source_challan_id')::uuid,
    (p_challan->>'modified_by')::uuid
  )
  RETURNING id, challan_number INTO v_challan_id, v_challan_number;

  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    INSERT INTO cash_challan_items (
      challan_id, sku, description, quantity, price, total,
      discount_type, discount_value, discount_amount, sort_order
    ) VALUES (
      v_challan_id,
      NULLIF(v_item->>'sku', ''),
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'total')::numeric,
      NULLIF(v_item->>'discount_type', ''),
      COALESCE((v_item->>'discount_value')::numeric, 0),
      COALESCE((v_item->>'discount_amount')::numeric, 0),
      v_i
    );
    v_i := v_i + 1;
  END LOOP;

  IF p_payment IS NOT NULL AND (p_payment->>'amount')::numeric > 0 THEN
    INSERT INTO cash_challan_payments (
      challan_id, amount, payment_mode, payment_date, paid_by
    ) VALUES (
      v_challan_id,
      (p_payment->>'amount')::numeric,
      COALESCE(p_payment->>'payment_mode', 'Cash'),
      COALESCE((p_payment->>'payment_date')::date, CURRENT_DATE),
      (p_payment->>'paid_by')::uuid
    );
  END IF;

  RETURN jsonb_build_object('id', v_challan_id, 'challan_number', v_challan_number);
END;
$function$;

-- update_challan_with_items: unchanged except for the check before any write.
CREATE OR REPLACE FUNCTION public.update_challan_with_items(p_challan_id uuid, p_challan jsonb, p_items jsonb, p_payment jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_i int := 0;
  v_tags text[] := NULL;
  v_prev_paid numeric;
  v_status text;
  v_new_paid numeric;
  v_pay_diff numeric;
  v_is_return boolean := COALESCE((p_challan->>'is_return')::boolean, false);
  v_new_status text := p_challan->>'status';
  v_new_total numeric := (p_challan->>'total')::numeric;
BEGIN
  PERFORM set_config('app.challan_rpc', 'on', true);
  PERFORM challan_check_money(p_challan, p_items, p_challan_id);

  IF p_challan->'tags' IS NOT NULL AND jsonb_typeof(p_challan->'tags') = 'array' AND jsonb_array_length(p_challan->'tags') > 0 THEN
    v_tags := ARRAY(SELECT jsonb_array_elements_text(p_challan->'tags'));
  END IF;

  -- Lock the row so concurrent edits serialise their payment-diff math.
  SELECT COALESCE(amount_paid, 0), status INTO v_prev_paid, v_status
    FROM cash_challans WHERE id = p_challan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challan not found';
  END IF;
  IF v_status = 'voided' THEN
    RAISE EXCEPTION 'Cannot edit a voided challan';
  END IF;

  v_new_paid := COALESCE((p_challan->>'amount_paid')::numeric, 0);
  v_pay_diff := v_new_paid - v_prev_paid;

  -- Coherence: status must match the money, and any amount_paid movement
  -- must carry a payment record so the ledger stays in sync.
  IF NOT v_is_return THEN
    IF v_new_status = 'paid' AND v_new_paid IS DISTINCT FROM v_new_total THEN
      RAISE EXCEPTION 'Status "paid" requires amount_paid (%) to equal total (%)', v_new_paid, v_new_total USING ERRCODE = '23514';
    ELSIF v_new_status = 'partial' AND NOT (v_new_paid > 0 AND v_new_paid < v_new_total) THEN
      RAISE EXCEPTION 'Status "partial" requires 0 < amount_paid (%) < total (%)', v_new_paid, v_new_total USING ERRCODE = '23514';
    ELSIF v_new_status = 'unpaid' AND v_new_paid <> 0 THEN
      RAISE EXCEPTION 'Status "unpaid" requires amount_paid 0, got %', v_new_paid USING ERRCODE = '23514';
    END IF;
  END IF;
  IF v_pay_diff <> 0 AND p_payment IS NULL THEN
    RAISE EXCEPTION 'amount_paid changed by % without a payment record', v_pay_diff USING ERRCODE = '23514';
  END IF;

  IF v_pay_diff > 0 AND p_payment IS NOT NULL THEN
    INSERT INTO cash_challan_payments (
      challan_id, amount, payment_mode, payment_date, paid_by, is_reversal
    ) VALUES (
      p_challan_id,
      v_pay_diff,
      COALESCE(p_payment->>'payment_mode', 'Cash'),
      COALESCE((p_payment->>'payment_date')::date, CURRENT_DATE),
      (p_payment->>'paid_by')::uuid,
      false
    );
  ELSIF v_pay_diff < 0 AND p_payment IS NOT NULL THEN
    INSERT INTO cash_challan_payments (
      challan_id, amount, payment_mode, payment_date, paid_by, is_reversal, notes
    ) VALUES (
      p_challan_id,
      ABS(v_pay_diff),
      COALESCE(p_payment->>'payment_mode', 'Cash'),
      CURRENT_DATE,
      (p_payment->>'paid_by')::uuid,
      true,
      'Payment removed/reduced'
    );
  END IF;

  DELETE FROM cash_challan_items WHERE challan_id = p_challan_id;

  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    INSERT INTO cash_challan_items (
      challan_id, sku, description, quantity, price, total,
      discount_type, discount_value, discount_amount, sort_order
    ) VALUES (
      p_challan_id,
      NULLIF(v_item->>'sku', ''),
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'total')::numeric,
      NULLIF(v_item->>'discount_type', ''),
      COALESCE((v_item->>'discount_value')::numeric, 0),
      COALESCE((v_item->>'discount_amount')::numeric, 0),
      v_i
    );
    v_i := v_i + 1;
  END LOOP;

  UPDATE cash_challans SET
    customer_id = (p_challan->>'customer_id')::uuid,
    customer_name = p_challan->>'customer_name',
    customer_phone = NULLIF(p_challan->>'customer_phone', ''),
    status = p_challan->>'status',
    subtotal = (p_challan->>'subtotal')::numeric,
    discount_type = NULLIF(p_challan->>'discount_type', ''),
    discount_value = COALESCE((p_challan->>'discount_value')::numeric, 0),
    discount_amount = COALESCE((p_challan->>'discount_amount')::numeric, 0),
    shipping_charges = COALESCE((p_challan->>'shipping_charges')::numeric, 0),
    round_off = COALESCE((p_challan->>'round_off')::numeric, 0),
    total = (p_challan->>'total')::numeric,
    amount_paid = v_new_paid,
    payment_mode = NULLIF(p_challan->>'payment_mode', ''),
    payment_date = (NULLIF(p_challan->>'payment_date', ''))::date,
    notes = NULLIF(p_challan->>'notes', ''),
    tags = v_tags,
    is_return = COALESCE((p_challan->>'is_return')::boolean, false),
    modified_by = (p_challan->>'modified_by')::uuid,
    updated_at = NOW()
  WHERE id = p_challan_id;

  RETURN jsonb_build_object('id', p_challan_id, 'ok', true);
END;
$function$;
