// 'ingest' — a product arrives from outside (the Telegram bridge later, or an
// import). Deduped on (source, source_ref). Photos are downloaded into the
// playbook-products bucket (max 10, 15 MB each, jpeg / png / webp only). The
// product is created 'new' with claimed_at = now, so the worker does not read
// it before its photos are in; the claim is cleared at the end.
import { SB_URL, enc, insert, logActivity, nowIso, one, patch, sel, svcHeaders } from './db.ts';
import { HttpError, fetchT, plain } from './http.ts';
import { BUCKET } from './types.ts';

const MAX_IMAGES = 10;
const MAX_BYTES = 15 * 1024 * 1024;

export interface IngestBody { source?: unknown; source_ref?: unknown; raw_text?: unknown; vendor_name?: unknown; image_urls?: unknown }

async function vendorId(name: string): Promise<string | null> {
  if (!name) return null;
  try {
    return (await insert<{ id: string }>('pb_vendors', [{ name }]))[0]?.id ?? null;
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 409)) throw e;
    // Exists (names are unique ignoring case). ilike treats * % _ as wildcards, so confirm in code.
    const rows = await sel<{ id: string; name: string }>(`pb_vendors?name=ilike.${enc(name)}&select=id,name&limit=50`);
    return rows.find(r => r.name.toLowerCase() === name.toLowerCase())?.id ?? null;
  }
}

function sniff(b: Uint8Array): { type: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' };
  const s = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

async function download(url: string): Promise<{ bytes: Uint8Array; type: string; ext: string }> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('is not a web address'); }
  if (u.protocol !== 'https:') throw new Error('is not an https link');
  const r = await fetchT(u.toString(), { redirect: 'follow' }, 25_000);
  if (!r.ok || !r.body) throw new Error(`could not be downloaded (${r.status})`);
  if (Number(r.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('is larger than 15 MB');
  const parts: Uint8Array[] = [];
  let size = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('is larger than 15 MB'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  const kind = sniff(bytes);
  if (!kind) throw new Error('is not a JPEG, PNG or WebP photo');
  return { bytes, ...kind };
}

export async function ingest(b: IngestBody): Promise<Record<string, unknown>> {
  const source = String(b.source || '');
  if (!['telegram', 'import'].includes(source)) throw new HttpError(400, "source must be 'telegram' or 'import'.");
  const ref = String(b.source_ref ?? '').trim();
  if (!ref || ref.length > 200) throw new HttpError(400, 'source_ref (the message id) is required, up to 200 characters.');
  const rawText = String(b.raw_text ?? '').slice(0, 20_000);
  const urls = Array.isArray(b.image_urls) ? b.image_urls.map(String).filter(Boolean).slice(0, MAX_IMAGES) : [];
  const findDup = () => one<{ id: string }>(`pb_products?source=eq.${enc(source)}&source_ref=eq.${enc(ref)}&select=id`);

  const dup = await findDup();
  if (dup) return { ok: true, product_id: dup.id, duplicate: true };
  const vendor_id = await vendorId(String(b.vendor_name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120));
  let id: string;
  try {
    id = (await insert<{ id: string }>('pb_products', [{ source, source_ref: ref, raw_text: rawText || null, vendor_id, status: 'new', claimed_at: nowIso() }]))[0].id;
  } catch (e) {
    const again = e instanceof HttpError && e.status === 409 ? await findDup() : null;
    if (again) return { ok: true, product_id: again.id, duplicate: true };
    throw e;
  }

  const warnings: string[] = [];
  const rows: { product_id: string; path: string; position: number }[] = [];
  try {
    for (let i = 0; i < urls.length; i += 3) { // three at a time keeps memory in check
      await Promise.all(urls.slice(i, i + 3).map(async (url, k) => {
        const n = i + k;
        try {
          const img = await download(url);
          const path = `${id}/${n + 1}.${img.ext}`;
          const up = await fetchT(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
            method: 'POST', headers: { ...svcHeaders, 'content-type': img.type, 'x-upsert': 'true' }, body: img.bytes.buffer as ArrayBuffer,
          }, 30_000);
          if (!up.ok) throw new Error(`could not be saved (${up.status})`);
          rows.push({ product_id: id, path, position: n });
        } catch (e) {
          warnings.push(`Photo ${n + 1} ${e instanceof DOMException ? 'took too long to download' : plain(e).replace(/\.$/, '')}.`);
        }
      }));
    }
    if (rows.length) await insert('pb_product_images', rows.sort((a, c) => a.position - c.position));
  } finally {
    // Release the hold even when saving photos failed, so the product is still read.
    await patch('pb_products', `id=eq.${enc(id)}&status=eq.new`, { claimed_at: null });
  }
  await logActivity({ product_id: id, action: 'created', details: { source, source_ref: ref, images: rows.length, ...(warnings.length ? { warnings } : {}) } });
  return { ok: true, product_id: id, images: rows.length, ...(warnings.length ? { warnings } : {}) };
}
