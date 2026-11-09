// One step of an import run: the next page of products from the website,
// normalised (normalize.ts), plus the cursor to save (cursor.ts). Shopify and
// WooCommerce: one request per page. Generic: the next slice of product URLs
// from the current sitemap (sitemaps.ts); pages imported before are skipped
// WITHOUT being fetched (`known`), the rest fetched one by one while
// `stillInTime` and their JSON-LD read (the page's own SEO title / description
// come from that same fetch). Every request is paced and robots-checked
// (fetch.ts). A product whose data cannot be normalised is left out, never the
// page. A rate limit (RateLimited) is thrown as it is: the run waits, it does
// not try another address in the same tick.
import { HttpError } from '../http.ts';
import { type Cursor, GENERIC_PER_TICK, afterShopify, afterSitemap, afterWoo, nextPath, sitemapStep } from './cursor.ts';
import { RateLimited, siteGet, siteJson } from './fetch.ts';
import { type Found, type ShopifyProduct, type WooProduct, fromJsonLd, fromShopify, fromWoo } from './normalize.ts';
import { findSitemaps, productLocs } from './sitemaps.ts';
import { mapSafe, pathRef } from './text.ts';
import { type Robots, robotsAllow } from './urlCheck.ts';

/** Generic: `taken` = pages fetched, `known` = pages skipped as imported before, `pageErrors` = fetched pages that
 *  failed, `wait` = the store asked us to slow down after some pages (seconds; the run keeps what it got). */
export interface Page { items: Found[]; cursor: Cursor; done: boolean; pageErrors?: number; taken?: number; known?: number; wait?: number }
export interface RunSpec {
  platform: string; origin: string; cursor: Cursor; in_stock_only: boolean;
  currency?: string | null;                          // Shopify: the store's own (meta.json)
  known?: (refs: string[]) => Promise<Set<string>>;  // which of these site refs were imported before
}

const listError = (status: number) => new HttpError(502, status === 413 ? 'The store’s product list is too large to read.' : 'The store’s product list could not be read.');

export async function fetchPage(run: RunSpec, robots: Robots, stillInTime: () => boolean): Promise<Page> {
  if (run.platform === 'shopify') return shopifyPage(run, robots);
  if (run.platform === 'woocommerce') return wooPage(run, robots);
  if (run.platform === 'generic') return genericPage(run, robots, stillInTime);
  throw new HttpError(400, 'Playbook could not tell which kind of store this is, so there is nothing to import.');
}

async function shopifyPage(run: RunSpec, robots: Robots): Promise<Page> {
  let path = nextPath('shopify', run.cursor, run.in_stock_only)!;
  const firstPage = !/page_info|page=[2-9]|page=\d\d/.test(path) && !path.startsWith('/collections/all');
  // Some stores only answer under /collections/all (or robots.txt only allows that one): the first page falls back once.
  if (firstPage && !robotsAllow(robots, path) && robotsAllow(robots, `/collections/all${path}`)) path = `/collections/all${path}`;
  const { data, got } = await siteJson<{ products?: unknown }>(`${run.origin}${path}`, { robots });
  if (!data || !Array.isArray(data.products)) {
    if (firstPage && !path.startsWith('/collections/all') && robotsAllow(robots, `/collections/all${path}`)) {
      const alt = await siteJson<{ products?: unknown }>(`${run.origin}/collections/all${path}`, { robots });
      if (alt.data && Array.isArray(alt.data.products)) return finishShopify(run, `/collections/all${path}`, alt.data.products as ShopifyProduct[], alt.got.headers.get('link'));
    }
    throw listError(got.status);
  }
  return finishShopify(run, path, data.products as ShopifyProduct[], got.headers.get('link'));
}

function finishShopify(run: RunSpec, path: string, products: ShopifyProduct[], link: string | null): Page {
  const first = products.length ? String(products[0].id) : '';
  // A store that ignores page= (or links to the same page) would repeat it forever: the same first product ends the run.
  if (first && run.cursor.first_ref === first) return { items: [], cursor: { ...run.cursor, errors: 0 }, done: true };
  const items = mapSafe(products, p => fromShopify(p, run.origin, run.currency ?? null)).filter(f => f.name);
  const next = afterShopify({ ...run.cursor, first_ref: first }, path, products.length, link, run.origin);
  // page_info pagination keeps the collection prefix; the counter form must too.
  if (!next.done && path.startsWith('/collections/all') && typeof next.cursor.next === 'string' && next.cursor.next.startsWith('/products.json')) next.cursor.next = `/collections/all${next.cursor.next}`;
  return { items, ...next };
}

async function wooPage(run: RunSpec, robots: Robots): Promise<Page> {
  const path = nextPath('woocommerce', run.cursor, run.in_stock_only)!;
  const { data, got } = await siteJson<WooProduct[]>(`${run.origin}${path}`, { robots });
  if (!Array.isArray(data)) {
    // Past the last page WooCommerce answers 400 (rest_product_invalid_page_number): that is the end, not an error.
    if (got.status === 400 && Number(run.cursor.page) > 1) return { items: [], cursor: { ...run.cursor, errors: 0 }, done: true };
    throw listError(got.status);
  }
  const totalPages = Number(got.headers.get('x-wp-totalpages'));
  const items = mapSafe(data, p => fromWoo(p, run.origin)).filter(f => f.name);
  return { items, ...afterWoo(run.cursor, data.length, Number.isFinite(totalPages) && totalPages > 0 ? totalPages : null) };
}

async function genericPage(run: RunSpec, robots: Robots, stillInTime: () => boolean): Promise<Page> {
  let cursor = run.cursor;
  if (!Array.isArray(cursor.sitemaps)) {
    const sitemaps = await findSitemaps(run.origin, robots);
    if (!sitemaps.length) throw new HttpError(400, 'The website has no list of pages Playbook can read, so its products cannot be found.');
    cursor = { ...cursor, sitemaps, si: 0, off: 0 };
  }
  const step = sitemapStep(cursor);
  if (!step) return { items: [], cursor, done: true };
  const sm = await siteGet(step.sitemap, { accept: 'application/xml, text/xml, */*;q=0.5', robots });
  if (!sm.ok) throw new HttpError(502, 'The website’s list of product pages could not be read.');
  const urls = productLocs(sm.text, step.sitemap, run.origin, robots);
  const slice = urls.slice(step.off, step.off + GENERIC_PER_TICK);
  const seen = run.known ? await run.known(slice.map(pathRef)) : new Set<string>();
  const items: Found[] = [];
  let pageErrors = 0, taken = 0, known = 0, used = 0, wait: number | undefined;
  for (const u of slice) {
    if (seen.has(pathRef(u))) { known++; used++; continue; } // imported before: not fetched again
    if (taken && !stillInTime()) break; // at least one page per call, so a slow site still moves
    try {
      const r = await siteGet(u, { robots });
      taken++; used++;
      const f = r.ok ? fromJsonLd(r.text, u) : null;
      if (f && f.name) items.push(f);
      else if (!r.ok) pageErrors++;
    } catch (e) {
      if (e instanceof RateLimited) { if (!taken) throw e; wait = e.retryAfter; break; } // this page is read again after the wait
      taken++; used++; pageErrors++;
    }
  }
  return { items, ...afterSitemap(cursor, step.si, step.off, used || slice.length, urls.length), pageErrors, taken, known, ...(wait ? { wait } : {}) };
}
