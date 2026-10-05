// Product-costing photo thumbnails. The list draws each photo at 56 px, but
// the stored photo is a 1200 px JPEG (150–360 KB): sixteen cards pulled
// ~4 MB from the bucket to paint sixteen tiles (owner: "images load too
// slow"). Every photo now gets a 112 px square companion at
// thumbs/<file> (~4 KB) made on the device at upload — no server work, no
// image-transform plan, no extra DB column (the thumb URL is derived from
// image_url). The list shows the thumb; if one is missing (photos from
// before this existed) CostingThumb falls back to the full photo and asks
// backfillThumb to build it once, at most two at a time, so the next visit
// is fast and nothing is hammered.
import { supabase } from '../../../lib/supabase';
import { optimizeImage } from './imageResize';
import { logSwallowed } from '../../../lib/errorLogger';
import { loadForCanvas } from './costingShare';

const BUCKET = 'costing-images';
export const THUMB_PX = 112; // the 56 px tile at 2×

/** thumbs/<file> next to the photo, keeping the ?v= cache-buster so a
 *  replaced photo gets a fresh thumb URL too. null for a non-bucket URL. */
export const thumbUrl = (imageUrl: string | null | undefined): string | null => {
  if (!imageUrl) return null;
  const m = imageUrl.match(/^(.*\/costing-images\/)([^/?#]+)(\?.*)?$/);
  return m ? `${m[1]}thumbs/${m[2]}${m[3] || ''}` : null;
};
const fileName = (imageUrl: string): string | null => imageUrl.match(/\/costing-images\/([^/?#]+)/)?.[1] ?? null;

/** Centre-cropped square JPEG of THUMB_PX. */
export async function makeThumb(src: Blob | HTMLImageElement): Promise<Blob> {
  const bmp = src instanceof Blob ? await createImageBitmap(src) : src;
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width, h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  const s = Math.max(1, Math.min(w, h));
  const c = document.createElement('canvas'); c.width = THUMB_PX; c.height = THUMB_PX;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (w - s) / 2, (h - s) / 2, s, s, 0, 0, THUMB_PX, THUMB_PX);
  if ('close' in bmp) bmp.close();
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not make the thumbnail'))), 'image/jpeg', 0.8));
}

async function uploadThumb(name: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(`thumbs/${name}`, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
  if (error) throw error;
}

/** Resize + upload the product photo AND its thumb; returns the
 *  cache-busted public URL to store in image_url. The thumb is
 *  best-effort: a missing one costs one slow tile, never the save. */
export async function uploadProductPhoto(costingId: string, file: File): Promise<string> {
  const { blob, type } = await optimizeImage(file);
  const name = `${costingId}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, blob, { contentType: type, upsert: true, cacheControl: '31536000' });
  if (error) throw error;
  try { await uploadThumb(name, await makeThumb(blob)); } catch (e) { logSwallowed('Costing thumb upload', e); }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(name);
  // A year of caching is safe: ?v= gives every replacement a new URL.
  return `${data.publicUrl}?v=${Date.now()}`;
}

// ── Backfill for photos uploaded before thumbs existed ─────────────────────
// Tried once per file per page session, two at a time: the full photo is
// loaded with CORS, cropped on the device and stored. Failures are logged,
// never shown — the card already shows the full photo.
const tried = new Set<string>();
const queue: (() => Promise<void>)[] = [];
let running = 0;
const pump = () => {
  while (running < 2 && queue.length) {
    running++;
    queue.shift()!().catch(e => logSwallowed('Costing thumb backfill', e)).finally(() => { running--; pump(); });
  }
};
export function backfillThumb(imageUrl: string): void {
  const name = fileName(imageUrl);
  if (!name || tried.has(name)) return;
  tried.add(name);
  queue.push(async () => {
    const img = await loadForCanvas(imageUrl);
    if (!img) return;
    await uploadThumb(name, await makeThumb(img));
  });
  pump();
}
