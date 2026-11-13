-- Playbook: remove a product photo, or choose which photo comes first.
--
-- WHY (pre-launch check, D10; owner's rule: edits are made in Playbook, never
-- in Shopify): photos could be added but not removed or reordered. The first
-- photo is the main image on every store, in whatever order the source had,
-- and a photo the AI cannot open blocked the product with no way to take it
-- out.
--
-- pb_photos_set(product, order): `order` = the product's photos (kind
-- 'image') that stay, in their new order. In one transaction:
--   * every listing's photo descriptions (image_alts, one per photo by
--     position) are moved with their photos, and the ones of removed photos
--     are dropped — or the store would describe photo 1 with photo 3's words;
--   * the kept photos get the places 0…n-1; the ones left out are moved
--     behind them and RETURNED: the server then removes those rows and their
--     files (the same order as deleting a product: rows first, files second),
--     so a failed file removal never leaves a photo that points at nothing.
-- It refuses a list that is not exactly made of this product's photos (the
-- photos changed on another screen meanwhile). Sending the new gallery to the
-- stores is routing's job (pb-products route.ts: a published listing whose
-- photos are not the ones last sent is sent again).
-- Additive: one function. SECURITY INVOKER (the server calls it with the
-- service role; a member of staff is held by their own row policies).
create or replace function public.pb_photos_set(p_product uuid, p_order uuid[])
returns table (id uuid, path text)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare old_ids uuid[]; keep uuid[] := coalesce(p_order, '{}'); n int;
begin
  perform 1 from pb_products p where p.id = p_product for update; -- one photo edit at a time per product
  if not found then raise exception 'That product no longer exists.'; end if;
  n := cardinality(keep);
  select coalesce(array_agg(i.id order by i.position, i.created_at, i.id), '{}') into old_ids
  from pb_product_images i where i.product_id = p_product and i.kind = 'image';
  if exists (select 1 from unnest(keep) x where not (x = any(old_ids))) or n <> (select count(distinct x) from unnest(keep) x) then
    raise exception 'The photos changed meanwhile. Open the product again.';
  end if;
  update pb_listings l set image_alts = array(
      select coalesce(l.image_alts[array_position(old_ids, o.x)], '') from unnest(keep) with ordinality o(x, ord) order by o.ord)
  where l.product_id = p_product and cardinality(l.image_alts) > 0;
  update pb_product_images i
  set position = case when i.id = any(keep) then array_position(keep, i.id) - 1 else 100000 + array_position(old_ids, i.id) end
  where i.product_id = p_product and i.kind = 'image';
  return query select i.id, i.path from pb_product_images i where i.product_id = p_product and i.kind = 'image' and not (i.id = any(keep));
end $$;
comment on function public.pb_photos_set(uuid, uuid[]) is 'Keep these photos of a product in this order: listings'' photo descriptions follow; returns the photos left out, for the server to remove (pb-products photosEdit.ts).';
