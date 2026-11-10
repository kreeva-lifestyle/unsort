// Step 1 — Read: Claude reads a product's post text + up to 2 photos and
// fills the facts (name, sku, category, fabric, color, sizes, cost_price,
// attributes). Only fields that are empty AND not locked are filled (a manual
// "Read again" refreshes every field that is not locked). Then: cost or
// category missing → needs_info; else ready → route (step 2) — unless the tag
// gate (below) finds a required attribute empty. A product with
// sell_price (import from website: the other store's price is our selling
// price) needs no cost: the AI's cost_price is ignored for it, because the
// only price in its text is that selling price, not a cost.
// Tags (tagRead.ts): the same call chooses the attribute values from the
// owner's taxonomy; after the facts are saved, the rules + those choices are
// written (unless staff locked 'tags') and the gate runs: a category
// attribute with no value → needs_info ("Missing: Colour").
// Imported attributes (IMPORT_ATTRS: brand, store_tags, seo_title…) are the
// store's own facts: an imported product keeps them as they are — the AI's
// attributes are added beside them, never in their place, even on "Read again".
// AI error: back to 'new' with ai_error, claimed_at kept so it retries after
// 5 min; the third error in a row → needs_info, or ready (and routed) when
// cost and category are already filled. The count rides in ai_error
// ("… (attempt 2 of 3)"), written in the same update as the status, so it
// never depends on a best-effort activity row.
// Routing runs after the read is saved and has its own error handling: a
// routing failure is not a read failure (see routeAfterRead), but it counts
// towards the same 3 tries.
import { askClaude } from './ai.ts';
import { ago, enc, getSettings, logActivity, nowIso, one, patch, sel } from './db.ts';
import { HttpError, plain } from './http.ts';
import { aiPhotos } from './photos.ts';
import { readerPrompt, readerSchema, type ReadOut } from './readerPrompt.ts';
import { routeProduct } from './route.ts';
import { stripLess } from '../pb-telegram/group.ts';
import { mergeReadAttrs } from './import/meta.ts';
import { tagAfterRead } from './tagRead.ts';
import { refresh } from './tagStore.ts';
import { loadTaxonomy, readerSpec } from './taxonomy.ts';
import { MAX_ATTEMPTS, PRODUCT_COLS, STALE_MS, hasPrice, type Budget, type ProductRow } from './types.ts';

/** Products the worker may read: new (not in a retry wait) or a stuck 'reading'. */
const due = () => {
  const t = ago(STALE_MS);
  return `or=(and(status.eq.new,or(claimed_at.is.null,claimed_at.lt.${t})),and(status.eq.reading,claimed_at.lt.${t}))`;
};

export const readCandidates = (limit: number) =>
  sel<{ id: string }>(`pb_products?${due()}&select=id&order=created_at.asc&limit=${limit}`);

/** Atomic-ish claim: only one caller gets the row back. A manual read waits for a
 *  product being read, and for a 'new' one that ingest still holds (photos arriving:
 *  claimed, no ai_error); a 'new' one waiting to retry after an AI error may be read. */
export async function claimRead(id: string, manual: boolean): Promise<ProductRow | null> {
  const filter = manual
    ? `status=neq.archived&or=(status.not.in.(reading,new),claimed_at.is.null,claimed_at.lt.${ago(STALE_MS)},and(status.eq.new,ai_error.not.is.null))`
    : due();
  const rows = await patch<ProductRow>('pb_products', `id=eq.${enc(id)}&${filter}`, { status: 'reading', claimed_at: nowIso() }, PRODUCT_COLS);
  return rows[0] ?? null;
}

const empty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

function merge(p: ProductRow, out: ReadOut, categories: string[], manual: boolean): Record<string, unknown> {
  const locked = new Set(p.locked || []);
  const can = (f: keyof ProductRow) => !locked.has(f) && (manual || empty(p[f]));
  const set: Record<string, unknown> = {};
  const str = (f: 'name' | 'sku' | 'fabric' | 'color', v: unknown, max: number) => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    if (s && can(f)) set[f] = s;
  };
  str('name', out.name, 200); str('sku', out.sku, 80); str('fabric', out.fabric, 80); str('color', out.color, 80);
  const cat = categories.find(c => c.toLowerCase() === String(out.category || '').trim().toLowerCase());
  if (cat && can('category')) set.category = cat;
  const sizes = [...new Set((Array.isArray(out.sizes) ? out.sizes : []).map(s => String(s ?? '').trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
  if (sizes.length && can('sizes')) set.sizes = sizes;
  // A Telegram "Less" comes off the RATE the AI read — in code, never by the AI: cost = rate − less.
  // Less >= rate leaves the cost empty (needs_info) instead of ₹0.
  const cost = Number(out.cost_price) - (Number(p.less_amount) > 0 ? Number(p.less_amount) : 0);
  const sells = p.sell_price !== null && p.sell_price !== undefined; // imported: the price in the text is the SELLING price
  if (!sells && out.cost_price !== null && Number.isFinite(cost) && cost > 0 && cost < 10_000_000 && can('cost_price')) set.cost_price = Math.round(cost * 100) / 100;
  if (!locked.has('attributes')) set.attributes = mergeReadAttrs(p.attributes, out.attributes, { manual, imported: p.source === 'import' });
  return set;
}

const TRY_RE = / \(attempt (\d+) of \d+\)$/;

/** Read one CLAIMED product. Returns the saved product, how many listings routing queued,
 *  and a warning when the read worked but routing did not. */
export async function readOne(p: ProductRow, o: { manual: boolean; prevStatus?: string; userId: string | null; budget: Budget }): Promise<{ product: ProductRow; routed: number; warning?: string }> {
  let product: ProductRow;
  try {
    const s = await getSettings();
    const tax = await loadTaxonomy(s.categories);
    const spec = readerSpec(tax);
    const [vendor, imgs] = await Promise.all([
      p.vendor_id ? one<{ name: string }>(`pb_vendors?id=eq.${enc(p.vendor_id)}&select=name`) : Promise.resolve(null),
      sel<{ path: string }>(`pb_product_images?product_id=eq.${enc(p.id)}&kind=eq.image&select=path&order=position.asc&limit=2`),
    ]);
    const photos = await aiPhotos(imgs.map(i => i.path));
    const ai = await askClaude<ReadOut>({
      model: s.reader.model, effort: s.reader.effort,
      system: readerPrompt(s.categories, p.source === 'import', spec),
      content: [...photos.blocks, { type: 'text', text: factsText(p, vendor?.name ?? '') }],
      schema: readerSchema(s.categories, spec), maxTokens: 8000, timeoutMs: o.budget.hard - Date.now(),
    });
    const set = merge(p, ai.data, s.categories, o.manual);
    const next = { ...p, ...set } as ProductRow;
    const status = !hasPrice(next) || !String(next.category || '').trim() ? 'needs_info' : 'ready';
    const saved = await patch<ProductRow>('pb_products', `id=eq.${enc(p.id)}&status=eq.reading`,
      { ...set, status, ai_read_at: nowIso(), ai_error: null, claimed_at: null }, PRODUCT_COLS);
    if (!saved[0]) throw new HttpError(409, 'The product changed while it was being read — open it again.');
    product = await tagAfterRead(saved[0], tax, spec, ai.data, o.userId);
    await logActivity({ product_id: p.id, action: 'read', details: { model: ai.model, effort: ai.effort, usd: ai.usd, status: product.status, filled: Object.keys(set), ...(product.missing_attrs?.length ? { missing: product.missing_attrs } : {}), ...(photos.sent.length < imgs.length ? { photos_skipped: imgs.length - photos.sent.length } : {}) }, user_id: o.userId });
  } catch (e) {
    const msg = plain(e);
    await logActivity({ product_id: p.id, action: 'failed', details: { step: 'read', error: msg }, user_id: o.userId });
    if (o.manual) {
      await patch('pb_products', `id=eq.${enc(p.id)}&status=eq.reading`, { status: o.prevStatus || 'new', ai_error: msg, claimed_at: null });
      throw e instanceof HttpError ? e : new HttpError(502, msg);
    }
    const n = Number(TRY_RE.exec(p.ai_error || '')?.[1] || 0) + 1;
    const giveUp = n >= MAX_ATTEMPTS;
    const complete = hasPrice(p) && !!String(p.category || '').trim();
    if (giveUp && complete) { // staff already gave what websites need: ready anyway, the error stays as a note
      const r = await patch<ProductRow>('pb_products', `id=eq.${enc(p.id)}&status=eq.reading`, { status: 'ready', ai_error: msg.slice(0, 300), claimed_at: null }, PRODUCT_COLS);
      const fin = r[0] ? (await refresh([p.id]).catch((w) => { console.error(`pb-products gate ${p.id}: ${plain(w)}`); return []; }))[0] : null; // a required attribute still missing → Needs info
      if (r[0] && (!fin || fin.status === 'ready')) await routeAfterRead(r[0], o, p.ai_error);
      throw e;
    }
    // claimed_at stays: a 'new' product is retried only once it is 5 minutes old.
    await patch('pb_products', `id=eq.${enc(p.id)}&status=eq.reading`,
      { status: giveUp ? 'needs_info' : 'new', ai_error: giveUp ? msg : `${msg.slice(0, 260)} (attempt ${n} of ${MAX_ATTEMPTS})` });
    throw e;
  }
  if (product.status !== 'ready') return { product, routed: 0 };
  return await routeAfterRead(product, o, p.ai_error);
}

/** Route a product that was just read. On failure: logged as a 'route' failure (not a read
 *  failure); a manual read reports a warning (staff can route it again), the worker puts the
 *  product back to 'new' so the next run (after 5 min) reads and routes it again — counted with
 *  the read errors in ai_error (`prevErr` = ai_error before this read), so after 3 tries in all it
 *  stays Ready with the note and "Check websites again" routes it. */
async function routeAfterRead(product: ProductRow, o: { manual: boolean; userId: string | null }, prevErr: string | null): Promise<{ product: ProductRow; routed: number; warning?: string }> {
  try {
    const r = await routeProduct(product, o.userId);
    return { product, routed: r.routed, ...(r.warning ? { warning: r.warning } : {}) };
  } catch (e) {
    const msg = plain(e);
    await logActivity({ product_id: product.id, action: 'failed', details: { step: 'route', error: msg }, user_id: o.userId });
    const warning = `Read, but it could not be sent to the websites: ${msg}`;
    if (o.manual) return { product, routed: 0, warning };
    const n = Number(TRY_RE.exec(prevErr || '')?.[1] || 0) + 1;
    const back = await patch<ProductRow>('pb_products', `id=eq.${enc(product.id)}&status=eq.ready`, n >= MAX_ATTEMPTS
      ? { ai_error: warning.slice(0, 300) }
      : { status: 'new', ai_error: `${warning.slice(0, 260)} (attempt ${n} of ${MAX_ATTEMPTS})`, claimed_at: nowIso() }, PRODUCT_COLS)
      .catch((w) => { console.error(`pb-products route-retry reset ${product.id}: ${plain(w)}`); return [] as ProductRow[]; });
    return { product: back[0] ?? product, routed: 0, warning };
  }
}

function factsText(p: ProductRow, vendor: string): string {
  const less = Number(p.less_amount) > 0; // the reader must return the RATE: the stored cost is already rate − less
  const known = [
    p.name && `Name: ${p.name}`, p.sku && `SKU: ${p.sku}`, vendor && `Vendor: ${vendor}`,
    p.category && `Category: ${p.category}`, p.fabric && `Fabric: ${p.fabric}`, p.color && `Color: ${p.color}`,
    p.sizes?.length && `Sizes: ${p.sizes.join(', ')}`, !less && p.cost_price !== null && p.cost_price !== undefined && `Cost price: ${p.cost_price}`,
  ].filter(Boolean).join('\n');
  // Every less phrase ("Less: 200", "200 Less", "RATE 1600 LESS 200" → "RATE 1600") is hidden, so it is never taken off twice.
  const post = less ? stripLess(String(p.raw_text || '')) : p.raw_text;
  const note = less ? '\n\nThe vendor also gives a separate discount ("less"); Playbook subtracts it itself, so cost_price must be the RATE written in the post, before any less.'
    : p.sell_price !== null && p.sell_price !== undefined ? '\n\nThis product was imported from another online store: the price in the text is that store\'s SELLING price, not a vendor cost. Return cost_price null.' : '';
  return `${known ? `Already known:\n${known}\n\n` : ''}Vendor's post:\n${String(post || '(no text — use the photos)').slice(0, 6000)}${note}`;
}
