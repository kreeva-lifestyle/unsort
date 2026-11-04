# Playbook · Product Directory — build spec (contract)

Owner request (2026-11-04): every vendor product lands in one directory; rules
decide which product goes to which Shopify website, at what price, with that
site's tags and its own AI-written title / description / SEO (model + effort
chosen per site). Owner answers: **publish fully automatic and live** (each
site can be paused, or set to Draft / Review); **post price = vendor COST**;
**Telegram intake is stitched later** (the `ingest` action is ready for it).

Schema: `supabase/migrations/20261105090000_pb_product_directory.sql`.
Types: `src/playbook/types.ts` (jsonb shapes documented there).

## Pipeline (worker, every minute when there is work)
1. **Read** — products `new` (or `reading` claimed > 5 min ago): claim
   (`status='reading', claimed_at=now()`), send `raw_text` + name/sku + up to
   2 photos (public URLs, image `url` source) to Claude with the
   `pb_settings.reader` model/effort, JSON-schema output:
   `{ name, sku, category (one of pb_settings.categories or ''), fabric,
   color, sizes[], cost_price (number|null), attributes{work, occasion,
   pattern, set_contents, wash_care, notes…} }`. Fill only fields that are
   empty AND not in `locked`. Then `needs_info` if `cost_price` or `category`
   is missing, else `ready` and route (step 2). On AI error: back to `new`
   with `ai_error`, `claimed_at` left so it retries after 5 min; after 3
   errors → `needs_info` with the error.
2. **Route** — for each website with `active=true`: rules of that site,
   enabled, ordered by `position`; the FIRST rule whose conditions all match
   decides (`include` → listing, `exclude` → none). No rule matched →
   `routing_default` ('none' = no listing). Conditions (all given ones must
   match; empty arrays = ignore): vendor_ids contains product.vendor_id;
   categories / fabrics contain the product value (case-insensitive);
   min_cost ≤ cost ≤ max_cost; keywords: any keyword (case-insensitive) in
   name / sku / raw_text / attribute values. Include → upsert `pb_listings`
   (product, website) with `status='queued'`, `rule_id` — never touch a
   listing already `published` or `skipped`, or one being worked on.
3. **Generate** — listings `queued` (or `generating` claimed > 5 min ago):
   claim (`generating`), price, then content:
   - **Price** (₹, from cost): `p = cost × (1 + markup_pct/100) + add_flat`
     (markup/add from the rule's `price_override` when set); rounding:
     `none` → 2 dp; `nearest_10` → round to 10; `end_99` → ceil to next
     ...99 (e.g. 1234 → 1299; 1299 stays); `end_49_99` → next ...49 or ...99;
     then `max(p, min_price)`. `compare_at_pct > 0` → compare_at =
     round(p × (1 + pct/100)) with the same rounding; else null. Locked
     `price` is kept.
   - **Content**: one Claude call per listing with the site's
     `content.model` / `content.effort`, JSON-schema output
     `{ title, description_html, seo_title, seo_description, handle,
     extra_tags[], image_alts[] }`; prompt = product facts (never invent
     fabric/size not given), brand_voice, language, limits (title_max,
     description_words, meta_title_max, meta_desc_max), extra_instructions,
     plus the photos. `title_template`: `{ai_title}` uses the AI title,
     otherwise fill placeholders `{category} {fabric} {color} {vendor}
     {sku} {name} {ai_title}`, collapse spaces, cut to title_max. Handle:
     lowercase, a-z0-9 and '-', max 80, unique-ish (append `-<sku>` or 6
     chars of the product id). description_html: only p, ul, li, strong, em,
     br. Locked fields are kept. Record ai_model, ai_effort, ai_cost_usd,
     generated_at.
   - **Tags**: from `tag_rules.templates` (see types.ts), + static, + AI
     extra tags (max ai_extra_max, when ai_extra), apply `case`, trim,
     dedupe (case-insensitive), drop empties, each ≤ 255 chars. Locked
     `tags` kept. product_type = category.
   - Next status by `publish_mode`: `review` → `review` (waits for a person);
     `live` / `draft` → `publishing`.
4. **Publish** — listings `publishing` (and `failed` with attempts < 3 after
   10 min): Shopify GraphQL Admin API (`https://{shop}/admin/api/{api_version}/graphql.json`,
   header `X-Shopify-Access-Token`). `productSet(synchronous: true, input)`
   with: id (when shopify_product_id is set, i.e. update) or new; title,
   descriptionHtml, handle, vendor (vendor name), productType, tags, status
   ACTIVE (live) / DRAFT (draft), seo {title, description},
   productOptions [{name:"Size", values:[{name}…]}] when sizes, else
   [{name:"Title", values:[{name:"Default Title"}]}]; variants: one per size
   (optionValues [{optionName:"Size", name}], price, compareAtPrice,
   inventoryItem {tracked: track_inventory}, inventoryPolicy CONTINUE when
   not tracked), files: each photo `{originalSource: <public url>,
   alt: image_alts[i], contentType: IMAGE}` (only on create, or when photos
   changed). Then (live only) `publishablePublish` to the "Online Store"
   publication (id cached in pb_website_secrets.online_store_publication_id;
   needs read/write_publications — a missing scope is logged as a warning in
   listing.error but the listing still counts as published). Save
   shopify_product_id, shopify_status, published_at; status `published`.
   Errors: attempts+1, status `failed`, error = short readable text.
   **Credentials**: `auth_mode='token'` → access_token (shpat_… from a legacy
   custom app). `client_credentials` → POST `https://{shop}/admin/oauth/access_token`
   `{grant_type:'client_credentials', client_id, client_secret}` → cache
   access_token + token_expires_at (refresh when < 1 h left). Shopify stopped
   creating legacy custom apps on 2026-01-01; new apps come from the Dev
   Dashboard (same organisation as the store) and use client credentials.
   Scopes: write_products, read_products, write_publications,
   read_publications (+ write_inventory when tracking stock).
5. Every step writes `pb_activity` (action: read, routed, generated,
   published, failed, edited, unpublished…).

Time budget per `work` call: stop starting new items after ~100 s; at most 6
reads, 8 generations, 10 publishes per call. `pb_settings.automation.paused`
stops the cron (manual actions still work).

## Edge function `pb-products` (verify_jwt false; does its own auth)
POST JSON `{ action, ... }`. Auth: `x-sync-secret` = app_secrets
`pb_worker_secret` (cron / future Telegram bridge) OR a signed-in active
admin/manager/operator (Bearer JWT → /auth/v1/user → profiles role,
is_active). Service role for all DB writes. CORS like listing-ai.
| action | who | body | result |
|---|---|---|---|
| `work` | secret or staff | – | `{ ok, read, routed, generated, published, failed }` |
| `ingest` | secret | `{ source:'telegram'|'import', source_ref, raw_text, vendor_name?, image_urls?[] }` | `{ ok, product_id, duplicate? }` (downloads images into the bucket) |
| `read_product` | staff | `{ product_id }` | re-run step 1 now for one product (ignores locked fields) → `{ ok, product }` |
| `route_product` | staff | `{ product_id }` | step 2 now → `{ ok, listings }` |
| `generate_listing` | staff | `{ listing_id }` | step 3 now (keeps locked) → `{ ok, listing }` |
| `publish_listing` | staff | `{ listing_id }` | step 4 now (from review/failed/published = update) → `{ ok, listing }` |
| `unpublish_listing` | staff | `{ listing_id }` | set Shopify status DRAFT, listing → `skipped` → `{ ok }` |
| `save_credentials` | admin/manager | `{ website_id, auth_mode, access_token? , client_id?, client_secret? }` | stores in pb_website_secrets, then test → `{ ok, shop_name }` |
| `test_connection` | staff | `{ website_id }` | `{ ok, shop_name, scopes[] , missing_scopes[] }`, sets connected_at / last_error |
| `preview_price` | staff | `{ website_id, cost, rule_id? }` | `{ price, compare_at }` |
Errors: HTTP 4xx/5xx with `{ error: '<plain sentence>' }`.

## UI (src/playbook/, owner's Playbook rules apply)
`PlaybookApp` keeps the current page in state (NOT the URL hash — DailyWork,
mounted hidden, owns hash routing) and remembers it in localStorage
(`pb-page`). Nav: Dashboard · Products · Websites · Vendors · Settings ·
Guide. Every page component: `export default function X({ addToast }: {
addToast: (msg: string, type?: 'success' | 'error' | 'info') => void })`.
Toasts: Playbook's own (`src/playbook/components/PbToasts.tsx`, hook
`usePbToasts`). Supabase errors → `friendlyError`. Detail views and modals
use `useBackClose` so device Back closes them.
- **Dashboard** — counts: products by status, listings by status per
  website, failures needing attention (tap → Products filtered), automation
  paused banner.
- **Products** — grid/list with first photo, name, vendor, cost, status dot,
  per-website chips (status per site); search (name/sku/raw_text), filter by
  status / vendor / website; paginate 25. "Add product": photos (multiple,
  upload to `playbook-products/<product_id>/<n>.<ext>`), vendor (select or
  new), cost price, SKU, details (paste the post text), optional category /
  sizes → status `new`. Product page: photos, editable facts (editing a
  field adds it to `locked`), "Read again with AI", per-website listings:
  price, title, status, error, Shopify link (`https://{shop}/admin/products/{numeric id}`);
  open a listing → edit title/description/SEO/tags/price (edits lock the
  field), "Regenerate", "Publish now / Update on Shopify", "Approve"
  (review → publishing), "Remove from site" (unpublish). Archive product.
- **Websites** — list + editor with sections: Connection (name, domain,
  auth mode, token or client id/secret — write-only fields, never read back,
  sent to `save_credentials`; Test connection; active switch),
  Publishing (live / draft / review, track inventory), Routing (default +
  ordered rules: include/exclude, conditions: vendors, categories, fabrics,
  cost range, keywords, price override; reorder, enable), Pricing (markup %,
  add ₹, rounding, compare-at %, min price + live preview for a sample
  cost), Tags (templates with placeholder help, static tags, case, AI extra),
  Content & AI (model, effort, language, brand voice, title template,
  limits, extra instructions, alt text).
- **Vendors** — list, add, edit, deactivate; product count per vendor.
- **Settings** — reader model/effort, category list, pause automation,
  "Run now" (calls `work`).
- **Guide** — the user guide in the app + "Download PDF"
  (`/playbook/product-directory-guide.pdf` in `public/`).
