-- OTP retention: 24 hours -> 30 days (owner's call, 2026-08-25).
-- Delivery codes (e.g. Shadowfax) are needed days after arrival, so the
-- inbox keeps every OTP for a month; this cron is the only thing that
-- deletes them automatically. cron.schedule() upserts by jobname, so this
-- replaces the existing purge-otp-inbox command in place.
select cron.schedule(
  'purge-otp-inbox',
  '50 3 * * *',
  $$delete from public.otp_inbox where received_at < now() - interval '30 days'$$
);
