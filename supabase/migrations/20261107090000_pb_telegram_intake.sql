-- Playbook · Telegram intake (owner, 2026-11-07).
--
-- WHY: vendor products are posted in the vendors' Telegram channels. The owner
-- wants them in the Product Directory automatically, with the VENDOR taken from
-- the channel (the post text never names the vendor). A normal bot cannot read
-- other people's channels, so (owner's decision):
--   crawler (an existing staff Telegram USER account, on a small cloud server)
--   reads the vendor channels listed in Playbook and FORWARDS each new post into
--   the owner's private admin group → the Playbook bot (admin there) receives
--   the forwarded messages by webhook → pb-telegram stores them here →
--   every minute 'assemble' groups them into products (photos + videos +
--   description + a separate "200 Less" message, cost = RATE − LESS).
-- ONCE A DAY per channel (owner, 2026-11-07: "auto-set once a day for each
-- vendor's channel … not clash with others … don't dump all vendors at once"):
-- each vendor channel gets its own daily time inside an overnight window
-- (23:00–07:00 IST by default), spaced away from the other channels; the
-- crawler checks at most one channel at a time, each at its own time.
-- Forwarded messages carry forward_origin (channel id, title, username,
-- message id): that is how the vendor is known.
-- Docs: docs/playbook/telegram-intake.md.
--
-- Changes:
--   pb_vendors          + tg_channel_id (Bot API form, -100…), tg_username
--                       (lowercase, no @), tg_title. Changing the username
--                       forgets the old channel id (the crawler fills it again).
--                       + tg_slot_minute (daily check time, IST minute of day),
--                       tg_slot_set_at, tg_checked_at, tg_cursor_ready — see
--                       "once-a-day checks" below.
--   pb_products         + less_amount, source_url, intake_notes
--   pb_product_images   + kind ('image' | 'video'), bytes. Shopify / AI use
--                       images only.
--   playbook-products   bucket also takes MP4 / MOV, files up to 20 MB
--                       (Telegram's bot download limit). Nothing is lowered.
--   pb_tg_messages      every forwarded message, until it is used / ignored
--   pb_tg_config        bot / group / crawler status (staff read, no client writes)
--                       + crawl_window_start / crawl_window_end (IST minutes of
--                       day, may cross midnight)
--   pb_tg_link_try()    the "/link 123456" check: 5 wrong codes and the code is
--                       void (a public bot can be added to any group, so the
--                       6-digit code must not be guessable by trying)
--   pb_tg_forwards      which vendor channel post each group message came from,
--                       as the crawler reports it (a repost keeps its original
--                       channel in forward_origin, so the header alone can name
--                       the wrong vendor); applied by pb_tg_map_forwards() and on
--                       insert by a trigger, whichever arrives second
--   pb_tg_secrets       bot token, webhook secret, crawler key hash — service
--                       role only (RLS on, no policies)
--   cron 'pb-telegram-assemble' → trigger_pb_telegram_assemble() pokes the
--   pb-telegram function only when messages are waiting.
-- Idempotent where cheap (if not exists / drop policy if exists).

-- ── vendors: their Telegram channel ───────────────────────────────────────
alter table public.pb_vendors add column if not exists tg_channel_id bigint;
alter table public.pb_vendors add column if not exists tg_username text
  check (tg_username is null or tg_username ~ '^[a-z0-9_]{4,32}$');
alter table public.pb_vendors add column if not exists tg_title text;
create unique index if not exists pb_vendors_tg_channel_key on public.pb_vendors (tg_channel_id) where tg_channel_id is not null;
create unique index if not exists pb_vendors_tg_username_key on public.pb_vendors (lower(tg_username)) where tg_username is not null;

-- A new username means a different channel: the old channel id would keep
-- sending that channel's posts to this vendor, so it is forgotten (the crawler
-- reports the new one). An update that sets both (the server) is kept as is.
create or replace function public.pb_vendors_tg_reset() returns trigger language plpgsql set search_path = public as $$
begin
  if new.tg_username is distinct from old.tg_username and new.tg_channel_id is not distinct from old.tg_channel_id then
    new.tg_channel_id := null;
    new.tg_title := null;
  end if;
  return new;
end $$;
drop trigger if exists pb_vendors_tg_reset on public.pb_vendors;
create trigger pb_vendors_tg_reset before update of tg_username on public.pb_vendors
  for each row execute function public.pb_vendors_tg_reset();

-- ── products: less, link to the post, intake notes ────────────────────────
alter table public.pb_products add column if not exists less_amount numeric(12,2)
  check (less_amount is null or less_amount >= 0);
alter table public.pb_products add column if not exists source_url text;
alter table public.pb_products add column if not exists intake_notes text[] not null default '{}';

-- ── product media: photos and videos ──────────────────────────────────────
alter table public.pb_product_images add column if not exists kind text not null default 'image'
  check (kind in ('image', 'video'));
alter table public.pb_product_images add column if not exists bytes bigint;

-- Bucket: add MP4 / MOV and allow at least 20 MB. NULL means "no limit" /
-- "any type" and stays NULL; a larger limit is kept.
update storage.buckets
set file_size_limit = case when file_size_limit is null then null else greatest(file_size_limit, 20971520) end,
    allowed_mime_types = case when allowed_mime_types is null then null
      else array(select distinct unnest(allowed_mime_types || array['video/mp4', 'video/quicktime'])) end
where id = 'playbook-products';

-- ── forwarded messages ────────────────────────────────────────────────────
create table if not exists public.pb_tg_messages (
  id bigserial primary key,
  update_id bigint unique,
  chat_id bigint not null,
  message_id bigint not null,
  origin_chat_id bigint,
  origin_title text,
  origin_username text,
  origin_message_id bigint,
  media_group_id text,
  kind text check (kind in ('photo', 'video', 'text', 'other')),
  text text,
  file_id text,
  file_unique_id text,
  file_size bigint,
  mime text,
  state text not null default 'pending' check (state in ('pending', 'used', 'ignored', 'failed')),
  product_id uuid references public.pb_products(id) on delete set null,
  note text,
  received_at timestamptz not null default now(),
  unique (chat_id, message_id)
);
create index if not exists pb_tg_messages_state_idx on public.pb_tg_messages (state, origin_chat_id, origin_message_id);
create index if not exists pb_tg_messages_product_idx on public.pb_tg_messages (product_id) where product_id is not null;

-- ── config (one row) ──────────────────────────────────────────────────────
create table if not exists public.pb_tg_config (
  id integer primary key default 1 check (id = 1),
  bot_username text,
  group_chat_id bigint,
  group_title text,
  link_code text,
  link_code_expires_at timestamptz,
  link_attempts integer not null default 0, -- wrong "/link" codes since the last new code
  webhook_ok boolean,
  webhook_error text,
  crawler_seen_at timestamptz,
  crawler_version text,
  crawler_error text,
  crawler_channels jsonb not null default '[]'::jsonb, -- [{username, channel_id, title, last_id, error}]
  last_message_at timestamptz,
  -- The overnight window the daily checks are spread over (IST minute of day;
  -- 23:00 → 07:00 by default, crossing midnight). Changed only through
  -- pb_tg_set_window(), which also respreads the channels.
  crawl_window_start smallint not null default 1380 check (crawl_window_start between 0 and 1439),
  crawl_window_end smallint not null default 420 check (crawl_window_end between 0 and 1439),
  updated_at timestamptz not null default now()
);
alter table public.pb_tg_config add column if not exists link_attempts integer not null default 0;
insert into public.pb_tg_config (id) values (1) on conflict (id) do nothing;

-- ── secrets (one row, service role only) ──────────────────────────────────
create table if not exists public.pb_tg_secrets (
  id integer primary key default 1 check (id = 1),
  bot_token text,
  webhook_secret text,
  crawler_key_hash text,
  updated_at timestamptz not null default now()
);
insert into public.pb_tg_secrets (id) values (1) on conflict (id) do nothing;

drop trigger if exists pb_tg_config_touch on public.pb_tg_config;
create trigger pb_tg_config_touch before update on public.pb_tg_config for each row execute function public.pb_touch();
drop trigger if exists pb_tg_secrets_touch on public.pb_tg_secrets;
create trigger pb_tg_secrets_touch before update on public.pb_tg_secrets for each row execute function public.pb_touch();

-- ── RLS: staff read messages + config; only the edge function writes ──────
alter table public.pb_tg_messages enable row level security;
alter table public.pb_tg_config enable row level security;
alter table public.pb_tg_secrets enable row level security;
revoke all on public.pb_tg_messages, public.pb_tg_config, public.pb_tg_secrets from anon;
revoke insert, update, delete, truncate on public.pb_tg_messages, public.pb_tg_config from authenticated;
revoke all on public.pb_tg_secrets from authenticated;
drop policy if exists "pb staff read" on public.pb_tg_messages;
create policy "pb staff read" on public.pb_tg_messages for select to authenticated using ((select public.app_is_staff()));
drop policy if exists "pb staff read" on public.pb_tg_config;
create policy "pb staff read" on public.pb_tg_config for select to authenticated using ((select public.app_is_staff()));
revoke all on sequence public.pb_tg_messages_id_seq from anon, authenticated;

-- ── assemble trigger (pg_cron → pb-telegram, only when messages wait) ─────
-- Same pattern as trigger_pb_worker(): the shared secret pb_worker_secret from
-- Vault, matched by the function against app_secrets.pb_worker_secret.
-- Work = a pending message, or a failed one still under its 3 tries (the try
-- count rides in note: "… (attempt N of 3)"). A group of photos still waiting
-- for its description keeps this firing (cheap: one query when nothing is due).
create or replace function public.trigger_pb_telegram_assemble()
returns bigint language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions', 'vault', 'pg_temp' as $function$
declare v_secret text;
begin
  if not exists (select 1 from public.pb_tg_messages where state = 'pending')
     and not exists (select 1 from public.pb_tg_messages where state = 'failed' and note ~ '\(attempt [12] of 3\)$')
  then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pb_worker_secret';
  if v_secret is null then raise warning 'pb_worker_secret missing from vault'; return null; end if;
  return net.http_post(
    url := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-telegram',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('action', 'assemble'),
    timeout_milliseconds := 150000);
end $function$;
revoke all on function public.trigger_pb_telegram_assemble() from public, anon, authenticated;

select cron.schedule('pb-telegram-assemble', '* * * * *', $$select public.trigger_pb_telegram_assemble()$$);

-- ── "/link 123456": checked and applied in one locked step ─────────────────
-- Returns 'none' (no live code), 'wrong', 'locked' (5th wrong try: the code is
-- void, staff get a new one) or 'linked'. Called by pb-telegram (service role).
create or replace function public.pb_tg_link_try(p_code text, p_chat bigint, p_title text)
returns text language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp as $$
declare c public.pb_tg_config;
begin
  select * into c from public.pb_tg_config where id = 1 for update;
  if not found or c.link_code is null or c.link_code_expires_at is null or c.link_code_expires_at <= now() then
    return 'none';
  end if;
  if c.link_code = p_code then
    update public.pb_tg_config set group_chat_id = p_chat, group_title = p_title, link_code = null,
      link_code_expires_at = null, link_attempts = 0 where id = 1;
    return 'linked';
  end if;
  update public.pb_tg_config set link_attempts = c.link_attempts + 1,
    link_code = case when c.link_attempts + 1 >= 5 then null else link_code end,
    link_code_expires_at = case when c.link_attempts + 1 >= 5 then null else link_code_expires_at end
  where id = 1;
  return case when c.link_attempts + 1 >= 5 then 'locked' else 'wrong' end;
end $$;
revoke all on function public.pb_tg_link_try(text, bigint, text) from public, anon, authenticated;
grant execute on function public.pb_tg_link_try(text, bigint, text) to service_role;

-- ── where each forwarded message really came from (crawler's word) ────────
-- forward_origin names the FIRST channel of a post: when a vendor reposts a
-- supplier's post, it names the supplier. The crawler knows which vendor
-- channel it forwarded from, and reports {group message id → channel, post id}.
create table if not exists public.pb_tg_forwards (
  chat_id bigint not null,
  message_id bigint not null,
  origin_chat_id bigint not null,
  origin_message_id bigint not null,
  origin_title text,
  origin_username text,
  created_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);
create index if not exists pb_tg_forwards_created_idx on public.pb_tg_forwards (created_at);
alter table public.pb_tg_forwards enable row level security;
revoke all on public.pb_tg_forwards from anon;
revoke insert, update, delete, truncate on public.pb_tg_forwards from authenticated;
drop policy if exists "pb staff read" on public.pb_tg_forwards;
create policy "pb staff read" on public.pb_tg_forwards for select to authenticated using ((select public.app_is_staff()));

-- A message stored after its mapping arrived takes the mapped origin.
create or replace function public.pb_tg_messages_origin() returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp as $$
declare f public.pb_tg_forwards;
begin
  select * into f from public.pb_tg_forwards where chat_id = new.chat_id and message_id = new.message_id;
  if found then
    new.origin_chat_id := f.origin_chat_id;
    new.origin_message_id := f.origin_message_id;
    new.origin_title := coalesce(f.origin_title, new.origin_title);
    new.origin_username := f.origin_username;
  end if;
  return new;
end $$;
drop trigger if exists pb_tg_messages_origin on public.pb_tg_messages;
create trigger pb_tg_messages_origin before insert on public.pb_tg_messages
  for each row execute function public.pb_tg_messages_origin();

-- Stores the crawler's mapping and applies it to messages already stored and
-- not yet used. p_rows: [{chat_id, message_id, origin_chat_id, origin_message_id,
-- origin_title, origin_username}]. Returns how many stored messages changed.
create or replace function public.pb_tg_map_forwards(p_rows jsonb)
returns integer language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp as $$
declare n integer;
begin
  insert into public.pb_tg_forwards (chat_id, message_id, origin_chat_id, origin_message_id, origin_title, origin_username)
  select (r->>'chat_id')::bigint, (r->>'message_id')::bigint, (r->>'origin_chat_id')::bigint, (r->>'origin_message_id')::bigint,
         nullif(left(r->>'origin_title', 200), ''), nullif(lower(r->>'origin_username'), '')
  from jsonb_array_elements(p_rows) r
  where (r->>'chat_id') is not null and (r->>'message_id') is not null
    and (r->>'origin_chat_id') is not null and (r->>'origin_message_id') is not null
  on conflict (chat_id, message_id) do update set origin_chat_id = excluded.origin_chat_id,
    origin_message_id = excluded.origin_message_id, origin_title = excluded.origin_title, origin_username = excluded.origin_username;
  update public.pb_tg_messages m
  set origin_chat_id = f.origin_chat_id, origin_message_id = f.origin_message_id,
      origin_title = coalesce(f.origin_title, m.origin_title), origin_username = f.origin_username
  from public.pb_tg_forwards f
  where f.chat_id = m.chat_id and f.message_id = m.message_id and m.state in ('pending', 'failed')
    and (m.origin_chat_id is distinct from f.origin_chat_id or m.origin_message_id is distinct from f.origin_message_id
         or m.origin_username is distinct from f.origin_username)
    and (f.chat_id, f.message_id) in (select (r->>'chat_id')::bigint, (r->>'message_id')::bigint from jsonb_array_elements(p_rows) r);
  get diagnostics n = row_count;
  -- Old mappings are only needed until their messages arrive.
  delete from public.pb_tg_forwards where created_at < now() - interval '30 days';
  return n;
end $$;
revoke all on function public.pb_tg_map_forwards(jsonb) from public, anon, authenticated;
grant execute on function public.pb_tg_map_forwards(jsonb) to service_role;

-- ── once-a-day checks: every channel at its own time ───────────────────────
-- The crawler reads each vendor channel ONCE A DAY, at that channel's own time
-- inside the overnight window (pb_tg_config.crawl_window_start/end), so a
-- night's posts arrive one channel after another, never all vendors at once.
--   tg_slot_minute   the daily check time, IST minute of day (0–1439). Given by
--                    the trigger below as soon as an active vendor has a
--                    channel: the middle of the LARGEST free gap between the
--                    other channels' times (window start and end are edges;
--                    ties → the earliest gap), so the first channel gets the
--                    window's middle (03:00), the next 01:00, then 05:00…
--   tg_slot_set_at   when that time was given or changed: a channel is first
--                    checked at its NEXT occurrence after it, so a new vendor or
--                    a respread in the daytime never sets off daytime checks.
--   tg_checked_at    when its last daily check finished (crawler_progress).
--   tg_cursor_ready  the crawler has noted the channel's newest post id (no
--                    forwarding), so the first nightly check copies only posts
--                    made after the vendor was added — old history never comes.
-- Clearing the channel (or switching the vendor off) clears the time and the
-- cursor; a different channel (new username / id) needs a new cursor.
-- When a channel is DUE is worked out by pb-telegram (schedule.ts, crawler_config).
alter table public.pb_vendors add column if not exists tg_slot_minute smallint
  check (tg_slot_minute is null or tg_slot_minute between 0 and 1439);
alter table public.pb_vendors add column if not exists tg_slot_set_at timestamptz;
alter table public.pb_vendors add column if not exists tg_checked_at timestamptz;
alter table public.pb_vendors add column if not exists tg_cursor_ready boolean not null default false;

-- Window length in minutes, crossing midnight (start = end counts as a whole day).
create or replace function public.pb_tg_window_len(p_start integer, p_end integer)
returns integer language sql immutable set search_path = pg_catalog as $$
  select case when ((p_end - p_start) % 1440 + 1440) % 1440 = 0 then 1440 else ((p_end - p_start) % 1440 + 1440) % 1440 end
$$;

-- The time for one more channel: middle of the largest gap between the taken
-- times (as offsets from the window start; times outside the window are
-- ignored), the window's start and end counting as edges; ties → earliest gap.
-- Pure; its TypeScript twin is pickSlot() in pb-telegram/schedule.ts.
create or replace function public.pb_tg_pick_slot(p_start integer, p_end integer, p_taken integer[])
returns smallint language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  w integer := public.pb_tg_window_len(p_start, p_end);
  offs integer[];
  o integer; prev integer := 0; best_at integer := 0; best_len integer := -1;
begin
  select coalesce(array_agg(x order by x), '{}') into offs
  from (select ((t - p_start) % 1440 + 1440) % 1440 as x from unnest(coalesce(p_taken, '{}')) t where t is not null) q
  where x <= w;
  foreach o in array array_append(offs, w) loop
    if o - prev > best_len then best_len := o - prev; best_at := prev; end if;
    prev := o;
  end loop;
  return ((p_start + best_at + best_len / 2) % 1440)::smallint;
end $$;

create or replace function public.pb_vendors_tg_slot() returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp as $$
declare
  has_channel boolean := new.tg_username is not null or new.tg_channel_id is not null;
  w_start integer; w_end integer; taken integer[];
begin
  if tg_op = 'UPDATE' and (new.tg_username is distinct from old.tg_username
      or (old.tg_channel_id is not null and new.tg_channel_id is distinct from old.tg_channel_id)) then
    new.tg_cursor_ready := false;   -- another channel: note its newest post again
    new.tg_checked_at := null;
  end if;
  if not has_channel or not new.active then
    new.tg_slot_minute := null;
    new.tg_cursor_ready := false;   -- back on later: starts from its newest post again
    if not has_channel then new.tg_checked_at := null; end if;
  elsif new.tg_slot_minute is null then
    perform pg_advisory_xact_lock(hashtext('pb_tg_slots'));  -- two vendors added at once never share a time
    select crawl_window_start, crawl_window_end into w_start, w_end from public.pb_tg_config where id = 1;
    select array_agg(tg_slot_minute) into taken from public.pb_vendors
    where id <> new.id and active and tg_slot_minute is not null and (tg_username is not null or tg_channel_id is not null);
    new.tg_slot_minute := public.pb_tg_pick_slot(coalesce(w_start, 1380), coalesce(w_end, 420), taken);
  end if;
  if tg_op = 'INSERT' or new.tg_slot_minute is distinct from old.tg_slot_minute then
    new.tg_slot_set_at := case when new.tg_slot_minute is null then null else now() end;
  end if;
  return new;
end $$;
-- Named after pb_vendors_tg_reset so it runs second (same-timing triggers fire
-- in name order) and sees the channel id that one may have cleared.
drop trigger if exists pb_vendors_tg_slot on public.pb_vendors;
create trigger pb_vendors_tg_slot before insert or update on public.pb_vendors
  for each row execute function public.pb_vendors_tg_slot();

-- Spaces ALL active channels evenly over the window, keeping their order
-- (by time from p_order_start, default the window start; channels with no
-- time yet go last): channel i of n gets start + window × (2i + 1) / 2n, the
-- middle of its equal share. Returns how many channels there are.
-- Called by pb-telegram (Settings → "Spread evenly") and by pb_tg_set_window().
create or replace function public.pb_tg_respread_slots(p_order_start integer default null)
returns integer language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare w_start integer; w_end integer; w integer; n integer; o integer;
begin
  perform pg_advisory_xact_lock(hashtext('pb_tg_slots'));
  select crawl_window_start, crawl_window_end into w_start, w_end from public.pb_tg_config where id = 1;
  w_start := coalesce(w_start, 1380); w_end := coalesce(w_end, 420);
  w := public.pb_tg_window_len(w_start, w_end);
  o := coalesce(p_order_start, w_start);
  select count(*) into n from public.pb_vendors where active and (tg_username is not null or tg_channel_id is not null);
  if n = 0 then return 0; end if;
  with ch as (
    select id, row_number() over (order by tg_slot_minute is null, ((tg_slot_minute - o) % 1440 + 1440) % 1440, created_at, id) - 1 as i
    from public.pb_vendors where active and (tg_username is not null or tg_channel_id is not null)
  )
  update public.pb_vendors v set tg_slot_minute = ((w_start + (w * (2 * ch.i + 1)) / (2 * n)) % 1440)::smallint
  from ch where v.id = ch.id and v.tg_slot_minute is distinct from ((w_start + (w * (2 * ch.i + 1)) / (2 * n)) % 1440)::smallint;
  return n;
end $$;
revoke all on function public.pb_tg_respread_slots(integer) from public, anon, authenticated;
grant execute on function public.pb_tg_respread_slots(integer) to service_role;

-- Saves the overnight window and respreads the channels in their old order,
-- in one step. Start / end 0–1439 (IST minute of day), at least 60 minutes
-- apart (crossing midnight is fine). Returns the number of channels.
create or replace function public.pb_tg_set_window(p_start integer, p_end integer)
returns integer language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare old_start integer;
begin
  if p_start is null or p_end is null or p_start not between 0 and 1439 or p_end not between 0 and 1439 then
    raise exception 'The window times must be between 00:00 and 23:59.' using errcode = '22023';
  end if;
  if ((p_end - p_start) % 1440 + 1440) % 1440 < 60 then
    raise exception 'Make the window at least 1 hour long.' using errcode = '22023';
  end if;
  select crawl_window_start into old_start from public.pb_tg_config where id = 1 for update;
  update public.pb_tg_config set crawl_window_start = p_start, crawl_window_end = p_end where id = 1;
  return public.pb_tg_respread_slots(old_start);
end $$;
revoke all on function public.pb_tg_set_window(integer, integer) from public, anon, authenticated;
grant execute on function public.pb_tg_set_window(integer, integer) to service_role;

-- A replay over vendors that already have channels gives them times.
do $$ begin
  if exists (select 1 from public.pb_vendors where active and tg_slot_minute is null and (tg_username is not null or tg_channel_id is not null)) then
    perform public.pb_tg_respread_slots();
  end if;
end $$;
