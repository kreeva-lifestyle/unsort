// Step 3 — Generate one CLAIMED listing ('generating'): price (pricing.ts),
// content (one Claude call with the site's model / effort), tags (tags.ts).
// Locked fields are kept. Next status: publish_mode review → 'review'
// (waits for a person); live / draft → 'publishing'.
import { askClaude } from './ai.ts';
import { cleanHtml, cut, fillTitle, makeHandle, stripTags } from './content.ts';
import { ago, enc, logActivity, nowIso, one, patch, sel } from './db.ts';
import { genFacts, genSchema, genSystem, type GenOut } from './genPrompt.ts';
import { HttpError, plain } from './http.ts';
import { aiPhotos } from './photos.ts';
import { compareAt, listingPrice } from './pricing.ts';
import { buildTags } from './tags.ts';
import { ARCHIVED, LISTING_COLS, MAX_ATTEMPTS, NEEDS_INFO, PRODUCT_COLS, STALE_MS, WEBSITE_COLS, hasPrice, type Budget, type ListingRow, type ProductRow, type WebsiteRow } from './types.ts';

const MAX_PHOTOS = 8; // photos sent to the writer (alt text for the rest is derived from the title)
/** Product fields the price, content or tags are made from: if any changes while the AI writes, the result is stale. */
const FACTS: (keyof ProductRow)[] = ['status', 'cost_price', 'sell_price', 'category', 'fabric', 'color', 'name', 'sku', 'sizes', 'vendor_id', 'attributes', 'raw_text'];
const factsOf = (x: ProductRow) => JSON.stringify(FACTS.map(k => x[k] ?? null));

const due = () => {
  const t = ago(STALE_MS);
  return `or=(and(status.eq.queued,or(claimed_at.is.null,claimed_at.lt.${t})),and(status.eq.generating,claimed_at.lt.${t}))`;
};
export const genCandidates = (limit: number) =>
  sel<{ id: string }>(`pb_listings?${due()}&select=id,pb_websites!inner(active)&pb_websites.active=eq.true&order=updated_at.asc&limit=${limit}`);

export async function claimGenerate(id: string, manual: boolean): Promise<ListingRow | null> {
  const t = ago(STALE_MS);
  const filter = manual
    ? `or=(status.in.(queued,review,failed,published),and(status.eq.publishing,or(claimed_at.is.null,claimed_at.lt.${t})),and(status.eq.generating,claimed_at.lt.${t}))`
    : due();
  return (await patch<ListingRow>('pb_listings', `id=eq.${enc(id)}&${filter}`, { status: 'generating', claimed_at: nowIso() }, LISTING_COLS))[0] ?? null;
}

export async function generateOne(l: ListingRow, o: { manual: boolean; prevStatus?: string; userId: string | null; budget: Budget }): Promise<ListingRow> {
  try {
    const [p, site] = await Promise.all([
      one<ProductRow>(`pb_products?id=eq.${enc(l.product_id)}&select=${PRODUCT_COLS}`),
      one<WebsiteRow>(`pb_websites?id=eq.${enc(l.website_id)}&select=${WEBSITE_COLS}`),
    ]);
    if (!p || !site) throw new HttpError(404, 'The product or website for this listing no longer exists.');
    if (p.status === 'archived') {
      const r = await patch<ListingRow>('pb_listings', `id=eq.${enc(l.id)}&status=eq.generating`, { status: 'skipped', error: ARCHIVED, claimed_at: null }, LISTING_COLS);
      return r[0] ?? l;
    }
    if (p.status === 'needs_info') throw new HttpError(400, NEEDS_INFO);
    if (!hasPrice(p)) throw new HttpError(400, 'The product has no cost price yet — add it on the product page.');
    const [vendor, imgs, rule] = await Promise.all([
      p.vendor_id ? one<{ name: string; code: string | null }>(`pb_vendors?id=eq.${enc(p.vendor_id)}&select=name,code`) : Promise.resolve(null),
      sel<{ path: string }>(`pb_product_images?product_id=eq.${enc(p.id)}&kind=eq.image&select=path&order=position.asc&limit=20`),
      l.rule_id ? one<{ price_override: { markup_pct?: number; add_flat?: number } | null }>(`pb_routing_rules?id=eq.${enc(l.rule_id)}&select=price_override`) : Promise.resolve(null),
    ]);
    const locked = new Set(l.locked || []);
    const c = site.content || ({} as WebsiteRow['content']);
    const tr = site.tag_rules || ({} as WebsiteRow['tag_rules']);

    // Price (a copied sell_price is used as is — pricing.ts listingPrice)
    const calc = listingPrice(p, site.pricing || {}, rule?.price_override ?? null)!;
    const price = locked.has('price') && l.price !== null ? Number(l.price) : calc.price;
    if (!(price > 0)) throw new HttpError(400, 'The price for this website comes out at ₹0 — check the cost price and the website\'s pricing.');
    const compare = locked.has('price') ? compareAt(price, site.pricing || {}) : calc.compare_at;

    // Content
    const photos = await aiPhotos(imgs.slice(0, MAX_PHOTOS).map(i => i.path));
    const extraMax = tr.ai_extra ? Math.max(0, Math.floor(Number(tr.ai_extra_max) || 0)) : 0;
    const ai = await askClaude<GenOut>({
      model: c.model, effort: c.effort,
      system: genSystem(site.name, c, extraMax, photos.blocks.length, p.source === 'import'),
      content: [...photos.blocks, { type: 'text', text: genFacts(p, vendor?.name ?? '') }],
      schema: genSchema, maxTokens: 16000, timeoutMs: o.budget.hard - Date.now(),
    });
    const g = ai.data;
    const vars = { category: p.category || '', fabric: p.fabric || '', color: p.color || '', vendor: vendor?.name || '', sku: p.sku || '', name: p.name || '' };
    const titleMax = Number(c.title_max) > 0 ? Number(c.title_max) : 70;
    const fresh = fillTitle(c.title_template, vars, cut(g.title, titleMax), titleMax) || cut(p.name || [p.color, p.fabric, p.category].filter(Boolean).join(' '), titleMax);
    const title = locked.has('title') && l.title ? l.title : fresh;
    const description = locked.has('description_html') && l.description_html !== null ? l.description_html : cleanHtml(g.description_html);
    const keepHandle = locked.has('handle') || (!!l.shopify_product_id && !!l.handle); // a live URL never moves
    const set: Record<string, unknown> = {
      price, compare_at_price: compare, title, description_html: description,
      seo_title: locked.has('seo_title') && l.seo_title !== null ? l.seo_title : cut(g.seo_title || title, Number(c.meta_title_max) || 60),
      seo_description: locked.has('seo_description') && l.seo_description !== null ? l.seo_description : cut(g.seo_description || stripTags(description), Number(c.meta_desc_max) || 155),
      handle: keepHandle && l.handle ? l.handle : makeHandle(g.handle || title, p.sku, p.id),
      tags: locked.has('tags') ? l.tags : buildTags(tr, { ...vars, vendor_code: vendor?.code || '', sizes: p.sizes || [], attributes: p.attributes || {} }, Array.isArray(g.extra_tags) ? g.extra_tags.slice(0, extraMax) : []),
      product_type: p.category || null,
      image_alts: c.alt_text === false ? [] : imgs.map((_, i) => cut(String(g.image_alts?.[photos.sent.indexOf(i)] || '') || `${title} - view ${i + 1}`, 250)),
      ai_model: ai.model, ai_effort: ai.effort || null, ai_cost_usd: ai.usd, generated_at: nowIso(),
      status: site.publish_mode === 'review' ? 'review' : 'publishing', attempts: 0, error: null, claimed_at: null,
    };
    // Staff changed the product while the AI was writing (e.g. a new cost): write it again from the new facts.
    const now = await one<ProductRow>(`pb_products?id=eq.${enc(p.id)}&select=${PRODUCT_COLS}`);
    if (!now || factsOf(now) !== factsOf(p)) {
      const r = await patch<ListingRow>('pb_listings', `id=eq.${enc(l.id)}&status=eq.generating`, { status: 'queued', error: null, claimed_at: null }, LISTING_COLS);
      if (o.manual) throw new HttpError(409, 'The product changed while this listing was being written — it is queued to be written again from the new details.');
      return r[0] ?? l;
    }
    const saved = await patch<ListingRow>('pb_listings', `id=eq.${enc(l.id)}&status=eq.generating`, set, LISTING_COLS);
    if (!saved[0]) throw new HttpError(409, 'The listing changed while it was being written — open it again.');
    await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'generated', details: { model: ai.model, effort: ai.effort, usd: ai.usd, price, next: set.status }, user_id: o.userId });
    return saved[0];
  } catch (e) {
    const msg = plain(e);
    await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'failed', details: { step: 'generate', error: msg }, user_id: o.userId });
    if (o.manual) {
      await patch('pb_listings', `id=eq.${enc(l.id)}&status=eq.generating`, { status: o.prevStatus || 'queued', error: msg, claimed_at: null });
      throw e instanceof HttpError ? e : new HttpError(502, msg);
    }
    const attempts = (l.attempts || 0) + 1;
    // Under the limit: back to 'queued' with claimed_at kept → retried after 5 minutes.
    await patch('pb_listings', `id=eq.${enc(l.id)}&status=eq.generating`,
      attempts < MAX_ATTEMPTS ? { status: 'queued', attempts, error: msg } : { status: 'failed', attempts, error: msg, claimed_at: null });
    throw e;
  }
}
