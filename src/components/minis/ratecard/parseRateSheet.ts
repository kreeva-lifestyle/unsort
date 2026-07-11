// Rate-card Excel parser — header-alias matching (same idiom as the
// attendance ImportExcel) so the owner's sheets work regardless of exact
// header spelling. Only SKU + PRICE are mandatory; other columns render
// only if present in the sheet.
import * as XLSX from 'xlsx';

export type RateRow = Record<string, string>;

export interface ParsedRateSheet {
  rows: RateRow[];
  columns: string[]; // canonical labels, in display order
  stats: { designs: number; avg: number; total: number } | null;
  warnings: string[];
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

// Canonical column label -> accepted header spellings (normalized).
const HEADER_ALIASES: [string, string[]][] = [
  ['SKU', ['sku', 'skuno', 'skucode', 'design', 'designno', 'dno', 'code', 'itemcode', 'style', 'styleno', 'catalogno']],
  ['MAIN COLOR', ['maincolor', 'maincolour', 'color', 'colour']],
  ['FABRIC', ['fabric', 'fabricname', 'material', 'cloth']],
  ['SIZE', ['size', 'sizes', 'sizerange']],
  ['INCLUDES', ['includes', 'include', 'set', 'setincludes', 'contents', 'contains']],
  ['WORK', ['work', 'worktype', 'workdetails', 'embroidery']],
  ['PRICE', ['price', 'rate', 'rateprice', 'mrp', 'amount', 'sellingprice']],
];

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
  const matchCol = (row: unknown[], aliases: string[]) => row.findIndex(c => aliases.includes(norm(c)));
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    if (matchCol(grid[i], HEADER_ALIASES[0][1]) >= 0 && matchCol(grid[i], HEADER_ALIASES[6][1]) >= 0) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('Could not find the header row — the sheet needs at least SKU and PRICE columns');

  const header = grid[headerIdx];
  const colIdx: [string, number][] = [];
  for (const [label, aliases] of HEADER_ALIASES) {
    const idx = matchCol(header, aliases);
    if (idx >= 0) colIdx.push([label, idx]);
  }
  const columns = colIdx.map(([label]) => label);

  const warnings: string[] = [];
  const rows: RateRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const raw = grid[i];
    if (!raw || raw.every(c => cellText(c) === '')) continue;
    const row: RateRow = {};
    for (const [label, idx] of colIdx) row[label] = cellText(raw[idx]);
    if (!row['SKU']) { warnings.push(`Row ${i + 1} skipped — no SKU`); continue; }
    rows.push(row);
  }
  if (rows.length === 0) throw new Error('No design rows found under the header row');

  const prices = rows.map(r => priceNumber(r['PRICE'] || '')).filter((n): n is number => n !== null);
  if (prices.length > 0 && prices.length < rows.length) warnings.push(`${rows.length - prices.length} row(s) have no readable price — totals cover ${prices.length} designs`);
  const total = prices.reduce((a, b) => a + b, 0);
  const stats = prices.length > 0
    ? { designs: rows.length, avg: Math.round(total / prices.length), total: Math.round(total) }
    : { designs: rows.length, avg: 0, total: 0 };

  return { rows, columns, stats, warnings };
}
