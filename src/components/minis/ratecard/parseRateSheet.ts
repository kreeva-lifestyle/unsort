// Rate-card Excel parser. Every non-empty column in the sheet is captured
// with its own header (GOWN FABRIC, DUPATTA FABRIC, SIZE (SEMI STITCHED)…)
// so no detail is dropped — the renderer decides how to lay them out.
// SKU is the ONLY mandatory column; PRICE is optional (a sheet without one
// makes a price-less card — see finalizeRateRows for the all-or-nothing
// rule when a price column IS present).
import * as XLSX from 'xlsx';
import { finalizeRateRows, FinalizedSheet } from './finalizeRateRows';

export type { RateRow } from './finalizeRateRows'; // renderRateCard imports it from here
export { priceNumber } from './finalizeRateRows';

export type ParsedRateSheet = FinalizedSheet;

export const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

export const SKU_ALIASES = ['sku', 'skuno', 'skucode', 'design', 'designno', 'dno', 'code', 'itemcode', 'style', 'styleno', 'catalogno'];
export const PRICE_ALIASES = ['price', 'rate', 'rateprice', 'mrp', 'amount', 'sellingprice'];

const cellText = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return String(v).trim();
};

export function parseRateSheet(data: ArrayBuffer): ParsedRateSheet {
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('The file has no sheets');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  // Header row = first row containing an SKU alias (price is optional).
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    if (grid[i].map(norm).some(n => SKU_ALIASES.includes(n))) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('Could not find the header row — the sheet needs at least an SKU column');

  // Every non-empty header becomes a column (sheet order, uppercased).
  const header = grid[headerIdx];
  const columns: string[] = [];
  const colIdx: [string, number][] = [];
  let skuCol = '', priceCol: string | null = null;
  header.forEach((h, idx) => {
    const raw = cellText(h);
    if (!raw) return;
    let label = raw.toUpperCase();
    while (columns.includes(label)) label += ' ·'; // duplicate header — keep both
    columns.push(label);
    colIdx.push([label, idx]);
    const n = norm(raw);
    if (!skuCol && SKU_ALIASES.includes(n)) skuCol = label;
    if (!priceCol && PRICE_ALIASES.includes(n)) priceCol = label;
  });
  if (!skuCol) throw new Error('Could not find the SKU column');

  const warnings: string[] = [];
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const raw = grid[i];
    if (!raw || raw.every(c => cellText(c) === '')) continue;
    const row: Record<string, string> = {};
    for (const [label, idx] of colIdx) row[label] = cellText(raw[idx]);
    if (!row[skuCol]) { warnings.push(`Row ${i + 1} skipped — no SKU`); continue; }
    rows.push(row);
  }
  if (rows.length === 0) throw new Error('No design rows found under the header row');

  const out = finalizeRateRows(rows, columns, skuCol, priceCol);
  out.warnings.unshift(...warnings); // row-skip notes first — they explain the count
  return out;
}
