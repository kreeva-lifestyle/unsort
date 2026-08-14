// Pure builders for the From-Master rate card: turning fetched master rows +
// the owner's chosen columns into a FinalizedSheet, and grouping rows by
// detected garment category. Kept out of the component so both stay small and
// the logic is unit-testable on its own.
import { finalizeRateRows, FinalizedSheet } from './finalizeRateRows';
import { isPriceHeader } from './parseRateSheet';

const GST_BOUNDARY = 2500; // display formatting only - finalize re-checks the slab

export interface MasterRow { sku: string; found: boolean; category: string | null; categoryLabel: string | null; values: Record<string, string> }

// The category shown on the card. The MASTER SHEET'S own category column wins
// — the owner curates it, and the server's keyword detection reads the whole
// row text, where a CO-ORDS set whose description mentions palazzo pants
// detects as "Palazzo Set". Detection is only the fallback for rows whose
// category cell is empty. (Server headers arrive uppercased.)
export const displayCategory = (r: MasterRow): string | null => {
  const k = Object.keys(r.values).find(h => /category/i.test(h));
  return (k && r.values[k].trim()) || r.categoryLabel || null;
};

// Build the FinalizedSheet from fetched rows + chosen columns. Bare-number
// prices are formatted to the card's standard "<n>/- +<slab>%(GST)" form;
// cells already carrying GST text keep it (finalize autocorrects a wrong %).
export const buildMasterSheet = (rows: MasterRow[], chosenRaw: string[], withCategory = false): FinalizedSheet => {
  // A column with no value for ANY fetched SKU would render as a full column
  // of "—" and waste card width, so it never reaches the card. (Partly-filled
  // columns DO stay — those gaps are reported as smart-check notes instead.)
  let chosen = chosenRaw.filter(c => rows.some(r => (r.values[c] || '').trim()));
  // Mixed-category card (owner's call): instead of blocking, each design is
  // labelled with its category and the rows are grouped so one category's
  // designs sit together — the typed order survives inside each group. The
  // auto column replaces a hand-picked master CATEGORY column (same data,
  // never two columns saying CATEGORY).
  if (withCategory) {
    chosen = chosen.filter(c => c !== 'CATEGORY');
    const order = categoryGroups(rows).map(g => g.label.toUpperCase());
    const pos = (r: MasterRow) => { const l = displayCategory(r); return l ? order.indexOf(l.toUpperCase()) : order.length; };
    rows = [...rows].sort((a, b) => pos(a) - pos(b));
  }
  const dropped = chosenRaw.filter(c => !chosen.includes(c) && !(withCategory && c === 'CATEGORY'));
  const columns = withCategory ? ['SKU', 'CATEGORY', ...chosen] : ['SKU', ...chosen];
  const priceCol = chosen.find(c => isPriceHeader(c)) || null;
  const objRows = rows.map(r => {
    const row: Record<string, string> = withCategory
      ? { SKU: r.sku, CATEGORY: displayCategory(r) || '—' }
      : { SKU: r.sku };
    for (const c of chosen) {
      let v = r.values[c] || '';
      // The two master tabs may spell the price header differently ("PRICE"
      // vs "RATE"). The card keeps ONE price column, so a row whose price
      // lives under the other spelling falls back to any price-like key —
      // otherwise a fully-priced cross-tab card hits the missing-price
      // blocker for no real reason.
      if (c === priceCol && !v) v = Object.entries(r.values).find(([k]) => isPriceHeader(k))?.[1] || '';
      if (c === priceCol && /^\d+(?:\.\d+)?$/.test(v)) v = `${v}/- +${Number(v) > GST_BOUNDARY ? 18 : 5}%(GST)`;
      row[c] = v;
    }
    return row;
  });
  const sheet = finalizeRateRows(objRows, columns, 'SKU', priceCol);
  if (dropped.length) sheet.warnings.push(`Left off the card (no data in the master for these SKUs): ${dropped.join(', ')}`);
  return sheet;
};

// Categories present on the card, biggest first, keyed by the same label the
// card shows (master column first, detection as fallback — a row with no
// category anywhere is counted nowhere). More than one group turns on the
// CATEGORY column + grouping above.
export const categoryGroups = (rows: MasterRow[]): { label: string; skus: string[] }[] => {
  const by = new Map<string, { label: string; skus: string[] }>();
  for (const r of rows) {
    const label = displayCategory(r);
    if (!label) continue;
    const key = label.toUpperCase();
    const g = by.get(key) || { label, skus: [] };
    g.skus.push(r.sku);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => b.skus.length - a.skus.length);
};

