// Product / listing actions run by staff from the app (and 'work' / 'ingest').
// Each returns the JSON body; failures throw HttpError with a plain sentence.
import { enc, getSettings, one, patch } from './db.ts';
import { claimGenerate, generateOne } from './generate.ts';
import { HttpError } from './http.ts';
import { ingest } from './ingest.ts';
import { claimPublish, publishOne } from './publish.ts';
import { claimRead, readOne } from './reader.ts';
import { routeProduct } from './route.ts';
import { PRODUCT_COLS, STALE_MS, type ProductRow } from './types.ts';
import { unpublish } from './unpublish.ts';
import { newBudget, work } from './worker.ts';

export type Body = Record<string, unknown>;

export function uuid(v: unknown, what: string): string {
  const s = String(v ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new HttpError(400, `${what} is missing or not valid.`);
  return s;
}

export async function doWork(fromSecret: boolean, userId: string | null) {
  // The pause switch stops the cron; "Run now" from the app still runs.
  if (fromSecret && (await getSettings()).automation.paused) return { ok: true, paused: true, read: 0, routed: 0, generated: 0, published: 0, failed: 0 };
  return { ok: true, ...(await work(userId)) };
}

export const doIngest = (b: Body) => ingest(b);

export async function readProduct(b: Body, userId: string | null) {
  const id = uuid(b.product_id, 'product_id');
  const cur = await one<{ status: string; claimed_at: string | null; ai_error: string | null }>(`pb_products?id=eq.${enc(id)}&select=status,claimed_at,ai_error`);
  if (!cur) throw new HttpError(404, 'That product no longer exists.');
  if (cur.status === 'archived') throw new HttpError(400, 'This product is archived.');
  const p = await claimRead(id, true);
  if (!p) {
    const arriving = cur.status === 'new' && !cur.ai_error && !!cur.claimed_at && Date.parse(cur.claimed_at) > Date.now() - STALE_MS;
    throw new HttpError(409, arriving ? 'The photos for this product are still arriving — try again in a minute.' : 'This product is being read right now — try again in a minute.');
  }
  const r = await readOne(p, { manual: true, prevStatus: cur.status === 'reading' ? 'new' : cur.status, userId, budget: newBudget() });
  return { ok: true, product: r.product, routed: r.routed, ...(r.warning ? { warning: r.warning } : {}) };
}

export async function routeOne(b: Body, userId: string | null) {
  const id = uuid(b.product_id, 'product_id');
  const p = await one<ProductRow>(`pb_products?id=eq.${enc(id)}&select=${PRODUCT_COLS}`);
  if (!p) throw new HttpError(404, 'That product no longer exists.');
  if (p.status === 'archived') throw new HttpError(400, 'This product is archived.');
  if (p.status !== 'ready') throw new HttpError(400, 'Add what is missing first (cost price, category, fabric, colour, a photo or a tag) — only ready products go to websites.');
  const r = await routeProduct(p, userId);
  // routed now: the worker's route_due step (tagFill.ts) need not route it again
  await patch('pb_products', `id=eq.${enc(id)}&route_due=eq.true`, { route_due: false });
  return { ok: true, routed: r.routed, repriced: r.repriced, listings: r.listings, ...(r.warning ? { warning: r.warning } : {}) };
}

export async function generateListing(b: Body, userId: string | null) {
  const id = uuid(b.listing_id, 'listing_id');
  const cur = await one<{ status: string; generated_at: string | null; product_id: string }>(`pb_listings?id=eq.${enc(id)}&select=status,generated_at,product_id`);
  if (!cur) throw new HttpError(404, 'That listing no longer exists.');
  // As publish_listing: the writer would set an archived product's listing aside (even one live on Shopify) and still answer ok.
  const prod = await one<{ status: string }>(`pb_products?id=eq.${enc(cur.product_id)}&select=status`);
  if (prod?.status === 'archived') throw new HttpError(400, 'This product is archived.');
  if (cur.status === 'skipped' && cur.generated_at) throw new HttpError(400, 'This listing was removed from the website — use "Put back on site" to bring it back first.');
  // Removed before it was ever written: there is nothing to put back, so writing it is how it returns.
  if (cur.status === 'skipped') await patch('pb_listings', `id=eq.${enc(id)}&status=eq.skipped`, { status: 'queued', error: null });
  const l = await claimGenerate(id, true);
  if (!l) throw new HttpError(409, 'This listing is being written or published right now — try again in a minute.');
  const listing = await generateOne(l, { manual: true, prevStatus: cur.status === 'generating' ? 'queued' : cur.status, userId, budget: newBudget() });
  return { ok: true, listing };
}

export async function publishListing(b: Body, userId: string | null) {
  const id = uuid(b.listing_id, 'listing_id');
  const cur = await one<{ status: string; generated_at: string | null; website_id: string; product_id: string }>(`pb_listings?id=eq.${enc(id)}&select=status,generated_at,website_id,product_id`);
  if (!cur) throw new HttpError(404, 'That listing no longer exists.');
  if (!cur.generated_at) throw new HttpError(400, 'This listing has not been written yet — wait for the AI or tap Regenerate.');
  const prod = await one<{ status: string }>(`pb_products?id=eq.${enc(cur.product_id)}&select=status`);
  if (prod?.status === 'archived') throw new HttpError(400, 'This product is archived.');
  const site = await one<{ name: string; active: boolean }>(`pb_websites?id=eq.${enc(cur.website_id)}&select=name,active`);
  if (!site) throw new HttpError(404, 'The website for this listing no longer exists.');
  if (!site.active) throw new HttpError(400, `${site.name} is switched off — turn it on in Websites first.`);
  const l = await claimPublish(id, true);
  if (!l) {
    throw new HttpError(409, ['queued', 'generating'].includes(cur.status)
      ? 'This listing is waiting for the AI to write it — try again in a minute.'
      : 'This listing is being published right now — try again in a minute.');
  }
  return { ok: true, listing: await publishOne(l, { manual: true, putBack: cur.status === 'skipped', userId, budget: newBudget() }) };
}

export async function unpublishListing(b: Body, userId: string | null) {
  await unpublish(uuid(b.listing_id, 'listing_id'), userId);
  return { ok: true };
}
