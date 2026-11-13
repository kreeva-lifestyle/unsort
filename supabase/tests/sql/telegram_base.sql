-- Cut from supabase/migrations/20261107090000_pb_telegram_intake.sql for the local SQL tests (do not edit by
-- hand; cut it again if that file changes): the message, config and mapping tables, the origin trigger and
-- pb_tg_map_forwards. The cron job, the vendor columns and the grants are left out.
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
