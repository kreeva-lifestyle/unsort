-- PackStation offline scans: the wait a phone reports (queued_ms) was capped
-- at 24 h, so a scan parked over a weekend got a made-up time exactly 24 h
-- before it reached the server — wrong in history, and with a long recording
-- buffer Pack Cam could even save footage of that made-up moment as its
-- video. The cap is now 7 days, longer than any recording the PC keeps
-- (buffer_hours <= 72): the real scan time is kept and such an old scan
-- simply finds no recording ("no video").
create or replace function public.packtime_scans_real_time()
 returns trigger language plpgsql set search_path = public
as $$
begin
  new.received_at := now();
  if new.queued_ms is not null and new.queued_ms > 2000 then
    new.scanned_at := now() - make_interval(secs => least(new.queued_ms, 604800000) / 1000.0);
  end if;
  return new;
end $$;
