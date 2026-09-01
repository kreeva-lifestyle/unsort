-- Owner delegated the cadence ("once a day or 3 or 7 days - you decide"):
-- daily it is. The recount is a tiny aggregate over ~a month of POs, and a
-- rolling 30-day window drifts if refreshed only every 4 days.
-- cron.schedule() upserts by jobname - this reschedules po-top-vendors in
-- place, keeping the same command.
select cron.schedule('po-top-vendors', '20 3 * * *', (select command from cron.job where jobname = 'po-top-vendors'));
