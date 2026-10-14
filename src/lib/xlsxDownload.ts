// Drop-in replacement for XLSX.writeFile that goes through downloadFile, so
// phone users get the share sheet (Files / WhatsApp / Mail) instead of the
// silent <a download> dead end inside the installed PWA. Same (wb, name)
// signature; book type is inferred from the extension exactly as writeFile
// does (.xls → BIFF8). Resolves false when the user dismissed the share sheet.
// The library itself is loaded on first use: it is a 415 KB chunk and the
// screens that import this helper must not pay for it until a file is saved.
import type { WorkBook, BookType } from 'xlsx';
import { downloadFile } from './downloadFile';

const BOOK_TYPE: Record<string, BookType> = { xlsx: 'xlsx', xls: 'biff8', csv: 'csv' };
const MIME: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
};

export async function saveWorkbook(wb: WorkBook, name: string): Promise<boolean> {
  const XLSX = await import('xlsx');
  const ext = (name.split('.').pop() || 'xlsx').toLowerCase();
  const out = XLSX.write(wb, { bookType: BOOK_TYPE[ext] || 'xlsx', type: 'array' });
  return downloadFile(new Blob([out], { type: MIME[ext] || 'application/octet-stream' }), name);
}
