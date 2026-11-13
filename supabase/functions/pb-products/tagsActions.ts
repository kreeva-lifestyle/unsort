// Staff actions on the tag TAXONOMY (index.ts; structure edits are admin /
// manager): taxonomy_get, attribute_save / _order, value_check (live
// look-alike check while typing), value_save (refused with the look-alikes
// unless force) and category_link_check ("12 products will need a Colour").
// The changes that reach many products at once — categories_save,
// attribute_delete, value_delete, value_merge, category_link_save — are bulk
// changes that can be taken back: tagsBulk.ts. SQL: 20261110090000_pb_tags.sql.
// Suggestions, product values, retag and "Let AI decide": tagsQueue.ts.
import { uuid, type Body } from './actions.ts';
import { SB_URL, enc, insert, logActivity, one, patch, rpc, sel, selAll, svcHeaders } from './db.ts';
import { HttpError } from './http.ts';
import { exactIn, lookAlikes } from './tagLook.ts';
import { displayName, tagKey } from './tagText.ts';
import { ATTR_COLS, type AttrRow, VALUE_COLS, type ValueRow, loadTaxonomy, taxValues } from './taxonomy.ts';
import { refresh } from './tagStore.ts';
import { fillStatus } from './tagsQueue.ts';

export { attributeDelete, categoriesSave, categoryLinkSave, valueDelete, valueMerge } from './tagsBulk.ts';

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

/** Check again the products an attribute's switch reaches: those of the categories that use it and those carrying one
 *  of its values (the tags cache counts only offered values). */
async function regateAttr(attributeId: string) {
  const cats = (await sel<{ category: string }>(`pb_category_attributes?attribute_id=eq.${enc(attributeId)}&select=category`)).map(c => `"${c.category.replace(/"/g, '')}"`);
  const inCats = cats.length ? (await selAll<{ id: string }>(`pb_products?category=in.(${enc(cats.join(','))})&status=neq.archived&select=id&order=id.asc`)).map(p => p.id) : [];
  const carrying = (await selAll<{ product_id: string }>(`pb_product_values?select=product_id,pb_attribute_values!inner(attribute_id)&pb_attribute_values.attribute_id=eq.${enc(attributeId)}&order=product_id.asc,value_id.asc`)).map(r => r.product_id);
  await refresh([...new Set([...inCats, ...carrying])]);
}

/** attribute_save { id?, name, multi?, shopify_prefix?, by_category? } → { ok, attribute }. by_category: "Values depend on
 *  the category" (Product Type, owner 13 Nov 2026). Turned on, each value with no category ticked gets the categories
 *  that use the attribute now, so no product loses a value at that moment; the owner unticks what does not belong. */
export async function attributeSave(b: Body, userId: string | null) {
  const name = displayName(b.name).slice(0, 60);
  const key = tagKey(name);
  if (!key) throw new HttpError(400, 'Give the attribute a name, e.g. Colour.');
  const prefix = String(b.shopify_prefix ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40) || null;
  const id = b.id ? uuid(b.id, 'The attribute') : null;
  const clash = await one<{ id: string; name: string }>(`pb_attributes?key=eq.${enc(key)}&select=id,name`);
  if (clash && clash.id !== id) throw new HttpError(409, `There is already an attribute called “${clash.name}”.`);
  const body: Record<string, unknown> = { name, key, shopify_prefix: prefix, ...(typeof b.multi === 'boolean' ? { multi: b.multi } : {}),
    ...(typeof b.by_category === 'boolean' ? { by_category: b.by_category } : {}) };
  let row: AttrRow;
  if (id) {
    const before = await one<AttrRow>(`pb_attributes?id=eq.${enc(id)}&select=${ATTR_COLS}`);
    if (!before) throw new HttpError(404, 'That attribute no longer exists.');
    const switched = typeof b.by_category === 'boolean' && b.by_category !== before.by_category;
    if (switched && b.by_category) {
      const cats = (await sel<{ category: string }>(`pb_category_attributes?attribute_id=eq.${enc(id)}&select=category&order=position.asc`)).map(c => c.category);
      if (cats.length) await patch('pb_attribute_values', `attribute_id=eq.${enc(id)}&categories=eq.${enc('{}')}`, { categories: cats });
    }
    row = (await patch<AttrRow>('pb_attributes', `id=eq.${enc(id)}`, body, ATTR_COLS))[0];
    // "Missing: Colour" holds the name, and the switch changes which values count: check the products again.
    if (before.name !== name || switched) await regateAttr(id);
  } else {
    const last = await one<{ position: number }>('pb_attributes?select=position&order=position.desc&limit=1');
    row = (await insert<AttrRow>('pb_attributes', [{ ...body, position: (last?.position ?? 0) + 1 }], { select: ATTR_COLS }))[0];
  }
  await logActivity({ action: 'tags_edited', details: { what: 'attribute', name, new: !id }, user_id: userId });
  return { ok: true, attribute: row };
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

/** value_save { attribute_id, id?, name, aliases?, categories?, force? } → { ok, value } or 409 { matches } (look-alikes).
 *  categories: the categories the value is offered for while its attribute's values depend on the category — names on
 *  the owner's list only, spelled and ordered as there; others are dropped. Left out = kept as they are. */
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
  const want = Array.isArray(b.categories) ? new Set(b.categories.map(tagKey)) : null;
  const categories = want ? r.tax.categories.filter(c => want.has(tagKey(c))) : before?.categories ?? [];
  const reticked = !!before && categories.join('|') !== before.categories.join('|');
  const renamed = !before || before.key !== key;
  const matches = r.matches.filter(m => m.reason !== 'same' || m.other_attribute);
  if (renamed && matches.length && b.force !== true) {
    throw new HttpError(409, `“${name}” looks like “${matches[0].value}” (${matches[0].attribute}).`, { matches });
  }
  let row: ValueRow;
  if (id) row = (await patch<ValueRow>('pb_attribute_values', `id=eq.${enc(id)}`, { name, key, aliases, categories }, VALUE_COLS))[0];
  else {
    const last = r.tax.values.filter(v => v.attribute_id === attributeId).reduce((m, v) => Math.max(m, v.position), 0);
    row = (await insert<ValueRow>('pb_attribute_values', [{ attribute_id: attributeId, name, key, aliases, categories, position: last + 1 }], { select: VALUE_COLS }))[0];
  }
  // The products carrying it show the new name, and count it only where it is offered now.
  if (id && before && (before.name !== name || reticked)) await refresh((await selAll<{ product_id: string }>(`pb_product_values?value_id=eq.${enc(id)}&select=product_id&order=product_id.asc`)).map(x => x.product_id));
  await logActivity({ action: 'tags_edited', details: { what: 'value', name, new: !id, forced: b.force === true && matches.length > 0, ...(reticked || (!id && categories.length) ? { categories } : {}) }, user_id: userId });
  return { ok: true, value: row };
}

export async function categoryLinkCheck(b: Body) {
  const category = displayName(b.category);
  if (!category) throw new HttpError(400, 'Pick a category.');
  return { ok: true, lacking: await rpc<number>('pb_category_lacking', { p_category: category, p_attribute: uuid(b.attribute_id, 'The attribute') }) };
}
