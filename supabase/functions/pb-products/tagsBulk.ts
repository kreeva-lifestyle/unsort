// Staff changes to the tag LISTS that reach many products at once (admin /
// manager; index.ts through tagsActions.ts):
//   categories_save    { categories[] } → the reader's category list (pb_settings); a removed category loses its
//                      must-have tags (pb_categories_prune) and its products are checked again
//   attribute_delete   { id } → the attribute goes with its values, its links and the products' values of it
//   value_delete       { id } → the value goes, from every product that has it
//   value_merge        { from, into } → the products move to `into`, which keeps `from`'s name as also known as (and,
//                      for a value that depends on the category, `from`'s ticked categories too: its products stay
//                      counted; a revert brings `from` back but leaves `into` with the added categories)
//   category_link_save { category, attribute_ids[] (in order) } → the category's must-have tags
// Each one is a bulk change (bulkLog.ts): Settings → Bulk changes takes it back for 7 days — the rows it deleted
// come back, the rows it added go, and the products are checked again (pb_bulk_revert_tags). One that reaches
// fewer than two products and takes fewer than two entries out of the lists is an ordinary edit, and is not
// listed. `run_id` in the answer: the change in the log (null when not listed).
// SQL: 20261110090000_pb_tags.sql (the changes), 20261113090000_pb_bulk_log_tags_stock.sql (recording, revert).
import { uuid, type Body } from './actions.ts';
import { asBulk } from './bulkLog.ts';
import { enc, insert, logActivity, one, patch, remove, rpc, sel, selAll, uniqueCi } from './db.ts';
import { HttpError } from './http.ts';
import { displayName, tagKey } from './tagText.ts';

/** "Silk, Chiffon and 3 more". */
const few = (names: string[]) => (names.length > 4 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.join(', '));

async function valueOf(id: string): Promise<{ name: string; attr: string }> {
  const v = await one<{ name: string; pb_attributes: { name: string } | null }>(`pb_attribute_values?id=eq.${enc(id)}&select=name,pb_attributes(name)`);
  if (!v) throw new HttpError(404, 'That value no longer exists.');
  return { name: v.name, attr: v.pb_attributes?.name ?? '' };
}

export async function categoriesSave(b: Body, userId: string | null) {
  if (!Array.isArray(b.categories)) throw new HttpError(400, 'categories must be a list.');
  const cats = uniqueCi(b.categories.map(c => displayName(c).slice(0, 60)).filter(Boolean)).slice(0, 200);
  const was = (await one<{ value: unknown }>('pb_settings?key=eq.categories&select=value'))?.value;
  const before = Array.isArray(was) ? was.map(String) : [];
  const has = (l: string[]) => new Set(l.map(c => c.toLowerCase()));
  const gone = before.filter(c => !has(cats).has(c.toLowerCase())), added = cats.filter(c => !has(before).has(c.toLowerCase()));
  const label = `Category list: ${[gone.length ? `removed ${few(gone)}` : '', added.length ? `added ${few(added)}` : ''].filter(Boolean).join('; ') || 'new order'}`;
  const r = await asBulk('categories', label, userId, async (run) => {
    // pb_settings is keyed by `key` and has no id column: ask for `key` back, or the database refuses the save.
    await insert('pb_settings', [{ key: 'categories', value: cats }], { onConflict: 'key', mode: 'merge', select: 'key', run });
    const linked = has((await sel<{ category: string }>('pb_category_attributes?select=category')).map(l => l.category));
    const pruned = await rpc<number>('pb_categories_prune', { p_keep: cats }, run);
    // The prune checks again only the products of removed categories that had must-have tags. The others off the list
    // are checked here, so the Ready check holds them too ("Missing: Category") — and a revert puts them back.
    const keep = has(cats);
    const off = (await selAll<{ id: string; category: string }>('pb_products?status=in.(ready,needs_info)&category=not.is.null&select=id,category&order=id.asc'))
      .filter(p => p.category.trim() && !keep.has(p.category.toLowerCase()) && !linked.has(p.category.toLowerCase())).map(p => p.id);
    for (let i = 0; i < off.length; i += 500) await rpc('pb_products_refresh', { p_ids: off.slice(i, i + 500) }, run);
    return { regated: pruned + off.length };
  });
  await logActivity({ action: 'settings_edited', details: { key: 'categories', count: cats.length, run_id: r.run_id }, user_id: userId });
  return { ok: true, categories: cats, regated: r.regated, run_id: r.run_id };
}

export async function attributeDelete(b: Body, userId: string | null) {
  const id = uuid(b.id, 'The attribute');
  const a = await one<{ name: string }>(`pb_attributes?id=eq.${enc(id)}&select=name`);
  if (!a) throw new HttpError(404, 'That attribute no longer exists.');
  const r = await asBulk('attribute_delete', `Deleted the attribute ${a.name}`, userId, async (run) => {
    // A suggestion filed under this attribute falls back to "no attribute" when the attribute goes. Where the
    // same word already waits with no attribute that would be a duplicate, and the database then refuses the
    // whole delete: take the attribute's copy out first (the other one stays in the queue).
    const mine = await selAll<{ id: string; key: string }>(`pb_tag_suggestions?attribute_id=eq.${enc(id)}&select=id,key&order=id.asc`);
    if (mine.length) {
      const free = new Set((await selAll<{ key: string }>('pb_tag_suggestions?attribute_id=is.null&select=key&order=id.asc')).map(s => s.key));
      const twins = mine.filter(s => free.has(s.key)).map(s => s.id);
      for (let i = 0; i < twins.length; i += 100) await remove('pb_tag_suggestions', `id=in.(${twins.slice(i, i + 100).map(enc).join(',')})`, run);
    }
    return { regated: await rpc<number>('pb_attribute_delete', { p_id: id }, run) };
  });
  await logActivity({ action: 'tags_edited', details: { what: 'attribute_deleted', id, name: a.name, regated: r.regated, run_id: r.run_id }, user_id: userId });
  return { ok: true, regated: r.regated, run_id: r.run_id };
}

export async function valueDelete(b: Body, userId: string | null) {
  const id = uuid(b.id, 'The value');
  const v = await valueOf(id);
  const r = await asBulk('value_delete', `Deleted the tag value ${v.name}${v.attr ? ` (${v.attr})` : ''}`, userId,
    async (run) => ({ regated: await rpc<number>('pb_value_delete', { p_id: id }, run) }));
  await logActivity({ action: 'tags_edited', details: { what: 'value_deleted', name: v.name, regated: r.regated, run_id: r.run_id }, user_id: userId });
  return { ok: true, regated: r.regated, run_id: r.run_id };
}

export async function valueMerge(b: Body, userId: string | null) {
  const from = uuid(b.from, 'The value to merge'), into = uuid(b.into, 'The value to merge into');
  const [f, i] = await Promise.all([valueOf(from), valueOf(into)]);
  const r = await asBulk('value_merge', `Merged ${f.name} into ${i.name}${i.attr ? ` (${i.attr})` : ''}`, userId, async (run) => {
    const two = await sel<{ id: string; categories: string[] | null }>(`pb_attribute_values?id=in.(${enc(from)},${enc(into)})&select=id,categories`);
    const cf = two.find(x => x.id === from)?.categories ?? [], ci = two.find(x => x.id === into)?.categories ?? [];
    const both = [...ci, ...cf.filter(c => !ci.some(x => tagKey(x) === tagKey(c)))];
    if (both.length > ci.length) await patch('pb_attribute_values', `id=eq.${enc(into)}`, { categories: both }, 'id', run);
    return { moved: await rpc<number>('pb_value_merge', { p_from: from, p_into: into }, run) };
  });
  await logActivity({ action: 'tags_edited', details: { what: 'value_merged', from: f.name, into: i.name, moved: r.moved, run_id: r.run_id }, user_id: userId });
  return { ok: true, moved: r.moved, run_id: r.run_id };
}

/** category_link_save { category, attribute_ids[] (in order) } → { ok, to_needs_info, to_ready, run_id }. */
export async function categoryLinkSave(b: Body, userId: string | null) {
  const category = displayName(b.category);
  if (!category) throw new HttpError(400, 'Pick a category.');
  const ids = [...new Set((Array.isArray(b.attribute_ids) ? b.attribute_ids : []).map(v => uuid(v, 'An attribute')))].slice(0, 30);
  const named = ids.length ? await sel<{ id: string; name: string }>(`pb_attributes?id=in.(${ids.map(enc).join(',')})&select=id,name`) : [];
  const names = ids.map(id => named.find(a => a.id === id)?.name).filter((n): n is string => !!n);
  const r = await asBulk('category_links', `Changed the tags ${category} needs: ${names.length ? few(names) : 'none'}`, userId, async (run) =>
    (await rpc<{ to_needs_info: number; to_ready: number }[]>('pb_category_links_set', { p_category: category, p_attribute_ids: ids }, run))[0] ?? { to_needs_info: 0, to_ready: 0 });
  await logActivity({ action: 'tags_edited', details: { what: 'category_links', category, count: ids.length, to_needs_info: r.to_needs_info, to_ready: r.to_ready, run_id: r.run_id }, user_id: userId });
  return { ok: true, to_needs_info: r.to_needs_info, to_ready: r.to_ready, run_id: r.run_id };
}
