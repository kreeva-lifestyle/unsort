// One step of an import run: the next page of products from the website,
// normalised (normalize.ts), plus the cursor to save (cursor.ts). Shopify and
// WooCommerce: one request per page. Generic: the next slice of product URLs
// from the current sitemap, each product page fetched and its JSON-LD read
// (GENERIC_PER_TICK pages at most per call). Every request is paced (fetch.ts).
import { HttpError } from '../http.ts';
import { type Cursor, GENERIC_PER_TICK, afterShopify, afterSitemap, afterWoo, nextPath, productUrl, sitemapLocs, sitemapStep } from './cursor.ts';
import { findSitemaps } from './detect.ts';
import { siteGet, siteJson } from './fetch.ts';
import { type Found, type ShopifyProduct, type WooProduct, fromJsonLd, fromShopify, fromWoo } from './normalize.ts';
import type { Robots } from './urlCheck.ts';

export interface Page { items: Found[]; cursor: Cursor; done: boolean; pageErrors?: number }
export interface RunSpec { platform: string; origin: string; cursor: Cursor; in_stock_only: boolean }

export async function fetchPage(run: RunSpec, robots: Robots, stillInTime: () => boolean): Promise<Page> {
  if (run.platform === 'shopify') return shopifyPage(run);
  if (run.platform === 'woocommerce') return wooPage(run);
  if (run.platform === 'generic') return genericPage(run, robots, stillInTime);
  throw new HttpError(400, 'Playbook could not tell which kind of store this is, so there is nothing to import.');
}

async function shopifyPage(run: RunSpec): Promise<Page> {
  const path = nextPath('shopify', run.cursor, run.in_stock_only)!;
  const { data, got } = await siteJson<{ products?: unknown }>(`${run.origin}${path}`);
  if (!data || !Array.isArray(data.products)) {
    // Some stores only answer under /collections/all; the first page falls back once.
    if (!/page_info|page=[2-9]|page=\d\d/.test(path) && !path.startsWith('/collections/all')) {
      const alt = await siteJson<{ products?: unknown }>(`${run.origin}/collections/all${path}`);
      if (alt.data && Array.isArray(alt.data.products)) return finishShopify(run, `/collections/all${path}`, alt.data.products as ShopifyProduct[], alt.got.headers.get('link'));
    }
    throw new HttpError(502, `The store's product list could not be read (${got.status}).`);
  }
  return finishShopify(run, path, data.products as ShopifyProduct[], got.headers.get('link'));
}

function finishShopify(run: RunSpec, path: string, products: ShopifyProduct[], link: string | null): Page {
  const items = products.map(p => fromShopify(p, run.origin)).filter(f => f.name);
  const next = afterShopify(run.cursor, path, products.length, link, run.origin);
  // page_info pagination keeps the collection prefix; the counter form must too.
  if (!next.done && path.startsWith('/collections/all') && typeof next.cursor.next === 'string' && next.cursor.next.startsWith('/products.json')) next.cursor.next = `/collections/all${next.cursor.next}`;
  return { items, ...next };
}

async function wooPage(run: RunSpec): Promise<Page> {
  const path = nextPath('woocommerce', run.cursor, run.in_stock_only)!;
  const { data, got } = await siteJson<WooProduct[]>(`${run.origin}${path}`);
  if (!Array.isArray(data)) {
    // Past the last page WooCommerce answers 400 (rest_product_invalid_page_number): that is the end, not an error.
    if (got.status === 400 && Number(run.cursor.page) > 1) return { items: [], cursor: { ...run.cursor, errors: 0 }, done: true };
    throw new HttpError(502, `The store's product list could not be read (${got.status}).`);
  }
  const totalPages = Number(got.headers.get('x-wp-totalpages'));
  const items = data.map(p => fromWoo(p, run.origin)).filter(f => f.name);
  return { items, ...afterWoo(run.cursor, data.length, Number.isFinite(totalPages) && totalPages > 0 ? totalPages : null) };
}

async function genericPage(run: RunSpec, robots: Robots, stillInTime: () => boolean): Promise<Page> {
  let cursor = run.cursor;
  if (!Array.isArray(cursor.sitemaps)) {
    const sitemaps = await findSitemaps(run.origin, robots);
    if (!sitemaps.length) throw new HttpError(400, 'The website has no sitemap Playbook can read, so its products cannot be listed.');
    cursor = { ...cursor, sitemaps, si: 0, off: 0 };
  }
  const step = sitemapStep(cursor);
  if (!step) return { items: [], cursor, done: true };
  const sm = await siteGet(step.sitemap, 'application/xml, text/xml, */*;q=0.5');
  if (!sm.ok) throw new HttpError(502, `A sitemap of the website could not be read (${sm.status}).`);
  const urls = sitemapLocs(sm.text).locs.filter(l => l.startsWith(run.origin + '/') && productUrl(l));
  const slice = urls.slice(step.off, step.off + GENERIC_PER_TICK);
  const items: Found[] = [];
  let pageErrors = 0, taken = 0;
  for (const u of slice) {
    if (taken && !stillInTime()) break; // at least one page per call, so a slow site still moves
    taken++;
    try {
      const r = await siteGet(u);
      const f = r.ok ? fromJsonLd(r.text, u) : null;
      if (f && f.name) items.push(f);
      else if (!r.ok) pageErrors++;
    } catch { pageErrors++; }
  }
  return { items, ...afterSitemap(cursor, step.si, step.off, taken || slice.length, urls.length), pageErrors };
}
