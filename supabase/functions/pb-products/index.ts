// pb-products Edge Function — Playbook · Product Directory backend (v1, 2026-11-04).
// Contract: docs/playbook/product-directory-spec.md (pipeline + action table).
//
// Deploy with verify_jwt = false: the function does its own auth (below), and
// the pg_cron worker calls it with the shared secret instead of a user JWT.
//
// Auth (auth.ts):
//   - x-sync-secret header = app_secrets.pb_worker_secret → the cron worker
//     (trigger_pb_worker) or the future Telegram bridge;
//   - or Bearer JWT of a signed-in ACTIVE admin / manager / operator.
// All database writes use the service role; credentials never leave the server.
//
// POST JSON { action, ... } → JSON; errors → HTTP 4xx/5xx { ok:false, error:'<plain sentence>' }.
//   work               secret|staff   –                                   → { ok, read, routed, generated, published, failed }
//   ingest             secret         { source:'telegram'|'import', source_ref, raw_text, vendor_name?, image_urls?[] }
//                                                                          → { ok, product_id, duplicate?, images?, warnings? }
//   read_product       staff          { product_id }                      → { ok, product, routed, warning? }
//   route_product      staff          { product_id }                      → { ok, routed, listings }
//   generate_listing   staff          { listing_id }                      → { ok, listing }
//   publish_listing    staff          { listing_id }                      → { ok, listing }
//   unpublish_listing  staff          { listing_id }                      → { ok }
//   save_credentials   admin|manager  { website_id, auth_mode, access_token?, client_id?, client_secret? }
//                                                                          → { ok, shop_name, scopes, missing_scopes }
//   test_connection    staff          { website_id }                      → { ok, shop_name, scopes, missing_scopes }
//   preview_price      staff          { website_id, cost, rule_id? }      → { ok, price, compare_at }
//
// Pipeline (worker.ts): read (reader.ts) → route (route.ts / routing.ts) →
// generate (generate.ts: pricing.ts, content.ts, tags.ts) → publish
// (publish.ts / productInput.ts / shopifyProduct.ts / shopify.ts). Every step writes pb_activity.
// Shopify requests go only to a …myshopify.com host on Admin API 2025-01+ (shopify.ts).
import * as A from './actions.ts';
import { userOf, whoIs } from './auth.ts';
import { HttpError, corsHeaders, fail, json, plain } from './http.ts';
import { previewPrice, saveCredentials, testSite } from './siteActions.ts';
import type { Caller } from './types.ts';

type Who = 'secret' | 'staff' | 'any' | 'admin';
const ACTIONS: Record<string, { who: Who; run: (b: A.Body, c: Caller) => Promise<unknown> }> = {
  work: { who: 'any', run: (_b, c) => A.doWork(c.kind === 'secret', userOf(c)) },
  ingest: { who: 'secret', run: (b) => A.doIngest(b) },
  read_product: { who: 'staff', run: (b, c) => A.readProduct(b, userOf(c)) },
  route_product: { who: 'staff', run: (b, c) => A.routeOne(b, userOf(c)) },
  generate_listing: { who: 'staff', run: (b, c) => A.generateListing(b, userOf(c)) },
  publish_listing: { who: 'staff', run: (b, c) => A.publishListing(b, userOf(c)) },
  unpublish_listing: { who: 'staff', run: (b, c) => A.unpublishListing(b, userOf(c)) },
  save_credentials: { who: 'admin', run: (b, c) => saveCredentials(b, userOf(c)) },
  test_connection: { who: 'staff', run: (b) => testSite(b) },
  preview_price: { who: 'staff', run: (b) => previewPrice(b) },
};

function allowed(who: Who, c: Caller): string | null {
  if (who === 'any') return null;
  if (who === 'secret') return c.kind === 'secret' ? null : 'Only the automation bridge can use this.';
  if (c.kind !== 'staff') return 'Sign in as a staff member for this.';
  if (who === 'admin' && !['admin', 'manager'].includes(c.role)) return 'Only an admin or manager can change store credentials.';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(req, 405, 'Only POST requests are accepted.');
  let body: A.Body = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as A.Body;
  } catch {
    return fail(req, 400, 'The request must be a JSON object.');
  }
  const action = String(body.action || '');
  try {
    const caller = await whoIs(req);
    if (!caller) return fail(req, 401, 'Sign in to DailyOffice again — Playbook is for active staff only.');
    const a = ACTIONS[action];
    if (!a) return fail(req, 400, `Unknown action "${action.slice(0, 40)}".`);
    const denied = allowed(a.who, caller);
    if (denied) return fail(req, 403, denied);
    return json(req, await a.run(body, caller));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(`pb-products ${action}:`, e instanceof Error ? e.stack || e.message : e);
    return fail(req, status, plain(e));
  }
});
