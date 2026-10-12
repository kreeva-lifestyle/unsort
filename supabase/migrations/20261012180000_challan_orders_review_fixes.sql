-- Cash Challan → Orders: fixes from the second review of the partial
-- delivery / order ID work (20261012110000, 20261012150000).
--
-- WHY:
--   1. A delivery emptied by an edit (or by the 150000 re-derivation:
--      ORD-0001 / challan #205, ORD-0008 / challan #218) was never counted
--      again, even when the challan's SKU was later corrected. The re-count
--      now also picks up edit-reversed deliveries (lines = []); a void keeps
--      its lines and stays final.
--   2. The re-count ran on every challan header update (payment, handover,
--      inventory chip) and could log a false "challan edited". It now runs
--      only when the challan's lines are written: the header trigger is
--      disabled and the function ignores it (no DROP: this project's MCP
--      cannot run one).
--   3. challan_order_put rewrote an order with history switched off and was
--      callable by any signed-in user. Execute is revoked;
--      create_challan_from_order now writes the order itself.
--   4. A void or an edit that changes an order's status (processed ↔
--      pending) now logs PROCESSED / REOPENED, so the track record has no gap.
--   5. The two orders the 150000 re-derivation reopened get a history row
--      saying why.
--   6. Clients still on the previous app (cached tabs) edit orders without
--      `delivered` and mark them converted directly. A BEFORE guard keeps
--      what was sent and turns a direct "converted" into a real count.
--   7. search_order_ids returns at most 200 ids (they travel in a URL).
-- Applied through execute_sql in chunks; nothing is deleted.

-- ── 1 + 2 + 4. The re-count ───────────────────────────────────────────────
create or replace function public.challan_order_resync()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_cid uuid;
  v_c cash_challans%rowtype; v_d record; v_base jsonb; v_plan jsonb; v_before numeric; v_new text;
begin
  if tg_table_name <> 'cash_challan_items' then return null; end if;   -- lines only: a payment or handover never re-counts
  v_cid := new.challan_id;
  if not exists (select 1 from cash_challan_order_deliveries where challan_id = v_cid and (reversed_at is null or lines = '[]'::jsonb)) then return null; end if;
  select * into v_c from cash_challans where id = v_cid;
  if not found or v_c.status = 'voided' then return null; end if;
  for v_d in select d.id, d.order_id, d.lines, o.order_number, o.items, o.status from cash_challan_order_deliveries d
               join cash_challan_orders o on o.id = d.order_id
              where d.challan_id = v_cid and (d.reversed_at is null or d.lines = '[]'::jsonb) for update of d, o loop
    v_base := challan_order_minus(v_d.items, v_d.lines);
    v_plan := challan_order_plan(v_base, v_cid);
    continue when v_plan->'lines' = v_d.lines;
    v_before := (select coalesce(sum((l->>'qty')::numeric), 0) from jsonb_array_elements(v_d.lines) l);
    v_new := challan_order_put(v_d.order_id, v_plan->'items', null);
    update cash_challan_order_deliveries set lines = v_plan->'lines',
      reversed_at = case when (v_plan->>'took')::numeric > 0 then null else now() end where id = v_d.id;
    perform audit_write('cash_challan_order', 'CHALLAN_EDITED', v_d.order_id::text,
      challan_order_no(v_d.order_number) || ' — challan #' || v_c.challan_number || ' edited: ' || v_before || ' → ' || (v_plan->>'took') || ' pcs from this order'
      || case when (v_plan->>'left')::numeric > 0 then ' · ' || (v_plan->>'left') || ' still due' else '' end);
    if v_new is distinct from v_d.status then
      if v_new = 'converted' then perform audit_write('cash_challan_order', 'PROCESSED', v_d.order_id::text, challan_order_no(v_d.order_number) || ' — every piece sent');
      elsif v_new = 'pending' then perform audit_write('cash_challan_order', 'REOPENED', v_d.order_id::text, challan_order_no(v_d.order_number) || ' — pending again · ' || (v_plan->>'left') || ' pcs due');
      end if;
    end if;
  end loop;
  return null;
end;
$function$;
alter table public.cash_challans disable trigger trg_challan_order_resync;

create or replace function public.challan_order_unwind_void()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_d record; v_back numeric; v_new text;
begin
  for v_d in select d.id, d.order_id, d.lines, o.order_number, o.items, o.status from cash_challan_order_deliveries d
               join cash_challan_orders o on o.id = d.order_id
              where d.challan_id = new.id and d.reversed_at is null for update of d, o loop
    v_back := (select coalesce(sum((l->>'qty')::numeric), 0) from jsonb_array_elements(v_d.lines) l);
    v_new := challan_order_put(v_d.order_id, challan_order_minus(v_d.items, v_d.lines), null);
    update cash_challan_order_deliveries set reversed_at = now() where id = v_d.id;
    perform audit_write('cash_challan_order', 'PIECES_BACK', v_d.order_id::text,
      challan_order_no(v_d.order_number) || ' — challan #' || new.challan_number || ' voided: ' || v_back || ' pcs back on the order');
    if v_new = 'pending' and v_d.status = 'converted' then
      perform audit_write('cash_challan_order', 'REOPENED', v_d.order_id::text,
        challan_order_no(v_d.order_number) || ' — pending again · ' || v_back || ' pcs due');
    end if;
  end loop;
  return null;
end;
$function$;

-- ── 3. The order write stays inside the functions that own it ────────────
revoke execute on function public.challan_order_put(uuid, jsonb, uuid) from authenticated;

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
    v_status := case when (v_plan->>'left')::numeric <= 0 then 'converted' else 'pending' end;
    perform set_config('app.order_rpc', 'on', true);
    update cash_challan_orders set
      items = v_plan->'items', status = v_status, challan_id = v_cid,
      converted_at = case when v_status = 'converted' then now() else null end,
      converted_by = case when v_status = 'converted' then auth.uid() else null end,
      updated_at = now()
    where id = p_order_id;
    insert into cash_challan_order_deliveries (order_id, challan_id, lines, created_by) values (p_order_id, v_cid, v_plan->'lines', auth.uid());
    perform set_config('app.order_rpc', 'off', true);
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

-- ── 6. Guard against clients on the previous app ─────────────────────────
-- Runs before trg_challan_order_autoprocess (BEFORE triggers fire in name
-- order: "trg_challan_order_0_guard" < "trg_challan_order_autoprocess").
create or replace function public.challan_order_guard()
 returns trigger language plpgsql set search_path to 'public'
as $function$
declare
  v_old jsonb := coalesce(old.items, '[]'::jsonb); v_items jsonb := '[]'::jsonb; v_it jsonb; v_o jsonb;
  v_left jsonb := '{}'::jsonb;   -- key -> delivered pieces of OLD not yet handed to a NEW line
  v_key text; v_have numeric; v_put numeric; v_plan jsonb;
begin
  if coalesce(current_setting('app.order_rpc', true), '') = 'on' then return new; end if;
  -- (a) an edit that dropped `delivered` keeps what was sent, line by line, capped at the new quantity
  if exists (select 1 from jsonb_array_elements(v_old) e where coalesce((e->>'delivered')::numeric, 0) > 0)
     and exists (select 1 from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) e where not (e ? 'delivered')) then
    for v_o in select jsonb_array_elements(v_old) loop
      v_key := challan_order_line_key(v_o->>'sku', v_o->>'description');
      v_left := jsonb_set(v_left, array[v_key], to_jsonb(coalesce((v_left->>v_key)::numeric, 0) + coalesce((v_o->>'delivered')::numeric, 0)));
    end loop;
    for v_it in select e from jsonb_array_elements(new.items) with ordinality as t(e, n) order by n loop
      v_key := challan_order_line_key(v_it->>'sku', v_it->>'description');
      v_have := coalesce((v_left->>v_key)::numeric, 0);
      if v_it ? 'delivered' then   -- this line already carries its count: it uses up that much of the key
        v_left := jsonb_set(v_left, array[v_key], to_jsonb(greatest(v_have - coalesce((v_it->>'delivered')::numeric, 0), 0)));
        v_items := v_items || v_it; continue;
      end if;
      v_put := least(v_have, coalesce((v_it->>'quantity')::numeric, 0));
      if v_put > 0 then
        v_left := jsonb_set(v_left, array[v_key], to_jsonb(v_have - v_put));
        v_it := v_it || jsonb_build_object('delivered', v_put);
      end if;
      v_items := v_items || v_it;
    end loop;
    new.items := v_items;
  end if;
  -- (b) a direct "converted" with a new challan (previous app) becomes a real count
  if old.status = 'pending' and new.status = 'converted' and new.challan_id is not null
     and new.challan_id is distinct from old.challan_id
     and not exists (select 1 from cash_challan_order_deliveries where order_id = new.id and challan_id = new.challan_id) then
    v_plan := challan_order_plan(new.items, new.challan_id);
    new.items := v_plan->'items';
    if (v_plan->>'took')::numeric > 0 then
      insert into cash_challan_order_deliveries (order_id, challan_id, lines, created_by) values (new.id, new.challan_id, v_plan->'lines', auth.uid());
      perform audit_write('cash_challan_order', 'CHALLAN_MADE', new.id::text,
        challan_order_no(new.order_number) || ' — challan #' || (select challan_number from cash_challans where id = new.challan_id) || ': ' || (v_plan->>'took') || ' pcs ('
        || (select string_agg(coalesce(nullif(l->>'sku', ''), l->>'description') || ' ×' || (l->>'qty'), ', ') from jsonb_array_elements(v_plan->'lines') l) || ')'
        || case when (v_plan->>'left')::numeric > 0 then ' · ' || (v_plan->>'left') || ' still due' else '' end);
    end if;
    if (v_plan->>'left')::numeric > 0 then
      new.status := 'pending'; new.converted_at := null; new.converted_by := null;
    end if;
  end if;
  return new;
end;
$function$;
create or replace trigger trg_challan_order_0_guard
  before update on public.cash_challan_orders
  for each row execute function public.challan_order_guard();

-- ── 5. Why ORD-0001 / ORD-0008 are pending again ─────────────────────────
insert into public.audit_log (module, action, record_id, details, user_id, user_email, created_at)
select 'cash_challan_order', 'REOPENED', d.order_id::text,
       challan_order_no(o.order_number) || ' — pending again: it was marked processed with challan #' || c.challan_number
       || ', which carried none of its pieces (' || coalesce((select string_agg(ci.sku || ' ×' || ci.quantity, ', ') from cash_challan_items ci where ci.challan_id = c.id), '—') || ')',
       null, 'System', now()
  from public.cash_challan_order_deliveries d join public.cash_challan_orders o on o.id = d.order_id join public.cash_challans c on c.id = d.challan_id
 where d.lines = '[]'::jsonb and d.reversed_at is not null and c.status <> 'voided'
   and not exists (select 1 from public.audit_log a where a.module = 'cash_challan_order' and a.record_id = d.order_id::text and a.action = 'REOPENED');

-- ── 7. Search returns at most 200 ids ────────────────────────────────────
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
   limit 200
$$;
