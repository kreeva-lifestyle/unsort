// Which platform a store runs on, and a preview for the "Import from website"
// sheet: platform, how many products (and in stock), three sample products,
// warnings, a vendor name. Order: Shopify (/products.json), WooCommerce (Store
// API), else "generic" when a sitemap or the home page exposes product pages
// with JSON-LD Product, else "unknown". robots.txt is read first, and decides:
//   - the site's own address: a redirect from example.com to www.example.com
//     (or back) is followed once here and that host is used from then on;
//   - every probe: a path it disallows is never fetched; when nothing could be
//     found because of that, the robots refusal sentence is the answer;
//   - its Crawl-delay sets the pace for this host (fetch.ts setPace).
// robots.txt missing (4xx) = no rules; broken (5xx) or unreachable = stop and
// try later (the standard says not to crawl a site whose robots.txt fails).
// The check also says whether the products name their maker (maker.ts): every
// Shopify product it counts, 20 WooCommerce products, the generic sample.
import { HttpError } from '../http.ts';
import { SHOPIFY_PAGE } from './cursor.ts';
import { type Got, setPace, siteGet, siteJson } from './fetch.ts';
import { type MakerCheck, makerTally } from './maker.ts';
import { metaTags } from './meta.ts';
import { type Found, type ShopifyProduct, type WooProduct, fromShopify, fromWoo } from './normalize.ts';
import { genericProbe } from './sitemaps.ts';
import { decode, mapSafe } from './text.ts';
import { ROBOTS_NO, type Robots, type SiteUrl, parseRobots, robotsAllow, robotsRefusal, sameSite } from './urlCheck.ts';

export type Platform = 'shopify' | 'woocommerce' | 'generic' | 'unknown';
export interface Estimate { total: number | null; in_stock: number | null; capped: boolean }
export interface Detected {
  platform: Platform; origin: string; host: string; robots: Robots;
  estimate: Estimate; sample: Found[]; warnings: string[]; vendor_suggestion: string; sitemaps: string[];
  /** With the estimate only: do the products name who makes them? */
  maker?: MakerCheck;
}

/** The check counts Shopify products in pages of 250 (fewer requests), or of 50 when 250 is over the body limit. */
const ESTIMATE_PAGE = 250;
const ESTIMATE_PAGES = 20;
const UNREACHABLE = 'The website could not be reached right now — try again in a few minutes.';
const PASSWORD = 'This store is password-protected, so its products cannot be read.';
export const foreignPrices = (cur: string) => `Prices on this site are in ${cur}, not rupees, so no price is copied — each product waits in Needs info until you add a cost price.`;

export async function readRobots(origin: string): Promise<Robots> {
  let r: Got;
  try { r = await siteGet(`${origin}/robots.txt`, { accept: 'text/plain, */*;q=0.5' }); } catch (e) {
    if (e instanceof HttpError) throw e; // RateLimited (wait), or a redirect Playbook may not follow
    throw new HttpError(502, UNREACHABLE);
  }
  if (r.status >= 500) throw new HttpError(502, UNREACHABLE);
  const host = r.url && sameSite(r.url, origin) ? new URL(r.url).host : new URL(origin).host;
  return { ...parseRobots(r.ok ? r.text : ''), host };
}

/** The Shopify store's own currency (/meta.json), null when it does not say. Rate limits / network errors are thrown. */
export async function shopCurrency(origin: string, robots: Robots): Promise<string | null> {
  if (!robotsAllow(robots, '/meta.json')) return null;
  const { data } = await siteJson<{ currency?: unknown }>(`${origin}/meta.json`, { robots });
  const c = String(data?.currency ?? '').toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

interface Probe { origin: string; robots: Robots; blocked: boolean }
/** A JSON probe, only where robots.txt allows it (`blocked` remembers that one was skipped). */
async function getJson<T>(p: Probe, path: string): Promise<{ data: T | null; got: Got } | null> {
  if (!robotsAllow(p.robots, path)) { p.blocked = true; return null; }
  return siteJson<T>(p.origin + path, { robots: p.robots });
}

async function shopifyList(p: Probe, path: string): Promise<{ products: ShopifyProduct[] | null; status: number }> {
  const r = await getJson<{ products?: unknown }>(p, path);
  if (!r) return { products: null, status: 0 };
  if (r.got.url && new URL(r.got.url).pathname === '/password') throw new HttpError(400, PASSWORD);
  return { products: r.data && Array.isArray(r.data.products) ? r.data.products as ShopifyProduct[] : null, status: r.got.status };
}

/** Shopify: count pages until a short one (≤ ESTIMATE_PAGES requests). */
async function shopifyEstimate(p: Probe, base: string, size: number, first: ShopifyProduct[], currency: string | null, makers: ReturnType<typeof makerTally>): Promise<{ est: Estimate; sample: Found[] }> {
  let total = 0, inStock = 0, capped = false, page = 1, items: ShopifyProduct[] | null = first;
  const sample: Found[] = [];
  while (items) {
    total += items.length;
    for (const f of mapSafe(items, x => fromShopify(x, p.origin, currency))) {
      makers.add(f);
      if (!f.in_stock) continue;
      inStock++;
      if (sample.length < 3) sample.push(f);
    }
    if (items.length < size) break;
    if (page >= ESTIMATE_PAGES) { capped = true; break; }
    page++;
    items = (await shopifyList(p, `${base}?limit=${size}&page=${page}`)).products;
  }
  return { est: { total, in_stock: inStock, capped }, sample };
}

const num = (h: Headers, k: string): number | null => { const n = Number(h.get(k)); return Number.isFinite(n) && n > 0 ? n : null; };

/** Site name from the home page (og:site_name, else <title> before " | " / " – "), else the host. */
export function siteName(html: string, host: string): string {
  const { head, metas } = metaTags(html);
  const title = /<title[^<>]{0,200}>([^<]{1,200})<\/title/i.exec(head)?.[1];
  const raw = decode(metas['og:site_name'] || title || '').split(/\s+[|–—-]\s+/)[0].replace(/\s+/g, ' ').trim();
  return (raw || host.replace(/^www\./, '').split('.')[0]).slice(0, 120);
}

async function homePage(p: Probe): Promise<Got | null> {
  return robotsAllow(p.robots, '/') ? siteGet(p.origin, { robots: p.robots }).catch(() => null) : null;
}

export async function detect(site: SiteUrl, o: { estimate: boolean }): Promise<Detected> {
  const robots = await readRobots(site.origin);
  const host = robots.host ?? site.host, origin = `https://${host}`;
  setPace(host, (robots.crawlDelay ?? 1) * 1000);
  const warnings: string[] = [];
  if (robots.crawlDelay && robots.crawlDelay > 1) warnings.push(`The site asks visitors to wait ${Math.min(10, robots.crawlDelay)} seconds between pages, and Playbook does, so a big import takes a while.`);
  const base = { origin, host, robots, warnings, sitemaps: [] as string[] };
  const probe: Probe = { origin, robots, blocked: false };
  const vendor = async () => { const h = await homePage(probe); return siteName(h?.ok ? h.text : '', host); };
  const makers = makerTally();
  const maker = (name: string) => (o.estimate ? { maker: makers.result({ name, host }) } : {});

  // Shopify
  const tryList = async (path: string) => {
    let size = o.estimate ? ESTIMATE_PAGE : 1;
    let r = await shopifyList(probe, `${path}?limit=${size}`);
    if (!r.products && r.status === 413) { size = SHOPIFY_PAGE; r = await shopifyList(probe, `${path}?limit=${size}`); }
    return { ...r, size, path };
  };
  let sp = await tryList('/products.json');
  if (!sp.products) sp = await tryList('/collections/all/products.json');
  if (sp.products) {
    const currency = o.estimate ? await shopCurrency(origin, robots) : null;
    if (currency && currency !== 'INR') warnings.push(foreignPrices(currency));
    const { est, sample } = o.estimate ? await shopifyEstimate(probe, sp.path, sp.size, sp.products, currency, makers) : { est: { total: null, in_stock: null, capped: false }, sample: [] };
    const name = await vendor();
    return { ...base, platform: 'shopify', estimate: est, sample, vendor_suggestion: name, ...maker(name) };
  }
  // WooCommerce (Store API: public, no key)
  const woo = await getJson<WooProduct[]>(probe, `/wp-json/wc/store/v1/products?per_page=${o.estimate ? 20 : 1}&stock_status=instock`);
  if (woo && Array.isArray(woo.data)) {
    let total: number | null = null;
    if (o.estimate) { const all = await getJson<unknown>(probe, '/wp-json/wc/store/v1/products?per_page=1'); total = all ? num(all.got.headers, 'x-wp-total') : null; }
    const read = mapSafe(woo.data, p => fromWoo(p, origin));
    read.forEach(f => makers.add(f));
    const sample = read.filter(f => f.in_stock).slice(0, 3);
    const cur = sample.find(s => s.currency && s.currency !== 'INR')?.currency;
    if (cur) warnings.push(foreignPrices(cur));
    const name = await vendor();
    return { ...base, platform: 'woocommerce', estimate: { total, in_stock: num(woo.got.headers, 'x-wp-total'), capped: false }, sample, vendor_suggestion: name, ...maker(name) };
  }
  // Generic: product pages with JSON-LD, found through the sitemap (or the home page itself)
  const home = await homePage(probe);
  const g = await genericProbe(origin, robots, home?.ok ? home.text : '');
  const vendorName = siteName(home?.ok ? home.text : '', host);
  if (g) {
    const r = robotsRefusal(robots, 'generic');
    if (r) throw new HttpError(400, r);
    warnings.push('This is not a Shopify or WooCommerce store, so Playbook reads each product page one by one (best effort): some products or details may be missed.');
    const cur = g.sample.find(s => s.currency && s.currency !== 'INR')?.currency;
    if (cur) warnings.push(foreignPrices(cur));
    g.sample.forEach(f => makers.add(f));
    return { ...base, platform: 'generic', estimate: { total: g.total, in_stock: null, capped: g.capped }, sample: g.sample, warnings, vendor_suggestion: vendorName, sitemaps: g.sitemaps, ...maker(vendorName) };
  }
  if (probe.blocked) throw new HttpError(400, ROBOTS_NO);
  if (home && !home.ok) warnings.push('The website did not answer Playbook normally — it may block automated visitors.');
  return { ...base, platform: 'unknown', estimate: { total: null, in_stock: null, capped: false }, sample: [], warnings, vendor_suggestion: vendorName };
}
