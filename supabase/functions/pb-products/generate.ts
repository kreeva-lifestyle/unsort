// Step 3 — Generate one CLAIMED listing ('generating'): price (pricing.ts),
// content written for THIS store (genPrompt.ts: store profile, primary keyword,
// the other stores' versions it must not copy; genWrite.ts: the call, the
// program checks of seoCheck.ts and one rewrite), tags (tags.ts; {tags} = the
// product's chosen attribute values in the site's tag style, tagStore.ts
// siteValueTags). Locked fields are kept. Next status: a HARD check problem →
// 'review' with the reason, whatever the site's publish mode; otherwise
// publish_mode review → 'review' (waits for a person); live / draft →
// 'publishing'. The search phrase, the FAQ, the missed facts and the check
// notes are kept beside the listing (seoStore.ts).
// Two versions of one product are never written at the same time: the later
// listing waits a minute, so it can be told what the earlier one says.
import { cleanHandle, cleanHtml, cut, fillTitle, stripTags, withBrand } from './content.ts';
import { ago, enc, logActivity, nowIso, one, patch, sel, uniqueCi } from './db.ts';
import { factValues, genFacts, genSchema, genSystem, limitsOf, type GenOut } from './genPrompt.ts';
import { writeCopy } from './genWrite.ts';
import { HttpError, plain } from './http.ts';
import { aiPhotos } from './photos.ts';
import { compareAt, listingPrice } from './pricing.ts';
import { cleanKeyword, keywordOf, profileOf } from './profile.ts';
import { checkCopy, hardOf, type Version } from './seoCheck.ts';
import { seoGet, seoPut } from './seoStore.ts';
import { buildTags } from './tags.ts';
import { siteValueTags } from './tagStore.ts';
import { ARCHIVED, LISTING_COLS, MAX_ATTEMPTS, NEEDS_INFO, PRODUCT_COLS, STALE_MS, WEBSITE_COLS, hasPrice, type Budget, type ListingRow, type ProductRow, type WebsiteRow } from './types.ts';

const MAX_PHOTOS = 8; // photos sent to the writer (alt text for the rest is derived from the title)
/** Product fields the price, content or tags are made from: if any changes while the AI writes, the result is stale. */
const FACTS: (keyof ProductRow)[] = ['status', 'cost_price', 'sell_price', 'category', 'fabric', 'color', 'name', 'sku', 'sizes', 'vendor_id', 'attributes', 'raw_text', 'tags'];
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

type Sibling = Version & { id: string; status: string; claimed_at: string | null; generated_at: string | null };
/** A sibling's text counts as "another store's version" once written and not waiting to be rewritten or removed. */
const isVersion = (x: Sibling) => !!x.generated_at && !!x.title && ['review', 'publishing', 'published', 'failed'].includes(x.status);

export async function generateOne(l: ListingRow, o: { manual: boolean; prevStatus?: string; userId: string | null; budget: Budget }): Promise<ListingRow> {
  let waited = false;
  try {
    const [p, site, sibs] = await Promise.all([
      one<ProductRow>(`pb_products?id=eq.${enc(l.product_id)}&select=${PRODUCT_COLS}`),
      one<WebsiteRow>(`pb_websites?id=eq.${enc(l.website_id)}&select=${WEBSITE_COLS}`),
      sel<Sibling>(`pb_listings?product_id=eq.${enc(l.product_id)}&id=neq.${enc(l.id)}&select=id,status,claimed_at,generated_at,title,description_html,seo_title,seo_description,image_alts`),
    ]);
    if (!p || !site) throw new HttpError(404, 'The product or website for this listing no longer exists.');
    if (p.status === 'archived') {
      const r = await patch<ListingRow>('pb_listings', `id=eq.${enc(l.id)}&status=eq.generating`, { status: 'skipped', error: ARCHIVED, claimed_at: null }, LISTING_COLS);
      return r[0] ?? l;
    }
    if (p.status === 'needs_info') throw new HttpError(400, NEEDS_INFO);
    if (!hasPrice(p)) throw new HttpError(400, 'The product has no cost price yet — add it on the product page.');
    // Another store's version of this product is being written right now (the lower id goes first): wait for it.
    if (sibs.some(x => x.status === 'generating' && x.id < l.id && !!x.claimed_at && Date.parse(x.claimed_at) > Date.now() - STALE_MS)) {
      waited = true;
      const r = await patch<ListingRow>('pb_listings', `id=eq.${enc(l.id)}&status=eq.generating`, { status: o.manual ? o.prevStatus || 'queued' : 'queued', claimed_at: null }, LISTING_COLS);
      if (o.manual) throw new HttpError(409, 'Another website\'s version of this product is being written right now — try again in a minute, so the two do not read alike.');
      return r[0] ?? l;
    }
    const [vendor, imgs, rule, seoRows] = await Promise.all([
      p.vendor_id ? one<{ name: string; code: string | null }>(`pb_vendors?id=eq.${enc(p.vendor_id)}&select=name,code`) : Promise.resolve(null),
      sel<{ path: string }>(`pb_product_images?product_id=eq.${enc(p.id)}&kind=eq.image&select=path&order=position.asc&limit=20`),
      l.rule_id ? one<{ price_override: { markup_pct?: number; add_flat?: number } | null }>(`pb_routing_rules?id=eq.${enc(l.rule_id)}&select=price_override`) : Promise.resolve(null),
      seoGet([l.id]),
    ]);
    const locked = new Set(l.locked || []);
    const c = site.content || ({} as WebsiteRow['content']);
    const tr = site.tag_rules || ({} as WebsiteRow['tag_rules']);
    const seo = seoRows.get(l.id);

    // Price (a copied sell_price is used as is — pricing.ts listingPrice)
    const calc = listingPrice(p, site.pricing || {}, rule?.price_override ?? null)!;
    const price = locked.has('price') && l.price !== null ? Number(l.price) : calc.price;
    if (!(price > 0)) throw new HttpError(400, 'The price for this website comes out at ₹0 — check the cost price and the website\'s pricing.');
    const compare = locked.has('price') ? compareAt(price, site.pricing || {}) : calc.compare_at;

    // Content: this store's profile, the phrase it is written for, and what the other stores already say.
    const profile = profileOf(site), L = limitsOf(c);
    const keyword = seo?.keyword_locked && seo.keyword ? cleanKeyword(seo.keyword) : keywordOf(profile.keyword_pattern, p);
    const others: Version[] = sibs.filter(isVersion).map(x => ({ title: x.title || '', description_html: x.description_html || '', seo_title: x.seo_title || '', seo_description: x.seo_description || '', image_alts: x.image_alts || [] }));
    const photos = await aiPhotos(imgs.slice(0, MAX_PHOTOS).map(i => i.path));
    const extraMax = tr.ai_extra ? Math.max(0, Math.floor(Number(tr.ai_extra_max) || 0)) : 0;
    const allowed = uniqueCi((tr.ai_allowed || []).map(t => String(t).trim()).filter(Boolean)).slice(0, 100);
    const vars = { category: p.category || '', fabric: p.fabric || '', color: p.color || '', vendor: vendor?.name || '', sku: p.sku || '', name: p.name || '' };
    const aiTitle = !locked.has('title') && /\{\s*ai_title\s*\}/i.test(c.title_template || '{ai_title}');
    const facts = factValues(p, p.tags || []);
    /** A draft as it would be saved (pattern title, brand ending, cuts, kept fields) with what the checks find in it. */
    const check = (g: GenOut) => {
      const fresh = fillTitle(c.title_template, vars, cut(g.title, L.titleMax), L.titleMax) || cut(p.name || [p.color, p.fabric, p.category].filter(Boolean).join(' '), L.titleMax);
      const title = locked.has('title') && l.title ? l.title : fresh;
      const description_html = locked.has('description_html') && l.description_html !== null ? l.description_html : cleanHtml(g.description_html);
      const done: GenOut = { ...g, title, description_html,
        seo_title: locked.has('seo_title') && l.seo_title !== null ? l.seo_title : withBrand(g.seo_title || title, profile.brand, L.metaTitleMax),
        seo_description: locked.has('seo_description') && l.seo_description !== null ? l.seo_description : cut(g.seo_description || stripTags(description_html), L.metaDescMax),
        faq: seo?.faq_locked ? seo.faq : g.faq };
      return { g: done, problems: checkCopy({ copy: done, keyword, brand: profile.brand, aiTitle, kept: [...locked], source: p.raw_text || '', others, facts,
        vendor: vendor?.name || '', sku: p.sku || '', fabric: /^\s*english\b/i.test(String(c.language || 'English')) ? p.fabric || '' : '', limits: L }) };
    };
    const w = await writeCopy({
      model: c.model, effort: c.effort, photos: photos.blocks, schema: genSchema(extraMax > 0 ? allowed : []), check, budget: o.budget,
      system: genSystem({ c, profile, extraMax, allowed, photos: photos.blocks.length, imported: p.source === 'import' }),
      facts: genFacts(p, { keyword, photos: photos.blocks.length, others, tags: p.tags || [] }),
    });
    const g = w.g, hard = hardOf(w.problems);
    const ok = new Set(allowed.map(t => t.toLowerCase()));
    const extra = g.extra_tags.filter(t => !allowed.length || ok.has(String(t).trim().toLowerCase())).slice(0, extraMax);
    const valueTags = locked.has('tags') ? [] : await siteValueTags(p.id, tr.tag_style);
    const keepHandle = locked.has('handle') || (!!l.shopify_product_id && !!l.handle); // a live URL never moves
    let handle = keepHandle && l.handle ? l.handle : cleanHandle(g.handle, keyword || g.title, p.sku) || `product-${p.id.replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase()}`;
    // Taken by another product on this website: a short suffix (the store itself is checked again at publish).
    if (handle !== l.handle && await one(`pb_listings?website_id=eq.${enc(l.website_id)}&handle=eq.${enc(handle)}&id=neq.${enc(l.id)}&select=id`)) handle = `${handle.slice(0, 74)}-${l.id.slice(0, 4)}`;
    const set: Record<string, unknown> = {
      price, compare_at_price: compare, title: g.title, description_html: g.description_html, seo_title: g.seo_title, seo_description: g.seo_description, handle,
      tags: locked.has('tags') ? l.tags : buildTags(tr, { ...vars, vendor_code: vendor?.code || '', sizes: p.sizes || [], attributes: p.attributes || {}, tags: valueTags }, extra),
      product_type: p.category || null,
      image_alts: c.alt_text === false ? [] : imgs.map((_, i) => cut(String(g.image_alts?.[photos.sent.indexOf(i)] || '') || `${g.title} - view ${i + 1}`, 110)),
      ai_model: w.model, ai_effort: w.effort || null, ai_cost_usd: w.usd, generated_at: nowIso(),
      // A hard problem waits for a person on every site, with the reason; otherwise the site's publish mode decides.
      status: hard.length || site.publish_mode === 'review' ? 'review' : 'publishing', attempts: 0, claimed_at: null,
      error: hard.length ? `Check before it goes out: ${hard.map(x => x.say).join(' ')}`.slice(0, 900) : null,
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
    await seoPut(l.id, { keyword, ...(seo?.faq_locked ? {} : { faq: g.faq }), missing: g.missing_facts, notes: w.problems.map(x => x.say), rewrites: w.rewrote ? 1 : 0 });
    await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'generated', user_id: o.userId,
      details: { model: w.model, effort: w.effort, usd: w.usd, price, next: set.status, keyword, ...(w.rewrote ? { rewrote: true } : {}), ...(w.problems.length ? { problems: w.problems.map(x => x.code) } : {}) } });
    return saved[0];
  } catch (e) {
    if (waited) throw e; // put back already: nothing failed
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
