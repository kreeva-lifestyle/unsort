// 'ingest' — a product arrives from outside (the Telegram bridge later, or an
// import). Deduped on (source, source_ref). Photos are downloaded into the
// playbook-products bucket (max 10, 15 MB each, jpeg / png / webp only). The
// product is created 'new' with claimed_at = now, so the worker does not read
// it before its photos are in; the claim is cleared at the end. Optional
// less_amount / source_url / intake_notes are stored as given (validated).
// Import from website (2026-11-08): sell_price = the price seen on the other
// store, which is OUR selling price (pricing rules skipped), + price_note;
// attributes = the store's facts (brand, type, tags, barcode, weight, SEO…;
// import/meta.ts) and sku — both taken from source 'import' only. Tags: the
// rules step (tagStore.ts autoTag) runs at once over EVERY attribute (the
// category is not known before the read), and the store's tags that match no
// value go to the suggestions queue after the junk filter (tagClean.ts).
// Best effort: a tag failure is logged and never loses the product.
import { SB_URL, enc, insert, logActivity, nowIso, one, patch, sel, svcHeaders } from './db.ts';
import { HttpError, fetchT, plain } from './http.ts';
import { refList } from './import/body.ts';
import { siteBytes } from './import/fetch.ts';
import { autoTag } from './tagStore.ts';
import { loadTaxonomy } from './taxonomy.ts';
import { BUCKET } from './types.ts';

const MAX_IMAGES = 10;
const MAX_BYTES = 15 * 1024 * 1024;
/** Photos from another store: 5 MB each, one at a time, through the import's polite fetch (import/fetch.ts:
 *  public hosts only on every redirect, paced, our User-Agent) — the addresses come from that store's data. */
const MAX_BYTES_IMPORT = 5 * 1024 * 1024;

export interface IngestBody {
  source?: unknown; source_ref?: unknown; raw_text?: unknown; vendor_name?: unknown; image_urls?: unknown;
  // Optional (Telegram intake, 2026-11-07): the vendor's "Less" (cost = rate − less, see reader.ts), a link to the post, notes.
  less_amount?: unknown; source_url?: unknown; intake_notes?: unknown;
  // Optional (import from website, 2026-11-08): sell at exactly this price everywhere, and where it came from.
  sell_price?: unknown; price_note?: unknown;
  // Import from website only: the store's facts as plain strings, and its SKU.
  attributes?: unknown; sku?: unknown;
}

/** The optional fields, validated (exported for the tests). */
export function extras(b: IngestBody): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (b.less_amount !== undefined && b.less_amount !== null && b.less_amount !== '') {
    const n = Number(b.less_amount);
    if (!Number.isFinite(n) || n < 0 || n >= 10_000_000) throw new HttpError(400, 'less_amount must be a number of rupees, 0 or more.');
    out.less_amount = Math.round(n * 100) / 100;
  }
  const url = String(b.source_url ?? '').trim();
  if (url) {
    if (!/^https:\/\/\S+$/i.test(url) || url.length > 500) throw new HttpError(400, 'source_url must be an https link.');
    out.source_url = url;
  }
  if (Array.isArray(b.intake_notes)) out.intake_notes = b.intake_notes.map(n => String(n ?? '').trim().slice(0, 300)).filter(Boolean).slice(0, 20);
  if (b.sell_price !== undefined && b.sell_price !== null && b.sell_price !== '') {
    const n = Number(b.sell_price);
    if (!Number.isFinite(n) || n <= 0 || n >= 10_000_000) throw new HttpError(400, 'sell_price must be a price in rupees above 0.');
    out.sell_price = Math.round(n * 100) / 100;
  }
  const note = String(b.price_note ?? '').replace(/\s+/g, ' ').trim();
  if (note) out.price_note = note.slice(0, 300);
  if ((b.attributes !== undefined && b.attributes !== null) || (b.sku !== undefined && b.sku !== null && b.sku !== '')) {
    if (b.source !== 'import') throw new HttpError(400, "attributes and sku are taken only from a website import (source 'import').");
    const sku = String(b.sku ?? '').replace(/\s+/g, ' ').trim();
    if (sku) out.sku = sku.slice(0, 80);
    if (b.attributes !== undefined && b.attributes !== null) {
      if (typeof b.attributes !== 'object' || Array.isArray(b.attributes)) throw new HttpError(400, 'attributes must be an object of short texts.');
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(b.attributes as Record<string, unknown>).slice(0, 30)) {
        const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
        if (/^[a-z][a-z0-9_]{0,39}$/.test(k) && s && typeof v !== 'object') attrs[k] = s;
      }
      if (Object.keys(attrs).length) out.attributes = attrs;
    }
  }
  return out;
}

/** The vendor with this name (created when new; names are unique ignoring case). Also used by import_start. */
export async function vendorId(name: string): Promise<string | null> {
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

/** The rules step for a product just made (values for every attribute; the reader narrows them to its category). */
async function tagAtIngest(p: { id: string; name: string | null; raw_text: string | null; attributes: Record<string, string> }): Promise<void> {
  try {
    const tax = await loadTaxonomy();
    if (!tax.values.length) return;
    await autoTag({ ...p, fabric: null, color: null, category: null, locked: [] }, tax, { byCategory: false });
  } catch (e) { console.error(`pb-products ingest tags ${p.id}: ${plain(e)}`); }
}

function sniff(b: Uint8Array): { type: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' };
  const s = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

/** `store` = the other store's host for an import (its photos go through siteBytes), null for Telegram. */
async function download(url: string, store: string | null): Promise<{ bytes: Uint8Array; type: string; ext: string }> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('is not a web address'); }
  if (u.protocol !== 'https:') throw new Error('is not an https link');
  if (store !== null) {
    const g = await siteBytes(u.toString(), MAX_BYTES_IMPORT, store);
    if (!g.ok) throw new Error(g.status === 413 ? 'is larger than 5 MB' : `could not be downloaded (${g.status})`);
    const kind = sniff(g.bytes);
    if (!kind) throw new Error('is not a JPEG, PNG or WebP photo');
    return { bytes: g.bytes, ...kind };
  }
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
  const more = extras(b);
  const findDup = () => one<{ id: string }>(`pb_products?source=eq.${enc(source)}&source_ref=in.(${enc(refList(source, ref))})&select=id&order=created_at.asc`); // refList: also the site's other address (www / bare)
  const dup = await findDup();
  if (dup) return { ok: true, product_id: dup.id, duplicate: true };
  const vendor_id = await vendorId(String(b.vendor_name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120));
  let id: string;
  try {
    id = (await insert<{ id: string }>('pb_products', [{ source, source_ref: ref, raw_text: rawText || null, vendor_id, status: 'new', claimed_at: nowIso(), ...more }]))[0].id;
  } catch (e) {
    const again = e instanceof HttpError && e.status === 409 ? await findDup() : null;
    if (again) return { ok: true, product_id: again.id, duplicate: true };
    throw e;
  }
  // While the product is still held (claimed), so the reader never races this write.
  await tagAtIngest({ id, name: typeof more.name === 'string' ? more.name : null, raw_text: rawText || null, attributes: (more.attributes as Record<string, string> | undefined) || {} });

  const warnings: string[] = [];
  const rows: { product_id: string; path: string; position: number }[] = [];
  const store = source === 'import' ? (() => { try { return new URL(String(more.source_url)).host; } catch { return ''; } })() : null;
  const step = store !== null ? 1 : 3; // three at a time keeps memory in check; an import's one by one (another store's server)
  let held = Date.now(); // when the hold (claimed_at) was last set
  try {
    for (let i = 0; i < urls.length; i += step) {
      await Promise.all(urls.slice(i, i + step).map(async (url, k) => {
        const n = i + k;
        try {
          const img = await download(url, store);
          const path = `${id}/${n + 1}.${img.ext}`;
          const up = await fetchT(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
            method: 'POST', headers: { ...svcHeaders, 'content-type': img.type, 'x-upsert': 'true' }, body: img.bytes.buffer as ArrayBuffer,
          }, 30_000);
          if (!up.ok) throw new Error(`could not be saved (${up.status})`);
          // Recorded at once: if this call is cut off before the last photo, the product keeps the photos it has.
          await insert('pb_product_images', [{ product_id: id, path, position: n }]);
          rows.push({ product_id: id, path, position: n });
        } catch (e) {
          warnings.push(`Photo ${n + 1} ${e instanceof DOMException ? 'took too long to download' : plain(e).replace(/\.$/, '')}.`);
        }
      }));
      // A slow store (a long Crawl-delay between photos) can take minutes: renew the hold once a minute, so the
      // reader does not take the product over as "stuck" while its photos are still arriving.
      if (Date.now() - held > 60_000) {
        held = Date.now();
        await patch('pb_products', `id=eq.${enc(id)}&status=eq.new`, { claimed_at: nowIso() }).catch(e => console.error(`pb-products ingest hold ${id}: ${plain(e)}`));
      }
    }
  } finally {
    // Release the hold even when saving photos failed, so the product is still read.
    await patch('pb_products', `id=eq.${enc(id)}&status=eq.new`, { claimed_at: null });
  }
  await logActivity({ product_id: id, action: 'created', details: { source, source_ref: ref, images: rows.length, ...(warnings.length ? { warnings } : {}) } });
  return { ok: true, product_id: id, images: rows.length, ...(warnings.length ? { warnings } : {}) };
}
