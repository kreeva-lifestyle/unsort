// Photo pipeline for the Index maker. Phone photos are 3–8 MB each and the
// editor used to hand the raw files to <img> tags — the browser decoded
// every 12-megapixel file just to draw a 130 px card, which is what made
// the editor crawl with a dozen photos. Now: one decode per photo when it
// is added → a 320 px JPEG thumbnail for the editor (and the photo's real
// size), and at Generate the browser decodes straight to the tile size
// (createImageBitmap resize options — a JPEG DCT-scaled decode in Chrome,
// several times faster than a full decode) a few photos at a time.
import type { IndexSource } from './renderIndex';

export const THUMB_EDGE = 320;
/** Long edge for the drawn tile: 1.5× the 400×600 tile so cover-crops stay sharp. */
export const RENDER_EDGE = 900;

export interface PhotoMeta { thumb: string; w: number; h: number }

export async function makeThumb(file: File): Promise<PhotoMeta> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, THUMB_EDGE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const meta = { w: bmp.width, h: bmp.height };
  bmp.close();
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.8));
  if (!blob) throw new Error('Could not read that photo');
  return { thumb: URL.createObjectURL(blob), ...meta };
}

/** Decode a photo at (about) tile size. Falls back to a full decode + canvas
 *  downscale where resize options are unsupported. */
export async function decodeForRender(file: File, w: number, h: number): Promise<IndexSource> {
  const s = Math.min(1, RENDER_EDGE / Math.max(w, h, 1));
  if (w > 0 && h > 0) {
    try {
      return await createImageBitmap(file, { resizeWidth: Math.max(1, Math.round(w * s)), resizeHeight: Math.max(1, Math.round(h * s)), resizeQuality: 'medium' });
    } catch { /* fall through */ }
  }
  const bmp = await createImageBitmap(file);
  const s2 = Math.min(1, RENDER_EDGE / Math.max(bmp.width, bmp.height));
  if (s2 === 1) return bmp;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s2); c.height = Math.round(bmp.height * s2);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/** Promise.all with a concurrency cap — decoding forty photos at once
 *  spikes memory on a phone; three or four at a time keeps it flat. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>, onEach?: (done: number) => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      onEach?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
