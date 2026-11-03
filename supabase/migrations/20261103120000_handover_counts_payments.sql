-- Cash handover counts each PAYMENT on the day it was received (owner, 2026-11-03).
--
-- Why: the handover used to add up each challan's whole amount_paid under the
-- challan's single payment_date — the date of its LATEST payment. Recording a
-- later payment therefore dragged money received in an earlier period into
-- the later one. Seen on 03 Nov: RAWLIKE's 2 Nov cash moved ₹13,300 of 27 Oct
-- return credit out of Sep–Oct, so a redo of HO-0015 showed ₹2,03,820, not
-- ₹2,17,120. Return credit was also counted as money in (and the return as
-- money out), which only cancelled when both landed in the same period.
--
-- Now (owner: "all payment modes we count"):
--   received = Σ payments on sales in the period, every money mode (Cash, UPI,
--              Bank Transfer, Cheque, Card, Other), reversals subtracting
--   refunds  = the same on return challans (money paid back)
--   Return Credit and Write-off rows are adjustments, not money: left out.
--   available = opening + received − refunds − expenses (as before for the
--              opening and expenses). Voided challans stay out, as before.
-- A confirmed handover stamps the payment rows it counted
-- (cash_challan_payments.handover_id), so each payment is handed over once.
-- Challans and expenses are still stamped as before — the challan stamp keeps
-- the existing edit locks and the "Handed over" badge.
--
-- Backfill: each confirmed handover gets the payment rows of the challans it
-- stamped, recorded before it was signed. Checked before applying: HO-0001…
-- HO-0013 each reproduce their signed amount exactly from those rows
-- (received − refunds − expenses), and Sep 7–Oct 30 comes out at ₹2,17,120.
-- Two old UPI payments (#30 ₹600, 13 May; #104 ₹3,250, 15 Jul) were never in
-- any handover under the old rule and stay unstamped, as before.

alter table public.cash_challan_payments
  add column if not exists handover_id uuid references public.cash_handovers(id) on delete set null;
create index if not exists idx_challan_payments_handover on public.cash_challan_payments (handover_id) where handover_id is not null;

-- Backfill (before the guard below exists).
update public.cash_challan_payments p
set handover_id = c.handover_id
from public.cash_challans c
join public.cash_handovers h on h.id = c.handover_id and h.status = 'confirmed'
where p.challan_id = c.id and p.handover_id is null and p.created_at <= h.confirmed_at;

-- A payment's handover link changes only inside the handover trigger, and a
-- payment already counted in a live handover cannot be edited or removed.
create or replace function public.guard_payment_handover()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.handover_id is not null and current_setting('app.challan_rpc', true) is distinct from 'on' then
      raise exception 'A payment cannot be created already handed over.' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.handover_id is distinct from old.handover_id
     and current_setting('app.challan_rpc', true) is distinct from 'on' then
    raise exception 'A payment''s cash-handover link cannot be changed directly.' using errcode = '42501';
  end if;
  if old.handover_id is not null
     and exists (select 1 from cash_handovers where id = old.handover_id and status in ('confirmed', 'pending'))
     and (tg_op = 'DELETE' or row(new.challan_id, new.amount, new.payment_mode, new.payment_date, new.is_reversal)
                                is distinct from row(old.challan_id, old.amount, old.payment_mode, old.payment_date, old.is_reversal)) then
    raise exception 'This payment is part of a signed cash handover and cannot be changed.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trg_guard_payment_handover on public.cash_challan_payments;
create trigger trg_guard_payment_handover before insert or update or delete on public.cash_challan_payments
  for each row execute function public.guard_payment_handover();

-- What a handover for this period would carry: the Cash Book's handover form
-- and the confirm trigger both use it, so they can never disagree.
create or replace function public.handover_breakdown(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = public as $$
  with pay as (
    select
      coalesce(sum(case when not c.is_return then case when p.is_reversal then -p.amount else p.amount end end), 0) as received,
      coalesce(sum(case when c.is_return then case when p.is_reversal then -p.amount else p.amount end end), 0) as refunds
    from cash_challan_payments p
    join cash_challans c on c.id = p.challan_id
    where p.handover_id is null
      and c.status <> 'voided'
      and p.payment_mode not in ('Return Credit', 'Write-off')
      and p.payment_date between p_from and p_to
  ), exp as (
    select coalesce(sum(amount), 0) as spent from cash_expenses
    where handover_id is null and date between p_from and p_to
  ), bal as (
    select opening_balance from cash_book_balances where date = p_from
  )
  select jsonb_build_object(
    'opening', coalesce((select opening_balance from bal), 0),
    'openingIsSet', exists (select 1 from bal),
    'cashSales', pay.received,
    'cashReturns', pay.refunds,
    'expenses', exp.spent,
    'previousHandovers', 0,
    'available', coalesce((select opening_balance from bal), 0) + pay.received - pay.refunds - exp.spent,
    'periodFrom', p_from,
    'periodTo', p_to)
  from pay, exp;
$$;
revoke all on function public.handover_breakdown(date, date) from public, anon;
grant execute on function public.handover_breakdown(date, date) to authenticated;

-- Confirm / release. Same shape as before; payments are stamped and released
-- too, and the carried-forward closing is the breakdown minus the amount.
create or replace function public.auto_rollforward_on_handover_confirm()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_from date;
  v_to date;
  next_day date;
  v_breakdown jsonb;
  closing numeric;
begin
  -- Release: a confirmed handover cancelled / disputed hands its cash back.
  if tg_op = 'UPDATE' and old.status = 'confirmed' and new.status in ('cancelled', 'disputed') then
    perform set_config('app.challan_rpc', 'on', true);
    update cash_challans set handover_id = null where handover_id = new.id;
    update cash_expenses set handover_id = null where handover_id = new.id;
    update cash_challan_payments set handover_id = null where handover_id = new.id;
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'confirmed' then
    null; -- proceed
  elsif tg_op = 'UPDATE' and old.status <> 'confirmed' and new.status = 'confirmed' then
    null; -- proceed
  else
    return new;
  end if;

  v_from := coalesce(new.period_from, new.date);
  v_to := coalesce(new.period_to, new.date);
  -- Read what is available BEFORE stamping (it counts only unstamped rows).
  v_breakdown := handover_breakdown(v_from, v_to);

  perform set_config('app.challan_rpc', 'on', true);
  update cash_challan_payments p set handover_id = new.id
    from cash_challans c
   where c.id = p.challan_id and p.handover_id is null and c.status <> 'voided'
     and p.payment_date between v_from and v_to;
  update cash_challans set handover_id = new.id
   where handover_id is null and status <> 'voided' and payment_date between v_from and v_to;
  update cash_expenses set handover_id = new.id
   where handover_id is null and date between v_from and v_to;

  next_day := v_to + interval '1 day';
  if exists (
    select 1 from cash_handovers
     where id <> new.id and status in ('confirmed', 'pending') and coalesce(period_from, date) = next_day
  ) then
    return new;
  end if;

  closing := (v_breakdown->>'available')::numeric - new.amount;
  insert into cash_book_balances (date, opening_balance) values (next_day, closing)
    on conflict (date) do update set opening_balance = excluded.opening_balance;
  return new;
end;
$function$;
