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
-- HOW: pb_products.stock_said_at keeps the time of the latest word that
-- DECIDED the product's stock. pb_stock_save is told when the word it is asked
-- to apply was said, and applies it only when no newer word is on record — in
-- the same statement, so two posts read at the same moment cannot both win.
-- It answers -2 when a newer word stands. In p_change:
--   said_at = a time   a word that decides the stock (a stock-out notice, a new
--                      post of the product, the Stock switch off). Applied when
--                      nothing newer is on record, and put on record.
--                      At the very same time a stock-out stands: a word that
--                      puts the product back on sale has to be newer.
--   said_at = null     the Stock switch ON. Always applied, and the time on
--                      record is forgotten: a tap must not silence a vendor's
--                      notice that was posted before it and has not reached
--                      Playbook yet (second review, finding 1).
--   as_of = a time     a note only (a "temporary stock out"): judged by its
--                      time but not put on record, so it never outranks a real
--                      stock-out that is read after it (second review, 5).
--   force              the Stock switch OFF: always applies.
--   none of them       works exactly as before (every caller before this fix).
-- The "temporarily out" note carries the time the vendor said it. A word only
-- clears a note OLDER than itself, and an older note never replaces a newer
-- one — so the note, too, ends the same whichever post was read first.
-- The stores are owed a send only when what they show changes (the stock, a
-- permanent stock-out): a note or a time alone is not sent.
--
-- Additive: one column, one function replaced with the same signature and
-- answers (plus -2). SECURITY INVOKER, as before.
alter table public.pb_products add column if not exists stock_said_at timestamptz;
comment on column public.pb_products.stock_said_at is 'When the latest word that decided this product''s stock was said: the time the vendor made the notice or the new post that last set it, or when a person switched its Stock off. Empty after a person switched it on. pb_stock_save refuses an older word.';

create or replace function public.pb_stock_save(p_product uuid, p_change jsonb)
returns int
language plpgsql security invoker set search_path = public as $$
declare
  n int := 0;
  v_stamp boolean := p_change ? 'said_at';                                        -- this word goes on record
  v_said  timestamptz := (p_change ->> 'said_at')::timestamptz;                   -- null with the key there: forget the time on record
  v_asof  timestamptz := coalesce(v_said, (p_change ->> 'as_of')::timestamptz);   -- the time this word is judged by
  v_force boolean := coalesce((p_change ->> 'force')::boolean, false);
  v_on    boolean := coalesce((p_change ->> 'in_stock')::boolean, false);         -- it puts the product back on sale
  v_note  timestamptz := (p_change ->> 'temp_out_at')::timestamptz;
begin
  update pb_products p set
    in_stock    = case when p_change ? 'in_stock'    then coalesce((p_change ->> 'in_stock')::boolean, p.in_stock) else p.in_stock end,
    temp_out_at = case
      when not (p_change ? 'temp_out_at') then p.temp_out_at
      when v_asof is null or v_force then v_note                                               -- no time given: as asked
      when v_note is null then case when p.temp_out_at >= v_asof then p.temp_out_at end        -- a note from a later post stays
      else greatest(v_note, coalesce(p.temp_out_at, v_note)) end,                              -- an older note never replaces a newer one
    perm_out_at = case when p_change ? 'perm_out_at' then (p_change ->> 'perm_out_at')::timestamptz else p.perm_out_at end,
    stock_said_at = case when not v_stamp then p.stock_said_at when v_said is null then null
                         else greatest(v_said, coalesce(p.stock_said_at, v_said)) end
  where p.id = p_product
    and (v_asof is null or v_force or p.stock_said_at is null
         or case when v_on then p.stock_said_at < v_asof else p.stock_said_at <= v_asof end);
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
comment on function public.pb_stock_save(uuid, jsonb) is 'Save a product''s stock and mark its listings on sale on Shopify as owing their store the change, in one transaction (pb-products stock.ts). With said_at or as_of in p_change: only when no newer word about its stock is on record (-2 otherwise).';
