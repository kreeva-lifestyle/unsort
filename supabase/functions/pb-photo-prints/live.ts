// runOne's doors to the outside, as the edge function uses them: the two
// database functions (service role) and the photo's public address.
import { publicUrl, rpc } from '../pb-products/db.ts';
import { HttpError, fetchT } from '../pb-products/http.ts';
import { type Claimed, type Decode, type Deps, MAX_BYTES } from './work.ts';

const DOWNLOAD_MS = 20_000;

/** The photo's bytes; null when the file is larger than the worker will read. */
async function download(path: string): Promise<Uint8Array | null> {
  const r = await fetchT(publicUrl(path), { method: 'GET' }, DOWNLOAD_MS);
  if (!r.ok) { await r.body?.cancel(); throw new HttpError(502, `The photo could not be downloaded (${r.status}).`); }
  const n = Number(r.headers.get('content-length'));
  if (Number.isFinite(n) && n > MAX_BYTES) { await r.body?.cancel(); return null; }
  return new Uint8Array(await r.arrayBuffer());
}

export const liveDeps = (decode: Decode): Deps => ({
  claim: async () => (await rpc<Claimed[]>('pb_photo_claim', { p_n: 1 }))?.[0] ?? null,
  put: async (a) => Number(await rpc<number>('pb_photo_put', { p_image: a.image, p_print: a.print, p_detail: a.detail, p_width: a.width, p_height: a.height, p_note: a.note })) || 0,
  download,
  decode,
  now: () => performance.now(),
});
