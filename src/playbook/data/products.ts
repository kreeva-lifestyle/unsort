// Product Directory data access (products, photos, listings, the lists they need).
// Explicit columns everywhere; lists paginate with .range(). Contract:
// docs/playbook/product-directory-spec.md. Errors are thrown as-is — callers
// show them with friendlyError().
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import { PB_BUCKET, type PbListingStatus, type PbProduct, type PbProductImage, type PbProductStatus, type PbWebsite } from '../types';
import { LISTING_COLS, logPbActivity as logActivity, type ListingFull } from './listings';
export type { ListingFull } from './listings';

export const PAGE_SIZE = 25;

export type ProductRow = Pick<PbProduct, 'id' | 'name' | 'sku' | 'cost_price' | 'status' | 'category' | 'ai_error' | 'created_at'> & {
  pb_vendors: { name: string } | null;
  pb_product_images: { path: string; position: number }[];
  pb_listings: { id: string; website_id: string; status: PbListingStatus }[];
};
/** status: '' = everything but archived · a product status · 'l:failed' / 'l:queued,generating,publishing' = has a listing in that state (one or a comma list). */
export type ProductFilter = { search: string; status: string; vendorId: string; websiteId: string };
export const EMPTY_FILTER: ProductFilter = { search: '', status: '', vendorId: '', websiteId: '' };

const LIST_COLS = 'id,name,sku,cost_price,status,category,ai_error,created_at,pb_vendors(name),pb_product_images(path,position),pb_listings(id,website_id,status)';

export async function listProducts(f: ProductFilter, page: number): Promise<{ rows: ProductRow[]; count: number }> {
  const lStatus = f.status.startsWith('l:') ? f.status.slice(2) : '';
  // A second, inner-joined copy of the listings narrows the products without trimming the chips.
  const hit = f.websiteId || lStatus ? ',hit:pb_listings!inner(website_id,status)' : '';
  let q = supabase.from('pb_products').select(LIST_COLS + hit, { count: 'exact' });
  if (!f.status || lStatus) q = q.neq('status', 'archived'); else q = q.eq('status', f.status);
  const lList = lStatus.split(',').filter(Boolean);
  if (lList.length > 1) q = q.in('hit.status', lList); else if (lStatus) q = q.eq('hit.status', lStatus);
  if (f.websiteId) q = q.eq('hit.website_id', f.websiteId);
  if (f.vendorId) q = q.eq('vendor_id', f.vendorId);
  const s = f.search.replace(/[,()"\\%*:]/g, ' ').trim();
  if (s) q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%,raw_text.ilike.%${s}%`);
  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .eq('pb_product_images.kind', 'image') // the list thumbnail is always a photo, never a Telegram video
    .order('position', { referencedTable: 'pb_product_images' })
    .limit(1, { referencedTable: 'pb_product_images' })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as ProductRow[], count: count ?? 0 };
}

export type ProductDetail = Omit<PbProduct, 'claimed_at' | 'created_by'> & {
  pb_vendors: { name: string; tg_username: string | null; tg_title: string | null } | null;
  pb_product_images: Pick<PbProductImage, 'id' | 'path' | 'position' | 'kind' | 'bytes'>[];
  pb_listings: ListingFull[];
};
const PRODUCT_COLS = 'id,vendor_id,source,source_ref,raw_text,sku,name,category,fabric,color,sizes,cost_price,attributes,status,locked,ai_read_at,ai_error,less_amount,source_url,intake_notes,created_at,updated_at';

export async function getProduct(id: string): Promise<ProductDetail> {
  const { data, error } = await supabase.from('pb_products')
    .select(`${PRODUCT_COLS},pb_vendors(name,tg_username,tg_title),pb_product_images(id,path,position,kind,bytes),pb_listings(${LISTING_COLS})`)
    .eq('id', id).order('position', { referencedTable: 'pb_product_images' }).single();
  if (error) throw error;
  return data as unknown as ProductDetail;
}

/** Save facts staff typed; every field named in `changed` joins `locked` so the AI reader keeps it.
 *  Refused while the AI reader holds the product (it would overwrite what was typed with what it read);
 *  a status change only applies while the product is still in `p.status`. */
export async function updateProduct(p: Pick<PbProduct, 'id' | 'locked' | 'status'>, patch: Partial<PbProduct>, changed: string[]) {
  const locked = Array.from(new Set([...p.locked, ...changed.filter(c => c !== 'status' && c !== 'vendor_id')]));
  let q = supabase.from('pb_products').update({ ...patch, locked }).eq('id', p.id).neq('status', 'reading');
  if (patch.status) q = q.eq('status', p.status);
  const { data, error } = await q.select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('The AI is reading this product right now, or it changed meanwhile — wait a minute, reload it and save again.');
  if (changed.length) logActivity({ product_id: p.id, action: 'edited', details: { fields: changed } });
}

/** "Mark as checked" on the Notes from Telegram tile: the notes are cleared. */
export async function clearIntakeNotes(id: string) {
  const { error } = await supabase.from('pb_products').update({ intake_notes: [] }).eq('id', id);
  if (error) throw error;
  logActivity({ product_id: id, action: 'edited', details: { fields: ['intake_notes'] } });
}

export const setProductStatus = async (id: string, status: PbProductStatus) => {
  const { error } = await supabase.from('pb_products').update({ status }).eq('id', id);
  if (error) throw error;
  logActivity({ product_id: id, action: status === 'archived' ? 'archived' : 'status', details: { status } });
};

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const checkPhoto = (f: File) =>
  !EXT[f.type] ? `${f.name}: only JPG, PNG or WebP photos` : f.size > 15 * 1024 * 1024 ? `${f.name}: larger than 15 MB` : null;

/** Upload to playbook-products/<product_id>/<n>.<ext> and add the image rows (positions from `start`).
 *  <n> continues after the highest name already in storage, so a leftover object never blocks a later upload. */
export async function addPhotos(productId: string, files: File[], start: number) {
  const bucket = supabase.storage.from(PB_BUCKET);
  const { data: objs, error: listErr } = await bucket.list(productId, { limit: 1000 });
  if (listErr) logSwallowed('pb photo list', listErr);
  const n0 = Math.max(start, ...(objs ?? []).map(o => parseInt(o.name, 10)).filter(n => Number.isFinite(n)));
  const done: string[] = [];
  const cleanup = () => { if (done.length) bucket.remove(done).then(({ error }) => { if (error) logSwallowed('pb photo cleanup', error); }); };
  try {
    for (const [i, f] of files.entries()) {
      const path = `${productId}/${n0 + i + 1}.${EXT[f.type] || 'jpg'}`;
      const { error } = await bucket.upload(path, f, { contentType: f.type, upsert: false });
      if (error) throw error;
      done.push(path);
    }
  } catch (e) { cleanup(); throw e; }
  if (!done.length) return;
  const { error } = await supabase.from('pb_product_images').insert(done.map((path, i) => ({ product_id: productId, path, position: start + i })));
  if (error) { cleanup(); throw error; }
}

export type NewProduct = { vendor_id: string | null; cost_price: number | null; sku: string; raw_text: string; category: string; sizes: string[] };

/** Create a product + its photos. It is held in needs_info while the photos go up, so the AI reader never sees it half-made.
 *  `id` is fixed per Add form, so a retry after a partial failure finishes the same product instead of making a second one.
 *  Once the row exists this never throws: a later failure comes back as `photoError` / `releaseError`. */
export async function createProduct(id: string, p: NewProduct, files: File[]): Promise<{ id: string; photoError?: unknown; releaseError?: unknown }> {
  const locked = [p.cost_price != null && 'cost_price', p.sku && 'sku', p.category && 'category', p.sizes.length && 'sizes'].filter(Boolean) as string[];
  const fields = { vendor_id: p.vendor_id, cost_price: p.cost_price, sku: p.sku || null, raw_text: p.raw_text || null, category: p.category || null, sizes: p.sizes, locked };
  const { error } = await supabase.from('pb_products').insert({ id, source: 'manual', ...fields, status: files.length ? 'needs_info' : 'new' });
  let retry = false;
  if (error) {
    // A retry of the same form: the row is already there — take the current form values and carry on.
    const { data: had } = await supabase.from('pb_products').select('id').eq('id', id).maybeSingle();
    if (!had) throw error;
    retry = true;
    const up = await supabase.from('pb_products').update(fields).eq('id', id);
    if (up.error) throw up.error;
  }
  if (!retry) logActivity({ product_id: id, action: 'created', details: { source: 'manual', photos: files.length } });
  if (!files.length) return { id };
  let photoError: unknown;
  try {
    const { count, error: cErr } = await supabase.from('pb_product_images').select('id', { count: 'exact', head: true }).eq('product_id', id);
    if (cErr) throw cErr;
    if (!count) await addPhotos(id, files, 0); // photos already saved by an earlier try are not added twice
  } catch (e) { photoError = e; }
  // Release it to the reader either way (a product without photos can still be read). Internal step: no timeline row.
  const { error: rErr } = await supabase.from('pb_products').update({ status: 'new' }).eq('id', id).eq('status', 'needs_info');
  return { id, photoError, releaseError: rErr ?? undefined };
}

// ── small lookups ──
export type WebsiteLite = Pick<PbWebsite, 'id' | 'name' | 'shop_domain' | 'active' | 'publish_mode' | 'content' | 'pricing'>;
export async function listWebsitesLite(): Promise<WebsiteLite[]> {
  const { data, error } = await supabase.from('pb_websites').select('id,name,shop_domain,active,publish_mode,content,pricing').order('name').limit(200);
  if (error) throw error;
  return (data ?? []) as WebsiteLite[];
}

export type VendorLite = { id: string; name: string; active: boolean };
export async function listVendorsLite(): Promise<VendorLite[]> {
  const { data, error } = await supabase.from('pb_vendors').select('id,name,active').order('name').limit(2000);
  if (error) throw error;
  return (data ?? []) as VendorLite[];
}

/** Insert a vendor; if the name already exists (any case), return that one. */
export async function createVendor(name: string): Promise<VendorLite> {
  const { data, error } = await supabase.from('pb_vendors').insert({ name }).select('id,name,active').single();
  if (!error) return data as VendorLite;
  if (error.code !== '23505') throw error;
  // Unique on lower(name): find it exactly. `*` is a PostgREST wildcard, so it only narrows (as `_`); the exact match is done here.
  const found = await supabase.from('pb_vendors').select('id,name,active')
    .ilike('name', name.replace(/[%_\\]/g, '\\$&').replace(/\*/g, '_')).limit(50);
  if (found.error) throw found.error;
  const hit = (found.data ?? []).find(v => v.name.toLowerCase() === name.toLowerCase());
  if (!hit) throw error;
  return hit as VendorLite;
}

/** pb_settings: categories + automation pause. */
export async function getPbSettingsLite(): Promise<{ categories: string[]; paused: boolean }> {
  const { data, error } = await supabase.from('pb_settings').select('key,value').in('key', ['categories', 'automation']);
  if (error) throw error;
  const v = (k: string) => data?.find(r => r.key === k)?.value;
  return { categories: Array.isArray(v('categories')) ? v('categories') : [], paused: !!v('automation')?.paused };
}
