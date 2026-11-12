// Shopify GraphQL Admin API: credentials, one request helper, connection test
// and the "Online Store" publication id.
// Credentials (pb_website_secrets, service role only):
//   token              → access_token (shpat_… from a legacy custom app)
//   client_credentials → POST https://{shop}/admin/oauth/access_token
//                        {grant_type:'client_credentials', client_id, client_secret};
//                        the token is cached with token_expires_at and refreshed
//                        when less than 1 hour is left (or Shopify rejects it).
import { enc, insert, nowIso, one, patch } from './db.ts';
import { HttpError, fetchT } from './http.ts';
import type { SecretsRow, WebsiteRow } from './types.ts';

const TIMEOUT = 30_000;
export const REQUIRED_SCOPES = ['write_products', 'read_products', 'write_publications', 'read_publications', 'write_inventory']; // write_inventory: a size is switched between counted (sold out) and not counted (in stock)
/** Playbook's prices are rupees: a store that sells in another currency would show ₹2,499 as 2,499 of its own. */
export const CURRENCY = 'INR';
export const wrongCurrency = (name: string, code: string) => `${name}: this store sells in ${code}, and Playbook's prices are in rupees (${CURRENCY}). Nothing is sent there, so a rupee price is never shown as ${code}.`;
export const noChannel = (name: string) => `${name}: this store has no Online Store sales channel, so products would be saved there but no shopper could see them. Add the Online Store channel in Shopify, then test again.`;

/** "https://My-Shop.myshopify.com/" → "my-shop.myshopify.com" */
export const shopHost = (d: string) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

/** The store's host, or an error — credentials are only ever sent to a …myshopify.com address
 *  (pb_websites.shop_domain is staff-editable, so it is checked before every request). */
export function validShop(site: WebsiteRow): string {
  const h = shopHost(site.shop_domain);
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(h)) throw new HttpError(400, `${site.name}: use the store's …myshopify.com address as the shop domain (not "${h.slice(0, 60)}").`);
  return h;
}

/** Admin API version: Shopify supports each for 12 months. Older than the oldest supported one
 *  (Shopify would silently answer with another) → the current one. Move both together, see the migration default. */
export const API_VERSION = '2026-10';
const OLDEST_SUPPORTED = '2026-01';
export function apiVersion(site: WebsiteRow): string {
  const v = String(site.api_version || API_VERSION).trim();
  if (!/^\d{4}-\d{2}$/.test(v)) throw new HttpError(400, `${site.name}: the Shopify API version "${v.slice(0, 20)}" is not valid (use e.g. ${API_VERSION}).`);
  return v < OLDEST_SUPPORTED ? API_VERSION : v;
}

export async function secretsOf(websiteId: string): Promise<SecretsRow | null> {
  return await one<SecretsRow>(`pb_website_secrets?website_id=eq.${enc(websiteId)}&select=access_token,client_id,client_secret,token_expires_at,online_store_publication_id`);
}

async function freshClientToken(site: WebsiteRow, s: SecretsRow): Promise<string> {
  if (!s.client_id || !s.client_secret) throw new HttpError(400, `${site.name}: the client ID and secret are not saved yet — add them on the Websites page.`);
  const host = validShop(site);
  const r = await fetchT(`https://${host}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: s.client_id, client_secret: s.client_secret }),
  }, TIMEOUT);
  const out = await r.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (r.status === 404) throw new HttpError(400, `${site.name}: Shopify could not find the store "${host}" — use the …myshopify.com address.`);
  if (!r.ok || !out.access_token) throw new HttpError(400, `${site.name}: Shopify did not accept the client ID / secret — check them in the Dev Dashboard and that the app is installed on this store.`);
  const expires = new Date(Date.now() + Math.max(60, Number(out.expires_in) || 86_399) * 1000).toISOString();
  await insert('pb_website_secrets', [{ website_id: site.id, access_token: out.access_token, token_expires_at: expires }], { onConflict: 'website_id', mode: 'merge', select: 'website_id' });
  return out.access_token;
}

async function tokenFor(site: WebsiteRow, force = false): Promise<string> {
  const s = await secretsOf(site.id);
  if (site.auth_mode === 'client_credentials') {
    const left = s?.token_expires_at ? new Date(s.token_expires_at).getTime() - Date.now() : 0;
    if (!force && s?.access_token && left > 3600_000) return s.access_token;
    return await freshClientToken(site, s || ({} as SecretsRow));
  }
  if (!s?.access_token) throw new HttpError(400, `${site.name}: no access token is saved yet — add it on the Websites page.`);
  return s.access_token;
}

interface GqlReply<T> { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] }

async function rawGql<T>(site: WebsiteRow, token: string, query: string, variables: Record<string, unknown>, ms: number): Promise<{ status: number; body: GqlReply<T> }> {
  const r = await fetchT(`https://${validShop(site)}/admin/api/${enc(apiVersion(site))}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  }, ms).catch((e) => {
    throw new HttpError(504, e instanceof DOMException ? `${site.name}: Shopify took too long to answer.` : `${site.name}: could not reach Shopify — check the shop domain.`);
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as GqlReply<T> };
}

/** One GraphQL call with a plain-sentence error for every failure. A rejected
 *  client-credentials token is refreshed once and the call retried. `ms` = time limit of the call. */
export async function gql<T>(site: WebsiteRow, query: string, variables: Record<string, unknown> = {}, ms = TIMEOUT): Promise<T> {
  validShop(site); apiVersion(site); // fail before any credential is read or sent
  let res = await rawGql<T>(site, await tokenFor(site), query, variables, ms);
  if (res.status === 401 && site.auth_mode === 'client_credentials') res = await rawGql<T>(site, await tokenFor(site, true), query, variables, ms);
  const { status, body } = res;
  const name = site.name;
  if (status === 401) throw new HttpError(400, `${name}: Shopify rejected the access token — save the website's credentials again.`);
  if (status === 402) throw new HttpError(400, `${name}: this Shopify store is frozen or unpaid.`);
  if (status === 403) throw new HttpError(400, `${name}: the Shopify app is missing a permission for this — check its access scopes.`);
  if (status === 404) throw new HttpError(400, `${name}: Shopify could not find this store or API version — check the shop domain (…myshopify.com).`);
  if (status === 423) throw new HttpError(400, `${name}: this Shopify store is locked.`);
  if (status === 429) throw new HttpError(503, `${name}: Shopify asked us to slow down — it will be tried again shortly.`);
  if (status >= 500) throw new HttpError(503, `${name}: Shopify is having trouble right now (${status}) — it will be tried again.`);
  const err = body.errors?.[0];
  if (err) {
    const code = err.extensions?.code || '';
    if (code === 'THROTTLED') throw new HttpError(503, `${name}: Shopify asked us to slow down — it will be tried again shortly.`);
    if (code === 'ACCESS_DENIED') throw new HttpError(400, `${name}: the Shopify app is missing a permission — ${String(err.message || '').slice(0, 160)}`);
    throw new HttpError(400, `${name}: Shopify said "${String(err.message || 'unknown error').slice(0, 200)}".`);
  }
  if (!body.data) throw new HttpError(502, `${name}: Shopify sent an empty answer (${status}).`);
  return body.data;
}

const hasScope = (scopes: string[], s: string) => scopes.includes(s) || (s.startsWith('read_') && scopes.includes(`write_${s.slice(5)}`));

const currencies = new Map<string, string>();
/** The store's currency, asked once and kept while this server instance lives. */
export async function shopCurrency(site: WebsiteRow, ms = TIMEOUT): Promise<string> {
  const key = `${site.id}|${shopHost(site.shop_domain)}`;
  const hit = currencies.get(key);
  if (hit) return hit;
  const code = String((await gql<{ shop: { currencyCode: string } }>(site, '{ shop { currencyCode } }', {}, ms)).shop?.currencyCode || '');
  if (code) currencies.set(key, code);
  return code;
}

/** shop name + granted scopes + currency + the Online Store channel. The website counts as connected
 *  (connected_at, which the "On" switch asks for) only when it can really be used: every permission is there,
 *  the store sells in rupees and it has a channel to show products on. `problems` = the last two, in words. */
export async function testConnection(site: WebsiteRow): Promise<{ shop_name: string; scopes: string[]; missing_scopes: string[]; currency: string; problems: string[] }> {
  try {
    const d = await gql<{ shop: { name: string; currencyCode: string }; currentAppInstallation: { accessScopes: { handle: string }[] } }>(site,
      '{ shop { name currencyCode } currentAppInstallation { accessScopes { handle } } }');
    const scopes = (d.currentAppInstallation?.accessScopes || []).map(a => a.handle);
    const missing = REQUIRED_SCOPES.filter(s => !hasScope(scopes, s));
    const shop_name = d.shop?.name || '', currency = String(d.shop?.currencyCode || '');
    const problems = currency && currency !== CURRENCY ? [wrongCurrency(site.name, currency)] : [];
    // Without read_publications the channel cannot be looked up (the missing permission says so); a lookup that fails is not "no channel".
    if (hasScope(scopes, 'read_publications') && !(await onlineStoreId(site).catch(() => 'unknown'))) problems.push(noChannel(site.name));
    const notes = [...(missing.length ? [`The Shopify app is missing these permissions: ${missing.join(', ')}.`] : []), ...problems];
    await patch('pb_websites', `id=eq.${enc(site.id)}`, { shop_name, connected_at: notes.length ? null : nowIso(), last_error: notes.join(' ') || null });
    return { shop_name, scopes, missing_scopes: missing, currency, problems };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await patch('pb_websites', `id=eq.${enc(site.id)}`, { last_error: msg })
      .catch((w) => console.error('pb_websites last_error write failed', w instanceof Error ? w.message : w));
    throw e;
  }
}

/** The "Online Store" publication id (cached in pb_website_secrets). null when the store has none. */
export async function onlineStoreId(site: WebsiteRow, ms = TIMEOUT): Promise<string | null> {
  const s = await secretsOf(site.id);
  if (s?.online_store_publication_id) return s.online_store_publication_id;
  // Sales channels only first: a store with many markets or B2B catalogs has more than one page of publications.
  let hit: { id: string } | undefined;
  for (const only of ['first: 100, catalogType: APP', 'first: 100']) {
    const d = await gql<{ publications: { nodes: { id: string; catalog: { title: string } | null }[] } }>(site,
      `{ publications(${only}) { nodes { id catalog { title } } } }`, {}, ms);
    hit = (d.publications?.nodes || []).find(n => /^online store$/i.test(String(n.catalog?.title || '').trim()));
    if (hit) break;
  }
  if (!hit) return null;
  await insert('pb_website_secrets', [{ website_id: site.id, online_store_publication_id: hit.id }], { onConflict: 'website_id', mode: 'merge', select: 'website_id' });
  return hit.id;
}
