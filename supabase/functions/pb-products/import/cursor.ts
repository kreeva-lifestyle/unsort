// Pure: where the next page of a website is, per platform. No I/O (tested with
// node --test). The cursor is the jsonb saved on pb_import_runs after every
// page, so a run carries on from the next worker tick (or after a crash).
//   Shopify  { next: '/products.json?limit=50&page=N', currency, first_ref } — a
//            Link header rel="next" (page_info pagination on newer stores)
//            replaces the page counter; a page shorter than PAGE ends the run,
//            and so does a page that starts with the same product as the one
//            before (a store that ignores page= would repeat it forever).
//            Pages of 50: 250 rich products can pass the 3 MB body limit, and
//            a page cut short is re-read from the top on the next tick.
//   Woo      { page: N } — ends when the page is short or X-WP-TotalPages is reached.
//   generic  { sitemaps: [...], si, off } — product URLs of sitemap `si` from
//            offset `off`, GENERIC_PER_TICK pages per tick; next sitemap when
//            a sitemap is used up; ends after the last one.
//   skip / skip_ref  out of time mid-page: carry on after item skip_ref (or at index skip).
//   wait_until       the store asked us to slow down: no request before this time (ms).
//   errors   consecutive page errors (3 → the run fails).

export const SHOPIFY_PAGE = 50;
export const WOO_PAGE = 50;
export const GENERIC_PER_TICK = 25;
/** New products one run adds (added + failed) before it stops; products already here do not count. */
export const MAX_PRODUCTS = 5000;
/** Products one run looks at (known ones included) before it stops, so a re-run cannot go on for ever. */
export const MAX_SCANNED = 20_000;
export const MAX_PAGE_ERRORS = 3;

export type Cursor = Record<string, unknown>;

/** The path (same origin) to fetch next, or null when the run is finished. */
export function nextPath(platform: string, c: Cursor, inStockOnly: boolean): string | null {
  if (platform === 'shopify') return typeof c.next === 'string' && c.next ? c.next : `/products.json?limit=${SHOPIFY_PAGE}&page=1`;
  if (platform === 'woocommerce') {
    const page = Number(c.page) > 0 ? Number(c.page) : 1;
    return `/wp-json/wc/store/v1/products?per_page=${WOO_PAGE}&page=${page}${inStockOnly ? '&stock_status=instock' : ''}`;
  }
  return null; // generic: see sitemapStep
}

/** The URL `rel="next"` in a Link header, if it is on `origin`. */
export function linkNext(link: string | null, origin: string): string | null {
  for (const part of String(link || '').split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part.trim());
    if (!m) continue;
    try {
      const u = new URL(m[1], origin);
      if (u.origin === origin) return u.pathname + u.search;
    } catch { /* ignore */ }
  }
  return null;
}

/** Cursor after a Shopify page (`count` products on it, `link` = its Link header, `path` = the path fetched). */
export function afterShopify(c: Cursor, path: string, count: number, link: string | null, origin: string): { cursor: Cursor; done: boolean } {
  const viaLink = linkNext(link, origin);
  if (viaLink && viaLink !== path) return { cursor: { ...c, next: viaLink, errors: 0 }, done: false };
  if (count < SHOPIFY_PAGE) return { cursor: { ...c, next: null, errors: 0 }, done: true };
  const m = /[?&]page=(\d+)/.exec(path);
  const page = m ? Number(m[1]) + 1 : 2;
  return { cursor: { ...c, next: `/products.json?limit=${SHOPIFY_PAGE}&page=${page}`, errors: 0 }, done: false };
}

/** Cursor after a WooCommerce page (`totalPages` from X-WP-TotalPages when the store sends it). */
export function afterWoo(c: Cursor, count: number, totalPages: number | null): { cursor: Cursor; done: boolean } {
  const page = Number(c.page) > 0 ? Number(c.page) : 1;
  const done = count < WOO_PAGE || (totalPages !== null && page >= totalPages);
  return { cursor: { ...c, page: page + 1, errors: 0 }, done };
}

/** Generic: which sitemap and slice to read this tick, or null when every sitemap is used up. */
export function sitemapStep(c: Cursor): { sitemap: string; si: number; off: number } | null {
  const maps = Array.isArray(c.sitemaps) ? c.sitemaps.map(String) : [];
  const si = Number(c.si) >= 0 ? Number(c.si) : 0;
  if (si >= maps.length) return null;
  return { sitemap: maps[si], si, off: Number(c.off) >= 0 ? Number(c.off) : 0 };
}

/** Cursor after reading `taken` URLs from a sitemap of `total` product URLs. */
export function afterSitemap(c: Cursor, si: number, off: number, taken: number, total: number): { cursor: Cursor; done: boolean } {
  const maps = Array.isArray(c.sitemaps) ? c.sitemaps : [];
  const next = off + taken;
  if (next >= total) {
    const nsi = si + 1;
    return { cursor: { ...c, si: nsi, off: 0, errors: 0 }, done: nsi >= maps.length };
  }
  return { cursor: { ...c, si, off: next, errors: 0 }, done: false };
}

/** Does this sitemap URL look like it lists products (read first; others only when none does)? */
export const productSitemap = (u: string) => /product/i.test(u.slice(0, 2000)) && !/collection|categor|blog|page|post|author|tag/i.test(u.slice(0, 2000));
/** Does this page URL look like a product page? */
export const productUrl = (u: string) => u.length <= 500 && (/\/(products?|product-page|p|item|shop)\/[^/?#]+/i.test(u) || (/[^/]-p-?\d+\.html?$/i.test(u) && !/[?#]/.test(u)));

/** <loc> entries of a sitemap or sitemap index (plain regex: no XML parser in the edge runtime). */
export function sitemapLocs(xml: string): { index: boolean; locs: string[] } {
  const s = String(xml || '');
  const locs: string[] = [];
  const re = /<loc>\s*(?:<!\[CDATA\[\s*)?([^<\s\]]{1,2000})\s*(?:\]\]>\s*)?<\/loc>/gi;
  for (let m = re.exec(s); m && locs.length < 50_000; m = re.exec(s)) locs.push(m[1].replace(/&amp;/g, '&'));
  return { index: /<sitemapindex[\s>]/i.test(s), locs };
}

/** Which sitemaps to read for products: product-looking ones first; else every one. */
export function pickSitemaps(locs: string[], max = 50): string[] {
  const prod = locs.filter(productSitemap);
  return (prod.length ? prod : locs).slice(0, max);
}
