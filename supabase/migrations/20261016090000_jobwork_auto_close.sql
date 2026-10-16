-- Jobwork auto-close (owner's ask, 16 Oct 2026): "whichever is unpaid and all
-- received should show in Open; once paid, auto complete it. Whichever is
-- nothing billed and all received should auto close and show in Completed."
--
-- A job closes itself the moment ALL of these hold:
--   * it is open;
--   * nothing is still with the jobworker (pieces - OK - rejected + rework <= 0);
--   * no rejected pieces are held here waiting to go back for rework — those
--     still need a decision (send for rework, or close by hand), and closing
--     would lock the job against the rework send-out;
--   * nothing is owed: bill (OK x rate) - paid <= 0 — covers both "paid in
--     full" and "nothing to bill" (rate 0).
-- Material balances do NOT hold a job open: material sent is mostly used up,
-- so "sent - returned - used" is rarely exactly 0 and would keep every
-- material job open forever.
--
-- When it runs: after a movement or a payment is recorded, and after the
-- job's pieces or rate change (each a deferred constraint trigger, so a
-- movement's material lines exist by then and the job row is re-read at
-- commit). A deleted payment never reopens a job; the app shows a closed job
-- that still owes money on the Open tab, where it can be paid.
--
-- An admin can still reopen a job; it stays open until the next movement,
-- payment or edit, which re-runs the check.

create or replace function public.jobwork_try_autoclose(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o jobwork_orders%rowtype; v_ok numeric; v_rej numeric; v_rew numeric; v_paid numeric; v_bill numeric;
begin
  select * into o from jobwork_orders where id = p_order for update;
  if not found or o.status <> 'open' then return; end if;
  select coalesce(sum(pcs_ok), 0), coalesce(sum(pcs_rejected), 0), coalesce(sum(pcs_rework), 0)
    into v_ok, v_rej, v_rew from jobwork_entries where order_id = p_order;
  if o.pieces - v_ok - v_rej + v_rew > 0 then return; end if;   -- still with the jobworker
  if v_rej - v_rew > 0 then return; end if;                      -- rejected pieces held for rework
  select coalesce(sum(amount), 0) into v_paid from jobwork_payments where order_id = p_order;
  v_bill := round(v_ok * o.rate, 2);
  if v_bill - v_paid > 0 then return; end if;                    -- money still owed
  update jobwork_orders set status = 'closed',
    close_reason = case when v_bill > 0 then 'Auto-closed — all received and paid in full'
                        else 'Auto-closed — all received, nothing to bill' end,
    closed_at = now(), closed_by = auth.uid()
  where id = p_order;
  perform audit_write('jobwork', 'CLOSED', p_order::text,
    'JW #' || o.jw_number || ' — open → closed automatically (' ||
    case when v_bill > 0 then 'all received, paid in full' else 'all received, nothing to bill' end || ')');
end $$;
revoke execute on function public.jobwork_try_autoclose(uuid) from public, anon, authenticated;

create or replace function public.jobwork_autoclose_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- jobwork_orders rows have no order_id: branch, never one CASE over both
  -- (plpgsql resolves new.order_id even in the untaken arm and fails).
  if tg_table_name = 'jobwork_orders' then perform jobwork_try_autoclose(new.id);
  else perform jobwork_try_autoclose(new.order_id); end if;
  return null;
end $$;
revoke execute on function public.jobwork_autoclose_trg() from public, anon, authenticated;

create constraint trigger trg_jobwork_entries_autoclose after insert on public.jobwork_entries
  deferrable initially deferred for each row execute function jobwork_autoclose_trg();
create constraint trigger trg_jobwork_payments_autoclose after insert on public.jobwork_payments
  deferrable initially deferred for each row execute function jobwork_autoclose_trg();
create constraint trigger trg_jobwork_orders_autoclose after update of pieces, rate on public.jobwork_orders
  deferrable initially deferred for each row
  when (new.status = 'open' and (old.pieces is distinct from new.pieces or old.rate is distinct from new.rate))
  execute function jobwork_autoclose_trg();

comment on function public.jobwork_try_autoclose(uuid) is 'Closes an open job that is fully received, holds no rejected pieces for rework, and owes nothing (paid in full or nothing to bill). Called by deferred triggers only.';

-- "What was received on a date" (Jobwork → Received on) reads entries by
-- (kind, entry_date).
create index if not exists jobwork_entries_kind_date_idx on public.jobwork_entries (kind, entry_date);

-- Jobs that already qualify (none on 16 Oct 2026: every fully received open
-- job still has money due).
select jobwork_try_autoclose(id) from jobwork_orders where status = 'open';
