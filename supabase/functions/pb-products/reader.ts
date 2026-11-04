// Step 1 — Read: Claude reads a product's post text + up to 2 photos and
// fills the facts (name, sku, category, fabric, color, sizes, cost_price,
// attributes). Only fields that are empty AND not locked are filled (a manual
// "Read again" refreshes every field that is not locked). Then: cost or
// category missing → needs_info; else ready → route (step 2).
// AI error: back to 'new' with ai_error, claimed_at kept so it retries after
// 5 min; the third error in a row → needs_info. The count rides in ai_error
// ("… (attempt 2 of 3)"), written in the same update as the status, so it
// never depends on a best-effort activity row.
// Routing runs after the read is saved and has its own error handling: a
// routing failure is not a read failure (see routeAfterRead).
import { askClaude } from './ai.ts';
import { ago, enc, getSettings, logActivity, nowIso, one, patch, sel } from './db.ts';
import { HttpError, plain } from './http.ts';
import { aiPhotos } from './photos.ts';
import { readerPrompt, readerSchema, type ReadOut } from './readerPrompt.ts';
import { routeProduct } from './route.ts';
import { MAX_ATTEMPTS, PRODUCT_COLS, STALE_MS, type Budget, type ProductRow } from './types.ts';

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
  const cost = Number(out.cost_price);
  if (out.cost_price !== null && Number.isFinite(cost) && cost > 0 && cost < 10_000_000 && can('cost_price')) set.cost_price = Math.round(cost * 100) / 100;
  if (!locked.has('attributes')) {
    const attrs: Record<string, string> = { ...(p.attributes || {}) };
    for (const [k, v] of Object.entries(out.attributes || {})) {
      const s = String(v ?? '').trim().slice(0, 500);
      if (s && (manual || !String(attrs[k] ?? '').trim())) attrs[k] = s;
    }
    set.attributes = attrs;
  }
  return set;
}

const TRY_RE = / \(attempt (\d+) of \d+\)$/;

/** Read one CLAIMED product. Returns the saved product, how many listings routing queued,
 *  and a warning when the read worked but routing did not. */
export async function readOne(p: ProductRow, o: { manual: boolean; prevStatus?: string; userId: string | null; budget: Budget }): Promise<{ product: ProductRow; routed: number; warning?: string }> {
  let product: ProductRow;
  try {
    const s = await getSettings();
    const [vendor, imgs] = await Promise.all([
      p.vendor_id ? one<{ name: string }>(`pb_vendors?id=eq.${enc(p.vendor_id)}&select=name`) : Promise.resolve(null),
      sel<{ path: string }>(`pb_product_images?product_id=eq.${enc(p.id)}&select=path&order=position.asc&limit=2`),
    ]);
    const photos = await aiPhotos(imgs.map(i => i.path));
    const ai = await askClaude<ReadOut>({
      model: s.reader.model, effort: s.reader.effort,
      system: readerPrompt(s.categories),
      content: [...photos.blocks, { type: 'text', text: factsText(p, vendor?.name ?? '') }],
      schema: readerSchema(s.categories), maxTokens: 8000, timeoutMs: o.budget.hard - Date.now(),
    });
    const set = merge(p, ai.data, s.categories, o.manual);
    const next = { ...p, ...set } as ProductRow;
    const status = next.cost_price === null || next.cost_price === undefined || !String(next.category || '').trim() ? 'needs_info' : 'ready';
    const saved = await patch<ProductRow>('pb_products', `id=eq.${enc(p.id)}&status=eq.reading`,
      { ...set, status, ai_read_at: nowIso(), ai_error: null, claimed_at: null }, PRODUCT_COLS);
    if (!saved[0]) throw new HttpError(409, 'The product changed while it was being read — open it again.');
    await logActivity({ product_id: p.id, action: 'read', details: { model: ai.model, effort: ai.effort, usd: ai.usd, status, filled: Object.keys(set), ...(photos.sent.length < imgs.length ? { photos_skipped: imgs.length - photos.sent.length } : {}) }, user_id: o.userId });
    product = saved[0];
  } catch (e) {
    const msg = plain(e);
    await logActivity({ product_id: p.id, action: 'failed', details: { step: 'read', error: msg }, user_id: o.userId });
    if (o.manual) {
      await patch('pb_products', `id=eq.${enc(p.id)}&status=eq.reading`, { status: o.prevStatus || 'new', ai_error: msg, claimed_at: null });
      throw e instanceof HttpError ? e : new HttpError(502, msg);
    }
    const n = Number(TRY_RE.exec(p.ai_error || '')?.[1] || 0) + 1;
    const giveUp = n >= MAX_ATTEMPTS;
    // claimed_at stays: a 'new' product is retried only once it is 5 minutes old.
    await patch('pb_products', `id=eq.${enc(p.id)}&status=eq.reading`,
      { status: giveUp ? 'needs_info' : 'new', ai_error: giveUp ? msg : `${msg.slice(0, 260)} (attempt ${n} of ${MAX_ATTEMPTS})` });
    throw e;
  }
  if (product.status !== 'ready') return { product, routed: 0 };
  return await routeAfterRead(product, o);
}

/** Route a product that was just read. On failure: logged as a 'route' failure (not a read
 *  failure); a manual read reports a warning (staff can route it again), the worker puts the
 *  product back to 'new' so the next run (after 5 min) reads and routes it again. */
async function routeAfterRead(product: ProductRow, o: { manual: boolean; userId: string | null }): Promise<{ product: ProductRow; routed: number; warning?: string }> {
  try {
    return { product, routed: (await routeProduct(product, o.userId)).routed };
  } catch (e) {
    const msg = plain(e);
    await logActivity({ product_id: product.id, action: 'failed', details: { step: 'route', error: msg }, user_id: o.userId });
    const warning = `Read, but it could not be sent to the websites: ${msg}`;
    if (o.manual) return { product, routed: 0, warning };
    const back = await patch<ProductRow>('pb_products', `id=eq.${enc(product.id)}&status=eq.ready`,
      { status: 'new', ai_error: warning.slice(0, 300), claimed_at: nowIso() }, PRODUCT_COLS)
      .catch((w) => { console.error(`pb-products route-retry reset ${product.id}: ${plain(w)}`); return [] as ProductRow[]; });
    return { product: back[0] ?? product, routed: 0, warning };
  }
}

function factsText(p: ProductRow, vendor: string): string {
  const known = [
    p.name && `Name: ${p.name}`, p.sku && `SKU: ${p.sku}`, vendor && `Vendor: ${vendor}`,
    p.category && `Category: ${p.category}`, p.fabric && `Fabric: ${p.fabric}`, p.color && `Color: ${p.color}`,
    p.sizes?.length && `Sizes: ${p.sizes.join(', ')}`, p.cost_price !== null && p.cost_price !== undefined && `Cost price: ${p.cost_price}`,
  ].filter(Boolean).join('\n');
  return `${known ? `Already known:\n${known}\n\n` : ''}Vendor's post:\n${String(p.raw_text || '(no text — use the photos)').slice(0, 6000)}`;
}
