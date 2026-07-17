// Parse an uploaded marketplace listing sheet into template fields — the
// header row of the data-entry sheet PLUS each column's dropdown dataset
// (data validations), so generation can be locked to marketplace values.
import * as XLSX from 'xlsx';
import { extractDropdowns } from './validationParse';
import type { ListingTemplateField } from '../../types/database';

// Price-like columns: never AI-written (enforced server-side too). The owner
// fills them via fixed values, pairing, wires or rules; unset exports empty.
export const SENSITIVE_RE = /price|mrp|\bgst\b|\brate\b|cost|amount|margin|commission|\bhsn\b/i;

// Header normalization shared with the edge fn (taught-mapping keys).
export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

// Image-slot columns (same rule as the edge fn): filled with Dropbox links
// in code at zero AI cost, so bulk actions should never skip them.
export const isImageColumn = (h: string) =>
  /(front|side|back|additional)\s*image|image\s*\d|look\s*shot|detail\s*angle/i.test(h) && !/certificate|\bbis\b|document/i.test(h);

export interface ParsedTemplate {
  sheetName: string;
  headerRow: number; // zero-based row index of the header row
  fields: ListingTemplateField[];
  sheetNames: string[]; // all sheets, for the manual override picker
}

// Marketplace sheets often start with instruction/notes rows — the header
// row is the row with the most non-empty cells among the first 10.
function bestHeaderRow(grid: unknown[][]): { idx: number; count: number } {
  let idx = 0, count = 0;
  grid.slice(0, 10).forEach((r, i) => {
    const filled = (r || []).filter(c => String(c ?? '').trim()).length;
    if (filled > count) { count = filled; idx = i; }
  });
  return { idx, count };
}

export async function parseTemplateFile(buf: ArrayBuffer, pickSheet?: string): Promise<ParsedTemplate> {
  const wb = XLSX.read(buf, { type: 'array' });
  // Data-entry sheet = the visible sheet whose header row carries the most
  // labels (dataset/instruction sheets are usually hidden or sparse).
  const visibility = wb.Workbook?.Sheets || [];
  const visible = wb.SheetNames.filter((_, i) => !(visibility[i] as { Hidden?: number } | undefined)?.Hidden);
  const candidates = pickSheet && wb.SheetNames.includes(pickSheet) ? [pickSheet] : (visible.length ? visible : wb.SheetNames);
  let sheetName = candidates[0], headerIdx = 0, best = -1;
  let bestGrid: unknown[][] = [];
  for (const name of candidates) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    const { idx, count } = bestHeaderRow(grid);
    if (count > best) { best = count; sheetName = name; headerIdx = idx; bestGrid = grid; }
  }
  const headerRow = (bestGrid[headerIdx] || []) as unknown[];
  const dropdowns = await extractDropdowns(buf, wb, sheetName);
  const seen = new Set<string>();
  const fields: ListingTemplateField[] = [];
  headerRow.forEach((c, colIdx) => {
    const header = String(c ?? '').trim();
    if (!header || seen.has(header.toLowerCase())) return;
    seen.add(header.toLowerCase());
    const allowed = dropdowns.get(colIdx);
    // A single-value dropdown (e.g. Myntra's articleType = "Lehenga Choli")
    // is a constant: pre-pin it as the fixed value — filled in code, zero AI
    // cost. A "*" in the header is the common mandatory marker.
    fields.push({
      header, mandatory: header.includes('*'), hint: '',
      ...(allowed?.length ? { allowed } : {}),
      ...(allowed?.length === 1 ? { fixed: allowed[0] } : {}),
    });
  });
  return { sheetName, headerRow: headerIdx, fields, sheetNames: wb.SheetNames };
}
