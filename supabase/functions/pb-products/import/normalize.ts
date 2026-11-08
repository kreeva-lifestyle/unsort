// Pure: one product from another store, in Playbook's shape, whatever the
// platform. No I/O (tested with node --test).
//   One product per listing (never one per variant): sizes = the values of the
//   option / attribute named Size; colour = the Color option when it has one
//   value; in_stock = ANY variant available; price = the LOWEST variant price,
//   the highest compare-at (was) price as a note; images in the store's order,
//   at most MAX_IMAGES (ingest's limit). Prices come back in whole currency
//   units (WooCommerce's Store API gives minor units + currency_minor_unit).
//   meta = the store's extra facts (brand, type, tags, barcode, weight, SEO…),
//   see meta.ts; withPage() adds what the product's own page shows.
import { type Meta, baseMeta, fillMissing, jsonLdMeta, pageMeta, shopifyMeta, wooMeta } from './meta.ts';

export const MAX_IMAGES = 10;

export interface Found {
  ref: string;           // stable id on that site: Shopify / Woo product id, or the page path
  name: string; url: string; sku: string | null; description: string;
  price: number | null; compare_at: number | null; currency: string | null;
  in_stock: boolean; sizes: string[]; color: string | null; images: string[];
  meta?: Meta; // → pb_products.attributes (IMPORT_ATTRS keys only)
}

const txt = (v: unknown, max = 500) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const uniq = (a: string[]) => [...new Set(a.map(s => txt(s, 40)).filter(Boolean))].slice(0, 30);
const min = (a: (number | null)[]) => { const v = a.filter((x): x is number => x !== null); return v.length ? Math.min(...v) : null; };
const max = (a: (number | null)[]) => { const v = a.filter((x): x is number => x !== null); return v.length ? Math.max(...v) : null; };
const isSize = (n: unknown) => /\bsizes?\b/i.test(String(n || ''));
const isColor = (n: unknown) => /\bcolou?rs?\b/i.test(String(n || ''));
const abs = (src: unknown, base: string): string | null => {
  const s = String(src ?? '').trim();
  if (!s) return null;
  try { const u = new URL(s.startsWith('//') ? `https:${s}` : s, base); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
};
const imgs = (list: unknown[], base: string) => list.map(x => abs(x, base)).filter((x): x is string => !!x).slice(0, MAX_IMAGES);

/** HTML → plain text with paragraph breaks (for raw_text; the AI rewrites it anyway). */
export function htmlToText(html: unknown): string {
  return String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 6000);
}

// ── Shopify /products.json ────────────────────────────────────────────────
export interface ShopifyProduct {
  id: number | string; title?: string; handle?: string; body_html?: string; vendor?: string; product_type?: string; tags?: string[] | string;
  variants?: { price?: string | number; compare_at_price?: string | number | null; available?: boolean; sku?: string; barcode?: string | null; grams?: number; option1?: string | null; option2?: string | null; option3?: string | null }[];
  options?: { name?: string; position?: number; values?: string[] }[];
  images?: { src?: string; position?: number }[];
}

export function fromShopify(p: ShopifyProduct, origin: string): Found {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const options = Array.isArray(p.options) ? p.options : [];
  const valuesOf = (test: (n: unknown) => boolean): string[] => {
    const i = options.findIndex(o => test(o.name));
    if (i < 0) return [];
    const key = `option${(options[i].position ?? i + 1)}` as 'option1' | 'option2' | 'option3';
    const fromVariants = variants.map(v => v[key]).filter((x): x is string => !!x);
    return uniq(fromVariants.length ? fromVariants : (options[i].values || []));
  };
  const colors = valuesOf(isColor);
  const url = `${origin}/products/${encodeURIComponent(String(p.handle || ''))}`;
  const f: Found = {
    ref: String(p.id), name: txt(p.title, 200), url, sku: txt(variants.find(v => v.sku)?.sku, 80) || null,
    description: htmlToText(p.body_html),
    price: min(variants.map(v => num(v.price))), compare_at: max(variants.map(v => num(v.compare_at_price))), currency: null,
    in_stock: variants.some(v => v.available === true), sizes: valuesOf(isSize), color: colors.length === 1 ? colors[0] : null,
    images: imgs([...(p.images || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(i => i.src), origin),
  };
  return { ...f, meta: shopifyMeta(p as unknown as Record<string, unknown>, f, valuesOf) };
}

// ── WooCommerce Store API /wp-json/wc/store/v1/products ──────────────────
export interface WooProduct {
  id: number | string; name?: string; permalink?: string; sku?: string; description?: string; short_description?: string;
  is_in_stock?: boolean; stock_status?: string; // 'instock' | 'outofstock' | 'onbackorder'
  prices?: { price?: string; regular_price?: string; sale_price?: string; currency_code?: string; currency_minor_unit?: number; price_range?: { min_amount?: string; max_amount?: string } | null };
  attributes?: { name?: string; terms?: { name?: string }[] }[];
  images?: { src?: string }[];
  brands?: { name?: string }[]; categories?: { name?: string }[]; tags?: { name?: string }[];
  weight?: string | number; weight_unit?: string; global_unique_id?: string;
}

export function fromWoo(p: WooProduct, origin: string): Found {
  const pr = p.prices || {};
  const unit = 10 ** (Number.isInteger(pr.currency_minor_unit) ? Number(pr.currency_minor_unit) : 2);
  const money = (v: unknown) => { const n = num(v); return n === null ? null : Math.round(n / unit * 100) / 100; };
  const price = money(pr.price_range?.min_amount ?? pr.price);
  const regular = money(pr.regular_price);
  const attrs = Array.isArray(p.attributes) ? p.attributes : [];
  const terms = (test: (n: unknown) => boolean) => uniq((attrs.find(a => test(a.name))?.terms || []).map(t => String(t.name ?? '')));
  const colors = terms(isColor);
  const f: Found = {
    ref: String(p.id), name: txt(p.name, 200), url: abs(p.permalink, origin) || `${origin}/?p=${encodeURIComponent(String(p.id))}`, sku: txt(p.sku, 80) || null,
    description: htmlToText([p.description, p.short_description].filter(Boolean).join('\n')),
    price, compare_at: regular !== null && price !== null && regular > price ? regular : null, currency: txt(pr.currency_code, 3) || null,
    in_stock: p.is_in_stock === true || p.stock_status === 'instock', sizes: terms(isSize), color: colors.length === 1 ? colors[0] : null,
    images: imgs((p.images || []).map(i => i.src), origin),
  };
  return { ...f, meta: wooMeta(p as unknown as Record<string, unknown>, f) };
}

// ── JSON-LD Product on a product page (other platforms) ──────────────────
type Ld = Record<string, unknown>;
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const ldText = (v: unknown): string => (v && typeof v === 'object' ? ldText((v as Ld).name ?? (v as Ld)['@value'] ?? (v as Ld).url) : txt(v, 500));

/** Every JSON-LD block on the page, flattened (@graph and arrays), or []. Bad JSON is skipped. */
export function jsonLdBlocks(html: string): Ld[] {
  const out: Ld[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(String(html || '')); m; m = re.exec(String(html || ''))) {
    try {
      const v = JSON.parse(m[1].trim()) as unknown;
      for (const node of asList(v)) {
        if (!node || typeof node !== 'object') continue;
        const n = node as Ld;
        if (Array.isArray(n['@graph'])) out.push(...(n['@graph'] as Ld[]).filter(x => x && typeof x === 'object'));
        else out.push(n);
      }
    } catch { /* not JSON */ }
  }
  return out;
}

const isProduct = (n: Ld) => asList(n['@type']).map(t => String(t).toLowerCase()).includes('product');

/** The product on a page, or null when it has no JSON-LD Product. `url` is the page address. */
export function fromJsonLd(html: string, url: string): Found | null {
  const prod = jsonLdBlocks(html).find(isProduct);
  if (!prod) return null;
  // An AggregateOffer keeps its own lowPrice / currency and brings its nested offers along.
  const offers = asList(prod.offers).flatMap(o => [o as Ld, ...(o && typeof o === 'object' && Array.isArray((o as Ld).offers) ? ((o as Ld).offers as Ld[]) : [])]).filter(o => o && typeof o === 'object');
  const prices = offers.flatMap(o => [num(o.price), num(o.lowPrice), num((o.priceSpecification as Ld | undefined)?.price)]);
  const avail = (o: Ld) => String(o.availability ?? '').toLowerCase();
  const inStock = offers.length ? offers.some(o => /instock|limitedavailability|preorder|onlineonly/.test(avail(o))) : false;
  const currency = txt(offers.map(o => o.priceCurrency).find(Boolean), 3) || null;
  const path = (() => { try { return new URL(url).pathname.replace(/\/+$/, '') || '/'; } catch { return url; } })();
  const colors = uniq(asList(prod.color).map(ldText));
  const sizes = uniq(asList(prod.size).map(ldText));
  const images = imgs(asList(prod.image).map(i => (i && typeof i === 'object' ? (i as Ld).url ?? (i as Ld).contentUrl : i)), url);
  const f: Found = {
    ref: path.slice(0, 180), name: txt(prod.name, 200), url, sku: txt(prod.sku ?? prod.mpn, 80) || null,
    description: htmlToText(prod.description),
    price: min(prices), compare_at: null, currency, in_stock: inStock, sizes, color: colors.length === 1 ? colors[0] : null, images,
  };
  return { ...f, meta: { ...pageMeta(html), ...jsonLdMeta(prod), ...baseMeta(f) } };
}

/** A Shopify / WooCommerce product plus what its own page shows: the SEO title and
 *  description, the currency (when the list did not say) and any JSON-LD facts the
 *  list lacks (manufacturer, barcode…). The list's own values always win. */
export function withPage(f: Found, html: string): Found {
  const page = pageMeta(html);
  const prod = jsonLdBlocks(html).find(isProduct);
  const ld = prod ? jsonLdMeta(prod) : {};
  const ldCur = prod ? txt(asList(prod.offers).map(o => (o && typeof o === 'object' ? (o as Ld).priceCurrency : null)).find(Boolean), 3).toUpperCase() : '';
  const currency = f.currency ?? (page.currency || (/^[A-Z]{3}$/.test(ldCur) ? ldCur : null));
  const next = { ...f, currency };
  return { ...next, meta: { ...fillMissing(f.meta || {}, { ...ld, ...page }), ...baseMeta(next) } };
}
