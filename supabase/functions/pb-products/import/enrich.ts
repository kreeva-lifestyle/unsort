// Shopify / WooCommerce: their product lists have no SEO title or description,
// so each product's own page is fetched ONCE (paced like every other request,
// fetch.ts, with a shorter PAGE_META_MS timeout) and read by withPage(). Only
// pages on the run's own site (www. or not) that robots.txt allows, and a
// redirect to another site is not followed. A page that fails or is refused
// leaves the product as the list gave it (it is still imported). When the
// store asks us to slow down, `gate.blocked` stops page fetches for the rest of
// the tick: the remaining products are imported from the list alone.
// Generic sites need no extra request: their product page is what was read.
import { plain } from '../http.ts';
import { RateLimited, siteGet } from './fetch.ts';
import { type Found, withPage } from './normalize.ts';
import { type Robots, robotsAllow, sameSite } from './urlCheck.ts';

export const PAGE_META_MS = 10_000;
/** Does this platform need the extra product-page request? */
export const needsPage = (platform: string) => platform === 'shopify' || platform === 'woocommerce';

export interface Gate { blocked: boolean }

export async function enrich(f: Found, origin: string, robots: Robots, gate: Gate = { blocked: false }): Promise<Found> {
  if (gate.blocked) return f;
  let u: URL;
  try { u = new URL(f.url); } catch { return f; }
  if (!sameSite(u.toString(), origin) || !robotsAllow(robots, u.pathname + u.search)) return f;
  try {
    const r = await siteGet(u.toString(), { accept: 'text/html, */*;q=0.5', timeoutMs: PAGE_META_MS, robots, sameOrigin: true });
    return r.ok && r.text ? withPage(f, r.text) : f;
  } catch (e) {
    if (e instanceof RateLimited) gate.blocked = true;
    console.error(`pb-products import page ${f.url}: ${plain(e)}`);
    return f;
  }
}
