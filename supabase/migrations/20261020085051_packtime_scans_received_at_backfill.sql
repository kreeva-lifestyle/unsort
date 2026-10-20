-- PackStation: scans saved before packtime_scans_real_scan_time got the
-- migration's own time as received_at (the column default ran once for every
-- existing row). Pack Cam reads new scans by received_at, so an office PC
-- coming back online would see all ~4,300 old scans as "new" at once.
-- For those rows the server got the scan when it was scanned: copy scanned_at.
-- Only rows from before that migration are touched (received_at equal to its
-- timestamp, no queued_ms); scans after it keep the trigger's value.
update public.packtime_scans
   set received_at = scanned_at
 where queued_ms is null
   and received_at = '2026-10-20 07:47:37.502127+00'
   and scanned_at < received_at;
