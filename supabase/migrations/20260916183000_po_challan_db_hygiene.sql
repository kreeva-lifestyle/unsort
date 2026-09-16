-- Database hygiene from the Purchase Order / Cash Challan audit.
--
-- 1. Grants were wider than the policies: the anon role held INSERT, UPDATE,
--    DELETE and TRUNCATE on the three PO tables, po_vendors and
--    cash_challan_payments, and UPDATE/DELETE/TRUNCATE on audit_log;
--    authenticated held TRUNCATE on the PO tables, po_vendors and audit_log.
--    RLS blocked the row operations, but TRUNCATE is not subject to RLS.
--    The app never writes as anon; revoke all of it.
-- 2. get_own_pin() was a SECURITY DEFINER function that handed the caller
--    their own bcrypt PIN hash (offline brute force of a 4-6 digit PIN is
--    trivial). Nothing calls it — the app uses check_pin_exists, set_own_pin,
--    verify_own_pin and confirm_handover. Dropped.
-- 3. prevent_locked_challan_mutation had no fixed search_path (Supabase
--    advisor warning). Same body, search_path pinned.
-- 4. Indexes for the filters the UI actually runs: audit_log lookups by
--    (module, record_id) newest first; the challan tag filter (tags @>);
--    the PO list's vendor_name ilike '%…%' search.

revoke insert, update, delete, truncate on
  public.purchase_orders, public.purchase_order_items, public.purchase_order_receipts,
  public.po_vendors, public.cash_challan_payments
from anon;
revoke update, delete, truncate on public.audit_log from anon;
revoke truncate on
  public.purchase_orders, public.purchase_order_items, public.purchase_order_receipts,
  public.po_vendors, public.audit_log
from authenticated;

drop function if exists public.get_own_pin();

create or replace function public.prevent_locked_challan_mutation()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  old_locked boolean := false;
  new_locked boolean := false;
begin
  -- handover_id may only change through the rollforward path.
  if tg_op = 'UPDATE'
     and (new.handover_id is distinct from old.handover_id)
     and current_setting('app.challan_rpc', true) is distinct from 'on' then
    raise exception 'A challan''s cash-handover link cannot be changed directly.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    -- Unchanged financial fields (notes/stamp-only edits) are always fine.
    if new.status = old.status
       and new.amount_paid is not distinct from old.amount_paid
       and new.payment_mode is not distinct from old.payment_mode
       and new.payment_date is not distinct from old.payment_date
       and new.total = old.total
       and new.is_return = old.is_return then
      return new;
    end if;
  end if;

  -- (a) old side: locked only if this row's money was actually COUNTED —
  -- stamped into a live handover, or paid/partial with a payment_date
  -- inside a sealed period. A NULL payment_date was never counted.
  if old.handover_id is not null and exists (
    select 1 from cash_handovers
    where id = old.handover_id and status in ('confirmed', 'pending')
  ) then
    old_locked := true;
  elsif old.status in ('paid', 'partial') and old.payment_date is not null then
    old_locked := exists (
      select 1 from cash_handovers
      where status in ('confirmed', 'pending')
        and coalesce(period_from, date) <= old.payment_date
        and coalesce(period_to, date) >= old.payment_date);
  end if;

  -- (b) new side: locked only if the row WOULD be counted inside a sealed
  -- period (paid/partial with a payment_date in one).
  if tg_op = 'UPDATE' and new.status in ('paid', 'partial') and new.payment_date is not null then
    new_locked := exists (
      select 1 from cash_handovers
      where status in ('confirmed', 'pending')
        and coalesce(period_from, date) <= new.payment_date
        and coalesce(period_to, date) >= new.payment_date);
  end if;

  if old_locked or new_locked then
    raise exception 'Cannot % challan #% — its paid amount is (or would be) counted inside a confirmed or pending cash handover period.',
      case when tg_op = 'DELETE' then 'delete' else 'modify' end,
      old.challan_number
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

create index if not exists idx_audit_module_record on public.audit_log (module, record_id, created_at desc);
create index if not exists idx_cash_challans_tags on public.cash_challans using gin (tags);
create index if not exists idx_purchase_orders_vendor_name_trgm on public.purchase_orders using gin (vendor_name gin_trgm_ops);

-- inr_text (20260916143000) was created without a pinned search_path — the
-- advisor flagged it the same way. It touches no tables, but pin it anyway.
alter function public.inr_text(numeric) set search_path = 'public';
