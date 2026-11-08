// Stores that are not Shopify or WooCommerce: their product pages, found
// through the sitemap(s) named in robots.txt (else /sitemap.xml; an index is
// expanded one level, product-looking sitemaps first). Every URL must be on
// the same site (www. or not) and allowed by robots.txt. In a sitemap whose
// own address says "product", every page counts as a product page (Wix
// /product-page/…, Magento /name.html); elsewhere the URL must look like one.
import { pickSitemaps, productSitemap, productUrl, sitemapLocs } from './cursor.ts';
import { siteGet } from './fetch.ts';
import { type Found, fromJsonLd } from './normalize.ts';
import { type Robots, robotsAllowUrl, sameSite } from './urlCheck.ts';

const XML = 'application/xml, text/xml, */*;q=0.5';

/** Product page URLs listed in one sitemap's XML. */
export function productLocs(xml: string, sitemapUrl: string, origin: string, robots: Robots): string[] {
  const whole = productSitemap(sitemapUrl);
  return sitemapLocs(xml).locs.filter(l => sameSite(l, origin) && (whole || productUrl(l)) && robotsAllowUrl(robots, l));
}

/** Sitemaps worth reading (from robots.txt, else /sitemap.xml; an index is expanded one level). */
export async function findSitemaps(origin: string, robots: Robots): Promise<string[]> {
  const named = robots.sitemaps.filter(s => sameSite(s, origin));
  const roots = named.length ? named : [`${origin}/sitemap.xml`];
  const out: string[] = [];
  for (const root of roots.slice(0, 3)) {
    if (!robotsAllowUrl(robots, root)) continue;
    const r = await siteGet(root, { accept: XML, robots }).catch(() => null);
    if (!r?.ok) continue;
    const { index, locs } = sitemapLocs(r.text);
    if (index) out.push(...pickSitemaps(locs.filter(l => sameSite(l, origin) && robotsAllowUrl(robots, l))));
    else out.push(root);
  }
  return [...new Set(out)].slice(0, 50);
}

/** import_check for such a store: how many product URLs, and a few pages proving that JSON-LD is there. */
export async function genericProbe(origin: string, robots: Robots, home: string, estimate: boolean): Promise<{ total: number | null; capped: boolean; sample: Found[]; sitemaps: string[] } | null> {
  const sitemaps = await findSitemaps(origin, robots);
  let total = 0;
  const urls: string[] = [];
  for (const sm of sitemaps.slice(0, estimate ? 3 : 1)) {
    const r = await siteGet(sm, { accept: XML, robots }).catch(() => null);
    if (!r?.ok) continue;
    const locs = productLocs(r.text, sm, origin, robots);
    total += locs.length;
    urls.push(...locs);
  }
  const capped = sitemaps.length > 3;
  const sample: Found[] = [];
  for (const u of urls.slice(0, estimate ? 5 : 1)) {
    const r = await siteGet(u, { robots }).catch(() => null);
    const f = r?.ok ? fromJsonLd(r.text, u) : null;
    if (f && f.name) sample.push(f);
    if (sample.length >= 3) break;
  }
  if (sample.length) return { total: total || null, capped, sample, sitemaps };
  const onHome = fromJsonLd(home, origin);
  return onHome && urls.length ? { total: total || null, capped, sample: [onHome], sitemaps } : null;
}
