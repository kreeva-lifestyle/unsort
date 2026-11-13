// Staff actions on products' values (index.ts):
//   product_values_set { product_id, value_ids[], attribute_id? } → staff's choice ('manual'), for one
//                      attribute or all; 'tags' gets locked; a product that becomes Ready is routed now
//   retag              { dry_run (default true) } → the rules again for every unlocked product (AI
//                      choices kept where the rules find nothing; 'manual' never touched), with the
//                      projected gate moves; apply writes in batches of 100 (pb_product_values_bulk)
// retagProducts(ids): the same rules for a few products (after a suggestion became a value).
import { uuid, type Body } from './actions.ts';
import { asBulk } from './bulkLog.ts';
import { enc, logActivity, one, patch, rpc, sel, selAll } from './db.ts';
import { HttpError } from './http.ts';
import { routeProduct } from './route.ts';
import { autoValues, type ValueSet } from './tagAuto.ts';
import { categoryGone, gateMoves, gateStatus, missingAttrs } from './tagGate.ts';
import { type Refreshed, writeValues } from './tagStore.ts';
import { type Taxonomy, attrsFor, loadTaxonomy, matchAttrs, shadesOf } from './taxonomy.ts';
import { PRODUCT_COLS, type ProductRow } from './types.ts';

const PAGE = 200;
const COLS = 'id,name,sku,category,raw_text,fabric,color,attributes,locked,status,cost_price,sell_price,ai_read_at,ai_error';
type P = Pick<ProductRow, 'id' | 'name' | 'sku' | 'category' | 'raw_text' | 'fabric' | 'color' | 'attributes' | 'locked' | 'status' | 'cost_price' | 'sell_price' | 'ai_read_at' | 'ai_error'>
  & { pb_product_images?: { id: string }[] }; // one photo at most: the gate only asks whether there is one
interface Pv { product_id: string; value_id: string; source: string; pb_attribute_values: { attribute_id: string } | null }

export async function productValuesSet(b: Body, userId: string | null) {
  const id = uuid(b.product_id, 'product_id');
  if (!Array.isArray(b.value_ids)) throw new HttpError(400, 'value_ids must be a list.');
  const want = [...new Set(b.value_ids.map(v => uuid(v, 'A value')))].slice(0, 100);
  const attributeId = b.attribute_id ? uuid(b.attribute_id, 'The attribute') : null;
  const p = await one<ProductRow>(`pb_products?id=eq.${enc(id)}&select=${PRODUCT_COLS}`);
  if (!p) throw new HttpError(404, 'That product no longer exists.');
  if (p.status === 'reading') throw new HttpError(409, 'This product is being read right now — try again in a minute.');
  const tax = await loadTaxonomy();
  const attrs = attrsFor(tax, p.category).filter(a => !attributeId || a.id === attributeId);
  if (attributeId && !attrs.length) throw new HttpError(400, 'That attribute is not used by this product\'s category.');
  for (const v of want) if (!attrs.some(a => a.values.some(x => x.id === v))) throw new HttpError(400, 'One of those values is not allowed for this product\'s category — reload and choose again.');
  for (const a of attrs) if (!a.multi && want.filter(v => a.values.some(x => x.id === v)).length > 1) throw new HttpError(400, `${a.name} takes one value only.`);
  const fin = await writeValues(id, want.map(value_id => ({ value_id, source: 'manual' })), 'manual', attributeId ? [attributeId] : undefined);
  const locked = [...new Set([...(p.locked || []), 'tags'])];
  await patch('pb_products', `id=eq.${enc(id)}`, { locked });
  let routed = 0;
  if (fin?.was === 'needs_info' && fin.status === 'ready') {
    const now = await one<ProductRow>(`pb_products?id=eq.${enc(id)}&select=${PRODUCT_COLS}`);
    const r = now ? await routeProduct(now, userId) : null;
    routed = r?.routed ?? 0;
    if (!r?.busy) await patch('pb_products', `id=eq.${enc(id)}`, { route_due: false }); // a busy listing keeps the flag: the worker checks again
  }
  await logActivity({ product_id: id, action: 'edited', details: { fields: ['tags'], count: want.length, status: fin?.status }, user_id: userId });
  return { ok: true, status: fin?.status ?? p.status, missing: fin?.missing ?? p.missing_attrs, locked, routed };
}

/** The rules' rows for one product (+ its AI rows the rules do not replace); `rows` empty when unchanged. Only the
 *  attributes of its category are checked again, and only they are replaced (`attributes`): a value found for another
 *  attribute — at import, before the category was known — stays (owner, 13 Nov 2026: with nothing linked, a retag
 *  used to delete every value a person had not chosen). */
function next(p: P, have: Pv[], tax: Taxonomy): { rows: ValueSet[]; missing: string[]; before: Set<string>; attributes: string[] } {
  const attrs = attrsFor(tax, p.category);
  const attrOf = (pv: Pv) => pv.pb_attribute_values?.attribute_id ?? '';
  const manual = new Set(have.filter(v => v.source === 'manual').map(attrOf));
  const r = autoValues(p, matchAttrs(attrs), { manualAttrIds: manual, categories: tax.categories, shades: shadesOf(tax) });
  const inScope = new Set(attrs.map(a => a.id));
  const keepAi = have.filter(v => v.source === 'ai' && inScope.has(attrOf(v)) && !manual.has(attrOf(v)) && !r.filled.has(attrOf(v)));
  const rows: ValueSet[] = [...r.rows, ...keepAi.map(v => ({ value_id: v.value_id, source: 'ai' as const }))];
  const before = new Set(have.filter(v => v.source !== 'manual' && inScope.has(attrOf(v))).map(v => `${v.value_id}:${v.source}`));
  const after = new Set(rows.map(v => `${v.value_id}:${v.source}`));
  const filledAttrs = new Set([...manual, ...r.filled, ...keepAi.map(attrOf)]);
  const missing = [...(categoryGone(p.category, tax.categories) ? ['Category'] : []), ...missingAttrs(attrs, filledAttrs)];
  const attributes = [...inScope];
  if (before.size === after.size && [...before].every(x => after.has(x))) return { rows: [], missing, before: new Set(), attributes };
  return { rows, missing, before, attributes };
}

// Only products the reader has finished (Ready / Needs info): a new or reading one gets its values from the
// reader, and rows worked out from a snapshot taken before it finished would overwrite what the reader chose.
// The value rows are read in full (selAll): cut at 1000, a product whose rows fell off the end would look
// untagged, and the 'auto' write would then delete its AI-chosen values.
async function pageOf(offset: number, ids?: string[]): Promise<{ ps: P[]; pvs: Pv[] }> {
  const ps = await sel<P>(`pb_products?select=${COLS},pb_product_images(id)&pb_product_images.kind=eq.image&pb_product_images.limit=1&status=in.(ready,needs_info)${ids ? `&id=in.(${ids.map(enc).join(',')})` : ''}&order=id.asc&limit=${PAGE}&offset=${offset}`);
  const pvs = ps.length ? await selAll<Pv>(`pb_product_values?product_id=in.(${ps.map(p => enc(p.id)).join(',')})&select=product_id,value_id,source,pb_attribute_values(attribute_id)&order=product_id.asc,value_id.asc`) : [];
  return { ps, pvs };
}

export async function retag(b: Body, userId: string | null) {
  const dry = b.dry_run !== false;
  const tax = await loadTaxonomy();
  const name = new Map(tax.values.map(v => [v.id, v.name]));
  let products = 0, locked = 0;
  const changes: { product_id: string; rows: ValueSet[]; attributes: string[]; name: string; added: string[]; removed: string[] }[] = [];
  const moves: { before: string; after: string }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { ps, pvs } = await pageOf(offset);
    for (const p of ps) {
      products++;
      if ((p.locked || []).includes('tags')) { locked++; continue; }
      const have = pvs.filter(v => v.product_id === p.id);
      const n = next(p, have, tax);
      moves.push({ before: p.status, after: gateStatus({ ...p, has_photo: !!p.pb_product_images?.length }, n.missing) });
      if (!n.rows.length && !n.before.size) continue;
      const was = new Set([...n.before].map(x => x.split(':')[0])), now = new Set(n.rows.map(r => r.value_id));
      changes.push({ product_id: p.id, rows: n.rows, attributes: n.attributes, name: p.name || p.sku || 'Untitled',
        added: [...now].filter(v => !was.has(v)).map(v => name.get(v) ?? ''), removed: [...was].filter(v => !now.has(v)).map(v => name.get(v) ?? '') });
    }
    if (ps.length < PAGE) break;
  }
  const sample = changes.filter(c => c.added.length || c.removed.length).slice(0, 10).map(({ name: n, added, removed }) => ({ name: n, added, removed }));
  if (dry) return { ok: true, dry_run: true, products, locked, changed: changes.length, ...gateMoves(moves), sample };
  // A bulk change (Settings → Bulk changes takes it back for 7 days): every batch carries the run.
  const out = await asBulk('retag', 'Retagged every product by the rules', userId, async (run) => {
    const done: Refreshed[] = [];
    for (let i = 0; i < changes.length; i += 100) {
      done.push(...await rpc<Refreshed[]>('pb_product_values_bulk', { p_rows: changes.slice(i, i + 100).map(c => ({ product_id: c.product_id, rows: c.rows, attributes: c.attributes })) }, run));
    }
    return gateMoves(done.map(r => ({ before: r.was, after: r.status })));
  }, (r) => ({ changed: changes.length, ...r }));
  const { run_id, ...real } = out;
  await logActivity({ action: 'tags_retagged', details: { products, changed: changes.length, locked, ...real, run_id }, user_id: userId });
  return { ok: true, dry_run: false, products, locked, changed: changes.length, ...real, sample, run_id };
}

/** The rules again for a few products (unlocked ones); returns how many changed. `run`: the bulk change this is part of. */
export async function retagProducts(ids: string[], run?: string | null): Promise<number> {
  if (!ids.length) return 0;
  const tax = await loadTaxonomy();
  const { ps, pvs } = await pageOf(0, ids.slice(0, PAGE));
  let n = 0;
  for (const p of ps) {
    if ((p.locked || []).includes('tags')) continue;
    const r = next(p, pvs.filter(v => v.product_id === p.id), tax);
    if (!r.rows.length && !r.before.size) continue;
    await writeValues(p.id, r.rows, 'auto', r.attributes, run); n++;
  }
  return n;
}
