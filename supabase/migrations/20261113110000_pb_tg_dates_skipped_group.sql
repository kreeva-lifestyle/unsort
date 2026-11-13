-- Playbook · Telegram intake, pre-launch fixes D13, D14, D20 (owner: "Fix all").
--
-- WHY
--   D13  Two dates were thrown away. (1) When the vendor posted: every
--        forwarded message carries it, and the crawler knows it for a repost
--        (whose forward header names the first channel, not the vendor's).
--        (2) The day a listing first went live: published_at moves on every
--        re-send. Both are needed to tell a new design from a restock.
--   D14  Messages Playbook does not use (a text with no price, a repeated
--        post, a forward from a person…) left no trace anyone could see.
--        They now carry why, so Settings can list them.
--   D20  A bot removed from the admin group was not noticed; the crawler kept
--        forwarding into a group nobody was reading. The group's state is
--        stored, and forwards that never reached Playbook can be found.
--
-- Additive only: new columns, one index, one trigger, two functions. Nothing
-- is dropped and no row is removed.

-- ── D13: when the vendor posted ───────────────────────────────────────────
alter table public.pb_tg_messages add column if not exists origin_date timestamptz;
alter table public.pb_tg_forwards add column if not exists posted_at timestamptz;
alter table public.pb_products add column if not exists source_posted_at timestamptz;
comment on column public.pb_tg_messages.origin_date is 'When the vendor posted it in their channel (the crawler''s word; else the forward header when it names the vendor''s own channel). Null when not known.';
comment on column public.pb_products.source_posted_at is 'Telegram: when the vendor posted this product''s first message in their channel.';

-- ── D13: the day a listing first went live (never moved by a re-send) ─────
alter table public.pb_listings add column if not exists first_published_at timestamptz;
update public.pb_listings set first_published_at = published_at where first_published_at is null and published_at is not null;

-- ── D14: why a message was not used ───────────────────────────────────────
-- separator | repeat | no_photos | chatter | no_vendor | less_alone
alter table public.pb_tg_messages add column if not exists skip_why text;
create index if not exists pb_tg_messages_skipped_idx on public.pb_tg_messages (received_at desc) where state = 'ignored';
update public.pb_tg_messages set skip_why = case
    when note like 'Forwarded from a person%' then 'no_vendor'
    when note like 'The same channel post%' then 'repeat'
    when note like 'A "Less" with no product%' then 'less_alone'
    else 'separator' end
where state = 'ignored' and skip_why is null;

-- ── D20: is the bot in the admin group, and can it read it? ───────────────
alter table public.pb_tg_config add column if not exists group_ok boolean;            -- null: not checked yet
alter table public.pb_tg_config add column if not exists group_error text;
alter table public.pb_tg_config add column if not exists group_checked_at timestamptz;
-- A forward the crawler made that was sent again after it never arrived.
alter table public.pb_tg_forwards add column if not exists resent_at timestamptz;

-- A message takes the mapped origin (as before) and, with it, the vendor's own
-- post date: the crawler's when it gave one; for a repost without one the
-- header's date is the first channel's, so it is cleared. Also when the
-- mapping arrives after the message (pb_tg_map_forwards changes the origin).
create or replace function public.pb_tg_messages_origin() returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp as $$
declare f public.pb_tg_forwards;
begin
  select * into f from public.pb_tg_forwards where chat_id = new.chat_id and message_id = new.message_id;
  if tg_op = 'INSERT' then
    if found then
      if f.posted_at is not null then new.origin_date := f.posted_at;
      elsif new.origin_chat_id is distinct from f.origin_chat_id or new.origin_message_id is distinct from f.origin_message_id then new.origin_date := null;
      end if;
      new.origin_chat_id := f.origin_chat_id;
      new.origin_message_id := f.origin_message_id;
      new.origin_title := coalesce(f.origin_title, new.origin_title);
      new.origin_username := f.origin_username;
    end if;
  elsif new.origin_chat_id is distinct from old.origin_chat_id or new.origin_message_id is distinct from old.origin_message_id then
    new.origin_date := f.posted_at;
  end if;
  return new;
end $$;
create or replace trigger pb_tg_messages_origin_moved before update of origin_chat_id, origin_message_id on public.pb_tg_messages
  for each row execute function public.pb_tg_messages_origin();

-- The crawler's post dates: [{chat_id, message_id, posted_at (unix seconds)}].
-- Stored on the mapping and put on messages that are not used yet. Called by
-- pb-telegram right after pb_tg_map_forwards. Returns how many messages changed.
create or replace function public.pb_tg_post_dates(p_rows jsonb)
returns integer language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp as $$
declare n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  update public.pb_tg_forwards f set posted_at = to_timestamp(d.at)
  from (select (r->>'chat_id')::bigint as chat_id, (r->>'message_id')::bigint as message_id, (r->>'posted_at')::double precision as at
        from jsonb_array_elements(p_rows) r
        where (r->>'chat_id') is not null and (r->>'message_id') is not null and (r->>'posted_at') ~ '^\d{9,11}$') d
  where f.chat_id = d.chat_id and f.message_id = d.message_id and f.posted_at is distinct from to_timestamp(d.at);
  update public.pb_tg_messages m set origin_date = f.posted_at
  from public.pb_tg_forwards f
  where f.chat_id = m.chat_id and f.message_id = m.message_id and f.posted_at is not null
    and m.origin_date is distinct from f.posted_at and m.state in ('pending', 'failed')
    and (f.chat_id, f.message_id) in (select (r->>'chat_id')::bigint, (r->>'message_id')::bigint from jsonb_array_elements(p_rows) r);
  get diagnostics n = row_count;
  return n;
end $$;

-- Forwards the crawler made that never reached Playbook: older than 10
-- minutes (Telegram delivers within seconds), from the last 2 days, not sent
-- again since. One row per vendor channel. Read by Settings (staff) and by
-- pb-telegram, which has the crawler send those posts again.
create or replace function public.pb_tg_lost_forwards()
returns table (origin_chat_id bigint, origin_title text, origin_username text, lost integer, first_id bigint, last_id bigint, newest timestamptz)
language sql stable security invoker
set search_path = pg_catalog, public, pg_temp as $$
  select f.origin_chat_id, max(f.origin_title), max(f.origin_username), count(*)::integer, min(f.origin_message_id), max(f.origin_message_id), max(f.created_at)
  from public.pb_tg_forwards f
  where f.created_at < now() - interval '10 minutes' and f.created_at > now() - interval '2 days' and f.resent_at is null
    and not exists (select 1 from public.pb_tg_messages m where m.chat_id = f.chat_id and m.message_id = f.message_id)
  group by f.origin_chat_id
$$;
grant execute on function public.pb_tg_lost_forwards() to authenticated, service_role;
grant execute on function public.pb_tg_post_dates(jsonb) to service_role;
