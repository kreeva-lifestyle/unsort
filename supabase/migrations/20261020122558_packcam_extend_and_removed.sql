-- Pack Cam, two fixes from the floor:
--
-- 1. Long parcels: the video stopped at the "Longest video" limit while the
--    packer was still sealing. The packer can now press "+30 s" on the
--    countdown: packtime_extend_scan adds the time to that scan
--    (extend_seconds, at most 10 minutes in all, only within 30 minutes of the
--    scan) and stamps received_at = now(), so the office PC, which reads scans
--    by received_at, picks the change up on its next poll and cuts that
--    parcel's video longer. SECURITY INVOKER: the existing "Operator+ can
--    write" policy on packtime_scans decides who may extend.
--
-- 2. Videos moved off the PC by hand kept showing "Saved". The PC now
--    reports them and the clip becomes status 'removed' (when no Dropbox /
--    Drive copy is left). 'deleted' stays allowed: one old row still has it.
alter table public.packtime_scans add column extend_seconds smallint not null default 0;

create or replace function public.packtime_extend_scan(p_scan uuid, p_seconds integer)
 returns smallint language sql security invoker set search_path = public as $$
  update public.packtime_scans
     set extend_seconds = least(extend_seconds + greatest(0, least(p_seconds, 120)), 600),
         received_at = now()
   where id = p_scan and scanned_at > now() - interval '30 minutes'
  returning extend_seconds
$$;
revoke all on function public.packtime_extend_scan(uuid, integer) from public, anon;
grant execute on function public.packtime_extend_scan(uuid, integer) to authenticated;

alter table public.packcam_clips drop constraint packcam_clips_status_check;
alter table public.packcam_clips add constraint packcam_clips_status_check
  check (status = any (array['queued', 'cutting', 'uploading', 'done', 'failed', 'missing', 'removed', 'deleted']));
