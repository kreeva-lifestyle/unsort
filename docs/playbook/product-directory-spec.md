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
   is missing (and, since 2026-11-12, fabric, colour or a photo: the gate, see
   "One store, one voice"), else `ready` and route (step 2). On AI error: back to `new`
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
   (product, website) with `status='queued'`, `rule_id`: a waiting listing
   (queued / review / failed, or `publishing` with claimed_at null) is queued
   again; one skipped by routing itself (error NO_MATCH, or ARCHIVED while
   the product was archived) and not on Shopify is queued again; a
   `published` one whose price is not locked is re-priced from the current
   cost / pricing / rule and set to `publishing` (`review` on review sites) —
   no new AI call; a listing staff removed (`skipped`) or one a run holds is
   left alone. Exclude → a waiting listing not on Shopify becomes `skipped`
   (NO_MATCH); one on Shopify is reported back as `warning`. Routing runs per
   product (after a read, on save, "Check websites again"); `route_website`
   sends the Ready products already in the directory to one website (run when
   it is switched on, or from "Send matching products now").
   Generate / publish refuse a product in `needs_info` (listing fails with a
   plain error and is queued again when routing runs on the Ready product);
   generate re-checks the product facts before saving and re-queues the
   listing when they changed while the AI wrote.
3. **Generate** — listings `queued` (or `generating` claimed > 5 min ago):
   claim (`generating`), price, then content:
   - **Price** (₹, from cost): `p = cost × (1 + markup_pct/100) + add_flat`
     (markup/add from the rule's `price_override` when set); rounding:
     `none` → 2 dp; `nearest_10` → round to 10; `end_99` → ceil to next
     ...99 (e.g. 1234 → 1299; 1299 stays); `end_49_99` → next ...49 or ...99;
     then `max(p, min_price)`. `compare_at_pct > 0` → compare_at =
     round(p × (1 + pct/100)) with the same rounding; else null. Locked
     `price` is kept.
   - **Content** (rewritten 2026-11-12: the prompt, output and checks are now
     in "One store, one voice" below; what follows is the part that still
     holds): one Claude call per listing with the site's
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
     generated_at. Hand edits: a field given a value joins `locked`; a field
     emptied leaves `locked` (handed back to the AI / the pricing).
   - **Tags**: first the writer's `extra_tags` join the PRODUCT's own tags
     (`pb_products.tags`, cleaned by the tag engine — see "Tags" — unless
     the product's `tags` is locked); then the listing's tags come from
     `tag_rules.templates` (see types.ts; `{tags}` = one tag per product tag
     the library does not hide), + static, + AI extra tags (max
     ai_extra_max, when ai_extra), apply `case`, trim, dedupe
     (case-insensitive), drop empties, each ≤ 255 chars, at most
     `tag_rules.max_tags` (default 30). Locked `tags` kept. product_type =
     category.
   - Next status by `publish_mode`: `review` → `review` (waits for a person);
     `live` / `draft` → `publishing`.
4. **Publish** — listings `publishing` (and `failed` with attempts < 3 after
   10 min): Shopify GraphQL Admin API (`https://{shop}/admin/api/{api_version}/graphql.json`,
   header `X-Shopify-Access-Token`). `productSet(synchronous: true, input)`
   with: id (when shopify_product_id is set, i.e. update) or new; title,
   descriptionHtml, handle, vendor (vendor name), productType, tags, status
   ACTIVE (live) / DRAFT (draft) — on create and "Put back on site" only, so
   an update keeps the status set in Shopify — seo {title, description},
   metafield playbook.listing_id (create only: productSet replaces the whole
   metafield list on update),
   productOptions [{name:"Size", values:[{name}…]}] when sizes, else
   [{name:"Title", values:[{name:"Default Title"}]}]; variants: one per size
   (optionValues [{optionName:"Size", name}], price, compareAtPrice,
   inventoryItem {tracked: track_inventory}, inventoryPolicy CONTINUE when
   not tracked, DENY when tracked — new variants only), files: each photo `{originalSource: <public url>,
   alt: image_alts[i], contentType: IMAGE}` (only on create, or when photos
   changed). Then (live only) `publishablePublish` to the "Online Store"
   publication (id cached in pb_website_secrets.online_store_publication_id;
   needs read/write_publications — a missing scope is logged as a warning in
   listing.error but the listing still counts as published). Save
   shopify_product_id, shopify_status, published_at; status `published`.
   A price typed by hand gets its compare-at from the site's pricing at
   publish time. A lost create is found again by the listing's handles
   (current, `-<id6>`, and the ones sent by earlier failed publishes, logged
   in pb_activity) + the metafield. API version: `pb_websites.api_version`
   (default 2026-10); one older than the oldest supported (2026-01) is
   raised to the default.
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

Time budget per `work` call: stop starting new items after ~100 s; a read
starts only with 45 s left, a generation with 80 s, a publish with 70 s; at
most 6 reads, 8 generations, 10 publishes per call. The cron's
trigger_pb_worker calls the function only when the steps' own filters would
find work (claims older than 5 min, listings of active websites only; since
20261111090000 also a product queued for "Let AI decide" or made Ready by a
tag change: tag_fill_run, route_due). A queued "Let AI decide" product leaves
the queue first, and that is its claim, so two overlapping runs never fill
the same product.
A routing failure after a read counts towards the reader's 3 tries; after
that the product stays Ready with the note. `pb_settings.automation.paused`
stops the cron (manual actions still work).

## Edge function `pb-products` (verify_jwt false; does its own auth)
POST JSON `{ action, ... }`. Auth: `x-sync-secret` = app_secrets
`pb_worker_secret` (cron / future Telegram bridge) OR a signed-in active
admin/manager/operator (Bearer JWT → /auth/v1/user → profiles role,
is_active). Service role for all DB writes. CORS like listing-ai.
| action | who | body | result |
|---|---|---|---|
| `work` | secret or staff | – | `{ ok, read, routed, generated, published, failed }` |
| `ingest` | secret | `{ source:'telegram'|'import', source_ref, raw_text, vendor_name?, image_urls?[], less_amount?, source_url?, intake_notes?[], sell_price?, price_note?, attributes?{}, sku? }` | `{ ok, product_id, duplicate?, images?, warnings? }` (downloads images into the bucket; `sell_price` / `price_note` = import from website; `attributes` / `sku` accepted from source 'import' only) |
| `import_check` | staff | `{ url }` | preview of another store (see "Import from website") → `{ ok, platform, host, origin, estimate, estimate_in_stock (a count, `'5000+'` when counting stopped at the cap, null when unknown), sample[≤3]{ name, price, currency, image, url, in_stock }, warnings[], vendor_suggestion }` Also `already_here` (products already copied from this website, www. or not: a count on `source_ref`) and `last_vendor` (the vendor of its last run), so a repeat import says "All 136 are already in Playbook", the button reads "Check for new products" / "Import about 14 new products", and the vendor is shown with Change instead of being asked again (owner, 2026-11-12). |
| `import_start` | staff | `{ url, in_stock_only?, use_their_price?, vendor_name?, estimate? }` | validates + detects again, creates the vendor if needed, inserts a `queued` pb_import_runs row (`estimate` → `cursor.estimate`, display only) → `{ ok, run_id, platform, host, warnings[] }`; 409 while a run for that host is queued / running |
| `import_cancel` | staff | `{ run_id }` | `queued` / `running` → `cancelled` (400 when already done / failed / cancelled) → `{ ok }` |
| `import_list` | staff | – | `{ ok, runs[≤20] }` newest first (all columns of pb_import_runs) |
| `read_product` | staff | `{ product_id }` | re-run step 1 now for one product (ignores locked fields) → `{ ok, product, routed, warning? }` |
| `route_product` | staff | `{ product_id }` | step 2 now → `{ ok, routed, repriced, listings, warning? }` |
| `delete_product` | admin/manager | `{ product_id }` | delete for good (`productDelete.ts`): refused (409) while a listing is on Shopify and not Removed, while the AI reads it, or while a listing is being written / sent; then DELETE the product row (photo rows, listings, chosen tags, timeline, copy answers and photo prints cascade in the same statement) and remove its files from the bucket; one `pb_activity` line `deleted` stays (name, code, source, who). Shopify is never touched → `{ ok, photos_left }` |
| `route_website` | staff | `{ website_id }` | step 2 for every Ready product on one active website (new listings + auto-skipped ones back) → `{ ok, queued, matched, more }` |
| `generate_listing` | staff | `{ listing_id }` | step 3 now (keeps locked) → `{ ok, listing }` |
| `publish_listing` | staff | `{ listing_id }` | step 4 now (from review/failed/published = update) → `{ ok, listing }` |
| `unpublish_listing` | staff | `{ listing_id }` | claim the listing as `skipped` first (refused while a run holds it), then set Shopify status DRAFT (on failure the listing goes back) → `{ ok }` |
| `save_credentials` | admin/manager | `{ website_id, auth_mode, access_token?, client_id?, client_secret?, shop_domain? }` | stores in pb_website_secrets, then test → `{ ok, shop_name }`. A different `shop_domain` moves the site to that store: needs full new credentials; site switched off; old secrets wiped; non-skipped listings re-queued without Shopify ids; skipped ones lose their old-store ids |
| `test_connection` | staff | `{ website_id }` | `{ ok, shop_name, scopes[] , missing_scopes[] }`, sets connected_at / last_error |
| `preview_price` | staff | `{ website_id, cost, rule_id? }` | `{ price, compare_at }` |
| `taxonomy_get` | staff | – | categories (pb_settings), attributes with values (+ `uses`), links, per-link `stats {products, lacking}`, `category_products`, `suggestions_pending`, `fill` (latest "Let AI decide" run) |
| `categories_save` | admin/manager | `{ categories[] }` | the reader's category list; links of removed categories are dropped and their products re-gated → `{ ok, categories, regated }` |
| `attribute_save` / `attribute_delete` / `attribute_order` | admin/manager | `{ id?, name, multi?, shopify_prefix? }` / `{ id }` / `{ ids[] }` | create / rename (products of its categories re-gated: "Missing: …" holds the name) / delete (values, links and product values cascade; products re-gated) / order |
| `value_check` | staff | `{ attribute_id, name, exclude_id? }` | live look-alike check → `{ ok, matches[LookAlike], exists }` |
| `value_save` | admin/manager | `{ attribute_id, id?, name, aliases?, force? }` | a new name (or rename) with look-alikes → **409** `{ error, matches }` unless `force`; an alias another value of the same attribute uses → 409 → `{ ok, value }` |
| `value_delete` / `value_merge` | admin/manager | `{ id }` / `{ from, into }` | `pb_value_delete` / `pb_value_merge` (same attribute; products move, from's key + aliases become into's aliases) |
| `category_link_check` / `category_link_save` | staff / admin | `{ category, attribute_id }` / `{ category, attribute_ids[] }` | products lacking it → `{ lacking }`; replace the category's attributes in order and re-gate → `{ to_needs_info, to_ready }` |
| `suggestions_list` | staff | `{ status?, attribute_id? ('none'), page? }` | 20 a page by uses → rows `{ …, example_names[≤3], matches[≤3] }`, `count` |
| `suggestion_act` | admin/manager | `{ ids[≤100], action: add/alias/ignore/move, attribute_id?, value_id?, name?, force? }` | add runs the look-alike check first: rows with look-alikes come back in `conflicts {id: matches}` (not added) unless `force`; add / alias re-run the rules for the example products → `{ done, conflicts, retagged }` |
| `product_values_set` | staff | `{ product_id, value_ids[], attribute_id? }` | staff's choice ('manual') for one attribute or all; checked against the category's allowed values and one-value attributes; locks `tags`; gate; routes it when it became Ready → `{ status, missing, locked, routed }` |
| `retag` | admin/manager | `{ dry_run (default true) }` | the rules again for every unlocked product (AI rows kept where the rules find nothing; 'manual' never touched) → `{ products, locked, changed, to_needs_info, to_ready, sample[≤10] }`; apply in batches of 100 (`pb_product_values_bulk`) |
| `tags_ai_fill` | staff | `{ product_ids? / category? / attribute_id? / needs_info?, missing_only?, now? }` | queue (status ready/needs_info, not locked, missing ≠ {}) → `{ run_id, queued }`; `now` + one product: fill it at once → `{ filled, left, status, missing, routed }` |
| `tags_fill_status` | staff | – | latest run `{ total, done, waiting, filled, left_empty, finished_at }` |
Errors: HTTP 4xx/5xx with `{ error: '<plain sentence>' }`. A SQL `raise exception` from a `pb_tag_*` function reaches the app as its own sentence (SQLSTATE P0001).

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
  cost), Tags (templates with placeholder help — `{tags}` first, "the
  product's cleaned tags (Settings → Tags)" —, static tags, case, AI extra,
  "At most N tags per product" = `max_tags`),
  Content & AI (model, effort, language, brand voice, title template,
  limits, extra instructions, alt text).
- **Vendors** — list, add, edit, deactivate; product count per vendor.
- **Settings** — reader model/effort, the Tags page (categories, attributes, values, suggestions), pause automation,
  "Run now" (calls `work`).
- **Guide** — the user guide in the app + "Download PDF"
  (`/playbook/product-directory-guide.pdf` in `public/`).

## Import from website (owner, 2026-11-08)
"A tool where we enter the website and it scrapes all in-stock products." The
websites are OTHER (competitor) online stores; what is found is added to the
directory as products (`source='import'`) and then read, routed, written and
published like any other product. **The price shown on the other store is OUR
selling price** (not a cost): such a product carries `sell_price` and the
pricing formulas are skipped for it.
Migration: `supabase/migrations/20261108090000_pb_website_import.sql`. Code:
`supabase/functions/pb-products/import/` (tests in `pb-products/test/`, run
with `node --test --experimental-strip-types supabase/functions/pb-products/test/*.test.mjs`).

**Data.** `pb_products.sell_price numeric(12,2)` — "sell at exactly this price
on every website; pricing rules are skipped"; `price_note text` — "Price copied
from example.com on 8 Nov 2026 (shown there as reduced from ₹3999)" or, with the
switch off, "example.com sells it for ₹2299 (seen 8 Nov 2026); the price was
not copied." `pb_import_runs`: `url, host, platform (shopify | woocommerce |
generic | unknown), status (queued → running → done | failed | cancelled),
in_stock_only, use_their_price, vendor_id, cursor jsonb, found, added, skipped
(already imported earlier), out_of_stock (left out), failed, sample jsonb (first
3: name, price, image, url), error, claimed_at, created_by, created_at,
started_at, finished_at, updated_at`. RLS: staff SELECT only — every write is
the edge function's (service role), so the URL is always validated server-side.
Dedupe: `source_ref = '<host>:<Shopify / Woo product id | page path>'` under
the existing unique index on (source, source_ref) → running the same site
again skips what is already here.

**Checks (import/urlCheck.ts).** https only; a public host name (no IP, port,
login, localhost / .local / .internal…); never our own domains
(`aryadesigns.co.in`, `supabase.co`, every `pb_websites.shop_domain`);
redirects (≤ 3) are followed only to hosts that pass the same check (our own
domains included, `setOwnDomains`); photo URLs from the store's data are
checked before the first request too. Where the runtime has `Deno.resolveDns`,
a host whose A / AAAA answers are private (10/8, 127/8, 169.254/16, 172.16/12,
192.168/16, 100.64/10, fc00::/7, fe80::/10…) is refused on every hop. **Gap
left open:** DNS can change between that check and the fetch (rebinding) — the
edge runtime cannot pin the resolved address.
`robots.txt` is read first (our group `DailyOffice-Playbook`, else `*`;
longest rule wins; rules matched by a plain loop, never a regex built from the
site's text; ≤ 500 rules): every request to the site checks its path + query
(every redirect hop too), a probe whose path is disallowed is never fetched,
and a platform whose paths it disallows (`/products.json` and
`/collections/all/products.json`; `/wp-json/wc/store/v1/products`;
`/sitemap.xml`) is refused with a plain sentence, on check and again when the
run starts. robots.txt missing (4xx) = no rules; 5xx or unreachable = "try
again later" (nothing is fetched). Its `Crawl-delay` sets the pace (1–10 s).
A redirect between `example.com` and `www.example.com` on robots.txt is
followed once and that host is stored on the run. Requests: User-Agent
`DailyOffice-Playbook/1.0 (+https://dailyoffice.aryadesigns.co.in)`, booked
per host (the store ≥ 1 s apart or its Crawl-delay; image CDNs 250 ms), 20 s
each, bodies ≤ 3 MB (a bigger body is a 413, never half a page). 429 / 430 /
503 = the store asks us to slow down: the run waits `Retry-After` (30 s – 10 min,
default 60 s) in `cursor.wait_until`, not counted as an error, and the
remaining product pages of that tick are skipped. Parsing is bounded (200 KB
of HTML per page / description) and linear (no regex that can backtrack on a
hostile page); a bad character code (`&#99999999;`) becomes a space, and a
product that still fails to normalise is left out, never its page.

**Detection (import/detect.ts).** Shopify = `GET /products.json?limit=…`
(or `/collections/all/products.json`) answers `{ products: [...] }`;
WooCommerce = `GET /wp-json/wc/store/v1/products?per_page=1` answers an array
(`X-WP-Total` headers give the counts); generic = the sitemap(s) from
robots.txt or `/sitemap.xml` (an index expanded one level, product-looking
sitemaps first, ≤ 50) list product-looking URLs whose pages carry a JSON-LD
`Product`; else unknown (check fails with "could not find a product list").
A Shopify store whose products.json lands on `/password` is refused as
password-protected. Estimate: Shopify counts pages of 250 up to 20 (`capped: true` → "5000+"; pages of 50 when 250 is over 3 MB) and
the in-stock products on them; Woo `X-WP-Total` with and without
`stock_status=instock`; generic the product URLs of ≤ 3 sitemaps (in-stock
unknown). Vendor suggestion: `og:site_name`, else the `<title>` before " | ",
else the host.

**Normalisation (import/normalize.ts) — one product per listing, never per
variant.** `in_stock` = any variant available (Shopify `variants[].available`;
Woo `is_in_stock` / `stock_status = 'instock'`; JSON-LD any offer InStock /
LimitedAvailability / PreOrder); Shopify `price` = the lowest price among the
variants ON SALE (sold-out ones only when all are — this becomes our selling
price), `compare_at` = the compare-at of a variant at that same price, only when
above it (never paired across variants); Woo minor units ÷
10^currency_minor_unit, compare-at = regular above sale; JSON-LD `price` /
`lowPrice` ("Rs. 1,299" → 1299), `@type` as `Product`, an IRI or
`ProductGroup` (offers from `hasVariant`), raw newlines in the JSON tolerated; `sizes` = the values of the
option / attribute named Size (variants' values first); `color` = the Color
option when it has exactly one value; images in the store's order, https only,
at most 10 (ingest's limit); description = body HTML → plain text (6000 chars).

**Store facts → `pb_products.attributes` (import/meta.ts, 2026-11-08).** "Can
we get all meta information like price, title, description, manufacturer name
etc." Every fact the store exposes is kept as a plain string (≤ 500 chars)
under these keys (`IMPORT_ATTRS`), ONLY when the store gives it — a key is
never guessed, and brand is never copied into manufacturer:

| key | Shopify | WooCommerce | JSON-LD / page |
|---|---|---|---|
| `brand` | `vendor` | `brands[]`, else attribute "Brand" | `brand.name` / `brand` |
| `manufacturer` | product page JSON-LD | product page JSON-LD | `manufacturer.name` |
| `product_type` | `product_type` | category names, comma-joined | `category` |
| `store_tags` | `tags`, comma-joined | tag names, comma-joined | — |
| `sku` | first variant SKU (also the `sku` column) | `sku` | `sku` / `mpn` |
| `barcode` | first variant `barcode` | `global_unique_id` | `gtin13` / `gtin` / `gtin14/12/8` / `ean` |
| `weight` | first variant `grams` → "750 g" / "1.5 kg" | `weight` + `weight_unit` (a bare number with no unit is not stored) | `weight` value + unit (KGM → kg, GRM → g) |
| `compare_at_price` | "₹3,999" when above the price | regular price above the sale price | — |
| `currency` | the store's `/meta.json` (once per run, `cursor.currency`); else the product page's `og:price:currency` ONLY when its `og:price:amount` is one of the product's prices (a page converted for the visitor's country is ignored) | `currency_code` | offer `priceCurrency` |
| `seo_title` / `seo_description` | product page `<title>` (else `og:title`) / `meta[name=description]` (else `og:description`) | same, from the permalink | same page |
| `material` / `colour` | options named Material or Fabric / Colour (all values) | attributes of those names | `material` / `color` |
| `source_page_url` | the product page | the permalink | the page |
| `source_created_at` / `source_published_at` (owner, 2026-11-12) | `created_at` / `published_at` as ISO UTC (`storeDate`: nothing for an unreadable date, one before 2000 or in the future) | — (the Store API gives no date) | — |

The product page (Shopify / Woo) is fetched ONCE per new product
(`import/enrich.ts`): same site (www. or not) and robots.txt-allowed only, a
redirect off the site not followed, paced like every request, 10 s timeout; a
page that fails leaves the product as the list gave it. Its JSON-LD only fills
keys the list lacks (the list wins). A non-INR price is never copied, and a
Shopify price whose currency is still unknown is not copied either ($29 must
never become ₹29): `price_note` says so and the product waits in Needs info. Generic stores reuse the product page they already
read. Ingest takes `attributes` and `sku` from `source='import'` only (keys
`a-z0-9_`, ≤ 30, string values). `raw_text` keeps the stripped description and
gains "Product type: …" / "Material: …" lines so the reader can pick the
category and fabric. **The reader never drops or replaces an imported key**
(`mergeReadAttrs`: on an imported product the IMPORT_ATTRS keys are skipped
even on "Read again"; the AI's own keys — work, occasion… — are added beside
them). The writer is not given `compare_at_price`, `currency`,
`source_page_url`, `barcode`, the two source dates or the store's SEO wording
(it writes its own). The dates show on the product page as "Uploaded on their
site" and, when a different day, "On sale there since" (`WebMetaTile.tsx`);
they are what a later "New arrival" rule will read.
Tag templates can use them: `{attr:brand}`, `{attr:product_type}`,
`{attr:manufacturer}`…; `{attr:store_tags}` gives ONE tag per store tag
(with `{size}` too: one per tag × size); an empty key drops the template.

**Run (import/runner.ts, from the worker).** The `work` run advances AT MOST
ONE queued / running run for its first 30 s (`IMPORT_MS`), then releases it
(`claimed_at` null) so read / generate / publish keep ≥ 70 s of starting
time; a stuck claim is taken over after 5 min. **Backpressure
(`importWaits`, worker.ts):** the import step is skipped while ≥ 10 products
wait to be read, ≥ 20 listings to be written or ≥ 20 to be published, so a
5,000-product store moves at the pace of the AI (a day or more) and never
starves Telegram or typed-in products. Per page: Shopify
`/products.json?limit=50&page=N` (a `Link: rel="next"` header — page_info
pagination — replaces the counter, unless it points at the same page; a page
that starts with the same product as the one before ends the run); Woo `?per_page=50&page=N` (+
`&stock_status=instock` when in_stock_only; `X-WP-TotalPages` / a 400 past
the end finish it); generic the next 25 product pages of the current
sitemap (same site, robots.txt-allowed; every URL of a sitemap whose address
says "product", else product-looking URLs; `<loc>` in CDATA read), pages
imported before skipped WITHOUT being fetched, the rest fetched only while 20 s
of the import clock are left (so their products are all added in time). A
generic store that refuses every page fetched counts as a page error (3 → failed). Each in-stock product (out-of-stock
ones count as `out_of_stock` when in_stock_only, else they are imported too)
goes through `ingest()`, three at a time (`import/batch.ts`; Shopify / Woo:
products already imported are looked up ONCE per page and skipped BEFORE their
page is fetched; then each new one's product page, see "Store facts"). Because those
page fetches are paced at ≥ 1 s, a Shopify / Woo page no longer fits one tick:
no new batch starts in the last 10 s of the import clock (`META_RESERVE_MS`),
and the run saves `cursor.skip` + `skip_ref` (the last product handled;
released, still running); the next tick fetches that page again and carries on
after that product (found by its id, so a product added or removed in between
does not shift the run; `skip` is the fallback) — roughly 6–15 new products
per 30 s tick, since photos are downloaded too. Per product: `source_ref`, `raw_text` = name + description + SKU / Sizes /
Colour / Product type / Material lines + "Selling price on host: ₹X" (ONLY when the price is copied, so
the reader never takes another store's price for a cost), `vendor_name`,
`image_urls` (photos fetched one at a time through the same polite fetch,
5 MB each), `source_url`, `sell_price` (when `use_their_price` and the
currency is INR — or unknown on WooCommerce / generic), `price_note`, `attributes`, `sku`. `duplicate: true` → `skipped`;
an ingest error → `failed` (logged). Counters, `cursor` and `sample` are
saved after every page; `done` when the last page is short; `failed` after 3
consecutive page errors (the count rides in `cursor.errors`, the message in
`error` "… (try 1 of 3)") or at once on a 400 of our own (no sitemap, unknown
platform); a run cancelled meanwhile keeps the products already added and
stays cancelled (and is not logged as failed); `MAX_PRODUCTS` = 5,000 NEW
products (added + failed; products already here do not count, so a re-run
gets the rest) or `MAX_SCANNED` = 20,000 looked at → `done` with the note
"Stopped at 5,000 new products — run the import again later for the rest".
One open run per site: checked on check / start (www. or not) and guarded by
the unique index `pb_import_runs_one_open`. `pb_activity`
rows: `import_started`, `import_cancelled`, `import_run` (done / failed with
the counters). `trigger_pb_worker()` also fires while a run is queued /
running and unclaimed.

**Reader / pricing / publish with sell_price.** `reader.ts`: ready needs a
category plus a cost price OR a sell_price (`hasPrice`, types.ts); for a
product with sell_price the AI's `cost_price` is ignored and the prompt says
the price in the text is a selling price. `pricing.ts listingPrice()`: with
sell_price the listing price is EXACTLY sell_price on every website — markup,
add, rounding, min price and any rule `price_override` are skipped; only the
site's compare-at % still applies (as for a price typed by hand). Used by
generate.ts (price) and route.ts (re-pricing a published listing). Routing
rules on `min_cost` / `max_cost` still look at `cost_price` only: an imported
product without a cost does not match a cost-range rule.

**Limits.** ≤ 1 request/s to the other store (or its Crawl-delay; product
pages and its own photos included), 20 s per request (10 s per product page),
3 MB per body, 10 images per product (5 MB each for imports, one at a time,
jpeg / png / webp), 25 product pages per tick on generic stores, 5,000 new
products per run, 20 runs listed, one open run per host at a time. The other
store's text goes to the reader and the writer with a rule to treat it as
facts only (never instructions, links or contact details). Server errors
that are not our own sentences reach the app as "Something went wrong on the
Playbook server." (the details stay in the log).

**Legal note (for the Guide).** Photos and text on another store are that
store's copyright. Playbook rewrites titles and descriptions with the AI for
each website, but photos are copied as they are. Use this only on sites whose
content you are allowed to reuse, or replace the photos before publishing.


## Tags (owner, 2026-11-10) — a controlled taxonomy
Owner: "manually enter all tags and from that AI choose automatically …
structure first category then attribute then attribute tags … tags will grow
a lot", "on simple click adds to our library … we don't want look-alike
tags", "We will create category, attributes and attribute values from the
backend called Tags", "for each attribute of its category a tag is a must",
and "Let AI decide". This replaces the free tag library of the first draft
(never applied). Migration `20261110090000_pb_tags.sql`.

**Model.** `pb_attributes` (name, key unique, `multi`, position,
`shopify_prefix`) → `pb_attribute_values` (name, key, `aliases[]` = "also
known as" keys; unique (attribute, key); the edge refuses an alias another
value of the same attribute uses) → `pb_category_attributes` (category text =
an entry of pb_settings `categories`, attribute, position). A product's
choices: `pb_product_values` (product, value, source `rules` | `ai` |
`manual`). `pb_products.tags` caches the chosen names (taxonomy order),
`missing_attrs` the category's attributes with no value, `route_due` "became
Ready by a tag change", `tag_fill_run` the "Let AI decide" queue
(`pb_tag_fill_runs` counts progress). `pb_tag_suggestions` (phrase, key,
attribute?, status pending/added/aliased/ignored, uses, ≤ 5 example product
ids, source store/ai/text; unique (key, attribute) via an expression index;
an ignored key is never suggested again). RLS: staff read; every write goes
through the edge function (service role). The Tags page also owns the
category list (it moved from Settings).

**Required attributes — the gate.** `pb_products_refresh(ids)` (SQL; twin
`tagGate.ts`): Ready needs a price (cost or copied selling price), a category
and a value for every attribute linked to the category; else Needs info with
`missing_attrs` ("Missing: Colour" on the product page and the list rows).
new / reading / archived never move; a never-read Needs-info product (photos
uploading) is not made Ready. It runs after every value write, link change,
attribute / value delete or merge, category prune, and after a facts save on
the product page (staff may call it). Becoming Ready sets `route_due`; the
worker routes those (≤ 10 a run) unless the action already routed it.
Generation / publishing keep refusing Needs-info products (`NEEDS_INFO`).

**Auto-tagging.** (1) Rules (`tagMatch.ts`, pure): `tagKey` (lower, accents
off, punctuation → spaces) + a small stemmer (`tagText.ts`: sequins → sequin,
printed / printing → print, embroidered / embroidery → embroider) and
whole-word phrase matching of every value name and alias of the category's
attributes in: label lines naming the attribute ("COLOUR :- 2 (Pink, Wine)",
"FABRICS & WORK :- … embroidery-work"; weight 5), the name (4), store tags and
the reader's facts (3), the text (1). A longer phrase beats a shorter one it
covers; a one-value attribute keeps the strongest / earliest. At ingest the
rules run over every attribute (category unknown); the reader then replaces
the rules / AI rows for its category. (2) AI (`tagPrompt.ts`): the reader's
ONE call gets, per attribute linked to any category, an enum of allowed names
+ `other` phrases, and the category → attributes map; only attributes the
rules left empty take the AI's choice; "pick the closest value when the
evidence reasonably supports it, never invent one". 'manual' attributes and
locked `tags` are never touched. (3) "Let AI decide" (`tagFill.ts`): a
values-only pass (reader model, text + 1 photo) for the empty required
attributes, 'add' mode; queued by `tags_ai_fill`, run by the worker after
read / write / publish (≤ 5 a run, 35 s needed), or at once from the
product page.

**Suggestions and the look-alike guard.** Candidates: store tags matching
nothing (after the junk filter `tagClean.ts`: `_…`, SIZE_CHART, label_…,
codes, a category's own name), unmatched label-line items (with that
attribute), the AI's `other` phrases; anything already a value / alias is
dropped; an unassigned one takes its closest look-alike's attribute.
`lookAlikes` (`tagLook.ts`) compares a phrase with every value + alias of
every attribute: same key, same stem, same words in another order, the Hindi
/ Hinglish list (`tagDict.ts`: kala → black, kadhai → embroidery, gota →
gota patti…), a colour shade (rani pink → pink), Damerau–Levenshtein ≤ 1
(≤ 6 letters) / ≤ 2, Jaro–Winkler ≥ 0.92; a hit in another attribute is
flagged (`other_attribute`: "Silk" under Work is a Fabric value).

**Websites.** `{tags}` = the chosen values in the site's `tag_rules.tag_style`:
`plain` ("Black", default) or `prefixed` (`${shopify_prefix || attribute}_${name}`);
`max_tags` (default 30) caps the list. New sites' templates include `{tags}`.

Tests: `test/tagText`, `tagClean`, `tagLook`, `tagMatch` (+ tagAuto),
`tagGate`, `tagPrompt`, `tagFill` (queue with a fake database and AI),
`tags`, `runner` (ingest tagging).
## One store, one voice (owner, 2026-11-12)

The owner's words: "different content, alt, title, description, meta desc, meta
title … for each store"; "if a few necessary details are not there … do not
auto generate until everything is ok"; "in the product grid it should show
which website it is pushed"; "AI costing for each listing in Indian rupees
combined of all websites"; "set dollar rate at 95, no setting needed".
Migration: `20261112090000_pb_store_writer.sql`.

### Store profile — `pb_websites.content.profile` (+ `content.title_formula`)
`{ brand_name, market, spelling: 'british'|'american', units: 'inches'|'cm',
audience, angle, keyword_pattern, delivery, stitching, returns,
faq_in_description, custom_fields }`. Older rows lack it; `profile.ts`
(server) and `seoTypes.ts` (client) fill the gaps: brand = the website's name,
british, inches, keyword `{color} {fabric} {category}`, both switches on. A
NEW website starts with `description_words` 200 and `tag_rules.max_tags` 8
(`data/websites.ts NEW_SITE`). `tag_rules.ai_allowed[]`: when not empty, the
AI's extra tags are an enum of it.

### The writer (generate.ts → genPrompt.ts → genWrite.ts)
- **Inputs**: STORE PROFILE, PRODUCT FACTS (no SKU, supplier, the other
  store's SEO text or tags), SOURCE TEXT (`raw_text`, facts reference only),
  VERSIONS ON OUR OTHER STORES (title, SEO, opening line, description and alt
  texts of every sibling listing in review / publishing / published /
  failed-after-writing), PRIMARY KEYWORD, IMAGE COUNT, the photos (≤ 8).
- **Primary keyword**: the site's `keyword_pattern` filled from the product
  (`{color} {fabric} {category} {work} {occasion} {name}`), or the phrase
  typed for that listing (kept: `keyword_locked`).
- **Output**: `{ title, handle, seo_title, seo_description, description_html,
  faq[{q,a}] (≤ 2), image_alts[] (≤ 110 chars), extra_tags[], missing_facts[] }`.
  Description: `wordsMin`–`wordsMax` words (`description_words`, min = 65%):
  opening in the store's angle, 5–7 fact bullets, `<h3>How to wear it</h3>`,
  `<h3>Ordering from <brand></h3>` only when the profile gives delivery,
  stitching or returns. Allowed HTML: p, ul, li, h3, strong, em, br.
- **A program finishes the draft**: pattern title (`title_template`), the SEO
  title always ends `| <brand>` inside `meta_title_max` (`withBrand`), cuts,
  kept (locked) fields; handle = 3–6 clean words with the design code taken
  out (`cleanHandle`), a 4-character suffix only when another listing on the
  same website has it (the store itself is checked at publish).
- **Program checks** (`seoCheck.ts`, in place of the writer's self check).
  HARD: a run of 5+ words shared with the source text or another version (a
  run counts only with ≥ 3 words that are neither the product's fact words,
  numbers nor joining words, so "comes with Kurta, Pant and Dupatta" may
  repeat); same title / SEO title / first four words as another version;
  keyword not exactly once in the AI title, missing from the first 50 words,
  or not exactly once in the SEO title; SEO title not ending with the brand;
  supplier name, design code, link, email, phone; "No. 1", scarcity, review
  claims; a number in "Ordering from" that the profile does not give.
  SOFT (noted only): SEO description outside min–max, description over
  115% of the limit, repeated alt texts, keyword more than 3 times, the
  humanCopy tells.
- **One rewrite**: any problem → one more call with the draft and the list
  of fixes (text only, no photos; needs 45 s left). The better draft is kept
  (fewer hard problems, then fewer in all); both calls are paid for
  (`ai_cost_usd`, activity `generated` `details.usd`, `rewrote`, `problems`).
- **Next status**: a HARD problem → `review` with
  `error = 'Check before it goes out: …'` whatever the publish mode;
  otherwise as before (review → `review`, live / draft → `publishing`).
- **One at a time per product**: a listing whose sibling (lower id) is being
  written right now goes back to `queued` (manual: 409), so the later one can
  be told what the earlier one says.

### Beside the listing — `private.pb_listing_seo`
`listing_id (pk, fk cascade), keyword, keyword_locked, faq jsonb, faq_locked,
missing text[], notes text[], rewrites, updated_at`. The `private` schema is
not served by the API; `pb_listing_seo_get(p_ids uuid[])` and
`pb_listing_seo_put(p_listing uuid, p_set jsonb)` (SECURITY DEFINER, only the
keys present change) let in the service role and signed-in staff and raise
for anyone else. The writer stores keyword, faq (unless `faq_locked`), missing
facts and every check sentence after each generation; staff edits from the
listing editor set the `_locked` flag (an emptied value hands it back).

### On Shopify
- `faq_in_description`: `<h3>Questions</h3>` + one `<p><strong>q</strong><br>a</p>`
  per question is appended to `descriptionHtml` at publish (never stored in
  `description_html`).
- `custom_fields`: after `productSet`, `metafieldsSet` writes
  `custom.fabric`, `custom.work`, `custom.colour`, `custom.occasion`,
  `custom.set_contents` (single_line_text_field, from the product's facts by
  program, empty ones not sent) and `custom.faq` (rich_text_field: question in
  bold, answer below). `metafieldsSet` touches only those keys. A refusal is a
  warning on the listing; the product is still published.

### The Ready gate — necessary details
`pb_products_refresh` (and `tagGate.ts`): Ready needs a price (cost or copied
selling price), a category, a fabric, a colour, at least one photo
(`pb_product_images.kind = 'image'`) and a value for every attribute of the
category. `missing_attrs` stays the required TAG attributes only; the app
names the other gaps from the product itself (`seoTypes.ts missingDetails`):
"Needs info · Missing: Cost price, Fabric, Photo, Colour". Adding a photo on
the product page re-applies the gate.

### AI cost
`pb_ai_costs(p_ids uuid[])` → per product `read_usd, tag_usd, write_usd,
writes` and `pb_ai_cost_since(p_since)` → `usd, products, writes`, both from
`pb_activity.details.usd` of `read`, `tags_filled`, `generated` (SECURITY
INVOKER; partial index `pb_activity_ai_cost_idx`). The app shows rupees at a
fixed ₹95 per dollar (`format.ts USD_INR`, `aiRupees`): on each website tile
and in the listing editor (that listing's last writing), on the product page
(everything for the product) and on the dashboard (this IST month).

### UI
- Websites → **Store profile** (`ProfileSection.tsx`), a seventh section; it
  and Content & AI share the `content` key, so the "Unsaved" mark compares each
  section's own part (`sections.ts sectionPart`).
- Listing editor: the review reason in a review-tinted box, "Also worth a
  look" (the soft notes) and the facts the writer missed
  (`detail/ListingSeo.tsx`), **Search phrase** and the two **Questions**
  (saved with the editor's Save through `useListingSeo`).
- Product list: the phone row names the websites ("Live on Kreeva, Arya",
  the most urgent group first, the live one always); the desktop card already
  had one dot + name per website.

## Already added? (owner, 2026-11-12)
"If we scrape from multiple websites of the products which come from Telegram,
how will we judge whether it was uploaded earlier?" — answered in three steps,
cheapest first. Records are **linked, never merged**; a look-alike search with
the AI was considered and dropped by the owner.
Migration `20261112150000_pb_duplicates.sql`.

### 1. The same post or page again
`pb_products.source` + `source_ref` (`telegram`: chat + message; `import`:
`<host>:<id on that site>`). `ingest.ts findDup` returns the product that
already has that reference; the importer's `known()` skips it before fetching
("already here"). Both treat a host and its `www.` twin as one
(`import/body.ts hostTwin`, `refTwin`). A repeat import never updates the
price or stock of what it skips.

### 2. Design code + colour
- `pb_code_key(sku)`: letters{1,6} + digits{2,6} (+ one attached letter) at
  the start of the SKU, spaces / dashes / case ignored, leading zeros dropped:
  `KB 302`, `kb-302`, `KB 302 XS BLUE` → `KB302`. A bare number (`302`,
  `D.No 302`) → `#302`. No SKU or no code → null (never matched).
- `pb_code_num(sku)`: the number alone, for "same number, other letters".
- `pb_colour_keys(sku, color)`: the words after the code minus size words
  (`KB 264 ROYAL BLUE XS` → `{royalblue}`), else the product's colour split
  on `, / |`.
- `private.pb_dup_scan(p_ids)` pairs a product with every other non-archived
  product that has the same key, or (same vendor) the same number:

  | Pair | kind | how |
  |---|---|---|
  | same vendor, same key (not bare), colours overlap or one side has none | `held` on the later product, `original` on the earlier | `code` |
  | same vendor, same key, both have colours and none in common | `colour` | `code` |
  | same key, another or no vendor | `maybe` | `other_vendor` |
  | same vendor, the same bare number (`302` / `D.No 302`) | `maybe` | `code` |
  | same vendor, same number, other letters (`KB 25` / `NKB 25`) | `maybe` | `near_code` |

  A person's answer (`private.pb_dup_verdicts`, one row per pair, `a < b`)
  wins: `different` and `colour` release the pair, `same` keeps it held.
- `pb_dup_matches(p_ids)` (staff / service role) is what the app reads;
  `pb_dup_verdict_set(a, b, verdict)` saves one pair's answer;
  `pb_dup_answer(p_id, p_others[], verdict)` is the tap on the product page
  — every pair's answer plus what follows (archive, or the gate re-applied)
  in one transaction, SECURITY INVOKER;
  `pb_dup_held(p_id)` gives the gate the earliest product this one is held
  for (SECURITY DEFINER with no role check: the gate runs for whoever saves
  a product, and it gives away one id).
- **The Ready gate** (`pb_products_refresh`): a product that would be Ready
  stays `needs_info` while `pb_dup_held(id)` is not null. Only `ready` /
  `needs_info` products are asked (never one that is new, being read or
  archived), and only the LATER product of a pair is ever held. Indexes: `pb_products_code_key_idx`,
  `pb_products_code_num_idx` (both skip archived rows).

### 3. The same photo, saved again
Migration `20261112170000_pb_photo_prints.sql`, edge function
`pb-photo-prints` (verify_jwt false; takes only `x-sync-secret`). No AI, no
paid service, no library.
- **The print** (`print.ts`): the photo averaged to a 64 × 64 brightness grid,
  a cosine transform of it, the 16 × 16 slowest patterns (without the flat
  average) each turned into one bit by their median → 256 bits. The same
  picture at another size / quality / brightness differs by 0–14 bits;
  another picture by ~128 (measured on real product photos: other poses of
  the same dress 96–146). Colour is not in it. A crop of more than ~2 %, a
  mirror image and a different photo do not match.
- **Reading the photo** (`jpegDc.ts`): the stored photos are 15–20 megapixel
  originals, which do not decode inside an edge function's 2 s of CPU. A JPEG
  keeps each 8 × 8 block's average (its DC value); the reader takes only
  those and steps over the detail — 20–50 ms a photo, a few MB of memory.
  Baseline and progressive, any chroma layout, restart markers, EXIF
  orientation (the grid is turned upright). Not read: PNG / WEBP, CMYK,
  12-bit, arithmetic-coded; under 256 px a side; a nearly blank picture.
- **Queue**: `private.pb_photo_prints` (one row per photo: `working` / `done`
  / `skipped` + why; a photo with no row is waiting). `pb_photo_claim` hands
  out the newest waiting photo (one claim at a time, advisory lock; a claim
  not answered in 10 minutes is handed out again, 3 times at most);
  `pb_photo_put` saves the print and pairs it. Both service role only.
  `trigger_pb_photo_prints()` (pg_cron `pb-photo-prints`, every minute while
  photos wait; paused with Automation) sends one call, two when more than 40
  photos wait; a call takes up to 20 photos or 500 ms of reading
  (`work.ts BATCH`) — about 20–40 photos a minute. Kept low on purpose: the
  2 s of CPU are counted per worker across the calls it serves (measured:
  8 calls at once, a dozen photos each, were all cut off; a photo costs
  ~20 ms).
- **Pairs**: `private.pb_photo_pairs (a < b, a_image, b_image, apart)` — per
  two products their closest two photos, kept when ≤ 40 bits apart; found at
  write time (one new print against all prints: a popcount scan).
- **Shown** through `pb_dup_matches` = the design-code scan, then
  `private.pb_photo_scan` for pairs the scan said nothing about: `apart ≤ 32`
  → `kind = 'maybe'`, `how = 'photo'`, `other_photo` = the photo that
  matched. Left out: a picture that pairs this product with more than 8
  others (a size chart, a banner). A photo match never holds a product; a
  person's "It is a copy" is a verdict `same`, which `pb_dup_scan` always
  carries (so a restored copy is held by the gate, whatever found it).

### UI
- Product page: `detail/DupTile.tsx` — "This looks already added" (held,
  review-tinted) / "Could this be already added?" (suggestions) / "Same
  design" (other colours, a later copy). Answers, each one `pb_dup_answer` call: **It is a copy** (verdict
  `same` + archive this product), **Another colour**, **Different product**
  (verdict + gate re-applied, so a held product goes on to the websites).
- Product list: "Needs info · Already here as KB 264 WINE XS"
  (`data/duplicates.ts heldLabels`, one RPC per page for its Needs-info rows);
  every row says "from Telegram" / "from bahupalace.com" (`sourceText`); a
  **Source** filter (`ProductFilter.source`: `telegram`, `manual`,
  `import:<host>`).
