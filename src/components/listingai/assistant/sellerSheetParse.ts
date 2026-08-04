// Generic seller/marketplace sheet parser for the Master Assistant. Any
// xlsx/xls/csv: first sheet, header row = first row with 2+ non-empty cells.
// Hard caps keep the edge payload sane (20000 rows x 30 cols x 120 chars) —
// sized so a full size-variant export (designs x sizes) fits; every cap that
// still trims returns a warning so truncation is never silent. The SKU
// column is identified SERVER-side by matching against the master, so
// nothing here needs to understand the marketplace's format.
import * as XLSX from 'xlsx';

export interface SellerSheet { name: string; headers: string[]; rows: string[][]; totalRows: number; warnings: string[] }

const ROW_CAP = 20000, COL_CAP = 30, CELL_CAP = 120;

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

  const warnings: string[] = [];
  // Column drop is loud: if the SKU or status column sits past the cap the
  // whole comparison would silently be wrong.
  const rawHeader = grid[headerIdx];
  if (rawHeader.length > COL_CAP && rawHeader.slice(COL_CAP).some(c => cellText(c))) {
    const dropped = rawHeader.slice(COL_CAP).map(c => cellText(c)).filter(Boolean);
    warnings.push(`Sheet has ${rawHeader.length} columns — only the first ${COL_CAP} are compared. Dropped: ${dropped.slice(0, 6).join(', ')}${dropped.length > 6 ? ` +${dropped.length - 6} more` : ''}. If the SKU or status column is among these, move it left and re-attach.`);
  }

  // Headerless exports are common ("2901,inactive" as row 1): when most of
  // the would-be header cells are pure numbers, that row is DATA — keep it
  // and synthesize COL 1..N names (the edge auto-detects the SKU column by
  // matching values against the master, so names don't matter).
  let headers = rawHeader.slice(0, COL_CAP).map(h => cellText(h).slice(0, 60));
  const nonEmpty = headers.filter(Boolean);
  const numeric = nonEmpty.filter(h => /^\d+(\.\d+)?$/.test(h));
  const headerless = nonEmpty.length > 0 && numeric.length * 2 >= nonEmpty.length;
  if (headerless) headers = headers.map((_, i) => `COL ${i + 1}`);

  // totalRows counts the NON-BLANK data rows of the whole grid (blank rows
  // used to inflate it, making the trim warning fire falsely / miss by one).
  const rows: string[][] = [];
  let totalRows = 0;
  for (let i = headerIdx + (headerless ? 0 : 1); i < grid.length; i++) {
    const raw = grid[i];
    if (!raw || raw.every(c => cellText(c) === '')) continue;
    totalRows++;
    if (rows.length < ROW_CAP) rows.push(headers.map((_, ci) => cellText(raw[ci]).slice(0, CELL_CAP)));
  }
  if (rows.length === 0) throw new Error('No data rows found under the header row');
  if (totalRows > rows.length) warnings.push(`Sheet has ${totalRows} data rows — only the first ${rows.length} are compared; the rest would wrongly show as "not uploaded". Split the sheet and run it in parts.`);
  return { name, headers, rows, totalRows, warnings };
}
