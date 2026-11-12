// Pure: the extra facts a store shows about a product ("meta"), stored as plain
// strings in pb_products.attributes under IMPORT_ATTRS. Only what the store
// really gives — a key is left out when the store has nothing for it (never
// guessed; brand is never copied into manufacturer). Sources:
//   Shopify  vendor → brand, product_type, tags → store_tags, first variant
//            barcode / grams, options Material|Fabric and Colour, and the two
//            dates the store keeps: created_at → source_created_at (uploaded
//            there), published_at → source_published_at (on sale there since).
//   Woo      brands[] or the "Brand" attribute, category names → product_type,
//            tag names → store_tags, weight + unit, global_unique_id → barcode.
//   JSON-LD  brand, manufacturer, category, gtin13 / gtin / ean, weight, material, color.
//   Page     <title> / og:title → seo_title, meta description / og:description
//            → seo_description, og:price:currency → currency (pageMeta).
// No I/O (tested with node --test). Page HTML is bounded and read with linear
// patterns only (text.ts), so a hostile page cannot stall the worker.
import { MAX_HTML, decode } from './text.ts';

/** Attribute keys a website import owns: the reader never drops or replaces them. */
export const IMPORT_ATTRS = [
  'brand', 'manufacturer', 'product_type', 'store_tags', 'sku', 'barcode', 'weight', 'compare_at_price',
  'currency', 'seo_title', 'seo_description', 'material', 'colour', 'source_page_url',
  'source_created_at', 'source_published_at',
] as const;

export type Meta = Record<string, string>;
type Obj = Record<string, unknown>;

const MAX_VALUE = 500;
const txt = (v: unknown, max = MAX_VALUE) => String(v ?? '').slice(0, max * 4).replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
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

/** A date as the store gives it → ISO (UTC). Nothing for an unreadable date, one before 2000 or one in the future. */
export function storeDate(v: unknown, now = Date.now()): string {
  const t = Date.parse(txt(v, 40));
  return Number.isFinite(t) && t >= Date.UTC(2000, 0, 1) && t <= now + 86_400_000 ? new Date(t).toISOString() : '';
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
    source_created_at: storeDate(p.created_at), source_published_at: storeDate(p.published_at),
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

/** The <meta> tags of the page's <head> (first value per key), read linearly from at most MAX_HTML characters. */
export function metaTags(html: string): { head: string; metas: Record<string, string> } {
  const s = String(html || '').slice(0, MAX_HTML);
  const end = s.toLowerCase().indexOf('</head');
  const head = end < 0 ? s : s.slice(0, end);
  const metas: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^<>]{0,2000}>/gi)) {
    const tag = m[0];
    const key = /\b(?:name|property|itemprop)\s*=\s*["']([^"']{1,100})["']/i.exec(tag)?.[1].toLowerCase();
    const val = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (key && val && !(key in metas)) metas[key] = decode(val[1] ?? val[2] ?? '');
  }
  return { head, metas };
}

/** The page's own SEO title / description and its currency, from the <head>. */
export function pageMeta(html: string): Meta {
  const { head, metas } = metaTags(html);
  const title = decode(/<title[^<>]{0,200}>([^<]{0,500})<\/title/i.exec(head)?.[1] ?? '');
  const cur = txt(metas['og:price:currency'] || metas['product:price:currency'] || metas['pricecurrency'], 3).toUpperCase();
  return cleanMeta({
    seo_title: txt(title) || metas['og:title'], seo_description: metas['description'] || metas['og:description'],
    currency: /^[A-Z]{3}$/.test(cur) ? cur : '',
  });
}

/** The price the page's <head> shows (og:price:amount / product:price:amount), or null. */
export function pageAmount(html: string): number | null {
  const { metas } = metaTags(html);
  const m = /\d[\d,]*(?:\.\d+)?/.exec(String(metas['og:price:amount'] || metas['product:price:amount'] || '').slice(0, 40));
  const n = m ? Number(m[0].replace(/,/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
}

const IMPORTED = new Set<string>(IMPORT_ATTRS);

/** The reader's attribute merge: every existing key is kept; the AI fills empty keys (any key on a
 *  manual "Read again"), except that an imported product's IMPORT_ATTRS keys are never touched. */
export function mergeReadAttrs(current: Record<string, string> | null | undefined, ai: Record<string, unknown> | null | undefined, o: { manual: boolean; imported: boolean }): Record<string, string> {
  const attrs: Record<string, string> = { ...(current || {}) };
  for (const [k, v] of Object.entries(ai || {})) {
    if (o.imported && IMPORTED.has(k)) continue; // the store's own fact wins
    const s = String(v ?? '').trim().slice(0, 500);
    if (s && (o.manual || !String(attrs[k] ?? '').trim())) attrs[k] = s;
  }
  return attrs;
}

/** `extra` fills only the keys `m` does not have yet. */
export const fillMissing = (m: Meta, extra: Meta): Meta => ({ ...extra, ...m });
