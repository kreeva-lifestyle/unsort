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
--     status it explains. When the product it points at is archived, brought
--     back or deleted, or its code, colour or vendor changes, the note follows
--     (pb_copies_follow): the next earlier product, or none. The list filters
--     on it.
--   * pb_copies_archive(apply, user) — archives the held copies in one go.
--     Every copy is judged once, as things stand before anything is archived,
--     so what the confirmation showed is exactly what is done. Only the ones
--     with nothing of their own to lose, left for a person and counted:
--     a copy that is already on a store; one that came with a vendor price the
--     earlier product lacks or contradicts; one whose earlier product has no
--     colour (it may be another colour); and one in a chain (a copy OF a
--     waiting copy, or one another waiting copy points at) — archiving those
--     in one go could remove the only product of a colour. Nothing is let go
--     to the websites. apply = false only counts (the app shows the counts
--     before asking).
--   * The server runs it as a bulk change (x-pb-bulk), so the log keeps every
--     product it archived and pb_bulk_revert_copies can take it back for 7
--     days: archived → Needs info, where the product is still archived and is
--     still a copy. A revert never sends anything to a website either: a
--     product that is no longer a copy stays archived and is counted.
--     No answer is stored for the pairs, so nothing is left behind.
--
-- Additive only: one column, one index, two triggers, new functions, and two
-- functions replaced with the same signature. Nothing is dropped. SECURITY
-- INVOKER; the functions that change data check that the caller is the server.
-- The one exception is the trigger function pb_copies_follow (see 3).
-- (Applied to the live database in two parts: everything but the delete
-- trigger pb_copies_gone, then that trigger.)

-- ── 1. what the gate holds a product as a copy of ─────────────────────────
-- No foreign key on purpose: "on delete set null" would empty the note before
-- pb_copies_follow can look for the next earlier product (the two run in name
-- order, the built-in one first). The trigger below clears or moves every note
-- that points at a deleted product, in the same transaction.
alter table public.pb_products add column if not exists copy_of uuid;
comment on column public.pb_products.copy_of is 'The earlier product the Ready gate holds this one as a copy of (pb_products_refresh writes it with the status; pb_copies_follow moves it when that product is archived, brought back or deleted, or its code, colour or vendor changes); null when it is not held.';
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

-- Products that were held before this column existed get their note (none on the day this was written).
update public.pb_products p set copy_of = public.pb_dup_held(p.id)
where p.status = 'needs_info' and p.copy_of is null and public.pb_dup_held(p.id) is not null;

-- ── 3. the note follows when the product it points at changes ─────────────
-- That product is archived or deleted, or its code, colour or vendor is
-- changed: the products that point at it are looked at again — the next
-- earlier product they are a copy of, or none. And the other way round: a
-- product that comes back from the archive (or whose code, colour or vendor
-- now matches) is looked at for the waiting products it holds, so their note
-- is there again (second review, finding 6: a copy whose original was deleted
-- or archived and restored sat in Needs info with no reason shown).
-- Only the note moves. The waiting product's own status is not touched here
-- (changing one product never sends another one to the websites; its own gate
-- does that when it is next saved).
-- SECURITY DEFINER, deliberately: it reads the copy rules' own tables (schema
-- private), which staff cannot read directly. It can only run as a trigger —
-- PostgreSQL refuses to call a trigger function any other way — and it writes
-- nothing but copy_of, on products that are tied to the row the caller was
-- allowed to change. Its own update is outside the triggers' column list, so
-- it does not call itself; a note that would not change is not written.
create or replace function public.pb_copies_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- the products that point at it: the next earlier product, or none
  with h as materialized (  -- materialized: the look-up is made once per product, not once per place it is used
    select x.id, case when x.status = 'needs_info' then public.pb_dup_held(x.id) end as held
    from public.pb_products x where x.copy_of = old.id)
  update public.pb_products c set copy_of = h.held from h where c.id = h.id and c.copy_of is distinct from h.held;
  -- it is (again) a product others can be copies of: the waiting products it holds
  if tg_op = 'UPDATE' then
    if new.status <> 'archived' then
      with h as materialized (
        select m.other_id, public.pb_dup_held(m.other_id) as held
        from private.pb_dup_scan(array[new.id]) m
        join public.pb_products w on w.id = m.other_id and w.status = 'needs_info'
        where m.kind = 'original')
      update public.pb_products c set copy_of = h.held from h where c.id = h.other_id and c.copy_of is distinct from h.held;
    end if;
  end if;
  return null;
end $$;
create or replace trigger pb_copies_follow after update of status, sku, color, vendor_id on public.pb_products
  for each row when ((new.status = 'archived') is distinct from (old.status = 'archived')
                     or new.sku is distinct from old.sku or new.color is distinct from old.color or new.vendor_id is distinct from old.vendor_id)
  execute function public.pb_copies_follow();
create or replace trigger pb_copies_gone after delete on public.pb_products
  for each row execute function public.pb_copies_follow();

-- ── 4. "They are copies": archive the held copies in one go ───────────────
-- Left for a person, and counted:
--   on_site — a listing of the copy is on a store (archiving would leave it there);
--   priced  — the copy came with a vendor price and the earlier product has a
--             different one, or no price at all (the new rate would be lost).
--             An earlier product copied from a store sells at that store's
--             price, so a vendor cost on the copy is nothing it lacks.
--   no_colour — the earlier product has no colour. The gate holds any colour
--             as a copy of it (it cannot tell), but archiving on that ground
--             could remove the only Grey or Black product of the design and
--             keep the incomplete one (third review, 3). A copy WITHOUT a
--             colour of an earlier product that has one is archived: it
--             carries nothing the earlier one lacks.
--   linked  — it is part of a chain: what it copies is itself waiting as a
--             copy, or another waiting copy points at it. A chain only forms
--             where the colours do not line up (Black ← no colour ← Grey):
--             archiving it in one go would leave no Grey product at all, and
--             archiving the middle one would leave the last one waiting with
--             no reason shown (second review, finding 6).
-- A note that no longer holds all the same (a person answered the pair from
-- elsewhere) is cleared when applying, and that product is left as it is.
create or replace function public.pb_copies_archive(p_apply boolean default false, p_user uuid default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_ids uuid[]; v_origs uuid[]; v_stale uuid[]; archived int := 0; priced int := 0; on_site int := 0; linked int := 0; no_colour int := 0;
begin
  if p_apply and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  with held as materialized (
    select p.id, p.cost_price, p.created_at, pb_dup_held(p.id) as orig
    from pb_products p where p.status = 'needs_info' and p.copy_of is not null
  ), judged as (
    select h.id, h.orig, h.created_at, case
        when h.orig is null then 'stale'
        when exists (select 1 from pb_listings l where l.product_id = h.id and pb_listing_on_sale(l.status, l.shopify_product_id, l.shopify_status)) then 'on_site'
        when h.cost_price is not null and (case when o.cost_price is not null then o.cost_price <> h.cost_price else o.sell_price is null end) then 'priced'
        when cardinality(pb_colour_keys(o.sku, o.color)) = 0 then 'no_colour'           -- it may be another colour
        when exists (select 1 from held x where x.orig = h.id)                          -- another waiting copy points at it
          or (o.status = 'needs_info' and pb_dup_held(o.id) is not null) then 'linked'  -- what it copies is itself waiting as a copy
        else 'archive' end as verdict
    from held h left join pb_products o on o.id = h.orig
  )
  select coalesce(array_agg(j.id order by j.created_at, j.id) filter (where j.verdict = 'archive'), '{}'),
         coalesce(array_agg(j.orig order by j.created_at, j.id) filter (where j.verdict = 'archive'), '{}'),
         coalesce(array_agg(j.id) filter (where j.verdict = 'stale'), '{}'),
         count(*) filter (where j.verdict = 'priced'), count(*) filter (where j.verdict = 'on_site'), count(*) filter (where j.verdict = 'linked'),
         count(*) filter (where j.verdict = 'no_colour')
    into v_ids, v_origs, v_stale, priced, on_site, linked, no_colour
  from judged j;
  archived := cardinality(v_ids);
  if p_apply then
    with done as (
      update pb_products p set status = 'archived' where p.id = any(v_ids) and p.status = 'needs_info' returning p.id
    ), logged as (
      insert into pb_activity (product_id, action, details, user_id)
      select d.id, 'archived', jsonb_build_object('status', 'archived', 'copy_of', v_origs[array_position(v_ids, d.id)], 'bulk', true), p_user
      from done d
      returning 1
    )
    select count(*) into archived from logged;
    update pb_products set copy_of = null where id = any(v_stale) and status = 'needs_info';
  end if;
  return jsonb_build_object('archived', archived, 'priced', priced, 'on_site', on_site, 'linked', linked, 'no_colour', no_colour);
end $$;
comment on function public.pb_copies_archive(boolean, uuid) is 'Archive the products the Ready gate holds as copies (pb-products copies.ts); p_apply = false only counts. Leaves the ones on a store, with a vendor price of their own, held by a product with no colour, or in a chain of copies; lets nothing go to the websites.';
grant execute on function public.pb_copies_archive(boolean, uuid) to authenticated, service_role;

-- ── 5. taking it back ─────────────────────────────────────────────────────
-- Earliest first, so a copy of a copy finds the one before it back in place.
-- A product is brought back only when it is still archived AND would wait as a
-- copy again; one that is no longer a copy of anything (what it copied was
-- archived or changed) stays archived and is counted — a revert sends nothing
-- to a website. With p_apply = false the same steps run and are then undone,
-- so the counts shown beforehand are the counts of the real thing.
create or replace function public.pb_bulk_revert_copies(p_run uuid, p_apply boolean) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare n record; p pb_products; v_held uuid; restored int := 0; not_copies int := 0; changed int := 0; gone int := 0;
begin
  begin
    for n in select x.pk, x.before, x.after from pb_bulk_net(p_run) x left join pb_products q on q.id = (x.pk ->> 'id')::uuid
             where x.tbl = 'pb_products' order by q.created_at, q.id loop
      select * into p from pb_products where id = (n.pk ->> 'id')::uuid for update;
      if p.id is null then gone := gone + 1;
      elsif p.status = 'archived' and (n.before ->> 'status') = 'needs_info' and (n.after ->> 'status') = 'archived' then
        update pb_products set status = 'needs_info' where id = p.id;
        v_held := pb_dup_held(p.id);
        if v_held is null then
          update pb_products set status = 'archived' where id = p.id;
          not_copies := not_copies + 1;
        else
          update pb_products set copy_of = v_held where id = p.id;
          restored := restored + 1;
        end if;
      else changed := changed + 1;
      end if;
      update pb_bulk_items set done = true where run_id = p_run and tbl = 'pb_products' and pk = n.pk;
    end loop;
    if not p_apply then raise exception 'only looking' using errcode = 'PB001'; end if;
  exception when sqlstate 'PB001' then null; -- only looking: everything above is undone, the counts stay
  end;
  return jsonb_build_object('restored', restored, 'not_copies', not_copies, 'changed', changed, 'gone', gone);
end $$;

-- ── 6. the entry point knows the new kind ─────────────────────────────────
-- As 20261113060000_pb_bulk_log.sql, plus 'copies' (also in the "a later bulk
-- change of the same kind on the same rows goes first" rule). Part 2 of the
-- bulk-change log (the tag lists and stock notices) carries a larger version
-- of this function with 'copies' in it: when an entry point that knows
-- 'copies' is already in place it is left alone, so the two files can be run
-- in either order. An entry point from an OLDER copy of the part-2 file (it
-- had no 'copies') is not silently kept — a copies run could then never be
-- taken back (second review, finding 4): this migration stops and says so.
do $do$
declare v_have text := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                                 where p.oid = to_regprocedure('public.pb_bulk_revert(uuid,boolean,uuid,text)')), '');
begin
  if position('pb_bulk_revert_copies' in v_have) > 0 then return; end if;
  if to_regprocedure('public.pb_bulk_revert_tags(uuid,boolean)') is not null then
    raise exception 'Part 2 of the bulk-change log is installed from an older copy of its file, which does not know "Archive the copies". Run docs/playbook/sql-to-run/20261113090000_pb_bulk_log_tags_stock.sql from this version first, then this migration again.';
  end if;
  execute $fn$
create or replace function public.pb_bulk_revert(p_run uuid, p_apply boolean default false, p_user uuid default null, p_note text default null)
returns jsonb
language plpgsql security invoker set search_path = public as $body$
declare r pb_bulk_runs; b record; res jsonb; prev jsonb; k text; merged jsonb := '{}'::jsonb;
begin
  if p_apply and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only the server can do this.'; end if;
  select * into r from pb_bulk_runs where id = p_run for update;
  if r.id is null then raise exception 'That bulk change is no longer in the list.'; end if;
  if r.status = 'running' then raise exception 'This is still running. Wait until it has finished.'; end if;
  if r.status = 'reverted' then raise exception 'This was already reverted.'; end if;
  if r.created_at < now() - interval '7 days' then raise exception 'This is more than 7 days old, so it can no longer be reverted.'; end if;
  if r.kind in ('reprice_site', 'reread', 'copies') then
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
end $body$;
  $fn$;
end $do$;
