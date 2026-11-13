#!/bin/bash
# Playbook's SQL (the copy rules, the bulk-change log, the photo edit), tried on a throwaway PostgreSQL (never on the live database).
# Needs a server:  PGHOST / PGPORT / PGUSER as usual (defaults: localhost, 54329, postgres).
# It builds a database "pbt" with a minimal copy of the Playbook tables (bootstrap.sql), loads the
# repository's real tag, copy-rule, stock and bulk-log SQL, then runs the scenarios: a change is made the
# way the server makes it (the x-pb-bulk header set), previewed, reverted, and compared with the start.
# Pass more .sql files to load after the standard ones (e.g. one waiting in docs/playbook/sql-to-run/).
# t_dups.sql checks itself (every line is "ok …" or "FAIL …"): this script ends with status 1 when a FAIL
# is printed, when a standard file does not load, or when that test printed nothing. The GitHub workflow
# "Playbook SQL tests" runs it on every change to the SQL. The older scenarios print their result for reading.
cd "$(dirname "$0")/../../.." || exit 1
T=supabase/tests/sql; M=supabase/migrations
bad=0
P0="psql -h ${PGHOST:-localhost} -p ${PGPORT:-54329} -U ${PGUSER:-postgres} -q"
$P0 -c "drop database if exists pbt" -c "create database pbt" 2>&1 | grep -i error
P="$P0 -d pbt"
export PGOPTIONS="-c check_function_bodies=off -c client_min_messages=warning"
for f in $T/bootstrap.sql $M/20261110090000_pb_tags.sql $M/20261112150000_pb_duplicates.sql $M/20261112170000_pb_photo_prints.sql $M/20261113040000_pb_stock_save.sql $M/20261113050000_pb_bulk_run_header.sql $M/20261113060000_pb_bulk_log.sql $M/20261113080000_pb_bulk_log_server_only.sql $M/20261113090000_pb_bulk_log_tags_stock.sql $M/20261113100000_pb_photos_set.sql $T/telegram_base.sql $M/20261113110000_pb_tg_dates_skipped_group.sql $M/20261113120000_pb_copies.sql $M/20261113130000_pb_stock_word.sql $M/20261113140000_pb_product_sku_colour.sql $M/20261113150000_pb_gate_category_list.sql "$@"; do
  out=$($P -f "$f" 2>&1 | grep -iE "error|fatal" | grep -v "already exists" | cut -c1-220)
  [ -n "$out" ] && echo "== $(basename "$f")" && echo "$out" && bad=1
done
export PGOPTIONS="-c client_min_messages=warning" # the bulk-log functions once more, with their bodies checked
# Part 2 of the bulk log (20261113090000) and the copies migration (20261113120000) both carry the revert entry
# point and must work in either order: replayed, part 2 comes first; on the live database it was run by hand after the
# copies migration (13 Nov 2026). So it is loaded once more at the end, as it went live.
for f in $M/20261113060000_pb_bulk_log.sql $M/20261113080000_pb_bulk_log_server_only.sql $M/20261113090000_pb_bulk_log_tags_stock.sql "$@" $M/20261113120000_pb_copies.sql $M/20261113130000_pb_stock_word.sql $M/20261113090000_pb_bulk_log_tags_stock.sql $M/20261113150000_pb_gate_category_list.sql; do
  out=$($P -f "$f" 2>&1 | grep -iE "error|fatal" | cut -c1-220)
  [ -n "$out" ] && echo "== $(basename "$f") (bodies checked)" && echo "$out" && bad=1
done
for t in $T/t_photos.sql $T/t_telegram.sql $T/t_tags.sql $T/t_stock.sql; do echo "== $(basename "$t")"; $P -f "$t" 2>&1 | grep -vE "^\{|^service_role|^\s*$" | cut -c1-340; done
echo "== t_dups.sql"
all=$($P -f $T/t_dups.sql 2>&1); stopped=$? # the file stops at the first error it did not expect
out=$(echo "$all" | grep -E "^(ok|FAIL) " | cut -c1-340)
echo "$out" | grep -v "^ok "; [ $stopped -ne 0 ] && echo "$all" | grep -iE "error|fatal" | cut -c1-340
echo "$(echo "$out" | grep -c "^ok ") ok, $(echo "$out" | grep -c "^FAIL ") failed$([ $stopped -ne 0 ] && echo ', stopped early')"
{ [ $stopped -ne 0 ] || echo "$out" | grep -q "^FAIL " || ! echo "$out" | grep -q "^ok "; } && bad=1
exit $bad
