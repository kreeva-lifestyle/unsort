-- Playbook bulk-change log, part 2: changes to the tag lists and a vendor's
-- stock notice are recorded and can be taken back too.
--
-- WHY (owner, 2026-11-12): "only allow those bulk changes which can be
-- reverted in bulk easily without creating any problem". Part 1
-- (20261113060000) covered imports, sends, re-pricing, retries. Still outside
-- the log were the changes that reach many products through the tag lists
-- (delete or merge a value, delete an attribute, a category's must-have tags,
-- the category list, suggestions handled in bulk, "Retag all", "Let AI
-- decide") and a vendor's stock notice (one message, many products sold out
-- or archived). This adds them:
--   * the recording trigger on the six tables those changes write to;
--   * pb_bulk_revert_tags — one revert for every tag change: the rows the
--     change deleted come back, the rows it added go, in the order the tables
--     depend on each other, then the products are checked again;
--   * pb_bulk_revert_stock — a notice's products get their stock back, and the
--     listings it took off the websites are put back;
--   * pb_listings.put_back — "this send must also make the product visible
--     again" (a plain update leaves a hidden or archived Shopify product as it
--     is): set when a taken-back listing is sent again.
-- Additive only. The live tag lists are empty today (no attribute, no value),
-- so the new triggers have nothing to record yet.

-- ── 1. a send that must also make the product visible again ───────────────
alter table public.pb_listings add column if not exists put_back boolean not null default false;
comment on column public.pb_listings.put_back is 'The next publish also sets the Shopify product Active again (it was hidden or archived there and is being put back in bulk). Cleared by that publish.';

-- ── 2. recording on the tag tables; stock fields on products ──────────────
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_attributes
  for each row execute function public.pb_bulk_capture('id', 'id,name,key,multi,position,shopify_prefix');
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_attribute_values
  for each row execute function public.pb_bulk_capture('id', 'id,attribute_id,name,key,aliases,position');
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_category_attributes
  for each row execute function public.pb_bulk_capture('category,attribute_id', 'category,attribute_id,position');
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_product_values
  for each row execute function public.pb_bulk_capture('product_id,value_id', 'product_id,value_id,source');
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_tag_suggestions
  for each row execute function public.pb_bulk_capture('id', 'id,phrase,key,attribute_id,status,uses,examples,source,resolved_value_id,first_seen_at,last_seen_at');
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_settings
  for each row execute function public.pb_bulk_capture('key', 'key,value');
create or replace trigger pb_bulk_capture after insert or update or delete on public.pb_products
  for each row execute function public.pb_bulk_capture('id', 'status,ai_error,name,sku,source,source_ref,in_stock,temp_out_at,perm_out_at');

-- How many products a bulk change touched (through their own row or their tags).
create or replace function public.pb_bulk_products(p_run uuid) returns int
language sql stable security invoker set search_path = public as $$
  select count(distinct coalesce(i.pk ->> 'product_id', i.pk ->> 'id'))::int
  from pb_bulk_items i where i.run_id = p_run and i.tbl in ('pb_products', 'pb_product_values');
$$;

-- ── 3. taking back a change to the tag lists ──────────────────────────────
-- Always applies; pb_bulk_revert_tags wraps it so that a preview is undone.
-- Order: attributes → their values → category links → products' values →
-- suggestions → the category list; then the products are checked again
-- (pb_products_refresh: missing tags, Ready / Needs info).
-- Left alone: a product whose tags a person set (or asked the AI to fill)
-- after the change; a value whose name is taken again; a single-choice
-- attribute that has another value on the product by now.
create or replace function public.pb_bulk_tags_apply(p_run uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r pb_bulk_runs; ids uuid[]; hand uuid[]; touched uuid[] := '{}'; got uuid[]; c int;
  attrs_back int := 0; values_back int := 0; values_gone int := 0; rows_out int := 0; rows_in int := 0; wanted int := 0;
begin
  select * into r from pb_bulk_runs where id = p_run;
  select coalesce(array_agg(distinct (n.pk ->> 'product_id')::uuid), '{}') into ids from pb_bulk_net(p_run) n where n.tbl = 'pb_product_values';
  select coalesce(array_agg(distinct a.product_id), '{}') into hand from pb_activity a
  where a.created_at > r.created_at and a.product_id = any(ids)
    and ((a.action = 'edited' and a.details -> 'fields' ? 'tags') or (a.action = 'tags_filled' and a.details ->> 'manual' = 'true'));

  -- attributes the change deleted
  insert into pb_attributes (id, name, key, multi, position, shopify_prefix)
  select (b ->> 'id')::uuid, b ->> 'name', b ->> 'key', (b ->> 'multi')::boolean, (b ->> 'position')::int, b ->> 'shopify_prefix'
  from (select n.before b from pb_bulk_net(p_run) n where n.tbl = 'pb_attributes' and n.before is not null and n.after is null) s
  where not exists (select 1 from pb_attributes a where a.id = (b ->> 'id')::uuid or a.key = b ->> 'key');
  get diagnostics attrs_back = row_count;

  -- "also known as" words: what the change added goes, what it removed comes back (a merge gave the kept value the
  -- other one's name; that has to go before the other value can come back under it)
  update pb_attribute_values v set aliases = array(
      select distinct x from unnest(array(select a from unnest(v.aliases) a where not (a = any(d.added))) || d.removed) x
      where x <> v.key and not exists (select 1 from pb_attribute_values o where o.attribute_id = v.attribute_id and o.id <> v.id and (o.key = x or x = any(o.aliases))) order by 1)
  from (select (n.pk ->> 'id')::uuid as id,
          array(select x from jsonb_array_elements_text(n.after -> 'aliases') x where not (n.before -> 'aliases') ? x) as added,
          array(select x from jsonb_array_elements_text(n.before -> 'aliases') x where not (n.after -> 'aliases') ? x) as removed
        from pb_bulk_net(p_run) n where n.tbl = 'pb_attribute_values' and n.before is not null and n.after is not null) d
  where v.id = d.id and (cardinality(d.added) > 0 or cardinality(d.removed) > 0);

  -- values the change deleted (their attribute is there, their name is free)
  insert into pb_attribute_values (id, attribute_id, name, key, aliases, position)
  select (b ->> 'id')::uuid, (b ->> 'attribute_id')::uuid, b ->> 'name', b ->> 'key',
    array(select x from jsonb_array_elements_text(b -> 'aliases') x
          where not exists (select 1 from pb_attribute_values o where o.attribute_id = (b ->> 'attribute_id')::uuid and (o.key = x or x = any(o.aliases)))),
    (b ->> 'position')::int
  from (select n.before b from pb_bulk_net(p_run) n where n.tbl = 'pb_attribute_values' and n.before is not null and n.after is null) s
  where exists (select 1 from pb_attributes a where a.id = (b ->> 'attribute_id')::uuid)
    and not exists (select 1 from pb_attribute_values o where o.id = (b ->> 'id')::uuid
                    or (o.attribute_id = (b ->> 'attribute_id')::uuid and (o.key = b ->> 'key' or (b ->> 'key') = any(o.aliases))));
  get diagnostics values_back = row_count;

  -- category links: deleted ones back, added ones out, a moved one to its old place
  insert into pb_category_attributes (category, attribute_id, position)
  select b ->> 'category', (b ->> 'attribute_id')::uuid, (b ->> 'position')::int
  from (select n.before b from pb_bulk_net(p_run) n where n.tbl = 'pb_category_attributes' and n.before is not null and n.after is null) s
  where exists (select 1 from pb_attributes a where a.id = (b ->> 'attribute_id')::uuid)
  on conflict (category, attribute_id) do nothing;
  delete from pb_category_attributes ca using pb_bulk_net(p_run) n
  where n.tbl = 'pb_category_attributes' and n.before is null and n.after is not null
    and ca.category = n.pk ->> 'category' and ca.attribute_id = (n.pk ->> 'attribute_id')::uuid and ca.position = (n.after ->> 'position')::int;
  update pb_category_attributes ca set position = (n.before ->> 'position')::int from pb_bulk_net(p_run) n
  where n.tbl = 'pb_category_attributes' and n.before is not null and n.after is not null
    and ca.category = n.pk ->> 'category' and ca.attribute_id = (n.pk ->> 'attribute_id')::uuid and ca.position = (n.after ->> 'position')::int;

  -- products' values: what the change gave them goes, what it took comes back
  with gone as (
    delete from pb_product_values pv using pb_bulk_net(p_run) n
    where n.tbl = 'pb_product_values' and n.before is null and n.after is not null
      and pv.product_id = (n.pk ->> 'product_id')::uuid and pv.value_id = (n.pk ->> 'value_id')::uuid and pv.source = n.after ->> 'source'
      and not (pv.product_id = any(hand))
    returning pv.product_id)
  select count(*), coalesce(array_agg(distinct product_id), '{}') into rows_out, got from gone;
  touched := touched || got;
  select count(*) into wanted from pb_bulk_net(p_run) n where n.tbl = 'pb_product_values' and n.before is not null and n.after is null;
  with back as (
    insert into pb_product_values (product_id, value_id, source)
    select d.pid, d.vid, d.src
    from (select (n.pk ->> 'product_id')::uuid as pid, (n.pk ->> 'value_id')::uuid as vid, n.before ->> 'source' as src
          from pb_bulk_net(p_run) n where n.tbl = 'pb_product_values' and n.before is not null and n.after is null) d
    join pb_attribute_values v on v.id = d.vid join pb_attributes a on a.id = v.attribute_id join pb_products p on p.id = d.pid
    where not (d.pid = any(hand))
      and (a.multi or not exists (select 1 from pb_product_values o join pb_attribute_values ov on ov.id = o.value_id where o.product_id = d.pid and ov.attribute_id = a.id))
    on conflict on constraint pb_product_values_pkey do nothing
    returning product_id)
  select count(*), coalesce(array_agg(distinct product_id), '{}') into rows_in, got from back;
  touched := touched || got;
  update pb_product_values pv set source = n.before ->> 'source' from pb_bulk_net(p_run) n
  where n.tbl = 'pb_product_values' and n.before is not null and n.after is not null
    and pv.product_id = (n.pk ->> 'product_id')::uuid and pv.value_id = (n.pk ->> 'value_id')::uuid and pv.source = n.after ->> 'source' and not (pv.product_id = any(hand));

  -- values the change added (a suggestion made into a value): out, unless something else uses them by now
  delete from pb_attribute_values v using pb_bulk_net(p_run) n
  where n.tbl = 'pb_attribute_values' and n.before is null and n.after is not null and v.id = (n.pk ->> 'id')::uuid and v.key = n.after ->> 'key'
    and not exists (select 1 from pb_product_values pv where pv.value_id = v.id);
  get diagnostics values_gone = row_count;

  -- suggestions: deleted ones back, changed ones as they were (where still as the change left them)
  insert into pb_tag_suggestions (id, phrase, key, attribute_id, status, uses, examples, source, resolved_value_id, first_seen_at, last_seen_at)
  select (b ->> 'id')::uuid, b ->> 'phrase', b ->> 'key', a.id, b ->> 'status', (b ->> 'uses')::int,
    array(select x::uuid from jsonb_array_elements_text(b -> 'examples') x where exists (select 1 from pb_products p where p.id = x::uuid)),
    b ->> 'source', v.id, (b ->> 'first_seen_at')::timestamptz, (b ->> 'last_seen_at')::timestamptz
  from (select n.before b from pb_bulk_net(p_run) n where n.tbl = 'pb_tag_suggestions' and n.before is not null and n.after is null) s
  left join pb_attributes a on a.id = (b ->> 'attribute_id')::uuid
  left join pb_attribute_values v on v.id = (b ->> 'resolved_value_id')::uuid
  where not exists (select 1 from pb_tag_suggestions o where o.id = (b ->> 'id')::uuid
                    or (o.key = b ->> 'key' and o.attribute_id is not distinct from a.id));
  update pb_tag_suggestions s set status = n.before ->> 'status',
    attribute_id = (select a.id from pb_attributes a where a.id = (n.before ->> 'attribute_id')::uuid),
    resolved_value_id = (select v.id from pb_attribute_values v where v.id = (n.before ->> 'resolved_value_id')::uuid),
    uses = greatest(0, s.uses - ((n.after ->> 'uses')::int - (n.before ->> 'uses')::int))
  from pb_bulk_net(p_run) n
  where n.tbl = 'pb_tag_suggestions' and n.before is not null and n.after is not null and s.id = (n.pk ->> 'id')::uuid
    and s.status = n.after ->> 'status' and s.attribute_id is not distinct from (n.after ->> 'attribute_id')::uuid
    and not exists (select 1 from pb_tag_suggestions o where o.id <> s.id and o.key = s.key
                    and o.attribute_id is not distinct from (select a.id from pb_attributes a where a.id = (n.before ->> 'attribute_id')::uuid));

  -- the category list
  update pb_settings st set value = n.before -> 'value' from pb_bulk_net(p_run) n
  where n.tbl = 'pb_settings' and n.pk ->> 'key' = 'categories' and st.key = 'categories' and n.before is not null and n.after is not null and st.value = n.after -> 'value';

  -- every product the change reached is checked again
  perform 1 from pb_products_refresh(array(
    select unnest(ids)
    union select p.id from pb_products p where p.status <> 'archived' and lower(p.category) in (
      select lower(n.pk ->> 'category') from pb_bulk_net(p_run) n where n.tbl = 'pb_category_attributes')));
  select count(distinct x) into c from unnest(touched) x;
  update pb_bulk_items set done = true where run_id = p_run;
  return jsonb_build_object('products', c, 'kept', cardinality(hand), 'values_back', values_back + attrs_back, 'values_gone', values_gone,
    'left', greatest(0, wanted - rows_in), 'tags_out', rows_out, 'tags_in', rows_in);
end $$;

create or replace function public.pb_bulk_revert_tags(p_run uuid, p_apply boolean) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare res jsonb;
begin
  begin
    res := pb_bulk_tags_apply(p_run);
    if not p_apply then raise exception using errcode = 'PB001', message = 'preview'; end if;
  exception when sqlstate 'PB001' then
    null; -- a preview: everything the block did is undone, the counts stay
  end;
  return res;
end $$;

-- ── 4. taking back a vendor's stock notice ────────────────────────────────
-- Each product the notice marked gets back the stock it had, where its stock
-- is still as the notice left it. Its stores are told (pb_stock_save marks the
-- listings). After a PERMANENT notice the product also comes out of the
-- archive, and the listings the notice took off are put back: one archived on
-- Shopify is sent again and made visible (put_back), one that was only set
-- aside goes back to where it waited. p_note = the note such a listing carries.
create or replace function public.pb_bulk_revert_stock(p_run uuid, p_apply boolean, p_note text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n record; p pb_products; restored int := 0; changed int := 0; gone int := 0; back int := 0; c int; ids uuid[] := '{}';
begin
  for n in select * from pb_bulk_net(p_run) x where x.tbl = 'pb_products' loop
    select * into p from pb_products where id = (n.pk ->> 'id')::uuid for update;
    if p.id is null then gone := gone + 1;
    elsif p.in_stock is distinct from (n.after ->> 'in_stock')::boolean or (p.perm_out_at is null) <> ((n.after ->> 'perm_out_at') is null)
          or (p.temp_out_at is null) <> ((n.after ->> 'temp_out_at') is null) then changed := changed + 1;
    else
      restored := restored + 1;
      select count(*) into c from pb_listings l where l.product_id = p.id and l.status = 'skipped' and l.error = p_note;
      back := back + c;
      if p_apply then
        perform pb_stock_save(p.id, jsonb_build_object('in_stock', (n.before ->> 'in_stock')::boolean, 'temp_out_at', n.before ->> 'temp_out_at', 'perm_out_at', n.before ->> 'perm_out_at'));
        if p.status = 'archived' and (n.before ->> 'status') <> 'archived' and (n.after ->> 'perm_out_at') is not null then
          update pb_products set status = 'ready' where id = p.id; -- the check below decides Ready / Needs info
          ids := ids || p.id;
        end if;
        -- listings the notice itself set aside (recorded): back to where they waited
        update pb_listings l set status = x.before ->> 'status', error = x.before ->> 'error', attempts = 0, claimed_at = null
        from pb_bulk_net(p_run) x
        where x.tbl = 'pb_listings' and l.id = (x.pk ->> 'id')::uuid and l.product_id = p.id and l.status = 'skipped' and l.error = p_note
          and x.before ->> 'status' is not null and x.before ->> 'status' <> 'skipped';
        -- taken off later, by the stock send or a publish: archived on Shopify → sent again and made visible; never sent → written again
        update pb_listings l set status = case when l.shopify_product_id is not null and l.generated_at is not null then 'publishing' else 'queued' end,
          put_back = l.shopify_product_id is not null, error = null, attempts = 0, claimed_at = null
        where l.product_id = p.id and l.status = 'skipped' and l.error = p_note;
      end if;
    end if;
    if p_apply then update pb_bulk_items set done = true where run_id = p_run and (pk ->> 'id' = n.pk ->> 'id' or after ->> 'product_id' = n.pk ->> 'id'); end if;
  end loop;
  if p_apply then
    if cardinality(ids) > 0 then perform 1 from pb_products_refresh(ids); update pb_products set route_due = true where id = any(ids) and status = 'ready'; end if;
    update pb_bulk_items set done = true where run_id = p_run;
  end if;
  return jsonb_build_object('restored', restored, 'changed', changed, 'gone', gone, 'back', back);
end $$;

-- ── 5. the entry point knows the new kinds ────────────────────────────────
-- As 20261113060000 and 20261113120000 (held copies), plus: the tag kinds and stock_notice; and "a later bulk
-- change of the same family on the same rows goes first" now also holds among
-- the tag kinds and among stock notices.
create or replace function public.pb_bulk_revert(p_run uuid, p_apply boolean default false, p_user uuid default null, p_note text default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r pb_bulk_runs; b record; res jsonb; prev jsonb; k text; merged jsonb := '{}'::jsonb; family text[];
  tags constant text[] := array['retag', 'tag_fill', 'value_delete', 'value_merge', 'attribute_delete', 'categories', 'category_links', 'suggestions'];
begin
  if p_apply and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  select * into r from pb_bulk_runs where id = p_run for update;
  if r.id is null then raise exception 'That bulk change is no longer in the list.'; end if;
  if r.status = 'running' then raise exception 'This is still running. Wait until it has finished.'; end if;
  if r.status = 'reverted' then raise exception 'This was already reverted.'; end if;
  if r.created_at < now() - interval '7 days' then raise exception 'This is more than 7 days old, so it can no longer be reverted.'; end if;
  family := case when r.kind = any(tags) then tags when r.kind in ('reprice_site', 'reread', 'stock_notice') then array[r.kind] end;
  if family is not null then
    select x.label, x.created_at into b from pb_bulk_runs x
    where x.kind = any(family) and x.created_at > r.created_at and x.status in ('done', 'partly_reverted')
      and exists (select 1 from pb_bulk_items mine join pb_bulk_items theirs on theirs.tbl = mine.tbl and theirs.pk = mine.pk
                  where mine.run_id = r.id and theirs.run_id = x.id and not mine.done and not theirs.done)
    order by x.created_at desc limit 1;
    if found then
      raise exception 'A later bulk change touched some of the same items: "%" (%). Revert that one first.', b.label, to_char(b.created_at at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI am');
    end if;
  end if;
  if r.kind = any(tags) then res := pb_bulk_revert_tags(p_run, p_apply);
  else
    case r.kind
      when 'reprice_site' then res := pb_bulk_revert_prices(p_run, p_apply);
      when 'route_site' then res := pb_bulk_revert_send(p_run, p_apply, coalesce(p_note, 'Taken back by a revert.'));
      when 'retry_failed' then res := pb_bulk_revert_retry(p_run, p_apply);
      when 'reread_failed' then res := pb_bulk_revert_unread(p_run, p_apply);
      when 'reread' then res := pb_bulk_revert_fields(p_run, p_apply);
      when 'copies' then res := pb_bulk_revert_copies(p_run, p_apply); -- 20261113120000_pb_copies.sql
      when 'stock_notice' then res := pb_bulk_revert_stock(p_run, p_apply, coalesce(p_note, ''));
      when 'import' then
        select coalesce(jsonb_object_agg(t.verdict, t.n), '{}'::jsonb) into res from (select verdict, count(*) n from pb_bulk_import_targets(p_run) group by verdict) t;
      else raise exception 'This kind of bulk change cannot be reverted.';
    end case;
  end if;
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
