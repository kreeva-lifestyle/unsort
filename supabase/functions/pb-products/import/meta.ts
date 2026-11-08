// Pure: the extra facts a store shows about a product ("meta"), stored as plain
// strings in pb_products.attributes under IMPORT_ATTRS. Only what the store
// really gives — a key is left out when the store has nothing for it (never
// guessed; brand is never copied into manufacturer). Sources:
//   Shopify  vendor → brand, product_type, tags → store_tags, first variant
//            barcode / grams, options Material|Fabric and Colour.
//   Woo      brands[] or the "Brand" attribute, category names → product_type,
//            tag names → store_tags, weight + unit, global_unique_id → barcode.
//   JSON-LD  brand, manufacturer, category, gtin13 / gtin / ean, weight, material, color.
//   Page     <title> / og:title → seo_title, meta description / og:description
//            → seo_description, og:price:currency → currency (pageMeta).
// No I/O (tested with node --test).

/** Attribute keys a website import owns: the reader never drops or replaces them. */
export const IMPORT_ATTRS = [
  'brand', 'manufacturer', 'product_type', 'store_tags', 'sku', 'barcode', 'weight', 'compare_at_price',
  'currency', 'seo_title', 'seo_description', 'material', 'colour', 'source_page_url',
] as const;

export type Meta = Record<string, string>;
type Obj = Record<string, unknown>;

const MAX_VALUE = 500;
const txt = (v: unknown, max = MAX_VALUE) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const nameOf = (v: unknown): string => (v && typeof v === 'object' ? nameOf((v as Obj).name ?? (v as Obj)['@value']) : txt(v));
const joined = (a: unknown[]) => [...new Set(a.map(nameOf).filter(Boolean))].join(', ').slice(0, MAX_VALUE);
const isMaterial = (n: unknown) => /\b(material|fabric)s?\b/i.test(String(n || ''));
const isColour = (n: unknown) => /\bcolou?rs?\b/i.test(String(n || ''));
const isBrand = (n: unknown) => /^\s*brands?\s*$/i.test(String(n || ''));

/** Drop empty values; every value a trimmed string ≤ 500 characters. */
export function cleanMeta(m: Record<string, unknown>): Meta {
  const out: Meta = {};
  for (const [k, v] of Object.entries(m)) { const s = txt(v); if (s) out[k] = s; }
  return out;
}

/** "₹2,999" for rupees (or an unknown currency, as Shopify's list does not say); "USD 29.5" otherwise. */
export function money(n: number | null, currency: string | null): string {
  if (n === null || !(n > 0)) return '';
  const s = n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return !currency || currency === 'INR' ? `₹${s}` : `${currency} ${s}`;
}

/** 750 → "750 g", 1500 → "1.5 kg"; nothing for 0 / not a number. */
export function gramsText(g: unknown): string {
  const n = Number(g);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n < 1000 ? `${Math.round(n * 10) / 10} g` : `${Math.round(n / 10) / 100} kg`;
}

/** A weight with its unit ("0.5 kg"); a bare number without a unit is not stored (the unit would be a guess). */
function weightText(value: unknown, unit: unknown): string {
  const v = txt(value, 40), u = txt(unit, 20);
  if (!v) return '';
  if (/[a-z]/i.test(v)) return v; // already carries its unit
  if (!Number.isFinite(Number(v)) || Number(v) <= 0 || !u) return '';
  const units: Record<string, string> = { grm: 'g', kgm: 'kg', lbr: 'lb', onz: 'oz' };
  return `${v} ${units[u.toLowerCase()] ?? u}`;
}

export interface Base { url: string; sku: string | null; price: number | null; compare_at: number | null; currency: string | null }
/** Keys every platform has: sku, currency, compare-at (only when above the price), the page address. */
export const baseMeta = (f: Base): Meta => cleanMeta({
  sku: f.sku, currency: f.currency, source_page_url: f.url,
  compare_at_price: f.compare_at !== null && f.price !== null && f.compare_at > f.price ? money(f.compare_at, f.currency) : '',
});

export function shopifyMeta(p: Obj, f: Base, optionValues: (test: (n: unknown) => boolean) => string[]): Meta {
  const variants = (Array.isArray(p.variants) ? p.variants : []) as Obj[];
  const tags = Array.isArray(p.tags) ? p.tags : String(p.tags ?? '').split(',');
  const g = variants.find(x => Number(x.grams) > 0), w = variants.find(x => Number(x.weight) > 0);
  return cleanMeta({
    ...baseMeta(f), brand: p.vendor, product_type: p.product_type, store_tags: joined(tags),
    barcode: variants.map(x => txt(x.barcode, 40)).find(Boolean),
    weight: g ? gramsText(g.grams) : w ? weightText(w.weight, w.weight_unit) : '',
    material: optionValues(isMaterial).join(', '), colour: optionValues(isColour).join(', '),
  });
}

export function wooMeta(p: Obj, f: Base): Meta {
  const attrs = (Array.isArray(p.attributes) ? p.attributes : []) as Obj[];
  const terms = (test: (n: unknown) => boolean) => joined(list(attrs.find(a => test(a.name))?.terms));
  return cleanMeta({
    ...baseMeta(f), brand: joined(list(p.brands)) || terms(isBrand), product_type: joined(list(p.categories)),
    store_tags: joined(list(p.tags)), barcode: txt(p.global_unique_id, 40), weight: weightText(p.weight, p.weight_unit),
    material: terms(isMaterial), colour: terms(isColour),
  });
}

/** Meta from a JSON-LD Product node (brand and manufacturer kept apart). */
export function jsonLdMeta(prod: Obj): Meta {
  const offers = list(prod.offers).filter(o => o && typeof o === 'object') as Obj[];
  const w = prod.weight && typeof prod.weight === 'object' ? prod.weight as Obj : null;
  return cleanMeta({
    brand: joined(list(prod.brand)), manufacturer: joined(list(prod.manufacturer)), product_type: joined(list(prod.category)),
    barcode: [prod.gtin13, prod.gtin, prod.gtin14, prod.gtin12, prod.gtin8, prod.ean, ...offers.map(o => o.gtin13 ?? o.gtin)].map(x => txt(x, 40)).find(Boolean),
    weight: w ? weightText(w.value, w.unitText ?? w.unitCode) : weightText(prod.weight, ''),
    material: joined(list(prod.material)), colour: joined(list(prod.color)),
  });
}

const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

/** The page's own SEO title / description and its currency, from the <head>. */
export function pageMeta(html: string): Meta {
  const head = String(html || '').split(/<\/head>/i)[0].slice(0, 400_000);
  const metas: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /\b(?:name|property|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1].toLowerCase();
    const val = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (key && val && !(key in metas)) metas[key] = decode(val[1] ?? val[2] ?? '');
  }
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '');
  const cur = txt(metas['og:price:currency'] || metas['product:price:currency'] || metas['pricecurrency'], 3).toUpperCase();
  return cleanMeta({
    seo_title: txt(title) || metas['og:title'], seo_description: metas['description'] || metas['og:description'],
    currency: /^[A-Z]{3}$/.test(cur) ? cur : '',
  });
}

/** `extra` fills only the keys `m` does not have yet. */
export const fillMissing = (m: Meta, extra: Meta): Meta => ({ ...extra, ...m });
