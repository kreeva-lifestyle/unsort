// Pure builders for the From-Master rate card: turning fetched master rows +
// the owner's chosen columns into a FinalizedSheet, and grouping rows by
// detected garment category. Kept out of the component so both stay small and
// the logic is unit-testable on its own.
import { finalizeRateRows, FinalizedSheet } from './finalizeRateRows';
import { isPriceHeader } from './parseRateSheet';

const GST_BOUNDARY = 2500; // display formatting only - finalize re-checks the slab

export interface MasterRow { sku: string; found: boolean; category: string | null; categoryLabel: string | null; values: Record<string, string> }

// Build the FinalizedSheet from fetched rows + chosen columns. Bare-number
// prices are formatted to the card's standard "<n>/- +<slab>%(GST)" form;
// cells already carrying GST text keep it (finalize autocorrects a wrong %).
export const buildMasterSheet = (rows: MasterRow[], chosenRaw: string[], withCategory = false): FinalizedSheet => {
  // A column with no value for ANY fetched SKU would render as a full column
  // of "—" and waste card width, so it never reaches the card. (Partly-filled
  // columns DO stay — those gaps are reported as smart-check notes instead.)
  const chosen = chosenRaw.filter(c => rows.some(r => (r.values[c] || '').trim()));
  const dropped = chosenRaw.filter(c => !chosen.includes(c));
  // Mixed-category card (owner's call): instead of blocking, each design is
  // labelled with its category and the rows are grouped so one category's
  // designs sit together — the typed order survives inside each group.
  if (withCategory) {
    const order = categoryGroups(rows).map(g => g.label);
    rows = [...rows].sort((a, b) =>
      (a.categoryLabel ? order.indexOf(a.categoryLabel) : order.length) -
      (b.categoryLabel ? order.indexOf(b.categoryLabel) : order.length));
  }
  const columns = withCategory ? ['SKU', 'CATEGORY', ...chosen] : ['SKU', ...chosen];
  const priceCol = chosen.find(c => isPriceHeader(c)) || null;
  const objRows = rows.map(r => {
    const row: Record<string, string> = withCategory
      ? { SKU: r.sku, CATEGORY: r.categoryLabel || '—' }
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

// Detected categories present on the card, biggest first (undetected rows are
// counted nowhere — only positive evidence groups). More than one group turns
// on the CATEGORY column + grouping above.
export const categoryGroups = (rows: MasterRow[]): { label: string; skus: string[] }[] => {
  const by = new Map<string, { label: string; skus: string[] }>();
  for (const r of rows) {
    if (!r.category) continue;
    const g = by.get(r.category) || { label: r.categoryLabel || r.category, skus: [] };
    g.skus.push(r.sku);
    by.set(r.category, g);
  }
  return [...by.values()].sort((a, b) => b.skus.length - a.skus.length);
};

