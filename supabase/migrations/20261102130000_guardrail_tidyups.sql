-- Guardrail tidy-ups from the 2026-11-02 check (owner approved "Yes do it"):
--
-- 1. program-voice-notes bucket: uploads and deletes were open to ANY
--    signed-in account (auth_voice_upload / auth_voice_delete only checked the
--    bucket). The Programs screen is retired; keep the files but let only
--    active staff (admin/manager/operator) add or remove them.
-- 2. att_is_writer() and jw_change() had no fixed search_path (Supabase
--    security advisor 0011). Pin them to public, like every other function.
-- 3. challan_mode_payments() is unused since challan_mode_receipts()
--    replaced it (it could not be altered in place: new return type).

drop policy if exists auth_voice_upload on storage.objects;
drop policy if exists auth_voice_delete on storage.objects;
create policy "program-voice-notes staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'program-voice-notes' and (select public.app_is_staff()));
create policy "program-voice-notes staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'program-voice-notes' and (select public.app_is_staff()));

alter function public.att_is_writer() set search_path = public;
alter function public.jw_change(text, text, text) set search_path = public;

drop function if exists public.challan_mode_payments(text, date, date);
