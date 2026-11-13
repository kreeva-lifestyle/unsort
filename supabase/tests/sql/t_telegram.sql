-- Telegram intake: the vendor's post date on a message (crawler's word, forward header, repost), and
-- forwards that never reached Playbook. Needs supabase/migrations/20261107090000_pb_telegram_intake.sql and
-- 20261113110000_pb_tg_dates_skipped_group.sql loaded (run.sh does that; the cron lines of the first fail
-- on a plain PostgreSQL and are skipped).
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- 1. A plain forward: the header names the vendor's own channel, so its date stays.
insert into pb_tg_messages (chat_id, message_id, origin_chat_id, origin_message_id, kind, origin_date) values (-1, 10, -500, 70, 'photo', '2026-11-10 10:00+00');
select '1 header date kept: ' || to_char(origin_date at time zone 'utc', 'HH24:MI') from pb_tg_messages where message_id = 10;
-- 2. A repost stored BEFORE its mapping: the header named another channel (-900); the mapping moves it to the
--    vendor's channel and, with no date from the crawler, the wrong date is cleared.
insert into pb_tg_messages (chat_id, message_id, origin_chat_id, origin_message_id, kind, origin_date) values (-1, 11, -900, 5, 'photo', '2026-11-01 09:00+00');
select '2 mapped: ' || pb_tg_map_forwards('[{"chat_id":-1,"message_id":11,"origin_chat_id":-500,"origin_message_id":71,"origin_title":"V","origin_username":"v"}]'::jsonb);
select '2 origin now ' || origin_chat_id || ':' || origin_message_id || ', date ' || coalesce(origin_date::text, 'cleared') from pb_tg_messages where message_id = 11;
-- 3. …and the crawler's date, when it gives one, is used.
select '3 dated: ' || pb_tg_post_dates('[{"chat_id":-1,"message_id":11,"posted_at":1794304800}]'::jsonb);
select '3 date ' || to_char(origin_date at time zone 'utc', 'YYYY-MM-DD HH24:MI') from pb_tg_messages where message_id = 11;
-- 4. A repost stored AFTER its mapping and date: the insert takes both.
select pb_tg_map_forwards('[{"chat_id":-1,"message_id":12,"origin_chat_id":-500,"origin_message_id":72}]'::jsonb) is not null;
select pb_tg_post_dates('[{"chat_id":-1,"message_id":12,"posted_at":1794308400}]'::jsonb) is not null;
insert into pb_tg_messages (chat_id, message_id, origin_chat_id, origin_message_id, kind, origin_date) values (-1, 12, -900, 6, 'photo', '2026-11-01 09:00+00');
select '4 origin ' || origin_chat_id || ':' || origin_message_id || ', date ' || to_char(origin_date at time zone 'utc', 'YYYY-MM-DD HH24:MI') from pb_tg_messages where message_id = 12;
-- 5. A used message keeps its date (only waiting ones are touched); junk dates are ignored.
update pb_tg_messages set state = 'used' where message_id = 11;
select '5 changed: ' || pb_tg_post_dates('[{"chat_id":-1,"message_id":11,"posted_at":1794300000},{"chat_id":-1,"message_id":12,"posted_at":"soon"}]'::jsonb);
-- 6. Only the server may set dates.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
savepoint s; select pb_tg_post_dates('[]'::jsonb); rollback to s;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- 7. Forwards that never arrived: two old ones without a message, one that arrived, one too fresh, one sent again.
insert into pb_tg_forwards (chat_id, message_id, origin_chat_id, origin_message_id, origin_title, created_at, resent_at) values
  (-1, 20, -500, 80, 'V', now() - interval '1 hour', null), (-1, 21, -500, 81, 'V', now() - interval '1 hour', null),
  (-1, 22, -500, 82, 'V', now() - interval '2 minutes', null), (-1, 23, -500, 83, 'V', now() - interval '1 hour', now()),
  (-1, 24, -600, 9, 'W', now() - interval '3 days', null);
update pb_tg_forwards set created_at = now() - interval '1 hour' where message_id in (11, 12);
select '7 lost: ' || coalesce(string_agg(origin_title || ' ' || lost || ' (' || first_id || '-' || last_id || ')', '; '), 'none') from pb_tg_lost_forwards();
rollback;
