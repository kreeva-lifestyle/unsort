-- Purchase orders: cancel one line, and revise (amend) an order after it is
-- approved, keeping a history of what changed (owner's ask, 2026-10-21).
--
-- Why the shape:
-- * A cancelled line keeps what already arrived: its quantity drops to the
--   received amount and the balance moves to `cancelled_qty`. Every place
--   that reads "pending = quantity − received" (list, rail, stats, vendor
--   report, close, receive) then sees nothing pending on it without change,
--   and the status maths (all lines received → completed) still holds. A
--   line cancelled before anything arrived ends at quantity 0, so the
--   quantity check now allows 0 on a cancelled line only.
-- * Revisions: the order carries its revision number (1 = as raised), and
--   every revision or line cancel writes one row to
--   purchase_order_revisions with a per-line list of changes, so the detail
--   can show the history and build the "revised PO" WhatsApp message. The
--   row also records when the vendor was told. Writes go only through the
--   PO RPCs (the same po_require_rpc guard as the other PO tables).

alter table public.purchase_order_items
  add column cancelled_qty numeric not null default 0,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles(id),
  add column cancel_reason text;

alter table public.purchase_order_items drop constraint purchase_order_items_quantity_check;
alter table public.purchase_order_items add constraint purchase_order_items_quantity_check
  check (quantity > 0 or (cancelled_at is not null and quantity >= 0));
alter table public.purchase_order_items add constraint purchase_order_items_cancelled_check
  check (cancelled_qty >= 0 and (cancelled_at is not null or cancelled_qty = 0));

alter table public.purchase_orders
  add column revision int not null default 1,
  add column revised_at timestamptz,
  add column revised_by uuid references public.profiles(id);

create table public.purchase_order_revisions (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  revision int not null,
  kind text not null check (kind in ('amend', 'line_cancel')),
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  reason text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  notified_by uuid references public.profiles(id),
  notified_how text check (notified_how in ('whatsapp', 'told')),
  unique (po_id, revision)
);

alter table public.purchase_order_revisions enable row level security;
create policy "po rev read" on public.purchase_order_revisions
  for select to authenticated using (true);
create policy "po rev write" on public.purchase_order_revisions
  for insert to authenticated with check (
    (select auth.role()) = 'authenticated' and exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = any (array['admin', 'manager', 'operator'])));
create policy "po rev update" on public.purchase_order_revisions
  for update to authenticated using (
    (select auth.role()) = 'authenticated' and exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = any (array['admin', 'manager', 'operator'])));

create trigger trg_po_revisions_rpc_only
  before insert or update or delete on public.purchase_order_revisions
  for each row execute function public.po_require_rpc();

revoke all on public.purchase_order_revisions from anon;
revoke truncate, references, trigger on public.purchase_order_revisions from authenticated;
