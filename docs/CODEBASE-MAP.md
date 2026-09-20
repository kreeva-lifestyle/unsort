# DailyOffice — codebase map

Generated 2026-09-15 from a full read of the repository (48,880 lines across
`src/`, `supabase/`, `tools/`, `.claude/`, `.github/`) plus read-only queries
against the live Supabase project (`ulphprdnswznfztawbvg`) for the realtime
publication, pg_cron jobs, public functions, RLS/trigger inventory and storage
buckets. Nothing was changed. `path:line` references are relative to the repo
root and were current at the time of writing.

The product is **DailyOffice** (back-office app for Arya Designs); the repo and
domain are still called `unsort`. Rules live in `CLAUDE.md`; the module list in
`UNSORT-CLAUDE-CODE-CONTEXT.md`. This document is the map underneath both.

Contents
1. Repo layout, build and deploy gates
2. Per-file index
3. Data flow per module
4. Printing paths
5. Cross-module shared state
6. Live database inventory (what exists that the repo does not record)
7. Contradictions with CLAUDE.md
8. Gotchas a new engineer must know

---

## 1. Repo layout, build and deploy gates

| Item | Fact |
|---|---|
| Stack | React 18 + TypeScript 5 + Vite 8 (`@vitejs/plugin-react`), Supabase JS v2, `xlsx`, `jsbarcode`, `qrcode`, `qz-tray`, `fflate`, `barcode-detector`. No router library: tabs are `#/<tab>` hash routes handled in `App.tsx`. |
| Build gate | `npm run build` = `eslint src/ && tsc && vite build`. `tsconfig.json` is `strict` with `noUnusedLocals`/`noUnusedParameters`. ESLint: `typescript-eslint` recommended + `react-hooks` (`exhaustive-deps` = warn, `no-explicit-any` and `no-unused-vars` off). 28 warnings exist today, 0 errors. |
| Deploy | `.github/workflows/deploy.yml`: on push to `main` (and manual dispatch) → `npm ci`, `npm run build`, upload `dist/`, `actions/deploy-pages@v4`. Concurrency group `pages` with `cancel-in-progress: false` (deploys queue). Live at `https://dailyoffice.aryadesigns.co.in`. |
| Vite | `vite.config.ts`: `base: '/'`, `cssTarget: 'safari15'`, `define __APP_BUILD__` (build stamp shown by `?vpdebug`), plugin `swVersionStamp` rewrites `__BUILD_TS__` in `dist/sw.js` so every deploy installs a fresh service-worker cache. |
| PWA | `public/sw.js` precaches `/index.html`, network-first for HTML/JS/CSS, posts `SW_UPDATED` to clients on activate; `main.tsx` shows a full-screen "Update Available" overlay only when a Supabase auth token exists in `localStorage` and the hash is not a `#/s/` short link. `public/manifest.json`, icons, `arya-designs-logo.png` (preloaded for short-link pages). |
| index.html | Minimal meta CSP (`object-src 'none'; base-uri 'self'`), `viewport-fit=cover`, iOS standalone meta tags, Google Fonts (Inter, Sora, JetBrains Mono), inline splash removed by a `MutationObserver` once `#root` has children. |
| Claude Code | `.claude/settings.json`: one `SessionStart` hook running `tsc --noEmit` + `eslint src/` (120 s). `.claude/skills/supabase-migration/SKILL.md`: 8-step migration workflow + 10-point checklist. |
| Tests | None. Verification is `npm run build` plus manual/headless-Chromium checks. |

Source tree:

```
src/
  App.tsx, main.tsx, index.css, vite-env.d.ts
  lib/        theme.tsx, supabase.ts, tabs.ts, friendlyError.ts, printQueue.ts, qzPrint.ts, faceId.ts, attendance.ts, …
  hooks/      useAuth, useNotifications, useBackClose, useModalLock, useActiveRefetch, useViewportRestore, useProductCatalog, …
  types/      database.ts (schema reference), qz-tray.d.ts
  components/ ui/ layout/ challan/ purchaseorders/ attendance/ listingai/ minis/ settings/
  pages/      Dashboard Inventory InventoryExtras BrandTags PackTime CashChallan CashBook PurchaseOrders
              ListingAIPage Attendance Minis PrintStation Settings Login PasswordReset
  modules/programs/   self-contained (hooks/ lib/ i18n/ components/)
supabase/functions/   admin-users client-finder listing-ai master-sync odette-export otp-inbox packtime pricing-ai short-track sign-qz
supabase/migrations/  46 timestamp-prefixed SQL files (2026-05-28 → 2026-09-12)
tools/boutique_leads.py   unrelated Google-Maps lead scraper (see §8)
```

---

## 2. Per-file index

Columns: path · lines · purpose · key exports · what it touches (tables with
operation, RPCs, edge functions, realtime channels, storage buckets,
localStorage keys, notable imports). Grandfathered-over-200-lines files are
marked (G).

### 2.1 Root, config, docs

| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `CLAUDE.md` | — | Project rules (auto-deploy flow, file layout, UI/UX tokens, patterns, DB sustainability) | — |
| `UNSORT-CLAUDE-CODE-CONTEXT.md` | 49 | Module map, roles, data notes, edge-function list, commands | Lists a realtime publication that is now partly wrong (see §7.5) |
| `package.json` | 36 | Scripts `dev/lint/build/preview`; deps above | — |
| `vite.config.ts` | 27 | React plugin, SW stamp plugin, `__APP_BUILD__` define | writes `dist/sw.js` |
| `tsconfig.json` / `tsconfig.node.json` | 22 | Strict TS, `bundler` resolution, `noEmit` | — |
| `eslint.config.js` | 19 | Flat config, TS + react-hooks | — |
| `index.html` | 41 | Shell, splash, fonts, PWA meta, CSP | — |
| `.github/workflows/deploy.yml` | 64 | Build + GitHub Pages deploy | — |
| `.claude/settings.json` | 16 | SessionStart health-check hook | — |
| `.claude/skills/supabase-migration/SKILL.md` | 77 | Migration workflow skill | — |

### 2.2 `src/lib/`

| Path | Lines | Purpose | Key exports | Touches |
|---|---|---|---|---|
| `lib/theme.tsx` | 409 | Design tokens `T` (OKLCH), style recipes `S`, `alpha()`, `oklchTint()`, `Pill`, `Icon` (22 stroke icons), `CHALLAN_STATUS_COLORS`, `PO_STATUS_COLORS` | `T, S, alpha, oklchTint, Pill, Icon, …` | none |
| `lib/supabase.ts` | 7 | Supabase client; the only place the anon key lives | `supabase, SUPABASE_ANON_KEY` | — |
| `lib/tabs.ts` | 50 | Tab ids, module labels, role/`module_access` gating. The Home tab (`dashboard`) is always reachable; the admin's "Dashboard data" toggle gates the numbers via `canSeeDashboardData` (App mounts `Dashboard` or `HomeLite`) | `TAB_IDS, MODULE_LABELS, ALL_MODULE_KEYS, canAccessTab, canAccessModule, canSeeDashboardData, getFirstAllowedTab` | reads `profiles.role` / `module_access` passed in |
| `lib/friendlyError.ts` | 64 | Maps Postgres/GoTrue/network errors to human copy; `console.error`s the raw message | `friendlyError` | — |
| `lib/printQueue.ts` | 202 | Global print mode (`app_settings.print_mode` ↔ `localStorage.print_mode`), `printOrQueue` (cloud → `print_queue` insert + per-job watcher; default → iframe print), `browserPrint` | `getPrintMode, setPrintMode, initGlobalPrintMode, submitPrintJob, printOrQueue` | `app_settings` select/upsert (`print_mode`, `print_station_heartbeat`); `print_queue` insert/select; channels `app-settings-print-mode` (filter `key=eq.print_mode`) and `print-job-<id>` (filter `id=eq.<id>`) |
| `lib/qzPrint.ts` | 153 | Lazy-loaded QZ Tray wrapper: pinned certificate, remote SHA-512 signing via `sign-qz`, slot→printer map, `printHtml` | `connect, disconnect, isConnected, listPrinters, getSlotPrinter, setSlotPrinter, printHtml, friendlyPrintError, SLOT_LABELS, PageSize` | edge `sign-qz` (raw fetch); localStorage `qz_printer_label_small/label_large/document` |
| `lib/attendance.ts` | 291 | Salary engine (`computeMonthlySalary`), time/date/Excel-cell parsers, attendance types | see file | none (pure) |
| `lib/faceId.ts` | 209 | Device-local WebAuthn lock (enrol/verify/lock flags) | `enrollFaceId, verifyFaceId, lockApp, unlockApp, isAppLocked, faceIdOffered, …` | localStorage `doFaceIdCred`, `doAppLocked`, `doFaceIdFails`; scans `sb-*-auth-token` |
| `lib/errorLogger.ts` | 100 | Unhandled-error capture → `error_logs`; `logSwallowed` for best-effort writes | `logError, logSwallowed, installGlobalErrorHandlers` | `error_logs` insert |
| `lib/escape.ts` | 15 | `escHtml` (print templates) and `csvCell` (CSV, formula-prefix guard) | `escHtml, csvCell` | — |
| `lib/exportName.ts` | 63 | `Arya-<Doc>-<what>-<date>.<ext>` naming, IST dates | `fileSafe, fileDate, fileRange, docTitle, exportName` | — |
| `lib/downloadFile.ts` | 32 | Share-sheet on touch devices, `<a download>` elsewhere | `downloadFile` | — |
| `lib/xlsxDownload.ts` | 20 | `XLSX.write` → `downloadFile` | `saveWorkbook` | — |
| `lib/fetchPaged.ts` | 18 | Page a PostgREST query in 1000s (server cap) | `fetchPaged` | — |
| `lib/customerOutstanding.ts` | 40 | Canonical "what this customer owes" (open sales − unsettled return credits) | `fetchCustomerOutstanding` | `cash_challans` select ×2 |
| `lib/beforeSignOut.ts` | 18 | Registry of async flushes awaited before sign-out (PackTime sheet queue) | `registerBeforeSignOut, runBeforeSignOut` | — |
| `lib/clipboard.ts` | 32 | `navigator.clipboard` with `execCommand` fallback | `copyToClipboard` | — |
| `lib/garmentHelpers.ts` | 15 | `isDupatta/isLehenga/isBottomType/isBlouse`, `mfrFromSku` (DRS→Dresstive, KB→Kashtbanjan) | — | — |
| `lib/numericInput.ts` | 17 | `numericKeyDown` for number inputs | — | — |
| `lib/qrUpload.ts` | 30 | Employee payment-QR upload (random UUID path) + best-effort delete | `uploadQrImage, deleteQrObject` | bucket `employee-qr` |
| `lib/safeHref.ts` | 17 | http/https-only href guard | `safeHref, HTTP_SCHEMES` | — |

### 2.3 `src/hooks/`

| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `hooks/useAuth.tsx` | 237 | `AuthProvider`/`useAuth`: session restore + refresh, profile load, deactivation enforcement, Face ID lock model (`locked`), 30-min inactivity lock/sign-out, `signIn/signUp/signOut/lockNow/unlockWithFaceId` | `profiles` select (`id, email, full_name, role, is_active, phone, created_at, updated_at, module_access`), `supabase.auth.*`; localStorage `signOutReason`; `console.error` on profile-load failure |
| `hooks/useNotifications.tsx` | 72 | `NotificationProvider`: toasts (dedup 200 ms, max 5, 5 s) + `notifications` table list + app badge | `notifications` select (limit 50) / update `is_read`; channel `notifications` (INSERT, filter `user_id=eq.<uid>`) |
| `hooks/useBackClose.ts` | 101 | One history entry per open layer; device Back closes one level; `closeAllLayers`, `closeTopLayer` | `window.history` |
| `hooks/useModalLock.ts` | 17 | `body.modal-open` toggle, released only when no `.modal-inner` remains | DOM |
| `hooks/useActiveRefetch.ts` | 60 | Throttled refetch only while the tab is active/visible; marks stale otherwise | DOM events |
| `hooks/useViewportRestore.ts` | 93 | iOS standalone keyboard-shrink fix (display:none round-trip on `#root`) | DOM |
| `hooks/useBreadcrumb.tsx` | 12 | Header breadcrumb context | — |
| `hooks/useDebouncedFetch.ts` | 29 | Debounced/flushable fetch wrapper | — |
| `hooks/useUndoDelete.ts` | 60 | 5-s undoable delete (table per call); failure only `console.error` | dynamic `supabase.from(table).delete()` |
| `hooks/useProductCatalog.ts` | 275 | Module-singleton SKU catalog (sorted index + Map), localStorage cache `unsort.product_catalog.v1` validated by fingerprint; `searchProducts/resolveSku/needsSize/variantSku` | `product_catalog` select (paged 1000, explicit cols; fingerprint `count:'exact'` + max `updated_at`) |

### 2.4 App shell, layout, shared UI

| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `App.tsx` | 339 | Error boundary (→ `logError`), chunk-reload guard, lazy pages via `retryImport`, hash routing (`#/<tab>`, public `#/s/<code>`, `#/share/program/<hex>`, `#/rc/<32hex>`, recovery hash), auth gate, keeps visited tabs mounted (`display:none`), mobile bottom nav (Home/Inventory/PackStation/Challan/More), per-tab scroll memory, global shortcuts (Esc, ⌘F, ⌘N), `InstallPrompt`, `initGlobalPrintMode` | localStorage `sidebarOpen`; sessionStorage `chunkReloadedAt`, `pwa-dismiss` |
| `main.tsx` | 71 | Mount, global error handlers, SW registration + update overlay, iOS `:active` enabler, haptics | `navigator.serviceWorker` |
| `index.css` | 578 | The only stylesheet: body/root frame (dvh + `translateZ(0)`), iOS input-zoom fix (16px), select chevron, date-input normalisation, animations, `--nav-h` bottom-nav geometry, `.page-pad`, `.modal-inner` bottom sheets, FAB, `.desktop-only/.mobile-only`, per-module mobile overrides (challan, attendance, inventory, minis, programs) | — |
| `components/layout/Sidebar.tsx` | 74 | Desktop sidebar / mobile drawer; tab list filtered by `canAccessTab`; sign-out (clears `ccDraft`, reloads) | localStorage `ccDraft` |
| `components/layout/Header.tsx` | 60 | Title + breadcrumb, sidebar toggle, notifications dropdown | — |
| `components/layout/ToastContainer.tsx` | 18 | Portalled toast strip (z 20000) | — |
| `components/ui/ActionSheet.tsx` | 68 | Mobile row-action bottom sheet | portal, `useBackClose`, `useModalLock` |
| `components/ui/AnchoredList.tsx` | 68 | Fixed-position portal dropdown under an input (flips above keyboard) | — |
| `components/ui/BrandTagModal.tsx` | 142 | Brand-tag add/edit modal with live JsBarcode preview | `SkuInput`, `SuggestInput` |
| `components/ui/ConfirmModal.tsx` | 108 | In-app confirm + `useConfirm()` async hook; Back = cancel; danger focuses Cancel | — |
| `components/ui/CountUp.tsx` | 26 | Eased number animation | — |
| `components/ui/DateInput.tsx` | 40 | `S.fDate` + `showPicker()` on tap | — |
| `components/ui/Empty.tsx` | 41 | Empty state with 8 inline illustrations + CTA | — |
| `components/ui/MasterFreshness.tsx` | 77 | "Master synced N min ago" strip; polls `master_sheet_sync` every 120 s while visible (45-min stale threshold) | `master_sheet_sync` select |
| `components/ui/OfflineBar.tsx` | 33 | Online/offline banner | — |
| `components/ui/Skeleton.tsx` | 35 | Shimmer placeholders | — |
| `components/ui/SkuInput.tsx` | 186 | SKU combobox: parent-design suggestions (≥3 chars) + size chips; free text always allowed | `useProductCatalog` |
| `components/ui/SuggestInput.tsx` | 62 | Plain combobox over a string list (iOS-safe replacement for `<datalist>`) | — |
| `components/ui/SwipeRow.tsx` | 230 | Touch swipe-to-reveal actions (mobile only), hint once per `hintKey` (sessionStorage `swipe-hint-<key>`) | — |
| `components/ui/Toggle.tsx` | 26 | 44-px-hit switch | — |
| `components/ui/UndoBar.tsx` | 16 | Fixed undo pill above `--nav-h` | — |
| `components/ui/ViewportDebug.tsx` | 57 | `?vpdebug` overlay of viewport numbers + build stamp | localStorage `vpdebug` |
| `types/database.ts` | 1085 (G) | One `Xxx` interface + `XxxInsert` per table for: profiles, products, components, inventory_items, item_components, activity_logs, notifications, damage_reports, inventory_extras(+history), cash_book_balances, cash_expenses, cash_handovers, cash_challans, cash_challan_items, cash_challan_customers, cash_challan_payments, brand_tags, audit_log, brands, packtime_cameras/couriers/scans/shortcuts, address_labels, virtual_stock, short_links, link_clicks, print_queue (`PrintSlot`), link_check_approvals, po_vendors, purchase_orders(+items, receipts, input payloads), listing_* types. **Not** covered: attendance_*, program_*, costing_products, pricing_ai_suggestions, client_finder_*, master_sheet_*, product_catalog, otp_inbox, return_labels, utsav_ignored_skus, indya_sku_map, error_logs, app_settings, app_secrets, tasks, ratecard_share, listing_folders, tags/item_tags/locations. | — |
| `types/qz-tray.d.ts` | 22 | Ambient typing for `qz-tray` | — |
| `vite-env.d.ts` | 8 | `*?raw` module typing (JsBarcode inlined into label HTML) | — |

### 2.5 Pages and module components

#### Dashboard
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `components/dashboard/HomeLite.tsx` | 22 | Home for a user without dashboard data: greeting + quick-access chips, nothing fetched | — |
| `components/dashboard/QuickChips.tsx`, `QuickChipsPicker.tsx`, `lib/shortcuts.ts` | 78, 76, 49 | Quick-access strip: the user's own pinned shortcuts to module tabs and Minis tools (catalogue from `TAB_IDS` + `MINI_TILES`, filtered by `canAccessTab` on every render, max 12, role defaults until customised; Edit = remove / reorder; picker with search). Minis tools open via sessionStorage `minis_open`, read once by the hub (`takePendingMini`) | `profiles.quick_chips` select/update (own row, column grant; migration `20260920100000`) |
| `pages/Dashboard.tsx` | 387 | Quick-access strip, KPI hero, alerts, 7-day scan / 30-day revenue bars, breakdown, top outstanding customers, Notes | RPC `dashboard_summary(p_month_start, p_today, p_week_ago)`; `tasks` select/insert/update/delete; channel `dash-sync` on `inventory_items`, `cash_challans`, `tasks` (no filter); sessionStorage `challan_search` (deep link into Cash Challan) |

#### Inventory (+ Spare Parts) and Brand Tags
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `pages/Inventory.tsx` | 1336 (G) | Active/Completed list, add/edit with component states, pair completion, Find Pairs, bulk dock, undo delete, PDF/CSV export, barcode print; hosts `InventoryExtras` | `inventory_items`, `products`, `locations`, `tags`, `item_tags`, `item_components`, `components`, `activity_logs`, `inventory_extras` (count), `inventory_extras_history` (count); RPCs `delete_inventory_item_cascade`, `complete_inventory_pair`, `revert_inventory_pair`, `revert_item_with_extra`; channel `inv-sync-<id>` on 6 tables; `printOrQueue('label_small', 1.97×2.97)` and `('document','A4')`; `canAccessModule(…,'extras')` |
| `pages/InventoryExtras.tsx` | 687 (G) | Spare Parts: list, add/edit/adjust with history, match unsorted items, complete-with-spare | `inventory_extras` (select/insert/update), `inventory_extras_history` insert, `inventory_items`, `item_components`, `products`, `locations`, `components`; RPC `complete_item_with_extra`; channel `extras-rt` on `inventory_extras`; `printOrQueue('document','A4')` |
| `pages/BrandTags.tsx` | 823 (G) | Server-paged `brand_tags` master, Excel import (batches of 500, `onConflict ean,sku,size`), export, order-sheet → label batch, label print preview | `brand_tags` select/upsert/insert/update/delete; `brands` select; channel `bt-smart` on `brand_tags`; `printOrQueue('label_small', 1.97×2.97)`; `saveWorkbook` ×3; JsBarcode inlined via `?raw` |

#### PackStation, Print Station, Settings, Auth
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `pages/PackTime.tsx` | 1383 (G) | AWB scanning (camera `BarcodeDetector` or keyboard), optimistic `packtime_scans` insert, module-level Google-Sheet write queue via edge `packtime`, undo, today summary, history + CSV | `packtime_couriers/cameras/shortcuts/scans`, `brands`; edge `packtime` (`init`/`batch`/`delete`, raw fetch, `keepalive` on unload); localStorage `packtime_failed_db_scans`; `registerBeforeSignOut` |
| `pages/PrintStation.tsx` | 311 | Cloud-print worker: QZ connect, claim `print_queue` jobs by slot, print, mark done/failed, heartbeat, housekeeping | `print_queue` full lifecycle; `app_settings.print_station_heartbeat` upsert; channel `print-queue-realtime` on `print_queue` (no filter) + 5 s poll; localStorage `print_station_name` |
| `pages/Settings.tsx` | 59 | Role-gated tab router over the settings sub-pages | — |
| `components/settings/MyProfile.tsx` | 259 | Phone, cash PIN (RPC), Face ID enrol/disable, change password | RPCs `check_pin_exists`, `set_own_pin`; `profiles` select `phone`, update `phone`, update `cash_pin: null` (see §7.9); `auth.updateUser` |
| `components/settings/Users.tsx` | 280 | User directory: role, active toggle + auth ban, module-access chips, invite, password reset | `profiles` select/update (`role`, `is_active`, `module_access`); RPC `confirm_user_email`; edge `admin-users` (`functions.invoke`); `auth.signUp`; channel `usr-sync` on `profiles` |
| `components/settings/Categories.tsx` | 181 | Products + components CRUD | `products`, `components`, counts on `inventory_items`/`item_components`/`inventory_extras`; channel `cat-sync` on `products` + `components` |
| `components/settings/Locations.tsx` | 87 | Locations CRUD with undo | `locations`; `inventory_items` count; channel `loc-sync`; `useUndoDelete('locations')` |
| `components/settings/Brands.tsx` | 64 | Brands CRUD with undo | `brands`; `packtime_couriers` count; `useUndoDelete('brands')` |
| `components/settings/PackStation.tsx` | 141 | Couriers (name + sheet tab) and cameras | `packtime_couriers`, `packtime_cameras`, `packtime_scans` counts; `useUndoDelete` per table |
| `components/settings/PrinterSettings.tsx` | 187 | Global print mode, per-PC slot→printer, test print, recent jobs | `setPrintMode`; `listPrinters`/`printHtml`; `print_queue` select/delete/update |
| `components/settings/PaymentQR.tsx` | 79 | Business UPI QR + UPI id | bucket `payment-qr` (upsert); `app_settings` `payment_qr_url`, `payment_upi_id` |
| `components/settings/ErrorLogs.tsx` | 105 | `error_logs` viewer + clear | `error_logs` select (`count:'exact'`)/delete |
| `components/settings/ListingAISettings.tsx` | 44 | Anthropic key + model cards | edge `listing-ai` `status` via `listingai/api` |
| `components/settings/PricingSettings.tsx` + `pricing/*` (3) | 36+185 | Price Projector config cards | `app_settings` keys `pricing_stitching`, `pricing_thresholds`, `pricing_defaults` via `minis/pricing/pricingConfig` |
| `pages/Login.tsx` | 186 | Face-ID-or-email login, forgot password | `auth.resetPasswordForEmail`; localStorage `signOutReason` |
| `pages/PasswordReset.tsx` | 68 | Recovery-link password form | `auth.updateUser`, `auth.signOut` |

#### Cash Challan and Cash Book
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `pages/CashChallan.tsx` | 1658 (G) | Owns all challan data + list; hosts form/detail/ledger/analytics/bulk and embeds `CashBook` | `cash_challans` (many), `cash_challan_items`, `cash_challan_customers`, `cash_challan_payments`, `audit_log`, `profiles`, `app_settings` (`payment_qr_url`, `payment_upi_id`); RPCs `search_challan_ids`, `create_challan_with_items`, `update_challan_with_items`, `settle_return_refund`, `undo_challan_batch`, `unpay_challan_batch`; channel `cash_challans_realtime` on `cash_challans` + `cash_challan_items`; `printOrQueue('document','A4')` ×2; localStorage `ccDraft`, `ccErpReminderHidden`; sessionStorage `challan_search` |
| `pages/CashBook.tsx` | 1171 (G) | Opening balance, expenses (locked-period corrections), cash sales, handovers (initiate / sign with PIN / reject / cancel / print), CSV | `cash_book_balances`, `cash_expenses`, `cash_challans`, `cash_handovers`, `profiles`, `audit_log`; RPCs `get_profiles_pin_status`, `confirm_handover(p_id, p_pin)`, `reject_handover`, `cancel_handover`; channel `cash_book_realtime` on 4 tables; sessionStorage `pinLockUntil` |
| `components/challan/ChallanForm.tsx` | 476 | Create/edit/return form (parent owns save) | RPC `get_next_challan_number`; `cash_challans` recent, `cash_challan_customers` phone |
| `components/challan/ReturnSourcePicker.tsx` | 55 | "Select original invoice" on a Return: matches challan #, customer or a sold SKU, scoped to the customer already typed; result rows show the invoice's SKUs | pure (parent runs RPC `search_return_source_ids` then fetches the rows) |
| `components/challan/ChallanDetail.tsx` | 457 | Detail sheet: items, payments, credit settle/apply, timeline, notes/SKU edit, QR share | `cash_challans` update notes; `cash_challan_items` update sku; `audit_log`; `cash_challan_payments`; `profiles`; RPC `settle_return_refund` |
| `components/challan/ChallanList.tsx` | 318 | Filters, table, mobile cards, pager | pure |
| `components/challan/ChallanLedger.tsx` | 204 | Customer ledger + detail + outstanding CSV | pure (CSV via `csvCell`) |
| `components/challan/ChallanAnalytics.tsx` | 170 | Stat tiles, payment-mode breakup, donut | pure |
| `components/challan/ApplyCreditModal.tsx` | 150 | Apply return credit to a same-customer sale | `cash_challans` select; RPC `apply_return_credit`; `audit_log` |
| `components/challan/ChallanBulkActions.tsx` | 148 | Bulk toolbar, Bulk Pay / Unpay modals | pure |
| `components/challan/challanTotals.ts` | 41 | Money math | pure |
| `components/challan/ChallanKPIs.tsx`, `AuditTrailModal.tsx` | 35, 33 | Small display pieces | pure |

#### Purchase Orders
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `pages/PurchaseOrders.tsx` | 260 | Paginated list w/ items join, search (vendor / number / SKU / fabric code / item name via RPC), filters, realtime, print overlay, pendency report | `purchase_orders` (+embedded items), `purchase_order_items`, `purchase_order_receipts`, `audit_log`, `profiles`; RPC `search_po_ids`; channel `purchase_orders_rt` on `purchase_orders` only (every RPC stamps the header); `printOrQueue('document','A4')` |
| `components/purchaseorders/POForm.tsx` | 252 | Create/edit/duplicate/prefill (`POPrefill` from a costing sheet); vendor smart defaults; fabric code compulsory on fabric POs (the RPCs refuse it too); carries `costing_product_id` | RPCs `create_po_with_items`, `update_po_with_items`; `purchase_orders` last-PO lookup |
| `components/purchaseorders/POItemRows.tsx` | 86 | The form's item cards; fabric POs get a "Fabric code" `SuggestInput` fed by earlier codes | RPC `po_fabric_codes` |
| `components/purchaseorders/ItemNameChips.tsx` | 38 | Last-5 item-name chips under an empty item-name box, scoped to the PO type, deduped case-insensitively | RPC `po_recent_item_names` |
| `components/purchaseorders/poItemLabel.ts` | 9 | `itemLabel(it)` = `name · fabric_code` — the one way a PO line is printed (detail, receive, close, receipts, list, PDF, image, pendency, pricing evidence) | pure |
| `components/purchaseorders/PODetail.tsx` | 196 | Detail + status actions | RPCs `set_po_status` (`approved/sent/cancelled/reopen`), `delete_po_receipt` |
| `components/purchaseorders/POReceive.tsx` | 134 | Receive goods (stale-tally guard) | RPC `receive_po_items` |
| `components/purchaseorders/POCloseModal.tsx` | 114 | Short-close with reason | RPC `close_po_short` |
| `components/purchaseorders/VendorPicker.tsx` | 117 | Vendor autosuggest + quick add | `po_vendors` select/insert |
| `components/purchaseorders/TopVendorChips.tsx` | 33 | Top-5 vendor chips | `app_settings.po_top_vendors` |
| `components/purchaseorders/POList.tsx`, `POReceipts.tsx`, `POActivity.tsx` | 240, 33, 19 | Presentational | pure |
| `components/purchaseorders/PendencyReport.tsx` + `pendencyData/Doc/Image` | 98+95+80+153 | Vendor pendency report (A4 print + PNG share) | `purchase_orders` selects; `printOrQueue` |
| `components/purchaseorders/poPdf.ts`, `poImage.ts` | 99, 175 | PO A4 HTML, canvas PNG share. Audit rows are written by the PO RPCs themselves (`audit_write`, migration `20260916143000`); `poAudit.ts` is gone | — |

#### Attendance
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `pages/Attendance.tsx` | 127 | Shell: employees + month data (entries with 6-day tail, penalties, advances, saved salaries, payments) | `attendance_employees`, `attendance_entries`, `attendance_penalties`, `attendance_advances`, `attendance_salaries`, `attendance_salary_payments` (all select) |
| `components/attendance/Employees.tsx` | 184 | Employee master, deactivate with leave date | `attendance_employees` insert/update; bucket `employee-qr` |
| `components/attendance/EntryModal.tsx` | 185 | Add/edit one day; clear times | `attendance_entries` upsert (`employee_id,date`) / update |
| `components/attendance/ImportExcel.tsx` | 271 | Excel/CSV timesheet import (batches of 500) | `attendance_employees` select/insert; `attendance_entries` upsert |
| `components/attendance/Salary.tsx` | 301 | Salary cards, penalties/advances, Mark Paid, Save Month, payslip PDF, kiosk | `attendance_penalties`/`advances` delete; `attendance_salary_payments` upsert/delete; `attendance_salaries` upsert; `printOrQueue('document','A4')` |
| `components/attendance/SalaryPaymentFlow.tsx` | 180 | Full-screen pay kiosk | `attendance_salary_payments` upsert/delete |
| `components/attendance/AdjustModal.tsx`, `LeaveDateModal.tsx`, `QrField.tsx`, `Timesheet.tsx`, `payslip.ts` | 84, 66, 52, 147, 83 | Penalty/advance insert; leave date; QR upload; month table; payslip HTML | `attendance_penalties`/`advances` insert; bucket `employee-qr` |

#### Listing AI
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `pages/ListingAIPage.tsx` | 13 | Page wrapper | — |
| `components/listingai/ListingAI.tsx` | 210 | Main screen: status, template select, SKU box, Generate, sub-views | edge `status`; `listing_templates` select; handoff event |
| `components/listingai/api.ts` | 37 | Raw fetch to edge `listing-ai` with session token | — |
| `components/listingai/useGenerateRun.ts` | 210 | Preflight → chunked (3 SKU × 3 workers) `generate` → save run | edge `validate`, `generate`; `listing_runs` insert |
| `components/listingai/useAutoBatch.ts` | 87 | >200-SKU batching | — |
| `components/listingai/TemplateManager.tsx` + `persistTemplate.ts`, `templateParse.ts`, `validationParse.ts`, `xlsxZip.ts`, `mergeFields.ts` | 207+55+86+124+43+105 | Upload/parse marketplace sheet (dropdowns from raw XML), merge, edit, save row + workbook | `listing_templates` insert/update/delete; bucket `listing-templates` (`<id>.xlsx`); edge `master_columns` |
| `components/listingai/exportFilled.ts` + `xlsxInject.ts` | 106+110 | Inject generated rows into the stored workbook XML (fflate) or plain sheet | bucket `listing-templates` download |
| `components/listingai/RunHistory.tsx` | 104 | Saved runs (5-day window) | `listing_runs` select/delete |
| `components/listingai/TaughtMappingsPage.tsx` + `MappingRow.tsx` | 170+48 | Taught mappings editor | `listing_mappings` select/delete; RPC `teach_bulk` |
| `components/listingai/bulk/*` (4) | 387 | Bulk Teach board | edge `scan_mappings`, `suggest_mappings`; RPC `teach_bulk` (slices of 500) |
| `components/listingai/assistant/*` (6) | 695 | Master Assistant chat (mounted from **Minis**, not Listing AI), seller-sheet compare, Excel report, handoff | edge `assistant`, `spellcheck`; sessionStorage `listingai_prefill` |
| `components/listingai/MasterFetch.tsx`, `ImageFolders.tsx`, `KeyCard.tsx`, `ModelCard.tsx`, `ResultsTable.tsx`, `PreflightPanel.tsx`, `RunEta.tsx`, `HandoffBanner.tsx`, `FieldRow.tsx`, `RulesEditor.tsx`, `RuleSetRow.tsx`, `EditorMeta.tsx`, `EditorToolbar.tsx`, `TemplateListRow.tsx`, `categories.ts`, `skuInput.ts`, `preflight.ts`, `listingHandoff.ts` | — | Supporting UI/helpers | edge `master_picker`, `set_key`, `set_model`; `listing_folders` select/insert/delete |

#### Programs (self-contained module)
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `modules/programs/index.tsx` | 112 | Root: list/detail switch, form, PDF | — |
| `modules/programs/lib/supabase-rpc.ts` | 168 | ALL module data access | tables `programs`, `program_matchings`, `program_prices`, `program_price_parts`, `program_history`, `program_user_preferences`, `program_lookup_part_names/fabric_names/brands`; RPCs `upsert_program`, `upsert_program_price`, `generate_share_token`; bucket `program-voice-notes` |
| `modules/programs/hooks/usePrograms.ts` | 58 | List state + realtime | channel `programs-rt` on `programs` (**not in publication**, §7.5) |
| `modules/programs/ProgramsList.tsx`, `ProgramDetail.tsx`, `ProgramForm.tsx`, `ProgramHistory.tsx`, `PDFExport.tsx`, `VoiceRecorder.tsx`, `PublicShareView.tsx` | 207, 207, 203, 65, 135, 139, 165 | UI | `PublicShareView` → RPC `get_shared_program`; `PDFExport` → `printOrQueue('document','A4')` + QR of share URL |
| `modules/programs/hooks/useT.ts`, `useProgramForm.ts`, `useTableNav.ts`, `useVoiceRecorder.ts`; `i18n/en.ts`, `gu.ts`; `lib/share-token.ts`, `image-url-converters.ts`; `components/*` (4); `types.ts` | — | i18n (English + Gujarati), form state, keyboard nav, MediaRecorder, helpers, local row types (not in `types/database.ts`) | — |

#### Minis
*(Hub and the standalone minis first; the sub-folders follow in the "Minis A" and
"Minis B" tables below.)*

| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `pages/Minis.tsx` | 513 (G) | Tool hub (tile grid from `miniRegistry`), routes each `MiniView`, hosts the Utsav import + compare inline | `utsav_ignored_skus` select/insert/delete; edge `short-track` action `compare` (anon key); `saveWorkbook` |
| `components/minis/miniRegistry.ts` | 32 | `MiniView` union, breadcrumb labels, tile list (17 tools) | — |
| `components/minis/VirtualStock.tsx` | 170 | Manual stock overrides shared by Utsav/Cbazaar/Odette/Indya | `virtual_stock` select/insert/update/delete; CSV via hand-built string (no `csvCell`) |
| `components/minis/AddressPrinter.tsx` | 221 | LabelMaker: saved addresses, copies, 4×6 in courier labels | `address_labels` CRUD; `printOrQueue('label_large', {4,6})`; SwipeRow `label-maker` |
| `components/minis/CbazaarImport.tsx` | 121 | Cbazaar vendor Excel → ARYA SKU → CSV | pure (CSV via `csvCell`) |
| `components/minis/OdetteImport.tsx` | 271 | Master SKUs + vendor files + blocked sheet → quantities → XLS or push | edge `odette-export` action `push` (`sheetName: 'ARYA STOCK'`, session token) |
| `components/minis/OdetteCoverageCheck.tsx` | 124 | Active size variants missing from the Odette sheet | edge `odette-export` action `reconcile` |
| `components/minis/LinkCheck.tsx` | 202 | Master-sheet image-link scan → dry-run fix → replace; approvals | edge `odette-export` actions `dropbox_status`, `linkcheck`, `linkfix` (+`dryRun`); `link_check_approvals` select/insert/delete |
| `components/minis/ConnectDropboxCard.tsx` | 53 | One-time admin OAuth code paste | edge `odette-export` action `dropbox_exchange` |
| `components/minis/OtpInbox.tsx` | 165 | Live OTP list (paged, `count:'exact'`), tap to copy | `otp_inbox` select; channel `otp-inbox` on `otp_inbox` INSERT/UPDATE (no filter); refetch on `SUBSCRIBED`/visibility/focus |
| `components/minis/OtpSetupGuide.tsx` | 49 | iPhone Shortcut guide; fetches the shared secret | edge `otp-inbox` action `setup` |
| `components/minis/OtpFolderSetting.tsx` | 49 | Dropbox folder for delivery-sheet PDFs | `app_settings.otp_delivery_sheet_folder` |

### 2.6 Edge functions (`supabase/functions/`)

| Function | Lines | Called from | Env / secrets | Reads / writes |
|---|---|---|---|---|
| `packtime` | 249 | `pages/PackTime.tsx` (raw fetch; gateway `verify_jwt` **off**, does its own caller check) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`, optional `ALLOWED_SHEETS` | `profiles.is_active` (caller), `packtime_couriers.sheet_name` (allow-list); Google Sheets `init` read `A1:E5000`, `batch` append, `delete` clear row |
| `sign-qz` | 73 | `lib/qzPrint.ts` (`verify_jwt` on) | `QZ_PRIVATE_KEY` | signs QZ challenge (RSASSA-PKCS1-v1_5/SHA-512) |
| `admin-users` | 74 | `settings/Users.tsx` via `functions.invoke` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | caller `profiles.role/is_active` (RLS); `auth.admin.updateUserById` ban/unban/password |
| `listing-ai` | 2583 | `listingai/api.ts` (Listing AI, Bulk Teach, Master Assistant, Settings cards), RateCard Studio | `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `MASTER_SHEET_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; DB `app_secrets`: `anthropic_api_key`, `listing_ai_model`, `dropbox_refresh_token`, `dropbox_app_key`, `dropbox_app_secret`, `dropbox_linkgen_roots` | 13 actions (§3.7); reads `listing_templates`, `listing_mappings`, `listing_folders`, `master_sheet_*`, `ratecard_share`, `profiles`; RPC `bump_ratecard_share_use`; Anthropic `/v1/messages`, Dropbox, Google Sheets fallback |
| `master-sync` | 580 | pg_cron only (`trigger_master_sync` → `net.http_post` with `x-sync-secret` from Vault) | `GOOGLE_*`, `MASTER_SHEET_ID`, service role; DB `app_secrets.master_sync_secret` | modes `auto/full/verify/spellfix/spellfix_dry`; writes `master_sheet_rows/columns/sync`, `master_spellfix_log`, `notifications`; the one sanctioned **write-back** to the sheet (spellfix, weekly) |
| `pricing-ai` | 163 | `minis/pricing/aiSuggestions.ts` | see §3.10 | writes `pricing_ai_suggestions` |
| `odette-export` | 1261 + `catalog.ts` 317 | OdetteImport, OdetteCoverageCheck, LinkCheck, Dropbox Link Generator, Dropbox Uploader, Forward→Dropbox, Catalog Downloads | `GOOGLE_*`, `ODETTE_SHEET_ID`/`GOOGLE_SHEET_ID`, `MASTER_SHEET_ID`, service role | see §3.10 |
| `short-track` | 534 | `TracklyRedirect`, `Trackly*`, `Minis.tsx` (`compare`) | service role, `GOOGLE_*` | RPC `record_link_click`; see §3.9 |
| `client-finder` | 673 | `minis/clientfinder/api.ts` | service role, `GOOGLE_*` (Vision) | `client_finder_searches/hits`; see §3.9 |
| `otp-inbox` | 112 + `delivery.ts` 131 + `sheetPdf.ts` 104 | iOS Shortcut (POST with shared secret); `OtpSetupGuide` (`setup`) | service role | `otp_inbox` insert/update; `app_secrets.otp_push_secret`; delivery-sheet PDF → Dropbox; see §3.9 |

### 2.7 Migrations (`supabase/migrations/`, replay in filename order)

| File | What it does |
|---|---|
| `20260528165741_short_links_and_clicks` | `short_links`, `link_clicks`, RLS (own rows), trigger `increment_link_clicks`, RPC `record_link_click` (DEFINER) |
| `20260528175345_short_links_immutable` | drop UPDATE policy; trigger `block_short_links_mutate` (code/url/title immutable) |
| `20260528181127_short_links_hardening` | FK `ON DELETE SET NULL`, length CHECKs, `clicks` bigint, composite index |
| `20260528190922_link_clicks_retention` | `cleanup_old_link_clicks()` (365 d) — **not scheduled** (no cron job exists) |
| `20260528222346_trackly_security_and_unique_visitors` | `visitor_hash`; service-role gate on `record_link_click` (reverted next) |
| `20260529112744_fix_record_link_click_auth_check` | removes the broken role gate |
| `20260718002511_listing_runs_hygiene` | `listing_runs` FKs, `listing_mappings_updated_idx`, RLS (`lr read` admin/manager active; insert/delete without `is_active`), cron `purge_listing_runs` 03:17 daily (5 days) |
| `20260723221338_listing_templates_category` | `listing_templates.category` |
| `20260725061021_ratecard_share_link` | `ratecard_share` (token, one active), RPC `bump_ratecard_share_use` (service role only), `short_code` |
| `20260727004059_master_sheet_mirror` | `master_sheet_rows` (positional `cells` jsonb, `content_hash`), `master_sheet_columns`, `master_sheet_sync`; read RLS admin/manager (sync table: any authenticated) |
| `20260727004059_master_sheet_sync_schedule` | `trigger_master_sync(p_mode)` (Vault secret → `net.http_post`); cron `master-sync-probe` `*/2`, `master-sync-full` `23 * * * *` |
| `20260728233835_client_finder` | `client_finder_searches`, `client_finder_hits`, own-row read RLS, no write policies (edge writes) |
| `20260729010808_product_catalog` | `product_catalog` (7 suggestion fields, `is_active`), `refresh_product_catalog()` (DEFINER, header-name column resolution, change-gated upsert), cron `product-catalog-refresh` `*/2`, `sizes text[]` |
| `20260730114644_client_finder_image_dimensions` | `image_url/width/height/bytes` + sanity CHECK |
| `20260731224158_client_finder_similar_match_kind` | `match_kind` adds `similar` |
| `20260731224158_product_catalog_sizes` | `refresh_product_catalog()` v2: parses sizes, **skips duplicate SKUs**, no-ops while a sync tab is `running` |
| `20260803010144_security_pin_profile_selfupdate_and_drop_bucket_listing` | profile self-update policy pins `role/is_active/module_access`; drops listing policies on `employee-qr` and voice buckets |
| `20260803115413_security_pin_search_path_on_flagged_functions` | `set search_path` on 6 INVOKER functions (incl. `set_own_pin`, `teach_bulk`) |
| `20260815123603_drop_duplicate_inventory_indexes` | drops 3 duplicate `inventory_items` indexes |
| `20260815123603_product_catalog_refresh_change_gated` | **bookmark only**: `product_catalog_refresh_state` table; the change-gated function body lives only in the applied migration history |
| `20260815123603_rls_initplan_wrap_auth_calls` | wraps bare `auth.uid()` in `(select …)` across all public policies |
| `20260815154943_dashboard_summary_rpc` | **comment only**: `dashboard_summary()` body is not in the repo |
| `20260815154943_index_hygiene_hot_tables` | drops unused `brand_tags`/`packtime_scans` indexes; adds 2 FK indexes |
| `20260815211403_master_spellfix_log_and_weekly_cron` | `master_spellfix_log` (admin read); cron `master-spellfix-weekly` `30 2 * * 0` |
| `20260820131636_product_costing_module` | `costing_products` (jsonb `components`), unique on `upper(btrim(sku))`, RLS (read any auth, write operator+), bucket `costing-images` (public) |
| `20260820145553_costing_images_select_policy_and_notes` | bucket SELECT policy (upsert needs it); `notes` column |
| `20260826011048_cron_history_retention` | cron `purge-cron-history` 03:40 daily (7 days) |
| `20260826011653_drop_po_dummy_backups` | drops 3 backup tables |
| `20260826012628_otp_inbox` | `otp_inbox`, read/delete RLS, **added to `supabase_realtime`**, `app_secrets.otp_push_secret`, cron `purge-otp-inbox` |
| `20260826015525_otp_inbox_retention_30_days` | purge → 30 days |
| `20260826020729_otp_inbox_delivery_sheet_columns` | `sheet_status`, `sheet_file` |
| `20260826020729_otp_inbox_drop_manual_delete` | drops the delete policy |
| `20260827013948_costing_top_subs_cron` | cron `costing-top-subs` `10 3 */4 * *` → `app_settings.costing_top_subs` |
| `20260920120000_costing_common_subs_cron` | cron `costing-common-subs` `20 3 */4 * *` → `app_settings.costing_common_subs`: per main component, the sub-components present in ≥ half its sheets (newest sheet's unit/qty/suppliers, most-shared first) — the editor's "+ Add the N lines common to …" template |
| `20260827021648_costing_selling_price` | `costing_products.selling_price` |
| `20260831124809_purchase_orders_realtime_publication` | adds `purchase_orders`, `purchase_order_items`, `purchase_order_receipts` to `supabase_realtime` |
| `20260901220432_po_top_vendors_cron` / `20260901220759_po_top_vendors_daily` | cron `po-top-vendors` → `app_settings.po_top_vendors`, rescheduled daily 03:20 |
| `20260901234219_realtime_publication_trim` | **removes** `activity_logs`, `damage_reports`, `inventory_extras_history` from the publication |
| `20260903101500_price_projector_costing_columns` | `costing_products.category`, `pricing jsonb` |
| `20260903195900_pricing_ai_suggestions` (+`_cost`, `_evidence`) | `pricing_ai_suggestions` (one batch per product, `input_hash`, `usage`, `est_usd`, `evidence`, `note`) |
| `20260910093000_purchase_orders_for_pieces` | `purchase_orders.for_pieces`; recreates `create_po_with_items`, `update_po_with_items` (both `set_config('app.po_rpc','on')`) |
| `20260911091500_po_short_close` | status `closed` + `closed_at/by/close_reason`; RPC `close_po_short`; `set_po_status` gains `reopen`; `delete_po_receipt` keeps `closed` |
| `20260912093000_indya_sku_map` | `indya_sku_map` (`wrong_norm` generated, unique), RLS any authenticated |

**Schema that exists only in the live database** (no CREATE in the repo; the
only in-repo record is `src/types/database.ts` or a module-local types file):
the 8 core inventory tables, all `cash_*` tables and their triggers/RPCs,
`brand_tags`, `audit_log`, `activity_logs`, `notifications`, `tasks`,
`app_settings`, `app_secrets`, `error_logs`, `packtime_*`, `address_labels`,
`virtual_stock`, `return_labels`, `utsav_ignored_skus`, `link_check_approvals`,
`print_queue`, `po_vendors`, `purchase_orders/items/receipts` (+ `receive_po_items`,
`search_po_ids`, `get_next_po_number`, the `app.po_rpc` trigger),
all `attendance_*`, all `program_*` (+ 4 RPCs, `search_vector`),
`listing_templates/mappings/folders/runs` (+ `teach_bulk`),
`dashboard_summary`, `refresh_product_catalog` (final body), and every
`prevent_*`/`protect_*`/`check_*`/`log_*` trigger function listed in §6.

---

## 3. Data flow per module

### 3.1 App shell, auth, navigation
- `main.tsx` installs global error handlers (→ `error_logs`) and the service worker, then renders `App`.
- `App` short-circuits `#/s/<code>` (Trackly redirect, no auth provider mounted at all). Otherwise `AuthProvider` → `AppContent` routes: recovery hash → `PasswordReset`; `#/share/program/<hex>` → `PublicShareView`; `#/rc/<32hex>` → `PublicRateCard`; else loading → `Login` (if no user or `locked`) → `NotificationProvider` + `BreadcrumbProvider` + `MainApp`.
- `useAuth`: `getSession` → `refreshSession` (transient failures keep the stored session) → `profiles` select → `is_active=false` signs out (`signOutReason=deactivated`). `onAuthStateChange` dedupes the INITIAL_SESSION profile fetch. Sign-out **locks** instead when Face ID is enrolled for this user; 30-min inactivity does the same. `unlockWithFaceId` = WebAuthn assertion → `refreshSession` → `profiles.is_active` re-check (fails closed).
- `MainApp`: tab from hash, `canAccessTab(role, tab, module_access)` gate with fallback, pages lazy-mounted on first visit and kept mounted (`display:none`) — every page therefore keeps its realtime channels open; pages receive `active` and use `useActiveRefetch` to avoid hidden refetches. `closeAllLayers()` on tab change. `initGlobalPrintMode()` once a profile exists.
- Roles: `admin` sees everything; `manager` everything not switched off in `module_access`; `operator` excluded by default from brandtag, challan, attendance, programs, minis, purchaseorders, listingai; `viewer` dashboard + inventory + settings. Non-tab keys `extras` (Spare Parts) and `cashbook` go through `canAccessModule`.

### 3.2 Dashboard
Mount / refresh / realtime wake → RPC `dashboard_summary` (one JSON with scans, month revenue, unsorted, cash-book figures, breakdown, overdue/dry-clean lists, pending handovers, top customers, trends) → cards; cash-in-hand computed client-side. Notes = `tasks` CRUD with refetch after write. Channel `dash-sync` on `inventory_items`/`cash_challans`/`tasks` → `useActiveRefetch`. Top-customer row → `sessionStorage.challan_search` + navigate to Cash Challan.

### 3.3 Inventory, Spare Parts, Brand Tags
- **Inventory** load = 6 parallel reads (items paged via `fetchPaged` up to 5000 with `products(...)` join, products, locations, tags, item_tags, item_components) → maps of missing/damaged/present components → completable pairs computed in `requestIdleCallback` (off above 300 unsorted). Add item = `inventory_items.insert` → **sleep 500 ms** → read the trigger-created `item_components` and update statuses → tags delete/insert → refetch → 1 s later `checkForPairMatch`. Delete = optimistic + 5 s undo → RPC `delete_inventory_item_cascade`. Complete pair → RPC `complete_inventory_pair`; revert → RPC `revert_item_with_extra` if the item consumed a spare, else `revert_inventory_pair`. Bulk status/location = direct updates; bulk delete loops the cascade RPC. Barcode = JsBarcode canvas → `printOrQueue('label_small')` (no preview frame → hidden-iframe print in default mode). PDF export = A4 landscape iframe preview → `printOrQueue('document')`.
- **Spare Parts** (`InventoryExtras`, gated by `module_access.extras`): list ≤1000 extras + all unsorted items + all missing/damaged components → per-extra match counts; add (restocks a hidden qty-0 row on `23505`), edit, adjust with optimistic-concurrency `.eq('quantity', old)`, history rows; "Use" → RPC `complete_item_with_extra`. Channel only on `inventory_extras`, so match counts go stale when items change.
- **Brand Tags**: server-paged `brand_tags` (`ilike search_text`, brand, size; `count:'estimated'`), realtime patches rows in place (`bt-smart`), add/edit through `BrandTagModal` (SKU via `SkuInput`), copies stepper = one update per click, Excel import → `validateRow` all-or-nothing → upsert batches of 500 with `beforeunload` guard, order-sheet import → per-SKU copies → `buildLabelsHtml` (JsBarcode inlined, CODE128 of `jioCode`, SKU as text) → iframe preview → `printOrQueue('label_small', 1.97×2.97)` as ONE job.

### 3.4 PackStation and Print Station
- **PackStation**: config (`packtime_couriers`, `packtime_cameras`, `brands`, last-5 `packtime_shortcuts`) → Start = edge `packtime` `init` (reads sheet `A1:E5000`, verifies headers) ∪ DB AWBs last 30 days for that `sheet_name` → local duplicate set. Each scan = optimistic UI → `packtime_scans.insert` (`23505` = duplicate rollback; other errors retry once then park in `localStorage.packtime_failed_db_scans`) → on success `enqueueWrite` → module-level queue flushes ≤20 rows per sheet via `batch` with 2/8/20 s retries, dropped after 3 → red banner. `beforeunload` drains with `keepalive`; `registerBeforeSignOut` drains before sign-out. Undo = `delete` (sheet by AWB match) + DB delete by `(awb, session_id)`. History view = paged `packtime_scans` with filters, CSV via `downloadFile`.
- **Cloud print**: any device → `printOrQueue(slot, html, size, title, copies, addToast, previewFrame)`. `print_mode` (global, `app_settings`, cached in localStorage, live via filtered channel) = `cloud` → `print_queue.insert` + per-job filtered channel + 25 s "nobody picked it up" check + heartbeat staleness warning (3 min); `default` → print the visible preview iframe or a hidden `srcdoc` iframe. **Print Station** page (PC with QZ Tray): `connect()` (pinned cert, signatures from edge `sign-qz`), slots with a printer assigned in localStorage, claims the first `pending` job for its slots with `update … .eq('status','pending')` (optimistic lock), `qz.print` with inch sizes and zero margins raced against 60 s, marks `done`/`failed`, expires >30 min, sweeps stale `printing` >120 s, heartbeats every 45 s, purges done/failed >7 days. Realtime on `print_queue` (table-wide) + 5 s poll + visibility refetch.

### 3.5 Cash Challan and Cash Book
- **List**: `cash_challans` with embedded items and `handover:cash_handovers!handover_id`, `count:'estimated'`; text search → RPC `search_challan_ids` (SKU match) then `.or(name ilike, id.in)`; tags `.contains`; IST day range. Channel `cash_challans_realtime` → `useActiveRefetch`. Deep link consumes `sessionStorage.challan_search`.
- **Form**: `get_next_challan_number` badge, recent customers, `cash_challan_customers` autosuggest, `SkuInput.onPick` fills `price_exc_gst`, outstanding badge via `fetchCustomerOutstanding`, draft autosave to `localStorage.ccDraft` (new challans only). Save = customer upsert → edit: `updated_at` concurrency check → RPC `update_challan_with_items`; create: RPC `create_challan_with_items` → audit → WhatsApp share bar → ERP reminder (7-day snooze `ccErpReminderHidden`). **Returns** are saved as `status='paid'`, `amount_paid=0`, `source_challan_id`, items copied and locked, per-SKU remaining qty enforced against prior returns; `payment_mode='Return Credit'` is reserved.
- **Detail**: `audit_log` + `cash_challan_payments` timeline, admin SKU edit, notes edit (both mutate the prop object in place), return credit → RPC `settle_return_refund` (cash refund) or `ApplyCreditModal` → RPC `apply_return_credit` (two legs, same day, nets to zero in handovers; see the migration header for the guards), QR share via `window.location.href = wa.me`.
- **Ledger**: last 100 challans aggregated client-side per customer (Load More +500), detail capped 500, PDF via iframe preview → `printOrQueue('document')`, outstanding CSV. **Analytics**: 4 parallel queries capped at 10,000. **Bulk**: Bulk Pay = **client loop** (update challan, insert payment, manual revert on failure) + `settle_return_refund` per return; Undo → RPC `undo_challan_batch`; Bulk Unpay → RPC `unpay_challan_batch`. Void = re-read then guarded update (+ reversal payment for returns).
- **Cash Book** (embedded, gated by `module_access.cashbook`): date range → opening balance, expenses, paid/partial challans by `payment_date`, handovers. Users list + RPC `get_profiles_pin_status` (`has_pin`). Expense add mirrors DB locks (pending/confirmed handover periods); admin "Correct" = counter-entry dated today. Delete = optimistic + 5 s undo. Handover create = validations (recipient admin with PIN, amount ≤ available, duplicate/overlap fail-closed) → `cash_handovers.insert`; **Sign** → RPC `confirm_handover(p_id, p_pin)` (PIN verified server-side, lockout via `retry_after`, mirrored in `sessionStorage.pinLockUntil`); Reject → `reject_handover`; Cancel → `cancel_handover`; receipt → `printOrQueue('document','A4')` with no preview. Channel `cash_book_realtime` on 4 tables is torn down and recreated on every date change.

### 3.6 Purchase Orders and Attendance
- **PO**: every write is an RPC guarded by `set_config('app.po_rpc','on')` (direct table writes are rejected by a trigger that is not in the repo): `create_po_with_items`, `update_po_with_items` (draft only), `set_po_status` (`approved` draft→manager+; `sent`; `cancelled`; `reopen` closed→recomputed), `receive_po_items` (stale-tally guard first), `delete_po_receipt` (keeps `closed`), `close_po_short` (reason required). List = `purchase_orders` + embedded items, `count:'estimated'`, SKU search via `search_po_ids`. Channel `purchase_orders_rt` on 3 tables (published since 2026-08-31). Vendors: `po_vendors` autosuggest/quick-add, top-5 chips from `app_settings.po_top_vendors` (pg_cron daily). Outputs: A4 HTML (rates off by default, `for_pieces` never printed) → `printOrQueue('document')`; PNG share via canvas + `navigator.share`; vendor pendency report (open POs, oldest first) print + PNG.
- **Attendance**: shell loads employees + month data (entries from 6 days before month start for the paid-Sunday rule). Engine `computeMonthlySalary`: perDay = salary/days-in-month, perHour = perDay/(fix/60), hours × perHour per punched weekday, Sunday paid only if >3 of the preceding 6 days were worked (worked Sundays also pay hours), penalties + advances subtract, rounded to the rupee; `left_on` ends accrual (`LFT`). Employees CRUD (`employee-qr` bucket for payment QR), entries upsert on `(employee_id,date)` ("clear times" never deletes), Excel/CSV import (alias headers, auto-create employees, batches of 500), Salary view = live engine; "Save Month" snapshots to `attendance_salaries`; Mark Paid / kiosk = `attendance_salary_payments` upsert/delete; payslips → `printOrQueue('document','A4')`. No realtime.

### 3.7 Listing AI and master-sync
- **Templates**: upload marketplace xlsx → `parseTemplateFile` (best header row, dropdown lists extracted from raw sheet XML incl. x14 extLst, formula columns → `skip`) → merge with existing (`mergeTemplateFields`, `pruneRules`) → field editor (mandatory / fixed / hint / `sameAs` wire / `masterAs` pair / skip) + rules → `persistTemplate` (workbook to bucket `listing-templates/<id>.xlsx` then row).
- **Generate**: `status` (needs admin/manager + key) → SKUs (paste, Master picker, or handoff) → >200 → `useAutoBatch`; else `runValidate` (edge `validate`, 60/req, free) → `PreflightPanel` → `run()`: chunks of 3, first alone to warm the prompt cache, then 3 workers threading `prevMessageId`; 429 retried once after 30 s → rows → summary → `listing_runs.insert` (best effort; purged after 5 days by cron). **Export** injects `inlineStr` cells into the stored workbook XML (fflate) so validations survive; fallback plain sheet.
- **Edge `listing-ai` actions**: `status`, `set_model`, `set_key` (admin), `master_columns`, `master_picker`, `spellcheck`, `validate`, `ratecard_catalogs`, `ratecard_rows` (share-token or admin/manager; bumps `ratecard_share` use), `assistant`, `scan_mappings`, `suggest_mappings` (Haiku pinned), `generate` (model from `app_secrets.listing_ai_model`: `claude-haiku-4-5` default, `claude-sonnet-5`, `claude-opus-4-8`; structured JSON output; Dropbox image lookup via `listing_folders` parents → master IMAGE column → `dropbox_linkgen_roots`; taught `listing_mappings` applied in code). CORS allow-list is the production host + localhost.
- **Taught mappings / Bulk Teach**: `listing_mappings` paged editor; RPC `teach_bulk(p_lessons)` in slices of 500; `scan_mappings` buckets master values per dropdown column; `suggest_mappings` proposes targets.
- **Master Assistant** (mounted from Minis): seller sheet parsed client-side → edge `assistant` (5-tier fuzzy SKU ladder, tables, one Anthropic call) → deterministic comparison report → Excel; "Generate listings for not-uploaded" → `sessionStorage.listingai_prefill` + `listingai:prefill` event → Listing AI.
- **master-sync**: pg_cron → `trigger_master_sync(mode)` → `net.http_post` with `x-sync-secret` (Vault) → function compares to `app_secrets.master_sync_secret` (the secret lives in **two** stores). `auto` every 2 min (Drive probe currently disabled → blind 4-min resync), `full` hourly, `spellfix` weekly (writes corrections back to the sheet, logs `master_spellfix_log`, notifies admins). Discovers tabs dynamically (row 1 contains "sku") but consumers only read `ARYA` + `DRESSTIVE`. Mirror = `master_sheet_rows` (positional `cells`, `content_hash`, upsert only changed rows) + `master_sheet_columns` + `master_sheet_sync` lease/ledger. `readMasterTabs()` in `listing-ai` serves the mirror when both tabs synced within 45 min, else warns and reads Google live. `product_catalog` is rebuilt from the mirror by `refresh_product_catalog()` every 2 min (change-gated; duplicates skipped; no-op while a sync is running) and feeds every `SkuInput`.

### 3.8 Programs
List = `programs` (not deleted, `count:'estimated'`, `textSearch('search_vector')`), background summaries from `program_matchings/prices/price_parts`; realtime `programs-rt` (**silent**, table unpublished). Add/edit = lookups upserted → RPC `upsert_program` (optimistic `p_expected_updated_at`, `conflictError`) → RPC `upsert_program_price` (two RPCs, not one transaction). Detail = 3 reads; voice note = MediaRecorder (60 s cap, 10 MB) → bucket `program-voice-notes` (public) → `programs.voice_note_path`. Soft delete removes the voice file first; 5 s undo only flips `is_deleted`. Share = RPC `generate_share_token` → `#/share/program/<token>` → anon RPC `get_shared_program`. PDF = HTML + QR of the share URL → `printOrQueue('document','A4')`. i18n English/Gujarati via `useT` (per-user preference in `program_user_preferences`); two independent `useT()` instances exist.

### 3.9 Minis — hub and the standalone tools (read directly)
- **Hub** (`Minis.tsx`): tile grid from `MINI_TILES`; one `useBackClose` layer per open tool; leaving the tab resets to the grid; breadcrumb from `MINI_LABELS`.
- **Utsav Import** (inline in `Minis.tsx`): vendor Excel → size map 32..44 → `ARYA SKU` → XLS export; **Compare Non-Uploaded** → edge `short-track` action `compare` with the **anon key** → categories NA / stock out / not uploaded / in-stock-but-0 / virtual-stock-missing / duplicate; ignore list persisted in `utsav_ignored_skus`; per-category XLSX exports squeeze sized variants to base SKU.
- **Virtual Stock** (shared card): `virtual_stock` CRUD (≤1000), feeds Utsav/Odette/Indya totals.
- **Cbazaar Import**: pure client parse → CSV (`csvCell`).
- **Odette Import**: master SKUs + N vendor files + optional blocked sheet → totals + virtual stock − blocked → flags → XLS or **Push to Sheet** (edge `odette-export` `push`, `sheetName 'ARYA STOCK'`, session token; response names the QTY column). **Coverage Check**: edge `reconcile` diffs active size variants vs the Odette sheet.
- **Image Link Check** (under Trackly): `dropbox_status` → scan `linkcheck` (paged 100, warnings toasted, `link_check_approvals` suppress WRONG-LINK pairs locally too) → `linkfix dryRun:true` (shows folder) → `linkfix` (replaces, batches of 15; `needsReconnect` when `sharing.write` scope missing). Admin connects Dropbox once via `ConnectDropboxCard` (`dropbox_exchange` with the OAuth code; scopes `account_info.read files.metadata.read files.content.read files.content.write sharing.read sharing.write`).
- **LabelMaker**: `address_labels` CRUD (≤500), copies, 4×6 in labels → iframe preview → `printOrQueue('label_large', {4,6})`.
- **OTP Inbox**: iOS Shortcut POSTs `{secret, text, device}` to edge `otp-inbox`; rows appear via realtime INSERT (table published), delivery-sheet result merged via UPDATE; tap copies; `setup` action returns the shared key to any signed-in user; folder for delivery-sheet PDFs in `app_settings.otp_delivery_sheet_folder`. 30-day purge cron; no manual delete.
- **Product QC Labels** (`ReturnLabels.tsx`): `return_labels` CRUD (no limit; client-side filter + page). Two label types: `return` (persisted) and `qc_assured` (**print-only, never saved**; QC person from a hardcoded list). Copies stepper → `buildPrintHtml` → iframe preview → `printOrQueue('label_small', …, {1.97, 2.97}, 'QC Labels', printCount)`. Hardcoded contact number and brand text. Own delete-confirm modal instead of `useConfirm`.
- **Trackly** (`Trackly.tsx`, `TracklyAnalytics.tsx`): `short_links` (own rows only by RLS, ≤500) create (URL validated http/https, code 5 chars or custom ≥3) / copy / delete (`RW5Un` protected); rows are immutable (DB trigger). Analytics = `link_clicks` ≤2000 rows + exact count for a date range, aggregated client-side (unique visitors = distinct `visitor_hash`). **Redirect** `#/s/<code>` (`TracklyRedirect.tsx`): rendered by `App` **without** `AuthProvider`; `resolve` POST fires at module load; landing code `RW5Un` shows `TracklyLanding` (Matrix page: Self Import via `lookup`, Redirect to GSheet, Download Sheet via `sheet` → xlsx) and is cached 24 h in `localStorage.tly_<code>` (repeat visits uncounted); other codes `window.location.replace(longUrl)` (+ `reload()` for same-origin `#/rc/…` links). **Edge `short-track`**: GET `/short-track/<code>` (302), `resolve` (**counts as a click** via RPC `record_link_click`), `lookup {skus}` (≤5000; stock status from the **live** Google sheet, 5-tier SKU/size matching), `compare {skus}` (≤10000; used by the Utsav import → inactive / nonUploaded / notFound / duplicates), `sheet` (raw tabs); 60 req/min/IP; three separate 5-min in-isolate caches of the same two tabs; Google scope `spreadsheets.readonly`.
- **Forward → Dropbox** (`forward/`): mobile-only camera overlay (rear camera, tap-to-focus best-effort) → `captureFrame` (≤1600 px JPEG q0.72) → review (retake/rotate) → `odette-export` `fwd_upload {dataUrl, dateStr}` named `YYYY-MM-DD.jpg` into the single shared folder (`fwd_folder` list/save — any signed-in user may change it); `dropbox_not_connected`/`needs_write_scope` → admin reconnect via `ConnectDropboxCard`; failed items retry on tap (base64 kept in state, cap 40).
- **Client Finder** (`clientfinder/` + edge `client-finder`): by uploaded photos or by SKU (`PhotoPicker` → `odette-export` `linkgen mode:'separate'`, thumbnails via `?thumb=`). **One edge call per photo** (`search`, `source:'sku'|'upload'`): server enforces a fail-closed **25 searches / user / rolling 24 h** cap (`client_finder_searches` count), sha256 dedupe per user (24 h → cached hits, no Vision spend), SSRF-guarded Dropbox fetch (`raw=1`, ≤15 MB) or `image_b64`, Google Vision `WEB_DETECTION` (scope `cloud-platform`), hit filtering (pages must carry full/partial image matches; CDN aliases folded; `similar` kept separately), header-only image measuring (ranged 64 KB GET, 8 workers, 15 s budget), then inserts `client_finder_searches` + `client_finder_hits` (search row deleted if the hits insert fails). Client merges hits by URL, shows `quota {used, cap}`, exports xlsx. `ping` action for monitoring (secret `app_secrets.client_finder_ping_secret`).
- **Dropbox Uploader** (`uploader/`): `up_folders` shortcuts, `FolderPicker` browses one level at a time (`up_browse`), queue → sequential `up_link` (temporary Dropbox upload link, ≤150 MB) → XHR bytes straight to Dropbox with progress; on network failure and ≤5 MB → `up_relay` (base64 through the edge). Add-only with autorename. Stop/Retry per row.
- **Dropbox Link Generator** (`dropboxlinks/`): `linkgen_roots list` (enabled roots; >1 → `FolderAskModal` every time) → `useGenOne` fires `linkgen` for **both** modes (`combine` folder link / `separate` ≤40 image links) and shows the on-screen one; candidates when ambiguous; bulk via paste/Excel (`runBulk`, 3 workers, cap 300) → xlsx; **Save to master sheet** (admin/manager/operator, combine mode) → `linkgen_writesheet` writes the IMAGE column. `RootSettings` (admin UI, but the server accepts saves from any role) → `linkgen_roots save` (server verifies each root). All thumbnails = GET `odette-export?thumb=<link>&k=<anon key>`.
- **Catalog Downloads** (`catalogdl/`, a tab in RateCard Studio; works with the seller share token): `catalog_list` (5-min module cache) → `catalog_folder {catalog}` (SKU folders classified active/inactive/unknown vs `product_catalog`, missing SKUs) → "Prepare pack" `catalog_pack` polled every 2 s (≤90) → Dropbox-hosted zip link of the active folders.
- **OTP Inbox edge** (`otp-inbox`): iOS Shortcut POSTs `{secret, text, device}`; constant-time compare with `app_secrets.otp_push_secret`; `extractOtp` (keyword-anchored 4–8 digit run, not a rupee amount) → `otp_inbox` insert → background `processDeliverySheet` (`EdgeRuntime.waitUntil`): first URL in the SMS, courier detected from active `packtime_couriers` names, folder from `app_settings.otp_delivery_sheet_folder`, fetch ≤4 MB, PDF passthrough or HTML → A4 PDF via `pdf-lib`, upload to Dropbox as `DD-MM-YYYY - <Courier>[ (n)].pdf`, outcome PATCHed onto the row (`sheet_file` / `sheet_status`) → UI via realtime UPDATE. `setup` returns the secret to **any** active signed-in user (comment says admins). CORS `*`.

#### Minis A — per-file index (QC labels, Trackly, Forward, Client Finder, Uploader, Link Generator, Catalog Downloads)
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `minis/ReturnLabels.tsx` | 468 | Product QC / Return labels CRUD + 1.97×2.97 in print | `return_labels` select/insert/update/delete; `printOrQueue('label_small')` |
| `minis/Trackly.tsx` | 221 | Short-link list/create/delete | `short_links` select (≤500)/insert/delete; `copyToClipboard`; SwipeRow `trackly` |
| `minis/TracklyAnalytics.tsx` | 258 | Per-link click analytics | `link_clicks` select (≤2000) + exact count |
| `minis/TracklyRedirect.tsx` | 118 | `#/s/<code>` handler (no auth provider) | edge `short-track` `resolve` (anon key, module-level prefetch); localStorage `tly_<code>` |
| `minis/TracklyLanding.tsx` | 212 | Public Matrix landing for `RW5Un` | edge `short-track` `sheet`; `saveWorkbook` |
| `minis/TracklyImport.tsx` | 136 | Public self-import → stock status CSV | edge `short-track` `lookup`; local `csvSafe` |
| `minis/forward/ForwardDropbox.tsx`, `FwdSettings.tsx`, `compressImage.ts` | 324, 67, 72 | Camera → Dropbox | edge `odette-export` `dropbox_status`, `fwd_upload`, `fwd_folder`; `useAuth().profile.role` |
| `minis/clientfinder/ClientFinder.tsx`, `HitList.tsx`, `PhotoPicker.tsx`, `api.ts`, `exportHits.ts` | 402, 146, 143, 101, 31 | Reverse image search UI | edge `client-finder` `search`; edge `odette-export` `linkgen`, `?thumb=`; `useProductCatalog`; `saveWorkbook` |
| `minis/uploader/DropboxUploader.tsx`, `FolderPicker.tsx`, `UploadRow.tsx`, `api.ts` | 158, 89, 53, 124 | Any-file uploader | edge `odette-export` `up_folders`, `up_browse`, `up_link`, `up_relay`; XHR to Dropbox |
| `minis/dropboxlinks/DropboxLinkGenerator.tsx`, `FolderAskModal.tsx`, `LinkResult.tsx`, `RootSettings.tsx`, `api.ts`, `bulk.ts`, `useGenOne.ts`, `useSheetSave.ts` | 194, 44, 66, 71, 38, 64, 73, 44 | SKU → Dropbox links, bulk, save to sheet; shared `call()` for every Dropbox mini | edge `odette-export` `linkgen_roots`, `linkgen`, `linkgen_writesheet`, `?thumb=`; `useAuth().profile.role` |
| `minis/catalogdl/CatalogDownloads.tsx`, `FolderList.tsx`, `api.ts` | 93, 44, 55 | Vendor pack builder | edge `odette-export` `catalog_list`, `catalog_folder`, `catalog_pack` |
| `supabase/functions/short-track/index.ts` | 534 | Redirect + click log + public stock lookup/compare/sheet from the **live** Google sheet | RPC `record_link_click`; Google Sheets `batchGet` (`ARYA`, `DRESSTIVE`) |
| `supabase/functions/client-finder/index.ts` | 673 | Google Vision reverse image search | `client_finder_searches/hits`, `profiles`, `app_secrets.client_finder_ping_secret`; sibling call to `odette-export` `linkgen`; Vision API |
| `supabase/functions/otp-inbox/index.ts`, `delivery.ts`, `sheetPdf.ts` | 112, 131, 104 | OTP intake + delivery-sheet filing | `app_secrets` (`otp_push_secret`, Dropbox keys), `otp_inbox` insert/PATCH, `packtime_couriers`, `app_settings.otp_delivery_sheet_folder`; Dropbox upload; `pdf-lib` from esm.sh |

#### Minis B — per-file index (Costing, Pricing, RateCard, Indya)
| Path | Lines | Purpose | Touches |
|---|---|---|---|
| `minis/costing/ProductCosting.tsx` | 121 | Costing list, duplicate, new; loads chip names | `costing_products` select (≤500); `app_settings.costing_top_subs` |
| `minis/costing/CostingEditor.tsx` | 191 | One sheet: hero, components, totals, notes, save/delete, PDFs, Raise POs | `costing_products` upsert/delete; bucket `costing-images`; `useProductCatalog`; `products` (categories) |
| `minis/costing/RaisePOModal.tsx`, `inhouse.ts` | 149, 25 | Purchase plan grouped by supplier → one draft PO each, opened in the real `POForm` pre-filled (vendor matched by name, type, SKU, sub-material, material code as fabric code, qty, rate, pieces, `costing_product_id`). In-house suppliers (shared list `app_settings.costing_inhouse_suppliers`, seed ARYA DESIGNS; "Mark in-house" / "Needs a PO" edit it) are listed apart and get no PO | `po_vendors` select; `app_settings` select/upsert; `POForm` (lazy) → RPC `create_po_with_items` |
| `minis/costing/costingModel.ts` | 206 | Shapes + arithmetic, validation, library harvest, purchase plan | pure |
| `minis/costing/LineSheet.tsx`, `SupplierModal.tsx`, `ComponentCard.tsx`, `CostingHero.tsx`, `TotalsCard.tsx`, `SubChips.tsx`, `SheetProblems.tsx`, `AskBox.tsx`, `PrintPreview.tsx` | 151, 122, 126, 67, 43, 41, 29, 113, 32 | Editor UI; `PrintPreview` = iframe `srcDoc` + `contentWindow.print()` | portals + `useModalLock` |
| `minis/costing/costingAsk.ts`, `costingNames.ts`, `costingSheet.ts`, `costingTemplates.ts`, `imageResize.ts`, `purchasePlan.ts`, `useSettingsCategories.ts` | 138, 30, 82, 70, 28, 89, 22 | Ask engine, name canonicalisation, print HTML (`escHtml`), templates/presets, photo resize, purchase-plan HTML, categories loader | `products` select `name` (active, ≤500) |
| `minis/pricing/PriceProjector.tsx` | 101 | Projection list + filters | `costing_products` select; `app_settings` (pricing keys); `purchase_order_items` (12 months); `useProductCatalog` |
| `minis/pricing/ProjectorSheet.tsx` | 164 | One projection: overrides, target, evidence actions, AI card, print, save | `costing_products` update (`pricing, selling_price, category`) and (`components`) |
| `minis/pricing/aiSuggestions.ts` | 56 | Load latest AI batch / call edge | `pricing_ai_suggestions` select; edge `pricing-ai` (`suggest`) |
| `minis/pricing/pricingConfig.ts`, `pricingModel.ts`, `evidence.ts`, `evidenceSheet.ts`, `suggestions.ts`, `poLines.ts`, `useProjectionFacts.ts`, `pricingSheet.ts`, `normName.ts` | 71, 108, 114, 72, 81, 34, 29, 31, 4 | Config load/save (`app_settings` `pricing_*`), pure projection maths, evidence engine, rule suggestions, PO lines loader, hash, print HTML | `app_settings` select/upsert; `purchase_order_items` select |
| `minis/pricing/AiSuggestionsCard.tsx`, `EvidenceList.tsx`, `StitchingOverrides.tsx`, `SuggestionsList.tsx` | 112, 52, 47, 27 | UI | — |
| `minis/ratecard/RateCardStudio.tsx` | 32 | Pill switch: Rate card / Catalog downloads / Catalog maker (in-app only) | — |
| `minis/ratecard/RateCardGenerator.tsx` | 209 | Studio form (modes, markup, disclaimer, hero, Generate → canvas JPEG) | `useScriptFont`; `/arya-designs-logo.png` |
| `minis/ratecard/CatalogMaker.tsx`, `useCatalogPhotos.ts`, `CatalogTile.tsx`, `CatalogResults.tsx`, `indexPhotos.ts`, `useScriptFont.ts` | 141, 59, 49, 47, 63, 25 | Catalog maker: photos + SKU each (SKU pre-filled from file name, reorder, sort, duplicate warning; 320 px thumbnails made 3 at a time, memoised cards); at Generate the photos decode straight to tile size 4 at a time with progress, then one of two outputs (below); results = one panel per page + Share all / Save all | `/arya-designs-logo.png`; Google font fetch; `RateCardActions` (`fileLabel`) |
| `minis/ratecard/renderIndex.ts`, `indexBackdrop.ts` | 118, 66 | **Index** output: grid captioned with SKUs + gold ornament, logo beside (landscape, 4 cols) or above (portrait, 3 cols), backdrop = blurred mosaic of the photos under a scrim tinted with their average colour (Dark / Light mood), shadow stamped from one sprite, optional script title | pure |
| `minis/ratecard/renderPages.ts` | 41 | **Pages** output: two photos edge to edge at one height (1600 px, whole, never cropped; page width = the two widths), each code INSIDE its photo bottom-right as a couture label (ARYA DESIGNS kicker, code in Cinzel cream-gold with tracking, gold rule + diamond, soft corner fade); no margin, gap, backdrop or frame; an odd last page keeps the two-photo width and fills the empty half with a brand panel (logo + catalog name over a blurred, tinted copy of that photo). Decoded per page at 1600 px, released after drawing | `/arya-designs-logo.png` (odd count only) |
| `minis/ratecard/MasterRateCard.tsx` | 166 | From-Master mode | edge `listing-ai` `ratecard_rows`; localStorage `ratecard_master_cols_v1` |
| `minis/ratecard/ManualRateEditor.tsx` | 128 | Manual grid, autosaved draft | localStorage `ratecard_manual_draft_v1` |
| `minis/ratecard/HeroFromSkus.tsx` | 106 | Auto-loads product photos | edge `odette-export` `ratecard_photos`, `ratecard_photo_fetch` |
| `minis/ratecard/CatalogPicker.tsx` | 114 | Catalog combobox | edge `odette-export` `catalog_list` (via `catalogdl/api`) |
| `minis/ratecard/SellerLinkBar.tsx` | 70 | Seller share link + Trackly code | `ratecard_share` select/insert/update; `short_links` insert |
| `minis/ratecard/PublicRateCard.tsx` | 55 | Public `#/rc/<token>` page | — |
| `minis/ratecard/RateCardActions.tsx` | 54 | Save / Share / WhatsApp | `navigator.share`, `window.open` (documented exception) |
| `minis/ratecard/renderRateCard.ts`, `canvasKit.ts`, `finalizeRateRows.ts`, `masterSheetBuild.ts`, `parseRateSheet.ts`, `MarkupRow.tsx` | 197, 102, 104, 82, 87, 38 | Canvas renderer, helpers, 50-row finalize/GST autocorrect/markup, master → sheet, Excel parser | `xlsx` |
| `minis/indya/IndyaImport.tsx` | 198 | Indya flow owner (master, vendors, blocked, SKU sheet, compute, download) | files in memory; `downloadFile`, `saveWorkbook` |
| `minis/indya/IndyaSkuMap.tsx` + `indyaMap.ts` | 142 + 69 | Wrong→correct code map | `indya_sku_map` select (≤5000)/upsert (chunks of 500, `onConflict wrong_norm`)/delete; CSV via `csvCell` |
| `minis/indya/IndyaCoverage.tsx` + `indyaCoverage.ts` | 133 + 84 | Active catalog variants missing from Indya | `useProductCatalog` |
| `minis/indya/indyaMaster.ts`, `indyaMasterCsv.ts`, `indyaFiles.ts`, `indyaCompute.ts`, `indyaSku.ts`, `indyaSkuSheet.ts`, `IndyaTable.tsx`, `IndyaToolbar.tsx`, `IndyaUnknown.tsx`, `IndyaHint.tsx` | 139, 88, 106, 143, 116, 48, 60, 44, 24, 11 | Byte-exact master parse/rewrite, vendor/blocked readers, pure aggregation, SKU key rules, exports, UI | `xlsx` (dynamic import) |
| `minis/indya/IndyaBarcodes.tsx` + `indyaBarcodeParse.ts` + `indyaBarcodeLabel.ts` + `pdfObjects.ts` | 96 + 160 + 55 + 178 | "Convert Indya barcode": reads Indya's barcode label PDFs in the browser (no PDF library — own object reader + content-stream interpreter), N labels per page, bars replayed as SVG from the PDF's own `re` rectangles, every text run kept with size/weight, printed on 1.97×2.97 in | `printOrQueue('label_small')`; copies expanded in the HTML |
| `supabase/functions/odette-export/index.ts` + `catalog.ts` | 1261 + 317 | Dropbox + Google Sheets edge function (22 actions, §3.10) | `app_secrets` (Dropbox keys, roots, fwd folder, selftest secret), `profiles`, `ratecard_share`, `link_check_approvals`, `product_catalog`, `master_sheet_rows`; Google Sheets read **and write**; Dropbox API |
| `supabase/functions/pricing-ai/index.ts` | 163 | Evidence-cited AI insights | `app_secrets` (`anthropic_api_key`, `listing_ai_model`), `profiles`, `pricing_ai_suggestions` delete+insert; Anthropic Messages API |

### 3.10 Minis — Product Costing, Price Projector, RateCard Studio, Indya, odette-export, pricing-ai

- **Product Costing** (`minis/costing/`): `ProductCosting` loads `costing_products` (9 explicit columns, newest first, ≤500) and `app_settings.costing_top_subs` (cron-ranked chip names, error ignored). The whole sheet is **one JSONB row** (`components` → subs → suppliers); `buildLibrary`/`withTemplates` harvest names, garment templates and per-material presets from every saved sheet in memory. Editor: `resolveSku` against `product_catalog` — a master `price_exc_gst` **overrides and locks** `selling_price`; category from Settings → Categories (`products`); photo → `optimizeImage` (1200 px JPEG) → bucket `costing-images/<id>.jpg` (upsert, public URL + `?v=` cache-buster). Save = `pruneBlank` → `canonicalizeNames` → `validateSheetDetailed` → `costing_products.upsert` (`created_by` overwritten with the current user each save; `23505` = duplicate SKU). Delete via `useConfirm`. Ask box is a pure lookup (`askCosting`). PDFs (costing sheet, purchase plan for N pieces grouped by supplier) render in `PrintPreview` (iframe `srcDoc`, `contentWindow.print()` — **not** `printOrQueue`).
- **Price Projector** (`minis/pricing/`): loads `loadPricingConfig()` (`app_settings` `pricing_stitching`, `pricing_thresholds`, `pricing_defaults`), `costing_products` (+`pricing` jsonb), `loadPoLines()` (`purchase_order_items` with inner `purchase_orders`, last 365 days, not draft/cancelled, limit 500), the product catalog and categories. `project()` (pure): fabric = Meter/Yard subs, material = rest, stitching heads (`per_pc`/`per_meter`/`pct_of_material`, per-product overrides in `pricing.stitching`), maintenance %, target = (cost+fixed)/(1−pct), GST 5 % ≤ ₹2,500 else 18 %, threshold product > category > default, status ok/below_margin/over_cost/no_price. Sheet: rule-based `suggestions()`, deterministic `buildEvidence()` (PO paid vs sheet rate with `use_rate` action, vendor history, stale sheet, consumption, double-counted heads, ₹1 placeholders, peer structure) → SHA-256 `inputHash`. Save → `costing_products.update({pricing, selling_price, category})`; `use_rate` → immediate `update({components})`. **AI card**: `loadAiBatch` (latest `pricing_ai_suggestions` row; stale when `input_hash` ≠ live hash) → `generateAiBatch` → edge **`pricing-ai`** `{action:'suggest', productId, inputHash, facts, evidence, deterministic}`: caller must be admin/manager/operator; secrets `app_secrets.anthropic_api_key` + `listing_ai_model` (whitelist, default `claude-haiku-4-5`); one Anthropic call (cached system prompt, assistant prefill, `max_tokens` 1200); insights must cite `E<n>` evidence ids and pass a `FORBIDDEN` regex (no "negotiate/bundle/switch supplier"), capped at 5; then **DELETE + INSERT** one `pricing_ai_suggestions` row per product with the service role (not a transaction). Print via `PrintPreview` (`pricingSheetHtml`, `@page A4 10mm`).
- **RateCard Studio** (`minis/ratecard/`, also public at `#/rc/<token>`): modes Import Excel (`parseRateSheet`), Build manually (`ManualRateEditor`, draft in `localStorage.ratecard_manual_draft_v1`), From Master (`MasterRateCard`: `CatalogPicker` → odette-export `catalog_list`; SKUs (≤50) or catalog → **listing-ai `ratecard_rows`** → column chips remembered in `localStorage.ratecard_master_cols_v1` → `buildMasterSheet`). `finalizeRateRows`: 50-row cap, all-or-nothing price parsing, GST slab autocorrect (mutates rows), duplicate warning, stats; `applyMarkup` (% or ₹). Hero: `HeroFromSkus` → odette-export `ratecard_photos {skus, shareToken?}` (8 candidates, 30-min client cache) → `ratecard_photo_fetch {path}` returns bytes via the edge function so the canvas stays untainted. Generate → `renderRateCard` (1440 px canvas, Great Vibes font fetched from `fonts.gstatic.com`, logo) → JPEG → Save / `navigator.share` / WhatsApp (desktop fallback `window.open`). `SellerLinkBar` (owner only): reads/creates the single active `ratecard_share` token, best-effort mints `short_links` code `ratecard` and stores it in `ratecard_share.short_code`; `ratecard_share` RLS is admin/manager only, so operators get an error toast here. `PublicRateCard` renders the studio with `lockedMode='master'` and the token; the token is validated only server-side (listing-ai + odette-export, per-IP in-isolate rate limits).
- **Indya Import** (`minis/indya/`): master file (HTML or CSV export from Indya, ≤15 MB; real xlsx rejected) is parsed while recording the **byte range of every Stock cell**; `IndyaSkuMap` panel = `indya_sku_map` CRUD (codes only, `wrong_norm` unique, upsert chunks of 500, CSV export via `csvCell`); Download SKU sheet (one column, dedup by `shapeKey`, above-XXL skipped); vendor files + blocked sheet (`readVendorFile`/`readBlockedFile`, header by alias); Compute = `computeIndya` (strict then shape lookups, LEHENGA CHOLI bare-code override, `+virtual −blocked`, flags `ok|last|oos|unknown|size_missing|blocked|oversize`) → `rewriteMasterBytes` replaces only those byte ranges → `downloadFile` under the **original filename** (owner's rule; the one exception to `exportName`). Coverage Check = active `product_catalog` variants (sizes ≤ XXL, else one Unstitched row) vs the Indya index → xlsx.
- **odette-export edge function** (22 POST actions + GET thumbnail proxy; auth = session JWT → `profiles.role/is_active` via service role, or an active `ratecard_share` token for the seller-facing actions; all Dropbox credentials in `app_secrets`):
  - GET `?thumb=<dropbox link>&k=<anon key>` → `files/get_thumbnail_v2` streamed (1-day cache).
  - `dropbox_status` → `{connected, appKey}`; `dropbox_whoami` (diagnostic); `dropbox_exchange` (admin) → OAuth code → `app_secrets.dropbox_refresh_token`.
  - `fwd_folder` list/save (`app_secrets.dropbox_fwd_folder`), `fwd_upload {dataUrl, dateStr}` → `files/upload` `<date>.jpg` (Forward→Dropbox).
  - `up_selftest` (header `x-up-secret` = `app_secrets.uploader_selftest_secret`), `up_browse {path}`, `up_folders`, `up_link {folderPath,name,size}` (temporary upload link ≤150 MB), `up_relay {b64}` (Dropbox Uploader).
  - `catalog_list` (from `product_catalog` + `master_sheet_rows`, 5-min cache, 20/min), `catalog_folder {catalog}` (Dropbox folder → classify SKU sub-folders active/inactive/unknown), `catalog_pack {catalog,path}` (copy active folders into `/DailyOffice Vendor Packs/<Catalog>` via `copy_batch_v2`, shared `dl=1` link; async job polling) (Catalog Downloads).
  - `ratecard_photos {skus≤64, shareToken?}`, `ratecard_photo_fetch {path, shareToken?}` (Rate Card hero).
  - `linkgen_roots` list/save (`app_secrets.dropbox_linkgen_roots` — **save is not admin-gated**), `linkgen {sku, mode:'combine'|'separate', folder?, rootUrl?}` (folder or per-image share links), `linkgen_writesheet {items≤300, dryRun?}` (**writes IMAGE URLs into the live master sheet**) (Dropbox Link Generator).
  - `linkcheck {offset, limit}` (reads the **live** master sheet IMAGE column, checks each Dropbox link with 8 workers, suppresses `link_check_approvals`), `linkfix {items≤20, dryRun?}` (finds the right folder under `app_secrets.dropbox_root_<tab>`, **PUT-writes the IMAGE cell**) (Image Link Check).
  - `reconcile` (Odette sheet tab `ARYA STOCK` vs live master active size variants), `push {sheetName:'ARYA STOCK', rows}` (**writes the QTY column** of the Odette sheet) (Odette Import).
  - Env: `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `ODETTE_SHEET_ID`/`GOOGLE_SHEET_ID`, `MASTER_SHEET_ID`, service role. Errors → `console.error` + `{ok:false, error:'Server error', details}`.
- **`product_catalog` population**: `master-sync` → `master_sheet_rows/columns` → `refresh_product_catalog()` (DEFINER, pg_cron `*/2`): columns resolved by `header_norm` (`sku, stockstatus, catalog, category, title, size, priceexcgst, priceinclgst`), numeric casts regex-guarded, `sizes[]` parsed (stitch types → empty), **duplicate SKUs skipped entirely**, change-gated upsert, deletes vanished/duplicated SKUs, no-op while a sync is `running`. The production body is further change-gated via `product_catalog_refresh_state` (only after a sync with `changed_rows > 0`, 6-hour heartbeat) — that body exists only in Supabase migration history. Readers: `useProductCatalog` (client), Costing/Projector (price, category), Indya coverage (sizes), odette-export `catalog.ts` (service role).

---

## 4. Printing paths

All printing goes through `printOrQueue(slot, html, size, title, copies?, addToast?, previewFrame?)` in `lib/printQueue.ts` except where noted. Slot strings are `PrintSlot` = `label_small` | `label_large` | `document`; the Print Station maps each slot to a printer chosen per PC (`localStorage.qz_printer_<slot>`).

| Call site | Slot | Size passed | Template `@page` | Preview iframe | Notes |
|---|---|---|---|---|---|
| `components/minis/ReturnLabels.tsx:461` (Product QC / Return labels) | `label_small` | `{1.97, 2.97}` in | `size:1.97in 2.97in; margin:0`, `.label` 1.97×2.97 in, one per page | yes | passes `printCount` as `copies` |
| `pages/BrandTags.tsx:803` | `label_small` | `{1.97, 2.97}` | same | yes | copies expanded into the HTML; one job per batch |
| `components/minis/indya/IndyaBarcodes.tsx` (Convert Indya barcode) | `label_small` | `{1.97, 2.97}` | same | yes | copies expanded into the HTML; inline fit script shrinks overflowing labels |
| `pages/Inventory.tsx:533` (barcode) | `label_small` | `{1.97, 2.97}` | `margin:10mm` (no size) | **no** → hidden iframe in default mode | JsBarcode canvas data-URL |
| `components/minis/AddressPrinter.tsx:214` | `label_large` | `{4, 6}` | `size:4in 6in; margin:0` | yes | |
| `settings/PrinterSettings.tsx:85` test print | any | A4 / 4×6 / 1.97×2.97 | inline | — | calls `printHtml` directly (bypasses the queue); `${printer}` not `escHtml`'d |
| `pages/CashChallan.tsx:1643` challan | `document` | `'A4'` | `size:A4; margin:8mm`; office + customer copy on one sheet | yes | |
| `pages/CashChallan.tsx:1324` ledger PDF | `document` | `'A4'` | `margin:12mm` | yes | |
| `pages/CashBook.tsx:478` handover receipt | `document` | `'A4'` | `margin:10mm` | **no** | |
| `pages/PurchaseOrders.tsx:249` PO | `document` | `'A4'` | none | yes | rates toggle; PNG share separate |
| `components/purchaseorders/PendencyReport.tsx:90` | `document` | `'A4'` | none | yes | PNG share separate |
| `pages/Inventory.tsx:1326` export | `document` | `'A4'` | `size:A4 landscape; margin:8mm` | yes | |
| `pages/InventoryExtras.tsx:680` export | `document` | `'A4'` | `size:A4; margin:8mm` | yes | |
| `components/attendance/Salary.tsx:282` payslips | `document` | `'A4'` | `margin:8mm` | yes | |
| `modules/programs/PDFExport.tsx:134` | `document` | `'A4'` | `size:A4; margin:12mm` | **no** | QR of share link embedded |
| `components/minis/costing/PrintPreview.tsx:16` (costing sheet, purchase plan, price projection) | — (bypasses the queue) | — | costing/plan `body{margin:10mm}`; projection `size:A4; margin:10mm` | yes | calls `frame.contentWindow.print()` directly; never reaches `print_queue`, so cloud print mode does not apply to these three PDFs |
| `components/minis/ratecard/RateCardActions.tsx` | — | — | — | — | not print: canvas → JPEG (1440 px) → `<a download>` / `navigator.share` / WhatsApp `window.open` |
| `supabase/functions/otp-inbox/sheetPdf.ts` (server) | — | — | A4 595×842 pt via `pdf-lib` | — | delivery-sheet PDF uploaded to Dropbox, never printed |

Sizes on the QZ side (`qzPrint.printHtml`): `'A4'` → 8.27 × 11.69 in; objects passed through; `units:'in'`, zero margins, `scaleContent:true`, `copies` honoured. `print_queue.page_size` is stored as `'A4'` or `{width,height}`; the station also tolerates legacy `{w,h}`.

`print_queue` lifecycle: `pending` → `printing` (claimed by `printed_by_station`) → `done` | `failed` (`error_message` via `friendlyPrintError`). Expiry 30 min pending; stale sweep 120 s printing; recovery of own jobs >90 s; purge done/failed >7 days (both Print Station and Printer Settings run it). Submitter dedups identical HTML within 3 s and caps HTML at 1 MB.

Non-print exports: CSV via hand-built strings or `csvCell` (see §7.9), XLSX via `saveWorkbook` → `downloadFile` (share sheet on touch devices), PNG via canvas + `navigator.share` (PO, pendency), xlsx by XML injection (Listing AI).

---

## 5. Cross-module shared state

| State | Where it lives | Readers / writers |
|---|---|---|
| **Auth session** | Supabase auth in `localStorage` (`sb-*-auth-token`) | `useAuth` (restore/refresh/lock), `faceId.hasStoredSession`, `main.tsx` update-overlay gate, every edge call that sends `session.access_token` |
| **`profile`** (`useAuth().profile`) | `profiles` row (id, email, full_name, role, is_active, phone, module_access) | tab gating (`App`, `Sidebar`, `Settings`), `canEdit` role lists in Inventory/Extras/PO/Attendance/Challan/LinkCheck, `created_by`/`reported_by` stamps; several pages bypass it with `supabase.auth.getUser()` (CashBook reads `profiles.role` itself) |
| **`profiles.module_access`** | JSON `{moduleKey: boolean}`; `null` = all on; admins bypass | `canAccessTab` (tab keys), `canAccessModule('extras' | 'cashbook')`, edited in `settings/Users.tsx` |
| **Face ID lock** | localStorage `doFaceIdCred`, `doAppLocked`, `doFaceIdFails` | `faceId.ts`, `useAuth`, `Login`, `MyProfile` |
| **`app_settings`** (key/value) | `print_mode`, `print_station_heartbeat`, `payment_qr_url`, `payment_upi_id`, `pricing_stitching`, `pricing_thresholds`, `pricing_defaults`, `costing_top_subs` (cron), `po_top_vendors` (cron), `otp_delivery_sheet_folder` | `printQueue`, `PrintStation`, `PaymentQR`, `CashChallan` (QR on every detail open), pricing settings/projector, costing chips, `TopVendorChips`, `OtpFolderSetting`; realtime only for `print_mode` |
| **`app_secrets`** (server-only) | `anthropic_api_key`, `listing_ai_model`, `dropbox_refresh_token`, `dropbox_app_key`, `dropbox_app_secret`, `dropbox_linkgen_roots`, `dropbox_root_<tab>`, `dropbox_fwd_folder`, `uploader_selftest_secret`, `client_finder_ping_secret`, `master_sync_secret`, `otp_push_secret` | edge functions with the service role; RLS has **0 policies** (nothing client-side can read it). Dropbox tokens never reach the browser; only the public OAuth `appKey` does. |
| **`notifications`** | table + channel filtered by `user_id` | `useNotifications` (list, badge, toast on INSERT); inserted by `master-sync` spellfix; `type='pair_complete'` rows carry `entity_id` → Inventory opens that item |
| **Toasts** | `useNotifications().addToast` | every page; passed as a prop into components |
| **Breadcrumb** | `useBreadcrumb` | Inventory (Spare Parts), Cash Challan (Cash Book/Ledger/Analytics/#N), PackTime (Scan History), Minis (tool label), Settings (tab) |
| **`print_queue`** | table | producers via `printOrQueue`; consumer `PrintStation`; admin view `PrinterSettings` |
| **`master_sheet_*`** | mirror tables (admin/manager read; sync table any authenticated) | written only by `master-sync`; read by `listing-ai` (service role), `MasterFreshness` (client), `refresh_product_catalog()` |
| **`product_catalog`** | derived from the mirror every 2 min | `useProductCatalog` → `SkuInput` (Challan, PO, Brand Tags, Dropbox Link Generator, Client Finder, RateCard) |
| **`audit_log`** | `module` in `cash_challan`, `cash_book`, `purchase_order` (+ trigger-written rows `audit_*` on inventory tables) | writers in those modules; readers `ChallanDetail`, `CashChallan.loadAuditTrail` (by `details ilike '%#N%'`), `PurchaseOrders` detail |
| **localStorage keys** | `print_mode`, `print_station_name`, `qz_printer_*`, `sidebarOpen`, `signOutReason`, `ccDraft`, `ccErpReminderHidden`, `packtime_failed_db_scans`, `unsort.product_catalog.v1`, `doFaceIdCred`/`doAppLocked`/`doFaceIdFails`, `vpdebug`, `tly_<code>` (Trackly landing cache, 24 h), `ratecard_manual_draft_v1`, `ratecard_master_cols_v1` | see owners above; `Sidebar` clears `ccDraft` on sign-out |
| **sessionStorage keys** | `challan_search` (Dashboard → Challan), `listingai_prefill` (Assistant → Listing AI), `pinLockUntil`, `chunkReloadedAt`, `pwa-dismiss`, `swipe-hint-<key>` | — |
| **Module-level singletons** (survive tab switches, not reloads) | PackTime sheet write queue + dropped batches + failed DB scans; `useProductCatalog` index; `useBackClose` layer stack; `printQueue` dedup map and job watchers; `qzPrint` connection | — |
| **Body class `modal-open`** | `useModalLock` | hides FAB and bottom nav (`index.css`) |

---

## 6. Live database inventory (queried read-only on 2026-09-15)

**Realtime publication `supabase_realtime` (23 tables):** app_settings, brand_tags, cash_book_balances, cash_challan_items, cash_challans, cash_expenses, cash_handovers, components, inventory_extras, inventory_items, item_components, item_tags, locations, notifications, otp_inbox, print_queue, products, profiles, purchase_order_items, purchase_order_receipts, purchase_orders, tags, tasks.
Every table the app subscribes to is in that list **except `programs`** (subscribed in `modules/programs/hooks/usePrograms.ts:46-55`; the context doc wrongly lists it as published).

**pg_cron jobs (10):** `master-sync-probe` `*/2 * * * *`, `master-sync-full` `23 * * * *`, `master-spellfix-weekly` `30 2 * * 0`, `product-catalog-refresh` `*/2 * * * *`, `purge_listing_runs` `17 3 * * *`, `purge-otp-inbox` `50 3 * * *` (30 d), `purge-cron-history` `40 3 * * *` (7 d), `costing-top-subs` `10 3 */4 * *`, `costing-common-subs` `20 3 */4 * *`, `po-top-vendors` `20 3 * * *`. `cleanup_old_link_clicks()` exists but is **not** scheduled.

**Public functions (73).** RPCs the client calls (S = SECURITY DEFINER, I = INVOKER):
`apply_return_credit` S · `cancel_handover` S · `check_pin_exists` S · `close_po_short` I · `complete_inventory_pair` I · `complete_item_with_extra` I · `confirm_handover(p_id, p_pin)` S · `confirm_user_email` S · `create_challan_with_items(p_challan, p_items, p_payment)` I · `create_po_with_items` I · `dashboard_summary(p_month_start, p_today, p_week_ago)` I · `delete_inventory_item_cascade` I · `delete_po_receipt` I · `generate_share_token` I · `get_next_challan_number` I · `get_profiles_pin_status` S · `get_shared_program` S · `receive_po_items` I · `reject_handover` S · `revert_inventory_pair` I · `revert_item_with_extra` I · `search_challan_ids(q)` I · `search_po_ids(q)` I · `set_own_pin(pin)` I · `set_po_status` I · `settle_return_refund(p_challan_id, p_mode)` S · `teach_bulk(p_lessons)` I · `undo_challan_batch` I · `unpay_challan_batch` I · `update_challan_with_items` I · `update_po_with_items` I · `upsert_program` I · `upsert_program_price` I.
Server-only / unused by the client: `bump_ratecard_share_use` S, `record_link_click` S (**two overloads**, 8 and 9 params), `refresh_product_catalog` S, `trigger_master_sync` S, `cleanup_old_link_clicks` S, `get_next_po_number` I, `get_own_pin` S (not called anywhere in `src/`), `verify_own_pin` S (not called directly; PIN checks run inside `confirm_handover`), `att_is_writer`, `generate_program_uid`.
Trigger functions: `auto_rollforward_on_handover_confirm`, `block_short_links_mutate`, `check_challan_payment_sync`, `check_pair_completion`, `check_po_receipt_sync`, `check_profile_admin_fields`, `cleanup_orphaned_tags`, `create_item_components`, `generate_report_number`, `handle_new_user`, `increment_link_clicks`, `log_activity`, `log_audit_trigger`, `log_program_change`, `prevent_backdated_challan_payment`, `prevent_backdated_expense_insert`, `prevent_confirmed_handover_mutation`, `prevent_direct_handover_status_change`, `prevent_locked_challan_mutation`, `prevent_locked_challan_payment_insert`, `prevent_locked_expense_mutation`, `prevent_locked_opening_balance_mutation`, `protect_challan_immutability`, `protect_challan_items_immutability`, `protect_po_immutability`, `protect_profile_self_service`, `prune_packtime_shortcuts`, `update_product_component_count`, `update_status_changed_at`.

**Tables (76), all with RLS enabled.** Zero policies (server-only): `app_secrets`, `product_catalog_refresh_state`. Trigger-bearing tables: cash_book_balances, cash_challan_items, cash_challan_payments (`trg_challan_payment_sync`), cash_challans (3), cash_expenses (2), cash_handovers (3 incl. `trg_auto_rollforward`), components (`trigger_update_component_count`, audit), damage_reports (3), inventory_items (`trigger_create_item_components`, `trg_status_changed`, audit, log), item_tags (`trg_cleanup_orphaned_tags`), link_clicks, locations/products/tags/tasks/profiles (audit), packtime_shortcuts (`trg_prune_packtime_shortcuts`), programs (`trg_program_audit`), purchase_order_receipts (`trg_po_receipt_sync`), purchase_orders (`trg_protect_po_immutability`), short_links (`trg_block_short_links_mutate`), profiles (`trg_check_profile_admin_fields`, `trg_protect_profile_self_service`).

**Storage buckets:** `costing-images` (public), `employee-qr` (public), `listing-templates` (**private**), `payment-qr` (public), `program-voice-notes` (public).

---

## 7. Contradictions with CLAUDE.md

### 7.1 Files over 200 lines that are not grandfathered (38 in `src/`)
490 `components/challan/ChallanForm.tsx` · 468 `components/minis/ReturnLabels.tsx` · 457 `components/challan/ChallanDetail.tsx` · 409 `lib/theme.tsx` · 402 `components/minis/clientfinder/ClientFinder.tsx` · 385 `pages/Dashboard.tsx` · 339 `App.tsx` · 324 `components/minis/forward/ForwardDropbox.tsx` · 318 `components/challan/ChallanList.tsx` · 311 `pages/PrintStation.tsx` · 301 `components/attendance/Salary.tsx` · 291 `lib/attendance.ts` · 280 `components/settings/Users.tsx` · 275 `hooks/useProductCatalog.ts` · 275 `components/purchaseorders/POForm.tsx` · 271 `components/minis/OdetteImport.tsx` · 271 `components/attendance/ImportExcel.tsx` · 260 `pages/PurchaseOrders.tsx` · 259 `components/settings/MyProfile.tsx` · 258 `components/minis/TracklyAnalytics.tsx` · 240 `components/purchaseorders/POList.tsx` · 237 `hooks/useAuth.tsx` · 230 `components/ui/SwipeRow.tsx` · 221 `components/minis/Trackly.tsx` · 221 `components/minis/AddressPrinter.tsx` · 216 `components/minis/ratecard/RateCardGenerator.tsx` · 212 `components/minis/TracklyLanding.tsx` · 210 `components/listingai/useGenerateRun.ts` · 210 `components/listingai/ListingAI.tsx` · 209 `lib/faceId.ts` · 207 `modules/programs/ProgramsList.tsx` · 207 `modules/programs/ProgramDetail.tsx` · 207 `components/listingai/TemplateManager.tsx` · 206 `components/minis/costing/costingModel.ts` · 204 `components/challan/ChallanLedger.tsx` · 203 `modules/programs/ProgramForm.tsx` · 202 `lib/printQueue.ts` · 202 `components/minis/LinkCheck.tsx`.
Edge functions far over any budget: `listing-ai/index.ts` 2583, `odette-export/index.ts` 1261, `client-finder` 673, `master-sync` 580, `short-track` 534. `tools/boutique_leads.py` 437.

### 7.2 Hex-alpha suffix appended to an OKLCH token (declaration silently dropped by the browser)
Three real occurrences of the exact pattern CLAUDE.md bans — each one is a rendering bug today:
- `pages/Dashboard.tsx:190` `` `linear-gradient(90deg, ${c.color}cc, ${c.color}33)` `` — the stat-card accent bar never renders.
- `pages/Inventory.tsx:856` `` boxShadow: `0 0 6px ${dotColor}80` `` — filter-dot glow dropped.
- `components/settings/Users.tsx:213` `` border: `1px solid ${ring}44` `` — role `<select>` border dropped.
Fix: `alpha(token, 0.8)` etc. from `lib/theme.tsx`. (`components/attendance/Timesheet.tsx:47` documents having removed the same bug there.)

### 7.3 Hardcoded colour literals in inline JSX (outside print templates and SwipeRow action colours)
Widespread: 324 `#hex` matches across 90 `.tsx` files (many are `#fff` on solid buttons, `#F97316`/`#A78BFA`/`#25D366`/`#FB923C` for colours with no token, and white-background previews), plus several hundred `rgba(255,255,255,0.02)`-style card backgrounds and `rgba(8,11,20,.95)` overlay chrome, and many raw `oklch(… / .x)` strings instead of `alpha()`/tint tokens. Two rules in CLAUDE.md conflict here: "Never hardcode hex colors" vs the "Standard card" recipe that itself prescribes `rgba(255,255,255,0.02)` (which equals `T.glass1`). Worst offenders by count: `CashChallan.tsx` 36, `ReturnLabels.tsx` 35 (mostly template), `CashBook.tsx` 22, `Inventory.tsx` 18, `PackTime.tsx` 14, `PDFExport.tsx` 13 (template), `ForwardDropbox.tsx` 12, `AddressPrinter.tsx` 12. Per-line lists are in the module reports; the pattern is uniform enough that a codemod to `T.glass1/T.glass2/T.bd` + `alpha()` would clear most of it.

### 7.4 `error.message` reaching the UI without `friendlyError`
- `pages/Login.tsx:71,82` — local `friendlyAuthError(error.message)` whose fallback echoes the raw message.
- `modules/programs/PublicShareView.tsx:28` `setError(result?.error || rpcErr?.message || …)`; `modules/programs/hooks/useProgramForm.ts:47` raw RPC error string.
- `hooks/useProductCatalog.ts:172` `setError(e?.message || …)` (currently unrendered).
- `components/settings/PrinterSettings.tsx:88`, `pages/PrintStation.tsx:147` — `friendlyPrintError` returns the trimmed raw message when ≤120 chars.
- Pattern that loses the Postgres error `code`: `throw new Error(err.message)` then `friendlyError(e)` — `CashChallan.tsx:741,754`, `POCloseModal`, `PODetail`, `POForm`, `POReceive`, `printQueue.ts:22,85`.
- Edge responses shown raw (server-authored copy): `ListingAISettings.tsx:20`, `KeyCard`, `ModelCard`, `PackTime.tsx:224` (`details` under the friendly error).

### 7.5 Realtime
- **Unpublished subscription:** `programs` (`modules/programs/hooks/usePrograms.ts:46`) — list never live-updates across devices; the overview doc claims it is published. Add `alter publication supabase_realtime add table public.programs`.
- **No `filter:` on any page subscription** (CLAUDE.md: "add a `filter:` clause when possible"): Dashboard (3 tables), Inventory (6), Extras (3 events), BrandTags (3 events), CashChallan (2), CashBook (4 tables), PurchaseOrders (3), PrintStation, Categories (2), Locations, Users, Programs, OtpInbox. Only `useNotifications` (`user_id=eq.`), `printQueue` (`key=eq.print_mode`, `id=eq.<job>`) filter. All unsubscribe on unmount; but pages stay mounted for the session, so every visited tab keeps its channels open (refetching is gated by `useActiveRefetch`).
- `CashBook` recreates its 4-table channel on every date change.

### 7.6 `select('*')`
`pages/Inventory.tsx:265, 268, 275, 537` (`*` with joins), `pages/CashChallan.tsx:384` (`searchReturnSource`), bare `.select()` after writes (`Inventory.tsx:418`, `InventoryExtras.tsx:241,254,295`, `settings/Categories.tsx:72`). Everything else spells out columns.

### 7.7 Swallowed errors (`.then(() => {})`, empty catch, `error` never read)
Deliberate and documented: `lib/qrUpload.ts:29`, `main.tsx:22`, storage/WebAuthn guards in `faceId.ts`, `useProductCatalog.ts`, `PackTime.tsx:57,93,104,106,216,480,517,1263`.
Real gaps: `PackTime.tsx:674` (sheet delete response body never inspected); count-guard pattern that **fails open** when the count query errors (`Brands.tsx:34`, `Locations.tsx:45`, `PackStation.tsx:51,80`, `Categories.tsx:56,90,110`); `Inventory.tsx:288-297,302-306,469,483,485,627,1111`; `InventoryExtras.tsx:134,152,248`; `BrandTags.tsx:339,532` (order-sheet loop truncates silently); `CashChallan.tsx:245,412,623,632,691,699,724,826,902,994-996,1214-1217` (notably the prior-returns qty check and the `voidChallan` pre-read); `CashBook.tsx:180,257,307,567`; `PurchaseOrders.tsx:58,179,188`, `POForm.tsx:91`, `VendorPicker.tsx:35,63`, `ImportExcel.tsx:107`; Programs `lib/supabase-rpc.ts:35-41,70-72,91,112,120,126,136,139,161,167`, `usePrograms.ts:20,27`; Listing AI `exportFilled.ts:100`, `TemplateManager.tsx:131`, `TaughtMappingsPage.tsx:38`; `hooks/useUndoDelete.ts:28` (delete failure only `console.error`, then `onRefresh` resurrects the row).

### 7.8 `console.*` / `window.*`
`console.error`: `hooks/useUndoDelete.ts:28`, `hooks/useAuth.tsx:91,117`, `modules/programs/ProgramForm.tsx:47`, `main.tsx:23`, `lib/friendlyError.ts:9` (by design), `functions/packtime/index.ts:246` (server). `window.open`: only the documented WhatsApp fallback `components/minis/ratecard/RateCardActions.tsx:41`. No `alert`/`confirm`. `window.location.href = 'https://wa.me/…'` in `CashChallan.tsx:903,906,920,1593` and `ChallanDetail.tsx:86` navigates the PWA away (CashBook deliberately uses `<a target="_blank">` instead).

### 7.9 Other rule deviations
- **Local `csvCell` copies / hand-rolled CSV** (rule: use `lib/escape.csvCell`): `pages/PackTime.tsx:79-83` (local copy), `components/listingai/assistant/AssistantTables.tsx:12-15` (local copy), `pages/Inventory.tsx:776`, `pages/InventoryExtras.tsx:374` (local `q()`), `components/minis/VirtualStock.tsx:89` (unquoted).
- **Cash PIN column written directly**: `components/settings/MyProfile.tsx:109` `profiles.update({ cash_pin: null })` bypasses the RPC layer (a write, so the SELECT revoke does not block it).
- **Multi-table writes not in an RPC**: Cash Challan Bulk Pay (`CashChallan.tsx:1198-1222`) and return void (`:833-843`); Inventory tag save (`:430-449`), item + component update (`:402-411`), bulk delete loop; Extras insert + history (`InventoryExtras.tsx:237-273`); Programs save = two RPCs; Users deactivate = profile update + edge ban.
- **Unbounded selects on growing tables**: `InventoryExtras.tsx:102,107,126,134`, `BrandTags.tsx:339`, `attendance/ImportExcel.tsx:107`, `CashChallan` ledger search, `TaughtMappingsPage.tsx:38` (limit 2000).
- **Counting by fetching rows**: `PackTime.tsx:684-689` (10,000 `courier` values counted client-side).
- **Pagination defaults**: Brand Tags offers 10/25/50/100 (`BrandTags.tsx:679`) although CLAUDE.md says it omits 100.
- **Modal hygiene**: `BrandTags.tsx:684-756` order-sheet overlay not portalled; `BrandTags.tsx:299` `useModalLock` omits the print preview; `Users.tsx:267` password modal not in the scroll lock; `ProgramForm` builds its own overlay/box styles; `ChallanDetail` uses a custom `challan-detail-modal` class; `ChallanBulkActions.tsx:107` raw `<input type="date">`.
- **`numericKeyDown` missing**: `modules/programs/ProgramForm.tsx:171` (fabric meter input). Everywhere else present.
- **Two-signal async feedback missing** (label change + disabled): `Brands.tsx:30,44`, `Locations.tsx:55,63`, `PackStation.tsx:93,117`, `Users.tsx:262`, `PrintStation.tsx:301-302`, `PrinterSettings.tsx:173-174`, Listing AI deletes (`ImageFolders`, `TaughtMappingsPage`, `TemplateManager`).
- **Empty state not via `<Empty>`**: `modules/programs/ProgramsList.tsx:101-108`, `AddressPrinter.tsx:125`, `VirtualStock`, `OtpInbox`, Utsav/Cbazaar/Odette placeholders.
- **`escHtml` skipped in a template**: `settings/PrinterSettings.tsx:85` (`${printer}`, `${SLOT_LABELS[slot]}`).
- **Hardcoded project URL** instead of importing from `lib/supabase`: `PackTime.tsx:10`, `qzPrint.ts:36`, `listingai/api.ts:5`, `Minis.tsx:146`, `LinkCheck.tsx:17`, `OdetteImport.tsx:9`, `OdetteCoverageCheck.tsx:9`, `OtpSetupGuide.tsx:8`, and the migration `20260727004059_master_sheet_sync_schedule.sql:30`.
- **Schema reference incomplete**: `types/database.ts` lacks ~25 live tables (list in §2.4); `program*` rows are typed only in `modules/programs/types.ts`; `attendance_*` only as `AttEmployee` etc. in `lib/attendance.ts`.
- **Overview doc drift** (`UNSORT-CLAUDE-CODE-CONTEXT.md`): says `programs` is published (it is not); lists 9 edge functions (there are 10 — `pricing-ai` is missing); says the anon key lives only in `supabase.ts` (true) but the project URL is duplicated in 8 files.
- **`listing_runs` RLS**: `lr insert`/`lr delete` do not check `p.is_active` while `lr read` does.
- **`link_clicks` retention** function exists with no cron job; the migration comment tells you to schedule it manually.
- **More raw `.message` / raw server strings**: `minis/clientfinder/PhotoPicker.tsx:57` `setFailed(e.message)`; `minis/uploader/api.ts:123-124` `errText` returns `e.message` (rendered in `UploadRow`); `minis/pricing/AiSuggestionsCard.tsx:37`, `ratecard/HeroFromSkus.tsx:43,66`, `ratecard/MasterRateCard.tsx:86`, `TracklyImport.tsx:49`, `ClientFinder.tsx:149,152` toast server-authored strings verbatim (documented as intentional in `clientfinder/api.ts:86-88` and `dropboxlinks/api.ts:14-16`).
- **Local CSV helper**: `minis/TracklyImport.tsx:8-10` `csvSafe`.
- **Own confirm modal instead of `useConfirm`**: `minis/ReturnLabels.tsx:431-446`, `BrandTags.tsx:759-772`.
- **Inputs below 12 px**: `minis/forward/FwdSettings.tsx:54`, `minis/dropboxlinks/RootSettings.tsx:57` (`fontSize: 11`).
- **Font literals instead of `T.sora`**: `minis/TracklyImport.tsx:83`, `minis/TracklyRedirect.tsx:106,112`, `modules/programs/components/WorkPartCard.tsx:42`.
- **Clipboard bypass**: `minis/dropboxlinks/DropboxLinkGenerator.tsx:52` calls `navigator.clipboard.writeText` directly instead of `lib/clipboard`.
- **"Add" button visible on mobile with no FAB**: `minis/costing/ProductCosting.tsx:82`, Programs header button.

### 7.10 The master-sheet "mirrored, one-way" rule is not what the code does
CLAUDE.md: "Do not add new direct Sheets API reads — extend the mirror" and "nothing in the app ever writes to the sheet." Pre-existing exceptions, all in edge functions:
- **Live reads** of the master sheet bypassing the mirror: `short-track` (`lookup`, `compare`, `sheet` — three separate 5-min caches of the same two tabs, via its own service-account token), `odette-export` (`linkcheck`, `linkfix`, `linkgen_writesheet`, `reconcile`), `listing-ai` fallback when the mirror is stale (by design), `packtime` (a different spreadsheet, `GOOGLE_SHEET_ID`).
- **Writes** to the master sheet: `odette-export` `linkgen_writesheet` (IMAGE column, from the Dropbox Link Generator "Save to sheet") and `linkfix` (IMAGE cell, from Image Link Check); `master-sync` `spellfix` (weekly cron, the one sanctioned write-back). Writes to the Odette sheet: `odette-export` `push` (QTY column). Writes to the PackStation sheet: `packtime` `batch`/`delete`.
- Two different Google service-account scopes are in play: `master-sync` reads with `spreadsheets.readonly` and escalates to `spreadsheets` only for spellfix; `listing-ai`'s read-only fallback requests the full `spreadsheets` scope.

### 7.11 Access-control drift worth knowing
- `odette-export` `linkgen_roots save` accepts any active role (overwrites `app_secrets.dropbox_linkgen_roots`); `dropbox_exchange` is admin-only; `linkfix`/`linkgen_writesheet`/`push` are admin/manager/operator. `fwd_folder save` (the shared Forward→Dropbox folder) has no role gate.
- `otp-inbox` `setup` hands the push secret to any active signed-in user (the code comment says admins); CORS is `*`.
- `record_link_click` is SECURITY DEFINER with no caller gate since `20260529112744`; anon PostgREST callers can inflate click counts (accepted in the migration comment).
- `ratecard_share` RLS is admin/manager only, so an operator opening RateCard Studio "From Master" gets an error toast from `SellerLinkBar`.
- `costing-images`, `employee-qr`, `payment-qr`, `program-voice-notes` buckets are public; only `listing-templates` is private.
- `client-finder` fetches `profiles.role` but gates only on `is_active`; the daily cap and sha dedupe are per user.
- `packtime` edge relies on gateway `verify_jwt` being off; `lib/tabs.ts` hides Purchase Orders / Attendance from operators while `canCreate`/`canPay` inside those pages still include `operator` (dead branches).

---

## 8. Gotchas a new engineer must know

**Architecture**
- Pages are never unmounted after first visit; module-level state (PackTime queue, catalog index, layer stack) persists across tabs but not reloads. Anything that must stop when the user leaves needs the `active` prop.
- The whole UI is inline styles from `T`/`S`; `index.css` is the only place for media queries, pseudo-classes and animations, so mobile overrides there need `!important`. Bottom-nav geometry is the single CSS variable `--nav-h`.
- Public routes (`#/s/`, `#/share/program/`, `#/rc/`) render outside the auth gate; the Trackly redirect skips `AuthProvider` entirely.
- `useBackClose` gives every modal/sub-view its own history entry; modals must use it (plus `createPortal`, `.modal-inner`, `useModalLock`) or device Back will leave the page.

**Data**
- The master Google Sheet is **mirrored, one-way**: `master-sync` (cron) → `master_sheet_rows/columns` → `refresh_product_catalog()` → `product_catalog` → `SkuInput`. The only write-back is the weekly spellfix. The sync secret must match in Vault **and** `app_secrets`. Consumers hard-code `ARYA`/`DRESSTIVE`; a new tab is synced but invisible.
- `product_catalog` skips duplicate SKUs entirely and keeps inactive rows (`is_active=false`) so leftovers stay billable.
- Cash Challan returns are `status='paid'` credits; `amount_paid` on a return = credit consumed. `apply_return_credit` writes two same-day legs so handovers net to zero. `payment_mode='Return Credit'` is reserved.
- Cash Book / challan locks are DB triggers (`prevent_*`, `protect_*`) mirrored client-side; paid→unpaid is only allowed inside RPC transactions that set `app.challan_rpc`. Purchase orders use the same trick with `app.po_rpc` — direct writes to PO tables fail.
- `products.total_components` and `item_components` rows are trigger-maintained; Inventory's add flow sleeps 500 ms and trusts the trigger.
- PIN: never read `profiles.cash_pin`; `confirm_handover` verifies it server-side with lockout; `check_pin_exists`/`set_own_pin` manage it; `get_own_pin`/`verify_own_pin` exist but are unused by the client.
- `audit_log.user_id` / `user_email` are stamped from the session by the `trg_audit_log_stamp_actor` trigger (profile name, else email) on every insert; the money-moving PO and challan RPCs write their own audit rows inside the transaction. `loadAuditTrail` still matches on the text of `details`.
- PostgREST caps responses at 1000 rows — use `fetchPaged` or `.range` loops (`useProductCatalog`, `BrandTags` order sheet, `PackTime` export do; several selects listed in §7.9 do not).

**Bugs found while reading (not fixed — outside the onboarding scope)**
1. `pages/Inventory.tsx:151` never selects `paired_with`, so the pair-delete guard, the Completed-view pair link and "Revert Both" (`p_b` always null) are dead on list rows.
2. The three hex-alpha-on-token declarations in §7.2 render nothing.
3. `programs` realtime subscription is silent (unpublished).
4. Programs' Gujarati public share view is unreachable: `App.tsx:326` regex rejects `?lang=gu` and `getShareUrl` never appends it.
5. `useTableNav` (Programs) Tab skips the MTR/PCS and fabric columns because it only looks for `col + 1`.
6. `hooks/useUndoDelete` resurrects a row in the UI when the delayed delete fails (console only).
7. Count-based delete guards in Settings fail open on a query error.
8. `BrandTags.tsx:173` prints the SKU under an "EAN:" label; the import error toast advertises headers that don't match the real columns.
9. `minis/dropboxlinks/DropboxLinkGenerator.tsx:48` swallows the `linkgen_roots` load error, so a failed load hides the "no folders" banner and skips the folder-ask modal.
10. `otp-inbox/delivery.ts:94` swallows the outcome PATCH error, so a delivery sheet can be filed with no status shown on the row.
11. `SellerLinkBar.tsx:39-46` ignores failures of the `short_links` insert and `ratecard_share.update`, so the seller link may have no Trackly code with no toast.
12. `settings/Users.tsx:167` drops the error of the post-invite role update — an invited user can silently land as `viewer`.

**Minis specifics**
- Trackly's `#/s/<code>` route is a separate app path with no auth provider; every `resolve` counts as a click, while the `RW5Un` landing is cached 24 h per browser so repeat vendor visits within a day are not counted. `short_links` are per-creator (RLS) and immutable: to edit a link you delete and recreate it, which changes the code. `RW5Un` is hardcoded in `Trackly.tsx` and `TracklyRedirect.tsx`.
- Every Dropbox mini goes through `odette-export` with the session JWT (`dropboxlinks/api.ts` `call`); thumbnails are a GET with the anon key in the query string. The refresh token lives in `app_secrets`; a token minted before a scope was added (e.g. `files.content.write`, `sharing.write`) fails with `needs_write_scope`/`needsReconnect` until an admin reconnects.
- Client Finder spends one Google Vision call per photo by design; the 25/user/24 h cap is enforced server-side and fails closed.
- Product Costing is one JSONB row per SKU; master `price_exc_gst` overrides and locks the selling price in Costing and the Price Projector; the GST slab rule (≤ ₹2,500 → 5 %, else 18 %) is duplicated in `pricingModel.ts`, `finalizeRateRows.ts`, `masterSheetBuild.ts`.
- `pricing-ai` replaces a product's suggestion batch with delete-then-insert (not a transaction); the hardcoded `MODELS` cost table there must match the ids Settings → Listing AI can store.
- Indya Import rewrites the vendor's master file byte-for-byte (only Stock cells) and returns it under the original filename — the documented exception to `exportName`.
- Rate card photos are fetched as bytes through the edge function so the canvas stays untainted; the 50-row cap is enforced in three places (client finalize, MasterRateCard, listing-ai).
- The three costing/pricing PDFs print via `PrintPreview` (`contentWindow.print()`), so cloud print mode never applies to them.
- OTP rows cannot be deleted by anyone but the 30-day cron; delivery-sheet filing depends on `packtime_couriers` names and `app_settings.otp_delivery_sheet_folder`.
- `catalogdl/api.ts` caches the catalog list per `shareToken|'session'` at module scope; switching accounts in the same tab shows the previous list until the 5-min TTL.

**Operational**
- QZ Tray: the pinned certificate (`lib/qzPrint.ts`) expires 2036-06-03 and must match `QZ_PRIVATE_KEY` in `sign-qz`. Print mode is global; printer assignment is per PC.
- `packtime` edge function relies on gateway `verify_jwt` being **off** (it verifies the caller itself); the sheet name must exist in `packtime_couriers`.
- Deploys queue (`cancel-in-progress: false`); a cancelled/failed Pages run is usually GitHub-side and is re-run from the Actions tab.
- `tools/boutique_leads.py` is an unrelated Google-Maps/Playwright lead scraper (no keys, no app dependency, self-described ToS violation) that landed inside PR #1134.
- The session-start hook runs `tsc` + `eslint` (up to 120 s) but not `vite build`.
