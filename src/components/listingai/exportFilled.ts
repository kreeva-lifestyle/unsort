// Export generated listings. When the template's original workbook is stored
// (v2), values are injected DIRECTLY into that file's worksheet XML and the
// file is re-zipped byte-for-byte — so styles, column widths, drawings, cell
// comments and every dropdown data-validation survive. (SheetJS CE would strip
// all of that on write, which is why we only READ with it, never writeFile.)
// Falls back to a plain sheet for old templates saved before the file was kept.
import * as XLSX from 'xlsx';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { supabase } from '../../lib/supabase';
import { injectCells, resolveSheetPart, type CellWrite } from './xlsxInject';
import type { GenRow } from './api';
import type { ListingTemplate } from '../../types/database';

type TplRef = Pick<ListingTemplate, 'id' | 'name' | 'file_name' | 'sheet_name' | 'header_row'>;

// What actually happened, so the caller can toast the truth instead of a blind
// "Exported N". `formatted` = injected into the real workbook; `matched`/`total`
// = how many generated columns aligned to the template's header (0 means the
// template's headers no longer match this run — we fell back to a plain sheet
// rather than download an empty formatted file). `hadTemplate` distinguishes a
// deliberate plain export (old fileless template) from a fallback.
export interface ExportResult { formatted: boolean; matched: number; total: number; hadTemplate: boolean }

export async function exportFilledXlsx(headers: string[], rows: GenRow[], tpl: TplRef): Promise<ExportResult> {
  const values = rows.map(r => r.values);
  const hadTemplate = !!(tpl.file_name && tpl.sheet_name);
  if (hadTemplate) {
    try {
      const { data, error } = await supabase.storage.from('listing-templates').download(`${tpl.id}.xlsx`);
      if (!error && data) {
        const buf = await data.arrayBuffer();
        // Read-only: use SheetJS just to locate the header row + column order.
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[tpl.sheet_name!];
        if (ws) {
          const headerRowIdx = tpl.header_row ?? 0;
          // Align each generated column to the sheet's real header positions
          // (the sheet may have gaps or extra columns we must not disturb).
          const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
          const sheetHdr = ((grid[headerRowIdx] || []) as unknown[]).map(h => String(h ?? '').trim().toLowerCase());
          const colFor = headers.map(h => sheetHdr.indexOf(h.trim().toLowerCase()));
          const matched = colFor.filter(c => c >= 0).length;
          // Zero alignment = the stored template's headers no longer match this
          // run (renamed/re-uploaded since). Injecting nothing would download a
          // pristine empty template; fall back to the plain sheet so the data
          // still leaves with the owner, and report it.
          if (matched > 0) {
            const firstDataRow = headerRowIdx + 2; // rows start directly under the header (1-based)
            const writes: CellWrite[] = [];
            values.forEach((vals, i) => {
              vals.forEach((v, j) => {
                const c = colFor[j];
                if (c >= 0 && v != null && String(v) !== '') writes.push({ r: firstDataRow + i, c, v: String(v) });
              });
            });
            // Surgical inject into the worksheet XML, everything else untouched.
            const files = unzipSync(new Uint8Array(buf));
            const part = resolveSheetPart(strFromU8(files['xl/workbook.xml']), strFromU8(files['xl/_rels/workbook.xml.rels']), tpl.sheet_name!);
            if (part && files[part]) {
              files[part] = strToU8(injectCells(strFromU8(files[part]), writes));
              const out = zipSync(files, { level: 6 });
              const url = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
              const a = document.createElement('a');
              a.href = url; a.download = tpl.file_name!; a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              return { formatted: true, matched, total: headers.length, hadTemplate };
            }
          }
        }
      }
    } catch { /* fall through to the plain export below */ }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...values]), 'Listings');
  const safe = (tpl.name || 'Listings').replace(/[^\w-]+/g, '_').slice(0, 40) || 'Listings';
  XLSX.writeFile(wb, `${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  return { formatted: false, matched: 0, total: headers.length, hadTemplate };
}
