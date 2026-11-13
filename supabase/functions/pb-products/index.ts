// pb-products Edge Function — Playbook · Product Directory backend (v1, 2026-11-04).
// Contract: docs/playbook/product-directory-spec.md (pipeline + action table).
//
// Deploy with verify_jwt = false: the function does its own auth (below), and
// the pg_cron worker calls it with the shared secret instead of a user JWT.
//
// Auth (auth.ts):
//   - x-sync-secret header = app_secrets.pb_worker_secret → the cron worker
//     (trigger_pb_worker) or a bridge (Telegram intake lives in pb-telegram);
//   - or Bearer JWT of a signed-in ACTIVE admin / manager / operator.
// All database writes use the service role; credentials never leave the server.
//
// POST JSON { action, ... } → JSON; errors → HTTP 4xx/5xx { ok:false, error:'<plain sentence>' }.
//   work               secret|staff   –                                   → { ok, read, routed, generated, published, failed, imported? }
//   ingest             secret         { source:'telegram'|'import', source_ref, raw_text, vendor_name?, image_urls?[], less_amount?, source_url?, intake_notes?[], sell_price?, price_note?, attributes?{}, sku? } (attributes / sku: source 'import' only)
//                                                                          → { ok, product_id, duplicate?, images?, warnings? }
//   read_product       staff          { product_id }                      → { ok, product, routed, warning? }
//   route_product      staff          { product_id }                      → { ok, routed, repriced, resent, listings, warning? }
//   reprice_website    staff          { website_id }                      → { ok, repriced, kept, more }   (bulk.ts)
//   retry_failed       staff          { website_id? }                     → { ok, retried }                (bulk.ts)
//   reread_failed      staff          {}                                  → { ok, queued }                 (bulk.ts)
//   set_stock          staff          { product_id, in_stock }            → { ok, resent, waiting }        (stock.ts)
//   photos_set         staff          { product_id, order[], remove[] }   → { ok, removed, status, resent, review, reread }  keep these photos in this order, delete those (photosEdit.ts)
//   photos_sync        staff          { product_id }                      → { ok, status, resent, review, reread }  after photos were added in the app: the stores follow
//   copies_archive     staff          {}                                  → { ok, archived, priced, on_site, run_id }  archives the held copies (copies.ts); a bulk change, so it can be reverted
//   bulk_preview       staff          { run_id }                          → { ok, kind, …counts }  what a revert would do now (bulkRevert.ts)
//   bulk_revert        admin|manager  { run_id }                          → { ok, kind, …counts }  takes a bulk change back (bulkLog.ts)
//   delete_product     admin|manager  { product_id }                      → { ok, photos_left }   (409 while it is on Shopify or being worked on)
//   route_website      staff          { website_id }                      → { ok, queued, matched, more }
//   generate_listing   staff          { listing_id }                      → { ok, listing }
//   publish_listing    staff          { listing_id }                      → { ok, listing }
//   unpublish_listing  staff          { listing_id }                      → { ok }
//   save_credentials   admin|manager  { website_id, auth_mode, access_token?, client_id?, client_secret? }
//                                                                          → { ok, shop_name, scopes, missing_scopes }
//   test_connection    staff          { website_id }                      → { ok, shop_name, scopes, missing_scopes }
//   preview_price      staff          { website_id, cost, rule_id? }      → { ok, price, compare_at }
//   import_check       staff          { url }                             → { ok, platform, host, origin, estimate, estimate_in_stock (n | 'n+' | null), sample[3], warnings[], vendor_suggestion }
//   import_start       staff          { url, in_stock_only?, use_their_price?, vendor_name?, estimate? } → { ok, run_id, platform, host, warnings[] }
//   import_cancel      staff          { run_id }                          → { ok }
//   import_list        staff          –                                   → { ok, runs[≤20] }
//   Tags (a controlled taxonomy built on the Tags page; docs/playbook/product-directory-spec.md "Tags"):
//   taxonomy_get       staff          –                                   → { ok, categories, attributes[{…, values[{…, uses}]}], links, stats, category_products, suggestions_pending, fill }
//   categories_save    admin|manager  { categories[] }                    → { ok, categories, regated }
//   attribute_save     admin|manager  { id?, name, multi?, shopify_prefix? } → { ok, attribute }
//   attribute_delete   admin|manager  { id }                              → { ok, regated }
//   attribute_order    admin|manager  { ids[] }                           → { ok }
//   value_check        staff          { attribute_id, name, exclude_id? } → { ok, matches[], exists }
//   value_save         admin|manager  { attribute_id, id?, name, aliases?, force? } → { ok, value } | 409 { error, matches[] }
//   value_delete       admin|manager  { id }                              → { ok, regated }
//   value_merge        admin|manager  { from, into }                      → { ok, moved }
//   category_link_check staff         { category, attribute_id }          → { ok, lacking }
//   category_link_save admin|manager  { category, attribute_ids[] }       → { ok, to_needs_info, to_ready }
//   suggestions_list   staff          { status?, attribute_id?, page? }   → { ok, rows[{…, example_names, matches}], count, page, per }
//   suggestion_act     admin|manager  { ids, action:add|alias|ignore|move, attribute_id?, value_id?, name?, force? } → { ok, done, conflicts{id: matches[]}, retagged }
//   suggestions_nearest admin|manager { ids[≤20] } → { ok, nearest{id: {value_id, value, attribute_id, attribute, why, by}} } (rules, else one AI call, kept)
//   product_values_set staff          { product_id, value_ids[], attribute_id? } → { ok, status, missing, locked, routed } (locks 'tags')
//   retag              admin|manager  { dry_run (default true) }          → { ok, dry_run, products, locked, changed, to_needs_info, to_ready, sample[≤10] }
//   tags_ai_fill       staff          { product_ids? | category? | attribute_id? | needs_info?, missing_only?, now? } → { ok, run_id, queued } | now: { ok, filled, left, status, missing, routed }
//   tags_fill_status   staff          –                                   → { ok, fill }
//
// Pipeline (worker.ts): read (reader.ts) → route (route.ts / routing.ts) →
// generate (generate.ts: pricing.ts, content.ts, tags.ts + the product's values, tagStore.ts) → publish
// (publish.ts / productInput.ts / shopifyProduct.ts / shopify.ts). Every step writes pb_activity.
// Shopify requests go only to a …myshopify.com host on a supported Admin API version (shopify.ts).
// Only pb_product_images rows with kind = 'image' go to the AI and Shopify (videos are for staff).
// A product's less_amount (Telegram "200 Less") is taken off the rate the reader reads (reader.ts).
import * as A from './actions.ts';
import { userOf, whoIs } from './auth.ts';
import { HttpError, corsHeaders, fail, json, plain } from './http.ts';
import { importCancel, importCheck, importList, importStart } from './import/actions.ts';
import { repriceWebsite, rereadFailed, retryFailed } from './bulk.ts';
import { bulkPreview, bulkRevert } from './bulkRevert.ts';
import { copiesArchive } from './copies.ts';
import { photosSet, photosSync } from './photosEdit.ts';
import { deleteProduct } from './productDelete.ts';
import { routeWebsite } from './routeSite.ts';
import { setStock } from './stock.ts';
import { previewPrice, saveCredentials, testSite } from './siteActions.ts';
import * as T from './tagsActions.ts';
import { fillStatus, suggestionAct, suggestionsList, tagsAiFill } from './tagsQueue.ts';
import { suggestionsNearest } from './tagsNearest.ts';
import { productValuesSet, retag } from './tagsProduct.ts';
import type { Caller } from './types.ts';

type Who = 'secret' | 'staff' | 'any' | 'admin';
const ACTIONS: Record<string, { who: Who; run: (b: A.Body, c: Caller) => Promise<unknown> }> = {
  work: { who: 'any', run: (_b, c) => A.doWork(c.kind === 'secret', userOf(c)) },
  ingest: { who: 'secret', run: (b) => A.doIngest(b) },
  read_product: { who: 'staff', run: (b, c) => A.readProduct(b, userOf(c)) },
  route_product: { who: 'staff', run: (b, c) => A.routeOne(b, userOf(c)) },
  delete_product: { who: 'admin', run: (b, c) => deleteProduct(b, userOf(c)) },
  route_website: { who: 'staff', run: (b, c) => routeWebsite(b, userOf(c)) },
  reprice_website: { who: 'staff', run: (b, c) => repriceWebsite(b, userOf(c)) },
  retry_failed: { who: 'staff', run: (b, c) => retryFailed(b, userOf(c)) },
  reread_failed: { who: 'staff', run: (_b, c) => rereadFailed(userOf(c)) },
  set_stock: { who: 'staff', run: (b, c) => setStock(b, userOf(c)) },
  photos_set: { who: 'staff', run: (b, c) => photosSet(b, userOf(c)) },
  photos_sync: { who: 'staff', run: (b, c) => photosSync(b, userOf(c)) },
  copies_archive: { who: 'staff', run: (_b, c) => copiesArchive(userOf(c)) },
  bulk_preview: { who: 'staff', run: (b) => bulkPreview(b) },
  bulk_revert: { who: 'admin', run: (b, c) => bulkRevert(b, userOf(c)) },
  generate_listing: { who: 'staff', run: (b, c) => A.generateListing(b, userOf(c)) },
  publish_listing: { who: 'staff', run: (b, c) => A.publishListing(b, userOf(c)) },
  unpublish_listing: { who: 'staff', run: (b, c) => A.unpublishListing(b, userOf(c)) },
  save_credentials: { who: 'admin', run: (b, c) => saveCredentials(b, userOf(c)) },
  test_connection: { who: 'staff', run: (b) => testSite(b) },
  preview_price: { who: 'staff', run: (b) => previewPrice(b) },
  import_check: { who: 'staff', run: (b) => importCheck(b) },
  import_start: { who: 'staff', run: (b, c) => importStart(b, userOf(c)) },
  import_cancel: { who: 'staff', run: (b, c) => importCancel(b, userOf(c)) },
  import_list: { who: 'staff', run: () => importList() },
  taxonomy_get: { who: 'staff', run: () => T.taxonomyGet() },
  categories_save: { who: 'admin', run: (b, c) => T.categoriesSave(b, userOf(c)) },
  attribute_save: { who: 'admin', run: (b, c) => T.attributeSave(b, userOf(c)) },
  attribute_delete: { who: 'admin', run: (b, c) => T.attributeDelete(b, userOf(c)) },
  attribute_order: { who: 'admin', run: (b) => T.attributeOrder(b) },
  value_check: { who: 'staff', run: (b) => T.valueCheck(b) },
  value_save: { who: 'admin', run: (b, c) => T.valueSave(b, userOf(c)) },
  value_delete: { who: 'admin', run: (b, c) => T.valueDelete(b, userOf(c)) },
  value_merge: { who: 'admin', run: (b, c) => T.valueMerge(b, userOf(c)) },
  category_link_check: { who: 'staff', run: (b) => T.categoryLinkCheck(b) },
  category_link_save: { who: 'admin', run: (b, c) => T.categoryLinkSave(b, userOf(c)) },
  suggestions_list: { who: 'staff', run: (b) => suggestionsList(b) },
  suggestion_act: { who: 'admin', run: (b, c) => suggestionAct(b, userOf(c)) },
  suggestions_nearest: { who: 'admin', run: (b, c) => suggestionsNearest(b, userOf(c)) },
  product_values_set: { who: 'staff', run: (b, c) => productValuesSet(b, userOf(c)) },
  retag: { who: 'admin', run: (b, c) => retag(b, userOf(c)) },
  tags_ai_fill: { who: 'staff', run: (b, c) => tagsAiFill(b, userOf(c)) },
  tags_fill_status: { who: 'staff', run: async () => ({ ok: true, fill: await fillStatus() }) },
};

function allowed(who: Who, c: Caller): string | null {
  if (who === 'any') return null;
  if (who === 'secret') return c.kind === 'secret' ? null : 'Only the automation bridge can use this.';
  if (c.kind !== 'staff') return 'Sign in as a staff member for this.';
  if (who === 'admin' && !['admin', 'manager'].includes(c.role)) return 'Only an admin or manager can change this.';
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
    // Our own sentences (HttpError) and timeouts as they are; anything else (a TypeError…) stays in the log.
    return fail(req, status, e instanceof HttpError || e instanceof DOMException ? plain(e) : 'Something went wrong on the Playbook server.', e instanceof HttpError ? e.extra : undefined);
  }
});
