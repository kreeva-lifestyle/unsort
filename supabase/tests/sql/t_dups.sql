-- "Was this product already added?" — the rules in the database, checked (pre-launch fix D21: they had no test).
-- The real SQL is loaded by run.sh: 20261112150000_pb_duplicates.sql, 20261112170000_pb_photo_prints.sql,
-- 20261113040000_pb_stock_save.sql, 20261113120000_pb_copies.sql, 20261113130000_pb_stock_word.sql and 20261113150000_pb_gate_category_list.sql. Every check prints "ok …" or "FAIL …";
-- run.sh fails when a FAIL is printed. Nothing is kept: each part rolls back.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
create sequence if not exists public.t_checks; -- counts the checks (a sequence is not rolled back with the parts)
create or replace function public.t_is(p_what text, p_got text, p_want text) returns text language sql as $$
  select case when p_got is not distinct from p_want then 'ok   ' || p_what
              else 'FAIL ' || p_what || ' — got ' || coalesce(p_got, 'null') || ', wanted ' || coalesce(p_want, 'null') end
  from (select nextval('public.t_checks')) n $$;
-- something that must be refused: ok when it raises (what it had done is undone), FAIL when it goes through
create or replace function public.t_refused(p_what text, p_sql text) returns text language plpgsql as $$
begin
  perform nextval('public.t_checks');
  execute p_sql;
  return 'FAIL ' || p_what || ' — it was not refused';
exception when others then
  return 'ok   ' || p_what || ' ("' || sqlerrm || '")';
end $$;
-- how product `p_me` relates to `p_other`, as the app reads it: kind/how, or none
create or replace function public.t_rel(p_me uuid, p_other uuid) returns text language sql as $$
  select coalesce((select m.kind || '/' || m.how from public.pb_dup_matches(array[p_me]) m where m.other_id = p_other), 'none') $$;
-- a product with everything the Ready gate asks for
create or replace function public.t_product(p_n int, p_vendor uuid, p_sku text, p_color text, p_day int, p_cost numeric default 500, p_status text default 'ready') returns uuid
language plpgsql as $$
declare v uuid := ('c0000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
begin
  insert into public.pb_products (id, vendor_id, sku, name, category, fabric, color, cost_price, status, ai_read_at, source, created_at)
  values (v, p_vendor, p_sku, 'P' || p_n, 'Saree', 'Silk', p_color, p_cost, p_status, now(), 'telegram', timestamptz '2026-11-01 00:00+00' + make_interval(days => p_day));
  insert into public.pb_product_images (product_id, path, position) values (v, 'p' || p_n || '.jpg', 0);
  return v;
end $$;
create or replace function public.t_id(p_n int) returns uuid language sql immutable as $$ select ('c0000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
\set V1 '''a1000000-0000-4000-8000-000000000001'''
\set V2 '''a1000000-0000-4000-8000-000000000002'''

-- ── 1. the design code ────────────────────────────────────────────────────
select t_is('code of "' || x.sku || '"', public.pb_code_key(x.sku), x.want) from (values
  ('Kb-302', 'KB302'), ('KB 302 XS blue', 'KB302'), ('KB302', 'KB302'), ('ka5070', 'KA5070'), ('KA-5070', 'KA5070'), ('NKB 47 PURPLE XS', 'NKB47'),
  ('KB 0302', 'KB302'), ('KB 302A', 'KB302A'),
  -- a number alone, however it is labelled, is "#number": it never links two products by itself
  ('5081', '#5081'), ('D no 5081', '#5081'), ('D.No. 302', '#302'), ('Design No 5081', '#5081'),
  -- a one-word label right before the number counts as letters (the stock notice and the re-post step still treat these as numbers: stockNotice.ts LABEL)
  ('D-5081', 'D5081'), ('Code 7165', 'CODE7165'), ('No. 7165', 'NO7165'),
  ('', null), ('Pink kurta', null), ('KB 5', null), ('12', null)) x(sku, want);
select t_is('number of "' || x.sku || '"', public.pb_code_num(x.sku), x.want) from (values ('NKB 47 PURPLE XS', '47'), ('D no 5081', '5081'), ('D-5081', '5081'), ('Pink kurta', null)) x(sku, want);

-- ── 2. the colours ────────────────────────────────────────────────────────
select t_is('colours of "' || x.sku || '" / ' || coalesce(x.color, '-'), array_to_string(public.pb_colour_keys(x.sku, x.color), ','), x.want) from (values
  ('KB 302 XS blue', null, 'blue'), ('KB 302 ROYAL BLUE', 'Pink', 'royalblue'), ('NKB 47 PURPLE XS', 'Violet', 'purple'),
  ('Kb-302', 'Pink, Wine', 'pink,wine'), ('KA-5070', 'Pink / Wine', 'pink,wine'), ('KA-5070', 'Teal Blue', 'tealblue'), ('KA-5070', 'Pink and White', 'pinkandwhite'),
  ('KA-5070', null, ''), ('', 'Rani Pink', 'ranipink'), ('D no 5081', 'Wine', 'wine')) x(sku, color, want);

-- ── 3. which products match, and what the gate does with them ─────────────
begin;
select t_product(1, :V1, 'KA-5070', 'Pink', 1) is not null, t_product(2, :V1, 'ka 5070', 'Pink', 2) is not null, t_product(3, :V1, 'KA 5070', 'Blue', 3) is not null,
       t_product(4, :V1, 'KA5070', null, 4) is not null, t_product(5, :V2, 'KA-5070', 'Pink', 5) is not null,
       t_product(6, :V1, 'D no 5081', 'Pink', 1) is not null, t_product(7, :V1, '5081', 'Pink', 2) is not null,
       t_product(8, :V1, 'KB 25', 'Red', 1) is not null, t_product(9, :V1, 'NKB 25', 'Red', 2) is not null,
       t_product(10, :V1, 'KA-5070', 'Pink', 0, 500, 'archived') is not null, t_product(13, :V1, 'KA-5070', 'Rani Pink', 6) is not null;
select t_is('same vendor, code and colour: the later one is held', t_rel(t_id(2), t_id(1)), 'held/code');
select t_is('… and the earlier one is the original', t_rel(t_id(1), t_id(2)), 'original/code');
select t_is('another colour of the design is not a copy', t_rel(t_id(3), t_id(1)), 'colour/code');
select t_is('a colour worded differently is another colour too (Rani Pink / Pink)', t_rel(t_id(13), t_id(1)), 'colour/code');
select t_is('no colour on the later one: held', t_rel(t_id(4), t_id(1)), 'held/code');
select t_is('the same code at another vendor: a suggestion', t_rel(t_id(5), t_id(1)), 'maybe/other_vendor');
select t_is('a number alone, same vendor and colour: a suggestion, never held', t_rel(t_id(7), t_id(6)), 'maybe/code');
select t_is('the same number with other letters: a suggestion', t_rel(t_id(9), t_id(8)), 'maybe/near_code');
select t_is('an archived product is never compared', t_rel(t_id(2), t_id(10)), 'none');
select t_is('held as a copy of the EARLIEST match', public.pb_dup_held(t_id(4))::text, t_id(1)::text);
select t_is('another colour is held by nothing', public.pb_dup_held(t_id(3))::text, null);
select t_is('a number alone is held by nothing', public.pb_dup_held(t_id(7))::text, null);
-- the gate
select t_is('gate: ' || right(g.id::text, 2), g.status || ' (was ' || g.was || ')', case right(g.id::text, 2) when '01' then 'ready (was ready)' when '02' then 'needs_info (was ready)' when '03' then 'ready (was ready)' when '07' then 'ready (was ready)' end)
  from public.pb_products_refresh(array[t_id(1), t_id(2), t_id(3), t_id(7)]) g order by g.id;
select t_is('the gate notes what a held product copies', (select copy_of::text from pb_products where id = t_id(2)), t_id(1)::text);
select t_is('… and nothing for a product it does not hold', (select coalesce(copy_of::text, 'null') from pb_products where id = t_id(3)), 'null');
-- a person's answers
select t_is('"Different product" lets it go', (select a.status || ' (was ' || a.was || ')' from public.pb_dup_answer(t_id(2), array[t_id(1)], 'different') a), 'ready (was needs_info)');
select t_is('… marked for the websites, the note cleared', (select route_due::text || '/' || coalesce(copy_of::text, 'null') from pb_products where id = t_id(2)), 'true/null');
select t_is('… and remembered', t_rel(t_id(2), t_id(1)), 'different/code');
select public.pb_dup_verdict_set(t_id(7), t_id(6), 'same');
select t_is('"same" on a number-only pair holds it (what the back-in-stock step does)', public.pb_dup_held(t_id(7))::text, t_id(6)::text);
select t_is('… the gate then holds it', (select g.status from public.pb_products_refresh(array[t_id(7)]) g), 'needs_info');
select t_is('… as a copy of the earlier one', (select copy_of::text from pb_products where id = t_id(7)), t_id(6)::text);
select t_is('"It is a copy" archives this product', (select a.status from public.pb_dup_answer(t_id(4), array[t_id(1)], 'same') a), 'archived');
rollback;

-- ── 4. two posts of one product read in the same minute ───────────────────
-- The later one was judged while the earlier one's code was not saved yet, so it passed. After the earlier one's
-- read is saved, the reader asks for its matches and has the gate judge the later ones again (reader.ts regateLater).
begin;
select t_product(11, :V1, null, 'Green', 1) is not null, t_product(12, :V1, 'KQ-900', 'Green', 2) is not null;
select t_is('judged first, the later post passes', (select g.status from public.pb_products_refresh(array[t_id(12)]) g), 'ready');
update pb_products set sku = 'KQ 900' where id = t_id(11);
select t_is('the earlier post stays Ready', (select g.status from public.pb_products_refresh(array[t_id(11)]) g), 'ready');
select t_is('its matches name the later post, still Ready', (select string_agg(m.kind || '/' || m.other_status, ',') from public.pb_dup_matches(array[t_id(11)]) m), 'original/ready');
select t_is('judged again, the later post is held', (select g.status from public.pb_products_refresh(array(select m.other_id from public.pb_dup_matches(array[t_id(11)]) m where m.kind = 'original' and m.other_status = 'ready')) g), 'needs_info');
select t_is('… as a copy of the earlier one', (select copy_of::text from pb_products where id = t_id(12)), t_id(11)::text);
rollback;

-- ── 5. the products a stock notice, or a re-post, means ───────────────────
begin;
select t_product(6, :V1, 'D no 5081', 'Pink', 1) is not null, t_product(7, :V1, '5081', 'Wine', 2) is not null, t_product(14, :V1, 'KB 5081', 'Pink', 3) is not null,
       t_product(15, :V2, 'D no 5081', 'Pink', 4) is not null, t_product(16, :V2, 'KB-5081', 'Pink', 5) is not null, t_product(17, :V1, 'D no 5081', 'Pink', 0, 500, 'archived') is not null;
select t_is('a number: the vendor''s own products with it, oldest first', (select string_agg(right(c.id::text, 2) || ':' || c.code_key, ' ' order by o) from public.pb_stock_candidates(:V1, 'D.No 5081') with ordinality c(id, name, sku, color, in_stock, status, code_key, colour_keys, same_vendor, notice_key, o)), '06:#5081 07:#5081 14:KB5081');
select t_is('a lettered code: also the same code at another vendor, marked', (select string_agg(right(c.id::text, 2) || ':' || c.same_vendor, ' ' order by c.id) from public.pb_stock_candidates(:V1, 'KB 5081') c), '06:true 07:true 14:true 16:false');
select t_is('the colours come with them', (select string_agg(right(c.id::text, 2) || ':' || array_to_string(c.colour_keys, '+'), ' ' order by c.id) from public.pb_stock_candidates(:V1, '5081') c), '06:pink 07:wine 14:pink');
select t_is('an archived product only while a listing of it is on a store', (select count(*)::text from public.pb_stock_candidates(:V1, '5081') c where c.id = t_id(17)), '0');
insert into pb_websites (id, name, shop_domain) values ('e0000000-0000-4000-8000-000000000001', 'S', 's.myshopify.com');
insert into pb_listings (product_id, website_id, status, shopify_product_id, shopify_status) values (t_id(17), 'e0000000-0000-4000-8000-000000000001', 'published', 'gid://17', 'ACTIVE');
select t_is('… then it is found', (select count(*)::text from public.pb_stock_candidates(:V1, '5081') c where c.id = t_id(17)), '1');
rollback;

-- ── 6. "Archive the copies": the held copies together, and taking it back ──
begin;
\set V3 '''a1000000-0000-4000-8000-000000000003'''
\set R1 '''d0000000-0000-4000-8000-000000000001'''
select t_product(20, :V3, 'ZX-100', 'Red', 1, 500) is not null, t_product(21, :V3, 'ZX-100', 'Red', 2, 500) is not null, t_product(22, :V3, 'ZX-100', 'Red', 3, 650) is not null,
       t_product(23, :V3, 'ZX-100', 'Red', 4, null) is not null, t_product(24, :V3, 'ZX-100', 'Red', 5, 500) is not null,
       t_product(30, :V3, 'ZY-200', 'Blue', 1, null) is not null, t_product(31, :V3, 'ZY-200', 'Blue', 2, 700) is not null,
       t_product(40, :V3, 'ZW-300', 'Green', 1, null) is not null, t_product(41, :V3, 'ZW-300', 'Green', 2, 800) is not null,
       t_product(50, :V3, 'ZV-400', 'Black', 1, 500) is not null, t_product(51, :V3, 'ZV-400', null, 2, 500) is not null, t_product(52, :V3, 'ZV-400', 'Grey', 3, 500) is not null,
       t_product(60, :V3, 'ZU-500', 'Blue', 1, 500) is not null, t_product(61, :V3, 'ZU-500', 'Blue', 2, 500) is not null,
       t_product(65, :V3, 'ZT-600', 'Pink', 1, 500) is not null, t_product(66, :V3, 'ZT-600', 'Pink', 2, 900) is not null;
update pb_products set source = 'import', sell_price = 1999 where id = t_id(30); -- copied from a store: it sells at that store's price
insert into pb_websites (id, name, shop_domain) values ('e0000000-0000-4000-8000-000000000001', 'S', 's.myshopify.com');
insert into pb_listings (product_id, website_id, status, shopify_product_id, shopify_status) values (t_id(24), 'e0000000-0000-4000-8000-000000000001', 'published', 'gid://24', 'ACTIVE');
select count(*) from public.pb_products_refresh(array(select id from pb_products));
select t_is('held', (select string_agg(right(id::text, 2) || '>' || right(copy_of::text, 2), ' ' order by id) from pb_products where status = 'needs_info' and copy_of is not null),
  '21>20 22>20 23>20 24>20 31>30 41>40 51>50 52>51 61>60 66>65');
-- the product a copy points at is archived by hand: the note follows (here: to nothing), the copy itself is left as it is
update pb_products set status = 'archived' where id = t_id(65);
select t_is('the note follows when what it points at is archived; nothing is let go', (select status || '/' || coalesce(copy_of::text, 'null') || '/' || route_due::text from pb_products where id = t_id(66)), 'needs_info/null/false');
-- … and it is back when that product is brought back from the archive (second review, 6: the copy sat in Needs info with no reason shown)
update pb_products set status = 'ready' where id = t_id(65);
select t_is('the note is back when what it copied is restored', (select status || '>' || coalesce(right(copy_of::text, 2), 'null') from pb_products where id = t_id(66)), 'needs_info>65');
update pb_products set status = 'archived' where id = t_id(65);
select t_is('… and gone again with it', (select coalesce(copy_of::text, 'null') from pb_products where id = t_id(66)), 'null');
-- what a copy points at gets another code: the note follows at once, here too
update pb_products set sku = 'ZU-501' where id = t_id(60);
select t_is('… and when its code is changed', (select status || '/' || coalesce(copy_of::text, 'null') from pb_products where id = t_id(61)), 'needs_info/null');
update pb_products set sku = 'ZU-500' where id = t_id(60);
select t_is('… the gate holds it again once the code is back', (select g.status from public.pb_products_refresh(array[t_id(61)]) g) || '', 'needs_info');
-- a note can still be out of date: here the pair is answered without the gate being asked. The count leaves it out; the action clears it.
select public.pb_dup_verdict_set(t_id(61), t_id(60), 'different');
-- 51 (no colour) is held as a copy of 50 (Black); 52 (Grey) only as a copy of 51: a chain. Archived together, no Grey product would be left,
-- and archiving 51 alone would leave 52 waiting for nothing. Both are left for a person: 51 because a waiting copy points at it ("linked"),
-- 52 because the product it copies has no colour, so it may be another colour ("no_colour").
select t_is('looking only: what would be archived, and what is left', public.pb_copies_archive(false)::text, '{"linked": 1, "priced": 2, "on_site": 1, "archived": 3, "no_colour": 1}');
select t_is('… nothing changed', (select count(*)::text from pb_products where status = 'archived'), '1');
select t_refused('a signed-in person cannot run it', 'select public.pb_copies_archive(true)');
select t_is('… nothing changed', (select count(*)::text from pb_products where status = 'archived'), '1');
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
insert into pb_bulk_runs (id, kind, label, status) values (:R1, 'copies', 'Archived the products waiting as copies', 'running');
select set_config('request.headers', json_build_object('x-pb-bulk', :R1)::text, false);
select t_is('done: exactly what was shown', public.pb_copies_archive(true)::text, '{"linked": 1, "priced": 2, "on_site": 1, "archived": 3, "no_colour": 1}');
select set_config('request.headers', '{}', false);
update pb_bulk_runs set status = 'done', items = (select count(*) from pb_bulk_items where run_id = :R1), finished_at = now() where id = :R1;
select t_is('products now', (select string_agg(right(id::text, 2) || ':' || status, ' ' order by id) from pb_products where id <> all (array[t_id(20), t_id(30), t_id(40), t_id(50), t_id(60), t_id(65)])),
  '21:archived 22:needs_info 23:archived 24:needs_info 31:archived 41:needs_info 51:needs_info 52:needs_info 61:needs_info 66:needs_info');
select t_is('the chain keeps its notes', (select string_agg(right(id::text, 2) || '>' || right(copy_of::text, 2), ' ' order by id) from pb_products where id in (t_id(51), t_id(52))), '51>50 52>51');
select t_is('nothing was let go to the websites', (select count(*)::text from pb_products where route_due or (status = 'ready' and id not in (t_id(20), t_id(30), t_id(50), t_id(60)))), '0');
select t_is('a note that was out of date is cleared, its product left as it is', (select status || '/' || coalesce(copy_of::text, 'null') from pb_products where id = t_id(61)), 'needs_info/null');
select t_is('a timeline line for each', (select count(*)::text from pb_activity where action = 'archived' and details ->> 'bulk' = 'true'), '3');
select t_is('… that says what it copied', (select right(details ->> 'copy_of', 2) from pb_activity where product_id = t_id(31) and action = 'archived'), '30');
select t_is('the log has every row it changed', (select count(*)::text from pb_bulk_items where run_id = :R1 and tbl = 'pb_products'), '3');
select t_is('a second tap finds nothing more to archive', public.pb_copies_archive(false)::text, '{"linked": 1, "priced": 2, "on_site": 1, "archived": 0, "no_colour": 1}');
-- meanwhile a person restores one of them (Restore → read again), and the product another one copied is archived
update pb_products set status = 'new' where id = t_id(23);
update pb_products set status = 'archived' where id = t_id(30);
select t_is('revert, looking only', (public.pb_bulk_revert(:R1, false) - 'label')::text, '{"gone": 0, "kind": "copies", "changed": 1, "restored": 1, "not_copies": 1}');
select t_is('… nothing changed', (select string_agg(right(id::text, 2) || ':' || status, ' ' order by id) from pb_products where id = any (array[t_id(21), t_id(23), t_id(31)])), '21:archived 23:new 31:archived');
select t_is('… and it can still be reverted', (select status from pb_bulk_runs where id = :R1), 'done');
select t_is('revert: the same numbers', (public.pb_bulk_revert(:R1, true) - 'label')::text, '{"gone": 0, "kind": "copies", "changed": 1, "restored": 1, "not_copies": 1}');
-- 21 waits as a copy again; 31 is no longer a copy of anything (30 is archived): it stays archived, and carries no note
select t_is('back as they were: waiting as copies again', (select string_agg(right(id::text, 2) || ':' || status || coalesce('>' || right(copy_of::text, 2), ''), ' ' order by id) from pb_products where id = any (array[t_id(21), t_id(23), t_id(31)])),
  '21:needs_info>20 23:new>20 31:archived');
select t_is('a revert sends nothing to the websites either', (select count(*)::text from pb_products where route_due), '0');
select t_is('the run says reverted', (select status from pb_bulk_runs where id = :R1), 'reverted');
select t_refused('a second revert is refused', format('select public.pb_bulk_revert(%L, true)', :R1));
-- the chain, by hand: the person archives the middle one. The last one is no longer a copy of anything; its own gate lets it go when it is next saved.
update pb_products set status = 'archived' where id = t_id(51);
select t_is('a chain answered by hand: the last one loses its note', (select status || '/' || coalesce(copy_of::text, 'null') from pb_products where id = t_id(52)), 'needs_info/null');
select t_is('… and its own gate lets it go', (select g.status from public.pb_products_refresh(array[t_id(52)]) g) || '', 'ready');
-- what a copy points at is DELETED (an import taken back): the note moves to the next earlier product, or to none (second review, 6)
select t_product(80, :V3, 'ZS-700', 'Red', 1) is not null, t_product(81, :V3, 'ZS-700', 'Red', 2) is not null, t_product(82, :V3, 'ZS-700', 'Red', 3) is not null;
select count(*) from public.pb_products_refresh(array[t_id(80), t_id(81), t_id(82)]);
select t_is('two copies of one product', (select string_agg(right(id::text, 2) || '>' || right(copy_of::text, 2), ' ' order by id) from pb_products where id in (t_id(81), t_id(82))), '81>80 82>80');
delete from pb_products where id = t_id(80);
select t_is('the product they copied is deleted: the note moves on, or goes', (select string_agg(right(id::text, 2) || '>' || coalesce(right(copy_of::text, 2), 'none'), ' ' order by id) from pb_products where id in (t_id(81), t_id(82))), '81>none 82>81');
select t_is('… and no note points at a product that is gone', (select count(*)::text from pb_products c where c.copy_of is not null and not exists (select 1 from pb_products o where o.id = c.copy_of)), '0');
rollback;

-- ── 6b. "Archive the copies" when the EARLIER product has no colour (third review, 3) ──
-- The gate holds any colour as a copy of a product without one (it cannot tell them apart). Archiving on that ground
-- would keep the incomplete product and lose the complete ones — or the only Grey and the only Black of a design.
begin;
\set V4 '''a1000000-0000-4000-8000-000000000004'''
select t_product(90, :V4, 'ZQ-100', null, 1) is not null, t_product(91, :V4, 'ZQ-100', 'Grey', 2) is not null, t_product(92, :V4, 'ZQ-100', 'Black', 3) is not null,
       t_product(95, :V4, 'ZP-200', 'Red', 1) is not null, t_product(96, :V4, 'ZP-200', null, 2) is not null;
select count(*) from public.pb_products_refresh(array(select id from pb_products));
select t_is('held: two colours behind a product with none, and a post with no colour behind a Red one',
  (select string_agg(right(id::text, 2) || '>' || right(copy_of::text, 2), ' ' order by id) from pb_products where status = 'needs_info' and copy_of is not null), '91>90 92>90 96>95');
select t_is('Grey and Black are two colours to the rules', t_rel(t_id(92), t_id(91)), 'colour/code');
select t_is('looking only: the two that may be another colour are left; the post with no colour is a plain copy',
  public.pb_copies_archive(false)::text, '{"linked": 0, "priced": 0, "on_site": 0, "archived": 1, "no_colour": 2}');
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select t_is('done: the same', public.pb_copies_archive(true)::text, '{"linked": 0, "priced": 0, "on_site": 0, "archived": 1, "no_colour": 2}');
select set_config('request.jwt.claims', '{}', false);
select t_is('the Grey and the Black product still stand', (select string_agg(right(id::text, 2) || ':' || status, ' ' order by id) from pb_products where id in (t_id(91), t_id(92), t_id(96))), '91:needs_info 92:needs_info 96:archived');
-- the earlier product gets its colour (a person types it): the rules can now tell, and the other colour is let go by its own gate
update pb_products set color = 'Grey' where id = t_id(90);
select t_is('once the earlier product has a colour: the same colour is a plain copy, the other colour is no copy at all',
  (select string_agg(right(g.id::text, 2) || ':' || g.status, ' ' order by g.id) from public.pb_products_refresh(array[t_id(91), t_id(92)]) g) || ' ' || public.pb_copies_archive(false)::text,
  '91:needs_info 92:ready {"linked": 0, "priced": 0, "on_site": 0, "archived": 1, "no_colour": 0}');
rollback;

-- ── 7. the later word about a product's stock wins (pb_stock_save with said_at) ──
begin;
set local timezone = 'UTC';
select t_product(70, :V1, 'D no 7000', 'Pink', 1) is not null;
insert into pb_websites (id, name, shop_domain) values ('e0000000-0000-4000-8000-000000000001', 'S', 's.myshopify.com');
insert into pb_listings (product_id, website_id, status, shopify_product_id, shopify_status) values (t_id(70), 'e0000000-0000-4000-8000-000000000001', 'published', 'gid://70', 'ACTIVE');
select t_is('a change with no time works as before: its listing is owed to the store', public.pb_stock_save(t_id(70), '{"in_stock": false}')::text, '1');
select t_is('… saved, and no time is put on record', (select in_stock::text || '/' || coalesce(stock_said_at::text, 'null') from pb_products where id = t_id(70)), 'false/null');
select t_is('a word with a time applies when none is on record', public.pb_stock_save(t_id(70), '{"in_stock": true, "temp_out_at": null, "said_at": "2026-11-10T09:00:00Z"}')::text, '1');
select t_is('an OLDER word is refused', public.pb_stock_save(t_id(70), '{"in_stock": false, "said_at": "2026-11-10T08:00:00Z"}')::text, '-2');
select t_is('… and nothing changed', (select in_stock::text || ' ' || stock_said_at::text from pb_products where id = t_id(70)), 'true 2026-11-10 09:00:00+00');
select t_is('a NEWER word applies', public.pb_stock_save(t_id(70), '{"in_stock": false, "said_at": "2026-11-10T15:00:00Z"}')::text, '1');
select t_is('the same word again applies (a read that is tried again)', public.pb_stock_save(t_id(70), '{"in_stock": false, "said_at": "2026-11-10T15:00:00Z"}')::text, '1');
select t_is('the re-post from the morning cannot bring it back', public.pb_stock_save(t_id(70), '{"in_stock": true, "temp_out_at": null, "said_at": "2026-11-10T09:00:00Z"}')::text, '-2');
select t_is('… it stays out of stock', (select in_stock::text from pb_products where id = t_id(70)), 'false');
update pb_listings set stock_due = false;
select t_is('a note or a time alone owes the stores nothing', public.pb_stock_save(t_id(70), '{"temp_out_at": "2026-11-10T16:00:00Z", "said_at": "2026-11-10T16:00:00Z"}')::text, '0');
select t_is('… it is saved, and the listing is not marked', (select (p.temp_out_at is not null)::text || '/' || l.stock_due::text from pb_products p join pb_listings l on l.product_id = p.id where p.id = t_id(70)), 'true/false');
select t_is('a person''s switch always applies', public.pb_stock_save(t_id(70), '{"in_stock": true, "said_at": "2026-11-10T10:00:00Z", "force": true}')::text, '1');
select t_is('… and the newest time stays on record', (select in_stock::text || ' ' || stock_said_at::text from pb_products where id = t_id(70)), 'true 2026-11-10 16:00:00+00');
select t_is('a product that does not exist', public.pb_stock_save(gen_random_uuid(), '{"in_stock": false, "said_at": "2026-11-10T09:00:00Z"}')::text, '-1');
-- at the very same time a stock-out stands, whichever of the two is read first (second review, 5)
select t_is('a stock-out said at the time on record applies', public.pb_stock_save(t_id(70), '{"in_stock": false, "temp_out_at": null, "said_at": "2026-11-10T16:00:00Z"}')::text, '1');
select t_is('… and the note from that same time stays', (select in_stock::text || '/' || (temp_out_at is not null)::text from pb_products where id = t_id(70)), 'false/true');
select t_is('a new post of the product from that same time does not bring it back', public.pb_stock_save(t_id(70), '{"in_stock": true, "temp_out_at": null, "said_at": "2026-11-10T16:00:00Z"}')::text, '-2');
select t_is('a newer one does, and takes the older note with it', public.pb_stock_save(t_id(70), '{"in_stock": true, "temp_out_at": null, "said_at": "2026-11-10T17:00:00Z"}')::text, '1');
select t_is('… in stock, no note', (select in_stock::text || '/' || coalesce(temp_out_at::text, 'null') from pb_products where id = t_id(70)), 'true/null');
-- a temporary stock-out is a note: judged by its time, but it does not become the latest word
update pb_listings set stock_due = false;
select t_is('a temporary note applies when nothing newer is on record', public.pb_stock_save(t_id(70), '{"temp_out_at": "2026-11-10T18:00:00Z", "as_of": "2026-11-10T18:00:00Z"}')::text, '0');
select t_is('… dated when the vendor said it, the time on record untouched, the stores owed nothing', (select p.temp_out_at::text || ' ' || p.stock_said_at::text || ' ' || l.stock_due::text from pb_products p join pb_listings l on l.product_id = p.id where p.id = t_id(70)), '2026-11-10 18:00:00+00 2026-11-10 17:00:00+00 false');
select t_is('a stock-out posted BEFORE that note but read after it still applies', public.pb_stock_save(t_id(70), '{"in_stock": false, "temp_out_at": null, "said_at": "2026-11-10T17:30:00Z"}')::text, '1');
select t_is('… out of stock, and the later note is kept', (select in_stock::text || ' ' || temp_out_at::text || ' ' || stock_said_at::text from pb_products where id = t_id(70)), 'false 2026-11-10 18:00:00+00 2026-11-10 17:30:00+00');
select t_is('a temporary note older than the word on record is refused', public.pb_stock_save(t_id(70), '{"temp_out_at": "2026-11-10T12:00:00Z", "as_of": "2026-11-10T12:00:00Z"}')::text, '-2');
select t_is('an older note never replaces a newer one', public.pb_stock_save(t_id(70), '{"temp_out_at": "2026-11-10T17:45:00Z", "as_of": "2026-11-10T17:45:00Z"}')::text || ' ' || (select temp_out_at::text from pb_products where id = t_id(70)), '0 2026-11-10 18:00:00+00');
select t_is('a new post older than the note brings the product back and leaves the note', public.pb_stock_save(t_id(70), '{"in_stock": true, "temp_out_at": null, "said_at": "2026-11-10T17:40:00Z"}')::text, '1');
select t_is('… in stock, note kept', (select in_stock::text || ' ' || temp_out_at::text from pb_products where id = t_id(70)), 'true 2026-11-10 18:00:00+00');
-- the Stock switch. OFF is the latest word as of the tap; ON claims no time (second review, 1: a tap silenced a notice that had not arrived yet)
select t_is('switched OFF by a person: always applies', public.pb_stock_save(t_id(70), '{"in_stock": false, "said_at": "2026-11-10T20:00:00Z", "force": true}')::text, '1');
select t_is('… a new post from before the tap does not bring it back', public.pb_stock_save(t_id(70), '{"in_stock": true, "temp_out_at": null, "said_at": "2026-11-10T19:00:00Z"}')::text, '-2');
select t_is('switched ON by a person: always applies', public.pb_stock_save(t_id(70), '{"in_stock": true, "perm_out_at": null, "said_at": null}')::text, '1');
select t_is('… and the time on record is forgotten', (select in_stock::text || '/' || coalesce(stock_said_at::text, 'null') from pb_products where id = t_id(70)), 'true/null');
select t_is('a notice posted before the tap, read after it, still applies', public.pb_stock_save(t_id(70), '{"in_stock": false, "temp_out_at": null, "said_at": "2026-11-10T11:00:00Z"}')::text, '1');
select t_is('… out of stock, with the notice''s time on record', (select in_stock::text || ' ' || stock_said_at::text from pb_products where id = t_id(70)), 'false 2026-11-10 11:00:00+00');
-- a post that is OLDER than a permanent stock-out of its design: the product that word took off sale is found, although it is archived (third review, 1)
select t_product(73, :V1, 'D no 7300', 'Pink', 1) is not null, t_product(74, :V1, '7300 BLUE', 'Blue', 2) is not null, t_product(75, :V2, 'D no 7300', 'Pink', 2) is not null;
select public.pb_stock_save(t_id(73), '{"in_stock": false, "temp_out_at": null, "perm_out_at": "2026-11-12T00:00:00Z", "said_at": "2026-11-10T15:00:00Z"}') is not null;
update pb_products set status = 'archived' where id = t_id(73);
select t_is('archived with nothing on a store, so a re-post no longer finds it among the candidates', (select count(*)::text from public.pb_stock_candidates(:V1, '7300') c where c.id = t_id(73)), '0');
select t_is('a post from 10:00 is older than the word that took it off for good', (select string_agg(right(g.id::text, 2) || ':' || g.code_key || ':' || array_to_string(g.colour_keys, '+') || ':' || g.said_at::text, ' ') from public.pb_stock_gone(:V1, 'D.No 7300', '2026-11-10T10:00:00Z') g), '73:#7300:pink:2026-11-10 15:00:00+00');
select t_is('a post from 16:00 is newer: nothing (it is its own product)', (select count(*)::text from public.pb_stock_gone(:V1, '7300', '2026-11-10T16:00:00Z')), '0');
select t_is('never another vendor''s product, and never without a design number', (select count(*)::text from public.pb_stock_gone(:V2, '7300', '2026-11-10T10:00:00Z')) || '/' || (select count(*)::text from public.pb_stock_gone(:V1, 'Pink kurta', '2026-11-10T10:00:00Z')), '0/0');
select public.pb_stock_save(t_id(74), '{"in_stock": false, "temp_out_at": null, "said_at": "2026-11-10T15:00:00Z"}') is not null;
select t_is('a product that is only out of stock (not for good) is not one of them', (select string_agg(right(g.id::text, 2), ' ') from public.pb_stock_gone(:V1, '7300', '2026-11-10T10:00:00Z') g), '73');
rollback;

-- ── 8. a category the list no longer has; "Retag all" by attribute (20261113150000_pb_gate_category_list.sql) ──
begin;
\set A_C '''e0000000-0000-4000-8000-000000000001'''
\set A_O '''e0000000-0000-4000-8000-000000000002'''
\set V_PK '''e1000000-0000-4000-8000-000000000001'''
\set V_PT '''e1000000-0000-4000-8000-000000000002'''
select t_product(90, :V1, 'KX 9001', 'Pink', 1) is not null, t_product(93, :V1, 'KX 9003', 'Blue', 2) is not null; -- both filed under 'Saree'
select t_is('no category list saved: Ready, as before', (select g.status || '/' || array_to_string(g.missing, ',') from public.pb_products_refresh(array[t_id(90)]) g), 'ready/');
insert into public.pb_settings (key, value) values ('categories', '["Lehenga", " saree "]');
select t_is('on the list (case and spaces aside): Ready', (select g.status from public.pb_products_refresh(array[t_id(90)]) g), 'ready');
update public.pb_settings set value = '["Lehenga"]' where key = 'categories';
select t_is('taken off the list: held, missing its category', (select g.status || '/' || array_to_string(g.missing, ',') from public.pb_products_refresh(array[t_id(90)]) g), 'needs_info/Category');
select t_is('… and the product says so', (select status || '/' || array_to_string(missing_attrs, ',') from pb_products where id = t_id(90)), 'needs_info/Category');
update public.pb_products set category = 'lehenga' where id = t_id(90);
select t_is('a category from the list again: Ready', (select g.status || '/' || array_to_string(g.missing, ',') from public.pb_products_refresh(array[t_id(90)]) g), 'ready/');
update public.pb_settings set value = '[]' where key = 'categories';
select t_is('an empty list holds nothing', (select g.status from public.pb_products_refresh(array[t_id(93)]) g), 'ready');
update public.pb_settings set value = '{"x": 1}' where key = 'categories';
select t_is('a list that is not a list holds nothing', (select g.status from public.pb_products_refresh(array[t_id(93)]) g), 'ready');
insert into public.pb_attributes (id, name, key, multi, position) values (:A_C, 'Colour', 'colour', false, 1), (:A_O, 'Occasion', 'occasion', true, 2);
insert into public.pb_attribute_values (id, attribute_id, name, key, aliases, position) values (:V_PK, :A_C, 'Pink', 'pink', '{}', 1), (:V_PT, :A_O, 'Party', 'party', '{}', 1);
insert into public.pb_product_values (product_id, value_id, source) values (t_id(93), :V_PK, 'rules'), (t_id(93), :V_PT, 'rules');
create or replace function pg_temp.vals(p uuid) returns text language sql as $$
  select coalesce(string_agg(v.name, ',' order by v.name), '') from public.pb_product_values pv join public.pb_attribute_values v on v.id = pv.value_id where pv.product_id = p $$;
select count(*) from public.pb_product_values_bulk(jsonb_build_array(jsonb_build_object('product_id', t_id(93), 'rows', '[]'::jsonb, 'attributes', '[]'::jsonb)));
select t_is('Retag all with no attribute checked replaces nothing', pg_temp.vals(t_id(93)), 'Party,Pink');
select count(*) from public.pb_product_values_bulk(jsonb_build_array(jsonb_build_object('product_id', t_id(93), 'rows', '[]'::jsonb, 'attributes', jsonb_build_array(:A_C))));
select t_is('… it replaces only the attributes it checked (Colour): the Occasion found earlier stays', pg_temp.vals(t_id(93)), 'Party');
select count(*) from public.pb_product_values_bulk(jsonb_build_array(jsonb_build_object('product_id', t_id(93), 'rows', '[]'::jsonb)));
select t_is('… a row without the list replaces every attribute, as before', pg_temp.vals(t_id(93)), '');
rollback;

-- ── 9. the AI's nearest match for suggestions: its answer is kept, its cost counted (20261113190000_pb_tag_nearest.sql) ──
begin;
insert into public.pb_activity (action, details, created_at) values
  ('tags_matched', '{"usd": 0.02, "phrases": 5}', now()), ('tags_filled', '{"usd": 0.01}', now()),
  ('tags_matched', '{"usd": 0.5}', now() - interval '2 days'), ('tags_edited', '{"usd": 9}', now());
select t_is('a nearest-match call counts in the AI cost since a moment (an older one and other actions do not)', (select usd::text from public.pb_ai_cost_since(now() - interval '1 hour')), '0.03');
insert into public.pb_tag_suggestions (phrase, key, nearest) values ('Kora Silk', 'kora silk', '{"value_id": null, "why": "x", "at": "2026-11-13T19:00:00Z"}');
select t_is('a suggestion keeps the AI''s answer', (select nearest ->> 'why' from public.pb_tag_suggestions where key = 'kora silk'), 'x');
insert into public.pb_tag_suggestions (phrase, key) values ('Plus Size', 'plus size');
select t_is('… and a new one starts without one (not asked yet)', (select coalesce(nearest::text, 'null') from public.pb_tag_suggestions where key = 'plus size'), 'null');
rollback;

-- Every check above printed a line: a part that silently printed nothing would be a failure too.
select case when last_value = 157 then 'ok   every check ran (157)' else 'FAIL the number of checks is ' || last_value || ', not 157: a part printed fewer lines than it has, or this number was not updated' end from public.t_checks;
drop function public.t_refused(text, text); drop function public.t_is(text, text, text); drop function public.t_rel(uuid, uuid); drop function public.t_product(int, uuid, text, text, int, numeric, text); drop function public.t_id(int);
drop sequence public.t_checks;
