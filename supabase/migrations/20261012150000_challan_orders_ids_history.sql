-- Cash Challan → Orders: order IDs, a track record, search, and orders that
-- stay true to their challans (owner's ask — "There should be order ID to
-- identify, everything should also show in cash challan. A proper way of
-- managing orders with easy detection and track record").
--
-- WHY / WHAT:
--   * order_number — every order gets a number, shown as ORD-0012. Existing
--     orders are numbered by creation time. The challan list and detail
--     show the order a challan was made from.
--   * The processed orders backfilled by 20261012110000 were assumed fully
--     delivered. Re-derived here from what their challans actually carried:
--     an order whose challan missed lines goes back to Pending with those
--     pieces due (the bug the owner reported, in the existing data).
--   * History: every change to an order is written to audit_log (module
--     cash_challan_order) — created, edited, cancelled, reopened, processed
--     by a table trigger; challan made / challan edited / challan voided by
--     the functions that do them (they set app.order_rpc so the table
--     trigger does not log the same change twice). Existing orders get their
--     created / challan made / processed rows backfilled with the original
--     person and time.
--   * Counting moves into challan_order_plan (pure; reads the SAVED challan
--     lines; a size variant DRS141-M fills an order line DRS141), shared by
--     create_challan_from_order, the void hand-back and the new resync:
--     editing a challan made from an order (update_challan_with_items, the
--     admin SKU fix) re-counts what it took, at commit (deferred constraint
--     triggers). create_challan_from_order also reports order_over_due:
--     pieces of an ordered SKU beyond what was due (someone else sent them
--     meanwhile) so the app can warn.
--   * An order edited down to what has already gone out is processed
--     (BEFORE trigger), never left pending with nothing due.
--   * search_order_ids(p_q) — the Orders search: ORD-0012 / 12, customer,
--     phone, a SKU on any line, notes.
-- Applied statement by statement through execute_sql (apply_migration
-- times out on this project's MCP); no row is deleted.

-- ── 1. Order numbers ────────────────────────────────────────────────────
create sequence if not exists public.cash_challan_orders_order_number_seq;
alter table public.cash_challan_orders add column if not exists order_number integer;
with r as (select id, row_number() over (order by created_at, id) rn from public.cash_challan_orders where order_number is null)
update public.cash_challan_orders o set order_number = r.rn from r where r.id = o.id;
select setval('public.cash_challan_orders_order_number_seq', greatest(coalesce((select max(order_number) from public.cash_challan_orders), 0), 1),
              (select max(order_number) from public.cash_challan_orders) is not null);
alter sequence public.cash_challan_orders_order_number_seq owned by public.cash_challan_orders.order_number;
alter table public.cash_challan_orders alter column order_number set default nextval('public.cash_challan_orders_order_number_seq');
alter table public.cash_challan_orders alter column order_number set not null;
create unique index if not exists cash_challan_orders_order_number_key on public.cash_challan_orders (order_number);
grant usage, select on sequence public.cash_challan_orders_order_number_seq to authenticated;

create or replace function public.challan_order_no(p_n integer)
 returns text language sql immutable set search_path to 'public'
as $$ select 'ORD-' || lpad(coalesce(p_n, 0)::text, 4, '0') $$;

-- ── 2. Counting: a saved challan's lines against an order's open lines ──
-- Pure: given an order's items and a challan, what that challan takes. Pass
-- 1 matches the same key (SKU, case-insensitive; description when there is
-- no SKU). Pass 2 lets a size variant fill a design ordered without a size
-- (challan DRS141-M fills order line DRS141). Never more than is due. Lines
-- record the ORDER line's SKU so the count can be reversed exactly.
-- over = pieces of an ordered SKU on the challan beyond what was due.
create or replace function public.challan_order_plan(p_items jsonb, p_challan_id uuid)
 returns jsonb language plpgsql stable set search_path to 'public'
as $function$
declare
  v_pool jsonb := '{}'::jsonb;
  v_r record; v_key text; v_pk text; v_pv numeric;
  v_items jsonb := coalesce(p_items, '[]'::jsonb); v_lines jsonb := '[]'::jsonb;
  v_n integer; v_it jsonb; v_qty numeric; v_done numeric; v_avail numeric; v_take numeric;
  v_took numeric := 0; v_left numeric := 0; v_over numeric := 0; v_pass integer;
begin
  for v_r in select sku, description, quantity from cash_challan_items where challan_id = p_challan_id loop
    v_key := challan_order_line_key(v_r.sku, v_r.description);
    v_pool := jsonb_set(v_pool, array[v_key], to_jsonb(coalesce((v_pool->>v_key)::numeric, 0) + greatest(coalesce(v_r.quantity, 0), 0)));
  end loop;
  for v_pass in 1..2 loop
    for v_n in select n - 1 from jsonb_array_elements(v_items) with ordinality as t(e, n) order by n loop
      v_it := v_items->v_n;
      v_key := challan_order_line_key(v_it->>'sku', v_it->>'description');
      v_qty := coalesce((v_it->>'quantity')::numeric, 0);
      v_done := coalesce((v_it->>'delivered')::numeric, 0);
      continue when v_qty - v_done <= 0;
      if v_pass = 1 then
        v_avail := coalesce((v_pool->>v_key)::numeric, 0);
        v_take := least(v_qty - v_done, v_avail);
        if v_take > 0 then v_pool := jsonb_set(v_pool, array[v_key], to_jsonb(v_avail - v_take)); end if;
      else
        continue when left(v_key, 2) <> 'S:';
        v_take := 0;
        for v_pk, v_pv in select key, value::numeric from jsonb_each_text(v_pool) where key like v_key || '-%' and value::numeric > 0 order by key loop
          exit when v_take >= v_qty - v_done;
          v_avail := least(v_pv, v_qty - v_done - v_take);
          v_pool := jsonb_set(v_pool, array[v_pk], to_jsonb(v_pv - v_avail));
          v_take := v_take + v_avail;
        end loop;
      end if;
      if v_take > 0 then
        v_items := jsonb_set(v_items, array[v_n::text, 'delivered'], to_jsonb(v_done + v_take));
        v_took := v_took + v_take;
        v_lines := v_lines || jsonb_build_object('sku', coalesce(v_it->>'sku', ''), 'description', coalesce(v_it->>'description', ''), 'qty', v_take);
      end if;
    end loop;
  end loop;
  -- merge lines of the same key (pass 1 + pass 2) and total what is still due
  select coalesce(jsonb_agg(jsonb_build_object('sku', sku, 'description', description, 'qty', q) order by first_n), '[]'::jsonb) into v_lines
    from (select l->>'sku' sku, l->>'description' description, sum((l->>'qty')::numeric) q, min(n) first_n
            from jsonb_array_elements(v_lines) with ordinality as t(l, n) group by 1, 2) m;
  select coalesce(sum(greatest(coalesce((e->>'quantity')::numeric, 0) - coalesce((e->>'delivered')::numeric, 0), 0)), 0) into v_left from jsonb_array_elements(v_items) e;
  select coalesce(sum(p.value::numeric), 0) into v_over from jsonb_each_text(v_pool) p
   where p.value::numeric > 0 and exists (select 1 from jsonb_array_elements(v_items) e
           where challan_order_line_key(e->>'sku', e->>'description') = p.key
              or (left(challan_order_line_key(e->>'sku', e->>'description'), 2) = 'S:' and p.key like challan_order_line_key(e->>'sku', e->>'description') || '-%'));
  return jsonb_build_object('items', v_items, 'lines', v_lines, 'took', v_took, 'left', v_left, 'over', v_over);
end;
$function$;
revoke all on function public.challan_order_plan(jsonb, uuid) from public, anon;
grant execute on function public.challan_order_plan(jsonb, uuid) to authenticated;

-- Pure: an order's items with one delivery's pieces handed back (last
-- delivered lines of that key first).
create or replace function public.challan_order_minus(p_items jsonb, p_lines jsonb)
 returns jsonb language plpgsql immutable set search_path to 'public'
as $function$
declare
  v_items jsonb := coalesce(p_items, '[]'::jsonb); v_line jsonb; v_it jsonb;
  v_back numeric; v_done numeric; v_key text; v_n integer;
begin
  for v_line in select jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_key := challan_order_line_key(v_line->>'sku', v_line->>'description');
    v_back := coalesce((v_line->>'qty')::numeric, 0);
    for v_n in select n - 1 from jsonb_array_elements(v_items) with ordinality as t(e, n) order by n desc loop
      exit when v_back <= 0;
      v_it := v_items->v_n;
      continue when challan_order_line_key(v_it->>'sku', v_it->>'description') <> v_key;
      v_done := coalesce((v_it->>'delivered')::numeric, 0);
      continue when v_done <= 0;
      v_items := jsonb_set(v_items, array[v_n::text, 'delivered'], to_jsonb(v_done - least(v_done, v_back)));
      v_back := v_back - least(v_done, v_back);
    end loop;
  end loop;
  return v_items;
end;
$function$;

-- Write an order's new items and the status they imply; history is the caller's.
create or replace function public.challan_order_put(p_order_id uuid, p_items jsonb, p_challan_id uuid)
 returns text language plpgsql set search_path to 'public'
as $function$
declare v_status text;
begin
  perform set_config('app.order_rpc', 'on', true);
  update cash_challan_orders set
    items = p_items,
    status = case when status = 'cancelled' then 'cancelled'
                  when not exists (select 1 from jsonb_array_elements(p_items) e where coalesce((e->>'delivered')::numeric, 0) < coalesce((e->>'quantity')::numeric, 0)) then 'converted'
                  else 'pending' end,
    challan_id = coalesce(p_challan_id, challan_id),
    updated_at = now()
  where id = p_order_id
  returning status into v_status;
  update cash_challan_orders set
    converted_at = case when status = 'converted' then coalesce(converted_at, now()) else null end,
    converted_by = case when status = 'converted' then coalesce(converted_by, auth.uid()) else null end
  where id = p_order_id and (status = 'converted') is distinct from (converted_at is not null);
  perform set_config('app.order_rpc', 'off', true);
  return v_status;
end;
$function$;
revoke all on function public.challan_order_put(uuid, jsonb, uuid) from public, anon;
grant execute on function public.challan_order_put(uuid, jsonb, uuid) to authenticated;

-- ── 3. Make a challan from an order (same signature) ─────────────────────
create or replace function public.create_challan_from_order(p_order_id uuid, p_challan jsonb, p_items jsonb, p_payment jsonb default null::jsonb)
 returns jsonb language plpgsql set search_path to 'public'
as $function$
declare
  v_order cash_challan_orders%rowtype;
  v_res jsonb; v_plan jsonb; v_status text; v_cid uuid; v_no integer; v_no_txt text;
begin
  if auth.uid() is null then raise exception 'Sign in to make a challan'; end if;
  if coalesce((p_challan->>'is_return')::boolean, false) then
    raise exception 'A return cannot be made from an order';
  end if;
  select * into v_order from cash_challan_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending' then
    raise exception 'This order is no longer pending — refresh Orders';
  end if;
  v_res := create_challan_with_items(p_challan, p_items, p_payment);
  v_cid := (v_res->>'id')::uuid; v_no := (v_res->>'challan_number')::integer; v_no_txt := challan_order_no(v_order.order_number);
  v_plan := challan_order_plan(v_order.items, v_cid);
  v_status := v_order.status;
  if (v_plan->>'took')::numeric > 0 then
    v_status := challan_order_put(p_order_id, v_plan->'items', v_cid);
    insert into cash_challan_order_deliveries (order_id, challan_id, lines, created_by) values (p_order_id, v_cid, v_plan->'lines', auth.uid());
    perform audit_write('cash_challan_order', 'CHALLAN_MADE', p_order_id::text,
      v_no_txt || ' — challan #' || v_no || ': ' || (v_plan->>'took') || ' pcs ('
      || (select string_agg(coalesce(nullif(l->>'sku', ''), l->>'description') || ' ×' || (l->>'qty'), ', ') from jsonb_array_elements(v_plan->'lines') l) || ')'
      || case when (v_plan->>'left')::numeric > 0 then ' · ' || (v_plan->>'left') || ' still due' else '' end);
    if v_status = 'converted' then
      perform audit_write('cash_challan_order', 'PROCESSED', p_order_id::text, v_no_txt || ' — every piece sent');
    end if;
  end if;
  return v_res || jsonb_build_object('order_delivered', (v_plan->>'took')::numeric, 'order_remaining', (v_plan->>'left')::numeric,
    'order_over_due', (v_plan->>'over')::numeric, 'order_status', v_status, 'order_number', v_order.order_number);
end;
$function$;

-- ── 4. A voided challan hands its pieces back (replaces the body) ────────
create or replace function public.challan_order_unwind_void()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_d record; v_back numeric;
begin
  for v_d in select d.id, d.order_id, d.lines, o.order_number, o.items from cash_challan_order_deliveries d
               join cash_challan_orders o on o.id = d.order_id
              where d.challan_id = new.id and d.reversed_at is null for update of d, o loop
    v_back := (select coalesce(sum((l->>'qty')::numeric), 0) from jsonb_array_elements(v_d.lines) l);
    perform challan_order_put(v_d.order_id, challan_order_minus(v_d.items, v_d.lines), null);
    update cash_challan_order_deliveries set reversed_at = now() where id = v_d.id;
    perform audit_write('cash_challan_order', 'PIECES_BACK', v_d.order_id::text,
      challan_order_no(v_d.order_number) || ' — challan #' || new.challan_number || ' voided: ' || v_back || ' pcs back on the order');
  end loop;
  return null;
end;
$function$;

-- ── 5. An edited challan re-counts what it took (at commit) ──────────────
-- Fires for the header (update_challan_with_items) and its lines (the admin
-- SKU fix touches lines only). Re-plans against the order as it would be
-- without this challan; writes only when the count actually changed.
create or replace function public.challan_order_resync()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_cid uuid := case when tg_table_name = 'cash_challans' then new.id else new.challan_id end;
  v_c cash_challans%rowtype; v_d record; v_base jsonb; v_plan jsonb; v_before numeric;
begin
  -- Most challans never came from an order: leave at once.
  if not exists (select 1 from cash_challan_order_deliveries where challan_id = v_cid and reversed_at is null) then return null; end if;
  select * into v_c from cash_challans where id = v_cid;
  if not found or v_c.status = 'voided' then return null; end if;
  for v_d in select d.id, d.order_id, d.lines, o.order_number, o.items from cash_challan_order_deliveries d
               join cash_challan_orders o on o.id = d.order_id
              where d.challan_id = v_cid and d.reversed_at is null for update of d, o loop
    v_base := challan_order_minus(v_d.items, v_d.lines);
    v_plan := challan_order_plan(v_base, v_cid);
    continue when v_plan->'lines' = v_d.lines;
    v_before := (select coalesce(sum((l->>'qty')::numeric), 0) from jsonb_array_elements(v_d.lines) l);
    perform challan_order_put(v_d.order_id, v_plan->'items', null);
    update cash_challan_order_deliveries set lines = v_plan->'lines',
      reversed_at = case when (v_plan->>'took')::numeric > 0 then null else now() end where id = v_d.id;
    perform audit_write('cash_challan_order', 'CHALLAN_EDITED', v_d.order_id::text,
      challan_order_no(v_d.order_number) || ' — challan #' || v_c.challan_number || ' edited: ' || v_before || ' → ' || (v_plan->>'took') || ' pcs from this order'
      || case when (v_plan->>'left')::numeric > 0 then ' · ' || (v_plan->>'left') || ' still due' else '' end);
  end loop;
  return null;
end;
$function$;
revoke all on function public.challan_order_resync() from public, anon, authenticated;
-- (constraint triggers have no OR REPLACE: created once, guarded)
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_challan_order_resync') then
    create constraint trigger trg_challan_order_resync
      after update on public.cash_challans
      deferrable initially deferred
      for each row execute function public.challan_order_resync();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_challan_order_resync_items') then
    create constraint trigger trg_challan_order_resync_items
      after insert or update on public.cash_challan_items
      deferrable initially deferred
      for each row execute function public.challan_order_resync();
  end if;
end $$;

-- ── 6. The order's own changes: processed when nothing is due; history ──
create or replace function public.challan_order_autoprocess()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.status = 'pending'
     and jsonb_array_length(new.items) > 0
     and not exists (select 1 from jsonb_array_elements(new.items) e
                      where coalesce((e->>'delivered')::numeric, 0) < coalesce((e->>'quantity')::numeric, 0)) then
    new.status := 'converted';
    new.converted_at := coalesce(new.converted_at, now());
    new.converted_by := coalesce(new.converted_by, auth.uid());
  end if;
  return new;
end;
$function$;
create or replace trigger trg_challan_order_autoprocess
  before update on public.cash_challan_orders
  for each row execute function public.challan_order_autoprocess();

create or replace function public.challan_order_track()
 returns trigger language plpgsql set search_path to 'public'
as $function$
declare
  v_no text := challan_order_no(new.order_number);
  v_pcs numeric := (select coalesce(sum(coalesce((e->>'quantity')::numeric, 0)), 0) from jsonb_array_elements(new.items) e);
  v_due numeric := (select coalesce(sum(greatest(coalesce((e->>'quantity')::numeric, 0) - coalesce((e->>'delivered')::numeric, 0), 0)), 0) from jsonb_array_elements(new.items) e);
  v_old_pcs numeric;
begin
  if coalesce(current_setting('app.order_rpc', true), '') = 'on' then return null; end if;
  if tg_op = 'INSERT' then
    perform audit_write('cash_challan_order', 'CREATE', new.id::text,
      v_no || ' — for ' || new.customer_name || ': ' || jsonb_array_length(new.items) || ' item' || case when jsonb_array_length(new.items) = 1 then '' else 's' end || ', ' || v_pcs || ' pcs');
    return null;
  end if;
  if old.items is distinct from new.items or old.notes is distinct from new.notes
     or old.customer_name is distinct from new.customer_name or old.customer_phone is distinct from new.customer_phone then
    v_old_pcs := (select coalesce(sum(coalesce((e->>'quantity')::numeric, 0)), 0) from jsonb_array_elements(old.items) e);
    perform audit_write('cash_challan_order', 'UPDATE', new.id::text,
      v_no || ' — edited' || case when v_old_pcs <> v_pcs then ': ' || v_old_pcs || ' → ' || v_pcs || ' pcs' else '' end
      || case when old.customer_name is distinct from new.customer_name then ' · customer ' || old.customer_name || ' → ' || new.customer_name else '' end);
  end if;
  if old.status is distinct from new.status then
    if new.status = 'cancelled' then
      perform audit_write('cash_challan_order', 'CANCELLED', new.id::text, v_no || ' — cancelled' || case when v_due > 0 then ' with ' || v_due || ' pcs still due' else '' end);
    elsif new.status = 'pending' then
      perform audit_write('cash_challan_order', 'REOPENED', new.id::text, v_no || ' — reopened · ' || v_due || ' pcs due');
    elsif new.status = 'converted' then
      perform audit_write('cash_challan_order', 'PROCESSED', new.id::text, v_no || ' — every piece sent');
    end if;
  end if;
  return null;
end;
$function$;
create or replace trigger trg_challan_order_track
  after insert or update on public.cash_challan_orders
  for each row execute function public.challan_order_track();

-- ── 7. Search ────────────────────────────────────────────────────────────
create or replace function public.search_order_ids(p_q text)
 returns setof uuid language sql stable set search_path to 'public'
as $$
  with q as (select btrim(coalesce(p_q, '')) s),
       n as (select regexp_replace(s, '^(ord)?[-#\s]*0*', '', 'i') d, '%' || replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') || '%' pat from q)
  select o.id from cash_challan_orders o, q, n
   where q.s <> ''
     and ((n.d ~ '^\d{1,9}$' and o.order_number = n.d::integer)
          or o.customer_name ilike n.pat or o.customer_phone ilike n.pat or o.notes ilike n.pat
          or exists (select 1 from jsonb_array_elements(o.items) e where e->>'sku' ilike n.pat or e->>'description' ilike n.pat))
   order by o.created_at desc
   limit 500
$$;
revoke all on function public.search_order_ids(text) from public, anon;
grant execute on function public.search_order_ids(text) to authenticated;

-- ── 8. Data: re-derive processed orders from what their challans carried,
--       then backfill the history (before any history trigger fires on it).
do $$
declare v_o record; v_plan jsonb;
begin
  for v_o in select o.id, o.items, d.id did, d.challan_id from cash_challan_orders o
               join cash_challan_order_deliveries d on d.order_id = o.id and d.reversed_at is null
              where o.status = 'converted' loop
    v_plan := challan_order_plan((select coalesce(jsonb_agg(e - 'delivered' order by n), '[]'::jsonb) from jsonb_array_elements(v_o.items) with ordinality as t(e, n)), v_o.challan_id);
    perform challan_order_put(v_o.id, v_plan->'items', null);
    update cash_challan_order_deliveries set lines = v_plan->'lines',
      reversed_at = case when (v_plan->>'took')::numeric > 0 then null else now() end where id = v_o.did;
  end loop;
end $$;

insert into public.audit_log (module, action, record_id, details, user_id, user_email, created_at)
select 'cash_challan_order', 'CREATE', o.id::text,
       challan_order_no(o.order_number) || ' — for ' || o.customer_name || ': ' || jsonb_array_length(o.items) || ' item' || case when jsonb_array_length(o.items) = 1 then '' else 's' end || ', '
       || (select coalesce(sum(coalesce((e->>'quantity')::numeric, 0)), 0) from jsonb_array_elements(o.items) e) || ' pcs',
       o.created_by, (select coalesce(nullif(btrim(full_name), ''), email) from profiles where id = o.created_by), o.created_at
  from public.cash_challan_orders o
 where not exists (select 1 from public.audit_log a where a.module = 'cash_challan_order' and a.record_id = o.id::text and a.action = 'CREATE');

insert into public.audit_log (module, action, record_id, details, user_id, user_email, created_at)
select 'cash_challan_order', 'CHALLAN_MADE', d.order_id::text,
       challan_order_no(o.order_number) || ' — challan #' || c.challan_number || ': '
       || (select coalesce(sum((l->>'qty')::numeric), 0) from jsonb_array_elements(d.lines) l) || ' pcs ('
       || coalesce((select string_agg(coalesce(nullif(l->>'sku', ''), l->>'description') || ' ×' || (l->>'qty'), ', ') from jsonb_array_elements(d.lines) l), '') || ')',
       d.created_by, (select coalesce(nullif(btrim(full_name), ''), email) from profiles where id = d.created_by), d.created_at
  from public.cash_challan_order_deliveries d join public.cash_challan_orders o on o.id = d.order_id join public.cash_challans c on c.id = d.challan_id
 where jsonb_array_length(d.lines) > 0
   and not exists (select 1 from public.audit_log a where a.module = 'cash_challan_order' and a.record_id = d.order_id::text and a.action = 'CHALLAN_MADE');

insert into public.audit_log (module, action, record_id, details, user_id, user_email, created_at)
select 'cash_challan_order', 'PROCESSED', o.id::text, challan_order_no(o.order_number) || ' — every piece sent',
       o.converted_by, (select coalesce(nullif(btrim(full_name), ''), email) from profiles where id = o.converted_by), coalesce(o.converted_at, o.updated_at)
  from public.cash_challan_orders o
 where o.status = 'converted'
   and not exists (select 1 from public.audit_log a where a.module = 'cash_challan_order' and a.record_id = o.id::text and a.action = 'PROCESSED');
