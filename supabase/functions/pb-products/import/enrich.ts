// Shopify / WooCommerce: their product lists have no SEO title or description,
// so each product's own page is fetched ONCE (paced like every other request,
// fetch.ts, with a shorter PAGE_META_MS timeout) and read by withPage(). Only
// pages on the run's own origin that robots.txt allows; a page that fails or
// is refused leaves the product as the list gave it (it is still imported).
// Generic sites need no extra request: their product page is what was read.
import { plain } from '../http.ts';
import { siteGet } from './fetch.ts';
import { type Found, withPage } from './normalize.ts';
import { type Robots, robotsAllow } from './urlCheck.ts';

export const PAGE_META_MS = 10_000;
/** Does this platform need the extra product-page request? */
export const needsPage = (platform: string) => platform === 'shopify' || platform === 'woocommerce';

export async function enrich(f: Found, origin: string, robots: Robots): Promise<Found> {
  let u: URL;
  try { u = new URL(f.url); } catch { return f; }
  if (u.origin !== origin || !robotsAllow(robots, u.pathname + u.search)) return f;
  try {
    const r = await siteGet(u.toString(), 'text/html, */*;q=0.5', PAGE_META_MS);
    return r.ok && r.text ? withPage(f, r.text) : f;
  } catch (e) {
    console.error(`pb-products import page ${f.url}: ${plain(e)}`);
    return f;
  }
}
