// Staff actions on the tag TAXONOMY (index.ts; structure edits are admin /
// manager): taxonomy_get, categories_save, attribute_save / _delete / _order,
// value_check (live look-alike check while typing), value_save (refused with
// the look-alikes unless force), value_delete, value_merge,
// category_link_check ("12 products will need a Colour") and
// category_link_save. SQL: 20261110090000_pb_tags.sql. Suggestions, product
// values, retag and "Let AI decide": tagsQueue.ts.
import { uuid, type Body } from './actions.ts';
import { SB_URL, enc, insert, logActivity, one, patch, remove, rpc, sel, selAll, svcHeaders, uniqueCi } from './db.ts';
import { HttpError } from './http.ts';
import { exactIn, lookAlikes } from './tagLook.ts';
import { displayName, tagKey } from './tagText.ts';
import { ATTR_COLS, type AttrRow, VALUE_COLS, type ValueRow, loadTaxonomy, taxValues } from './taxonomy.ts';
import { refresh } from './tagStore.ts';
import { fillStatus } from './tagsQueue.ts';

const MAX_ALIASES = 30;

export async function taxonomyGet() {
  const tax = await loadTaxonomy();
  const [stats, counts, pending, fill] = await Promise.all([
    rpc<{ category: string; attribute_id: string; products: number; lacking: number }[]>('pb_tag_link_stats', {}),
    rpc<{ category: string; products: number }[]>('pb_tag_category_counts', {}),
    fetchCount('pb_tag_suggestions?select=id&status=eq.pending'),
    fillStatus(),
  ]);
  const uses = await rpc<{ value_id: string; n: number }[]>('pb_tag_value_uses', {});
  const n = new Map(uses.map(u => [u.value_id, u.n]));
  return {
    ok: true, categories: tax.categories, links: tax.links, stats, category_products: counts, suggestions_pending: pending, fill,
    attributes: tax.attrs.map(a => ({ ...a, values: tax.values.filter(v => v.attribute_id === a.id).map(v => ({ ...v, uses: n.get(v.id) ?? 0 })) })),
  };
}

async function fetchCount(path: string): Promise<number> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method: 'HEAD', headers: { ...svcHeaders, prefer: 'count=exact' } });
  return Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
}

/** categories_save { categories[] } → the reader's list (pb_settings); removed ones lose their links. */
export async function categoriesSave(b: Body, userId: string | null) {
  if (!Array.isArray(b.categories)) throw new HttpError(400, 'categories must be a list.');
  const cats = uniqueCi(b.categories.map(c => displayName(c).slice(0, 60)).filter(Boolean)).slice(0, 200);
  await insert('pb_settings', [{ key: 'categories', value: cats }], { onConflict: 'key', mode: 'merge' });
  const moved = await rpc<number>('pb_categories_prune', { p_keep: cats });
  await logActivity({ action: 'settings_edited', details: { key: 'categories', count: cats.length }, user_id: userId });
  return { ok: true, categories: cats, regated: moved };
}

/** attribute_save { id?, name, multi?, shopify_prefix? } → { ok, attribute }. */
export async function attributeSave(b: Body, userId: string | null) {
  const name = displayName(b.name).slice(0, 60);
  const key = tagKey(name);
  if (!key) throw new HttpError(400, 'Give the attribute a name, e.g. Colour.');
  const prefix = String(b.shopify_prefix ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40) || null;
  const id = b.id ? uuid(b.id, 'The attribute') : null;
  const clash = await one<{ id: string; name: string }>(`pb_attributes?key=eq.${enc(key)}&select=id,name`);
  if (clash && clash.id !== id) throw new HttpError(409, `There is already an attribute called “${clash.name}”.`);
  const body: Record<string, unknown> = { name, key, shopify_prefix: prefix, ...(typeof b.multi === 'boolean' ? { multi: b.multi } : {}) };
  let row: AttrRow;
  if (id) {
    const before = await one<AttrRow>(`pb_attributes?id=eq.${enc(id)}&select=${ATTR_COLS}`);
    if (!before) throw new HttpError(404, 'That attribute no longer exists.');
    row = (await patch<AttrRow>('pb_attributes', `id=eq.${enc(id)}`, body, ATTR_COLS))[0];
    if (before.name !== name) { // "Missing: Colour" holds the name: re-gate the products of its categories
      const cats = (await sel<{ category: string }>(`pb_category_attributes?attribute_id=eq.${enc(id)}&select=category`)).map(c => `"${c.category.replace(/"/g, '')}"`);
      const ids = cats.length ? (await selAll<{ id: string }>(`pb_products?category=in.(${enc(cats.join(','))})&status=neq.archived&select=id&order=id.asc`)).map(p => p.id) : [];
      await refresh(ids);
    }
  } else {
    const last = await one<{ position: number }>('pb_attributes?select=position&order=position.desc&limit=1');
    row = (await insert<AttrRow>('pb_attributes', [{ ...body, position: (last?.position ?? 0) + 1 }], { select: ATTR_COLS }))[0];
  }
  await logActivity({ action: 'tags_edited', details: { what: 'attribute', name, new: !id }, user_id: userId });
  return { ok: true, attribute: row };
}

export async function attributeDelete(b: Body, userId: string | null) {
  const id = uuid(b.id, 'The attribute');
  // A suggestion filed under this attribute falls back to "no attribute" when the attribute goes. Where the
  // same word already waits with no attribute that would be a duplicate, and the database then refuses the
  // whole delete: take the attribute's copy out first (the other one stays in the queue).
  const mine = await selAll<{ id: string; key: string }>(`pb_tag_suggestions?attribute_id=eq.${enc(id)}&select=id,key&order=id.asc`);
  if (mine.length) {
    const free = new Set((await selAll<{ key: string }>('pb_tag_suggestions?attribute_id=is.null&select=key&order=id.asc')).map(s => s.key));
    const twins = mine.filter(s => free.has(s.key)).map(s => s.id);
    for (let i = 0; i < twins.length; i += 100) await remove('pb_tag_suggestions', `id=in.(${twins.slice(i, i + 100).map(enc).join(',')})`);
  }
  const regated = await rpc<number>('pb_attribute_delete', { p_id: id });
  await logActivity({ action: 'tags_edited', details: { what: 'attribute_deleted', id, regated }, user_id: userId });
  return { ok: true, regated };
}

/** attribute_order { ids[] } → positions 1..n in that order. */
export async function attributeOrder(b: Body) {
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(v => uuid(v, 'An attribute')).slice(0, 100);
  for (let i = 0; i < ids.length; i++) await patch('pb_attributes', `id=eq.${enc(ids[i])}`, { position: i + 1 });
  return { ok: true };
}

/** The look-alikes of a name for an attribute, and whether it is already that attribute's value / alias. */
async function check(attributeId: string, name: string, excludeId?: string) {
  const tax = await loadTaxonomy();
  if (!tax.attrs.some(a => a.id === attributeId)) throw new HttpError(404, 'That attribute no longer exists.');
  const values = taxValues(tax);
  const same = exactIn(name, values.filter(v => v.id !== excludeId), attributeId);
  return { tax, same, matches: lookAlikes(name, values, { attributeId, excludeId }) };
}

export async function valueCheck(b: Body) {
  const name = displayName(b.name);
  if (!tagKey(name)) return { ok: true, matches: [] };
  const r = await check(uuid(b.attribute_id, 'The attribute'), name, b.exclude_id ? uuid(b.exclude_id, 'The value') : undefined);
  return { ok: true, matches: r.matches, exists: r.same ? { id: r.same.id, name: r.same.name } : null };
}

/** value_save { attribute_id, id?, name, aliases?, force? } → { ok, value } or 409 { matches } (look-alikes). */
export async function valueSave(b: Body, userId: string | null) {
  const attributeId = uuid(b.attribute_id, 'The attribute');
  const id = b.id ? uuid(b.id, 'The value') : undefined;
  const name = displayName(b.name);
  const key = tagKey(name);
  if (!key) throw new HttpError(400, 'Give the value a name, e.g. Black.');
  const r = await check(attributeId, name, id);
  if (r.same) throw new HttpError(409, `“${r.same.name}” already ${r.same.key === key ? 'exists' : `has “${name}” as also known as`} in this attribute.`);
  const before = id ? r.tax.values.find(v => v.id === id) : undefined;
  if (id && !before) throw new HttpError(404, 'That value no longer exists.');
  const aliases = [...new Set((Array.isArray(b.aliases) ? b.aliases : before?.aliases ?? []).map(tagKey).filter(a => a && a !== key))].slice(0, MAX_ALIASES);
  for (const a of aliases) {
    const used = r.tax.values.find(v => v.attribute_id === attributeId && v.id !== id && (v.key === a || v.aliases.includes(a)));
    if (used) throw new HttpError(409, `“${a}” is already used by “${used.name}” — one word can mean only one value.`);
  }
  const renamed = !before || before.key !== key;
  const matches = r.matches.filter(m => m.reason !== 'same' || m.other_attribute);
  if (renamed && matches.length && b.force !== true) {
    throw new HttpError(409, `“${name}” looks like “${matches[0].value}” (${matches[0].attribute}).`, { matches });
  }
  let row: ValueRow;
  if (id) row = (await patch<ValueRow>('pb_attribute_values', `id=eq.${enc(id)}`, { name, key, aliases }, VALUE_COLS))[0];
  else {
    const last = r.tax.values.filter(v => v.attribute_id === attributeId).reduce((m, v) => Math.max(m, v.position), 0);
    row = (await insert<ValueRow>('pb_attribute_values', [{ attribute_id: attributeId, name, key, aliases, position: last + 1 }], { select: VALUE_COLS }))[0];
  }
  if (id && before && before.name !== name) await refresh((await selAll<{ product_id: string }>(`pb_product_values?value_id=eq.${enc(id)}&select=product_id&order=product_id.asc`)).map(x => x.product_id));
  await logActivity({ action: 'tags_edited', details: { what: 'value', name, new: !id, forced: b.force === true && matches.length > 0 }, user_id: userId });
  return { ok: true, value: row };
}

export async function valueDelete(b: Body, userId: string | null) {
  const regated = await rpc<number>('pb_value_delete', { p_id: uuid(b.id, 'The value') });
  await logActivity({ action: 'tags_edited', details: { what: 'value_deleted', regated }, user_id: userId });
  return { ok: true, regated };
}

export async function valueMerge(b: Body, userId: string | null) {
  const moved = await rpc<number>('pb_value_merge', { p_from: uuid(b.from, 'The value to merge'), p_into: uuid(b.into, 'The value to merge into') });
  await logActivity({ action: 'tags_edited', details: { what: 'value_merged', moved }, user_id: userId });
  return { ok: true, moved };
}

export async function categoryLinkCheck(b: Body) {
  const category = displayName(b.category);
  if (!category) throw new HttpError(400, 'Pick a category.');
  return { ok: true, lacking: await rpc<number>('pb_category_lacking', { p_category: category, p_attribute: uuid(b.attribute_id, 'The attribute') }) };
}

/** category_link_save { category, attribute_ids[] (in order) } → { ok, to_needs_info, to_ready }. */
export async function categoryLinkSave(b: Body, userId: string | null) {
  const category = displayName(b.category);
  if (!category) throw new HttpError(400, 'Pick a category.');
  const ids = [...new Set((Array.isArray(b.attribute_ids) ? b.attribute_ids : []).map(v => uuid(v, 'An attribute')))].slice(0, 30);
  const r = (await rpc<{ to_needs_info: number; to_ready: number }[]>('pb_category_links_set', { p_category: category, p_attribute_ids: ids }))[0] ?? { to_needs_info: 0, to_ready: 0 };
  await logActivity({ action: 'tags_edited', details: { what: 'category_links', category, count: ids.length, ...r }, user_id: userId });
  return { ok: true, ...r };
}
