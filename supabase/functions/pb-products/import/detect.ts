// Which platform a store runs on, and a preview for the "Import from website"
// sheet: platform, how many products (and in stock), three sample products,
// warnings, a vendor name. Order: Shopify (/products.json), WooCommerce (Store
// API), else "generic" when a sitemap or the home page exposes product pages
// with JSON-LD Product, else "unknown". robots.txt is read first; a platform
// whose paths it disallows is refused (urlCheck.robotsRefusal).
import { HttpError } from '../http.ts';
import { SHOPIFY_PAGE, pickSitemaps, productUrl, sitemapLocs } from './cursor.ts';
import { siteGet, siteJson } from './fetch.ts';
import { type Found, type ShopifyProduct, type WooProduct, fromJsonLd, fromShopify, fromWoo } from './normalize.ts';
import { type Robots, type SiteUrl, parseRobots, robotsRefusal } from './urlCheck.ts';

export type Platform = 'shopify' | 'woocommerce' | 'generic' | 'unknown';
export interface Estimate { total: number | null; in_stock: number | null; capped: boolean }
export interface Detected {
  platform: Platform; origin: string; host: string; robots: Robots;
  estimate: Estimate; sample: Found[]; warnings: string[]; vendor_suggestion: string; sitemaps: string[];
}

const ESTIMATE_PAGES = 20; // Shopify: pages of 250 counted before we say "5000+"

export async function readRobots(origin: string): Promise<Robots> {
  try {
    const r = await siteGet(`${origin}/robots.txt`, 'text/plain, */*;q=0.5');
    return parseRobots(r.ok ? r.text : '');
  } catch { return parseRobots(''); } // unreachable robots.txt = no rules (the standard)
}

async function shopifyPage(origin: string, path: string): Promise<ShopifyProduct[] | null> {
  const { data } = await siteJson<{ products?: unknown }>(`${origin}${path}`);
  return data && Array.isArray(data.products) ? (data.products as ShopifyProduct[]) : null;
}

/** Shopify: count pages of 250 until a short page (≤ ESTIMATE_PAGES requests). */
async function shopifyEstimate(origin: string, first: ShopifyProduct[]): Promise<{ est: Estimate; sample: Found[] }> {
  let total = 0, inStock = 0, capped = false, page = 1, items: ShopifyProduct[] | null = first;
  const sample: Found[] = [];
  while (items) {
    total += items.length;
    for (const p of items) {
      const f = fromShopify(p, origin);
      if (f.in_stock) inStock++;
      if (sample.length < 3 && f.in_stock) sample.push(f);
    }
    if (items.length < SHOPIFY_PAGE) break;
    if (page >= ESTIMATE_PAGES) { capped = true; break; }
    page++;
    items = await shopifyPage(origin, `/products.json?limit=${SHOPIFY_PAGE}&page=${page}`);
  }
  return { est: { total, in_stock: inStock, capped }, sample };
}

const num = (h: Headers, k: string): number | null => { const n = Number(h.get(k)); return Number.isFinite(n) && n > 0 ? n : null; };

/** Site name from the home page (og:site_name, else <title> before " | " / " – "), else the host. */
export function siteName(html: string, host: string): string {
  const og = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i.exec(html);
  const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html);
  const raw = (og?.[1] || title?.[1] || '').replace(/&amp;/g, '&').split(/\s+[|–—-]\s+/)[0].replace(/\s+/g, ' ').trim();
  return (raw || host.replace(/^www\./, '').split('.')[0]).slice(0, 120);
}

export async function detect(site: SiteUrl, o: { estimate: boolean }): Promise<Detected> {
  const { origin, host } = site;
  const robots = await readRobots(origin);
  const warnings: string[] = [];
  if (robots.crawlDelay && robots.crawlDelay > 1) warnings.push(`The site asks robots to wait ${robots.crawlDelay} seconds between pages; Playbook waits at least 1 second, so a big import takes a while.`);
  const base = { origin, host, robots, warnings, sitemaps: [] as string[] };
  const refuse = (platform: Platform) => { const r = robotsRefusal(robots, platform); if (r) throw new HttpError(400, r); };

  // Shopify
  let sp = await shopifyPage(origin, `/products.json?limit=${o.estimate ? SHOPIFY_PAGE : 1}`);
  if (!sp) sp = await shopifyPage(origin, `/collections/all/products.json?limit=${o.estimate ? SHOPIFY_PAGE : 1}`);
  if (sp) {
    refuse('shopify');
    const { est, sample } = o.estimate ? await shopifyEstimate(origin, sp) : { est: { total: null, in_stock: null, capped: false }, sample: [] };
    return { ...base, platform: 'shopify', estimate: est, sample, vendor_suggestion: await vendorName(origin, host) };
  }
  // WooCommerce (Store API: public, no key)
  const woo = await siteJson<WooProduct[]>(`${origin}/wp-json/wc/store/v1/products?per_page=${o.estimate ? 3 : 1}&stock_status=instock`);
  if (Array.isArray(woo.data)) {
    refuse('woocommerce');
    let total: number | null = null;
    if (o.estimate) { const all = await siteJson<unknown>(`${origin}/wp-json/wc/store/v1/products?per_page=1`); total = num(all.got.headers, 'x-wp-total'); }
    const sample = woo.data.map(p => fromWoo(p, origin)).filter(f => f.in_stock).slice(0, 3);
    if (sample.some(s => s.currency && s.currency !== 'INR')) warnings.push(`Prices on this site are in ${sample.find(s => s.currency)?.currency}, not rupees — the price switch is skipped and the AI reads the cost instead.`);
    return { ...base, platform: 'woocommerce', estimate: { total, in_stock: num(woo.got.headers, 'x-wp-total'), capped: false }, sample, vendor_suggestion: await vendorName(origin, host) };
  }
  // Generic: product pages with JSON-LD, found through the sitemap (or the home page itself)
  const home = await siteGet(origin).catch(() => null);
  const vendor = siteName(home?.ok ? home.text : '', host);
  const g = await genericProbe(origin, robots, home?.ok ? home.text : '', o.estimate);
  if (g) {
    refuse('generic');
    warnings.push('This is not a Shopify or WooCommerce store, so Playbook reads each product page one by one (best effort): some products or details may be missed.');
    if (g.sample.some(s => s.currency && s.currency !== 'INR')) warnings.push(`Prices on this site are in ${g.sample.find(s => s.currency)?.currency}, not rupees — the price switch is skipped and the AI reads the cost instead.`);
    return { ...base, platform: 'generic', estimate: { total: g.total, in_stock: null, capped: g.capped }, sample: g.sample, warnings, vendor_suggestion: vendor, sitemaps: g.sitemaps };
  }
  if (home && !home.ok) warnings.push(`The website answered ${home.status} to Playbook — it may block automated visitors.`);
  return { ...base, platform: 'unknown', estimate: { total: null, in_stock: null, capped: false }, sample: [], warnings, vendor_suggestion: vendor };
}

async function vendorName(origin: string, host: string): Promise<string> {
  const home = await siteGet(origin).catch(() => null);
  return siteName(home?.ok ? home.text : '', host);
}

/** Sitemaps worth reading (from robots.txt, else /sitemap.xml; an index is expanded one level). */
export async function findSitemaps(origin: string, robots: Robots): Promise<string[]> {
  const roots = robots.sitemaps.filter(s => s.startsWith(origin + '/')).length ? robots.sitemaps.filter(s => s.startsWith(origin + '/')) : [`${origin}/sitemap.xml`];
  const out: string[] = [];
  for (const root of roots.slice(0, 3)) {
    const r = await siteGet(root, 'application/xml, text/xml, */*;q=0.5').catch(() => null);
    if (!r?.ok) continue;
    const { index, locs } = sitemapLocs(r.text);
    if (index) out.push(...pickSitemaps(locs.filter(l => l.startsWith(origin + '/'))));
    else out.push(root);
  }
  return [...new Set(out)].slice(0, 50);
}

async function genericProbe(origin: string, robots: Robots, home: string, estimate: boolean): Promise<{ total: number | null; capped: boolean; sample: Found[]; sitemaps: string[] } | null> {
  const sitemaps = await findSitemaps(origin, robots);
  let total = 0, capped = false;
  const urls: string[] = [];
  for (const sm of sitemaps.slice(0, estimate ? 3 : 1)) {
    const r = await siteGet(sm, 'application/xml, text/xml, */*;q=0.5').catch(() => null);
    if (!r?.ok) continue;
    const locs = sitemapLocs(r.text).locs.filter(l => l.startsWith(origin + '/') && productUrl(l));
    total += locs.length;
    urls.push(...locs);
  }
  if (sitemaps.length > 3) capped = true;
  const sample: Found[] = [];
  for (const u of urls.slice(0, estimate ? 5 : 1)) { // a few product pages: proof that JSON-LD is there
    const r = await siteGet(u).catch(() => null);
    const f = r?.ok ? fromJsonLd(r.text, u) : null;
    if (f && f.name) sample.push(f);
    if (sample.length >= 3) break;
  }
  if (sample.length) return { total: total || null, capped, sample, sitemaps };
  const onHome = fromJsonLd(home, origin);
  return onHome && urls.length ? { total: total || null, capped, sample: [onHome], sitemaps } : null;
}

