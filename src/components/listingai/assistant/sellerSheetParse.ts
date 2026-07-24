// Generic seller/marketplace sheet parser for the Master Assistant. Any
// xlsx/xls/csv: first sheet, header row = first row with 2+ non-empty cells.
// Hard caps keep the edge payload sane (4000 rows x 30 cols x 120 chars);
// the SKU column is identified SERVER-side by matching against the master,
// so nothing here needs to understand the marketplace's format.
import * as XLSX from 'xlsx';

export interface SellerSheet { name: string; headers: string[]; rows: string[][]; totalRows: number }

const ROW_CAP = 4000, COL_CAP = 30, CELL_CAP = 120;

const cellText = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return String(v).trim();
};

export function parseSellerSheet(data: ArrayBuffer, name: string): SellerSheet {
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('The file has no sheets');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    if (grid[i].filter(c => cellText(c)).length >= 2) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('Could not find a header row in that sheet');

  const headers = grid[headerIdx].slice(0, COL_CAP).map(h => cellText(h).slice(0, 60));
  const rows: string[][] = [];
  for (let i = headerIdx + 1; i < grid.length && rows.length < ROW_CAP; i++) {
    const raw = grid[i];
    if (!raw || raw.every(c => cellText(c) === '')) continue;
    rows.push(headers.map((_, ci) => cellText(raw[ci]).slice(0, CELL_CAP)));
  }
  if (rows.length === 0) throw new Error('No data rows found under the header row');
  const totalRows = grid.length - headerIdx - 1;
  return { name, headers, rows, totalRows };
}
