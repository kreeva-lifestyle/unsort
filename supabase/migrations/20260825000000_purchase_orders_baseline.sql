-- BASELINE, recorded 2026-09-16 from the live schema. The Purchase Orders
-- tables, their RLS, indexes, the po_number sequence, get_next_po_number,
-- search_po_ids, receive_po_items and the two guard triggers were created
-- through the MCP without a migration file, so a replay of this folder
-- failed for every PO object from 20260826011653 onward. This file is what
-- those objects looked like BEFORE 20260910093000 (for_pieces) and
-- 20260911091500 (short close) extended them; it is dated to sort before
-- them. It was NOT applied to the live project (the objects exist there);
-- replay it only on a fresh database. Later migrations replace the
-- functions with create or replace, so they layer cleanly on top.

create sequence if not exists public.purchase_orders_po_number_seq;

create table if not exists public.po_vendors (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  phone text not null,
  gstin text,
  address text,
  notes text,
  is_active boolean default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists po_vendors_name_phone_uk on public.po_vendors (lower(name), phone);
create index if not exists po_vendors_name_idx on public.po_vendors (lower(name));

create table if not exists public.purchase_orders (
  id uuid not null default gen_random_uuid() primary key,
  po_number integer not null default nextval('public.purchase_orders_po_number_seq') unique,
  vendor_id uuid references public.po_vendors(id),
  vendor_name text not null,
  vendor_phone text,
  po_type text not null default 'material',
  status text not null default 'draft',
  po_date date default current_date,
  expected_date date,
  payment_terms text,
  notes text,
  subtotal numeric default 0,
  discount_type text,
  discount_value numeric default 0,
  discount_amount numeric default 0,
  tax_percent numeric default 0,
  tax_amount numeric default 0,
  other_charges numeric default 0,
  round_off numeric default 0,
  grand_total numeric default 0,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id),
  modified_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint chk_po_status check (status = any (array['draft','approved','sent','partially_received','completed','cancelled'])),
  constraint chk_po_type check (po_type = any (array['fabric','job_work','material']))
);
alter sequence public.purchase_orders_po_number_seq owned by public.purchase_orders.po_number;
create index if not exists purchase_orders_created_idx on public.purchase_orders (created_at desc);
create index if not exists purchase_orders_po_date_idx on public.purchase_orders (po_date desc);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status);
create index if not exists purchase_orders_type_idx on public.purchase_orders (po_type);
create index if not exists purchase_orders_vendor_idx on public.purchase_orders (vendor_id);

create table if not exists public.purchase_order_items (
  id uuid not null default gen_random_uuid() primary key,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_name text not null,
  sku text,
  quantity numeric not null check (quantity > 0),
  unit text,
  rate numeric,
  amount numeric,
  received_qty numeric not null default 0,
  sort_order integer default 0,
  created_at timestamptz default now()
);
create index if not exists purchase_order_items_po_idx on public.purchase_order_items (po_id);
create index if not exists idx_po_items_sku_trgm on public.purchase_order_items using gin (sku gin_trgm_ops);

create table if not exists public.purchase_order_receipts (
  id uuid not null default gen_random_uuid() primary key,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  po_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  received_qty numeric not null check (received_qty > 0),
  receipt_date date default current_date,
  remarks text,
  received_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create index if not exists purchase_order_receipts_po_idx on public.purchase_order_receipts (po_id);
create index if not exists purchase_order_receipts_item_idx on public.purchase_order_receipts (po_item_id);

-- RLS: everyone signed in reads; operator+ writes; admin/manager deletes.
alter table public.po_vendors enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.purchase_order_receipts enable row level security;

create policy "pov read" on public.po_vendors for select using ((select auth.role()) = 'authenticated');
create policy "pov write" on public.po_vendors for insert with check ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager','operator'])));
create policy "pov update" on public.po_vendors for update using ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager','operator'])));
create policy "pov delete" on public.po_vendors for delete using ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager'])));

create policy "po read" on public.purchase_orders for select using ((select auth.role()) = 'authenticated');
create policy "po write" on public.purchase_orders for insert with check ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager','operator'])));
create policy "po update" on public.purchase_orders for update using ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager','operator'])));
create policy "po delete" on public.purchase_orders for delete using ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager'])));

create policy "poi read" on public.purchase_order_items for select using ((select auth.role()) = 'authenticated');
create policy "poi write" on public.purchase_order_items for all using ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager','operator']))) with check ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager','operator'])));

create policy "por read" on public.purchase_order_receipts for select using ((select auth.role()) = 'authenticated');
create policy "por write" on public.purchase_order_receipts for all using ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager','operator']))) with check ((select auth.role()) = 'authenticated' and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['admin','manager','operator'])));

-- The number the form shows before saving (the real one is assigned on insert).
create or replace function public.get_next_po_number()
 returns integer
 language sql
 stable
 set search_path to 'public'
as $function$
  select case when is_called then last_value + 1 else last_value end
  from purchase_orders_po_number_seq;
$function$;

create or replace function public.search_po_ids(q text)
 returns setof uuid
 language sql
 stable
 set search_path to 'public'
as $function$
  select distinct po_id from purchase_order_items
  where sku ilike '%' || q || '%';
$function$;

-- Sum of receipts must equal the item's received_qty at commit.
create or replace function public.check_po_receipt_sync()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare v_item_id uuid; v_sum numeric; v_rq numeric;
begin
  v_item_id := coalesce(new.po_item_id, old.po_item_id);
  select received_qty into v_rq from purchase_order_items where id = v_item_id;
  if v_rq is null then return null; end if; -- item cascade-deleted
  select coalesce(sum(received_qty),0) into v_sum from purchase_order_receipts where po_item_id = v_item_id;
  if abs(coalesce(v_sum,0) - coalesce(v_rq,0)) > 0.0001 then
    raise exception 'Receipt total (%) does not match the item received quantity (%)', v_sum, v_rq using errcode = '23514';
  end if;
  return null;
end $function$;

drop trigger if exists trg_po_receipt_sync on public.purchase_order_receipts;
create constraint trigger trg_po_receipt_sync
  after insert or delete or update on public.purchase_order_receipts
  deferrable initially deferred
  for each row execute function public.check_po_receipt_sync();

-- Original header guard (replaced by 20260916133000): cancelled is permanent,
-- drafts edit freely, otherwise only inside an RPC or a notes-only edit.
create or replace function public.protect_po_immutability()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if old.status = 'cancelled' then
    raise exception 'Cancelled purchase orders cannot be modified — this is a permanent record.';
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if current_setting('app.po_rpc', true) = 'on' then
    return new;
  end if;
  if (new.notes is distinct from old.notes)
     and row(new.id,new.po_number,new.vendor_id,new.vendor_name,new.vendor_phone,new.po_type,new.status,new.po_date,new.expected_date,new.payment_terms,new.subtotal,new.discount_type,new.discount_value,new.discount_amount,new.tax_percent,new.tax_amount,new.other_charges,new.round_off,new.grand_total,new.approved_by,new.approved_at,new.cancelled_by,new.cancelled_at,new.created_by,new.created_at)
       is not distinct from
         row(old.id,old.po_number,old.vendor_id,old.vendor_name,old.vendor_phone,old.po_type,old.status,old.po_date,old.expected_date,old.payment_terms,old.subtotal,old.discount_type,old.discount_value,old.discount_amount,old.tax_percent,old.tax_amount,old.other_charges,old.round_off,old.grand_total,old.approved_by,old.approved_at,old.cancelled_by,old.cancelled_at,old.created_by,old.created_at)
  then
    return new;
  end if;
  raise exception 'Approved purchase orders cannot be edited — cancel and create a new one.';
end $function$;

drop trigger if exists trg_protect_po_immutability on public.purchase_orders;
create trigger trg_protect_po_immutability
  before update on public.purchase_orders
  for each row execute function public.protect_po_immutability();

-- Original receive (replaced by 20260916143000, which adds the audit row).
create or replace function public.receive_po_items(p_po_id uuid, p_receipts jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_status text; v_r jsonb; v_item_id uuid; v_qty numeric; v_ordered numeric; v_already numeric; v_total int; v_full int; v_n int := 0;
begin
  perform set_config('app.po_rpc','on',true);
  select status into v_status from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_status not in ('approved','sent','partially_received') then
    raise exception 'This purchase order is not open for receiving (status: %)', v_status using errcode='23514';
  end if;
  if p_receipts is null or jsonb_array_length(p_receipts) = 0 then raise exception 'Nothing to receive' using errcode='23514'; end if;
  for v_r in select value from jsonb_array_elements(p_receipts) loop
    v_item_id := (v_r->>'po_item_id')::uuid;
    v_qty := (v_r->>'received_qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select quantity, received_qty into v_ordered, v_already from purchase_order_items where id = v_item_id and po_id = p_po_id for update;
    if not found then raise exception 'That item is not part of this purchase order'; end if;
    insert into purchase_order_receipts (po_id, po_item_id, received_qty, receipt_date, remarks, received_by)
    values (p_po_id, v_item_id, v_qty, coalesce(nullif(v_r->>'receipt_date','')::date, current_date), nullif(v_r->>'remarks',''), auth.uid());
    update purchase_order_items set received_qty = received_qty + v_qty where id = v_item_id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Enter a received quantity for at least one item' using errcode='23514'; end if;
  select count(*), count(*) filter (where received_qty >= quantity - 0.0001) into v_total, v_full from purchase_order_items where po_id = p_po_id;
  update purchase_orders set status = case when v_full = v_total then 'completed' else 'partially_received' end, modified_by = auth.uid(), updated_at = now() where id = p_po_id;
  return jsonb_build_object('ok', true, 'received_count', v_n);
end $function$;
