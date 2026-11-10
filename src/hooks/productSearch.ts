// Size rules, lookup and search over the SKU catalog index. Split out of
// useProductCatalog.ts (which loads and caches the index) to keep both files
// small; useProductCatalog re-exports everything here, so callers import from
// either file.
//
// SPEED. Search runs on every keystroke, so it is indexed rather than scanned:
//   * `sorted`  — array ordered by sku_norm, prefix-searched by binary search,
//                 so "DRS1" costs O(log n + k), not O(n).
//   * `byKey`   — Map for O(1) exact lookup; the old linear find ran on every
//                 single change event.
// At 1,270 rows a linear scan would also be fast; this is built so it stays
// fast at 50,000, which is the point of doing it properly once.
import type { Product, Index } from './useProductCatalog';

// ── Size rules ──────────────────────────────────────────────────────────────

/**
 * Does this design still need a size picked?
 *
 * No when `sizes` is empty — SEMI-STITCHED and UNSTITCHED are stitch types,
 * not sizes, and DRS141-SEMI-STITCHED would be nonsense.
 *
 * Also no when the SKU already ends in one of its own sizes: 78 SKUs in the
 * sheet are already written as DRS0004-S, and appending again would produce
 * DRS0004-S-S.
 */
export const needsSize = (p: Product): boolean =>
  p.sizes.length > 0 && !p.sizes.some(s => p.sku_norm.endsWith('-' + s));

/** Parent SKU + chosen size -> the sellable code, e.g. DRS141 + S -> DRS141-S. */
export const variantSku = (p: Product, size: string): string => `${p.sku}-${size}`;

// ── Lookup ──────────────────────────────────────────────────────────────────

/**
 * Resolve typed text to a catalog design. Accepts either the parent (DRS141)
 * or an already-sized variant (DRS141-S), so a user who types the full code by
 * hand still gets the price.
 */
export const resolveSku = (
  index: Index | null, raw: string,
): { product: Product; size: string | null } | undefined => {
  if (!index) return undefined;
  const key = raw.trim().toUpperCase();
  if (!key) return undefined;
  const exact = index.byKey.get(key);
  if (exact) return { product: exact, size: null };
  // Try stripping a trailing "-SIZE" and matching the parent — but only if
  // that size genuinely belongs to the parent, so DRS141-XYZ stays unresolved.
  const dash = key.lastIndexOf('-');
  if (dash > 0) {
    const parent = index.byKey.get(key.slice(0, dash));
    const size = key.slice(dash + 1);
    if (parent && parent.sizes.includes(size)) return { product: parent, size };
  }
  return undefined;
};

// ── Search ──────────────────────────────────────────────────────────────────

/** First index whose sku_norm >= q. Standard lower bound. */
const lowerBound = (arr: Product[], q: string): number => {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].sku_norm < q) lo = mid + 1; else hi = mid;
  }
  return lo;
};

/**
 * Suggestions for what has been typed. Prefix matches (binary-searched) come
 * first; a title/substring scan only runs when the prefix hit too little,
 * so the common case never pays for it.
 *
 * Deliberately NOT memoised here. A module-level memo is a single cell shared
 * by every mounted SkuInput, so a challan with several rows would thrash it —
 * callers memoise per-instance with useMemo instead.
 */
export const searchProducts = (index: Index | null, raw: string, limit = 25): Product[] => {
  if (!index) return [];
  const q = raw.trim().toUpperCase();
  if (!q) return [];

  const out: Product[] = [];
  const seen = new Set<string>();

  // Prefix band: contiguous in a sorted array, so walk from the lower bound
  // until the prefix stops matching. Active designs first within the band.
  const start = lowerBound(index.sorted, q);
  const band: Product[] = [];
  for (let i = start; i < index.sorted.length && index.sorted[i].sku_norm.startsWith(q); i++) {
    band.push(index.sorted[i]);
    if (band.length >= limit * 4) break;
  }
  band.sort((a, b) => Number(b.is_active) - Number(a.is_active));
  for (const p of band) { if (out.length >= limit) break; out.push(p); seen.add(p.sku_norm); }

  // Only now, and only if the prefix was thin, pay for a scan.
  if (out.length < 5) {
    for (const p of index.all) {
      if (out.length >= limit) break;
      if (seen.has(p.sku_norm)) continue;
      if (p.sku_norm.includes(q) || (p.title || '').toUpperCase().includes(q)) {
        out.push(p); seen.add(p.sku_norm);
      }
    }
  }

  return out;
};
