-- Purchase orders: the vendor's challan number on a receipt, and one challan
-- received against several POs in one go (owner's ask, 2026-10-21).
--
-- Why: 74 of 109 receipt remarks were challan / bill numbers typed into
-- Remarks, and 14 challans covered 40 POs (up to 6 on one challan), each
-- received one PO at a time. The number now has its own column (searchable,
-- shown on the receipt), and receive_po_challan books one vendor's challan
-- across several open POs in one transaction — each PO through the same
-- receive_po_items, so its status, the cancelled-line guard and its RECEIVE
-- audit row (now naming the challan) are exactly as for a single receive.
-- Old receipts keep their remarks; nothing is backfilled. The "not open for
-- receiving" refusal now names the PO and passes through to the user.

alter table public.purchase_order_receipts
  add column challan_no text check (challan_no is null or (btrim(challan_no) <> '' and length(challan_no) <= 40));
create index purchase_order_receipts_challan_idx on public.purchase_order_receipts (lower(challan_no)) where challan_no is not null;

create or replace function public.receive_po_items(p_po_id uuid, p_receipts jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare v_status text; v_num int; v_r jsonb; v_item_id uuid; v_qty numeric; v_ordered numeric; v_already numeric; v_total int; v_full int; v_n int := 0; v_sum numeric := 0;
  v_cancelled timestamptz; v_label text; v_challan text; v_challans text[] := '{}';
begin
  perform set_config('app.po_rpc','on',true);
  select status, po_number into v_status, v_num from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_status not in ('approved','sent','partially_received') then
    -- Names the order (a challan books several) and reads as words, not a code.
    raise exception 'PO #% is not open for receiving (it is %)', v_num, replace(v_status, '_', ' ');
  end if;
  if p_receipts is null or jsonb_array_length(p_receipts) = 0 then raise exception 'Nothing to receive' using errcode='23514'; end if;
  for v_r in select value from jsonb_array_elements(p_receipts) loop
    v_item_id := (v_r->>'po_item_id')::uuid;
    v_qty := (v_r->>'received_qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select quantity, received_qty, cancelled_at, item_name || coalesce(' · ' || nullif(btrim(fabric_code), ''), '')
      into v_ordered, v_already, v_cancelled, v_label from purchase_order_items where id = v_item_id and po_id = p_po_id for update;
    if not found then raise exception 'That item is not part of this purchase order'; end if;
    if v_cancelled is not null then raise exception '% was cancelled on this order — it cannot be received', v_label; end if;
    v_challan := nullif(btrim(coalesce(v_r->>'challan_no', '')), '');
    if length(v_challan) > 40 then raise exception 'The challan number is too long (40 characters at most)'; end if;
    if v_challan is not null and not (v_challan = any (v_challans)) then v_challans := v_challans || v_challan; end if;
    -- Over-receipt is allowed (manufacturing over-delivery is normal). No <= ordered cap.
    insert into purchase_order_receipts (po_id, po_item_id, received_qty, receipt_date, remarks, received_by, challan_no)
    values (p_po_id, v_item_id, v_qty, coalesce(nullif(v_r->>'receipt_date','')::date, (now() at time zone 'Asia/Kolkata')::date), nullif(v_r->>'remarks',''), auth.uid(), v_challan);
    update purchase_order_items set received_qty = received_qty + v_qty where id = v_item_id;
    v_n := v_n + 1; v_sum := v_sum + v_qty;
  end loop;
  if v_n = 0 then raise exception 'Enter a received quantity for at least one item' using errcode='23514'; end if;
  select count(*), count(*) filter (where received_qty >= quantity - 0.0001) into v_total, v_full from purchase_order_items where po_id = p_po_id;
  update purchase_orders set status = case when v_full = v_total then 'completed' else 'partially_received' end, modified_by = auth.uid(), updated_at = now() where id = p_po_id;
  perform audit_write('purchase_order', 'RECEIVE', p_po_id::text,
    'PO #' || v_num || ' — received ' || inr_text(v_sum) || ' across ' || v_n || ' item' || case when v_n = 1 then '' else 's' end
    || case when cardinality(v_challans) > 0 then ' · challan ' || array_to_string(v_challans, ', ') else '' end);
  return jsonb_build_object('ok', true, 'received_count', v_n);
end $function$;

-- One vendor's challan across several open POs, in one transaction.
create or replace function public.receive_po_challan(p_challan_no text, p_receipt_date date, p_remarks text, p_lines jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_challan text := nullif(btrim(coalesce(p_challan_no, '')), '');
  v_po uuid; v_lines jsonb; v_vendors int; v_out jsonb := '[]'::jsonb; v_res jsonb;
begin
  if v_challan is null then raise exception 'Enter the challan number'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Enter a received quantity for at least one item'; end if;
  -- Every line must be a line of a PO; the POs must all be the same vendor.
  if exists (select 1 from jsonb_array_elements(p_lines) l left join purchase_order_items i on i.id = (l->>'po_item_id')::uuid where i.id is null) then
    raise exception 'That item is not part of any purchase order';
  end if;
  select count(distinct coalesce(po.vendor_id::text, 'n:' || lower(btrim(po.vendor_name)))) into v_vendors
  from jsonb_array_elements(p_lines) l join purchase_order_items i on i.id = (l->>'po_item_id')::uuid join purchase_orders po on po.id = i.po_id;
  if v_vendors > 1 then raise exception 'One challan is from one vendor — these orders are from different vendors'; end if;
  -- One receive per PO, in a fixed order (two people booking overlapping challans never deadlock).
  for v_po in
    select i.po_id from jsonb_array_elements(p_lines) l join purchase_order_items i on i.id = (l->>'po_item_id')::uuid
    where coalesce((l->>'received_qty')::numeric, 0) > 0 group by i.po_id order by i.po_id
  loop
    select jsonb_agg(jsonb_build_object('po_item_id', l->>'po_item_id', 'received_qty', l->'received_qty', 'receipt_date', p_receipt_date,
      'remarks', nullif(btrim(coalesce(p_remarks, '')), ''), 'challan_no', v_challan))
      into v_lines
    from jsonb_array_elements(p_lines) l join purchase_order_items i on i.id = (l->>'po_item_id')::uuid
    where i.po_id = v_po and coalesce((l->>'received_qty')::numeric, 0) > 0;
    v_res := receive_po_items(v_po, v_lines);
    v_out := v_out || jsonb_build_array(jsonb_build_object('po_id', v_po, 'po_number', (select po_number from purchase_orders where id = v_po),
      'status', (select status from purchase_orders where id = v_po), 'received_count', v_res->'received_count'));
  end loop;
  if jsonb_array_length(v_out) = 0 then raise exception 'Enter a received quantity for at least one item'; end if;
  return jsonb_build_object('ok', true, 'orders', v_out);
end $function$;

-- Search also finds a PO by its challan number.
create or replace function public.search_po_ids(q text)
 returns setof uuid
 language sql
 stable
 set search_path to 'public'
as $function$
  select po_id from purchase_order_items
  where sku ilike '%' || q || '%' or fabric_code ilike '%' || q || '%' or item_name ilike '%' || q || '%'
  union
  select po_id from purchase_order_receipts where challan_no ilike '%' || q || '%';
$function$;

revoke execute on function public.receive_po_challan(text, date, text, jsonb) from public, anon;
grant execute on function public.receive_po_challan(text, date, text, jsonb) to authenticated;
