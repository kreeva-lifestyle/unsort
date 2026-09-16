-- Voiding was two client writes with a hole between them, and it had no idea
-- about return credit. Voiding a return whose credit had already been applied
-- to a sale (apply_return_credit) left that sale paid by a credit that no
-- longer existed: the customer's balance was understated for good, and the
-- reversal row the client wrote described a cash refund that never happened.
-- The sale void also ran the "no money recorded" check on a page snapshot.
--
-- void_challan does it all in one transaction:
--   return  -> withdraw its credit from every sale it was applied to (the sale
--              goes back to partial/unpaid with a Return Credit reversal row),
--              reverse the return's own ledger (credit consumption and any
--              cash refund), then void it with amount_paid = 0 so header and
--              ledger agree.
--   sale    -> refused while any money is recorded (unpay first), else voided.
-- The lock triggers still decide whether a sealed handover period blocks any
-- of these writes; their message reaches the user unchanged.
-- SECURITY INVOKER: RLS still decides who may void.

CREATE OR REPLACE FUNCTION public.void_challan(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_c cash_challans%ROWTYPE;
  v_sale cash_challans%ROWTYPE;
  v_leg record;
  v_new_paid numeric;
  v_new_status text;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_batch text := 'VD-' || upper(to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'));
  v_withdrawn jsonb := '[]'::jsonb;
  v_refund numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to void a challan'; END IF;
  SELECT * INTO v_c FROM cash_challans WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Challan not found'; END IF;
  IF v_c.status = 'voided' THEN RAISE EXCEPTION 'Already voided' USING ERRCODE = '23514'; END IF;

  PERFORM set_config('app.challan_rpc', 'on', true);

  IF v_c.is_return THEN
    -- 1. Withdraw the credit from every sale it was applied to, net of any
    --    earlier withdrawal (reversal rows carry settled_against too).
    FOR v_leg IN
      SELECT p.challan_id, SUM(CASE WHEN p.is_reversal THEN -p.amount ELSE p.amount END) AS net
        FROM cash_challan_payments p
       WHERE p.settled_against = v_c.id AND p.challan_id <> v_c.id AND p.payment_mode = 'Return Credit'
       GROUP BY p.challan_id
      HAVING SUM(CASE WHEN p.is_reversal THEN -p.amount ELSE p.amount END) > 0
    LOOP
      SELECT * INTO v_sale FROM cash_challans WHERE id = v_leg.challan_id FOR UPDATE;
      IF NOT FOUND OR v_sale.status = 'voided' THEN CONTINUE; END IF;
      v_new_paid := GREATEST(round(COALESCE(v_sale.amount_paid, 0) - v_leg.net, 2), 0);
      v_new_status := CASE WHEN v_new_paid <= 0 THEN 'unpaid' WHEN v_new_paid < v_sale.total THEN 'partial' ELSE 'paid' END;
      UPDATE cash_challans SET
        amount_paid = v_new_paid, status = v_new_status,
        payment_mode = CASE WHEN v_new_paid <= 0 THEN NULL ELSE payment_mode END,
        payment_date = CASE WHEN v_new_paid <= 0 THEN NULL ELSE payment_date END,
        modified_by = auth.uid(), updated_at = now()
      WHERE id = v_sale.id;
      INSERT INTO cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal, settled_against)
      VALUES (v_sale.id, v_leg.net, 'Return Credit', v_today, auth.uid(),
              'Return #' || v_c.challan_number || ' voided — its credit withdrawn', v_batch, true, v_c.id);
      v_withdrawn := v_withdrawn || jsonb_build_object('challan_id', v_sale.id, 'challan_number', v_sale.challan_number, 'amount', v_leg.net, 'status', v_new_status);
    END LOOP;

    -- 2. Reverse the return's own ledger: the credit it consumed and any cash
    --    refund handed to the customer, one reversal row per payment mode.
    FOR v_leg IN
      SELECT payment_mode, SUM(CASE WHEN is_reversal THEN -amount ELSE amount END) AS net
        FROM cash_challan_payments WHERE challan_id = v_c.id
       GROUP BY payment_mode HAVING SUM(CASE WHEN is_reversal THEN -amount ELSE amount END) > 0
    LOOP
      INSERT INTO cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal)
      VALUES (v_c.id, v_leg.net, v_leg.payment_mode, v_today, auth.uid(),
              CASE WHEN v_leg.payment_mode = 'Return Credit'
                   THEN 'Return #' || v_c.challan_number || ' voided — credit consumption reversed'
                   ELSE 'Return #' || v_c.challan_number || ' voided — refund of ₹' || v_leg.net || ' received back' END,
              v_batch, true);
      IF v_leg.payment_mode <> 'Return Credit' THEN v_refund := v_refund + v_leg.net; END IF;
    END LOOP;

    -- 3. Void it. amount_paid goes to 0 so the header matches the ledger.
    UPDATE cash_challans SET status = 'voided', amount_paid = 0, voided_by = auth.uid(), voided_at = now(),
      modified_by = auth.uid(), updated_at = now()
    WHERE id = v_c.id;
  ELSE
    IF v_c.status = 'paid' THEN
      RAISE EXCEPTION 'Cannot void a fully paid challan — unpay it first' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(v_c.amount_paid, 0) > 0 THEN
      RAISE EXCEPTION 'Remove the ₹% payment on challan #% first, then void', v_c.amount_paid, v_c.challan_number USING ERRCODE = '23514';
    END IF;
    UPDATE cash_challans SET status = 'voided', voided_by = auth.uid(), voided_at = now(),
      modified_by = auth.uid(), updated_at = now()
    WHERE id = v_c.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'challan_number', v_c.challan_number, 'customer_name', v_c.customer_name,
    'total', v_c.total, 'is_return', v_c.is_return, 'inventory_deducted', v_c.inventory_deducted,
    'prev_status', v_c.status, 'prev_paid', COALESCE(v_c.amount_paid, 0),
    'credit_withdrawn', v_withdrawn, 'refund_reversed', v_refund, 'batch', v_batch);
END;
$function$;

REVOKE ALL ON FUNCTION public.void_challan(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.void_challan(uuid) TO authenticated;

COMMENT ON FUNCTION public.void_challan IS
  'Voids a challan in one transaction. A return first withdraws its applied credit from the sales it settled and reverses its own ledger; a sale must carry no payment.';
