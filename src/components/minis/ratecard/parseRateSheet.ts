// Rate-card Excel parser. Every non-empty column in the sheet is captured
// with its own header (GOWN FABRIC, DUPATTA FABRIC, SIZE (SEMI STITCHED)…)
// so no detail is dropped — the renderer decides how to lay them out.
// SKU + PRICE are located by alias matching and are the only mandatory ones.
import * as XLSX from 'xlsx';

export type RateRow = Record<string, string>;

export interface ParsedRateSheet {
  rows: RateRow[];
  columns: string[]; // sheet order, uppercased header labels
  skuCol: string;
  priceCol: string | null;
  stats: { designs: number; avg: number; total: number } | null;
  warnings: string[];
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

const SKU_ALIASES = ['sku', 'skuno', 'skucode', 'design', 'designno', 'dno', 'code', 'itemcode', 'style', 'styleno', 'catalogno'];
const PRICE_ALIASES = ['price', 'rate', 'rateprice', 'mrp', 'amount', 'sellingprice'];
// Indian GST slabs for clothing (owner's rule): ≤ ₹2500 → 5%, above → 18%
const GST_BOUNDARY = 2500, GST_HIGH = 18, GST_LOW = 5;

// "3000/- (FLAT) +12%(GST) +SHIPPING." -> 3000 (first number in the cell).
export const priceNumber = (cell: string): number | null => {
  const m = cell.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

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

  // Header row = first row containing an SKU alias and a PRICE alias.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const norms = grid[i].map(norm);
    if (norms.some(n => SKU_ALIASES.includes(n)) && norms.some(n => PRICE_ALIASES.includes(n))) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('Could not find the header row — the sheet needs at least SKU and PRICE columns');

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
  const rows: RateRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const raw = grid[i];
    if (!raw || raw.every(c => cellText(c) === '')) continue;
    const row: RateRow = {};
    for (const [label, idx] of colIdx) row[label] = cellText(raw[idx]);
    if (!row[skuCol]) { warnings.push(`Row ${i + 1} skipped — no SKU`); continue; }
    rows.push(row);
  }
  if (rows.length === 0) throw new Error('No design rows found under the header row');

  // ---- smart checks ----
  // Indian GST on clothing: above ₹2500 → 18%, ₹2500 and below → 5%.
  // A wrong % in the price cell is auto-corrected; the user is told per row.
  if (priceCol) for (const r of rows) {
    const cell = r[priceCol];
    const base = priceNumber(cell);
    if (base === null) { warnings.push(`${r[skuCol]}: no readable price — left as written`); continue; }
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

  const prices = priceCol ? rows.map(r => priceNumber(r[priceCol!] || '')).filter((n): n is number => n !== null) : [];
  const total = prices.reduce((a, b) => a + b, 0);
  const avg = prices.length ? total / prices.length : 0;
  if (prices.length && !Number.isInteger(avg)) warnings.push(`Average rate ₹${avg.toFixed(2)} rounded off to ₹${Math.round(avg)}`);
  const stats = { designs: rows.length, avg: Math.round(avg), total: Math.round(total) };

  return { rows, columns, skuCol, priceCol, stats, warnings };
}
