-- PO lines remember how much of their quantity is BUFFER (owner's ask,
-- 2026-10-31): a PO raised from a product costing orders the plan for N pcs
-- plus an optional extra the user types (e.g. +10 Meter for wastage). The
-- owner wants every PO to show "planned for N pcs + buffer = total", so the
-- buffer bought can be tracked later.
--
-- `quantity` stays the TOTAL ordered (what the vendor supplies, what receipts,
-- pendency and amounts already use) — nothing downstream changes meaning.
-- `buffer_qty` is the part of it that is extra; planned = quantity - buffer.
-- Lines not raised with a buffer keep 0.
--
-- create_po_with_items / update_po_with_items now store `buffer_qty` from each
-- p_items entry (missing = 0, clamped to 0..quantity). They are patched in
-- place below (their bodies otherwise unchanged) and the patch refuses to run
-- if the text it replaces is not found exactly once. amend_po and
-- cancel_po_line are left as they are: a revision keeps a line's buffer, a
-- line added in a revision has none, and the app shows at most `quantity`.

alter table public.purchase_order_items
  add column if not exists buffer_qty numeric(14,3) not null default 0
  constraint purchase_order_items_buffer_qty_nonneg check (buffer_qty >= 0);

comment on column public.purchase_order_items.buffer_qty is
  'Part of quantity ordered as buffer (extra over the costing plan). Planned = quantity - buffer_qty.';

do $$
declare
  fn text; def text;
  old_cols constant text := 'insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order)';
  new_cols constant text := 'insert into purchase_order_items (po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, sort_order, buffer_qty)';
  old_vals constant text := 'case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_i);';
  new_vals constant text := 'case when v_rate is null then null else round(v_rate * v_qty, 2) end, v_i,'
    || E'\n      least(greatest(coalesce(nullif(v_item->>''buffer_qty'','''')::numeric, 0), 0), v_qty));';
begin
  foreach fn in array array['public.create_po_with_items(jsonb,jsonb)', 'public.update_po_with_items(uuid,jsonb,jsonb)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    if (length(def) - length(replace(def, old_cols, ''))) / length(old_cols) <> 1
       or (length(def) - length(replace(def, old_vals, ''))) / length(old_vals) <> 1 then
      raise exception '% does not match the expected item insert — not patched', fn;
    end if;
    execute replace(replace(def, old_cols, new_cols), old_vals, new_vals);
  end loop;
end $$;
