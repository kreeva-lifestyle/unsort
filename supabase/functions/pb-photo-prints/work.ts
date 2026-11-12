// One call = ONE waiting photo: claim it, download it, work out its print,
// hand the answer back (pb_photo_put pairs it with the photos already
// printed). One photo a call on purpose: an edge function gets 2 seconds of
// CPU per request and decoding a large JPEG takes most of a second, so each
// photo has the whole allowance to itself; pg_cron sends several calls a
// minute while photos are waiting (trigger_pb_photo_prints).
// A photo that cannot be printed is answered with the reason and never asked
// again; one whose download fails, or whose call is cut off, stays claimed
// and is handed out again 10 minutes later (three times at most).
import { jpegSize, printOf } from './print.ts';

export type Decode = (bytes: Uint8Array) => { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
export interface Claimed { image_id: string; product_id: string; path: string; bytes: number | null }
export interface Answer { image: string; print: string | null; detail: number | null; width: number | null; height: number | null; note: string | null }
export interface Deps {
  claim: () => Promise<Claimed | null>;
  put: (a: Answer) => Promise<number>;
  /** The photo's bytes; null when the file is too large to read. A failed download throws. */
  download: (path: string) => Promise<Uint8Array | null>;
  decode: Decode;
  now: () => number;
}

export const MAX_BYTES = 12_000_000; // the bucket takes 15 MB; a file this big would not decode in time
export const MAX_PIXELS = 6_000_000; // about 2000 × 3000: the largest photo that decodes inside the CPU limit
export const MIN_DETAIL = 5;         // below this the picture is blank, or nearly: its print says nothing

export interface Result { state: 'idle' | 'done' | 'skipped'; image?: string; paired?: number; note?: string; pixels?: number; read_ms?: number }

/** The print of one downloaded photo, or why it has none. */
export function readPhoto(path: string, bytes: Uint8Array, decode: Decode, now: () => number): Omit<Answer, 'image'> & { ms: number } {
  const none = (note: string, w: number | null = null, h: number | null = null) => ({ print: null, detail: null, width: w, height: h, note, ms: 0 });
  const size = jpegSize(bytes);
  if (!size) return none(/\.(png|webp)$/i.test(path) ? 'Only JPEG photos are checked.' : 'The file is not a JPEG photo.');
  if (size.w * size.h > MAX_PIXELS) return none('The photo is too large to check.', size.w, size.h);
  const t = now();
  try {
    const d = decode(bytes);
    const p = printOf(d.data, d.width, d.height);
    const ms = Math.round(now() - t);
    if (p.detail < MIN_DETAIL) return { print: null, detail: p.detail, width: d.width, height: d.height, note: 'The picture is too plain to tell apart.', ms };
    return { print: p.hex, detail: p.detail, width: d.width, height: d.height, note: null, ms };
  } catch (e) {
    return { ...none(`The photo could not be opened (${String(e instanceof Error ? e.message : e).slice(0, 80)}).`, size.w, size.h), ms: Math.round(now() - t) };
  }
}

export async function runOne(d: Deps): Promise<Result> {
  const img = await d.claim();
  if (!img) return { state: 'idle' };
  // A failed download throws: the photo stays claimed and is tried again later.
  const bytes = img.bytes !== null && img.bytes > MAX_BYTES ? null : await d.download(img.path);
  if (!bytes) {
    const note = 'The file is too large to check.';
    await d.put({ image: img.image_id, print: null, detail: null, width: null, height: null, note });
    return { state: 'skipped', image: img.image_id, note };
  }
  const r = readPhoto(img.path, bytes, d.decode, d.now);
  const paired = await d.put({ image: img.image_id, print: r.print, detail: r.detail, width: r.width, height: r.height, note: r.note });
  return {
    state: r.print ? 'done' : 'skipped', image: img.image_id, paired, ...(r.note ? { note: r.note } : {}),
    ...(r.width && r.height ? { pixels: r.width * r.height } : {}), read_ms: r.ms,
  };
}
