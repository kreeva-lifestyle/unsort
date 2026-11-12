\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
-- fixed ids
\set A_COL '''a0000000-0000-4000-8000-000000000001'''
\set A_FAB '''a0000000-0000-4000-8000-000000000002'''
\set V_BLACK '''b0000000-0000-4000-8000-000000000001'''
\set V_PINK '''b0000000-0000-4000-8000-000000000002'''
\set V_RANI '''b0000000-0000-4000-8000-000000000003'''
\set V_SILK '''b0000000-0000-4000-8000-000000000004'''
\set V_CHIF '''b0000000-0000-4000-8000-000000000005'''
\set P1 '''c0000000-0000-4000-8000-000000000001'''
\set P2 '''c0000000-0000-4000-8000-000000000002'''
\set P3 '''c0000000-0000-4000-8000-000000000003'''
\set P4 '''c0000000-0000-4000-8000-000000000004'''
\set P5 '''c0000000-0000-4000-8000-000000000005'''
\set R1 '''d0000000-0000-4000-8000-000000000001'''
\set R2 '''d0000000-0000-4000-8000-000000000002'''
\set R3 '''d0000000-0000-4000-8000-000000000003'''
\set R4 '''d0000000-0000-4000-8000-000000000004'''
\set R5 '''d0000000-0000-4000-8000-000000000005'''
insert into pb_attributes (id, name, key, multi, position) values (:A_COL, 'Colour', 'colour', true, 1), (:A_FAB, 'Fabric', 'fabric', false, 2);
insert into pb_attribute_values (id, attribute_id, name, key, aliases, position) values
  (:V_BLACK, :A_COL, 'Black', 'black', '{kala}', 1), (:V_PINK, :A_COL, 'Pink', 'pink', '{}', 2), (:V_RANI, :A_COL, 'Rani Pink', 'rani pink', '{rani}', 3),
  (:V_SILK, :A_FAB, 'Silk', 'silk', '{reshmi}', 1), (:V_CHIF, :A_FAB, 'Chiffon', 'chiffon', '{}', 2);
insert into pb_category_attributes (category, attribute_id, position) values ('Lehenga', :A_COL, 1), ('Lehenga', :A_FAB, 2);
insert into pb_settings (key, value) values ('categories', '["Lehenga", "Saree"]');
insert into pb_products (id, name, sku, category, fabric, color, cost_price, status, ai_read_at) select x, 'P', 'S', 'Lehenga', 'f', 'c', 100, 'ready', now() from unnest(array[:P1, :P2, :P3, :P4, :P5]::uuid[]) x;
insert into pb_product_images (product_id, path, position) select id, 'x.jpg', 0 from pb_products;
insert into pb_product_values (product_id, value_id, source) values
  (:P1, :V_BLACK, 'rules'), (:P1, :V_SILK, 'rules'), (:P2, :V_PINK, 'manual'), (:P2, :V_SILK, 'ai'), (:P3, :V_RANI, 'rules'), (:P3, :V_CHIF, 'rules'),
  (:P4, :V_PINK, 'rules'), (:P4, :V_RANI, 'rules'), (:P4, :V_SILK, 'rules');
insert into pb_tag_suggestions (phrase, key, attribute_id, status, uses, source) values ('Georgette', 'georgette', :A_FAB, 'pending', 3, 'store'), ('Wine', 'wine', :A_COL, 'pending', 2, 'ai');
select 'gate ' || string_agg(status, ',' order by id) from (select id, (pb_products_refresh(array[id])).status from pb_products) s;
-- a snapshot of everything a tag change can touch
create or replace function pg_temp.snap() returns text language sql as $$
  select md5(coalesce((select string_agg(a::text, '|' order by id) from (select id, name, key, multi, position from pb_attributes) a), '') || '#' ||
    coalesce((select string_agg(v::text, '|' order by id) from (select id, attribute_id, name, key, aliases, position from pb_attribute_values) v), '') || '#' ||
    coalesce((select string_agg(c::text, '|' order by category, attribute_id) from (select category, attribute_id, position from pb_category_attributes) c), '') || '#' ||
    coalesce((select string_agg(pv::text, '|' order by product_id, value_id) from (select product_id, value_id, source from pb_product_values) pv), '') || '#' ||
    coalesce((select string_agg(s::text, '|' order by key) from (select key, attribute_id, status, uses, resolved_value_id from pb_tag_suggestions) s), '') || '#' ||
    coalesce((select string_agg(p::text, '|' order by id) from (select id, status, missing_attrs from pb_products) p), '') || '#' || (select value::text from pb_settings where key = 'categories'));
$$;
select 'S0 ' || pg_temp.snap() as snap \gset s0_
\echo :s0_snap

-- ── T1: delete the value Silk (3 products) ──
insert into pb_bulk_runs (id, kind, label, status) values (:R1, 'value_delete', 'Deleted the tag value Silk', 'running');
select set_config('request.headers', json_build_object('x-pb-bulk', :R1)::text, false);
select 'T1 deleted, regated ' || pb_value_delete(:V_SILK);
select set_config('request.headers', '{}', false);
update pb_bulk_runs set status = 'done', items = pb_bulk_products(:R1) where id = :R1;
select 'T1 products touched ' || pb_bulk_products(:R1) || ' items ' || (select count(*) from pb_bulk_items where run_id = :R1) || ' status ' || (select string_agg(status, ',' order by id) from pb_products);
select pg_temp.snap() as snap \gset t1_
select 'T1 preview ' || ((pb_bulk_revert(:R1, false) - 'label')::text);
select 'T1 preview changed nothing: ' || (pg_temp.snap() = :'t1_snap')::text;
select 'T1 applied ' || ((pb_bulk_revert(:R1, true) - 'label')::text);
select 'T1 back to S0: ' || (('S0 ' || pg_temp.snap()) = :'s0_snap')::text;

-- ── T1b: the same, but one product gets a fabric by hand before the revert ──
insert into pb_bulk_runs (id, kind, label, status) values (:R2, 'value_delete', 'Deleted the tag value Silk (again)', 'running');
select set_config('request.headers', json_build_object('x-pb-bulk', :R2)::text, false);
select 'T1b ' || pb_value_delete(:V_SILK);
select set_config('request.headers', '{}', false);
update pb_bulk_runs set status = 'done', created_at = now() - interval '1 minute' where id = :R2;
insert into pb_product_values (product_id, value_id, source) values (:P2, :V_CHIF, 'manual');
insert into pb_activity (product_id, action, details) values (:P2, 'edited', '{"fields": ["tags"]}');
select 'T1b applied ' || ((pb_bulk_revert(:R2, true) - 'label')::text);
select 'T1b p1 ' || (select string_agg(v.name || ':' || pv.source, ',' order by v.name) from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id where pv.product_id = :P1)
  || ' | p2 ' || (select string_agg(v.name || ':' || pv.source, ',' order by v.name) from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id where pv.product_id = :P2)
  || ' | p4 ' || (select string_agg(v.name || ':' || pv.source, ',' order by v.name) from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id where pv.product_id = :P4);
-- put p2 back as it was for the next tests
delete from pb_product_values where product_id = :P2 and value_id = :V_CHIF; insert into pb_product_values (product_id, value_id, source) values (:P2, :V_SILK, 'ai'); delete from pb_activity;
select 'reset to S0: ' || (('S0 ' || pg_temp.snap()) = :'s0_snap')::text;

-- ── T2: merge Rani Pink into Pink ──
insert into pb_bulk_runs (id, kind, label, status) values (:R3, 'value_merge', 'Merged Rani Pink into Pink', 'running');
select set_config('request.headers', json_build_object('x-pb-bulk', :R3)::text, false);
select 'T2 moved ' || pb_value_merge(:V_RANI, :V_PINK);
select set_config('request.headers', '{}', false);
update pb_bulk_runs set status = 'done' where id = :R3;
select 'T2 after merge: pink aliases ' || (select aliases::text from pb_attribute_values where id = :V_PINK) || ' rani exists ' || exists(select 1 from pb_attribute_values where id = :V_RANI)::text
  || ' p3 ' || (select string_agg(v.name, ',' order by v.name) from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id where pv.product_id = :P3);
select 'T2 applied ' || ((pb_bulk_revert(:R3, true) - 'label')::text);
select 'T2 back to S0: ' || (('S0 ' || pg_temp.snap()) = :'s0_snap')::text;

-- ── T3: delete the attribute Fabric (values, links, products' values, suggestions) ──
insert into pb_bulk_runs (id, kind, label, status) values (:R4, 'attribute_delete', 'Deleted the attribute Fabric', 'running');
select set_config('request.headers', json_build_object('x-pb-bulk', :R4)::text, false);
select 'T3 regated ' || pb_attribute_delete(:A_FAB);
select set_config('request.headers', '{}', false);
update pb_bulk_runs set status = 'done' where id = :R4;
select 'T3 after: attrs ' || (select count(*) from pb_attributes) || ' values ' || (select count(*) from pb_attribute_values) || ' links ' || (select count(*) from pb_category_attributes) || ' pvs ' || (select count(*) from pb_product_values)
  || ' sug attr null ' || (select count(*) from pb_tag_suggestions where attribute_id is null) || ' items ' || (select count(*) from pb_bulk_items where run_id = :R4);
select 'T3 preview ' || ((pb_bulk_revert(:R4, false) - 'label')::text);
select 'T3 applied ' || ((pb_bulk_revert(:R4, true) - 'label')::text);
select 'T3 back to S0: ' || (('S0 ' || pg_temp.snap()) = :'s0_snap')::text;

-- ── T4: a category's must-have tags changed (Fabric no longer needed, Colour moved) + category list + retag + a suggestion made a value ──
insert into pb_bulk_runs (id, kind, label, status) values (:R5, 'category_links', 'Changed the tags Lehenga needs', 'running');
select set_config('request.headers', json_build_object('x-pb-bulk', :R5)::text, false);
select 'T4 links ' || (select row(to_needs_info, to_ready)::text from pb_category_links_set('Lehenga', array[:A_COL]::uuid[]));
update pb_settings set value = '["Lehenga"]' where key = 'categories';
select 'T4 retag p5 ' || (select status from pb_product_values_set(:P5, jsonb_build_array(jsonb_build_object('value_id', :V_BLACK, 'source', 'rules')), 'auto', null));
select 'T4 retag p1 ' || (select status from pb_product_values_set(:P1, jsonb_build_array(jsonb_build_object('value_id', :V_PINK, 'source', 'rules'), jsonb_build_object('value_id', :V_SILK, 'source', 'rules')), 'auto', null));
insert into pb_attribute_values (id, attribute_id, name, key, aliases, position) values ('b0000000-0000-4000-8000-000000000009', :A_COL, 'Wine', 'wine', '{}', 9);
update pb_tag_suggestions set status = 'added', resolved_value_id = 'b0000000-0000-4000-8000-000000000009' where key = 'wine';
insert into pb_product_values (product_id, value_id, source) values (:P5, 'b0000000-0000-4000-8000-000000000009', 'rules');
update pb_tag_suggestions set status = 'ignored' where key = 'georgette';
select set_config('request.headers', '{}', false);
update pb_bulk_runs set status = 'done' where id = :R5;
select 'T4 after: links ' || (select string_agg(attribute_id::text || '@' || position, ',') from pb_category_attributes) || ' p1 ' || (select string_agg(v.name, ',' order by v.name) from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id where pv.product_id = :P1)
  || ' p5 ' || (select string_agg(v.name, ',' order by v.name) from pb_product_values pv join pb_attribute_values v on v.id = pv.value_id where pv.product_id = :P5);
select 'T4 applied ' || ((pb_bulk_revert(:R5, true) - 'label')::text);
select 'T4 back to S0: ' || (('S0 ' || pg_temp.snap()) = :'s0_snap')::text;
\set ON_ERROR_STOP 0
select 'T4 again: ' || (pb_bulk_revert(:R5, true))::text;
rollback;
