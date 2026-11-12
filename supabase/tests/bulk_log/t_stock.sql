\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
\set W1 '''e0000000-0000-4000-8000-000000000001'''
\set W2 '''e0000000-0000-4000-8000-000000000002'''
\set P1 '''c0000000-0000-4000-8000-000000000001'''
\set P2 '''c0000000-0000-4000-8000-000000000002'''
\set P3 '''c0000000-0000-4000-8000-000000000003'''
\set P4 '''c0000000-0000-4000-8000-000000000004'''
\set P5 '''c0000000-0000-4000-8000-000000000005'''
\set A1 '''f0000000-0000-4000-8000-000000000001'''
\set A3 '''f0000000-0000-4000-8000-000000000003'''
\set B3 '''f0000000-0000-4000-8000-000000000013'''
\set A4 '''f0000000-0000-4000-8000-000000000004'''
\set R1 '''d0000000-0000-4000-8000-000000000001'''
\set NOTE '''The vendor said permanent stock out (test note).'''
insert into pb_websites (id, name, shop_domain) values (:W1, 'Site 1', 's1.myshopify.com'), (:W2, 'Site 2', 's2.myshopify.com');
insert into pb_products (id, name, sku, category, fabric, color, cost_price, status, ai_read_at) select x, 'P', 'S', 'Saree', 'f', 'c', 100, 'ready', now() from unnest(array[:P1, :P2, :P3, :P4, :P5]::uuid[]) x;
insert into pb_product_images (product_id, path, position) select id, 'x.jpg', 0 from pb_products;
insert into pb_listings (id, product_id, website_id, status, generated_at, shopify_product_id, shopify_status, published_at, title) values
  (:A1, :P1, :W1, 'published', now(), 'gid://1', 'ACTIVE', now(), 't'), (:A3, :P3, :W1, 'published', now(), 'gid://3', 'ACTIVE', now(), 't'), (:A4, :P4, :W1, 'published', now(), 'gid://4', 'ACTIVE', now(), 't');
insert into pb_listings (id, product_id, website_id, status, generated_at, title) values (:B3, :P3, :W2, 'review', now(), 't');
-- ── the notice: p1, p2, p4 out of stock; p3 permanently; p5 temporarily ──
insert into pb_bulk_runs (id, kind, label, status) values (:R1, 'stock_notice', 'Stock notice (permanent): KB 273; 5081', 'running');
select set_config('request.headers', json_build_object('x-pb-bulk', :R1)::text, false);
select 'owed ' || pb_stock_save(:P1, '{"in_stock": false, "temp_out_at": null}') || ',' || pb_stock_save(:P2, '{"in_stock": false, "temp_out_at": null}') || ',' || pb_stock_save(:P4, '{"in_stock": false, "temp_out_at": null}');
select 'owed permanent ' || pb_stock_save(:P3, jsonb_build_object('in_stock', false, 'temp_out_at', null, 'perm_out_at', now()));
update pb_listings set status = 'skipped', error = :NOTE, attempts = 0, claimed_at = null where product_id = :P3 and shopify_product_id is null and status in ('queued', 'review', 'failed');
update pb_products set temp_out_at = now() where id = :P5;
select set_config('request.headers', '{}', false);
update pb_bulk_runs set status = 'done', items = pb_bulk_products(:R1) where id = :R1;
select 'recorded: products ' || pb_bulk_products(:R1) || ' items ' || (select count(*) from pb_bulk_items where run_id = :R1);
-- ── afterwards, by the worker and by staff (not part of the notice) ──
update pb_listings set stock_due = false; -- the stock was sent
update pb_listings set status = 'skipped', shopify_status = 'ARCHIVED', error = :NOTE where id = :A3; -- the stock send archived it on Shopify
update pb_products set status = 'archived' where id = :P3; -- retire
update pb_products set in_stock = true where id = :P4; -- staff switched it back on
select 'preview ' || ((pb_bulk_revert(:R1, false, null, :NOTE) - 'label')::text);
select 'p1 still out after preview: ' || (select (not in_stock)::text from pb_products where id = :P1);
select 'applied ' || ((pb_bulk_revert(:R1, true, null, :NOTE) - 'label')::text);
select 'products ' || string_agg(format('%s:%s/%s/%s/%s', right(id::text, 1), in_stock, temp_out_at is not null, perm_out_at is not null, status), ' ' order by id) from pb_products;
select 'listings ' || string_agg(format('%s:%s due=%s put_back=%s err=%s', right(id::text, 2), status, stock_due, put_back, error is not null), ' | ' order by id) from pb_listings;
select 'run ' || (select row(status, revert_result)::text from pb_bulk_runs where id = :R1);
rollback;
