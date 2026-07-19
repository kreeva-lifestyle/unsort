-- Apply a return's credit against a same-customer outstanding sales challan.
--
-- Why: a customer's return (e.g. ₹2,000) should be usable to pay down their
-- outstanding sales challan (e.g. ₹5,000 → ₹3,000 pending) without cash
-- moving. The bulk-pay flow can only net FULLY (marks the sale paid); this
-- RPC supports partial application with correct status transitions.
--
-- Handover correctness: the application is recorded as TWO legs dated the
-- same day inside ONE transaction — a 'Return Credit' payment on the sale
-- (+X collections) and a credit consumption on the return (+X returns-side).
-- The cash-handover formula (collections − consumed returns, summed by
-- payment_date window) therefore nets to ZERO: no phantom cash ever enters
-- a handover, matching the fact that no cash moved.
--
-- Guards:
--   * row-locks BOTH challans in deterministic id order (no deadlocks),
--     re-checks credit/outstanding inside the lock (no double-spend);
--   * same customer only (credit belongs to the return's customer);
--   * amount capped at LEAST(remaining credit, pending amount);
--   * a return partly consumed inside a signed/pending handover period is
--     blocked from further consumption (challan-level dates cannot split
--     one credit across two handover periods — permanent fix arrives with
--     payment-level handover membership);
--   * pre-checks both payment ledgers reconcile so the sync trigger cannot
--     fail halfway with a confusing message;
--   * both payment rows carry mode 'Return Credit', a shared RC- batch id,
--     and settled_against cross-references for machine-readable tracing.

-- Traceability: which counterpart challan a settlement payment row belongs to.
ALTER TABLE public.cash_challan_payments
  ADD COLUMN IF NOT EXISTS settled_against uuid REFERENCES public.cash_challans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cash_challan_payments_settled_against_idx
  ON public.cash_challan_payments (settled_against) WHERE settled_against IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_return_credit(
  p_return_id uuid, p_challan_id uuid, p_amount numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role text; v_active boolean;
  v_ret cash_challans%ROWTYPE; v_sale cash_challans%ROWTYPE;
  v_credit numeric; v_outstanding numeric; v_amount numeric;
  v_batch text; v_new_paid numeric; v_sale_sum numeric; v_ret_sum numeric;
BEGIN
  SELECT role, is_active INTO v_role, v_active FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_active IS DISTINCT FROM true OR v_role NOT IN ('admin','manager','operator') THEN
    RAISE EXCEPTION 'Only admin/manager/operator can apply return credit';
  END IF;
  IF p_return_id = p_challan_id THEN RAISE EXCEPTION 'Pick two different records'; END IF;

  -- Deterministic lock order avoids deadlocks between concurrent applications.
  IF p_return_id < p_challan_id THEN
    SELECT * INTO v_ret  FROM cash_challans WHERE id = p_return_id  FOR UPDATE;
    SELECT * INTO v_sale FROM cash_challans WHERE id = p_challan_id FOR UPDATE;
  ELSE
    SELECT * INTO v_sale FROM cash_challans WHERE id = p_challan_id FOR UPDATE;
    SELECT * INTO v_ret  FROM cash_challans WHERE id = p_return_id  FOR UPDATE;
  END IF;
  IF v_ret.id  IS NULL THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF v_sale.id IS NULL THEN RAISE EXCEPTION 'Challan not found'; END IF;
  IF v_ret.is_return IS DISTINCT FROM true THEN RAISE EXCEPTION 'Not a return challan'; END IF;
  IF v_sale.is_return THEN RAISE EXCEPTION 'Credit can only be applied to a sales challan'; END IF;
  IF v_ret.status = 'voided' OR v_sale.status = 'voided' THEN RAISE EXCEPTION 'Voided challans cannot be settled'; END IF;
  IF v_sale.status NOT IN ('unpaid','partial') THEN RAISE EXCEPTION 'Challan #% has no pending amount', v_sale.challan_number; END IF;

  -- Same customer only: the credit belongs to the return's customer.
  IF NOT (
    (v_ret.customer_id IS NOT NULL AND v_ret.customer_id = v_sale.customer_id)
    OR (v_ret.customer_id IS NULL AND v_sale.customer_id IS NULL
        AND btrim(lower(COALESCE(v_ret.customer_name,''))) <> ''
        AND btrim(lower(COALESCE(v_ret.customer_name,''))) = btrim(lower(COALESCE(v_sale.customer_name,''))))
  ) THEN
    RAISE EXCEPTION 'Return credit can only go to the same customer''s challan';
  END IF;

  v_credit := v_ret.total - COALESCE(v_ret.amount_paid, 0);
  v_outstanding := v_sale.total - COALESCE(v_sale.amount_paid, 0);
  IF v_credit <= 0 THEN RAISE EXCEPTION 'This return''s credit is already fully used'; END IF;
  IF v_outstanding <= 0 THEN RAISE EXCEPTION 'Challan #% has no pending amount', v_sale.challan_number; END IF;
  v_amount := COALESCE(p_amount, LEAST(v_credit, v_outstanding));
  IF v_amount <= 0 OR v_amount > LEAST(v_credit, v_outstanding) THEN
    RAISE EXCEPTION 'Amount exceeds the remaining credit or the pending amount';
  END IF;

  -- Challan-level dates cannot split one credit across two handover periods:
  -- once part of this return's consumption is locked in a signed/pending
  -- handover, further consumption must wait (payment-level membership fixes
  -- this permanently).
  IF COALESCE(v_ret.amount_paid, 0) > 0 AND EXISTS (
    SELECT 1 FROM cash_handovers
    WHERE status IN ('confirmed','pending')
      AND COALESCE(period_from, date) <= COALESCE(v_ret.payment_date, v_ret.created_at::date)
      AND COALESCE(period_to,   date) >= COALESCE(v_ret.payment_date, v_ret.created_at::date)
  ) THEN
    RAISE EXCEPTION 'Part of this return was settled inside a confirmed or pending cash handover period — its remaining credit cannot be applied yet.';
  END IF;

  -- Both ledgers must reconcile BEFORE we write, so the payment-sync trigger
  -- cannot abort halfway with a confusing message.
  SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -amount ELSE amount END),0) INTO v_sale_sum FROM cash_challan_payments WHERE challan_id = v_sale.id;
  SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -amount ELSE amount END),0) INTO v_ret_sum  FROM cash_challan_payments WHERE challan_id = v_ret.id;
  IF v_sale_sum IS DISTINCT FROM COALESCE(v_sale.amount_paid,0) THEN RAISE EXCEPTION 'Challan #% payment ledger is out of sync', v_sale.challan_number; END IF;
  IF v_ret_sum  IS DISTINCT FROM COALESCE(v_ret.amount_paid,0)  THEN RAISE EXCEPTION 'Return #% payment ledger is out of sync', v_ret.challan_number; END IF;

  v_batch := 'RC-' || upper(to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'));
  PERFORM set_config('app.challan_rpc', 'on', true);

  -- Leg 1: pay down the sale (challan first, then its payment row, so the
  -- sync trigger always sees a reconciled ledger).
  v_new_paid := COALESCE(v_sale.amount_paid,0) + v_amount;
  UPDATE cash_challans SET
    status = CASE WHEN v_new_paid >= v_sale.total THEN 'paid' ELSE 'partial' END,
    amount_paid = v_new_paid, payment_mode = 'Return Credit',
    payment_date = current_date, modified_by = auth.uid(), updated_at = now()
  WHERE id = v_sale.id;
  INSERT INTO cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, settled_against)
  VALUES (v_sale.id, v_amount, 'Return Credit', current_date, auth.uid(),
          'Return credit from #' || v_ret.challan_number || ' applied', v_batch, v_ret.id);

  -- Leg 2: consume the return's credit (same day, so both legs land in the
  -- same handover period and net to zero).
  UPDATE cash_challans SET
    amount_paid = COALESCE(amount_paid,0) + v_amount, payment_mode = 'Return Credit',
    payment_date = current_date, modified_by = auth.uid(), updated_at = now()
  WHERE id = v_ret.id;
  INSERT INTO cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, settled_against)
  VALUES (v_ret.id, v_amount, 'Return Credit', current_date, auth.uid(),
          'Credit applied to challan #' || v_sale.challan_number, v_batch, v_sale.id);

  RETURN jsonb_build_object('ok', true, 'applied', v_amount, 'batch', v_batch,
    'challan_number', v_sale.challan_number, 'return_number', v_ret.challan_number,
    'challan_pending', v_sale.total - v_new_paid,
    'credit_remaining', v_credit - v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_return_credit(uuid, uuid, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.apply_return_credit(uuid, uuid, numeric) TO authenticated;
