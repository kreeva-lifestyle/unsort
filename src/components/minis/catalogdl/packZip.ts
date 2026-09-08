// Builds the vendor pack in the browser: every ACTIVE SKU folder's zip
// (Dropbox makes those) is unpacked and its files re-added under
// "<SKU folder>/…" into one store-only zip — photos are already compressed,
// so nothing is deflated twice. Pure apart from the injected fetcher, so a
// harness can drive it with zips made by fflate itself.
import { Zip, ZipPassThrough, unzipSync } from 'fflate';

export interface PackItem { name: string; path: string; bytes: number }
export interface PackProgress { done: number; total: number; bytes: number; current: string | null }
export type ZipFetcher = (path: string, signal: AbortSignal, onBytes: (n: number) => void) => Promise<Uint8Array>;

/** Dropbox zips carry the folder as the first path segment; whatever it is,
 *  the entry lands under the sub-folder's own name. */
export const entryName = (folder: string, raw: string): string | null => {
  const clean = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.endsWith('/')) return null;
  const rel = clean.includes('/') ? clean.slice(clean.indexOf('/') + 1) : clean;
  if (!rel || rel.split('/').some(s => s === '..')) return null;
  return `${folder}/${rel}`;
};

export async function buildPack(items: PackItem[], fetchZip: ZipFetcher, onProgress: (p: PackProgress) => void, signal: AbortSignal): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  let finish!: (b: Blob) => void; let abort!: (e: Error) => void;
  const done = new Promise<Blob>((res, rej) => { finish = res; abort = rej; });
  const zip = new Zip((err, chunk, final) => {
    if (err) { abort(err); return; }
    chunks.push(chunk);
    if (final) finish(new Blob(chunks as BlobPart[], { type: 'application/zip' }));
  });
  const prog: PackProgress = { done: 0, total: items.length, bytes: 0, current: null };
  const tick = () => onProgress({ ...prog });
  const bump = (n: number) => { prog.bytes += n; tick(); };
  try {
    // Prefetch the next folder while the current one is being repacked.
    let next: Promise<Uint8Array> | null = items.length ? fetchZip(items[0].path, signal, bump) : null;
    for (let i = 0; i < items.length; i++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      prog.current = items[i].name; tick();
      const bytes = await next!;
      next = i + 1 < items.length ? fetchZip(items[i + 1].path, signal, bump) : null;
      const files = unzipSync(bytes);
      for (const [raw, data] of Object.entries(files)) {
        const name = entryName(items[i].name, raw);
        if (!name || data.length === 0) continue;
        const f = new ZipPassThrough(name);
        zip.add(f); f.push(data, true);
      }
      prog.done = i + 1; tick();
    }
    prog.current = null; tick();
    zip.end();
    return await done;
  } catch (e) {
    zip.terminate();
    throw e;
  }
}

export const mb = (bytes: number) => bytes >= 1024 * 1024 * 100 ? `${Math.round(bytes / 1048576)} MB` : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
