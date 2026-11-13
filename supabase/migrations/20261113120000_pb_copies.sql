-- Playbook: held copies can be found and cleared together (pre-launch fix D18).
--
-- WHY: a vendor's re-post that looks like a product already added waits in
-- Needs info ("Already here as KB 302") among the products that are really
-- incomplete. The Products list could not show the copies alone, because
-- "held as a copy" was worked out on the fly, product by product, and each
-- copy had to be opened and answered by itself — third and fourth repeats
-- piled up.
--
-- HOW:
--   * pb_products.copy_of — WHAT the Ready gate holds a product as a copy of.
--     The gate (pb_products_refresh) writes it in the same update as the
--     status it explains, so the two can never disagree. The list filters and
--     counts on it.
--   * pb_copies_archive(apply, user) — archives the held copies in one go.
--     Only the ones with nothing of their own to lose: a copy that is already
--     on a store, or that came with a vendor price the earlier product lacks
--     or contradicts, is left for a person and counted. Each copy is judged
--     again at that moment (pb_dup_held), not taken from the stored note.
--     apply = false only counts (the app shows the counts before asking).
--   * The server runs it as a bulk change (x-pb-bulk), so the log keeps every
--     product it archived and pb_bulk_revert_copies can take it back for 7
--     days: archived → Needs info, where the product is still as it was left.
--     No answer is stored for the pair, so nothing is left behind by a revert.
--
-- Additive only: one column, one index, two new functions, two replaced with
-- the same signature. Nothing is dropped. SECURITY INVOKER; the functions that
-- change data check that the caller is the server.

-- ── 1. what the gate holds a product as a copy of ─────────────────────────
alter table public.pb_products add column if not exists copy_of uuid references public.pb_products(id) on delete set null;
comment on column public.pb_products.copy_of is 'The earlier product the Ready gate holds this one as a copy of (pb_products_refresh writes it with the status); null when it is not held.';
create index if not exists pb_products_copy_of_idx on public.pb_products (copy_of) where copy_of is not null;

-- ── 2. the gate keeps it ──────────────────────────────────────────────────
-- As 20261112150000_pb_duplicates.sql, plus: copy_of is saved, and a product
-- whose only change is what it is held for is written too.
create or replace function public.pb_products_refresh(p_ids uuid[])
returns table (id uuid, status text, was text, missing text[])
language sql security invoker set search_path = public as $$
  with cur as (
    select p.id, p.status as was, p.category, p.cost_price, p.sell_price, p.fabric, p.color, p.ai_read_at, p.ai_error, p.missing_attrs, p.tags, p.route_due,
           p.copy_of as held_as
    from pb_products p where p.id = any(coalesce(p_ids, '{}')) for update
  ), calc as (
    select c.*,
      coalesce((select array_agg(a.name order by ca.position, a.position, a.name)
        from pb_category_attributes ca join pb_attributes a on a.id = ca.attribute_id
        where lower(ca.category) = lower(c.category)
          and not exists (select 1 from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id
                          where pv.product_id = c.id and v.attribute_id = a.id)), '{}') as miss,
      coalesce((select array_agg(v.name order by a.position, a.name, v.position, v.name)
        from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id join pb_attributes a on a.id = v.attribute_id
        where pv.product_id = c.id), '{}') as names,
      (coalesce(btrim(c.fabric), '') <> '' and coalesce(btrim(c.color), '') <> ''
        and exists (select 1 from pb_product_images i where i.product_id = c.id and i.kind = 'image')) as has_details,
      case when c.was in ('ready', 'needs_info') then pb_dup_held(c.id) end as copy_of
    from cur c
  ), gate as (
    select calc.*, case
      when calc.was not in ('ready', 'needs_info') then calc.was
      when not ((calc.cost_price is not null or calc.sell_price is not null) and coalesce(trim(calc.category), '') <> '' and cardinality(calc.miss) = 0
                and calc.has_details and calc.copy_of is null) then 'needs_info'
      when calc.was = 'needs_info' and calc.ai_read_at is null and calc.ai_error is null then 'needs_info'
      else 'ready' end as next
    from calc
  ), upd as (
    update pb_products p set missing_attrs = g.miss, tags = g.names, status = g.next, copy_of = g.copy_of,
      route_due = case when g.next = 'ready' and g.was = 'needs_info' then true when g.next <> 'ready' then false else g.route_due end
    from gate g
    where p.id = g.id and (g.missing_attrs is distinct from g.miss or g.tags is distinct from g.names or g.was is distinct from g.next
                           or g.held_as is distinct from g.copy_of)
    returning p.id
  )
  select g.id, g.next, g.was, g.miss from gate g;
$$;

-- ── 3. "They are copies": archive the held copies in one go ───────────────
-- Left for a person, and counted:
--   on_site — a listing of the copy is on a store (archiving would leave it there);
--   priced  — the copy came with a vendor price and the earlier product has a
--             different one, or no price at all (the new rate would be lost).
--             An earlier product copied from a store sells at that store's
--             price, so a vendor cost on the copy is nothing it lacks.
create or replace function public.pb_copies_archive(p_apply boolean default false, p_user uuid default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare c record; o pb_products; v_orig uuid; archived int := 0; priced int := 0; on_site int := 0; freed uuid[] := '{}';
begin
  if p_apply and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  for c in select p.id, p.cost_price from pb_products p where p.status = 'needs_info' and p.copy_of is not null order by p.created_at, p.id loop
    v_orig := pb_dup_held(c.id);
    if v_orig is null then freed := freed || c.id; continue; end if; -- not a copy any more (what it copied is gone, or was archived just now)
    select * into o from pb_products where id = v_orig;
    if exists (select 1 from pb_listings l where l.product_id = c.id and pb_listing_on_sale(l.status, l.shopify_product_id, l.shopify_status)) then
      on_site := on_site + 1;
    elsif c.cost_price is not null and (case when o.cost_price is not null then o.cost_price <> c.cost_price else o.sell_price is null end) then
      priced := priced + 1;
    elsif not p_apply then
      archived := archived + 1;
    else
      update pb_products set status = 'archived' where id = c.id and status = 'needs_info';
      if found then
        archived := archived + 1;
        insert into pb_activity (product_id, action, details, user_id)
        values (c.id, 'archived', jsonb_build_object('status', 'archived', 'copy_of', v_orig, 'bulk', true), p_user);
      end if;
    end if;
  end loop;
  -- A product that is no longer a copy of anything has no reason to wait: the gate judges it again.
  if p_apply and cardinality(freed) > 0 then perform 1 from pb_products_refresh(freed); end if;
  return jsonb_build_object('archived', archived, 'priced', priced, 'on_site', on_site);
end $$;
comment on function public.pb_copies_archive(boolean, uuid) is 'Archive the products the Ready gate holds as copies (pb-products copies.ts); p_apply = false only counts. Leaves the ones on a store or with a vendor price of their own.';
grant execute on function public.pb_copies_archive(boolean, uuid) to authenticated, service_role;

-- ── 4. taking it back ─────────────────────────────────────────────────────
-- The products that are still archived go back to Needs info and the gate
-- judges them again (still a copy → it waits as before). A product the
-- change let go, because what it copied was archived by it, is judged again
-- too once that is back ("rejudged"). One that somebody restored or changed
-- since is left alone.
create or replace function public.pb_bulk_revert_copies(p_run uuid, p_apply boolean) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n record; p pb_products; restored int := 0; rejudged int := 0; changed int := 0; gone int := 0; ids uuid[] := '{}';
begin
  for n in select * from pb_bulk_net(p_run) x where x.tbl = 'pb_products' loop
    select * into p from pb_products where id = (n.pk ->> 'id')::uuid for update;
    if p.id is null then gone := gone + 1;
    elsif p.status = 'archived' and (n.before ->> 'status') = 'needs_info' and (n.after ->> 'status') = 'archived' then
      restored := restored + 1; ids := ids || p.id;
      if p_apply then update pb_products set status = 'needs_info' where id = p.id; end if;
    elsif p.status = 'ready' and (n.before ->> 'status') = 'needs_info' and (n.after ->> 'status') = 'ready' then
      rejudged := rejudged + 1; ids := ids || p.id;
    else changed := changed + 1;
    end if;
    if p_apply then update pb_bulk_items set done = true where run_id = p_run and tbl = 'pb_products' and pk = n.pk; end if;
  end loop;
  if p_apply and cardinality(ids) > 0 then perform 1 from pb_products_refresh(ids); end if;
  return jsonb_build_object('restored', restored, 'rejudged', rejudged, 'changed', changed, 'gone', gone);
end $$;

-- ── 5. the entry point knows the new kind ─────────────────────────────────
-- As 20261113060000_pb_bulk_log.sql, plus 'copies'.
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
    when 'copies' then res := pb_bulk_revert_copies(p_run, p_apply);
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
