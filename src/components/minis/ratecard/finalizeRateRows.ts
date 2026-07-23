// Shared final pass for a rate sheet, whichever way it was built (Excel
// import or the in-app manual editor): GST slab autocorrect, duplicate-SKU
// check, stats — and the all-or-nothing price rule. The price column is
// OPTIONAL: with no price column every price/GST computation is skipped; with
// one present, EVERY row must carry a readable price or generation is blocked
// (blockers, not warnings — a half-priced card must never ship).

export type RateRow = Record<string, string>;

export interface FinalizedSheet {
  rows: RateRow[];
  columns: string[]; // sheet order, uppercased header labels
  skuCol: string;
  priceCol: string | null;
  stats: { designs: number; avg: number; total: number } | null;
  warnings: string[]; // non-blocking notes (GST corrected, dup SKUs, rounding)
  blockers: string[]; // non-empty => Generate is blocked
}

// Indian GST slabs for clothing (owner's rule): ≤ ₹2500 → 5%, above → 18%
const GST_BOUNDARY = 2500, GST_HIGH = 18, GST_LOW = 5;

// "3000/- (FLAT) +12%(GST) +SHIPPING." -> 3000 (first number in the cell).
export const priceNumber = (cell: string): number | null => {
  const m = cell.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function finalizeRateRows(rows: RateRow[], columns: string[], skuCol: string, priceCol: string | null): FinalizedSheet {
  const warnings: string[] = [];
  const blockers: string[] = [];

  // All-or-nothing price rule. On a miss the GST/stats passes are skipped —
  // never correct or summarise a sheet that can't ship.
  const unpriced = priceCol ? rows.filter(r => priceNumber(r[priceCol] || '') === null).map(r => r[skuCol]) : [];
  if (unpriced.length > 0) {
    const shown = unpriced.slice(0, 8).join(', ') + (unpriced.length > 8 ? ` … +${unpriced.length - 8} more` : '');
    blockers.push(`No readable price for ${shown} — fill every price, or remove the ${priceCol} column to make a price-less card`);
  }

  // GST slab autocorrect: a wrong % in the price cell is fixed in place and
  // the owner is told per row.
  if (priceCol && blockers.length === 0) for (const r of rows) {
    const cell = r[priceCol];
    const base = priceNumber(cell);
    if (base === null) continue; // unreachable (blocked above); belt & braces
    const expected = base > GST_BOUNDARY ? GST_HIGH : GST_LOW;
    const m = cell.match(/\d{1,2}(?:\.\d+)?\s*%\s*\(?\s*GST\s*\)?/i);
    if (!m) { warnings.push(`${r[skuCol]}: no GST % in price — expected +${expected}%(GST) for ₹${base}`); continue; }
    const found = parseFloat(m[0]);
    if (found !== expected) {
      r[priceCol] = cell.replace(m[0], m[0].replace(/\d{1,2}(?:\.\d+)?/, String(expected)));
      warnings.push(`${r[skuCol]}: GST corrected ${found}% → ${expected}% (₹${base} is ${base > GST_BOUNDARY ? 'above' : 'not above'} ₹${GST_BOUNDARY})`);
    }
  }

  const dup = new Map<string, number>();
  rows.forEach(r => dup.set(r[skuCol], (dup.get(r[skuCol]) || 0) + 1));
  for (const [sku, n] of dup) if (n > 1) warnings.push(`SKU ${sku} appears ${n} times — check for duplicates`);

  // total stays 0 with no (or blocked) prices, so the renderer's existing
  // `stats.total > 0` guards naturally drop the money chips.
  const prices = priceCol && blockers.length === 0
    ? rows.map(r => priceNumber(r[priceCol] || '')).filter((n): n is number => n !== null) : [];
  const total = prices.reduce((a, b) => a + b, 0);
  const avg = prices.length ? total / prices.length : 0;
  if (prices.length && !Number.isInteger(avg)) warnings.push(`Average rate ₹${avg.toFixed(2)} rounded off to ₹${Math.round(avg)}`);
  const stats = { designs: rows.length, avg: Math.round(avg), total: Math.round(total) };

  return { rows, columns, skuCol, priceCol, stats, warnings, blockers };
}
