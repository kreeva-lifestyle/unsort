// Catalog maker PAGES rule for repeated codes (owner): the same code may sit
// on several photos, but only in PAIRS — the two photos share one page and
// the code is written once, top right. Three or five photos of one code
// would leave a lone copy on a mixed page, so an odd repeat blocks Generate.
// Pure (no React, no canvas) so a node test can check the ordering.

export const skuKey = (sku: string) => sku.trim().toUpperCase();

export const skuCounts = (tiles: { sku: string }[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const t of tiles) { const k = skuKey(t.sku); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return m;
};

/** Codes repeated an odd number of times (3, 5…): not allowed in Pages. */
export const oddRepeats = (tiles: { sku: string }[]): Map<string, number> =>
  new Map([...skuCounts(tiles)].filter(([, n]) => n > 1 && n % 2 === 1));

/** Codes on exactly-paired photos (2, 4…): each pair becomes one page. */
export const pairedCodes = (tiles: { sku: string }[]): Set<string> =>
  new Set([...skuCounts(tiles)].filter(([, n]) => n > 1 && n % 2 === 0).map(([k]) => k));

/**
 * Page order. The owner's order is kept as far as the pairing allows: units
 * (a pair of one code, or a single photo) are placed in first-appearance
 * order, and a pair is held back only until it can start on the LEFT half
 * of a page, so the two photos always land on one page. A pair still waiting
 * at the end is placed before the last single rather than splitting it.
 */
export function pairOrder<T extends { sku: string }>(tiles: T[]): T[] {
  const paired = pairedCodes(tiles);
  const groups = new Map<string, T[]>();
  const units: T[][] = [];
  for (const t of tiles) {
    const k = skuKey(t.sku);
    if (!paired.has(k)) { units.push([t]); continue; }
    let g = groups.get(k);
    if (!g || g.length === 2) { g = []; groups.set(k, g); units.push(g); } // the unit sits where its FIRST photo was
    g.push(t);
  }
  const out: T[] = [];
  const waiting: T[][] = [];
  const flush = () => { while (out.length % 2 === 0 && waiting.length) out.push(...waiting.shift()!); };
  for (const u of units) {
    if (u.length === 2 && out.length % 2 === 1) { waiting.push(u); continue; }
    out.push(...u);
    flush();
  }
  if (waiting.length) { const last = out.pop()!; flush(); out.push(last); }
  return out;
}

/** True when both photos on a page carry one code → single caption, top right. */
export const samePair = (page: { sku: string }[]): boolean =>
  page.length === 2 && skuKey(page[0].sku) !== '' && skuKey(page[0].sku) === skuKey(page[1].sku);
