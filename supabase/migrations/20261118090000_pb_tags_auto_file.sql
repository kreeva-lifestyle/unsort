-- Playbook: new tag words are filed automatically (owner, 17 Nov 2026: "revamp this tag thing. The whole purpose was
-- to automate tag and not complicate the work of user. It should be merged automatic with the best possible AI
-- suggestion rest should be automatically ignore."). The review screen (Settings → Tags → Suggestions) is gone: the
-- pb-products worker files every pending word by itself (tagsFile.ts), as "also known as" of its nearest value, or
-- ignored. Why each piece:
--   filed_by        'auto' on a word the worker filed (null: a person answered it, before this change). A revert of a
--                   filing pass (Settings → Bulk changes) puts status, attribute and value back but not this column,
--                   so a word taken back stays pending AND marked, and the worker never files it again (no loop).
--   tried_at        the worker's claim and back-off: a word is taken again only once tried_at is 10 minutes old. The
--                   worker moves it on to hold words back longer: 30 minutes after an AI call that failed (no key, no
--                   credit, the AI down), the next IST day when the day's AI limit is used up — so neither wakes the
--                   worker every minute all day.
--   tries           AI answers that left the word out (the worker counts them); after 3 the word is ignored. A failed
--                   call, the daily limit or the clock does not use one up, so an outage never ignores the backlog.
--   pb_tag_file_due  words go in batches: only when 20 wait, or one has waited 15 minutes since it was first seen. A
--                   pass is one row in Settings → Bulk changes; without this an import gave one row a minute.
--   pb_tag_file_claim  claims up to p_limit words in one statement (FOR UPDATE SKIP LOCKED), when due: overlapping
--                   worker ticks never take the same word.
--   pb_tag_file     files ONE word in one transaction: the alias appended to the value's list in place (never a
--                   whole-array rewrite from a snapshot, which a concurrent edit could undo), or the word ignored. A
--                   word another value of the same attribute already has goes to that value (one word, one value);
--                   a value deleted or merged away meanwhile, or another value taking the word meanwhile, leaves the
--                   word pending for the next pass (never "aliased" to nothing).
--   trigger_pb_worker  also wakes the worker while words are due.
--   pb_bulk_revert  a pass of the worker (kind 'suggestions', no person) no longer stops an EARLIER tag change from
--                   being reverted ("A later bulk change touched some of the same items… Revert that one first"):
--                   passes add "also known as" words to the popular values every few minutes, so the owner would have
--                   to revert every later pass first. Safe: the tag revert works row by row on what is still as the
--                   change left it — the aliases word by word, a product's tags only where unchanged, a suggestion
--                   only while its status is as left (pb_bulk_tags_apply) — so the order does not matter for them.
--                   Patched in place from the live definition, so nothing else in it changes.
--   bulk capture    filed_by is recorded with a suggestion row and put back when a revert re-inserts a row the change
--                   deleted (an attribute delete takes a word's twin with it): without it a word Playbook ignored would
--                   come back as ignored by a person, and a word taken back would be filed again. A revert that only
--                   UPDATES a row still leaves filed_by as it is (that is what marks a word taken back).
-- Additive: three columns (nullable or defaulted, no backfill), one partial index, three new functions (service role
-- only), two functions replaced with the same signature. RLS on pb_tag_suggestions is unchanged (staff read; writes
-- only through the edge function).

alter table public.pb_tag_suggestions add column if not exists filed_by text check (filed_by in ('auto'));
alter table public.pb_tag_suggestions add column if not exists tries int not null default 0;
alter table public.pb_tag_suggestions add column if not exists tried_at timestamptz;
create index if not exists pb_tag_suggestions_file_idx on public.pb_tag_suggestions (tried_at nulls first, first_seen_at)
  where status = 'pending' and filed_by is null;

-- Words are due when 20 wait, or the oldest has waited 15 minutes since it was first seen. A word waiting = pending,
-- never filed by the worker, fewer than 3 unanswered AI tries, not held back (tried_at 10 minutes old or more).
create or replace function public.pb_tag_file_due()
returns boolean
language sql stable security invoker set search_path = public as $$
  select coalesce(count(*) >= 20 or bool_or(x.first_seen_at < now() - interval '15 minutes'), false)
  from (select y.first_seen_at from pb_tag_suggestions y
        where y.status = 'pending' and y.filed_by is null and y.tries < 3
          and (y.tried_at is null or y.tried_at < now() - interval '10 minutes')
        order by y.first_seen_at limit 20) x;
$$;

-- The words the worker may take now (when due), oldest first. Taking a word only stamps tried_at.
create or replace function public.pb_tag_file_claim(p_limit int)
returns setof public.pb_tag_suggestions
language sql security invoker set search_path = public as $$
  update pb_tag_suggestions s set tried_at = now()
  where pb_tag_file_due() and s.id in (select x.id from pb_tag_suggestions x
                 where x.status = 'pending' and x.filed_by is null and x.tries < 3
                   and (x.tried_at is null or x.tried_at < now() - interval '10 minutes')
                 order by x.tried_at nulls first, x.first_seen_at
                 limit greatest(1, least(coalesce(p_limit, 20), 100))
                 for update skip locked)
  returning s.*;
$$;

-- p_value null = ignore. p_why / p_match: the reason kept on the word (nearest), for the log and a later look.
-- Returns {filed, status?, value_id?, attribute_id?}; filed false when the word is no longer pending and unfiled, or
-- the value was deleted meanwhile (the worker leaves it for the next pass).
create or replace function public.pb_tag_file(p_id uuid, p_value uuid, p_why text default '', p_match text default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare s pb_tag_suggestions; v pb_attribute_values; other uuid; note jsonb;
begin
  select * into s from pb_tag_suggestions where id = p_id and status = 'pending' and filed_by is null for update;
  if not found then return jsonb_build_object('filed', false); end if;
  if p_value is null then
    note := jsonb_build_object('value_id', null, 'why', left(coalesce(p_why, ''), 140), 'at', now(), 'match', p_match, 'by', 'auto');
    update pb_tag_suggestions set status = 'ignored', filed_by = 'auto', nearest = note where id = p_id;
    return jsonb_build_object('filed', true, 'status', 'ignored');
  end if;
  select * into v from pb_attribute_values where id = p_value;
  if not found then return jsonb_build_object('filed', false); end if;
  select x.id into other from pb_attribute_values x
  where x.attribute_id = v.attribute_id and x.id <> v.id and (x.key = s.key or s.key = any(x.aliases)) limit 1;
  -- One value row locked (never two: a merge locks its two values in its own order).
  select * into v from pb_attribute_values where id = coalesce(other, p_value) for update;
  if not found then return jsonb_build_object('filed', false); end if; -- deleted or merged away meanwhile
  if exists (select 1 from pb_attribute_values x where x.attribute_id = v.attribute_id and x.id <> v.id
             and (x.key = s.key or s.key = any(x.aliases))) then
    return jsonb_build_object('filed', false); -- another value took the word meanwhile
  end if;
  if v.key <> s.key and not (s.key = any(v.aliases)) then
    update pb_attribute_values set aliases = aliases || s.key where id = v.id;
  end if;
  note := jsonb_build_object('value_id', v.id, 'why', left(coalesce(p_why, ''), 140), 'at', now(), 'match', p_match, 'by', 'auto');
  update pb_tag_suggestions set status = 'aliased', resolved_value_id = v.id, filed_by = 'auto', nearest = note where id = p_id;
  return jsonb_build_object('filed', true, 'status', 'aliased', 'value_id', v.id, 'attribute_id', v.attribute_id);
end $$;

revoke execute on function public.pb_tag_file_due() from public, anon, authenticated;
revoke execute on function public.pb_tag_file_claim(int) from public, anon, authenticated;
revoke execute on function public.pb_tag_file(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pb_tag_file_due() to service_role;
grant execute on function public.pb_tag_file_claim(int) to service_role;
grant execute on function public.pb_tag_file(uuid, uuid, text, text) to service_role;

create or replace function public.trigger_pb_worker()
returns bigint language plpgsql security definer
set search_path to 'public', 'extensions', 'vault' as $function$
declare v_secret text; v_paused boolean; v_stock boolean;
begin
  v_paused := coalesce((select (value->>'paused')::boolean from pb_settings where key = 'automation'), false);
  v_stock := exists (select 1 from pb_listings where stock_due and (stock_tried_at is null or stock_tried_at < now() - interval '5 minutes'))
          or exists (select 1 from pb_listings where unpublish_due and (unpublish_tried_at is null or unpublish_tried_at < now() - interval '5 minutes'));
  if v_paused and not v_stock then return null; end if;
  if not v_stock
     and not exists (select 1 from pb_products
                     where (status = 'new' and (claimed_at is null or claimed_at < now() - interval '5 minutes'))
                        or (status = 'reading' and claimed_at < now() - interval '5 minutes'))
     and not exists (select 1 from pb_listings l join pb_websites w on w.id = l.website_id and w.active
                     where (l.status in ('queued', 'publishing') and (l.claimed_at is null or l.claimed_at < now() - interval '5 minutes'))
                        or (l.status = 'generating' and l.claimed_at < now() - interval '5 minutes')
                        or (l.status = 'failed' and l.attempts < 3 and l.updated_at < now() - interval '10 minutes'))
     and not exists (select 1 from pb_import_runs
                     where status in ('queued', 'running') and (claimed_at is null or claimed_at < now() - interval '5 minutes'))
     and not exists (select 1 from pb_products where route_due)
     and not exists (select 1 from pb_products where tag_fill_run is not null and status in ('ready', 'needs_info'))
     and not exists (select 1 from pb_listings where status = 'published' and media_checked_at is null and shopify_product_id is not null
                       and published_at < now() - interval '3 minutes')
     and not pb_tag_file_due()
  then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pb_worker_secret';
  if v_secret is null then raise warning 'pb_worker_secret missing from vault'; return null; end if;
  return net.http_post(
    url := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-products',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('action', 'work'),
    timeout_milliseconds := 150000);
end $function$;

-- A worker pass never stops an earlier tag change from being reverted (see the header). The live entry point is
-- 20261113090000_pb_bulk_log_tags_stock.sql's; only its "a later change of the same family goes first" condition
-- changes. Run twice → nothing more happens.
do $do$
declare d text := pg_get_functiondef('public.pb_bulk_revert(uuid,boolean,uuid,text)'::regprocedure);
begin
  if position('x.created_by is null' in d) > 0 then return; end if;
  if position('where x.kind = any(family) and x.created_at > r.created_at' in d) = 0 then
    raise exception 'pb_bulk_revert is not the version this migration expects (20261113090000_pb_bulk_log_tags_stock.sql).';
  end if;
  execute replace(d, 'where x.kind = any(family) and x.created_at > r.created_at',
    'where x.kind = any(family) and x.created_at > r.created_at and not (x.kind = ''suggestions'' and x.created_by is null)');
end $do$;

-- filed_by travels with a suggestion row through the bulk-change log (see the header).
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_tag_suggestions
  for each row execute function public.pb_bulk_capture('id', 'id,phrase,key,attribute_id,status,uses,examples,source,resolved_value_id,first_seen_at,last_seen_at,filed_by');
do $do$
declare d text := pg_get_functiondef('public.pb_bulk_tags_apply(uuid)'::regprocedure);
  ins constant text := 'insert into pb_tag_suggestions (id, phrase, key, attribute_id, status, uses, examples, source, resolved_value_id, first_seen_at, last_seen_at)';
  val constant text := 'b ->> ''source'', v.id, (b ->> ''first_seen_at'')::timestamptz, (b ->> ''last_seen_at'')::timestamptz';
begin
  if position(ins in d) = 0 and position('last_seen_at, filed_by)' in d) > 0 then return; end if; -- done before
  if position(ins in d) = 0 or position(val in d) = 0 then
    raise exception 'pb_bulk_tags_apply is not the version this migration expects (20261113090000_pb_bulk_log_tags_stock.sql).';
  end if;
  execute replace(replace(d, ins, replace(ins, 'last_seen_at)', 'last_seen_at, filed_by)')), val, val || ', b ->> ''filed_by''');
end $do$;
