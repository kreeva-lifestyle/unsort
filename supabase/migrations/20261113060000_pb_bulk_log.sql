-- Playbook: the log of bulk changes, and taking one back.
--
-- WHY (owner, 2026-11-12): "We should also have revert option. Firstly log
-- all bulk changes we did for past 7 days with option to revert them. Only
-- those which are done in bulk. If by mistake we made changes in bulk we
-- should have the option to revert those changes. Also only allow those bulk
-- changes which can be reverted in bulk easily without creating any problem."
--
-- HOW:
--   * pb_bulk_runs  — one row per bulk change (what, who, when, how many).
--   * pb_bulk_items — every row that bulk change changed, as it was before
--     and as it was after. Written by a trigger in the same transaction as the
--     change itself, so a change can never go unrecorded: the server marks the
--     database calls of one bulk change with the request header x-pb-bulk
--     (pb_bulk_run(), previous migration) and the trigger records only those.
--   * pb_bulk_revert(run, apply) — puts back what the run changed, row by
--     row, and ONLY where the row is still as the run left it. A row somebody
--     changed since is left alone and counted. apply = false only counts
--     (the app shows the counts before asking).
--   * A listing that is already on a store is not hidden here (that needs a
--     call to Shopify): it is marked unpublish_due and the worker takes it off.
--
-- Additive only: two tables, two columns, two indexes, triggers and functions.
-- Nothing is dropped or rewritten. SECURITY INVOKER everywhere; the functions
-- that change data also check the caller is the server (service role), so a
-- signed-in member of staff cannot run a revert by calling the database.

-- ── 1. tables ─────────────────────────────────────────────────────────────
create table if not exists public.pb_bulk_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                       -- import | route_site | reprice_site | retry_failed | reread_failed | reread
  label text not null,                      -- the plain sentence the log shows
  website_id uuid references public.pb_websites(id) on delete set null,
  details jsonb not null default '{}'::jsonb, -- the action's own counts
  items integer not null default 0,         -- rows it changed (set when it ends)
  status text not null default 'running',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  reverted_by uuid references public.profiles(id) on delete set null,
  reverted_at timestamptz,
  revert_result jsonb,
  updated_at timestamptz not null default now(),
  constraint pb_bulk_runs_status_check check (status in ('running', 'done', 'reverted', 'partly_reverted'))
);
create index if not exists pb_bulk_runs_created_idx on public.pb_bulk_runs (created_at desc);

-- Append-only apart from `done` (this row's change was taken back, or was
-- looked at and left for good), so it has no updated_at.
create table if not exists public.pb_bulk_items (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.pb_bulk_runs(id) on delete cascade,
  tbl text not null,
  op text not null check (op in ('I', 'U', 'D')),
  pk jsonb not null,
  before jsonb,
  after jsonb,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pb_bulk_items_run_idx on public.pb_bulk_items (run_id, id);
create index if not exists pb_bulk_items_row_idx on public.pb_bulk_items (tbl, pk);

alter table public.pb_bulk_runs enable row level security;
alter table public.pb_bulk_items enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pb_bulk_runs' and policyname = 'pb staff read') then
    create policy "pb staff read" on public.pb_bulk_runs for select to authenticated using ((select public.app_is_staff()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pb_bulk_items' and policyname = 'pb staff read') then
    create policy "pb staff read" on public.pb_bulk_items for select to authenticated using ((select public.app_is_staff()));
  end if;
end $$;
create or replace trigger pb_bulk_runs_touch before update on public.pb_bulk_runs for each row execute function public.pb_touch();

-- ── 2. recording ──────────────────────────────────────────────────────────
-- AFTER ROW trigger. Arguments: the key column(s), then the columns worth
-- recording (comma lists). Does nothing unless the request carries a bulk run
-- id AND comes from the server: the usual write pays one settings lookup.
create or replace function public.pb_bulk_capture() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare r uuid; pkc text[]; cols text[]; b jsonb; a jsonb; k jsonb;
begin
  r := public.pb_bulk_run();
  if r is null then return null; end if; -- the usual write: not part of a bulk change
  if coalesce(auth.role(), '') <> 'service_role' then return null; end if; -- only the server's calls are recorded
  pkc := string_to_array(tg_argv[0], ',');
  cols := string_to_array(tg_argv[1], ',');
  if tg_op <> 'INSERT' then b := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then a := to_jsonb(new); end if;
  select jsonb_object_agg(e.key, e.value) into k from jsonb_each(coalesce(a, b)) e where e.key = any(pkc);
  if b is not null then select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into b from jsonb_each(b) e where e.key = any(cols); end if;
  if a is not null then select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into a from jsonb_each(a) e where e.key = any(cols); end if;
  if tg_op = 'UPDATE' and a = b then return null; end if; -- nothing worth recording changed
  insert into public.pb_bulk_items (run_id, tbl, op, pk, before, after) values (r, tg_table_name, left(tg_op, 1), k, b, a);
  return null;
end $$;

create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_listings
  for each row execute function public.pb_bulk_capture('id', 'product_id,website_id,status,rule_id,price,compare_at_price,error,attempts');
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_products
  for each row execute function public.pb_bulk_capture('id', 'status,ai_error,name,sku,source,source_ref');

-- ── 3. a listing the worker must take off its store ───────────────────────
alter table public.pb_listings add column if not exists unpublish_due boolean not null default false;
alter table public.pb_listings add column if not exists unpublish_tried_at timestamptz;
create index if not exists pb_listings_unpublish_due_idx on public.pb_listings (unpublish_tried_at) where unpublish_due;
comment on column public.pb_listings.unpublish_due is 'A revert took this listing back while it was on its store: the worker hides it there (pb-products takeOff.ts) and clears this.';

-- ── 4. what a run changed, net: the first "before" and the last "after" of each row ──
create or replace function public.pb_bulk_net(p_run uuid)
returns table (tbl text, pk jsonb, before jsonb, after jsonb)
language sql stable security invoker set search_path = public as $$
  select f.tbl, f.pk, f.before, l.after
  from (select distinct on (i.tbl, i.pk) i.tbl, i.pk, i.before from pb_bulk_items i where i.run_id = p_run and not i.done order by i.tbl, i.pk, i.id asc) f
  join (select distinct on (i.tbl, i.pk) i.tbl, i.pk, i.after from pb_bulk_items i where i.run_id = p_run and not i.done order by i.tbl, i.pk, i.id desc) l
    on l.tbl = f.tbl and l.pk = f.pk;
$$;

-- A listing a worker run holds right now (the same 5 minutes the server uses).
create or replace function public.pb_listing_busy(p_status text, p_claimed timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_status = 'generating' or (p_status = 'publishing' and p_claimed is not null and p_claimed > now() - interval '5 minutes');
$$;
-- A listing that is on sale on its store (the rule of pb_stock_save and pb-products stockSend.ts).
create or replace function public.pb_listing_on_sale(p_status text, p_shopify_id text, p_shopify_status text) returns boolean
language sql immutable set search_path = '' as $$
  select p_shopify_id is not null and not (p_status = 'skipped' and coalesce(p_shopify_status, '') in ('DRAFT', 'ARCHIVED'));
$$;

-- ── 5. taking back: one function per kind of change ───────────────────────
-- Each returns counts. With p_apply = false nothing is changed. A row that is
-- settled (put back, or left for good) is marked done; a busy row is not, so
-- "Revert" can be tapped again for it a few minutes later.

-- Re-priced listings: the old price and compare-at price back; a listing that
-- is live is sent to its store again.
create or replace function public.pb_bulk_revert_prices(p_run uuid, p_apply boolean) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n record; l pb_listings; v text; restored int := 0; resend int := 0; changed int := 0; gone int := 0; busy int := 0;
begin
  for n in select * from pb_bulk_net(p_run) x where x.tbl = 'pb_listings' loop
    select * into l from pb_listings where id = (n.pk ->> 'id')::uuid for update;
    if l.id is null then v := 'gone'; gone := gone + 1;
    elsif l.price is distinct from (n.after ->> 'price')::numeric or l.compare_at_price is distinct from (n.after ->> 'compare_at_price')::numeric
          or 'price' = any(l.locked) then v := 'changed'; changed := changed + 1;
    elsif pb_listing_busy(l.status, l.claimed_at) then v := 'busy'; busy := busy + 1;
    else
      v := 'restore'; restored := restored + 1;
      if l.status = 'published' then resend := resend + 1; end if;
      if p_apply then
        update pb_listings set price = (n.before ->> 'price')::numeric, compare_at_price = (n.before ->> 'compare_at_price')::numeric,
          status = case when status = 'published' then 'publishing' else status end,
          attempts = case when status = 'published' then 0 else attempts end,
          error = case when status = 'published' then null else error end,
          claimed_at = case when status = 'published' then null else claimed_at end
        where id = l.id;
      end if;
    end if;
    if p_apply and v <> 'busy' then update pb_bulk_items set done = true where run_id = p_run and tbl = 'pb_listings' and pk = n.pk; end if;
  end loop;
  return jsonb_build_object('restored', restored, 'resend', resend, 'changed', changed, 'gone', gone, 'busy', busy);
end $$;

-- "Send matching products": the listings it queued are set aside with p_note
-- (routing leaves them alone; "Send matching products now" takes them again).
-- One that is on its store already is marked for the worker to take off.
create or replace function public.pb_bulk_revert_send(p_run uuid, p_apply boolean, p_note text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n record; l pb_listings; v text; aside int := 0; live int := 0; off int := 0; gone int := 0; busy int := 0;
begin
  for n in select * from pb_bulk_net(p_run) x where x.tbl = 'pb_listings' loop
    select * into l from pb_listings where id = (n.pk ->> 'id')::uuid for update;
    if l.id is null then v := 'gone'; gone := gone + 1;
    elsif l.unpublish_due or (l.status = 'skipped' and not pb_listing_on_sale(l.status, l.shopify_product_id, l.shopify_status)) then v := 'off'; off := off + 1; -- already off, or on its way
    elsif pb_listing_busy(l.status, l.claimed_at) then v := 'busy'; busy := busy + 1;
    elsif pb_listing_on_sale(l.status, l.shopify_product_id, l.shopify_status) then
      v := 'live'; live := live + 1;
      if p_apply then update pb_listings set unpublish_due = true, unpublish_tried_at = null where id = l.id; end if;
    else
      v := 'aside'; aside := aside + 1;
      if p_apply then update pb_listings set status = 'skipped', error = p_note, attempts = 0, claimed_at = null where id = l.id; end if;
    end if;
    if p_apply and v <> 'busy' then update pb_bulk_items set done = true where run_id = p_run and tbl = 'pb_listings' and pk = n.pk; end if;
  end loop;
  return jsonb_build_object('aside', aside, 'live', live, 'off', off, 'gone', gone, 'busy', busy);
end $$;

-- "Retry all failed": the listings nothing has picked up yet go back to Failed
-- with their old message. What was already tried again stays as it is.
create or replace function public.pb_bulk_revert_retry(p_run uuid, p_apply boolean) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n record; l pb_listings; stopped int := 0; went int := 0; gone int := 0;
begin
  for n in select * from pb_bulk_net(p_run) x where x.tbl = 'pb_listings' loop
    select * into l from pb_listings where id = (n.pk ->> 'id')::uuid for update;
    if l.id is null then gone := gone + 1;
    elsif l.status = (n.after ->> 'status') and l.attempts = 0 and l.error is null and l.claimed_at is null and (n.before ->> 'status') = 'failed' then
      stopped := stopped + 1;
      if p_apply then update pb_listings set status = 'failed', attempts = coalesce((n.before ->> 'attempts')::int, 0), error = n.before ->> 'error' where id = l.id; end if;
    else went := went + 1;
    end if;
    if p_apply then update pb_bulk_items set done = true where run_id = p_run and tbl = 'pb_listings' and pk = n.pk; end if;
  end loop;
  return jsonb_build_object('stopped', stopped, 'went', went, 'gone', gone);
end $$;

-- "Read again" for products the reader gave up on: the ones not read yet go
-- back to Needs info with their old message.
create or replace function public.pb_bulk_revert_unread(p_run uuid, p_apply boolean) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n record; p pb_products; stopped int := 0; went int := 0; gone int := 0;
begin
  for n in select * from pb_bulk_net(p_run) x where x.tbl = 'pb_products' loop
    select * into p from pb_products where id = (n.pk ->> 'id')::uuid for update;
    if p.id is null then gone := gone + 1;
    elsif p.status = 'new' and p.ai_error is null and p.claimed_at is null and (n.before ->> 'status') = 'needs_info' then
      stopped := stopped + 1;
      if p_apply then update pb_products set status = 'needs_info', ai_error = n.before ->> 'ai_error' where id = p.id; end if;
    else went := went + 1;
    end if;
    if p_apply then update pb_bulk_items set done = true where run_id = p_run and tbl = 'pb_products' and pk = n.pk; end if;
  end loop;
  return jsonb_build_object('stopped', stopped, 'went', went, 'gone', gone);
end $$;

-- The reader's text of a field the way its log keeps it (pb-products readChanges.ts txt).
create or replace function public.pb_read_txt(p text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), 200);
$$;

-- A re-read: each field the read changed goes back to what it was, where the
-- product still holds what the read wrote and nobody typed that field since.
-- before / after: { name, color, fabric, category, sku, attributes: { work, … } }.
create or replace function public.pb_bulk_revert_fields(p_run uuid, p_apply boolean) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n record; p pb_products; f text; cur text; ok int; skip int; set_cols jsonb; set_attrs jsonb;
  restored int := 0; fields int := 0; changed int := 0; gone int := 0; ids uuid[] := '{}';
begin
  for n in select * from pb_bulk_net(p_run) x where x.tbl = 'pb_products' loop
    select * into p from pb_products where id = (n.pk ->> 'id')::uuid for update;
    if p.id is null then gone := gone + 1;
    else
      ok := 0; skip := 0; set_cols := '{}'::jsonb; set_attrs := '{}'::jsonb;
      for f in select jsonb_object_keys(n.before - 'attributes') loop
        cur := pb_read_txt(to_jsonb(p) ->> f);
        if f = any(p.locked) or cur is distinct from (n.after ->> f) then skip := skip + 1;
        else ok := ok + 1; set_cols := set_cols || jsonb_build_object(f, n.before ->> f);
        end if;
      end loop;
      for f in select jsonb_object_keys(coalesce(n.before -> 'attributes', '{}'::jsonb)) loop
        cur := pb_read_txt(p.attributes ->> f);
        if 'attributes' = any(p.locked) or f = any(p.locked) or cur is distinct from (n.after -> 'attributes' ->> f) then skip := skip + 1;
        else ok := ok + 1; set_attrs := set_attrs || jsonb_build_object(f, n.before -> 'attributes' ->> f);
        end if;
      end loop;
      if ok > 0 then
        restored := restored + 1; fields := fields + ok; ids := ids || p.id;
        if p_apply then
          update pb_products set
            name = case when set_cols ? 'name' then set_cols ->> 'name' else name end,
            color = case when set_cols ? 'color' then set_cols ->> 'color' else color end,
            fabric = case when set_cols ? 'fabric' then set_cols ->> 'fabric' else fabric end,
            category = case when set_cols ? 'category' then set_cols ->> 'category' else category end,
            sku = case when set_cols ? 'sku' then set_cols ->> 'sku' else sku end,
            attributes = attributes || set_attrs,
            route_due = (status = 'ready') or route_due
          where id = p.id;
        end if;
      else changed := changed + 1;
      end if;
    end if;
    if p_apply then update pb_bulk_items set done = true where run_id = p_run and tbl = 'pb_products' and pk = n.pk; end if;
  end loop;
  if p_apply and cardinality(ids) > 0 then perform 1 from pb_products_refresh(ids); end if;
  return jsonb_build_object('restored', restored, 'fields', fields, 'changed', changed, 'gone', gone, 'ids', to_jsonb(ids));
end $$;

-- An import: which of the products it added can be removed again. Only
-- looks; the server deletes them (their photo files live in storage).
--   delete  — untouched and on no store
--   on_site — a listing of it is on a store: take it off there first
--   edited  — somebody typed into it since
--   busy    — being read, written or sent right now
create or replace function public.pb_bulk_import_targets(p_run uuid)
returns table (product_id uuid, verdict text)
language sql stable security invoker set search_path = public as $$
  select (n.pk ->> 'id')::uuid,
    case
      when p.id is null then 'gone'
      when exists (select 1 from pb_listings l where l.product_id = p.id and pb_listing_on_sale(l.status, l.shopify_product_id, l.shopify_status)) then 'on_site'
      when cardinality(p.locked) > 0 then 'edited'
      when (p.status = 'reading' and p.claimed_at > now() - interval '5 minutes')
        or exists (select 1 from pb_listings l where l.product_id = p.id and pb_listing_busy(l.status, l.claimed_at)) then 'busy'
      else 'delete'
    end
  from pb_bulk_net(p_run) n
  left join pb_products p on p.id = (n.pk ->> 'id')::uuid
  where n.tbl = 'pb_products' and n.before is null;
$$;

-- The server reports the products of an import it has dealt with.
create or replace function public.pb_bulk_mark_done(p_run uuid, p_tbl text, p_ids uuid[]) returns int
language plpgsql security invoker set search_path = public as $$
declare c int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  update pb_bulk_items set done = true where run_id = p_run and tbl = p_tbl and (pk ->> 'id')::uuid = any(p_ids);
  get diagnostics c = row_count;
  return c;
end $$;

-- ── 6. the one entry point ────────────────────────────────────────────────
-- p_apply = false: only counts what a revert would do now. Refuses, in plain
-- words, what must not be reverted: a change still running, one already taken
-- back, one older than 7 days, and one whose rows a LATER bulk change of the
-- same kind also changed (that one has to be taken back first, or prices and
-- fields would end up as a mix that never existed).
create or replace function public.pb_bulk_revert(p_run uuid, p_apply boolean default false, p_user uuid default null, p_note text default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r pb_bulk_runs; b record; res jsonb; prev jsonb; k text; merged jsonb := '{}'::jsonb;
begin
  if p_apply and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  select * into r from pb_bulk_runs where id = p_run for update;
  if r.id is null then raise exception 'That bulk change is no longer in the list.'; end if;
  if r.status = 'running' then raise exception 'This is still running. Wait until it has finished.'; end if;
  if r.status = 'reverted' then raise exception 'This was already reverted.'; end if;
  if r.created_at < now() - interval '7 days' then raise exception 'This is more than 7 days old, so it can no longer be reverted.'; end if;
  if r.kind in ('reprice_site', 'reread') then
    select x.label, x.created_at into b from pb_bulk_runs x
    where x.kind = r.kind and x.created_at > r.created_at and x.status in ('done', 'partly_reverted')
      and exists (select 1 from pb_bulk_items mine join pb_bulk_items theirs on theirs.tbl = mine.tbl and theirs.pk = mine.pk
                  where mine.run_id = r.id and theirs.run_id = x.id and not mine.done and not theirs.done)
    order by x.created_at desc limit 1;
    if found then
      raise exception 'A later bulk change touched some of the same items: "%" (%). Revert that one first.', b.label, to_char(b.created_at at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI am');
    end if;
  end if;
  case r.kind
    when 'reprice_site' then res := pb_bulk_revert_prices(p_run, p_apply);
    when 'route_site' then res := pb_bulk_revert_send(p_run, p_apply, coalesce(p_note, 'Taken back by a revert.'));
    when 'retry_failed' then res := pb_bulk_revert_retry(p_run, p_apply);
    when 'reread_failed' then res := pb_bulk_revert_unread(p_run, p_apply);
    when 'reread' then res := pb_bulk_revert_fields(p_run, p_apply);
    when 'import' then
      select coalesce(jsonb_object_agg(t.verdict, t.n), '{}'::jsonb) into res from (select verdict, count(*) n from pb_bulk_import_targets(p_run) group by verdict) t;
    else raise exception 'This kind of bulk change cannot be reverted.';
  end case;
  if p_apply and r.kind <> 'import' then
    -- Tapped again for the rows that were busy: the counts add up, "busy" is what is busy now.
    prev := coalesce(r.revert_result, '{}'::jsonb);
    for k in select jsonb_object_keys(res) loop
      if jsonb_typeof(res -> k) = 'number' and k <> 'busy' then merged := merged || jsonb_build_object(k, coalesce((prev ->> k)::int, 0) + (res ->> k)::int);
      else merged := merged || jsonb_build_object(k, res -> k);
      end if;
    end loop;
    update pb_bulk_runs set status = case when coalesce((res ->> 'busy')::int, 0) > 0 then 'partly_reverted' else 'reverted' end,
      reverted_by = coalesce(p_user, reverted_by), reverted_at = now(), revert_result = merged - 'ids'
    where id = p_run;
  end if;
  return res || jsonb_build_object('kind', r.kind, 'label', r.label);
end $$;

-- The server closes an import's revert itself (it deletes the products in batches).
create or replace function public.pb_bulk_close(p_run uuid, p_user uuid, p_result jsonb, p_more boolean) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  update pb_bulk_runs set status = case when p_more then 'partly_reverted' else 'reverted' end, reverted_by = coalesce(p_user, reverted_by), reverted_at = now(), revert_result = p_result
  where id = p_run;
end $$;

-- ── 7. the worker also wakes for a listing that must come off its store ───
-- As 20261113020000_pb_stock_due_media_check.sql, plus unpublish_due: like a
-- stock change it is never held back by a pause.
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
  then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pb_worker_secret';
  if v_secret is null then raise warning 'pb_worker_secret missing from vault'; return null; end if;
  return net.http_post(
    url := 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pb-products',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('action', 'work'),
    timeout_milliseconds := 150000);
end $function$;
