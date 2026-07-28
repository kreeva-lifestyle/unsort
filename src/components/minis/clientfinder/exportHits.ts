// Excel export for Client Finder results. Same shape as the Dropbox Link
// Generator's export (bulk.ts:55) so downloads across the app stay consistent.
import * as XLSX from 'xlsx';
import { exportName, fileDate } from '../../../lib/exportName';
import { kindLabel, type Hit } from './api';

export function exportHitsXlsx(hits: Hit[], subject: string, bestGuess?: string | null): void {
  const header = ['Website', 'Match', 'Page title', 'URL'];
  const rows = hits.map(h => [h.domain, kindLabel[h.match_kind], h.page_title || '', h.url]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // Without widths every column collapses to ~8 chars and the URLs are
  // unreadable without manual resizing on the other end.
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 60 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Client Finder');
  XLSX.writeFile(wb, exportName('Client-Finder', [subject, bestGuess || '', fileDate()], 'xlsx'));
}
