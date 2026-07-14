// Bulk SKU → Dropbox links engine, shared by the Excel import and the quick
// paste box. Kept out of the component so the generator stays under the file
// budget. Runs the same server `linkgen` action with 3 concurrent workers.
import * as XLSX from 'xlsx';
import { call, explainGen, GenLink } from './api';
import { friendlyError } from '../../../lib/friendlyError';

export interface BulkRow { sku: string; status: 'pending' | 'ok' | 'error'; message?: string; links: GenLink[] }
export const BULK_CAP = 300;

// Split pasted text (newline / comma / space / semicolon separated) into unique
// uppercase SKUs.
export const parseSkuText = (text: string): string[] =>
  [...new Set(text.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean))];

// Column A of the first worksheet → unique SKUs (drops a header row).
export function parseSkuFile(buf: ArrayBuffer): string[] {
  const wb = XLSX.read(buf, { type: 'array' });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  let skus = grid.map(r => String(r?.[0] ?? '').trim().toUpperCase()).filter(Boolean);
  if (skus.length && /SKU|DESIGN|CODE|STYLE/.test(skus[0])) skus = skus.slice(1);
  return [...new Set(skus)];
}

// Generate links for many SKUs, streaming partial results to `onUpdate` after
// each one so the UI can show live progress.
export async function runBulk(
  skus: string[],
  mode: 'combine' | 'separate',
  onUpdate: (rows: BulkRow[], done: number) => void,
): Promise<BulkRow[]> {
  const rows: BulkRow[] = skus.map(s => ({ sku: s, status: 'pending', links: [] }));
  onUpdate([...rows], 0);
  let cursor = 0, done = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const i = cursor++;
      try {
        const { status, data } = await call({ action: 'linkgen', sku: rows[i].sku, mode });
        if (data.ok) rows[i] = { ...rows[i], status: 'ok', links: (data.links || []).filter((l: GenLink) => l.url), message: data.note };
        else rows[i] = { ...rows[i], status: 'error', message: explainGen(data, status) };
      } catch (e) { rows[i] = { ...rows[i], status: 'error', message: friendlyError(e) }; }
      done++; onUpdate([...rows], done);
    }
  };
  await Promise.all(Array.from({ length: 3 }, () => worker()));
  return rows;
}

// Export bulk results to an xlsx (SKU, STATUS, LINK 1..N).
export function exportBulkXlsx(bulk: BulkRow[]): void {
  const maxLinks = Math.max(1, ...bulk.map(r => r.links.length));
  const header = ['SKU', 'STATUS', ...Array.from({ length: maxLinks }, (_, i) => maxLinks === 1 ? 'LINK' : `LINK ${i + 1}`)];
  const rows = bulk.map(r => [r.sku, r.status === 'ok' ? 'OK' : (r.message || 'Failed'), ...r.links.map(l => l.url)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Dropbox Links');
  XLSX.writeFile(wb, `Dropbox_Links_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
