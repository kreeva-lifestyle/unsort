// Drop-in replacement for XLSX.writeFile that goes through downloadFile, so
// phone users get the share sheet (Files / WhatsApp / Mail) instead of the
// silent <a download> dead end inside the installed PWA. Same (wb, name)
// signature; book type is inferred from the extension exactly as writeFile
// does (.xls → BIFF8). Resolves false when the user dismissed the share sheet.
import * as XLSX from 'xlsx';
import { downloadFile } from './downloadFile';

const BOOK_TYPE: Record<string, XLSX.BookType> = { xlsx: 'xlsx', xls: 'biff8', csv: 'csv' };
const MIME: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
};

export function saveWorkbook(wb: XLSX.WorkBook, name: string): Promise<boolean> {
  const ext = (name.split('.').pop() || 'xlsx').toLowerCase();
  const out = XLSX.write(wb, { bookType: BOOK_TYPE[ext] || 'xlsx', type: 'array' });
  return downloadFile(new Blob([out], { type: MIME[ext] || 'application/octet-stream' }), name);
}
