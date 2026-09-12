// Reconcile vs Indya — which of OUR active products (the master-sheet mirror
// behind every SKU box, product_catalog) are not on Indya's product master,
// one row per missing size variant, the Odette Coverage Check shape. Both
// sides are in the browser: Indya's side is the imported master file.
//
// The saved SKU map is applied BEFORE a product is called missing (owner:
// "see the mapping before concluding anything"): a misspelt Indya listing
// that the map points at our code counts as uploaded. Dashes are unreliable
// on both sides, so codes compare by shape (indyaSku.ts); 2XL and XXL are
// one size; sizes above XXL are ignored (vendors do not make them); a
// product with no sizes (semi-stitched, unstitched, free size) expects one
// no-size row on Indya.
import { normKey, shapeKey, stripSize, sizeSpellings, isNoSize, isAboveXXL, resolveCode, SIZE_TOKENS } from './indyaSku';
import type { MasterRow } from './indyaMaster';
import type { Corrections } from './indyaFiles';
import type { Product } from '../../../hooks/useProductCatalog';

export interface MissingRow {
  expected: string;     // the SKU Indya should carry: CODE-SIZE, or CODE for a no-size product
  size: string;         // 'XS' … 'XXL', or 'Unstitched'
  sku: string; title: string; catalog: string; category: string;
  indyaHas: string;     // sizes Indya does list for the code ('' when the code is not on Indya at all)
  whole: boolean;       // the code is not on Indya in any size
  mapped: boolean;      // the code is on Indya only through the SKU map
}
export interface CoverageCounts { active: number; present: number; missing: number; wholeProducts: number; mapped: number }
export interface Coverage { rows: MissingRow[]; counts: CoverageCounts }

const NO_SIZE = 'UNSTITCHED';
/** XS…XXL in the vendors' spelling (2XL → XXL). */
const canonSize = (size: string): string => { const s = sizeSpellings(size); return s.find(x => /^X+L$/.test(x)) ?? s[0]; };
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
const sortSizes = (a: string, b: string) => (SIZE_ORDER.indexOf(a) + 1 || 99) - (SIZE_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);

interface IndyaCode { sizes: Set<string>; mapped: boolean }

/** shapeKey(base code) → the sizes Indya lists for it. */
function indexIndya(master: MasterRow[], corrections?: Corrections | null): Map<string, IndyaCode> {
  const out = new Map<string, IndyaCode>();
  for (const r of master) {
    if (isAboveXXL(r.size)) continue;
    const { code, corrected } = resolveCode(r.vendorSku, r.size, r.sku, corrections);
    const key = shapeKey(stripSize(normKey(code), r.size));
    let e = out.get(key);
    if (!e) { e = { sizes: new Set(), mapped: !!corrected }; out.set(key, e); }
    else if (!corrected) e.mapped = false;   // listed under the correct code too → not only via the map
    e.sizes.add(isNoSize(r.size) ? NO_SIZE : canonSize(r.size));
  }
  return out;
}

/** The sizes we expect Indya to carry for a product: its size tokens up to
 *  XXL (Odette's rule, XXS…XXL; FREE counts as a no-size row), or one
 *  no-size row when it has none. */
export function expectedSizes(p: Product): string[] {
  const sizes = [...new Set((p.sizes || []).map(s => normKey(s)).filter(s => SIZE_TOKENS.has(s) && !isAboveXXL(s)).map(s => isNoSize(s) || s.startsWith('FREE') ? NO_SIZE : canonSize(s)))];
  return sizes.length ? sizes.sort(sortSizes) : [NO_SIZE];
}

export function coverageIndya(master: MasterRow[], products: Product[], corrections?: Corrections | null): Coverage {
  const indya = indexIndya(master, corrections);
  const rows: MissingRow[] = [];
  const seen = new Set<string>();
  const wholeCodes = new Set<string>();
  let active = 0, present = 0, mapped = 0;
  for (const p of products) {
    if (!p.is_active) continue;
    const base = stripSize(normKey(p.sku_norm || p.sku));
    if (!base) continue;
    const key = shapeKey(base);
    const on = indya.get(key);
    const has = on ? [...on.sizes].sort(sortSizes) : [];
    const indyaHas = has.map(s => s === NO_SIZE ? 'Unstitched' : s).join(' ');
    for (const size of expectedSizes(p)) {
      const expected = size === NO_SIZE ? base : `${base}-${size}`;
      if (seen.has(expected)) continue;
      seen.add(expected); active++;
      if (on?.sizes.has(size)) { present++; if (on.mapped) mapped++; continue; }
      if (!on) wholeCodes.add(key);
      rows.push({ expected, size: size === NO_SIZE ? 'Unstitched' : size, sku: p.sku, title: p.title ?? '', catalog: p.catalog ?? '', category: p.category ?? '', indyaHas, whole: !on, mapped: !!on?.mapped });
    }
  }
  return { rows, counts: { active, present, missing: rows.length, wholeProducts: wholeCodes.size, mapped } };
}
