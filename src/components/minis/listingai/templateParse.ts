// Parse an uploaded marketplace listing sheet into template fields.
// Only the header row matters — the marketplace's column layout IS the
// template; values are generated later per SKU.
import * as XLSX from 'xlsx';
import type { ListingTemplateField } from '../../../types/database';

// Columns the module always leaves blank. Mirrors the server-side rule in the
// listing-ai edge function — shown in the UI so the owner knows why.
export const SENSITIVE_RE = /price|mrp|\bgst\b|\brate\b|cost|amount|margin|commission|\bhsn\b/i;

export function parseTemplateFile(buf: ArrayBuffer): ListingTemplateField[] {
  const wb = XLSX.read(buf, { type: 'array' });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  // Marketplace sheets often start with instruction/notes rows — take the row
  // with the most non-empty cells among the first 10 as the header row.
  let headerRow: unknown[] = [];
  let best = 0;
  for (const r of grid.slice(0, 10)) {
    const filled = (r || []).filter(c => String(c ?? '').trim()).length;
    if (filled > best) { best = filled; headerRow = r; }
  }
  const seen = new Set<string>();
  const fields: ListingTemplateField[] = [];
  for (const c of headerRow) {
    const header = String(c ?? '').trim();
    if (!header || seen.has(header.toLowerCase())) continue;
    seen.add(header.toLowerCase());
    // A "*" in the header is the common mandatory marker on seller sheets.
    fields.push({ header, mandatory: header.includes('*'), hint: '' });
  }
  return fields;
}
