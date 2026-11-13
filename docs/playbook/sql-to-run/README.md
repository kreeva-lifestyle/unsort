# SQL waiting to be run

The SQL in this folder is written and tested, but **not applied to the live
database yet**. The automated path holds any SQL that contains a `delete`
for a confirmation that does not reach the owner's app, so it has to be run
by hand once:

1. Open the Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the whole file → **Run**. It only adds things; running it twice is harmless.
3. Tell Claude it is done. Claude checks it, moves the file to
   `supabase/migrations/` and ships the code that uses it.

Nothing is waiting right now.

The last file here, `20261113090000_pb_bulk_log_tags_stock.sql` (bulk-change
log, part 2: changes to the tag lists and a vendor's stock notice are
recorded and can be reverted), was run on the live database on 13 Nov 2026
and moved to `supabase/migrations/` with the code that uses it.
