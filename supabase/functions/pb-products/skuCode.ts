// The code each size of a product is sent to Shopify with (its SKU and its barcode): the product's own code, the
// colour where the code does not name one, and the size. Pure: no I/O (unit-tested in test/garment.test.mjs).
/** A size label without its measurement: "XS (34)" → "XS". */
export const sizeCore = (s: string) => s.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();

/** Size words a code can end in when the product's own sizes are of the same kind: the size in its code may
 *  have sold out ("KB 302 XL" with S and M on sale). Never across kinds: "-M" on a free-size product is not a size. */
const SIZE_KINDS = [['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl', '4xl', '5xl', '6xl'], ['free size', 'freesize', 'fs']];

/** The product's SKU without a size at its end, and what joined the two ("NKB 47 PURPLE XS" → "NKB 47 PURPLE" and
 *  " "). A product copied from another store carries one size's own SKU; each size on Shopify gets the base, the
 *  same joiner and its own size, which gives back the store's own code for every size ("NKB 47 PURPLE S"). The
 *  ending counts as a size when it is one of the product's sizes or a size word of their kind, and only after
 *  a joiner. A SKU with no size at its end is the base, joined with "-" ("RG-1042" → "RG-1042-M"). */
export function skuParts(sku: string, sizes: string[]): { base: string; join: string } {
  const s = String(sku || '').trim(), low = s.toLowerCase();
  if (!sizes.length) return { base: s, join: '-' }; // a product with no sizes keeps its code whole
  const own = sizes.map(x => sizeCore(x).toLowerCase()).filter(Boolean);
  const ends = [...new Set([...own, ...SIZE_KINDS.filter(k => own.some(c => k.includes(c))).flat()])].sort((a, b) => b.length - a.length);
  for (const size of ends) {
    if (!low.endsWith(size)) continue;
    const head = s.slice(0, s.length - size.length), join = /[\s\-_/]+$/.exec(head);
    if (join && join.index > 0) return { base: head.slice(0, join.index), join: join[0] };
  }
  return { base: s, join: '-' };
}
export const skuBase = (sku: string, sizes: string[]) => skuParts(sku, sizes).base;

const flat = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
// A design code as the copy rules read it (pb_code_key), and the size words that may follow it.
const DESIGN = /^(?:[A-Z]{1,6} ?[0-9]{2,6}[A-Z]?|(?:D ?NO|DNO|DESIGN ?NO|DESIGN|CODE|NO)? ?[0-9]{3,6})(?![A-Z0-9])/;
const SIZE_WORD = /\b(?:XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|FREE|SIZE|FS|[0-9]{1,3})\b/g;
/** A code that carries words after its design code names its colour itself, in the vendor's own words
 *  ("KB 302 WINE", "KB 264 RAMA", "5073 Pur"). */
const namesColour = (base: string) => {
  const words = base.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(), m = DESIGN.exec(words);
  return !!m && /[A-Z]/.test(words.slice(m[0].length).replace(SIZE_WORD, ' '));
};

/** The colour a listing's codes carry, remembered from its first send (pb_listings.sku_colour): codes that are on a
 *  store do not follow a colour that is re-worded later. A listing that reached its store before codes carried a
 *  colour keeps them as they are (''). Not sent yet: the product's colour as it is now. */
export function keptColour(l: { sku_colour?: string | null; shopify_product_id?: string | null }, p: { color?: string | null; source?: string | null }): string {
  if (typeof l.sku_colour === 'string') return l.sku_colour;
  return l.shopify_product_id || p.source === 'import' ? '' : flat(p.color).slice(0, 30);
}

/** The code each size's SKU and barcode start with. A vendor's design code (Telegram, typed by hand) is shared by
 *  every colour of the design, so two colours kept as two products sent the same SKU and barcode for each size
 *  (pre-launch fix D19): the colour goes into the code — "KA-5070" in Teal Blue → "KA-5070-TEALBLUE" — unless the
 *  code names its colour already ("KB 302 WINE"). A product copied from a store keeps that store's own code. */
export function codeBase(l: { sku_colour?: string | null; shopify_product_id?: string | null }, p: { color?: string | null; source?: string | null }, base: string, join: string): string {
  const colour = keptColour(l, p);
  if (!base || !colour || p.source === 'import' || namesColour(base) || flat(base).includes(colour)) return base;
  return `${base}${join}${colour}`;
}
