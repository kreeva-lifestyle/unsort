-- pb_photos_set: make a photo the main one and remove another; listings' photo descriptions follow.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
begin;
insert into pb_websites (id, name, shop_domain) values ('e0000000-0000-4000-8000-000000000001', 'S', 's.myshopify.com');
insert into pb_products (id, name, status) values ('c0000000-0000-4000-8000-000000000001', 'P', 'ready');
insert into pb_product_images (id, product_id, path, position, kind) values
  ('10000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-000000000001', 'p/a.jpg', 0, 'image'), ('10000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-000000000001', 'p/b.jpg', 1, 'image'),
  ('10000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000001', 'p/c.jpg', 2, 'image'), ('10000000-0000-4000-8000-00000000000d', 'c0000000-0000-4000-8000-000000000001', 'p/d.jpg', 3, 'image'),
  ('10000000-0000-4000-8000-0000000000ff', 'c0000000-0000-4000-8000-000000000001', 'p/v.mp4', 4, 'video');
insert into pb_listings (product_id, website_id, status, image_alts) values ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'published', array['alt A', 'alt B', 'alt C']);
-- refused: the same photo twice, a video, a product that does not exist (nothing changes)
savepoint s; select pb_photos_set('c0000000-0000-4000-8000-000000000001', array['10000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-00000000000c']::uuid[]); rollback to s;
savepoint s; select pb_photos_set('c0000000-0000-4000-8000-000000000001', array['10000000-0000-4000-8000-0000000000ff']::uuid[]); rollback to s;
savepoint s; select pb_photos_set(gen_random_uuid(), '{}'::uuid[]); rollback to s;
-- make C the main photo and remove B
select 'left out: ' || string_agg(path, ',') from pb_photos_set('c0000000-0000-4000-8000-000000000001', array['10000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000d']::uuid[]);
select 'order: ' || string_agg(path || '@' || position, ' ' order by position) from pb_product_images where kind = 'image';
select 'video untouched: ' || position from pb_product_images where kind = 'video';
select 'alts: ' || image_alts::text from pb_listings;
-- the server then removes the row it was given; removing every photo is allowed too
delete from pb_product_images where path = 'p/b.jpg';
select 'remove all, left out: ' || count(*) from pb_photos_set('c0000000-0000-4000-8000-000000000001', '{}'::uuid[]);
select 'alts after all are gone: ' || image_alts::text from pb_listings;
rollback;
