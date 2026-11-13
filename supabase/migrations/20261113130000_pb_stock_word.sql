-- Playbook: the later word about a product's stock wins (pre-launch fix D17).
--
-- WHY: a vendor says two kinds of things about a product's stock: a stock-out
-- notice ("5081 stock out"), and a new post of the product itself ("it is
-- back"). Playbook reads posts one at a time and not always in the order they
-- were made: a read that fails is tried again five minutes later, and a post
-- that waits for its "Less" is read after the ones behind it. Acting in
-- READING order could put a sold-out product back on sale because an older
-- post happened to be read last (found in the independent review of the fix,
-- 2026-11-13, by running the two orders).
--
-- HOW: pb_products.stock_said_at keeps the time of the latest word about the
-- product's stock: when the vendor made that post, or when a person flipped
-- the Stock switch. pb_stock_save takes the time of the word it is asked to
-- apply ("said_at" in p_change) and applies the change only when no NEWER word
-- is on record — in the same statement, so two posts read at the same moment
-- cannot both win. It answers -2 when a newer word stands. A change without a
-- time works exactly as before. "force" (the Stock switch) always applies.
-- The stores are owed a send only when what they show changes (the stock, a
-- permanent stock-out): a note or a time alone is not sent. Every existing
-- caller names in_stock, so nothing changes for them.
--
-- Additive: one column, one function replaced with the same signature and
-- answers (plus -2). SECURITY INVOKER, as before.
alter table public.pb_products add column if not exists stock_said_at timestamptz;
comment on column public.pb_products.stock_said_at is 'When the latest word about this product''s stock was said: the time the vendor made the notice or the new post that last set it, or when a person flipped the Stock switch. pb_stock_save refuses an older word.';

create or replace function public.pb_stock_save(p_product uuid, p_change jsonb)
returns int
language plpgsql security invoker set search_path = public as $$
declare
  n int := 0;
  v_said timestamptz := (p_change ->> 'said_at')::timestamptz;
  v_force boolean := coalesce((p_change ->> 'force')::boolean, false);
begin
  update pb_products p set
    in_stock    = case when p_change ? 'in_stock'    then coalesce((p_change ->> 'in_stock')::boolean, p.in_stock) else p.in_stock end,
    temp_out_at = case when p_change ? 'temp_out_at' then (p_change ->> 'temp_out_at')::timestamptz else p.temp_out_at end,
    perm_out_at = case when p_change ? 'perm_out_at' then (p_change ->> 'perm_out_at')::timestamptz else p.perm_out_at end,
    stock_said_at = case when v_said is null then p.stock_said_at else greatest(v_said, coalesce(p.stock_said_at, v_said)) end
  where p.id = p_product
    and (v_said is null or v_force or p.stock_said_at is null or p.stock_said_at <= v_said);
  if not found then
    return case when exists (select 1 from pb_products where id = p_product) then -2 else -1 end;
  end if;
  if p_change ? 'in_stock' or p_change ? 'perm_out_at' then
    update pb_listings l set stock_due = true, stock_tried_at = null
    where l.product_id = p_product and l.shopify_product_id is not null
      and not (l.status = 'skipped' and coalesce(l.shopify_status, '') in ('DRAFT', 'ARCHIVED'));
    get diagnostics n = row_count;
  end if;
  return n;
end $$;
comment on function public.pb_stock_save(uuid, jsonb) is 'Save a product''s stock and mark its listings on sale on Shopify as owing their store the change, in one transaction (pb-products stock.ts). With said_at in p_change: only when no newer word about its stock is on record (-2 otherwise).';
