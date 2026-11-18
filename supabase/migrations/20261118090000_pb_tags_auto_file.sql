-- Playbook: new tag words are filed automatically (owner, 17 Nov 2026: "revamp this tag thing. The whole purpose was
-- to automate tag and not complicate the work of user. It should be merged automatic with the best possible AI
-- suggestion rest should be automatically ignore."). The review screen (Settings → Tags → Suggestions) is gone: the
-- pb-products worker files every pending word by itself (tagsFile.ts), as "also known as" of its nearest value, or
-- ignored. Why each piece:
--   filed_by        'auto' on a word the worker filed (null: a person answered it, before this change). A revert of a
--                   filing pass (Settings → Bulk changes) puts status, attribute and value back but not this column,
--                   so a word taken back stays pending AND marked, and the worker never files it again (no loop).
--   tried_at        the worker's claim and back-off: a word taken is not taken again for 10 minutes, so an AI that keeps
--                   failing or a used-up daily AI limit cannot wake the worker every minute all day.
--   tries           AI attempts that brought no answer (the worker counts them); after 3 the word is ignored. A word
--                   left because of the daily limit or the clock does not use one up.
--   pb_tag_file_claim  claims up to p_limit words in one statement (FOR UPDATE SKIP LOCKED): overlapping worker ticks
--                   never take the same word.
--   pb_tag_file     files ONE word in one transaction: the alias appended to the value's list in place (never a
--                   whole-array rewrite from a snapshot, which a concurrent edit could undo), or the word ignored. A
--                   word another value of the same attribute already has goes to that value (one word, one value).
--   trigger_pb_worker  also wakes the worker while a fileable word waits.
-- Additive: three columns (nullable or defaulted, no backfill), one partial index, two new functions (service role
-- only), one function replaced with the same signature. RLS on pb_tag_suggestions is unchanged (staff read; writes
-- only through the edge function).

alter table public.pb_tag_suggestions add column if not exists filed_by text check (filed_by in ('auto'));
alter table public.pb_tag_suggestions add column if not exists tries int not null default 0;
alter table public.pb_tag_suggestions add column if not exists tried_at timestamptz;
create index if not exists pb_tag_suggestions_file_idx on public.pb_tag_suggestions (tried_at nulls first, first_seen_at)
  where status = 'pending' and filed_by is null;

-- The words the worker may take now: pending, never filed by it, fewer than 3 unanswered AI tries, not taken in the
-- last 10 minutes. Taking a word only stamps tried_at.
create or replace function public.pb_tag_file_claim(p_limit int)
returns setof public.pb_tag_suggestions
language sql security invoker set search_path = public as $$
  update pb_tag_suggestions s set tried_at = now()
  where s.id in (select x.id from pb_tag_suggestions x
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
  select * into v from pb_attribute_values where id = p_value for update;
  if not found then return jsonb_build_object('filed', false); end if;
  select x.id into other from pb_attribute_values x
  where x.attribute_id = v.attribute_id and x.id <> v.id and (x.key = s.key or s.key = any(x.aliases)) limit 1;
  if other is not null then select * into v from pb_attribute_values where id = other for update; end if;
  if v.key <> s.key and not (s.key = any(v.aliases)) then
    update pb_attribute_values set aliases = aliases || s.key where id = v.id;
  end if;
  note := jsonb_build_object('value_id', v.id, 'why', left(coalesce(p_why, ''), 140), 'at', now(), 'match', p_match, 'by', 'auto');
  update pb_tag_suggestions set status = 'aliased', resolved_value_id = v.id, filed_by = 'auto', nearest = note where id = p_id;
  return jsonb_build_object('filed', true, 'status', 'aliased', 'value_id', v.id, 'attribute_id', v.attribute_id);
end $$;

revoke execute on function public.pb_tag_file_claim(int) from public, anon, authenticated;
revoke execute on function public.pb_tag_file(uuid, uuid, text, text) from public, anon, authenticated;
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
     and not exists (select 1 from pb_tag_suggestions where status = 'pending' and filed_by is null and tries < 3
                       and (tried_at is null or tried_at < now() - interval '10 minutes'))
  then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pb_worker_secret';
  if v_secret is null then raise warning 'pb_worker_secret missing from vault'; return null; end if;
  return net.http_post(
    url := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-products',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('action', 'work'),
    timeout_milliseconds := 150000);
end $function$;
