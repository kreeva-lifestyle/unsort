-- Cash handover "up to a date" (owner, 2026-11-04).
--
-- Owner's rule: a handover has no FROM date. It takes every payment and every
-- expense not yet handed over, dated up to the chosen date — so a payment
-- entered late (after a handover was signed, or dated back) is never left
-- out: the next handover picks it up. Each payment / expense a signed
-- handover counted carries that handover's id (stamped at signing), shown in
-- the app as its HO number.
--
-- Why: the two payments ever missed (#30 ₹600 13 May — challan saved without
-- a date; #104 ₹3,250 15 Jul — entered 2h after HO-9 for 7–15 Jul was signed
-- that same afternoon) both fell between fixed FROM–TO windows. With
-- "everything not yet handed over, up to TO" they would have gone into the
-- next handover. They will go into the next one now.
--
-- 1. handover_breakdown_upto(p_to, p_asof): unstamped money payments (every
--    mode except Return Credit / Write-off; reversals negative; refunds on
--    returns subtract; voided challans out) and unstamped expenses dated
--    <= p_to, optionally only rows recorded by p_asof. Opening = the balance
--    carried to the day after the last signed handover. periodFrom = that
--    day (kept for the record and the lock rules); 'earlier' / 'earlierCount'
--    = late-entered rows dated before it, shown to the user.
-- 2. Confirm trigger: re-reads the breakdown as of the moment the handover
--    was CREATED. If it no longer matches what the sender saw (an expense
--    edited or deleted meanwhile), or the amount exceeds it, signing is
--    refused ("nothing was saved"). Then stamps exactly those rows — payments
--    and expenses recorded after the handover was created wait for the next
--    one. Challans are stamped only when fully paid, so a part-paid bill can
--    still take its remaining payment later.
-- 3. Date locks are replaced by stamp locks: new payments and expenses may
--    be dated inside an already handed-over period (they flow to the next
--    handover); what a signed / pending handover counted stays untouchable
--    (guard_payment_handover for payments; stamped challans and expenses).

create or replace function public.handover_breakdown_upto(p_to date, p_asof timestamptz default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with last as (
    select max(period_to) as t from cash_handovers where status = 'confirmed'
  ), pays as (
    select p.payment_date as d, c.is_return, (case when p.is_reversal then -1 else 1 end) * p.amount as amt
    from cash_challan_payments p
    join cash_challans c on c.id = p.challan_id
    where p.handover_id is null and c.status <> 'voided'
      and p.payment_mode not in ('Return Credit', 'Write-off')
      and p.payment_date <= p_to
      and (p_asof is null or p.created_at <= p_asof)
  ), exps as (
    select date as d, amount from cash_expenses
    where handover_id is null and date <= p_to
      and (p_asof is null or created_at <= p_asof)
  ), frm as (
    select coalesce((select t from last) + 1, least((select min(d) from pays), (select min(d) from exps), p_to)) as f
  ), bal as (
    select b.opening_balance from cash_book_balances b, frm where b.date = frm.f
  ), sums as (
    select
      coalesce((select sum(amt) from pays where not is_return), 0) as received,
      coalesce((select sum(amt) from pays where is_return), 0) as refunds,
      coalesce((select sum(amount) from exps), 0) as spent,
      coalesce((select opening_balance from bal), 0) as opening,
      coalesce((select sum(case when is_return then -amt else amt end) from pays, frm where d < frm.f), 0)
        - coalesce((select sum(amount) from exps, frm where d < frm.f), 0) as earlier,
      (select count(*) from pays, frm where d < frm.f) + (select count(*) from exps, frm where d < frm.f) as earlier_n
  )
  select jsonb_build_object(
    'opening', s.opening,
    'openingIsSet', exists (select 1 from bal),
    'cashSales', s.received,
    'cashReturns', s.refunds,
    'expenses', s.spent,
    'previousHandovers', 0,
    'available', s.opening + s.received - s.refunds - s.spent,
    'periodFrom', (select f from frm),
    'periodTo', p_to,
    'earlier', s.earlier,
    'earlierCount', s.earlier_n)
  from sums s;
$$;
revoke all on function public.handover_breakdown_upto(date, timestamptz) from public, anon;
grant execute on function public.handover_breakdown_upto(date, timestamptz) to authenticated;

create or replace function public.auto_rollforward_on_handover_confirm()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_to date;
  next_day date;
  v_now jsonb;
  v_saw numeric;
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

  v_to := coalesce(new.period_to, new.date);
  -- What the sender saw: everything recorded by the time the handover was created.
  v_now := handover_breakdown_upto(v_to, new.created_at);
  v_saw := nullif(new.breakdown->>'available', '')::numeric;
  if v_saw is not null and abs(v_saw - (v_now->>'available')::numeric) > 0.009 then
    raise exception 'Cash in HO-% changed after it was created (₹% then, ₹% now) — nothing was saved. Cancel it and create a fresh handover.',
      lpad(new.handover_number::text, 4, '0'), v_saw, (v_now->>'available')::numeric using errcode = 'P0001';
  end if;
  if new.amount > (v_now->>'available')::numeric + 0.009 then
    raise exception 'HO-% is for ₹% but only ₹% is available — nothing was saved. Cancel it and create a fresh handover.',
      lpad(new.handover_number::text, 4, '0'), new.amount, (v_now->>'available')::numeric using errcode = 'P0001';
  end if;

  perform set_config('app.challan_rpc', 'on', true);
  update cash_challan_payments p set handover_id = new.id
    from cash_challans c
   where c.id = p.challan_id and p.handover_id is null and c.status <> 'voided'
     and p.payment_date <= v_to and p.created_at <= new.created_at;
  update cash_expenses set handover_id = new.id
   where handover_id is null and date <= v_to and created_at <= new.created_at;
  -- Fully paid bills whose money is now all handed over get the badge / lock.
  update cash_challans c set handover_id = new.id
   where c.handover_id is null and c.status = 'paid' and c.payment_date <= v_to
     and (not c.is_return or coalesce(c.amount_paid, 0) >= c.total)
     and not exists (select 1 from cash_challan_payments p where p.challan_id = c.id and p.handover_id is null);

  next_day := v_to + interval '1 day';
  if exists (
    select 1 from cash_handovers
     where id <> new.id and status in ('confirmed', 'pending') and coalesce(period_from, date) = next_day
  ) then
    return new;
  end if;
  closing := (v_now->>'available')::numeric - new.amount;
  insert into cash_book_balances (date, opening_balance) values (next_day, closing)
    on conflict (date) do update set opening_balance = excluded.opening_balance;
  return new;
end;
$function$;

-- New money may be dated inside a handed-over period: the next handover
-- picks it up. (Kept as a no-op: pay_challan_batch, settle_return_refund and
-- prevent_backdated_challan_payment still call it.)
create or replace function public.challan_check_handover_open(p_date date)
returns void language plpgsql set search_path to 'public' as $$
begin
  return;
end $$;

create or replace function public.prevent_locked_challan_payment_insert()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  return new; -- counted payments are protected by guard_payment_handover instead
end $$;

create or replace function public.prevent_backdated_expense_insert()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  return new; -- a late expense goes into the next handover
end $$;

-- An expense a live (signed or pending-and-counted) handover counted cannot change.
create or replace function public.prevent_locked_expense_mutation()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  if tg_op = 'UPDATE' then
    if new.date = old.date and new.amount = old.amount then return new; end if;
  end if;
  if old.handover_id is not null and exists (
    select 1 from cash_handovers where id = old.handover_id and status in ('confirmed', 'pending')
  ) then
    raise exception 'Cannot % this expense — it is part of a signed cash handover and is locked. Record a correction instead.',
      case when tg_op = 'DELETE' then 'delete' else 'modify' end using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

-- A challan is locked only when a signed handover stamped it (fully paid and
-- handed over). Dates alone no longer lock: a part-paid bill can take its
-- remaining payment, and a late entry goes into the next handover.
create or replace function public.prevent_locked_challan_mutation()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if tg_op = 'UPDATE'
     and (new.handover_id is distinct from old.handover_id)
     and current_setting('app.challan_rpc', true) is distinct from 'on' then
    raise exception 'A challan''s cash-handover link cannot be changed directly.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.status = old.status
       and new.amount_paid is not distinct from old.amount_paid
       and new.payment_mode is not distinct from old.payment_mode
       and new.payment_date is not distinct from old.payment_date
       and new.total = old.total
       and new.is_return = old.is_return then
      return new;
    end if;
  end if;
  if old.handover_id is not null and exists (
    select 1 from cash_handovers where id = old.handover_id and status in ('confirmed', 'pending')
  ) then
    raise exception 'Cannot % challan #% — its paid amount is (or would be) counted inside a confirmed or pending cash handover period.',
      case when tg_op = 'DELETE' then 'delete' else 'modify' end, old.challan_number using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;
