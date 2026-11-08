// Pure: one product from another store, in Playbook's shape, whatever the
// platform. No I/O (tested with node --test).
//   One product per listing (never one per variant): sizes = the values of the
//   option / attribute named Size; colour = the Color option when it has one
//   value; in_stock = ANY variant available; price = the LOWEST price among the
//   variants on sale (sold-out variants only when all are), its own compare-at
//   (was) price as a note; images in the store's order, on public hosts only,
//   at most MAX_IMAGES (ingest's limit). Prices come back in whole currency
//   units (WooCommerce's Store API gives minor units + currency_minor_unit).
//   meta = the store's extra facts (brand, type, tags, barcode, weight, SEO…),
//   see meta.ts; withPage() adds what the product's own page shows.
import { type Meta, baseMeta, fillMissing, jsonLdMeta, pageAmount, pageMeta, shopifyMeta, wooMeta } from './meta.ts';
import { isProduct, jsonLdBlocks, offerPrices, offersOf } from './jsonld.ts';
import { abs, htmlToText, imgs, isColor, isSize, max, min, num, txt, uniq } from './text.ts';
import { sameSite } from './urlCheck.ts';

export { MAX_IMAGES, htmlToText } from './text.ts';
export { fromJsonLd, jsonLdBlocks } from './jsonld.ts';

export interface Found {
  ref: string;           // stable id on that site: Shopify / Woo product id, or the page path
  name: string; url: string; sku: string | null; description: string;
  price: number | null; compare_at: number | null; currency: string | null;
  in_stock: boolean; sizes: string[]; color: string | null; images: string[];
  prices?: number[];     // every price this product is sold at (for matching the page's price, withPage)
  meta?: Meta; // → pb_products.attributes (IMPORT_ATTRS keys only)
}

// ── Shopify /products.json ────────────────────────────────────────────────
export interface ShopifyProduct {
  id: number | string; title?: string; handle?: string; body_html?: string; vendor?: string; product_type?: string; tags?: string[] | string;
  variants?: { price?: string | number; compare_at_price?: string | number | null; available?: boolean; sku?: string; barcode?: string | null; grams?: number; option1?: string | null; option2?: string | null; option3?: string | null }[];
  options?: { name?: string; position?: number; values?: string[] }[];
  images?: { src?: string; position?: number }[];
}

/** `currency` = the store's own (its /meta.json, read once per run); Shopify's product list does not say. */
export function fromShopify(p: ShopifyProduct, origin: string, currency: string | null = null): Found {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  // Prices, sizes and colours come from the variants on sale (all variants when every one is sold out):
  // the price shown on the store is an available variant's, and it becomes OUR selling price.
  const live = variants.filter(v => v.available === true);
  const use = live.length ? live : variants;
  const options = Array.isArray(p.options) ? p.options : [];
  const valuesOf = (test: (n: unknown) => boolean): string[] => {
    const i = options.findIndex(o => test(o.name));
    if (i < 0) return [];
    const key = `option${(options[i].position ?? i + 1)}` as 'option1' | 'option2' | 'option3';
    const fromVariants = use.map(v => v[key]).filter((x): x is string => !!x);
    return uniq(fromVariants.length ? fromVariants : (options[i].values || []));
  };
  const price = min(use.map(v => num(v.price)));
  // The "was" price of a variant at that same price, and only when it is above it (never paired across variants).
  const compareAt = max(use.filter(v => price !== null && num(v.price) === price).map(v => { const c = num(v.compare_at_price), q = num(v.price); return c !== null && q !== null && c > q ? c : null; }));
  const colors = valuesOf(isColor);
  const url = `${origin}/products/${encodeURIComponent(String(p.handle || ''))}`;
  const f: Found = {
    ref: String(p.id), name: txt(p.title, 200), url, sku: txt(variants.find(v => v.sku)?.sku, 80) || null,
    description: htmlToText(p.body_html),
    price, compare_at: compareAt, currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    in_stock: variants.some(v => v.available === true), sizes: valuesOf(isSize), color: colors.length === 1 ? colors[0] : null,
    images: imgs([...(p.images || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(i => i.src), origin),
    prices: use.map(v => num(v.price)).filter((x): x is number => x !== null),
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

/** A permalink on the store itself (www. or not); another site's address is not kept. */
const onSite = (u: string | null, origin: string) => (u && sameSite(u, origin) ? u : null);

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
    ref: String(p.id), name: txt(p.name, 200), url: onSite(abs(p.permalink, origin), origin) || `${origin}/?p=${encodeURIComponent(String(p.id))}`, sku: txt(p.sku, 80) || null,
    description: htmlToText([p.description, p.short_description].filter(Boolean).join('\n')),
    price, compare_at: regular !== null && price !== null && regular > price ? regular : null, currency: txt(pr.currency_code, 3).toUpperCase() || null,
    in_stock: p.is_in_stock === true || p.stock_status === 'instock', sizes: terms(isSize), color: colors.length === 1 ? colors[0] : null,
    images: imgs((p.images || []).map(i => i.src), origin),
  };
  return { ...f, meta: wooMeta(p as unknown as Record<string, unknown>, f) };
}

/** A Shopify / WooCommerce product plus what its own page shows: the SEO title and
 *  description, the currency (when the list did not say) and any JSON-LD facts the
 *  list lacks (manufacturer, barcode…). The list's own values always win. The page's
 *  currency is taken only when the price on the page is one of this product's prices:
 *  a store that converts prices for the visitor's country may show dollars on the
 *  page while its list is in rupees. */
export function withPage(f: Found, html: string): Found {
  const { currency: pageCur, ...page } = pageMeta(html);
  const prod = jsonLdBlocks(html).find(isProduct);
  const ld = prod ? jsonLdMeta(prod) : {};
  const ours = [f.price, ...(f.prices || [])].filter((x): x is number => x !== null);
  const same = (n: number | null) => n !== null && ours.some(x => Math.abs(x - n) < 0.01);
  const offers = prod ? offersOf(prod) : [];
  const ldCur = txt(offers.find(o => offerPrices([o]).some(same))?.priceCurrency, 3).toUpperCase();
  const fromPage = pageCur && same(pageAmount(html)) ? pageCur : /^[A-Z]{3}$/.test(ldCur) ? ldCur : null;
  const next = { ...f, currency: f.currency ?? fromPage };
  return { ...next, meta: { ...fillMissing(f.meta || {}, { ...ld, ...page }), ...baseMeta(next) } };
}
