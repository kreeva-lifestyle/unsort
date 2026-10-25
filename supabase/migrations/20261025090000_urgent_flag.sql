-- One "Urgent" flag across the three queues the floor works from — purchase
-- orders, jobwork orders and cash-challan orders — so the most pressing
-- thing sits at the top of its list with a red URGENT tag, optionally with
-- why and a needed-by date. Owner asked for it on 2026-10-25.
--
-- * Each table gets is_urgent + urgent_reason + urgent_by (date) + urgent_at
--   + urgent_set_by. A partial index on is_urgent keeps "Urgent only" cheap.
-- * jobwork_order_summary is replaced with the four columns appended (the
--   list reads the view, not the table).
-- * set_urgent(module, id, on, reason, by) is the one write path, SECURITY
--   INVOKER so RLS still applies; admin/manager/operator; only a record that
--   is still live (PO not completed/closed/cancelled, job open, order
--   pending) can be flagged. It goes through each module's guard the way the
--   module's own RPCs do (app.po_rpc / app.order_rpc) and writes one
--   audit_log row: URGENT ("PO #111 — marked urgent: reason · needed by
--   02 Nov") or URGENT_CLEARED.
-- * urgent_autoclear (BEFORE UPDATE OF status on all three): a record that
--   leaves the live set (PO completed/closed/cancelled, job closed/cancelled,
--   order processed/cancelled) drops the flag, so the Completed tabs never
--   carry a stale URGENT. Reopening it does not bring the flag back.
--
-- Applied live as urgent_flag.

alter table public.purchase_orders
  add column is_urgent boolean not null default false,
  add column urgent_reason text,
  add column urgent_by date,
  add column urgent_at timestamptz,
  add column urgent_set_by uuid;
alter table public.jobwork_orders
  add column is_urgent boolean not null default false,
  add column urgent_reason text,
  add column urgent_by date,
  add column urgent_at timestamptz,
  add column urgent_set_by uuid;
alter table public.cash_challan_orders
  add column is_urgent boolean not null default false,
  add column urgent_reason text,
  add column urgent_by date,
  add column urgent_at timestamptz,
  add column urgent_set_by uuid;

create index purchase_orders_urgent_idx on public.purchase_orders (is_urgent) where is_urgent;
create index jobwork_orders_urgent_idx on public.jobwork_orders (is_urgent) where is_urgent;
create index cash_challan_orders_urgent_idx on public.cash_challan_orders (is_urgent) where is_urgent;

-- The list's view: same definition as 20261022003000_jobwork_from_po with
-- the urgent columns appended (a view can only grow at the end).
create or replace view public.jobwork_order_summary with (security_invoker = true) as
 SELECT o.id,
    o.jw_number,
    o.vendor_id,
    o.vendor_name,
    o.vendor_phone,
    o.job_type,
    o.sku,
    o.component,
    o.costing_product_id,
    o.pieces,
    o.qty_unit,
    o.rate,
    o.job_date,
    o.expected_date,
    o.status,
    o.notes,
    o.close_reason,
    o.created_at,
    o.updated_at,
    COALESCE(e.pcs_ok, 0::numeric) AS pcs_ok,
    COALESCE(e.pcs_rejected, 0::numeric) AS pcs_rejected,
    COALESCE(e.pcs_rework, 0::numeric) AS pcs_rework,
    GREATEST(o.pieces - COALESCE(e.pcs_ok, 0::numeric) - COALESCE(e.pcs_rejected, 0::numeric) + COALESCE(e.pcs_rework, 0::numeric), 0::numeric) AS pcs_remaining,
    COALESCE(e.outs, 0::bigint)::integer AS out_count,
    e.last_entry_date,
    round(COALESCE(e.pcs_ok, 0::numeric) * o.rate, 2) AS bill,
    COALESCE(p.paid, 0::numeric) AS paid,
    round(COALESCE(e.pcs_ok, 0::numeric) * o.rate - COALESCE(p.paid, 0::numeric), 2) AS due,
    p.last_pay_date,
    o.po_id,
    po.po_number,
    o.is_urgent,
    o.urgent_reason,
    o.urgent_by,
    o.urgent_at
   FROM jobwork_orders o
     LEFT JOIN LATERAL ( SELECT sum(jobwork_entries.pcs_ok) AS pcs_ok,
            sum(jobwork_entries.pcs_rejected) AS pcs_rejected,
            sum(jobwork_entries.pcs_rework) AS pcs_rework,
            count(*) FILTER (WHERE jobwork_entries.kind = 'out'::text) AS outs,
            max(jobwork_entries.entry_date) AS last_entry_date
           FROM jobwork_entries
          WHERE jobwork_entries.order_id = o.id) e ON true
     LEFT JOIN LATERAL ( SELECT sum(jobwork_payments.amount) AS paid,
            max(jobwork_payments.pay_date) AS last_pay_date
           FROM jobwork_payments
          WHERE jobwork_payments.order_id = o.id) p ON true
     LEFT JOIN purchase_orders po ON po.id = o.po_id;

-- Flag or clear. p_module: 'purchase_order' | 'jobwork' | 'cash_challan_order'.
create or replace function public.set_urgent(p_module text, p_id uuid, p_on boolean, p_reason text default null, p_by date default null)
 returns void
 language plpgsql
 security invoker
 set search_path to 'public'
as $function$
declare
  v_role text := (select role from profiles where id = auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_by date := p_by;
  v_label text; v_status text; v_was boolean;
begin
  if coalesce(v_role, '') not in ('admin', 'manager', 'operator') then
    raise exception 'You do not have permission to mark things urgent';
  end if;
  if length(v_reason) > 120 then raise exception 'Keep the reason under 120 characters'; end if;
  if not p_on then v_reason := null; v_by := null; end if;

  if p_module = 'purchase_order' then
    select 'PO #' || po_number, status, is_urgent into v_label, v_status, v_was from purchase_orders where id = p_id for update;
    if not found then raise exception 'Purchase order not found'; end if;
    if v_status in ('completed', 'closed', 'cancelled') then
      raise exception 'This order is % — only an open order can be marked urgent', v_status;
    end if;
    perform set_config('app.po_rpc', 'on', true);
    update purchase_orders
       set is_urgent = p_on, urgent_reason = v_reason, urgent_by = v_by,
           urgent_at = case when p_on then now() end, urgent_set_by = case when p_on then auth.uid() end,
           modified_by = auth.uid(), updated_at = now()
     where id = p_id;
  elsif p_module = 'jobwork' then
    select 'JW #' || jw_number, status, is_urgent into v_label, v_status, v_was from jobwork_orders where id = p_id for update;
    if not found then raise exception 'Job not found'; end if;
    if v_status <> 'open' then raise exception 'This job is % — only an open job can be marked urgent', v_status; end if;
    -- jobwork_guard stamps updated_at.
    update jobwork_orders
       set is_urgent = p_on, urgent_reason = v_reason, urgent_by = v_by,
           urgent_at = case when p_on then now() end, urgent_set_by = case when p_on then auth.uid() end
     where id = p_id;
  elsif p_module = 'cash_challan_order' then
    select challan_order_no(order_number), status, is_urgent into v_label, v_status, v_was from cash_challan_orders where id = p_id for update;
    if not found then raise exception 'Order not found'; end if;
    if v_status <> 'pending' then
      raise exception 'This order is % — only a pending order can be marked urgent', case v_status when 'converted' then 'processed' else v_status end;
    end if;
    perform set_config('app.order_rpc', 'on', true);
    update cash_challan_orders
       set is_urgent = p_on, urgent_reason = v_reason, urgent_by = v_by,
           urgent_at = case when p_on then now() end, urgent_set_by = case when p_on then auth.uid() end,
           updated_at = now()
     where id = p_id;
  else
    raise exception 'Unknown module %', p_module;
  end if;

  perform audit_write(p_module, case when p_on then 'URGENT' else 'URGENT_CLEARED' end, p_id::text,
    v_label || case when p_on
      then ' — marked urgent' || coalesce(': ' || v_reason, '') || coalesce(' · needed by ' || to_char(v_by, 'DD Mon'), '')
      else ' — urgent cleared' end,
    jsonb_build_object('on', p_on, 'was', v_was, 'reason', v_reason, 'by', v_by));
end $function$;

revoke all on function public.set_urgent(text, uuid, boolean, text, date) from public, anon;
grant execute on function public.set_urgent(text, uuid, boolean, text, date) to authenticated;

-- A record that leaves the live set drops its flag (no audit row: the
-- status change itself is already recorded).
create or replace function public.urgent_autoclear()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare v_live boolean;
begin
  if not new.is_urgent or new.status is not distinct from old.status then return new; end if;
  v_live := case tg_table_name
    when 'purchase_orders' then new.status not in ('completed', 'closed', 'cancelled')
    when 'jobwork_orders' then new.status = 'open'
    else new.status = 'pending' end;
  if not v_live then
    new.is_urgent := false; new.urgent_reason := null; new.urgent_by := null; new.urgent_at := null; new.urgent_set_by := null;
  end if;
  return new;
end $function$;

create or replace trigger urgent_autoclear before update of status on public.purchase_orders
  for each row execute function public.urgent_autoclear();
create or replace trigger urgent_autoclear before update of status on public.jobwork_orders
  for each row execute function public.urgent_autoclear();
create or replace trigger urgent_autoclear before update of status on public.cash_challan_orders
  for each row execute function public.urgent_autoclear();
