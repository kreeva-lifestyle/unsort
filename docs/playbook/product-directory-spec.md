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
   4 photos (`READ_PHOTOS`; public URLs, image `url` source) to Claude with the
   `pb_settings.reader` model/effort, JSON-schema output:
   `{ name, sku, category (one of pb_settings.categories or ''), fabric,
   color, sizes[], cost_price (number|null), attributes{work, occasion,
   pattern, set_contents, wash_care, notes…} }`. Fill only fields that are
   empty AND not in `locked`. **Photos first (owner, 2026-11-12):** the reader
   compares the post's title and description with the photos; for what can be
   seen (colour, pattern, work, set pieces) the photos win, for the rest the
   text wins. Colour is a plain name from a preferred list (`COLOURS`: a trade
   name such as "Rama" → Teal Blue); the fabric is kept exactly as the post
   writes it (spelling mistakes apart); a sales line is never turned into a
   fact. **The owner's own filing (13 Nov 2026, `readerExamples.ts`):** the
   products a person filed by hand (`category` in `locked`) from the same
   place — an imported product's website (the host in `source_ref`, with or
   without www), a Telegram product's vendor — are the reader's examples: up
   to 8, most words in common with this product first, each with the store's
   own type word ("Pink Cotton Suit Set (the store's own type: Dresses) →
   Salwar Suit"), categories off the list left out. They come after the facts
   in the prompt; a failed lookup only leaves them out. **A fresh read:** "Read again" (every unlocked field), or a product
   read before that is put back to `new` with `ai_read_at` still set (the
   worker then re-judges only name, fabric, colour and the reader's own
   `attributes` keys; sku, category, sizes and cost are filled only when
   empty). On a fresh read the AI's earlier name and colour are not shown to
   it as "already known" unless locked (the fabric always is: it stays, apart
   from a spelling mistake), a reader key it now answers
   with nothing is dropped, and the activity row records
   `changed: { field: [was, now] }` (`readChanges.ts`). The name is built as
   colour + fabric + what it is; when the AI's name carries the fabric but
   opens with another word for the colour, a program puts the product's colour
   there (`readName.ts`). If the AI cannot open one of the photos, the read is
   tried once more with the first two. Then `needs_info` if `cost_price` or `category`
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
     round(p × (1 + pct/100)) with the same rounding; else null. Random
     was price (2026-11-13): when `compare_at_max_pct` is above
     `compare_at_pct`, pct = compare_at_pct + a whole step up to
     compare_at_max_pct, picked from the product id (`comparePct`:
     FNV-1a + fmix32 over the id → [0, 1)), so a product gets the same %
     every time and on every website with the same range; no product (the
     `preview_price` action) → compare_at_pct. A locked price recomputes its
     compare-at the same way. The app's copy (`src/playbook/data/pricing.ts`)
     is checked against the server's by `test/pricingMirror.test.mjs`. Locked
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
     category. (Since 2026-11-20 this is only the listing's first copy: tags
     and product type are worked out again from the product at EVERY send,
     `listingFacts.ts`, and the AI's extra tags are also saved apart in
     `pb_listings.ai_tags` so that needs no AI — see "The store follows the
     product by itself" at the end.)
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
   not tracked, DENY when tracked — new variants only), files: on a create
   each photo `{originalSource: <public url>, alt: image_alts[i],
   contentType: IMAGE}`; on an update see "Shopify sync check" below (a photo
   the store has goes by its id). Then `publishablePublish` to the "Online
   Store" publication (id cached in pb_website_secrets.online_store_publication_id;
   needs read/write_publications — a missing scope is logged as a warning in
   listing.error but the listing still counts as published; only on a create,
   Put back, or after that step failed). Save
   shopify_product_id, shopify_status, published_at; status `published`.
   (Since 2026-11-20: `productType`, `tags` and the custom fields are the
   product's as it is at the send, not the copies saved when the AI wrote;
   the sizes go out in the house format; what was sent is saved in
   `pb_listings.sent` — last section.)
   A price typed by hand gets its compare-at from the site's pricing at
   publish time. A lost create is found again by the listing's handles
   (current, `-<id6>`, and the ones sent by earlier failed publishes, logged
   in pb_activity) + the metafield. API version: `pb_websites.api_version`
   (default 2026-10); one older than the oldest supported (2026-01) is
   raised to the default.
   Errors: attempts+1, status `failed`, error = short readable text (Shopify
   being busy does not count: "Shopify sync check" below).
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
tag change: tag_fill_run, route_due; since 20261120100000 also a listing owed
its product type, tags and fields on a switched-on website: `facts_due`, never
tried or last tried 5 minutes ago, not while paused). A queued "Let AI decide" product leaves
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
| `work` | secret or staff | – | `{ ok, read, routed, generated, published, failed }`; since 2026-11-20 also `facts` when above 0: the listings whose product type, tags and fields were settled in this run (`WorkResult.facts`, `factsSend.ts`) |
| `ingest` | secret | `{ source:'telegram'|'import', source_ref, raw_text, vendor_name?, image_urls?[], less_amount?, source_url?, intake_notes?[], sell_price?, price_note?, attributes?{}, sku? }` | `{ ok, product_id, duplicate?, images?, warnings? }` (downloads images into the bucket; `sell_price` / `price_note` = import from website; `attributes` / `sku` accepted from source 'import' only) |
| `import_check` | staff | `{ url }` | preview of another store (see "Import from website") → `{ ok, platform, host, origin, estimate, estimate_in_stock (a count, `'5000+'` when counting stopped at the cap, null when unknown), sample[≤3]{ name, price, currency, image, url, in_stock }, warnings[], vendor_suggestion }` Also `already_here` (products already copied from this website, www. or not: a count on `source_ref`) and `last_vendor` (the vendor of its latest run; null when that run had none — the vendor is optional, 2026-11-13), so a repeat import says "All 136 are already in Playbook", the button reads "Check for new products" / "Import about 14 new products", and the vendor is shown with Change instead of being asked again (owner, 2026-11-12). And `maker { checked, named, names[≤5]{ name, products }, own }` (2026-11-13, `import/maker.ts`): do the products name who makes them — a JSON-LD manufacturer, a "Manufactured / Marketed / Packed by …" or "Manufacturer: / Brand: / Vendor: / Sold by:" line in the description, or a brand / vendor field that is not the website's own name (its host's first part or site name: `own`). Counted on every Shopify product the estimate reads, 20 WooCommerce products, or the generic sample; the sheet shows "Manufacturer named" (≥ 80 %), "named on some products" or "not named". `maker.names` lists up to 30; `last_skip_makers` = the manufacturers the website's latest import left out. |
| `import_start` | staff | `{ url, in_stock_only?, use_their_price?, vendor_name?, estimate?, skip_makers? }` | validates + detects again, creates the vendor if needed — `vendor_name` is optional (owner, 2026-11-13: "vendor not mandatory while scrapping from website"): empty or absent, the run has no vendor and its products come in without one (the website's own name is not made a vendor; until 2026-11-13 it was required and the sheet prefilled it with the site's name) —, inserts a `queued` pb_import_runs row (`estimate` → `cursor.estimate`, display only) → `{ ok, run_id, platform, host, warnings[] }`; 409 while a run for that host is queued / running. `skip_makers` (2026-11-13, ≤ 50 names): manufacturers to leave out — the run passes over a product that names one (`import/maker.ts skipsMaker`: its list data before its page is fetched, its page's JSON-LD manufacturer after), counted in `pb_import_runs.maker_skipped` (20261113200000_pb_import_skip_makers.sql); a product that names none is always imported |
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
| `store_setup` | admin/manager | `{ website_id }` | (2026-11-17, SuratMandi) on the store: a product metafield definition (namespace `custom`, pinned, storefront PUBLIC_READ) per Playbook attribute — key = the attribute key in snake case, `list.single_line_text_field` when multi, else `single_line_text_field` — plus `set_contents` and `faq` (rich text); then a collection per category (`collectionCreate(collection:)` with one conditions source: product type EQUALS the category; handle from the name) put on the Online Store. Kept when there (a definition with the same key, whatever its type — 2026-11-17 "if already made then merge with it": publishing fills a plain-text one with the values joined by commas, `fieldsSend.ts`; a collection with the same handle or title); nothing is deleted or changed. Per item `{ name, status: made/kept/failed, note? }`; a store-wide refusal (credentials, permission, frozen) throws once. `storeSetup.ts`, `storeFields.ts`; since 2026-11-20 the collection calls live in `storeCollections.ts` (`listCollections`, `makeCollection`), which also makes a collection when a product on the store changes category and renames one with its category (last section) |
| `resend_website` | staff | `{ website_id, dry? }` | (2026-11-20, `factsSite.ts`) the website's button "Send tags and fields again". `dry: true` → `{ ok, dry: true, listings, active }`: how many products of that website are on sale on Shopify (`stockSend.ts ON_SALE`), nothing changes. Otherwise every such listing is marked `facts_due` + `facts_force` (`facts_tried_at` null) → `{ ok, listings }`, and the worker's small send does the rest; a website that is switched off is refused (400, a plain sentence); activity `facts_resend_site { listings }` on the website. Not a bulk change (last section) |
| `preview_price` | staff | `{ website_id, cost, rule_id? }` | `{ price, compare_at }` |
| `taxonomy_get` | staff | – | categories (pb_settings), attributes with values (+ `uses`), links, per-link `stats {products, lacking}`, `category_products`, `fill` (latest "Let AI decide" run) |
| `categories_save` | admin/manager | `{ categories[] }` | the reader's category list; links of removed categories are dropped and every product left off the list is re-gated (held: "Missing: Category") → `{ ok, categories, regated }` |
| `attribute_save` / `attribute_delete` / `attribute_order` | admin/manager | `{ id?, name, multi?, shopify_prefix? }` / `{ id }` / `{ ids[] }` | create / rename (products of its categories re-gated: "Missing: …" holds the name) / delete (values, links and product values cascade; products re-gated) / order |
| `value_check` | staff | `{ attribute_id, name, exclude_id? }` | live look-alike check → `{ ok, matches[LookAlike], exists }` |
| `value_save` | admin/manager | `{ attribute_id, id?, name, aliases?, force? }` | a new name (or rename) with look-alikes → **409** `{ error, matches }` unless `force`; an alias another value of the same attribute uses → 409 → `{ ok, value }` |
| `value_delete` / `value_merge` | admin/manager | `{ id }` / `{ from, into }` | `pb_value_delete` / `pb_value_merge` (same attribute; products move, from's key + aliases become into's aliases) |
| `category_link_check` / `category_link_save` | staff / admin | `{ category, attribute_id }` / `{ category, attribute_ids[] }` | products lacking it → `{ lacking }`; replace the category's attributes in order and re-gate → `{ to_needs_info, to_ready }` |
| `category_rename` / `category_move` | admin/manager | `{ from, to }` / `{ from, to, remove? }` | see "Rename and move a category" below → `{ ok, renamed, run_id, stores }` / `{ ok, moved, to_ready, queued, removed, run_id }`. `stores` (since 2026-11-20) = what became of the category's collection on each website that is switched on and connected: `[{ website, status, note? }]`, status `renamed`, `kept`, `none` or `failed` (`storeCollections.ts renameCollections`) |
| `product_values_set` | staff | `{ product_id, value_ids[], attribute_id? }` | staff's choice ('manual') for one attribute or all; checked against the category's allowed values and one-value attributes; locks `tags`; gate; routes it when it became Ready → `{ status, missing, locked, routed }` |
| `retag` | admin/manager | `{ dry_run (default true) }` | the rules again for every unlocked product, for its category's attributes only (AI rows kept where the rules find nothing; 'manual' never touched; other attributes' values stay) → `{ products, locked, changed, to_needs_info, to_ready, sample[≤10] }`; apply in batches of 100 (`pb_product_values_bulk`, each row with its `attributes`) |
| `tags_ai_fill` | staff | `{ product_ids? / category? / attribute_id? / needs_info?, missing_only?, now? }` | queue (status ready/needs_info, not locked, missing ≠ {} and ≠ {Category}) → `{ run_id, queued }`; `now` + one product: fill it at once → `{ filled, left, status, missing, routed }` |
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
  "At most N tags per product" = `max_tags`; since 2026-11-20 its last tile
  "Products already on this website" has the button "Send tags and fields
  again", `sections/ResendTile.tsx` → `resend_website`),
  Content & AI (model, effort, language, brand voice, title template,
  limits, extra instructions, alt text).
- **Vendors** — list, add, edit, deactivate; product count per vendor.
- **Settings** — reader model/effort, the Tags page (categories, attributes, values), pause automation,
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
else the host — the website's own name, which the manufacturer check sets
apart; since 2026-11-13 it no longer prefills the (optional) vendor box.

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
option / attribute named Size (variants' values first; since 2026-11-20
stored in the house format, `import/body.ts storeSizes` — the "Sizes:" line
of `raw_text` keeps the store's own wording); `color` = the Color
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
ids, source store/ai/text, `filed_by` 'auto' when the worker filed it,
`tries` / `tried_at` for the worker; unique (key, attribute) via an expression
index; an ignored key is never suggested again). RLS: staff read; every write goes
through the edge function (service role). The Tags page also owns the
category list (it moved from Settings).

**Required attributes — the gate.** `pb_products_refresh(ids)` (SQL; twin
`tagGate.ts`): Ready needs a price (cost or copied selling price), a category
that is on the list (pb_settings `categories`, case and spaces aside; no list
saved → not checked) and a value for every MUST-HAVE attribute linked to the
category (`pb_attributes.required`, default true; false = "only if it fits",
owner 18 Nov 2026: Product Type — "not necessary if AI is not able to find a
perfect fit": never missing, never counted as lacking on the Tags page
(`pb_tag_link_stats`); `pb_category_lacking` still counts it, for the link
prompt; 20261118120000_pb_tags_auto_select.sql);
else Needs info with `missing_attrs` ("Missing: Colour" on the product page and
the list rows; a category the list no longer has puts 'Category' first:
"Missing: Category" — 20261113150000_pb_gate_category_list.sql). Saving the
category list checks again every product left off it (`categories_save`).
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
covers; a one-value attribute keeps the strongest / earliest — or a value
that refines it ("Chanderi Silk" over "Silk"). A two-word value refining
another value is also found with its words turned round ("Silk Chanderi");
"digitally" stems to "digital". A word that is part of a colour's name (a
multi-word Colour value / alias, or a shade word such as mehendi / haldi /
rani right before a colour) counts for Colour only — "Mehendi Green" is not
the Mehendi occasion (13 Nov 2026; the Colour values are passed to the
matcher even when Colour is not looked for). At ingest the
rules run over every attribute (category unknown); the reader then replaces
the rules / AI rows of its category's attributes only (`pb_product_values_set`
gets their ids: before 13 Nov 2026 it got none and cleared every attribute,
so what the import found for the others was lost — with nothing linked,
everything). "Retag all" and the retag after a new word is filed do the same
(`pb_product_values_bulk` rows carry `attributes`). (2) AI (`tagPrompt.ts`): the reader's
ONE call gets, per attribute linked to any category, an enum of allowed names
+ `other` phrases, and the category → attributes map; only attributes the
rules left empty take the AI's choice: a must-have attribute gets its
best-judged value from the photos and text (Occasion from the look of the
product), an "only if it fits" one a value only when one truly fits, else none;
never a value outside the list (`tagPrompt.ts`). A value meaning "none of the
others" (`isNoneValue`: Plain, No Work, None, Solid; owner, 18 Nov 2026: "add
Plain to Work values") is kept only when no other value of its attribute is chosen, by the
rules and the AI alike (`withoutNone`), and the rules take it only from a
label, the name, a store tag or a fact — "plain blouse" in the running text is
one piece of a set, so the photo (the AI) decides. A Plain the words find alone
does not settle the attribute either ("Blouse Work : Plain" beside a work not
on the list): the AI's value wins, the words' Plain stands only when the AI
has none (`tagAuto.ts` `weak`; "Let AI decide" asks the AI for such an
attribute, `tagFill.ts`; a retag passes the AI's earlier choices,
`tagsProduct.ts`). The prompt says a work not in the list takes the nearest
listed value, never Plain. A word filed later replaces a product's lone Plain
(`tagsFile.ts`); `namesTwo` still sees Plain beside another value
(`keepNone`). A person's Plain beside another value keeps only the other
(`product_values_set`); the values sheet clears one when the other is tapped. 'manual' attributes and
locked `tags` are never touched. (3) "Let AI decide" (`tagFill.ts`): for the
empty required attributes, the rules first (free, the same every time), then
— only for what they left empty — a values-only AI pass (reader model, text +
1 photo); rows 'rules' / 'ai' written for exactly the attributes it filled
('auto' mode with their ids: an attribute holding only a value its category
does not offer counts as empty and that value is replaced; a person's stale
value is cleared first) — an AI failure still writes what the rules found;
in "Let AI decide" the schema asks for at least one value per must-have
attribute (`minItems: 1`), so the AI always chooses. It runs BY ITSELF once
per read for a Needs-info product with a tag missing (`fillAuto.ts`, owner 18
Nov 2026: "AI should auto select. No user inputs required"):
`pb_tags_auto_claim` takes one product at a time (30 a run) whose `tags_ai_at` is
empty or older than `ai_read_at`, stamping it, so a product is never paid for
twice per read; only products held for nothing but tags (not a copy, not
"Missing: Category", with a photo); a tag newly missing (`pb_products_refresh`
clears `tags_ai_at` when `missing_attrs` gains a name) gives a new try; not a
bulk change (it finishes the read); one product per claim, while 35 s are left;
paused → nothing taken; the day's AI limit → `pb_tags_auto_hold` holds the
waiting ones until the next IST day (`tags_ai_retry_at`); an AI that cannot be
reached, or no answer in time, gives the try back and holds every waiting
product 30 minutes; any failure runs the gate again; a queued fill stamps
`tags_ai_at` too, so an overlapping run never fills the same product twice; `trigger_pb_worker` wakes for them (`pb_tags_auto_due`). A
category move asks the AI for every moved product not waiting for a category
(`missing_only: false`), and `tags_ai_fill` for an "only if it fits" attribute
takes the category's products that have none (`pb_category_lacking_ids`), so a
Product Type is still chosen where one fits. At deploy the ~117 products held
only for Product Type keep their old `missing_attrs` until this fill has
tried them once; only those it never takes were checked again by the
migration. Also queued by `tags_ai_fill`, run by the worker after
read / write / publish (5 at a time while 35 s are left, up to 60 a run —
most are settled by the word rules in a fraction of a second; the day's AI
limit is asked before each 5), or at once from the product page. Progress
(`tags_fill_status`, `fillProgress.ts`): the newest batch of requests (those
started within 30 minutes of the newest, plus any still open) together —
done of total, left, the pace of the last 5 minutes (`tags_filled` rows) and
the minutes that leaves, or `blocked` (paused / limit) while nothing can
move; once nothing waits, filled, still-need-you and the finish time.

**New words and the look-alike guard.** Candidates (`pb_tag_suggestions`,
written by ingest, the reader and "Let AI decide" through `pb_tag_suggest`):
store tags matching nothing (after the junk filter `tagClean.ts`: `_…`,
SIZE_CHART, label_…, codes, a category's own name), unmatched label-line items
(with that attribute), the AI's `other` phrases; anything already a value /
alias is dropped; an unassigned one takes its closest look-alike's attribute.
`lookAlikes` (`tagLook.ts`) compares a phrase with every value + alias of
every attribute: same key, same stem, same words in another order, the Hindi
/ Hinglish list (`tagDict.ts`: kala → black, kadhai → embroidery, gota →
gota patti…), a colour shade (rani pink → pink), Damerau–Levenshtein ≤ 1
(≤ 6 letters) / ≤ 2, Jaro–Winkler ≥ 0.92; a hit in another attribute is
flagged (`other_attribute`: "Silk" under Work is a Fabric value). The guard
runs on "Add a value" (`value_check` / `value_save`): new values come only
from a person.

**Filed by themselves** (owner, 2026-11-17: "The whole purpose was to automate
tag and not complicate the work of user. It should be merged automatic with
the best possible AI suggestion rest should be automatically ignore." — the
review screen, its actions and `tagNearest.ts` / `tagsNearest.ts` /
`tagsSuggestAct.ts` are gone). A worker step after `closeFills`
(`tagsFile.ts`, prompt `tagFilePrompt.ts`, migration
20261118090000_pb_tags_auto_file.sql), while 50 s are left and automation
is not paused:
1. `pb_tag_file_claim(40)`: pending words never filed by the worker
   (`filed_by` null), fewer than 3 unanswered AI tries, not held back
   (`tried_at` 10 minutes old or more), oldest first (FOR UPDATE SKIP LOCKED;
   taking only stamps `tried_at`) — and only when due (`pb_tag_file_due`: 20
   wait, or one was first seen 15 minutes ago), so words go in batches and
   Bulk changes gets a few rows an hour, not one a minute.
2. The word rules file a word only when sure: the best look-alike's reason is
   same / same_word / word_order / translation / shade. Typo and
   "spelled almost the same" hits are not trusted (they made Back → Black,
   Brunches → Art Silk, Koti → Khatli Work) and go to the AI.
3. The AI (`claude-sonnet-5-5`, effort medium; ≤ 10 words a call, so one answer
   stays well inside its 45 s; while the
   day's AI limit allows): the lists with up to 120 aliases per value, the 40
   latest words a PERSON ignored (never the worker's own), each word with its
   source, attribute and two example products. It answers an enum of
   "Attribute: Value" labels or "none", a match (`same` / `kind` / `related` /
   `none`) and a ≤ 14-word why. Same or kind → "also known as" that value;
   related or none → ignored. A word the answer leaves out (or names a label
   not on the lists), or a request that went wrong (cut off, refused,
   unreadable, too slow: `failureOf` 'answer'), uses a try (`tries`, guarded
   by the old count); after 3 it is ignored. A call that found no AI to ask
   (no key, key rejected, no credit, rate limit, overloaded, unreachable:
   'outage') uses no try: the rest of the pass waits 30 minutes (`tried_at` moved on), so an
   outage never ignores the backlog (`failed`, step `tags_file`). The day's
   AI limit used up → those words are held until the next IST day and do not
   wake the worker meanwhile. The cost is a `tags_matched` row that
   `pb_ai_cost_since` counts. A word that names two values of the chosen
   value's attribute, each on its own (the matcher, `namesTwo`: "Sequins
   Embroidery" → Embroidery), is ignored, never filed under one of them — the
   matcher takes the longest phrase first, so its products would lose the
   other value. Only for attributes that take several values; "Faux Silk" →
   Art Silk or "Off White" → Cream (the other value only part of a longer
   name) is filed; values that depend on the category count only when they
   share one with the chosen value.
4. `pb_tag_file(id, value?, why, match)` files ONE word in one transaction:
   the alias appended in place (a word another value of the same attribute
   already has goes to that value), status aliased / ignored, `filed_by`
   'auto', `nearest` `{ value_id, why, at, match, by: 'auto' }`. One value
   row is locked; a value deleted or merged away meanwhile, or another value
   taking the word meanwhile, leaves the word pending (`filed: false`).
5. The example products (up to 5) of every aliased word are retagged by the
   rules (chunks of 50, while 15 s are left; "Retag all" brings the value to
   the rest); a word the AI read from a product for one attribute also
   gives that value to the example products with none for it (`writeValues`
   'add'; open and unlocked products only).
6. A pass is ONE bulk change (kind `suggestions`, no person): "Filed 40 new
   words by itself: 28 also known as their nearest values, 12 ignored (…)".
   A revert puts status, attribute and value back but not `filed_by`, so a
   word taken back stays pending and marked and is never filed again. Such a
   pass is kept in the log from ONE word (`sizeOf`, a run with no person), so
   a wrong "also known as" can always be taken back, and it never stops an
   earlier tag change from being reverted (`pb_bulk_revert`'s "later change
   goes first" check skips it: the tag revert is row by row on what is still
   as the change left it. One gap: reverting an earlier merge after a pass
   filed a word under the kept value can leave a product without that value
   until "Retag all"). `filed_by` is recorded with the row in the log and put
   back when a revert re-inserts a deleted row.
`trigger_pb_worker` also wakes the worker while words are due.

**Values that depend on the category — Product Type** (owner, 2026-11-13: "the
values are to be mapped against the category, so no mistake can happen";
answers: "You create it", a value with no category ticked is offered
"nowhere", the Shopify Product type field keeps the category — since
2026-11-20 as the category is NOW, at every send: a changed category reaches
the products already on a store, last section). Migration
`20261113210000_pb_tag_value_categories.sql`. `pb_attributes.by_category`
("Values depend on the category") and `pb_attribute_values.categories[]`
(the categories a value is ticked for, names from the list). With the switch
on, a value is offered only for a product whose category is ticked on it;
none ticked = nowhere; no category = none. One rule, two copies:
`pb_tag_offered()` (SQL) and `taxonomy.ts offered()` (the app mirrors it in
`tagTypes.ts offeredFor`). Where it holds: `attrsFor` / `allAttrs` hand out
only offered values, so the word rules, the "Let AI decide" enum and
`product_values_set` (staff) follow it; the reader's single call gets every
ticked value grouped by category ("Product Type (one value; depends on the
category …): Lehenga: Bridal Lehenga; Salwar Suit: Anarkali") and
`autoValues` drops an AI pick the settled category does not offer; "Retag
all" neither keeps nor counts one; the Ready check, the tags cache and
`{tags}` (`siteValueTags`) count / send only offered values; the "N products
will need" counts likewise. `attribute_save { by_category }`: turned on, each
value with no category gets the categories that use the attribute now (no
product moves at that moment); off, every value counts everywhere again and
the ticks are kept. `value_save { categories }` keeps only names on the list
and re-checks the products carrying the value. `value_merge` adds `from`'s
categories to `into` (a revert brings `from` back but leaves the addition).
The bulk-change log records both columns; a revert that re-inserts a deleted
attribute or value gets them back through `pb_tag_scope_back` (BEFORE INSERT,
reads the row's last recorded delete). The migration creates **Product Type**
(one value, switch on, linked to no category). Screens: the Tags page groups
such an attribute's values under their categories, marks values ticked for no
category and categories that use it with none ticked (ScopedValues); the
value sheet has **Offered for** chips; the attribute sheet the switch; the
category sheet says how many values a category has; the product page offers
only the category's values. Tests: `test/tagByCategory`, `tagFill`,
`t_dups.sql` part 10.

**Rename and move a category** (owner, 2026-11-13: "If deleted than it has to
be moved to correct category and let ai decide which product type is it for
that category", "unable to rename the category"). Migration
`20261113220000_pb_category_rename_move.sql`; server `categoryMove.ts`,
revert `categoryRevert.ts`. A category name lives in the list, its links, its
products, the Product Type ticks and `pb_routing_rules.conditions.categories`.
`category_rename { from, to }` → `pb_category_rename` changes all five in one
transaction (a case-only rename too; `to` already on the list is refused —
that is a move). Since 2026-11-20 a sixth place follows, outside that
transaction: the stores. **Before** the database call
`storeCollections.ts renameCollections(from, to)` gives the category's
collection the new title on every website that is switched on and connected
(`categoryMove.ts storesThenDatabase`: only when the server's own look at the
list says the database will take the rename, and the title is put back when
the database still refuses); then the products on sale get the new product
type one by one (`pb_facts_follow` marks their listings, `factsSend.ts`
sends). Stores first, so no product is ever owed a type whose collection is
not there yet. The answer is `{ ok, renamed, run_id, stores: [{ website,
status: 'renamed' | 'kept' | 'none' | 'failed', note? }] }` (last section). `category_move { from, to, remove? }` → `pb_category_move`
files every product of `from` (on the list or not, any status) under `to`
(the list's spelling) and checks them again; `remove` then takes `from` off
the list (`categories_save`, its own bulk change); "Let AI decide" is queued
for the moved products that miss a must-have tag other than Category. Both
functions refuse anyone but the server. Both actions are bulk changes when
they reach 2+ products (`category_rename` / `category_move`); their revert is
the server's own (the database's `pb_bulk_revert` does not know them): a
rename is renamed back; a move files back each product still in `to` whose
category nobody locked (`pb_products` category is now recorded by
`pb_bulk_capture`), then checks and retags them by the rules. Since
2026-11-20 both reverts reach the stores as the change did: the products'
listings are marked by the same trigger, and a rename taken back calls
`renameCollections(to, from)`, again before its database call. The Tags page:
a Name field with **Rename** in the category sheet; **Remove category** with
products opens the move box (Move to … / Remove without moving / Cancel);
**Waiting for a category** lists names off the list that still have
products. Tests: `test/categoryMove`, `t_dups.sql` part 11.

**Websites.** `{tags}` = the chosen values in the site's `tag_rules.tag_style`:
`plain` ("Black", default) or `prefixed` (`${shopify_prefix || attribute}_${name}`);
`max_tags` (default 30) caps the list. New sites' templates include `{tags}`.

Tests: `test/tagText`, `tagClean`, `tagLook`, `tagMatch` (+ tagAuto),
`tagGate`, `tagPrompt`, `tagFill` (queue with a fake database and AI),
`tagByCategory`, `categoryMove`, `tags`, `runner` (ingest tagging).
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
(`data/websites.ts NEW_SITE`). INSERT on `pb_websites` is granted column by
column, so those two travel with the insert only since
`20261112230000_pb_websites_insert_writing_defaults.sql` (`name, shop_domain,
content, tag_rules`; for one day the insert was refused and no website could
be added). A further column sent by `createWebsite` needs its own grant.
`tag_rules.ai_allowed[]`: when not empty, the
AI's extra tags are an enum of it.

### The writer (generate.ts → genPrompt.ts → genWrite.ts)
- **Inputs**: STORE PROFILE, PRODUCT FACTS (no SKU, supplier, the other
  store's SEO text or tags), SOURCE TEXT (`raw_text`, facts reference only),
  VERSIONS ON OUR OTHER STORES (title, SEO, opening line, description and alt
  texts of every sibling listing in review / publishing / published /
  failed-after-writing), PRIMARY KEYWORD, IMAGE COUNT, the photos (≤ 8).
- **Primary keyword**: the site's `keyword_pattern` filled from the product
  (`{color} {fabric} {category} {work} {occasion} {name}`), or the phrase
  typed for that listing (kept: `keyword_locked`). Since 18 Nov 2026
  (`profile.ts keywordOf`): each part is the product's own tag value (the one
  its facts name first, "Cocktail / Reception" → Cocktail), else the first
  item of the read fact — a tag the product's own colour / fabric / work fact
  does not name is never used, so the phrase never contradicts the product's
  facts — and the phrase is no longer than `phraseMax` (the SEO title beside
  "| Brand" with `SEO_ROOM` 12 characters to spare, so two products with the
  same phrase still get their own SEO titles; and the title; SuratMandi 35): the occasion is left
  out first, then pattern, work, fabric, colour — never the category or the
  name — then it is cut at a word. Before, raw facts were joined and sliced at
  80 characters mid-word ("…Festival Sange"), which no description could hold
  and which held listings in review. The app's preview (`seoTypes.ts
  fillKeyword`) is its twin.
- **Output**: `{ title, handle, seo_title, seo_description, description_html,
  faq[{q,a}] (≤ 2), image_alts[] (≤ 110 chars), extra_tags[], missing_facts[] }`.
  Description: `wordsMin`–`wordsMax` words (`description_words`, min = 65%):
  opening in the store's angle, 5–7 fact bullets, `<h3>How to wear it</h3>`,
  `<h3>Ordering from <brand></h3>` only when the profile gives delivery,
  stitching or returns. Allowed HTML: p, ul, li, h3, strong, em, br.
- **Photos and fabric (owner, 2026-11-12)**: hard rule 9 (only when photos
  are sent): the facts are checked against the photos, and for what can be
  seen the photos win in the title, description, SEO fields, alt texts and
  FAQ. Hard rule 10: a fabric is written word for word as PRODUCT FACTS gives
  it, and left out of a short field rather than shortened. Spelling is
  corrected once, by the reader, not by the writer.
- **Research rules (owner, 2026-11-12; report "Product listing SEO and AEO",
  `reports/`, not in git)**. Writer: the description's first sentence says
  what the product is and what comes with it (a fact the title lacks), the
  angle follows; fact bullets are "Label: fact" in one order (`FACT_ORDER`);
  the facts block lists what shoppers of that garment expect
  (`garment.ts expectedFacts`, by category) and the writer names the absent
  ones in `missing_facts`; FAQ answers begin with the answer and use shopper
  wording; the first alt names the product and the view, later ones only what
  the photo adds, never "image of"; default title formula = colour, fabric
  and type together, then the main work or pattern and what comes with it
  (`genPrompt.ts DEFAULT_FORMULA`: the order of the default search phrase and
  of the reader's product name; the earlier order put the work between fabric
  and type, so a title that followed it failed `keyword_title`); "for Women"
  in the SEO title when it fits. `manufacturer` (an imported store's) is withheld from the
  writer. Checks: `title` (HARD: a humanCopy tell, a word of 4+ capitals that
  is not a size, an emoji or one of `! * # @ $ ₹ ™ ® ©` in an AI title) and
  `alt_opening` (soft). Shopify: `vendor` = the store profile's brand (the
  supplier is never sent; the default tag template is `Vendor_{vendor_code}`,
  dropped when the vendor has no short name. A vendor can have several short
  names, owner 2026-11-13 "code might start with KB or NKB":
  `pb_vendors.codes text[]`, typed in the vendor sheet as `KB, NKB`; `code` is
  the same list joined for display and search, rebuilt by the trigger
  `pb_vendors_codes_sync`, which also takes the text an older app copy still
  writes into `code` (`20261113010000_pb_vendor_short_names.sql`).
  `{vendor_code}` = the short name the product's own code starts with, else
  the first (`tags.ts vendorCode`). Matching does not read the short names:
  `pb_code_key` keeps a code's own letters, so KB 25 and NKB 25 stay two
  designs); `category` = Shopify's standard
  taxonomy id from `garment.ts shopCategory` (ids read live 2026-11-12; sent
  on a create only); alt texts of unchanged photos go out inside
  `productSet` (`files: [{id, alt}]`, see "Shopify sync check" below; the
  earlier `fileUpdate` + `write_files` path is gone). Not built, waiting on the owner: standard category attributes
  (needs their colour / fabric matching list), a hold on "pure" / origin
  claim words, dropping the Ordering block, Western spellings per market,
  country of origin, up to five FAQ questions (needs the listing editor).
- **No ordering part (owner, 2026-11-12, after the report: "2 is what you
  should correct")**. The writer no longer writes `<h3>Ordering from
  <brand></h3>`; the description and the FAQ are about the product only (no
  delivery, shipping, returns, stitching-service, price or offer text, and no
  question about them). The profile's delivery / stitching / returns lines
  stay and may give the SEO description its one store benefit, the only
  field that may mention them. `tidyOut` strips a section whose heading says
  ordering, shipping, delivery or returns (`seoText.ts dropSection`); the
  `ordering` check is now SOFT: a description that talks about delivery,
  shipping, returns, refunds or cash on delivery. This replaces the older
  "Ordering from" lines in this section and the HARD numbers check.
- **Sizes are size choices, not text (owner, 2026-11-12)**. The writer is
  given the sizes on sale as a fact but never lists them in the description
  or the FAQ (`FACT_ORDER` has no sizes bullet); a measurement that belongs to
  a size, or "free size", may be a fit fact. On Shopify each size is one value
  of the `Size` option — until 2026-11-20 shown as scraped, since then in the
  one house format (`sizes.ts`, last section: "XS (34)" stays as it is, `38"`
  becomes `38`, "2XL" becomes "XXL"). Its SKU is the product's
  base SKU, the joiner and the size without its measurement (`skuParts`: an
  imported product carries its first size's own SKU, "NKB 47 PURPLE XS" →
  base "NKB 47 PURPLE", joiner " " → "NKB 47 PURPLE XS", "NKB 47 PURPLE S"…,
  the store's own code for each size: 790 of the 796 sizes on the first
  scraped store follow that form, the other six are "…-1" to "…-6"; a SKU
  with no size at its end is joined with "-": "RG-1042-M"). Each colour is
  its own product and its SKU carries the colour, so every colour + size has
  one code of its own. An import hands its size choices
  to `ingest` as a list (`importFacts`, import only) — until 2026-11-20
  exactly as the store writes them, since then in the house format
  (`import/body.ts storeSizes`; a measurement the store gives is still kept)
  — and the reader never replaces an imported product's sizes;
  before this the reader retyped them from the text and shortened "XS (34)"
  to "XS" on 109 of 136 products (restored from each product's own
  "Sizes:" line on 2026-11-12). For other sources the reader keeps a
  measurement written with the size (and since 2026-11-20 saves the labels
  in the house format, `reader.ts`).
- **A program finishes the draft**: pattern title (`title_template`), the SEO
  title always ends `| <brand>` inside `meta_title_max` (`withBrand`), cuts,
  kept (locked) fields; handle = 3–6 clean words with the design code taken
  out (`cleanHandle`), a 4-character suffix only when another listing on the
  same website has it (the store itself is checked at publish).
- **Program checks** (`seoCheck.ts`, in place of the writer's self check).
  Owner, 18 Nov 2026: "donot provide suggestions rather fix it directly using
  AI" — HARD (holds the listing) only for what could harm the store: a
  copied sentence (a shared run of 8+ words, `COPIED_SENTENCE`; a run counts
  only with ≥ 3 words that are neither the product's fact words, numbers nor
  joining words); same title / SEO title / first four words as another
  version; supplier name, design code, link, email, phone; "No. 1",
  scarcity, review claims.
  SOFT (sent to the rewrite, never a stop): a shorter shared run (5–7
  words: a fact said the usual way); keyword not exactly once in the AI
  title, missing from the first 50 words, not exactly once in the SEO title;
  SEO title not ending with the brand; a title that is not plain; the
  description not naming the fabric word for word (English only); delivery
  or returns talk; SEO description outside min–max; description over 115%
  of the limit; repeated alt texts; keyword more than 3 times; the humanCopy
  tells. `keyword_fit` ("shorten one of them in the store profile") is gone:
  the phrase is built to fit.
- **Up to two rewrites** (`genWrite.ts`, `MAX_REWRITES`): any problem → one
  more call with the draft and the list of fixes (text only, no photos;
  needs 45 s left); a second only while a HARD problem is still there,
  asking only for those. The better draft is kept each time (fewer hard
  problems, then fewer in all); every call is paid for (`ai_cost_usd`,
  activity `generated` `details.usd`, `rewrote`, `rewrites`, `problems`).
- **The listing editor** shows a held listing's reason only. The checks'
  notes and the writer's missing facts are still stored
  (`pb_listing_seo.notes` / `missing`) but no longer shown.
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
- `custom_fields`: after `productSet`, `metafieldsSet` writes one field per
  Playbook attribute (2026-11-17: `custom.colour`, `custom.fabric`,
  `custom.work`, `custom.occasion`, `custom.product_type`… — key = attribute
  key in snake case): the product's chosen values offered for its category
  (`list.single_line_text_field` JSON array when the attribute is multi, else
  `single_line_text_field` with the first), and only when none is chosen the
  read fact (colour ← `color`, fabric ← `fabric`, else `attributes[key]`);
  then `custom.set_contents` (from the facts) and `custom.faq`
  (rich_text_field: question in bold, answer below). Empty ones are not sent.
  (Since 2026-11-20 a field Playbook filled before whose value went empty is
  taken off the product, `fieldsSend.ts dropFields` → `metafieldsDelete`,
  only for keys on record in `pb_listings.sent.fields`; and the fields other
  than `custom.faq` also go out in the small send, `factsSend.ts`: last
  section. Until then an emptied field stayed on the store.)
  `metafieldsSet` touches only those keys. The store's own field kinds
  (`metafieldDefinitions`, namespace `custom`, read once per store every 10
  minutes) decide the kind each field is sent in: a list as one comma-joined
  line where the store's field is one line of text (SuratMandi's Work and
  Occasion) or multi-line text, a line as a list of one; a field of a
  kind no text goes in (a number, a reference) is left out with a warning
  (`fieldsSend.ts`). A field still refused (its kind changed meanwhile) is
  found by its place in the error's `field` path (`["metafields", "2", …]`;
  `elementIndex` is an item inside a list value, not the field — reading it
  left all 122 SuratMandi products without custom fields until 18 Nov 2026),
  sent once more in the other text kind; still refused → left out and a
  warning on the listing; the product is still published. `store_setup`
  defines the same keys on the store.

### The Ready gate — necessary details
`pb_products_refresh` (and `tagGate.ts`): Ready needs a price (cost or copied
selling price), a category, a fabric, a colour, at least one photo
(`pb_product_images.kind = 'image'`) and a value for every attribute of the
category. `missing_attrs` stays the required TAG attributes only (plus
'Category' for a category the list no longer has); the app
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
- **Shopify sync check (owner, 2026-11-12: "check for … any bug in shopify
  sync")**. Three reviews of the publish path, each finding checked against
  the code and Shopify's 2026-10 schema. What changed (`publish.ts`,
  `publishParts.ts`, `productInput.ts`, `shopifyProduct.ts`, `shopify.ts`):
  - *An update keeps what people did in Shopify.* `productSet` replaces every
    list it is given, so: **tags** = Playbook's own + the store's tags that
    Playbook did not send at the last publish (`mergeTags`; the `published`
    activity row records `tags` — since 2026-11-20 the record read first is
    `pb_listings.sent.tags`, written by every send, and the `published` row
    serves only a listing that has none yet); **media** = `filesFor`: a photo the store
    has goes as `{id}` (or `{id, alt}` when its description changed), a new
    one as `originalSource`, media Playbook did not put there stays, a photo
    removed in Shopify stays removed, a FAILED one is sent again, and while
    Playbook's photos and order are unchanged the store's order stays (no
    `files` at all when nothing changed). The `published` row records
    `media` (Shopify media ids aligned with `photos`, from the `productSet`
    reply; `photoRecord`). Ids not on record are never guessed from the
    order: while Playbook's photos are the ones sent last time the gallery
    is left alone (`leaveGallery`), and only a change of photos in Playbook
    sends them afresh. When the store refuses the photo change the update
    still goes out without `files`, and the record keeps what the store had.
    **Options**: a choice other than Size / Title on the store stops the
    update with a plain sentence (it would be deleted). **Variants**: an
    existing size is matched by label, else — since 2026-11-20 by `sizes.ts
    sizeKeys` — by its letter (else its number, else the label without its
    bracket part, which until then was the only second try) and then by its
    number alone, each time only when one size here and one unmatched size
    there share it, so "S" → "S (36)", `38"` → `38`, "2XL" → "XXL" and "38" →
    "M (38)" rename the variant and keep its stock, and no store
    variant is ever given to two sizes. **Category** (Shopify's standard
    category; not the product type, which is the Playbook category at every
    send) goes out on a create
    only. **Channel**: `publishablePublish` runs on a create (draft sites
    too, so the product shows once made Active), on Put back, and while it
    is still owed (`channel: false` on the last `published` row, or
    `channel_due` on a later `failed` row) — not on every update.
  - *A product deleted in Shopify is not made again by the worker*: the
    listing becomes `skipped` with the note `GONE` and its Shopify id is
    cleared; a manual Publish / Put back creates it anew.
  - *Failures*: HttpError 503 (429, 5xx, THROTTLED) is `temporary`: the
    listing fails and is retried after 10 min without using an attempt, up to
    `FREE_RETRIES` (10) in a row (`busyStreak` over the last 12 failed rows),
    and the worker leaves that store's other listings for the next run (the
    other stores go on; it reads 30 candidates to send 10). A busy or unreachable
    Shopify at the channel step (status ≥ 500) or a 503 at the custom fields
    fails the listing (retried) instead of calling it published. After
    `productSet` went through, a failed Put back is `failed`, not `skipped`.
    `metafieldsSet` is all-or-nothing: the refused entries (by their place
    in the error's `field` path) are left out and the rest sent again
    (`fieldsSend.ts sendFields`). The handle /
    category / photos refusals are each given up once, in any order; a taken
    handle is first checked for this listing's own lost product; a listing
    with no handle gets `makeHandle`. `adoptable` asks only id + marker per
    handle (six full products passed the 1,000-point query limit).
    `onlineStoreId` asks `catalogType: APP` first and forgets a cached id
    Shopify refuses. An archived product's listing that is on Shopify goes
    back to `published` with a note (it is on sale; it was `skipped`, which
    let Delete forget a live product).
  - *Currency*: `shopCurrency` (cached per instance); a store that does not
    sell in INR gets nothing, and Test connection says so in `last_error`.
  - *SKU per size*: `skuParts` also takes a size word of the same kind as
    the product's own sizes at the end of the code (the code's own size may
    have sold out: "KB 302 XL" with S and M on sale; never "-M" on a
    free-size or numbered product, never for a product with no sizes); the
    importer takes the SKU of a size on sale. New variants
    get `inventoryItem.measurement.weight` (attribute `weight`, "700 g") and
    `cost` (cost price).
  - *Changes that used to be lost*: the `published` row records the `sizes`
    and `sku` sent; routing sends a published listing again as it is when
    the product now has others (`route.ts lastSent` / `behind`), whichever
    way the product was routed (Save facts, a re-read, tags, the worker).
    (Still so since 2026-11-20, `route.ts` unchanged. What this never
    caught — a changed category, tags or custom fields, for which no routing
    was even asked — has its own record, `pb_listings.sent`, and its own
    send, `factsSend.ts`: last section.) A
    listing being written or published when its product is routed sets
    `route_due`; `routeDue` clears the flag before routing and the other
    callers leave it while a listing is busy, so the worker checks it again
    (not logged each minute).
  - *Delete* refuses unless every listing with a Shopify id is removed AND
    `shopify_status = 'DRAFT'`.
  Not built, each needs the owner's decision: stock and price sync from the
  source store (a repeat import never updates sizes, price or availability;
  with Track stock on, products start at 0); archive / rule change / website
  off never takes a live product down; no bulk re-price or bulk retry;
  Playbook's title, description and price replace hand edits made in Shopify;
  colours of one design are not linked on the store; barcode, HSN, country
  of origin, category attributes and per-size photos are not sent.
- **Bulk actions, barcode, country of origin (owner, 2026-11-12: "Implement
  bulk action … Country of origin by default India. Barcode value same as
  product code. HSN code will set later")**. `bulk.ts`:
  `reprice_website { website_id }` gives every WRITTEN listing of a website
  the price from the saved pricing / the rule's own price (`newPrice`): a
  published one whose price moved becomes `publishing` (also on a "Review
  first" website: the tap is the approval), a waiting one (review, failed,
  unclaimed publishing) only has its price corrected, a kept price stays;
  pages of 200, 8 at once, `more: true` after ~100 s. Button: website →
  Pricing → "Update prices on Shopify" (dimmed while the form is unsaved).
  `retry_failed { website_id? }`: failed + written → `publishing`, failed +
  never written → `queued`, attempts 0. Bar: Products with the Failed filter
  (`FailedBar`, follows the website filter). Both only mark rows; the worker
  sends them (10 publishes a run). (A third whole-website button, website →
  Tags → "Send tags and fields again", came on 2026-11-20: `resend_website`,
  which is not a bulk change and not in the log — last section.) Shopify variants: `barcodes: [{ value }]`
  = the variant's own SKU on every send (`barcode` on an API version before
  2026-10); `inventoryItem.countryCodeOfOrigin: 'IN'` on a new variant only.
  Hand edits are made in Playbook only (owner), so Playbook's title,
  description and price replacing Shopify's is intended.
- **Stock (owner, 2026-11-12: "If stock out/in-stock on playbook that same
  happens in shopify stores")**. `pb_products.in_stock boolean not null
  default true` (migration `20261112190000_pb_product_stock.sql`, partial
  index for the list filter). Sources: a vendor's stock-out notice (below) and
  the **Stock** switch on the product page (`StockTile` → `set_stock`). The
  import-driven refresh this first shipped with was removed the same day
  (see "Stock-out notices"). Both save through `stock.ts saveStock`: the product row,
  then every listing of it that is on Shopify is marked `stock_due` and gets
  the stock in its own small send (`stockSend.ts`, see "Pre-launch fixes,
  batch 2": until 2026-11-13 the `published` listings were moved to
  `publishing` and sent again in full, which missed four cases), activity
  `stock`. Listings not on Shopify yet are left alone and read the product
  when they go out. Shopify
  (`productInput.ts`): on a website with Track stock OFF every variant gets,
  on every send, `inventoryItem.tracked: true` and `inventoryPolicy:
  CONTINUE` when in stock, `DENY` when out of stock (owner, same day:
  "'Continue selling when out of stock' must be on if the product is
  in-stock and vice versa"; the first version sent `tracked: false` for an
  in-stock product). No quantity is sent: the count stays at 0 and goes
  negative with orders, so DENY means Sold out; a count typed in Shopify by
  hand would keep an out-of-stock product selling until it is used up. A
  theme that prints a stock line may call an in-stock product "backordered"
  (count 0 + continue); the cure would be a fixed count. With Track stock ON
  Shopify's own numbers decide as before. The `published` row records `in_stock`, and
  routing sends a published listing again when it differs (`route.ts
  behind`). `write_inventory` is now a required scope on every website.
  List: "· Out of stock" after the status label, filter "Out of stock"
  (`stock:out`). Not built: quantities; per-size sold-out.
- **Stock-out notices from vendors (owner, 2026-11-12, nine example
  pictures)**. A vendor announces sold-out designs as a picture (often a
  collage) with the codes written on it: "Permanent stock Out D no 5081",
  "D no 5073 Offwhite / Pur / Rama", "1262", "1260 peach", "7185 All Colour
  Only Lehenga Stock out", "D-7182 white, black, maroon", "code:-7165 both
  colour", "KB:-273 WINE PERMANENT STOCKOUT", "Kb-302 Temporary stock out
  All platform". It arrives as a Telegram post and would become a product.
  The reader (`readerPrompt.ts NOTICE_LINE`, schema `stock_notice`; never
  asked for an imported product) returns `{ kind: permanent | temporary |
  unknown, items: [{ code, colours[], note }] }` (code without label words
  or colour; colours in full English; `note` = a limit to a part such as
  "Only Lehenga"). `stockNotice.ts` then, per item, asks
  `pb_stock_candidates(p_vendor, p_code)` (migration
  `20261112200000_pb_stock_notices.sql`; the same `pb_code_key` /
  `pb_code_num` / `pb_colour_keys` as the "already added?" check: the
  vendor's products with the same design number, plus the same lettered
  code at other vendors as `same_vendor = false`) and `pick` decides: no
  colour named → every product of the design; colours → `byColour` (exact
  key or a `SAME` trade-name alias, else a looser match only when it points
  at one product). Marked with `saveStock` (`in_stock = false`, the stock
  sent to every store that has the product). Left for a person, with the reason: a `note`; a
  number several letter codes share; a lettered code under other letters; a
  named colour no product has; a code only known at another vendor. A code
  with no product at all is nothing to do. The notice row is renamed "Stock
  notice (kind): …", gets one line per item in `intake_notes`, and becomes
  `archived` when nothing is left, else `needs_info`. Guards: first read
  only, nothing kept by hand, no price read, not an import. A notice that
  marks two or more products is a bulk change (`stock_notice`, see "Bulk
  changes" below): Settings → Bulk changes takes it back for 7 days.
  **Temporary is a note only (owner, same day: "If temporary word mentioned
  then ignore it. And just note that product as temporary which can be
  filterable; nothing is to be done")**: with `kind = temporary` the matched
  products get `pb_products.temp_out_at` (migration
  `20261112210000_pb_temp_stock_out.sql`, partial index) and an activity
  row; `in_stock` and Shopify are not touched. `permanent` and `unknown`
  mark out of stock and clear that note. List: "· Temporarily out (vendor)"
  after the status, filter `stock:temp`; product page: a line on the Stock
  tile with the date and "Clear note" (`data/stock.ts clearTempOut`).
  **Permanent archives (owner, same day, asked "Sold out or off the
  websites?": "Archive it")**: `stock.ts takeOffSale` sets `in_stock =
  false`, `perm_out_at` (migration `20261112220000_pb_perm_stock_out.sql`),
  sends every listing that is on Shopify once more (published / review /
  failed → `publishing`) and sets aside the ones not there yet. While
  `permOut(p)` (out of stock + `perm_out_at`), `buildProductInput` sends
  `status: ARCHIVED`; `publishOne` then saves the listing as `skipped` with
  `shopify_status = ARCHIVED` and `PERM_NOTE`, skips the channel step, never
  creates a product for it, refuses a manual publish, and `retire` archives
  the Playbook product once no listing of it is still on its way. A failed
  send stays a Failed listing of a Ready product (visible, "Retry all").
  Switching Stock on clears `perm_out_at`; Delete counts ARCHIVED like
  DRAFT. A notice with neither word marks out of stock only (Sold out).
  **Back in stock (owner: "after 7 days we got a broadcast of that product
  with all the details then … that product is back in stock")**: when a
  newly read vendor post is held by the gate as a copy (`pb_dup_held`), the
  product it copies loses `temp_out_at` (`stockNotice.ts backInStock`).
  **The source website's stock is not used (owner: "Dont check for stock in
  source website. What if source website stopped doing business")**: the
  import's stock refresh of #1377 (`import/stock.ts`) and the first
  import's `in_stock` are removed; stock changes only by a vendor notice or
  the Stock switch. The import's own "In stock only" choice (which products
  to copy) is unchanged.
  Why the AI reader and not OCR: OCR returns letters only; which number is
  a code, which words are its colours in a collage, "Pur" / "both colour" /
  "Only Lehenga", permanent or temporary, and whether the picture is a
  notice at all still has to be decided, and the reader already looks at
  every vendor post's photos in the same call, so it costs nothing extra.
  Not built: a notice mixed into a product's album, acting on another
  vendor's matching code.
- Product list: "Needs info · Already here as KB 264 WINE XS"
  (`data/duplicates.ts heldLabels`, one RPC per page for its Needs-info rows);
  every row says "from Telegram" / "from bahupalace.com" (`sourceText`); a
  **Source** filter (`ProductFilter.source`: `telegram`, `manual`,
  `import:<host>`).

## Pre-launch fixes (owner, 2026-11-13: "Fix all")
The 21 defects of the launch research (`reports/Playbook launch gaps and
Telegram intake.md`, D1 to D21), fixed in batches. The 20 decisions in that
report (Q1 to Q20) are the owner's and are not built here.

### Batch 1 — connection, writer rules, AI retries
- **D1 a store that cannot be used is not connected.** `shopify.ts
  testConnection` sets `connected_at` (which the On switch asks for) only when
  every `REQUIRED_SCOPES` permission is there, the store sells in INR and it
  has an Online Store channel (`onlineStoreId`, looked up only with
  `read_publications`; a failed lookup is not "no channel"). Otherwise
  `connected_at = null` and `last_error` lists what is missing. The reply
  carries `problems: string[]` (currency, channel); the app shows "Reached X,
  but it cannot be used yet" (`ConnectionBits ResultBox`) and an error toast.
  Not built: a test that creates and deletes a draft product on the store (it
  writes to the owner's store; the owner's call).
- **D2 a long brand name.** `profile.ts brandFits(brand, max)`: "| Brand"
  must leave the product 12 of the SEO title's characters (60 → a brand of up
  to 45). A longer brand is left out of the SEO title (`content.ts
  withBrand`, never cut part-way), not asked of the writer (`genPrompt.ts`)
  and not checked (`seoCheck.ts` `brand`). The profile editor
  says so under Brand name.
- **D3** the default title formula, above.
- **D4 a busy AI is not a failed try** (`aiRetry.ts`). `ai.ts` throws 503
  (rate limit, overloaded, 5xx) or 504 (too slow, unreachable): `aiBusy`.
  Such a failure of the writer (`generate.ts`) or the reader (`reader.ts`) is
  logged with `temporary: true` and, up to `FREE_RETRIES` (10) times in a row
  for that listing / product (`freeTry` reads the item's last activity,
  `busyRun`), does not count toward `MAX_ATTEMPTS`; it is tried again 5
  minutes later as before. Manual actions are unchanged (the person sees the
  error). New action `reread_failed` (staff, `bulk.ts`): every product in
  Needs info that still carries the reader's error goes back to `new`; the
  Needs info list offers it as "Read all N again" (`UnreadBar`).
- **D12 copied products and prices.** The Pricing screen and its preview say
  that copied products sell at the copied price (only compare-at % is added);
  the rule editor says a cost range never matches a copied product (it has no
  cost).

### Batch 2 — what "Published" means, sold-out changes, pause
Migration `20261113020000_pb_stock_due_media_check.sql`.
- **D6 stock has its own send** (`stockSend.ts`). `pb_listings.stock_due` =
  this listing's Shopify product does not yet show the product's stock;
  `stock_tried_at` = when the last try failed. `markStockDue(product)` marks
  every listing on Shopify that is not `skipped`, whatever its status.
  `sendStock`: for a permanent stock-out `productUpdate` status ARCHIVED, the
  listing → `skipped` + `PERM_NOTE`, then `retire`; otherwise (Track stock
  off) `productVariantsBulkUpdate` with `inventoryPolicy` CONTINUE / DENY and
  `inventoryItem.tracked: true` on every variant (Track stock on: nothing to
  send); the mark is cleared only if the product's stock is still what was
  sent; activity `stock_sent`. A listing a run is publishing right now waits
  for it. A failure sets `stock_tried_at` (next try 5 minutes later, for as
  long as it takes; only the first failure in a row is logged, step `stock`).
  The Stock switch sends at once (`sendNow`); a vendor's notice is sent by
  the worker's first step (`sendStockDue`, up to 10 listings, 25 s), for
  every website (on or off) and also while automation is paused
  (`trigger_pb_worker()` wakes for it; a paused cron run does only this).
  `route.ts behind()` no longer re-sends a listing for a stock difference;
  `publish.ts` marks a listing (`stockMoved`) when the product's stock
  changed while it was being published. The Stock tile says how many stores
  are still owed (`ProductPage` → `StockTile owed`).
- **D5 Published is true.** A product saved on Shopify that cannot be put on
  the Online Store channel fails the listing (`channel_due`, retried) instead
  of being saved as Published with a warning. `media_checked_at`: cleared by
  a publish that uploaded photos; `mediaCheck.ts checkMedia` (worker, 5 per
  run, from 3 minutes after the publish) reads the product's media status:
  all ready → settled; still processing → next run, for 30 minutes; failed
  (or not ready after 30 minutes) → `photoNote` appended to the listing's
  `error`, activity `media_failed`; a store that cannot be asked is given up
  after a day. Products filter `l:warn` = "Published with a note" (a
  published listing whose `error` is set).
- **D7 pause, limit, cost** (`brake.ts`). A run asks again whether
  automation is paused before each item (at most every 10 s) and stops
  starting items; a round started with "Run now" while already paused runs
  through. `pb_settings.automation.daily_limit_inr` (₹ per IST day; absent →
  500, 0 → none): once `pb_ai_cost_since(today)` × `USD_INR` reaches it the
  worker skips generate, tag fill and the reading of imported and hand-added
  products (`WorkResult.limit`); Telegram posts are still read (one may be a
  stock notice), publishing and stock go on; a button a person taps is not
  held back. Set in Settings →
  Automation beside "Today so far". `ai.ts` attaches `usd` to failures raised
  after the model answered (`http.ts usdOf`); the reader, the writer (also a
  failed rewrite) and the tag filler log it on their `failed` row, and
  `pb_ai_costs` / `pb_ai_cost_since` count `failed` rows.

### Batch 3 — seeing problems, delete rights, server checks
- **D8 the app says when something is wrong** (where a message goes when
  nobody is looking is the owner's decision Q3, not built). The worker
  records each run: `pb_settings` key `worker` = `{ at, …counts }`
  (`actions.ts doWork`). `shopify.ts gql` writes `pb_websites.last_error`
  when Shopify refuses the store (401, 402, 403, 404, 423, ACCESS_DENIED), so
  the website card and the dashboard say "connection problem" until a test
  passes. Dashboard (`DashAlerts`, `dashShared.stalled`): "Automation last
  ran X, and N items are waiting" when automation is on, work waits on
  products or on listings of switched-on websites, and the last run is over
  10 minutes old; "Today's AI limit is used up"; one banner per website with
  a `last_error`; "N published listings carry a note" (→ filter `l:warn`).
  The header says "automation last ran X"; the Needs review tile says since
  when the oldest listing waits; the numbers reload quietly every minute
  while the page is in view (`hooks/useAutoRefresh`).
- **D9 only the server deletes products, listings and websites**
  (`20261113030000_pb_server_only_delete.sql`): a RESTRICTIVE delete policy
  `using (false)` on `pb_products`, `pb_listings`, `pb_websites`. The app
  never deleted them directly; "Delete product" goes through the edge
  function (service role, admins only).
- **D11 server checks and deploy notes.** `supabase/functions/_check/`
  (tsconfig + two stubs), `npm run check:server`, `npm run test:server`; the
  deploy workflow runs both before the build (Node 22). How the functions go
  live, what that depends on and how to roll back: `docs/playbook/DEPLOY.md`.
  Not changed: the functions are still one-line loaders pinned to a commit of
  this public repository; deploying real files from GitHub Actions needs a
  Supabase access token only the owner can create.

### Independent review of batches 2 and 3 (2026-11-13)
Fixed before the batches went live (`20261113040000_pb_stock_save.sql`):
- **One definition of "on sale on Shopify"** (`stockSend.ts offSale` /
  `ON_SALE`, the same rule in `pb_stock_save`): the listing has a Shopify
  product that was not hidden (DRAFT) or archived there. Its Playbook status
  does not decide it: a listing set aside while its product was archived is
  still on the store. Stock is marked, sent and counted by this rule, so a
  permanent stock-out cannot leave a product on sale; `retire` uses it too,
  and the worker sweeps for a permanent stock-out whose archive did not
  happen (`retireDue`).
- **Archived products**: a stock change, by the switch or a vendor's notice
  (`pb_stock_candidates`), also reaches an archived product's listings that
  are still on a store.
- **Saved and marked together**: `pb_stock_save(product, change)` updates the
  product and marks its listings in one transaction.
- **An older send cannot win**: a send that finds the stock changed while it
  was on its way marks the listing owed again.
- **A store that is down does not hold up the others**: the stock step gives
  each Shopify call 10 s, tries a failing store once a run and fetches the
  other stores' listings instead; the photo check does the same.
- **The daily limit never hides a stock notice**: once it is used up, Telegram
  posts are still read. While automation is PAUSED they wait (the pause text
  says so).
- **No listing is written for a permanent stock-out** (`generate.ts`).
- **Cost counted**: a write thrown away because the product changed, a read
  that could not be saved, and a refused manual tag fill log their `usd`.
- **Stock toast**: `set_stock` returns `resent` (reached at once) and
  `waiting` (not reached yet). **Settings**: the pause and the daily limit
  save only their own part of `automation` (`saveAutomation`), so a page
  opened before a pause cannot undo it.
Accepted as they are: stock owed to a dead store is tried every 5 minutes for
as long as it takes (the dashboard shows the store's problem); while the daily
limit is used up the worker is still woken each minute when work waits (it
reads settings and stops).


### Batch 4 — photos: remove, main photo, order (D10)
Photos could be added but never removed or reordered; the first photo is the
main image on every store, and a photo the AI could not open held the product
back with no way to take it out.
- **Database** (`20261113100000_pb_photos_set.sql`): `pb_photos_set(product,
  order uuid[])` — one transaction: the kept photos get positions 0…n-1, each
  listing's `image_alts` move with their photos, and the photos left out are
  moved behind (100000+) and handed back. It deletes nothing itself.
- **Server** (`photosEdit.ts`): `photos_set { product_id, order[], remove[] }`
  (staff). `order` = the photos that stay, first = main; `remove` = deleted
  for good (row → photo prints by cascade → file). A photo in neither list
  (added meanwhile) stays, after the others. Refused while the AI reads the
  product or writes one of its listings. Then `follow`: the gate runs (no
  photo left → Needs info); a product whose `ai_error` is "could not open one
  of the product photos" goes back to `new` (read again); on a Ready product a
  **published** listing whose store gallery differs is set `publishing` (on a
  Review first site `review`) — no AI call — and a listing the writer gave up
  on for a photo is queued again. A listing still waiting is **not** rewritten
  for a photo (its alt texts already moved). `photos_sync { product_id }` runs
  the same follow-up after photos were added in the app. A failure after the
  photos are saved is a warning; `route_due` makes the worker check again.
- **Routing** (`route.ts`): `behind` is also true when the photos differ from
  the last `published` row's `photos` (or `photos_tried`: a list the store
  refused, written by `publish.ts`, is not sent again by itself), so every
  later routing catches up too. New: a listing published before that is
  waiting to go out again (`publishing` unclaimed, or `review`) is left as it
  is and only re-priced in place — before, a second change within the minute
  sent a live listing back to the AI writer.
- **One list** (`photos.ts galleryOf`): the first 20 photos by position, used
  by the writer, publish and routing alike.
- **App**: tap a photo → the viewer has **Make main photo**, **Position**
  (move to any place) and **Remove photo** (confirm). The viewer follows the
  photo it shows. `usePhotoActions` holds the page's photo jobs; the page
  stays busy until it has reloaded. Adding photos now also calls `photos_sync`.
- **Local SQL tests** moved to `supabase/tests/sql/` (`t_photos.sql` added).

### Batch 5 — Telegram intake (D13, D14, D15, D16, D20)
Details and the data flow: `docs/playbook/telegram-intake.md`, "Pre-launch
fixes". In short:
- **D13 two dates kept.** `pb_products.source_posted_at` (when the vendor
  posted it: the forward header, or the crawler's word for a repost) and
  `pb_listings.first_published_at` (set on the first publish only;
  `published_at` still moves on every re-send; a store move clears both).
  Shown as "posted …" on a Telegram product and "First live …" on a listing.
- **D14 skipped messages can be seen.** `pb_tg_messages.skip_why`; Settings →
  Telegram counts and lists the ones that may hide something (a text with no
  photos and no price, chatter, a forward from a person, a lone "Less").
- **D15 short captions are kept.** `pb-telegram/text.ts`: a design number and
  a price without an English price word is a description (Hinglish, Hindi and
  Gujarati marks included); one number is enough on a caption.
- **D16 not by position alone.** Chatter never joins a product; photos posted
  15 minutes or more (the vendor's own clock) after the ones before them, in
  another album, are another product.
- **D20 the bot out of the group.** Noticed by event and by asking Telegram;
  Settings says "Not receiving", the dashboard has a banner, and the crawler
  is told nothing is due, so no cursor moves. Forwards that never arrived are
  found and sent again (`rewind_to`). Crawler 1.2.0.
- Migration `20261113110000_pb_tg_dates_skipped_group.sql` (additive).

### Batch 6 — repeats, copies and codes (D17, D18, D19, D21)
- **D17 a new broadcast brings a product back** (`restock.ts`, called by the
  reader after the gate). Only on the FIRST read of a vendor's Telegram post
  that is a product: not when the reader saw a stock notice in it, not for a
  product copied from a store or typed in (a person has the Stock switch). A
  late description makes the next read a first read again. The products the
  post means are the vendor's EARLIER products of the same design in the same
  colour, found as a stock notice finds them (`pb_stock_candidates`: the
  design NUMBER at this vendor, so "D no 5081" counts). "D no 5081", "D-5081"
  and "5081" are one design; KB 5081 and NKB 5081 are two and nothing is
  guessed. The colour must match in full or by its trade name, either way
  round (Rama = Teal Blue); with no colour on one side, only when the design
  has a single earlier product — also when the gate holds the post as a copy
  of the earliest one.
  For each: out of stock → in stock again (the stores are sent the change); a
  "temporarily out" note → cleared, unless a LATER post left it. Archived or
  permanently out → left alone (the post is its own product). A post that
  arrived without the vendor's time (an old crawler) brings nothing back and
  stamps nothing: its place in the order is not known.
  Old news: when the vendor said "permanent stock out" for that design and
  colour AFTER making the post, and the notice was read first, the post goes
  the way that product went — permanently out and archived, with the note "Not
  listed: after this post the vendor said permanent stock out for …"
  (`pb_stock_gone`: the vendor's products of that design number a newer word
  took off sale for good; third review, finding 1).
  A post that matched a sold-out product is that product posted again: when
  the gate does not hold it already (a number alone never holds by itself) the
  pair is stored as "same" and the gate is re-applied BEFORE any stock is
  touched, so it waits in Needs info · Already here as … and never becomes a
  second listing. Its Notes from Telegram say "This post brought back in
  stock: …" or "Not brought back, a newer stock-out stands: …". A number-only
  re-post of a product that is IN stock stays a suggestion, as before (owner
  decision Q7 is open).
- **The later word wins — in the database, by the vendor's own clock.**
  `pb_products.stock_said_at` is the time of the latest word that DECIDED a
  product's stock: when the vendor MADE the notice or the post
  (`source_posted_at`, else when it reached Playbook; `stock.ts saidAt`), or
  when a person switched its Stock off. `pb_stock_save` is told when the word
  it applies was said, and applies it only when no newer word is on record, in
  the same statement; it answers -2 otherwise (`NEWER`). In its `p_change`:
  - `said_at` = a time — a word that decides the stock (a notice, a re-post,
    the switch OFF): judged and put on record. At the very same time a
    stock-out stands: a word that puts the product back on sale must be newer;
  - `said_at` = null — the switch ON: always applies and FORGETS the time on
    record, so a vendor's notice posted before the tap that has not reached
    Playbook yet still applies (a mis-tap must not silence it);
  - `as_of` = a time — a note only (a temporary stock-out): judged by its time
    but not put on record, so it never outranks a real stock-out read after it;
  - `force` — the switch OFF: always applies.
  The "temporarily out" note is dated when the vendor said it; a word clears
  only a note OLDER than itself, and an older note never replaces a newer one.
  So the order in which posts happen to be READ (a failed read is retried
  minutes later; a post waits for its "Less") does not matter:
  - a re-post never brings back a product a newer notice switched off;
  - a notice read late never switches off a product the vendor posted again
    since: the re-post stamps its own time on itself and on the earlier
    products it stands for, also when they are simply in stock;
  - a notice for a product that is out already still records its time, and
    says "out" in full whatever its look-up showed;
  - a temporary and a plain (or permanent) notice end the same in both orders.
  A stock notice's line says "left as it is, a newer post or change stands:
  …" for what it did not touch. Found by the independent review of this batch
  (2026-11-13): the first version judged by a timeline row that a notice did
  not always write, and an older re-post read last put a sold-out product
  back on sale; its second look found the switch, the temporary note, the
  equal-time and the stale look-up corners above.
  Products that are out of stock when this arrives get `stock_said_at = now()`
  (no time was on record, and any old post read afterwards would have walked
  past an empty record; live on the day: none).
  Known limits: a permanent notice that is older than a stock-out (or a
  person's switch OFF) already on record is not applied, so the product stays
  out of stock but is not archived; a notice that names a design Playbook has
  not read yet does nothing, so if that product's own post is read afterwards
  it comes in as in stock; after a person switches Stock ON, a notice OLDER
  than a re-post that was already read (its read failed and was tried again)
  still switches the product off; and two worker runs that interleave within
  a few milliseconds can leave a product sold out although the vendor's later
  post says it is back (the safe direction).
- **D18 copies can be found and cleared together.**
  `pb_products.copy_of` = what the gate holds a product as a copy of, written
  by the gate with the status. The note follows what it points at
  (`pb_copies_follow`): when that product is archived or deleted, or its code,
  colour or vendor changes, the products pointing at it get the next earlier
  product, or none; when a product comes back from the archive, the waiting
  products it holds get their note again. Only the note moves — the waiting
  product itself is not touched. (No foreign key on the column: "on delete set
  null" would empty the note before the trigger can look for the next one.)
  Products → More statuses → **Waiting as copies** filters on it; on Needs
  info a bar counts them (one cheap count of the notes), with **Show only
  these** and **Archive the copies**. Looking first is
  `pb_copies_archive(false)` (the app calls it itself, on the tap); archiving
  is `copies_archive` on the server, a bulk change (kind `copies`). Every copy
  is judged once, as things stand before anything is archived, so what the
  confirmation showed is what is done. Left for a person, and counted:
  `on_site` (a listing of the copy is on a store), `priced` (it came with a
  vendor cost the earlier product contradicts, or lacks while having no price
  at all; an earlier product copied from a store sells at that store's price,
  so a cost on the copy is nothing it lacks), `no_colour` (the earlier product
  has no colour: the gate holds any colour as its copy because it cannot tell,
  and archiving would keep the incomplete product and lose a complete Grey or
  Black one) and `linked` (it is part of a chain: another waiting copy points
  at it, or it copies a product that is itself waiting as a copy). Notes that
  no longer hold are cleared by the same call. Known limits: a copy whose
  original a person archives, re-colours or deletes by hand loses its note at
  once but waits in Needs info until its own gate runs (opening and saving
  it); the note trigger costs about one copy-rule look-up per waiting copy of
  the changed product (fine up to dozens of copies of one design); and a copy
  that arrives in the very second "Archive the copies" is tapped while every
  note on record no longer holds is archived without the question (the toast
  says so, and Bulk changes takes it back). Nothing is
  let go to the websites by it, and no answer is stored for the pairs. Weaker
  matches (kind `maybe`: a number-only code, another vendor's code, the same
  number under other letters, the same photo) now show on the list row as
  "May be a copy of … · same photo" (`listHints`, one read per page).
- **D19 two colours never share a store code** (`skuCode.ts codeBase`). For a
  product from Telegram or typed in, the colour goes into each size's SKU and
  barcode: `KA-5070` + Wine + M → `KA-5070-WINE-M`. Unchanged: a code that
  carries words after its design code (it names its colour in the vendor's
  own words: `KB 302 WINE`, `KB 264 RAMA`), a product with no colour, and a
  product copied from a store. The colour part is decided ONCE per product,
  by the first send a store ACCEPTS (`pb_products.sku_colour`; '' = none;
  `publishParts.ts skuColour` / `keepColour`, saved right after productSet and
  before anything else can fail), then used for every send to every website:
  a send that fails half-way finds the same codes on its next try, a send the
  store refuses decides nothing (a colour corrected afterwards is the one
  used), codes that are on a store do not follow a colour that is re-worded
  later, and the same goods carry one code on every store — when two websites
  send a new product at once, the one the store took first decides and the
  other is sent again with it (a passing failure, no attempt used up). A
  product that was on a store before this is decided as '' (its codes stay as
  they are; live on the day: no listing existed). Known limit: a product that
  was deleted in Shopify and is put back is sent as new, with the colour part.
- **D21 the copy rules are tested, and two posts read in the same minute are
  caught.** `supabase/tests/sql/t_dups.sql` checks `pb_code_key`,
  `pb_colour_keys`, the scan, the gate's hold and note, the answers, the
  products a notice or a re-post means, clearing copies with its revert, and
  the "later word" rule of `pb_stock_save`, against the real migration files;
  it counts its own checks, `run.sh` fails on a failed check, and the workflow
  "Playbook SQL tests" runs it on every change to the SQL. After a read is
  saved the reader asks for the product's matches and has the gate judge again
  any LATER post that still stands as Ready (`restock.ts regateLater`): it had
  been judged before this one's code was saved.
- Migrations, all additive: `20261113120000_pb_copies.sql` (column, index,
  two triggers, `pb_copies_archive`, `pb_bulk_revert_copies`, the gate and
  the revert entry point with the same signatures),
  `20261113130000_pb_stock_word.sql` (`stock_said_at`, `pb_stock_save` with
  the same signature) and `20261113140000_pb_product_sku_colour.sql`.

## Bulk changes: the log and Revert (owner, 2026-11-12)

Owner: "We should also have revert option. Firstly log all bulk changes we
did for past 7 days with option to revert them. Only those which are done in
bulk. If by mistake we made changes in bulk we should have the option to
revert those changes. Also only allow those bulk changes which can be
reverted in bulk easily without creating any problem."

A **bulk change** is one tap that changes many products or listings.

### How a bulk change is recorded
- `pb_bulk_runs`: one row per bulk change (`kind`, `label` = the sentence the
  log shows, `items`, `details` = the action's own counts, `status`
  running / done / reverted / partly_reverted, who, when, `revert_result`).
- `pb_bulk_items`: every row the change touched, as it was (`before`) and as
  it became (`after`), with `done` once a revert has settled it.
- The server opens a run (`bulkLog.ts startRun`, or `asBulk` around the
  whole action) and passes its id to the database calls that belong to it
  (`db.ts`: `patch(…, run)`, `insert(…, { run })`, `remove(…, run)`,
  `rpc(…, run)`), which sends the header `x-pb-bulk`. The trigger
  `pb_bulk_capture` on `pb_listings`, `pb_products` (including its stock
  fields) and the six tag tables (`pb_attributes`, `pb_attribute_values`,
  `pb_category_attributes`, `pb_product_values`, `pb_tag_suggestions`,
  `pb_settings`) writes the item in the same transaction — also for the rows
  a database function or a cascade changes — and only for a call from the
  server that carries the header (`pb_bulk_run()`), so a bulk change cannot
  go unrecorded and an ordinary save costs one settings lookup. `endRun`
  closes the run; one that touched nothing leaves the log.
- "Only those which are done in bulk": a tag-list change or a stock notice
  stays in the log only when it reached **two or more products**, or (tag
  lists) took two or more entries out of the lists at once (an attribute goes
  with its values and links) or filed two or more new words at once — or
  one, when Playbook filed it by itself (a run with no person)
  (`endRun` → `sizeOf`; `details.unit` says what `items` counts). Below that
  it is an ordinary edit and leaves the log.
- An import's run has the import's own id; the runner asks for it on every
  tick, and every product it adds is recorded under it (`ingest(body, run)`).

### What a revert does (`pb_bulk_revert(run, apply, user, note)`)
Row by row, and **only where the row is still as the change left it**; what
somebody changed since is left alone and counted. `apply = false` only counts
(the sheet shows the counts before anyone confirms). Refused in plain words:
still running, already reverted, older than 7 days, and (re-price, re-read,
copies, stock notices, and all tag-list kinds together) a later bulk change of
the same family that touched the same rows: that one is reverted first, so
prices or tags never end up as a mix that never existed. A row a
worker run holds right now is "busy": the run becomes `partly_reverted` and
Revert can be tapped again for the rest.

| kind | made by | revert |
|---|---|---|
| `import` | Import from website | the server deletes, 25 at a time with their photo files, the products it added that are on no store and that nobody typed into; products on a store or edited by hand are kept and said (`pb_bulk_import_targets`, `bulkRevert.ts`) |
| `route_site` | Send matching products now, switching a website on | a listing not on the store is set aside with the note `REVERTED`; one that is live gets `unpublish_due` and the worker hides it on Shopify (DRAFT) within minutes (`takeOff.ts`, also while paused), then it carries the same note. Routing leaves such listings alone. "Send matching products now" queues the ones that never reached the store again; one that was hidden on the store is put back from its own page ("Put back on site", the only send that makes a hidden Shopify product visible), and the send says how many those are (`hidden`). (`pb_listings.put_back`, "the next send also makes it visible", is used by a stock notice's revert only) |
| `reprice_site` | Update prices on Shopify | price and compare-at price back; a published listing is sent again. The website's pricing rule is not touched |
| `retry_failed` | Retry all | the listings nothing has picked up yet go back to Failed with their old message; what was already tried again stays |
| `reread_failed` | Read again (unread products) | the products not read again yet go back to Needs info |
| `copies` | Archive the copies (Products → Needs info) | earliest first, a product that is still archived AND would wait as a copy again goes back to Needs info; one that is no longer a copy of anything stays archived and is counted (`not_copies`), so a revert sends nothing to a website; one somebody restored or changed since is left alone. Looking first runs the same steps and undoes them (`pb_bulk_revert_copies`) |
| `reread` | only from the log: the re-read of all products on 12 Nov 2026 | each field that read changed goes back where the product still holds what the read wrote and the field is not locked; the gate runs and the tag rules run again. The reader's log kept the first 200 characters of each old value, so the long notes of 105 products are not put back |
| `value_delete`, `value_merge`, `attribute_delete`, `categories`, `category_links` | Settings → Tags: delete a value, merge two values, delete an attribute, save the category list, save a category's must-have tags (`tagsBulk.ts`) | one revert for every tag kind (`pb_bulk_revert_tags`): what the change deleted comes back and what it added goes, in the order the tables depend on each other (attributes → values and their "also known as" words → category links → products' values → suggestions → the category list); a value whose name is taken again, or a single-choice attribute that has another value on the product by now, is left and counted (`left`); a product whose tags a person set (or asked the AI to fill) since is left alone (`kept`). Every product it reached is checked again (Ready / Needs info). A preview runs the same code and is rolled back. The server adds what the database's counts leave out: links, the category list, suggestions (`listCounts`) |
| `suggestions` | the worker filing new tag words by itself, one pass at a time (`tagsFile.ts`); before 18 Nov 2026 Settings → Tags → Suggestions, two or more handled at once by a person | as above: the words as they were (pending again; one the worker filed stays marked `filed_by` 'auto' and is not filed again), their "also known as" entries out of the lists again, a value made from one out again (unless a product uses it by now), the example products' tags as before |
| `retag` | Retag all (`tagsProduct.ts`) | as above: the products' tags as before |
| `tag_fill` | Let AI decide, queued (`tagsQueue.ts`; the run has the fill run's id; the worker writes each product as part of it and closes it 5 minutes after the queue is over, never sooner: overlapping worker runs may still be writing a product they took, `tagFill.ts closeFills`) | as above: the AI's tags come off, the suggestions it counted as before |
| `stock_notice` | a vendor's stock notice that marks two or more products (`stockNotice.ts`) | each product gets back the stock it had, where its stock is still as the notice left it (`changed` otherwise); after a PERMANENT notice it also comes out of the archive, and the listings the notice took off are put back: one archived on Shopify is sent again and made visible (`pb_listings.put_back`, cleared by that publish), one that only waited goes back to where it waited (`pb_bulk_revert_stock`; found by their note, `PERM_NOTE`). The notice's own row is not part of it |

Since 2026-11-20 a revert that changes a product's category, chosen values
(`pb_products.tags`) or read facts — a category move or rename, Retag all,
"Let AI decide", a value merged or deleted, the re-read — reaches the stores
by itself, as the change did: the revert is an UPDATE of `pb_products`, the
trigger `pb_facts_follow` marks the product's listings that are on sale, and
`factsSend.ts` sends the product type, tags and fields (last section). The
mark is not part of the bulk change: no `pb_listings` item is recorded for it
(`t_dups.sql` part 14). The revert sheet says so (`bulkText.ts FOLLOW`); until
then it said "The revert itself sends nothing to a store."

The two bulk changes of the week before the log existed were written into it
from what was on record (`20261113070000_pb_bulk_log_backfill.sql`).

### Not in the log
- **Moving a website to another store** (Websites → Store connection, a new
  myshopify address). It cannot be taken back in bulk, and the products on
  the old store would stay there out of Playbook's reach. So it is refused
  while any product of that website is on the old store (`siteActions.ts`,
  the rule of `stockSend.ts ON_SALE`); the answer suggests adding the new
  store as a new website. With nothing on the old store it works as before.
- A change that reaches one product (see above) is an ordinary edit.
- The tags and product type a listing carries on Shopify: until 2026-11-20
  they came from when the listing was written, and a tag change (or its
  revert) reached the store only when the listing was written again. Since
  then they, and the custom fields, follow the product by themselves (last
  section): the change, or its revert, marks the listings on sale and the
  worker's small send brings the store up to date. Neither that send nor the
  website's button "Send tags and fields again" (`resend_website`) is a bulk
  change: they change nothing a person or the AI decided, only send again
  what follows from the product and the website's saved rules, so there is
  nothing to put back and a second tap gives the same result. The button is
  written to the website's activity (`facts_resend_site`), as "Set up on
  Shopify" is.

Part 2 of the database side (`20261113090000_pb_bulk_log_tags_stock.sql`)
was run by hand on the live database on 13 Nov 2026 (the automated path
holds SQL that contains a `delete` for a confirmation that does not reach
the owner) and is replayed in order like any migration. Its scenarios run on
PostgreSQL with every change (`supabase/tests/sql/t_tags.sql`, `t_stock.sql`):
every one returns the data exactly to its start, and a preview changes
nothing.

### UI
Settings → **Bulk changes** (`BulkTile`): the last 7 days, newest first:
label, "136 products · 10 Nov, 9:28 AM · by …", until when it can be taken
back, or what a revert did. **Revert** (admin / manager) opens
`BulkRevertSheet`: it asks `bulk_preview`, says in sentences what would
change (`bulkText.ts plan`) and has one button; the server's refusal is shown
instead of a button. "Retry all" and "Read again" only repeat a step that
failed, so their button is "Stop the rest". The success messages of
"Send matching products now" and "Update prices on Shopify" say where the
change can be taken back, and so do the confirmations of Delete and Merge on
the Tags page when the change will be listed (two or more products, or an
attribute with values: `TAKE_BACK`).

## The store follows the product by itself: type, tags, fields; sizes in one format (owner, 2026-11-20)

Owner: "Category changes: a change does not reach products already on the
store. Corrected tags and fields: these are not sent again by themselves.
Sizes: they are named six different ways. solve these biggest issues with
permanent fixes."

Before: a listing's Shopify **product type** (the Playbook category; the store
files the product in its collection by it) and its **tags** were worked out
once, when the AI wrote the listing (`pb_listings.product_type`,
`pb_listings.tags`), and every later send repeated those copies; the **custom
fields** were built fresh but rode only on some other full send. Nothing asked
for a send when a category was renamed or moved, a person changed a product's
category, a value was corrected or a bulk change was taken back: only
"Regenerate" moved the type and tags, one listing at a time. Size labels were
kept as each source wrote them. Now the first two work as stock has since
13 Nov (`stockSend.ts`, batch 2): a mark, and a small send of its own.
Migration `20261120100000_pb_facts_send.sql` (additive).

### The marks (`pb_listings`) and the four triggers
- `facts_due boolean not null default false` = the store is owed this
  product's type, tags and fields as they are now; `facts_force boolean` =
  send even when the record says nothing changed (the button);
  `facts_tried_at timestamptz` = the stamp of the last try; `sent jsonb` =
  what the store was last sent, `{ type, tags, fields }` (`types.ts
  SentFacts`; null = not on record); `ai_tags text[]` = the AI's extra tags,
  kept apart from the rule-built ones (null = written before they were kept).
  Partial index `pb_listings_facts_due_idx (facts_tried_at) where facts_due`.
- One trigger function `public.pb_facts_follow()` (SECURITY DEFINER: the
  product page writes `pb_products` as the signed-in person, and the mark
  must reach the listing whatever that person may change there; `search_path
  = ''` with every table named in full, as the other Playbook functions that
  run with the owner's rights; it writes nothing but the mark) behind four
  AFTER UPDATE row triggers, each named `pb_facts_follow`:

  | table | fires when one of these changed | marks the listings of |
  |---|---|---|
  | `pb_products` | category, fabric, color, tags, attributes, sku, sizes, vendor_id; or its status leaves `archived` (a restore: nothing is sent while a product is archived, so what changed meanwhile goes then) | that product |
  | `pb_attributes` | name, key, multi, shopify_prefix, by_category | the products carrying one of its values |
  | `pb_attribute_values` | name, categories | the products carrying that value |
  | `pb_vendors` | name, codes | that vendor's products |

  Each sets `facts_due = true, facts_tried_at = null` on those products'
  listings that are **on sale on Shopify** (`shopify_product_id is not null
  and not (status = 'skipped' and coalesce(shopify_status, '') in ('DRAFT',
  'ARCHIVED'))`: the rule of `pb_stock_save` and `stockSend.ts ON_SALE`),
  whatever their website (on a switched-off website the mark waits). Every
  change writes the row, a listing already marked included: the write holds
  the row until the change commits, so a send's stamp waits for it and then
  reads the product as changed (code check, 2026-11-20: leaving a marked row
  unwritten let a send read the old product and clear the mark). Nothing is
  marked for a change of name, cost, text or any other status change, or for
  a new "also known as" word.
- So no path can be missed: the product page (a write straight from the
  browser, `data/products.ts`), `pb_category_rename`, `pb_category_move`, a
  re-read, Retag all, "Let AI decide", `product_values_set` (the Ready check
  rewrites `pb_products.tags`) and every revert end in an UPDATE of one of
  those rows.
- `trigger_pb_worker` also wakes for a due listing (never tried, or last
  tried 5 minutes ago) on a website that is switched on. The line is patched
  into the live function as text (a DO block that raises when the function is
  not the 20261118120000 version), in the part a pause holds.

### One definition of what the store shows — `listingFacts.ts`
Used by both sends, so they cannot drift apart.
- `type` = the product's category, trimmed. An empty one is never sent: the
  store keeps what it has.
- `tags` = `ownTags`: the website's tag rules (`tags.ts buildTags`) over the
  product's facts and its chosen values (`tagStore.ts siteValueTags`), sizes
  in the house format, plus the AI's extra tags (`extrasOf`: the listing's
  `ai_tags`). A listing written before they were kept (`ai_tags` null) keeps
  as extras only its tags on the website's `tag_rules.ai_allowed` list:
  anything else cannot be told from a rule tag that went stale, so on a
  website with no such list its old AI extras leave the store at its next
  send, until Regenerate writes new ones. Tags a person typed on the listing
  (`locked` holds `'tags'`) stay as typed.
- `fields` = `fieldRecord`: `fields.ts fieldInputs` without the questions,
  as key → value (a list as its JSON); null when the website sends no custom
  fields (Store profile).
- `listingFacts(l, p, site)` reads the vendor, the value tags and the
  attribute values (three small reads). `sameFacts(now, was)`: no record =
  not the same; tags are compared as a set, capitals and order aside
  (`sameTags`); an empty category is never a difference, nor are the fields
  of a website that sends none. `sentOf(now, was, notIn, stayed)` = the record
  of a send: **only what the store took**. A field it did not take keeps the
  value it had from Playbook, or none (so the record differs and the field is
  sent again; a field that is the store's own is never on record, so never
  taken off); a field that could not be taken off stays on record (so it is
  taken off again); a website that sends no fields keeps the earlier record
  of them. `emptied` = the keys on record that the product no longer has a
  value for.

### The small send — `factsSend.ts`
`sendFacts(c, userId, cols, ms)` for one due listing (`c` = the row as the
worker's page of candidates read it), in this order:
1. by that row: off sale (`stockSend.ts offSale`) → the mark is cleared,
   nothing sent; a run is publishing the listing right now → wait (that
   publish sends the same tags and fields and records them);
2. **the try is stamped first** (`facts_tried_at = now`), only where the
   listing is still due and not tried in the last 5 minutes (another run has
   it → wait), and the send works from the row the stamp returns. Everything
   after the stamp is read fresh. A change that commits before the stamp is
   in what is read; one that commits after it wipes the stamp. (Code check,
   2026-11-20: reading the product before stamping lost a change that landed
   in between, and the button's "send anyway" with it);
3. by the fresh row: off sale → cleared; a publish holds it → the stamp is
   handed back, wait;
4. the product or website is gone, or the product is **archived** → cleared,
   nothing sent (its listing stays on the store as it was; a restore marks
   it again); the **website is switched off** → the stamp is handed back,
   wait: the mark stays;
5. not forced and **the record equals** what the product gives now
   (`sameFacts(now, l.sent)`) → cleared with **no call to Shopify**, so a
   mark too many costs nothing;
6. `ensureCollection` (below), then the store's tags are read; the **product
   was deleted in Shopify** → cleared (the next publish says so on the
   listing);
7. `productUpdate { id, productType, tags }`, the tags through `mergeTags`
   (the store's tags that are not on Playbook's record — `sent.tags`, else
   the last `published` row's — stay). The type and tags go **on record at
   once** (`sent`, `product_type`), before the fields: if the fields fail,
   the next try still knows which of the store's tags are Playbook's;
8. on a website with custom fields: `fieldsSend.ts syncFields` =
   `sendFields` (`metafieldsSet`, without `custom.faq`: the questions belong
   to the text) and `dropFields` (`metafieldsDelete`) for the `emptied` keys,
   so a value removed in Playbook does not live on at the store. Both say
   which keys they left undone (`FieldsLeft`), and whether the store simply
   did not answer (a time-out, an empty answer): then what it took is put on
   record and the send **fails**, so it is tried again. A field refused by
   the store's own rules is a warning, not a failure;
9. `sent` (only what the store took) and `product_type` are saved whatever
   happened meanwhile; the mark and `facts_force` are cleared **only where
   the stamp still stands**. Where it is gone — the product changed while
   the send was on its way, or a newer send finished first and this older
   one reached the store last — the listing is marked again with
   `facts_force`, so the next send goes whatever the record says. The
   listing's `tags` become the ones sent, unless a person typed tags
   meanwhile;
10. activity `facts_sent`: `type` and `was_type` (when the type changed),
    `tags`, `fields` (how many are on record), `cleared` (keys taken off),
    `asked: true` (forced), `warning`.

A **failure** (Shopify refuses this product, a collection could not be made,
the store did not answer for the fields) leaves the stamp, so it is tried
again 5 minutes later (`RETRY_MS`), for as long as it takes; only the first
failure in a row goes on the timeline (`failed`, `details.step = 'facts'`).
It is seen in the app too: a listing with no note of its own gets `error` =
`FACTS_NOTE` ("Its category, tags and custom fields could not be sent to
Shopify yet, and Playbook tries again every 5 minutes: …") + the reason, so
it counts as "Published with a note". A send that goes through takes away
its own earlier notes — `FACTS_NOTE`, and an old custom-field warning the
store has since taken the field for (`fieldsSend.ts withoutFieldNotes`) —
and writes this send's field warnings, if any. Any other note (a publish's
warning, a person's reason) is never replaced or added to. Shopify only
being busy writes no note: the store's other listings wait for the next run.
A store that refuses **three products in a row** in one run (its key was
rejected, it is frozen) is left for the next run too (`STORE_FAILS`), so a
store that refuses everything is not asked for every product it is owed.
No title, description, price, size or photo is touched and no AI is used, so
the send needs no approval on a "Review first" website and also goes for a
product held in Needs info.

### The full send — `publish.ts`, `productInput.ts`, `generate.ts`
`publishOne` calls `listingFacts` and sends the **tags and fields** worked
out fresh (before: the copies saved when the AI wrote, so "Update on
Shopify", a re-price or a photo change put corrected tags back). The
**product type**: a create sends the category as it is now; a product
**already on the store keeps the type it has there** (`l.sent.type`, else the
listing's `product_type`; `buildProductInput`'s `type`), because a changed
category is the small send's to move — that one makes the collection first —
and the save marks the listing for it (`facts_due`). Code check, 2026-11-20:
a full publish that re-typed a product put it in no collection when the new
category had none on the store yet. Tags: `mergeTags(existing.tags,
l.sent?.tags ?? the last published row's, facts.tags)`. After `productSet`:
`syncFields` (fill, then take off the `emptied(facts, l.sent)` keys). The
save writes `tags`, `product_type` (what was sent) and `sent` = only what the
store took (`sentOf` with the keys left undone), and the `published` row's
`tags` are the fresh ones. When the store did not answer for the fields the
publish still stands, with its warning, and the listing is marked so the
small send tries them again. A full publish never clears `facts_due`: the
next small-send run finds the record equal and clears it without a call.
`generate.ts` builds the listing's tags through `ownTags` and saves `ai_tags`
(not for a listing whose tags are typed).

### Collections follow — `storeCollections.ts` (used by `storeSetup.ts` too)
- `ensureCollection(site, type, was, cache)`, before a product's type changes
  on a store: when the store files by type (it has a collection for the old
  type, `storeFields.ts sameCollection`) and has none for the new one, that
  collection is made first, exactly as store setup makes it
  (`makeCollection`: `collectionInput`, then the Online Store). When Shopify
  does not make it the send fails: the product keeps its old type and its old
  collection, and is tried again. A store with no collection for the old type
  gets the new type without one. One store at a time (`turns`: two listings
  sent side by side must not make it twice); a store's collections are read
  once per worker run (`ColCache`, keyed by website and shop), and **read
  again right before one is made**: the run's list can be minutes old, and a
  rename may have given the old collection that very name meanwhile.
- `renameCollections(from, to)`, called by `category_rename` **before** the
  database call and by the revert of a rename with the names swapped
  (`categoryRevert.ts`; both through `categoryMove.ts storesThenDatabase`):
  on every website that is switched on and connected,
  the store's collection for the old name takes the new **title** and gets a
  second rule "product type = new name" (`collectionUpdate` with
  `sourcesToCreate`; the old rule stays). Its page, address and menu links
  stay, and it holds the category's products the whole time they are re-typed
  one by one. Tried on SuratMandi, 2026-11-20: a collection's rules add up —
  a product matching either one is in it. Per website: `renamed`; `kept` (the
  new name has a collection of its own already; products move over as they
  are re-typed); `none` (the store has no collection for the old name);
  `failed` + `note`. It never throws: the rename goes on, and
  `ensureCollection` makes a collection for the new name when the first
  product is re-typed. When the database then refuses the rename, the same
  call with the names swapped puts the title back (the second rule stays: a
  product type nobody has).
- Nothing is ever deleted on a store: a category moved away leaves its
  collection there, empty. A website that is switched off when a category is
  renamed is not asked: once it is on again its products are re-typed, and
  the new name gets a collection of its own beside the old one.

### The worker — `worker.ts`
`sendFactsDue` (`CAPS.facts` = 60) runs right after the pause check, for up
to 25 s (`STOCK_MS`), and once more at the very end of the run with the time
that is left. `factsCandidates`: due, not tried in the last 5 minutes, on
websites that are switched on, never tried first; pages of 30, three at a
time, 10 s a call. `WorkResult.facts` = how many listings were settled.
Pace: about 30 to 100 listings a minute, by what else the run does. Unlike
stock, a pause holds it (a round a person starts with "Run now" sends them),
and so does a website that is switched off: the marks wait.

### The button — `resend_website` (`factsSite.ts`, staff)
Website → Tags → "Products already on this website" → **Send tags and fields
again** (`sections/ResendTile.tsx`; dimmed while the form is unsaved, because
the server reads the SAVED rules). The tap first asks with `dry: true` →
`{ ok, dry: true, listings, active }` (how many products of the website are
on sale on Shopify; nothing changes), a confirm names the website and the
number, then the action marks every one of those listings `facts_due` +
`facts_force` and answers `{ ok, listings }`; the worker's small send does
the rest. A website that is switched off is refused with a plain sentence
(HTTP 400). Website activity row `facts_resend_site { listings }`.
Forced = sent even where the record equals, for what the triggers cannot
see: the website's tag rules were changed, custom fields were switched on,
someone edited products in Shopify, or a field's kind was changed there.
**It is not in the bulk log** (Settings → Bulk changes), unlike the two other
whole-website buttons: it changes nothing a person or the AI decided — it
sends again what follows from the product and the website's saved rules — so
there is nothing to put back (old tags put back would differ from the product
at once and be sent again), and tapping it twice gives the same result.

### What a revert does now
A bulk revert that changes products' categories or values (category move or
rename, Retag all, "Let AI decide", a value merged or deleted, the re-read)
reaches the stores by itself too: the revert is an UPDATE of `pb_products`,
so the trigger marks the listings. A rename's revert also gives the
collection its old title back.

### Not changed
- Shopify's **standard category** (taxonomy, `garment.ts shopCategory`) still
  goes out on a create only.
- **Saving a website's tag rules does not send by itself** (as pricing): the
  button does. The saved rules are used at each product's next send.
- **The text does not follow**: the written title, description, SEO fields
  and alt texts keep a corrected colour or category as they were written
  (that needs Regenerate, the AI).
- An edit made in Shopify is still not noticed: it stays until that product's
  next send, or the button.

### Sizes in one format — `sizes.ts` (pure: `normalizeSize`, `normalizeSizes`, `sizeKeys`, `LETTERS`)
- Grammar: `LETTER` | `LETTER (N)` | `N` | `Free Size`; anything else comes
  back as it is, spaces tidied. LETTER = XXS XS S M L XL XXL 3XL 4XL 5XL 6XL
  in capitals (2XL → XXL, XXXL → 3XL, XXXXL → 4XL). N = a whole number 20 to
  60 as given, without a unit, a quote mark or the words Size, Inch, Bust,
  Chest, Stitched.
- Examples: `38"`, `38”`, `38 Inch`, `Size: 38` → `38`; `40 Size` → `40`;
  `2XL` → `XXL`; `xl` → `XL`; `L (40 Inch)`, `L Size, 40 Inch Stitched` →
  `L (40)`; `M(38)`, `M-38`, `38 (M)` → `M (38)`; `Free`, `FS`, `Freesize` →
  `Free Size`. `M/L`, `38-40`, `2-3 Years`, `Custom Stitch`, `Semi-Stitched`
  stay as they are.
- **Nothing is ever added**: `M` stays `M` (a supplier's M is not always 38:
  one imported product's own chart says M = 30), a bare number stays a number
  (34 can be a bust or a waist), and `M (38)` keeps the inches its supplier
  gave (owner, 2026-11-12: the measurement written with a size is kept).
- `normalizeSizes`: each label normalised, repeats dropped (case ignored), a
  fixed order — letters XXS … 6XL (a letter before the same letter with
  inches), then numbers rising, then Free Size, then unknown shapes in the
  order they came; at most 40 characters a label and 30 labels.
- Normalised at every write of `pb_products.sizes`: the import
  (`import/body.ts storeSizes`), the reader (`reader.ts`; the prompt still
  asks for the label as the post writes it), and the app, which writes the
  row straight from the browser (`src/playbook/data/products.ts`
  `updateProduct` / `createProduct`) through its own exact copy
  `src/playbook/data/sizes.ts`, held equal by `test/sizesMirror.test.mjs` (as
  `pricingMirror` holds the pricing copy).
- Normalised again at the send (`productInput.ts`, and `listingFacts.ts` for
  `{size}` tags), so a store can never show another format whatever a row
  still holds.
- A renamed size keeps its Shopify variant and option value (its id, carts
  and stock setting). Variant matching by `sizeKeys`: the exact label first;
  then the first key — the letter, else the number, else (an unknown shape)
  the label without its bracket part; then the second key, the number alone
  ("38" on the store, "M (38)" here). Each step takes only what is still
  unmatched, and only when one size here and one there share the key.
- Each size's SKU / barcode still ends in the label without its bracket part
  (`skuCode.ts sizeCore`, spaces out), so a code changes only where the label
  did: product `NNK1133` with the size `38"` sent `NNK1133-38"` and now sends
  `NNK1133-38`; `5081-LSize,40InchStitched` becomes `5081-L`; `1086-2XL`
  becomes `1086-XXL`.
- `route.ts` is unchanged: it already sends a live listing again, without the
  AI, when the product's sizes or SKU differ from what was last sent
  (`behind`; on a "Review first" website that re-send waits for approval).
  The rows that still held another spelling on 2026-11-20 (about 21 products,
  all on SuratMandi) are rewritten once after the deploy.

### Tests
`test/sizes`, `sizesMirror`, `sizesSend` (labels, variant ids, codes and the
product type at the send), `listingFacts` (tags without the AI, the
comparison, the record), `factsSend` and `factsStore` (one listing end to end
over a fake Supabase and a fake Shopify, `factsWorld.mjs`: every outcome
above, the collections, the button), `factsRaces` (the cases of the code
check: a change between the worker's page and the try, an older send landing
last, the record holding only what the store took, a store that refuses
everything), `publishFacts` (the full send), `categoryMove` (a rename and its
revert call the stores before the database).
SQL: `t_dups.sql` part 14 (which listings each change marks, the write with
the owner's rights, the stamp, reverts, no listing row in the log) and 14b
(the worker's wake-up line); the migration is in both lists of `run.sh`, and
`bootstrap.sql` gained `pb_vendors`.
