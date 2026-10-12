-- Cash Challan → Orders: partial delivery (owner's ask — "If I placed 4
-- orders and only want to make a challan for 2 items, or a single qty of a
-- multiple-qty item, the remaining should show in pending").
--
-- WHY: until now "Make challan" marked the whole order converted, whatever
-- the challan actually carried, so anything not yet sent fell off the list.
-- Now every challan made from an order records what it delivered, line by
-- line, and the order stays pending until every piece has gone out.
--
-- HOW:
--   * items[].delivered — pieces of that line already on a challan (absent
--     = 0). Converted orders are backfilled as fully delivered.
--   * cash_challan_order_deliveries — one row per challan made from an
--     order: what it took ([{sku, description, qty}]). The order card lists
--     these as "Challan #12 · #15". Converted orders are backfilled with one
--     row for the challan they became.
--   * create_challan_from_order(p_order_id, p_challan, p_items, p_payment) —
--     one transaction: locks the order, creates the challan through
--     create_challan_with_items (same checks, same audit), then allocates
--     the challan's lines to the order's open lines by SKU (description when
--     a line has no SKU), never more than is still due. Whatever the saved
--     challan carries is the truth, so edits in the challan form count. The
--     order becomes 'converted' (shown as Completed) when nothing is left.
--   * Voiding a challan hands its pieces back: an AFTER UPDATE trigger on
--     cash_challans reverses that challan's deliveries and puts a completed
--     order back to pending. SECURITY DEFINER on purpose: it is bookkeeping
--     the void itself implies, and must not silently do nothing for a role
--     that may void but not write orders. It is a trigger function, so it
--     cannot be called as an RPC.
-- Additive: no column dropped, no row lost.

-- 1. Backfill: converted orders delivered everything they listed.
update public.cash_challan_orders o
   set items = (select coalesce(jsonb_agg(e || jsonb_build_object('delivered', coalesce((e->>'quantity')::numeric, 0)) order by n), '[]'::jsonb)
                  from jsonb_array_elements(o.items) with ordinality as t(e, n))
 where o.status = 'converted';

-- 2. The deliveries log.
create table if not exists public.cash_challan_order_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.cash_challan_orders(id) on delete cascade,
  challan_id uuid not null references public.cash_challans(id) on delete cascade,
  lines jsonb not null default '[]'::jsonb,
  reversed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.cash_challan_order_deliveries is
  'One row per challan made from a Cash Challan order: what it delivered, lines = [{sku, description, qty}]. reversed_at is set when that challan is voided and the pieces go back to the order.';

create index if not exists cash_challan_order_deliveries_order_idx on public.cash_challan_order_deliveries (order_id, created_at);
create index if not exists cash_challan_order_deliveries_challan_idx on public.cash_challan_order_deliveries (challan_id);

alter table public.cash_challan_order_deliveries enable row level security;

drop policy if exists "Authenticated can read" on public.cash_challan_order_deliveries;
create policy "Authenticated can read" on public.cash_challan_order_deliveries
  for select to authenticated using (true);

drop policy if exists "Operator+ can write" on public.cash_challan_order_deliveries;
create policy "Operator+ can write" on public.cash_challan_order_deliveries
  for all to authenticated
  using (exists (select 1 from public.profiles
                 where profiles.id = (select auth.uid())
                   and profiles.role = any (array['admin', 'manager', 'operator'])))
  with check (exists (select 1 from public.profiles
                      where profiles.id = (select auth.uid())
                        and profiles.role = any (array['admin', 'manager', 'operator'])));

insert into public.cash_challan_order_deliveries (order_id, challan_id, lines, created_by, created_at)
select o.id, o.challan_id,
       (select coalesce(jsonb_agg(jsonb_build_object('sku', coalesce(e->>'sku', ''), 'description', coalesce(e->>'description', ''), 'qty', coalesce((e->>'quantity')::numeric, 0)) order by n), '[]'::jsonb)
          from jsonb_array_elements(o.items) with ordinality as t(e, n)),
       o.converted_by, coalesce(o.converted_at, o.updated_at)
  from public.cash_challan_orders o
 where o.status = 'converted' and o.challan_id is not null
   and not exists (select 1 from public.cash_challan_order_deliveries d where d.order_id = o.id and d.challan_id = o.challan_id);

-- The key a challan line and an order line are matched on.
create or replace function public.challan_order_line_key(p_sku text, p_description text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $$
  select case when btrim(coalesce(p_sku, '')) <> '' then 'S:' || upper(btrim(p_sku))
              else 'D:' || lower(btrim(coalesce(p_description, ''))) end
$$;

-- 3. Make a challan from an order, in one transaction.
create or replace function public.create_challan_from_order(p_order_id uuid, p_challan jsonb, p_items jsonb, p_payment jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_order cash_challan_orders%rowtype;
  v_res jsonb;
  v_pool jsonb := '{}'::jsonb;     -- key -> pieces on the challan not yet allocated
  v_it jsonb;
  v_key text;
  v_items jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_qty numeric; v_done numeric; v_avail numeric; v_take numeric;
  v_took numeric := 0; v_left numeric := 0;
  v_status text;
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

  for v_it in select jsonb_array_elements(p_items) loop
    v_key := challan_order_line_key(v_it->>'sku', v_it->>'description');
    v_pool := jsonb_set(v_pool, array[v_key], to_jsonb(coalesce((v_pool->>v_key)::numeric, 0) + greatest(coalesce((v_it->>'quantity')::numeric, 0), 0)));
  end loop;

  for v_it in select e from jsonb_array_elements(v_order.items) with ordinality as t(e, n) order by n loop
    v_key := challan_order_line_key(v_it->>'sku', v_it->>'description');
    v_qty := coalesce((v_it->>'quantity')::numeric, 0);
    v_done := coalesce((v_it->>'delivered')::numeric, 0);
    v_avail := coalesce((v_pool->>v_key)::numeric, 0);
    v_take := least(greatest(v_qty - v_done, 0), v_avail);
    if v_take > 0 then
      v_pool := jsonb_set(v_pool, array[v_key], to_jsonb(v_avail - v_take));
      v_done := v_done + v_take;
      v_took := v_took + v_take;
      v_lines := v_lines || jsonb_build_object('sku', coalesce(v_it->>'sku', ''), 'description', coalesce(v_it->>'description', ''), 'qty', v_take);
    end if;
    v_left := v_left + greatest(v_qty - v_done, 0);
    v_items := v_items || (v_it || jsonb_build_object('delivered', v_done));
  end loop;

  v_status := case when v_left <= 0 then 'converted' else 'pending' end;
  if v_took > 0 then
    update cash_challan_orders set
      items = v_items, status = v_status, challan_id = (v_res->>'id')::uuid,
      converted_at = case when v_status = 'converted' then now() else null end,
      converted_by = case when v_status = 'converted' then auth.uid() else null end,
      updated_at = now()
    where id = v_order.id;
    insert into cash_challan_order_deliveries (order_id, challan_id, lines, created_by)
    values (v_order.id, (v_res->>'id')::uuid, v_lines, auth.uid());
  end if;

  return v_res || jsonb_build_object('order_delivered', v_took, 'order_remaining', v_left, 'order_status', case when v_took > 0 then v_status else v_order.status end);
end;
$function$;

revoke all on function public.create_challan_from_order(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_challan_from_order(uuid, jsonb, jsonb, jsonb) to authenticated;

-- 4. A voided challan hands its pieces back to the order.
create or replace function public.challan_order_unwind_void()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_d record;
  v_order cash_challan_orders%rowtype;
  v_line jsonb;
  v_it jsonb;
  v_back numeric;
  v_done numeric;
  v_key text;
  v_items jsonb;
  v_n int;
begin
  for v_d in select id, order_id, lines from cash_challan_order_deliveries
              where challan_id = new.id and reversed_at is null for update loop
    select * into v_order from cash_challan_orders where id = v_d.order_id for update;
    if not found then continue; end if;
    v_items := v_order.items;
    for v_line in select jsonb_array_elements(v_d.lines) loop
      v_key := challan_order_line_key(v_line->>'sku', v_line->>'description');
      v_back := coalesce((v_line->>'qty')::numeric, 0);
      -- take the pieces back from the last delivered lines with that key first
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
    update cash_challan_orders set
      items = v_items,
      status = case when status = 'converted' then 'pending' else status end,
      converted_at = case when status = 'converted' then null else converted_at end,
      converted_by = case when status = 'converted' then null else converted_by end,
      updated_at = now()
    where id = v_order.id;
    update cash_challan_order_deliveries set reversed_at = now() where id = v_d.id;
  end loop;
  return null;
end;
$function$;

revoke all on function public.challan_order_unwind_void() from public, anon, authenticated;

drop trigger if exists trg_challan_order_unwind_void on public.cash_challans;
create trigger trg_challan_order_unwind_void
  after update of status on public.cash_challans
  for each row
  when (new.status = 'voided' and old.status is distinct from 'voided')
  execute function public.challan_order_unwind_void();
