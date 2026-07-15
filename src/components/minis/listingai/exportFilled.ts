// Export generated listings. When the template's original workbook is stored
// (v2), the rows are written INTO that file — same file name, same sheets
// (instructions + hidden datasets included), values placed under the real
// header row in the correct columns. Falls back to a plain sheet for old
// templates saved before the file was kept.
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import type { GenRow } from './api';
import type { ListingTemplate } from '../../../types/database';

type TplRef = Pick<ListingTemplate, 'id' | 'name' | 'file_name' | 'sheet_name' | 'header_row'>;

export async function exportFilledXlsx(headers: string[], rows: GenRow[], tpl: TplRef): Promise<void> {
  const values = rows.map(r => r.values);
  if (tpl.file_name && tpl.sheet_name) {
    try {
      const { data, error } = await supabase.storage.from('listing-templates').download(`${tpl.id}.xlsx`);
      if (!error && data) {
        const wb = XLSX.read(await data.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[tpl.sheet_name];
        if (ws) {
          const headerRowIdx = tpl.header_row ?? 0;
          // Align each generated column to the sheet's real header positions
          // (the sheet may have gaps or extra columns we must not disturb).
          const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
          const sheetHdr = ((grid[headerRowIdx] || []) as unknown[]).map(h => String(h ?? '').trim().toLowerCase());
          const colFor = headers.map(h => sheetHdr.indexOf(h.trim().toLowerCase()));
          const aoa = values.map(vals => {
            const row: (string | null)[] = [];
            vals.forEach((v, i) => { const c = colFor[i]; if (c >= 0) row[c] = v; });
            return row; // sparse — sheet_add_aoa skips empty slots
          });
          XLSX.utils.sheet_add_aoa(ws, aoa, { origin: { r: headerRowIdx + 1, c: 0 } });
          XLSX.writeFile(wb, tpl.file_name);
          return;
        }
      }
    } catch { /* fall through to the plain export below */ }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...values]), 'Listings');
  const safe = (tpl.name || 'Listings').replace(/[^\w-]+/g, '_').slice(0, 40) || 'Listings';
  XLSX.writeFile(wb, `${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
