// One call = a small batch of waiting photos, one after the other: claim a
// photo, download it, work out its print, hand the answer back (pb_photo_put
// pairs it with the photos already printed), then the next — until the batch
// has used its share of the call's CPU. An edge function gets 2 seconds of
// CPU per request; reading a photo's block averages takes 20–50 ms for the
// 15–20 megapixel originals kept here and well under a second for the largest
// file the bucket takes, so the batch stops claiming after 400 ms of reading:
// even a worst-case last photo ends far inside the limit. pg_cron sends
// several calls a minute while photos are waiting (trigger_pb_photo_prints).
// A photo that cannot be printed is answered with the reason and never asked
// again; one whose download fails, or whose call is cut off, stays claimed
// and is handed out again 10 minutes later (three times at most).
import { JpegError, readDc } from './jpegDc.ts';
import { gridOf, printOf, turned } from './print.ts';

export interface Claimed { image_id: string; product_id: string; path: string; bytes: number | null }
export interface Answer { image: string; print: string | null; detail: number | null; width: number | null; height: number | null; note: string | null }
export interface Deps {
  claim: () => Promise<Claimed | null>;
  put: (a: Answer) => Promise<number>;
  /** The photo's bytes; null when the file is too large to read. A failed download throws. */
  download: (path: string) => Promise<Uint8Array | null>;
  now: () => number;
}

export const MAX_BYTES = 15_000_000; // what the bucket takes
export const MIN_BLOCKS = 32;        // a photo under 256 px a side has too little in it to compare
export const MIN_DETAIL = 5;         // below this the picture is blank, or nearly: its print says nothing

export interface Result { state: 'idle' | 'done' | 'skipped'; image?: string; paired?: number; note?: string; pixels?: number; bytes?: number; read_ms?: number }

/** The print of one downloaded photo, or why it has none. */
export function readPhoto(path: string, bytes: Uint8Array, now: () => number): Omit<Answer, 'image'> & { ms: number } {
  const t = now();
  const none = (note: string, w: number | null = null, h: number | null = null, detail: number | null = null) =>
    ({ print: null, detail, width: w, height: h, note, ms: Math.round(now() - t) });
  try {
    const d = readDc(bytes);
    if (d.bw < MIN_BLOCKS || d.bh < MIN_BLOCKS) return none('The photo is too small to check.', d.width, d.height);
    const p = printOf(turned(gridOf(d.luma, d.bw, d.bh, d.width, d.height, d.unitX, d.unitY), d.orientation));
    if (p.detail < MIN_DETAIL) return none('The picture is too plain to tell apart.', d.width, d.height, p.detail);
    return { print: p.hex, detail: p.detail, width: d.width, height: d.height, note: null, ms: Math.round(now() - t) };
  } catch (e) {
    if (e instanceof JpegError) return none(/\.(png|webp)$/i.test(path) && /not a JPEG/.test(e.message) ? 'Only JPEG photos are checked.' : e.message);
    return none(`The photo could not be read (${String(e instanceof Error ? e.message : e).slice(0, 80)}).`);
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
  const r = readPhoto(img.path, bytes, d.now);
  const paired = await d.put({ image: img.image_id, print: r.print, detail: r.detail, width: r.width, height: r.height, note: r.note });
  return {
    state: r.print ? 'done' : 'skipped', image: img.image_id, paired, ...(r.note ? { note: r.note } : {}),
    ...(r.width && r.height ? { pixels: r.width * r.height } : {}), bytes: bytes.length, read_ms: r.ms,
  };
}

export const BATCH = { readMs: 400, photos: 20, wallMs: 25_000 };
export interface BatchResult { done: number; skipped: number; paired: number; read_ms: number; notes: string[]; stopped?: string }

/** Photos one after the other until none is waiting or the batch has used its share of the call. */
export async function runBatch(d: Deps, limit = BATCH): Promise<BatchResult> {
  const out: BatchResult = { done: 0, skipped: 0, paired: 0, read_ms: 0, notes: [] }, t0 = d.now();
  while (out.done + out.skipped < limit.photos && out.read_ms < limit.readMs && d.now() - t0 < limit.wallMs) {
    let r: Result;
    try { r = await runOne(d); } catch (e) {
      // A download that failed: that photo stays claimed for later. What was done before it counts; a first failure is the call's.
      if (!out.done && !out.skipped) throw e;
      out.stopped = String(e instanceof Error ? e.message : e).slice(0, 160);
      break;
    }
    if (r.state === 'idle') break;
    if (r.state === 'done') out.done++; else { out.skipped++; if (r.note && out.notes.length < 5 && !out.notes.includes(r.note)) out.notes.push(r.note); }
    out.paired += r.paired ?? 0; out.read_ms += r.read_ms ?? 0;
  }
  return out;
}
