-- Bulk Pay used to be a client loop: UPDATE the challan header to paid, then
-- INSERT the payment row, then (on failure) UPDATE the header back. The third
-- step is a paid -> unpaid transition outside an RPC, which
-- protect_challan_immutability refuses, so a failed payment insert left a
-- challan marked paid with no ledger row (the deferred ledger check only fires
-- on the payments table, so the bad header committed). The loop also computed
-- the outstanding amount from the page snapshot, so a colleague's partial
-- payment in between produced a payment row that no longer matched.
--
-- pay_challan_batch does the whole batch in one transaction: each challan is
-- locked, its outstanding is computed from the live row, the ledger is
-- pre-checked, and header + payment are written together. A challan that
-- cannot be paid (locked period, changed since selection, ledger drift) is
-- skipped with a reason instead of aborting the batch, so the caller can
-- report exactly what happened. Attribution comes from auth.uid(), never the
-- payload. SECURITY INVOKER: RLS still decides who may write.

CREATE OR REPLACE FUNCTION public.pay_challan_batch(
  p_ids uuid[],
  p_mode text,
  p_date date,
  p_batch_id text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_c record;
  v_outstanding numeric;
  v_ledger numeric;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to record payments'; END IF;
  IF COALESCE(btrim(p_mode), '') = '' THEN RAISE EXCEPTION 'Pick a payment mode' USING ERRCODE = '23514'; END IF;
  IF p_mode = 'Return Credit' THEN RAISE EXCEPTION 'Return Credit is reserved for credit applications' USING ERRCODE = '23514'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Pick a payment date' USING ERRCODE = '23514'; END IF;
  IF p_date > v_today THEN RAISE EXCEPTION 'Payment date cannot be in the future' USING ERRCODE = '23514'; END IF;
  IF COALESCE(btrim(p_batch_id), '') = '' THEN RAISE EXCEPTION 'Batch id is required' USING ERRCODE = '23514'; END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RAISE EXCEPTION 'Nothing to pay' USING ERRCODE = '23514'; END IF;

  PERFORM set_config('app.challan_rpc', 'on', true);

  FOREACH v_id IN ARRAY p_ids LOOP
    SELECT id, challan_number, status, is_return, total, COALESCE(amount_paid, 0) AS amount_paid
      INTO v_c FROM cash_challans WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'skipped', 'not found');
      CONTINUE;
    END IF;
    IF v_c.is_return THEN
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'is a return');
      CONTINUE;
    END IF;
    IF v_c.status NOT IN ('unpaid', 'partial') THEN
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'already ' || v_c.status);
      CONTINUE;
    END IF;
    v_outstanding := round(v_c.total - v_c.amount_paid, 2);
    IF v_outstanding <= 0 THEN
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'nothing outstanding');
      CONTINUE;
    END IF;
    -- The ledger must already agree with the header, otherwise the deferred
    -- sync check would abort the whole batch at commit with a message that
    -- names no challan.
    SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -amount ELSE amount END), 0) INTO v_ledger
      FROM cash_challan_payments WHERE challan_id = v_id;
    IF v_ledger IS DISTINCT FROM v_c.amount_paid THEN
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', 'payment ledger out of sync');
      CONTINUE;
    END IF;

    -- Each challan writes inside its own savepoint: a lock trigger refusing
    -- one challan (sealed handover period) must not undo the others.
    BEGIN
      UPDATE cash_challans SET
        status = 'paid', amount_paid = total, payment_mode = p_mode, payment_date = p_date,
        modified_by = auth.uid(), updated_at = now()
      WHERE id = v_id;
      INSERT INTO cash_challan_payments (challan_id, amount, payment_mode, payment_date, paid_by, notes, batch_id, is_reversal)
      VALUES (v_id, v_outstanding, p_mode, p_date, auth.uid(), NULLIF(p_note, ''), p_batch_id, false);
      v_results := v_results || jsonb_build_object(
        'challan_id', v_id, 'challan_number', v_c.challan_number,
        'prev_status', v_c.status, 'prev_paid', v_c.amount_paid, 'paid', v_outstanding, 'total', v_c.total);
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_build_object('challan_id', v_id, 'challan_number', v_c.challan_number, 'skipped', SQLERRM);
    END;
  END LOOP;

  RETURN v_results;
END;
$function$;

REVOKE ALL ON FUNCTION public.pay_challan_batch(uuid[], text, date, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pay_challan_batch(uuid[], text, date, text, text) TO authenticated;

COMMENT ON FUNCTION public.pay_challan_batch IS
  'Bulk Pay: marks each sales challan paid and writes its payment row in one transaction; skips (with a reason) any challan that cannot be paid. Undo via undo_challan_batch.';
