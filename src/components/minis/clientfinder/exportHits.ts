// Excel export for Client Finder results. Same shape as the Dropbox Link
// Generator's export (bulk.ts:55) so downloads across the app stay consistent.
import * as XLSX from 'xlsx';
import { saveWorkbook } from '../../../lib/xlsxDownload';
import { exportName, fileDate } from '../../../lib/exportName';
import { kindLabel, type Hit } from './api';

export function exportHitsXlsx(hits: Hit[], subject: string, bestGuess?: string | null): void {
  const header = ['Website', 'Match', 'Width', 'Height', 'Megapixels', 'File size (KB)', 'Page title', 'URL', 'Image URL'];
  // Numbers stay numbers so the sheet can be re-sorted on them. Unmeasured
  // cells are left BLANK rather than 0 — a zero would sort as "tiny" and read
  // as fact, when all it means is the host would not tell us.
  const rows = hits.map(h => [
    h.domain,
    kindLabel[h.match_kind],
    h.width ?? '',
    h.height ?? '',
    h.width && h.height ? Number(((h.width * h.height) / 1e6).toFixed(2)) : '',
    h.bytes ? Math.round(h.bytes / 1024) : '',
    h.page_title || '',
    h.url,
    h.image_url || '',
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // Without widths every column collapses to ~8 chars and the URLs are
  // unreadable without manual resizing on the other end.
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 60 }, { wch: 70 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Client Finder');
  saveWorkbook(wb, exportName('Client-Finder', [subject, bestGuess || '', fileDate()], 'xlsx'));
}
