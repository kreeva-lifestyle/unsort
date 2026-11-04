// Website actions: save_credentials (admin / manager), test_connection,
// preview_price. Credentials are write-only: stored in pb_website_secrets
// (service role only) and never sent back to the app.
import { type Body, uuid } from './actions.ts';
import { enc, insert, logActivity, one, patch } from './db.ts';
import { HttpError, plain } from './http.ts';
import { computePrice } from './pricing.ts';
import { secretsOf, testConnection } from './shopify.ts';
import { WEBSITE_COLS, type WebsiteRow } from './types.ts';

async function site(b: Body): Promise<WebsiteRow> {
  const s = await one<WebsiteRow>(`pb_websites?id=eq.${enc(uuid(b.website_id, 'website_id'))}&select=${WEBSITE_COLS}`);
  if (!s) throw new HttpError(404, 'That website no longer exists.');
  return s;
}

export async function saveCredentials(b: Body, userId: string | null) {
  const w = await site(b);
  const mode = String(b.auth_mode || '');
  if (!['token', 'client_credentials'].includes(mode)) throw new HttpError(400, "auth_mode must be 'token' or 'client_credentials'.");
  const val = (v: unknown) => String(v ?? '').trim();
  const tok = val(b.access_token), cid = val(b.client_id), csec = val(b.client_secret);
  if ([tok, cid, csec].some(x => x.length > 500)) throw new HttpError(400, 'One of the credentials is too long — paste just the value.');
  // Moving the website to another store: new credentials only, nothing of the
  // old store may follow it (secrets, Online Store id, product ids).
  const newDomain = val(b.shop_domain).toLowerCase();
  if (newDomain && newDomain !== w.shop_domain.toLowerCase()) {
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(newDomain)) throw new HttpError(400, 'Use the store\'s myshopify address, like your-store.myshopify.com.');
    if (mode === 'token' ? !tok : !(cid && csec)) throw new HttpError(400, 'A new store needs its own credentials — paste them for the new store.');
    if (await one(`pb_websites?shop_domain=ilike.${enc(newDomain)}&id=neq.${enc(w.id)}&select=id`)) throw new HttpError(409, 'Another website already uses that store.');
    await patch('pb_websites', `id=eq.${enc(w.id)}`, { shop_domain: newDomain, active: false, connected_at: null, shop_name: null, last_error: null });
    await patch('pb_website_secrets', `website_id=eq.${enc(w.id)}`, { access_token: null, client_id: null, client_secret: null, token_expires_at: null, online_store_publication_id: null }, 'website_id');
    await patch('pb_listings', `website_id=eq.${enc(w.id)}&status=neq.skipped`, { shopify_product_id: null, shopify_status: null, published_at: null, status: 'queued', error: null, claimed_at: null, attempts: 0 });
    await logActivity({ website_id: w.id, action: 'store_moved', details: { from: w.shop_domain, to: newDomain }, user_id: userId });
    w.shop_domain = newDomain;
    w.active = false;
  }
  const cur = await secretsOf(w.id);
  // The cached Online Store id belongs to whichever store was connected before.
  const row: Record<string, unknown> = { website_id: w.id, online_store_publication_id: null };
  if (mode === 'token') {
    if (tok) { row.access_token = tok; row.token_expires_at = null; }
    else if (w.auth_mode !== 'token' || !cur?.access_token) throw new HttpError(400, 'Paste the Admin API access token (it starts with shpat_).');
  } else {
    if (cid) row.client_id = cid;
    if (csec) row.client_secret = csec;
    if (!(cid || cur?.client_id) || !(csec || cur?.client_secret)) throw new HttpError(400, 'Enter both the client ID and the client secret of the Dev Dashboard app.');
    if (cid || csec || w.auth_mode !== 'client_credentials') { row.access_token = null; row.token_expires_at = null; }
  }
  await insert('pb_website_secrets', [row], { onConflict: 'website_id', mode: 'merge', select: 'website_id' });
  if (w.auth_mode !== mode) await patch('pb_websites', `id=eq.${enc(w.id)}`, { auth_mode: mode });
  await logActivity({ website_id: w.id, action: 'credentials_saved', details: { auth_mode: mode }, user_id: userId });
  try {
    const t = await testConnection({ ...w, auth_mode: mode });
    return { ok: true, ...t };
  } catch (e) {
    throw new HttpError(400, `Saved, but the connection test failed: ${plain(e)}`);
  }
}

export async function testSite(b: Body) {
  return { ok: true, ...(await testConnection(await site(b))) };
}

export async function previewPrice(b: Body) {
  const w = await site(b);
  const cost = Number(b.cost);
  if (!Number.isFinite(cost) || cost < 0) throw new HttpError(400, 'Enter a cost price of 0 or more.');
  let override = null;
  if (b.rule_id) {
    const r = await one<{ price_override: { markup_pct?: number; add_flat?: number } | null }>(`pb_routing_rules?id=eq.${enc(uuid(b.rule_id, 'rule_id'))}&website_id=eq.${enc(w.id)}&select=price_override`);
    if (!r) throw new HttpError(404, 'That rule no longer exists on this website.');
    override = r.price_override;
  }
  const { price, compare_at } = computePrice(cost, w.pricing || {}, override);
  return { ok: true, price, compare_at };
}
