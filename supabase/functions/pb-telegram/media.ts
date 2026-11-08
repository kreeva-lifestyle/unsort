// Copies a product's Telegram photos / videos into the playbook-products
// bucket and records them in pb_product_images (kind 'image' | 'video').
// Each file is stored as <product>/tg-<message row id>.<ext>, so a retry copies
// only what is missing even if the group changed meanwhile (positions: photos
// first, then videos). A file that can never be copied (over 20 MB, wrong
// format) becomes a note; a passing failure (network, Telegram busy) is
// returned as `retry` so the group is tried again, up to 3 times; running out
// of this run's time is `timeout` (not a failed try).
import { SB_URL, enc, insert, sel, svcHeaders } from '../pb-products/db.ts';
import { HttpError, fetchT, plain } from '../pb-products/http.ts';
import { BUCKET } from '../pb-products/types.ts';
import { download, mb, scrub, TG_MAX_BYTES, TooBig } from './tg.ts';

export const MAX_PHOTOS = 20;
export const MAX_VIDEOS = 5;

export interface MediaMsg { id: number; kind: string; file_id: string | null; file_size: number | null }
export interface Planned { msg: MediaMsg; kind: 'image' | 'video'; position: number; label: string }

/** The files to copy, and notes for the ones left out up front. `base`: the first position. */
export function planMedia(msgs: MediaMsg[], base = 0): { files: Planned[]; notes: string[] } {
  const notes: string[] = [];
  const photos = msgs.filter(m => m.kind === 'photo');
  const videos = msgs.filter(m => m.kind === 'video');
  if (photos.length > MAX_PHOTOS) notes.push(`${photos.length - MAX_PHOTOS} more photos were not copied (Playbook keeps ${MAX_PHOTOS}).`);
  if (videos.length > MAX_VIDEOS) notes.push(`${videos.length - MAX_VIDEOS} more videos were not copied (Playbook keeps ${MAX_VIDEOS}).`);
  const p = photos.slice(0, MAX_PHOTOS);
  const files: Planned[] = [
    ...p.map((msg, i) => ({ msg, kind: 'image' as const, position: base + i, label: `Photo ${base + i + 1}` })),
    ...videos.slice(0, MAX_VIDEOS).map((msg, j) => ({ msg, kind: 'video' as const, position: base + p.length + j, label: `Video ${j + 1}` })),
  ];
  return {
    files: files.filter(f => {
      if (Number(f.msg.file_size || 0) <= TG_MAX_BYTES && f.msg.file_id) return true;
      notes.push(f.msg.file_id ? tooBig(f, Number(f.msg.file_size)) : `${f.label} could not be copied (Telegram gave no file).`);
      return false;
    }),
    notes,
  };
}

const tooBig = (f: Planned, bytes: number) => `${f.kind === 'video' ? 'Video' : f.label} (${mb(bytes)} MB) too big to copy — add it by hand`;

const PAR_MAX = 5 * 1024 * 1024; // photos up to 5 MB download 4 at a time; bigger ones one by one

function sniff(b: Uint8Array): { type: string; ext: string; kind: 'image' | 'video' } | null {
  const s = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return { type: 'image/png', ext: 'png', kind: 'image' };
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return { type: 'image/webp', ext: 'webp', kind: 'image' };
  if (s(4, 4) === 'ftyp') return s(8, 4) === 'qt  ' ? { type: 'video/quicktime', ext: 'mov', kind: 'video' } : { type: 'video/mp4', ext: 'mp4', kind: 'video' };
  return null;
}

/** The message row ids already copied onto a product, and its next free position. */
export async function onProduct(productId: string): Promise<{ have: Set<number>; next: number }> {
  const rows = await sel<{ path: string; position: number }>(`pb_product_images?product_id=eq.${enc(productId)}&select=path,position&limit=200`);
  return {
    have: new Set(rows.map(r => Number(/\/tg-(\d+)\.\w+$/.exec(r.path)?.[1])).filter(Number.isFinite)),
    next: rows.reduce((n, r) => Math.max(n, r.position + 1), 0),
  };
}

/** Copies the planned files not yet on the product. Returns notes, passing failures and whether time ran out. */
export async function copyMedia(token: string, productId: string, files: Planned[], deadline: number): Promise<{ notes: string[]; retry: string[]; copied: number; timeout: boolean }> {
  const { have } = await onProduct(productId);
  const todo = files.filter(f => !have.has(f.msg.id));
  const notes: string[] = [], retry: string[] = [];
  const rows: Record<string, unknown>[] = [];
  let timeout = false;
  const one = async (f: Planned) => {
    const left = deadline - Date.now();
    if (left < 10_000) { timeout = true; return; }
    try {
      const blob = await download(token, f.msg.file_id as string, Math.min(left - 5_000, f.kind === 'video' ? 60_000 : 25_000));
      const kind = sniff(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
      if (!kind || kind.kind !== f.kind) { notes.push(`${f.label} could not be copied (${f.kind === 'video' ? 'not an MP4 or MOV video' : 'not a JPEG, PNG or WebP photo'}).`); return; }
      const path = `${productId}/tg-${f.msg.id}.${kind.ext}`;
      const up = await fetchT(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST', headers: { ...svcHeaders, 'content-type': kind.type, 'x-upsert': 'true' }, body: blob,
      }, Math.max(5_000, Math.min(60_000, deadline - Date.now())));
      if (!up.ok) {
        if (up.status === 413 || up.status === 415) notes.push(`${f.label} could not be saved (the photo store refused it, ${up.status}).`);
        else retry.push(`${f.label}: saving failed (${up.status})`);
        return;
      }
      rows.push({ product_id: productId, path, position: f.position, kind: f.kind, bytes: blob.size });
    } catch (e) {
      if (e instanceof TooBig) notes.push(tooBig(f, e.bytes));
      else if (e instanceof HttpError && e.status === 400) notes.push(`${f.label} could not be copied (${scrub(plain(e), token)}).`);
      else retry.push(`${f.label}: ${scrub(plain(e), token)}`);
    }
  };
  const small = todo.filter(f => f.kind === 'image' && Number(f.msg.file_size || 0) <= PAR_MAX);
  for (let i = 0; i < small.length; i += 4) await Promise.all(small.slice(i, i + 4).map(one));
  // One at a time: up to 20 MB each in memory.
  for (const f of todo.filter(f => !small.includes(f))) await one(f);
  if (rows.length) await insert('pb_product_images', rows.sort((a, b) => Number(a.position) - Number(b.position)));
  return { notes, retry, copied: rows.length, timeout };
}
