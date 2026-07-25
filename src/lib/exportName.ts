// One place that names every file the app hands to a human — downloads
// (CSV/XLSX/JPG/PNG) and "Save as PDF" titles alike.
//
// Shape: Arya-<Document>-<what it is about>-<date>.<ext>
//   Arya-Cash-Challan-105-Rahul-Textiles.pdf
//   Arya-CashBook-Expenses-2026-07-01-to-2026-07-25.csv
//   Arya-Payslip-Ramesh-Patel-July-2026.pdf
//
// Why it matters: these land in customers', sellers' and vendors' Downloads
// folders next to hundreds of other files. "export.xlsx" or "order-preview
// (3).xlsx" tells nobody anything a week later.
const BRAND = 'Arya';

// Filename-safe: keep letters/digits/dash, turn everything else into single
// dashes. Accents and non-Latin scripts are preserved (modern OSes and
// WhatsApp handle them); only characters that break file systems go.
export const fileSafe = (v: unknown, max = 40): string =>
  String(v ?? '')
    .replace(/[\\/:*?"<>|#%&{}$!'`+=@]+/g, ' ')
    .replace(/[\s_.]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');

// Today in IST as YYYY-MM-DD. This is an India-time business: a UTC date
// stamps the previous day for anything exported before 05:30 IST.
export const fileDate = (d?: Date | string | number): string => {
  const dt = d === undefined ? new Date() : d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  try { return dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }
  catch { return new Date(dt.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10); }
};

// "01 Jul 2026 to 25 Jul 2026" ranges compress to "2026-07-01-to-2026-07-25";
// a half-open range keeps the side that exists, and no range at all falls back
// to today so the file still says when it was taken.
export const fileRange = (from?: string, to?: string): string => {
  const a = from ? fileDate(from) : '';
  const b = to ? fileDate(to) : '';
  if (a && b) return a === b ? a : `${a}-to-${b}`;
  if (a) return `from-${a}`;
  if (b) return `upto-${b}`;
  return fileDate();
};

// Base name, no extension — use for <title> in printed documents, where the
// browser appends .pdf itself.
export const docTitle = (doc: string, ...bits: unknown[]): string =>
  [BRAND, doc, ...bits]
    .map(b => fileSafe(b))
    .filter(Boolean)
    .join('-')
    .slice(0, 120);

// Full filename for a real download.
export const exportName = (doc: string, bits: unknown[], ext: string): string =>
  `${docTitle(doc, ...bits)}.${ext.replace(/^\./, '')}`;
