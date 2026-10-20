-- PackStation: a scan made while the phone was offline keeps the time it was
-- really scanned, not the time it finally reached the server.
--
-- Why: scanned_at defaulted to now() at insert. A phone that lost Wi-Fi for
-- 10 minutes sent its queued scans together on reconnect, so they all got the
-- reconnect time — and Pack Cam cut a few seconds of whatever was on the
-- table then as each of those parcels' "packing video".
--
-- How, without trusting the phone's clock: the phone sends queued_ms = how
-- long the scan waited on the phone (its own clock, start and end, so its
-- clock being wrong cancels out). The server sets scanned_at = now() -
-- queued_ms, capped at 24 h. Scans sent at once (queued_ms <= 2 s) keep
-- now(). received_at = when the server got it: the Pack Cam agent reads new
-- scans by received_at, so a late scan with an old scanned_at is not skipped.
alter table public.packtime_scans add column received_at timestamptz not null default now();
alter table public.packtime_scans add column queued_ms integer;
create index packtime_scans_received_idx on public.packtime_scans (received_at);

create or replace function public.packtime_scans_real_time()
 returns trigger language plpgsql set search_path = public
as $$
begin
  new.received_at := now();
  if new.queued_ms is not null and new.queued_ms > 2000 then
    new.scanned_at := now() - make_interval(secs => least(new.queued_ms, 86400000) / 1000.0);
  end if;
  return new;
end $$;
create trigger trg_packtime_scans_real_time before insert on public.packtime_scans
  for each row execute function public.packtime_scans_real_time();
