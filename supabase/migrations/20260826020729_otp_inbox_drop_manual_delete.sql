-- Owner's call (2026-08-25): OTPs must survive their full 30-day retention —
-- no manual deletes. The x button is gone from the UI; dropping the policy
-- closes the API path too. The purge cron (service role) is unaffected.
drop policy if exists "Authenticated can delete otp" on public.otp_inbox;
