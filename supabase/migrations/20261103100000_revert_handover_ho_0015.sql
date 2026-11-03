-- One-off data fix, owner's request 2026-11-03: revert signed handover HO-0015
-- (₹2,17,120, Aishwarya → Manthan, 7 Sep – 30 Oct). Manthan signed it
-- without checking it; it was also created before HO-0013 was signed, so the
-- ₹346 carried from HO-0013 was not in its opening.
--
-- A signed handover is a permanent record: trg_prevent_confirmed_handover_
-- mutation refuses any status change. The owner (an admin, and the person who
-- signed it) asked for this one to be undone, so that guard is switched off for
-- this statement only and back on in the same transaction. The row is kept and
-- marked Cancelled with the reason, not deleted.
--
-- trg_auto_rollforward's release branch (confirmed -> cancelled) clears
-- handover_id on its 87 challans and 26 expenses, so that cash is available
-- again and the period can be handed over afresh. On a fresh database this
-- finds no row and changes nothing.

alter table public.cash_handovers disable trigger trg_prevent_confirmed_handover_mutation;

select set_config('app.handover_rpc', 'on', true);

update public.cash_handovers
set status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = '92f740fa-df66-47ac-a703-5250e2e74af9',
    notes = concat_ws(' · ', notes, 'Cancelled after signing on the owner''s request (03 Nov 2026): signed without checking')
where handover_number = 15 and status = 'confirmed';

alter table public.cash_handovers enable trigger trg_prevent_confirmed_handover_mutation;

insert into public.audit_log (action, module, details, user_id)
select 'cancel', 'cash_book',
       'Signed handover HO-0015 of ₹2,17,120 (Aishwarya → Manthan, 07 Sep–30 Oct) reverted on owner request: signed without checking',
       '92f740fa-df66-47ac-a703-5250e2e74af9'
where exists (select 1 from public.cash_handovers where handover_number = 15 and status = 'cancelled');
