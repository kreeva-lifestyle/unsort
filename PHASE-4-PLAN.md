# Phase 4 Plan — App.tsx Extraction

**Generated:** 2026-04-19
**Source file:** src/App.tsx (2,293 lines)
**Status:** Planning only — no code changes in this phase

---

## Current structure analysis

`src/App.tsx` is a single file containing **everything except the 5 already-extracted feature modules** (InventoryExtras, CashBook, CashChallan, PackTime, BrandTagPrinter). It wires 4 top-level concerns into one module:

1. **Global providers** (AuthProvider, NotificationProvider) and their contexts/hooks
2. **Layout chrome** (Sidebar, Header, ToastContainer, BarcodeScanner modal)
3. **Route-equivalent pages** rendered conditionally based on a hash-synced `tab` state (Dashboard, Inventory, Settings-with-sub-tabs, plus the login gate)
4. **Top-level app shell** (ErrorBoundary → App → AppContent → MainApp)

Routing is hash-based conditional rendering — no React Router. A lazy-mount Set keeps already-visited tabs mounted (hidden via `display: none`) so their internal state persists across tab switches. This is a deliberate perf choice and must be preserved through extraction.

The **Inventory page is the dominant mass** at 741 lines — more than half the remaining non-extracted code. Settings is a tab-router that lazily renders 5 sub-components. Notification clicks in the Header trigger navigation to Inventory with an `openItemId` prop. Scan results from the Header's BarcodeScanner also navigate to Inventory. These are the only cross-page data couplings.

---

## Shared concerns

| Concern | Current location (App.tsx lines) | Target file | Placeholder exists? | Notes |
|---|---|---|---|---|
| ErrorBoundary class | L4–18 | `src/components/layout/ErrorBoundary.tsx` | no | Used once, at the app root. Can stay in App.tsx OR be extracted — lean toward extract for consistency. |
| AuthContext + useAuth hook | L28, L30 | `src/hooks/useAuth.ts` | yes (empty) | Export both the context (for provider wrapping in App.tsx) and the hook. |
| AuthProvider | L33–102 | `src/hooks/useAuth.ts` (same file) or `src/providers/AuthProvider.tsx` | — | Session mgmt, signIn/Up/Out, 30-min idle timeout. Ships with `useAuth` for ergonomic single import. |
| NotificationContext + useNotifications hook | L29, L31 | `src/hooks/useNotifications.ts` | yes (empty) | Pair with provider in same file. |
| NotificationProvider | L104–138 | `src/hooks/useNotifications.ts` (same file) | — | Depends on `useAuth()` for user id, subscribes to realtime. |
| ToastContainer | L140–149 | `src/components/layout/ToastContainer.tsx` | no | Renders toasts from `useNotifications()`. Tiny (10 lines), kept in layout family. |
| Sidebar | L207–256 | `src/components/layout/Sidebar.tsx` | yes (empty) | Navigation + user card + sign-out. |
| Header | L428–488 | `src/components/layout/Header.tsx` | yes (empty) | Title + global search + scan trigger + notification bell. |
| BarcodeScanner modal | L258–426 | `src/components/ui/BarcodeScanner.tsx` | no | Standalone modal, owned by MainApp, triggered from Header. Treat as reusable UI. |
| `statusTag` helper | L490–501 | `src/lib/inventory-helpers.ts` | no | Used only inside Inventory. Moves with the inventory page family. |
| Inventory constants & helpers (`MARKETPLACES`, `SIZES`, `SIZE_ORDER`, `canAlterSize`, `isDupatta`, `isLehenga`, `isBottomType`) | L716–729 | `src/lib/inventory-helpers.ts` | no | Pair logic used by Inventory only. Same destination as `statusTag`. |
| Routing (`VALID_TABS`, `getTabFromHash`) | L2196–2201 | **stays in App.tsx** | — | Routing is intentionally not abstracted this phase (scope decision). |
| MainApp shell (layout + conditional page render) | L2202–2284 | **stays in App.tsx** | — | Becomes the thin router shell. |
| `App` export + `AppContent` auth-gate | L2286–2293 | **stays in App.tsx** | — | Root of the tree. |

---

## Pages identified

### Page 1: Login (AuthScreen)
- **Purpose:** Sign-in form shown when no auth session exists.
- **Lines in App.tsx:** L151–L203 (~53 lines)
- **DB tables:** none directly — delegates to `useAuth().signIn()`
- **Subcomponents:** none (inline styles, single form)
- **Shared hooks/functions used:** `useAuth` (for `signIn`)
- **Couplings to other pages:** none — rendered only when `auth.user` is null
- **Risk level:** **LOW**
- **Target file:** `src/pages/Login.tsx` (placeholder exists)

### Page 2: Dashboard
- **Purpose:** Greeting + KPI cards + alerts + trend charts + inventory breakdown + top-outstanding customers + task list. The business's at-a-glance view.
- **Lines in App.tsx:** L502–L714 (~213 lines)
- **DB tables:** reads `packtime_scans`, `cash_challans`, `inventory_items`, `cash_expenses`, `cash_handovers`, `cash_book_balances`, `tasks` (7 tables); writes `tasks` (create/toggle/delete)
- **Subcomponents:** none — inline grid/chart JSX
- **Shared hooks/functions used:** `useAuth` (for `profile`)
- **Couplings to other pages:** none — read-only aggregator + self-owned tasks
- **Risk level:** **MEDIUM** — breadth of tables, multiple realtime subscriptions, date-math logic
- **Target file:** `src/pages/Dashboard.tsx` (placeholder exists)

### Page 3: Inventory
- **Purpose:** Full CRUD for `inventory_items` + component-status per item + tag assignment + pair-completion + cross-size "Smart Intel" + 8 modals (add, edit, complete, match-result, smart-intel, view components, return-source, delete-confirm) + extras subview.
- **Lines in App.tsx:** L731–L1472 (~742 lines — the biggest remaining page)
- **DB tables:** `inventory_items` (CRUD + bulk writes), `products`, `locations`, `tags`, `item_tags`, `item_components`, `components`, `activity_logs`, `inventory_extras` (embedded via conditional render of external `InventoryExtras` component)
- **Subcomponents:** none own — all inline. Renders external `<InventoryExtras />` when `showExtras` is true.
- **Shared hooks/functions used:** `useAuth`, `useNotifications`, inventory helpers (SIZES, canAlterSize, isDupatta, isLehenga, isBottomType), `statusTag`, `useId` for channel namespacing
- **Couplings to other pages:** receives `globalSearch` prop from Header-via-MainApp; receives `openItemId` prop from notification click via MainApp; renders `<InventoryExtras />` conditionally
- **Risk level:** **HIGH** — 742 lines, 3 realtime subscriptions, pair-completion algorithm with side effects, modals with their own state, global-search + notification-click integration, permission gating via `canEdit`
- **Target file:** `src/pages/Inventory.tsx` (placeholder exists)
- **Sub-split recommendation:** NOT in this phase. Move the whole page in one commit, then consider extracting inline modals into `src/components/inventory/*` as a follow-up.

### Page 4: Settings (tab router)
- **Purpose:** Thin wrapper holding its own tab state, rendering one of 5 sub-pages based on `tab`. Admin-only guard.
- **Lines in App.tsx:** L1997–L2018 (~22 lines)
- **DB tables:** none directly
- **Subcomponents:** Categories, Locations, Users, BrandsSettings, PackTimeSettings (all nested below)
- **Shared hooks/functions used:** `useAuth` (for `profile.role`)
- **Couplings to other pages:** depends on its 5 sub-pages
- **Risk level:** **LOW** (but **must be last in the settings family** — depends on sub-pages being extracted first)
- **Target file:** `src/pages/Settings.tsx` (no placeholder)

### Page 4a: Settings/Categories
- **Purpose:** Products catalogue CRUD; manages components within products (via modal); enforces "category in use" checks before allowing structural changes.
- **Lines in App.tsx:** L1474–L1626 (~153 lines)
- **DB tables:** `products` (CRUD), `components` (CRUD), `inventory_items` (read for in-use check), `item_components` (read for in-use check), `inventory_extras` (read for in-use check)
- **Subcomponents:** one inline helper function `compInputRow`
- **Shared hooks/functions used:** `useAuth`, `useNotifications`
- **Couplings:** none external
- **Risk level:** **MEDIUM** — modal-heavy, FK-check-before-delete logic that could silently break if a query result is misread
- **Target file:** `src/components/settings/Categories.tsx`

### Page 4b: Settings/Locations
- **Purpose:** CRUD for `locations` with 5-second undo-delete pattern.
- **Lines in App.tsx:** L1629–L1720 (~92 lines)
- **DB tables:** `locations` (CRUD), `inventory_items` (read for in-use check)
- **Subcomponents:** none
- **Shared hooks/functions used:** `useAuth`, `useNotifications`
- **Couplings:** none
- **Risk level:** **LOW**
- **Target file:** `src/components/settings/Locations.tsx`

### Page 4c: Settings/Users
- **Purpose:** Two-in-one file — (a) admin-facing user directory + invite + role management, and (b) current-user's personal PIN and phone management.
- **Lines in App.tsx:** L1722–L1995 (~274 lines)
- **DB tables:** `profiles` (read/update), `auth.signUp` for invites; handles `cash_pin` (plaintext — known HIGH security tech debt per TECH-DEBT.md)
- **Subcomponents:** none
- **Shared hooks/functions used:** `useAuth`, `useNotifications`
- **Couplings:** none
- **Risk level:** **MEDIUM** — cash_pin touching code (plaintext), role escalation logic, admin-gate check, `generatePassword()` local helper
- **Target file:** `src/components/settings/Users.tsx`
- **Note:** Phase 4 extracts the file as-is. Do NOT fix the cash_pin plaintext issue during extraction — that's a separate security phase per TECH-DEBT.md.

### Page 4d: Settings/Brands
- **Purpose:** Brands directory CRUD.
- **Lines in App.tsx:** L2020–L2075 (~56 lines)
- **DB tables:** `brands` (CRUD), `packtime_couriers` (read for in-use check)
- **Subcomponents:** none
- **Shared hooks/functions used:** `useNotifications`
- **Couplings:** none
- **Risk level:** **LOW**
- **Target file:** `src/components/settings/Brands.tsx`

### Page 4e: Settings/PackStation
- **Purpose:** Couriers + cameras CRUD for the PackTime workflow.
- **Lines in App.tsx:** L2077–L2194 (~118 lines)
- **DB tables:** `packtime_couriers` (CRUD), `packtime_cameras` (CRUD), `packtime_scans` (read for in-use checks)
- **Subcomponents:** none
- **Shared hooks/functions used:** `useNotifications`
- **Couplings:** none
- **Risk level:** **LOW**
- **Target file:** `src/components/settings/PackStation.tsx`

---

## Extraction order (risk-ascending)

Each phase below is a single independent session — one commit, one build/lint verify, one file moved (plus touching App.tsx to wire in the import).

1. **Phase 4.1 — Login** — self-contained, 53 lines, no DB writes beyond auth. LOW risk.
2. **Phase 4.2 — Settings/Brands** — 56 lines, simple CRUD, no cross-page coupling. LOW.
3. **Phase 4.3 — Settings/Locations** — 92 lines, simple CRUD + 5s-undo pattern. LOW.
4. **Phase 4.4 — Settings/PackStation** — 118 lines, two independent CRUD lists. LOW.
5. **Phase 4.5 — Settings/Categories** — 153 lines, modal-heavy but no external coupling. MEDIUM.
6. **Phase 4.6 — Settings/Users** — 274 lines, touches `cash_pin` plaintext (preserve as-is), role logic. MEDIUM.
7. **Phase 4.7 — Settings (wrapper)** — 22 lines, pure router shell. LOW (must wait for 4.2–4.6).
8. **Phase 4.8 — BarcodeScanner** — 169 lines, standalone modal, only consumer is MainApp. LOW.
9. **Phase 4.9 — Layout chrome (Sidebar + Header + ToastContainer)** — ~135 lines combined. LOW.
10. **Phase 4.10 — Auth + Notification providers (+ hooks)** — ~140 lines combined. MEDIUM — context providers with many consumers across ALL extracted pages; extract only after all pages reliably import from `./hooks/useAuth` and `./hooks/useNotifications` rather than re-declaring.
11. **Phase 4.11 — Dashboard** — 213 lines, read-only aggregator across 7 tables. MEDIUM — no coupling to other pages but breadth of data to verify after extraction.
12. **Phase 4.12 — Inventory** — 742 lines, the monster. HIGH — 3 realtime subscriptions, pair-completion algorithm, external-prop wiring (globalSearch, openItemId), embedded InventoryExtras render.

After 4.12, the final cleanup step (not numbered because trivial):
- **Phase 4.13 — App.tsx final sweep** — remove now-dead imports, shrink `App` to its final thin shell, verify App.tsx is ~200 lines.

**Helpers extraction is NOT a separate phase.** `inventory-helpers.ts` ships with Phase 4.12 (inventory constants and status tag). `ErrorBoundary` extraction ships with Phase 4.13 or stays inline if it saves a file round-trip.

---

## Decisions required before extraction begins

1. **Settings sub-pages: `components/settings/` or `pages/settings/`?**
   - Options: (a) `src/components/settings/Xxx.tsx` — treat as sub-components of the Settings page, (b) `src/pages/settings/Xxx.tsx` — treat as nested routes.
   - **Recommendation: (a)** `src/components/settings/`. They are not independently addressable routes — only the Settings page knows how to render them, and SettingsPage owns their tab state. Nesting them under `components/` signals this.

2. **BarcodeScanner target folder.**
   - Options: `src/components/ui/` (treat as reusable modal) vs `src/components/layout/` (since it's triggered from layout chrome).
   - **Recommendation: `src/components/ui/`** — it's a self-contained dialog that could theoretically be triggered from anywhere (future refactor might add a scan button to Inventory's header, for example).

3. **Auth/Notification provider file layout.**
   - Options: (a) `src/hooks/useAuth.ts` contains context + provider + hook; (b) split into `src/providers/AuthProvider.tsx` + `src/hooks/useAuth.ts`.
   - **Recommendation: (a) — colocate.** Single-file import (`import { AuthProvider, useAuth } from './hooks/useAuth'`) is ergonomic. Splitting adds complexity without benefit at this scale.

4. **ErrorBoundary placement.**
   - Options: stay in App.tsx vs. extract to `src/components/layout/ErrorBoundary.tsx`.
   - **Recommendation: extract** during Phase 4.13 cleanup. Consistency with other layout components wins over saving 15 lines.

5. **Inventory inline modals — extract further during Phase 4.12?**
   - Options: (a) move Inventory whole as a single 742-line page file; (b) also extract each modal (Add/Edit, Complete, Smart Intel, etc.) into `src/components/inventory/*`.
   - **Recommendation: (a)** — single extraction. File will exceed the 200-line CLAUDE.md rule, but Inventory is explicitly a complex page. Further splitting is a Phase 5 follow-up if desired. **Violating the 200-line guideline for this file is flagged here for user awareness.**

6. **Routing upgrade (React Router)?**
   - **Defer.** Current hash-based routing works. Changing routing AND extracting pages in one phase is too much risk.

7. **Code-splitting (React.lazy)?**
   - **Defer to Phase 5.** Once page files exist, adding `React.lazy()` around each is a 10-line change that will fix the 1.38 MB bundle warning. Do NOT bundle with Phase 4.

---

## Out-of-scope for Phase 4

- Routing upgrade to React Router
- Code-splitting via React.lazy
- Fixing cash_pin plaintext storage (security, per TECH-DEBT.md)
- Fixing any other TECH-DEBT items
- UI / design changes — zero visual difference expected
- Consolidating realtime subscriptions into a shared hook
- Extracting Inventory modals into separate files
- Deleting unused scaffolded placeholders (pages/Products.tsx, pages/Components.tsx, pages/DamageReports.tsx, pages/ActivityLog.tsx — these will be pruned in a final cleanup if still unused)

---

## Expected final state

After all sub-phases complete:

| File | Estimated lines | Notes |
|---|---|---|
| `src/App.tsx` | ~200 | ErrorBoundary wiring (or extracted), VALID_TABS + getTabFromHash, MainApp shell, AppContent, App default export |
| `src/hooks/useAuth.ts` | ~100 | AuthContext + AuthProvider + useAuth |
| `src/hooks/useNotifications.ts` | ~45 | NotificationContext + NotificationProvider + useNotifications |
| `src/components/layout/Sidebar.tsx` | ~50 | |
| `src/components/layout/Header.tsx` | ~65 | |
| `src/components/layout/ToastContainer.tsx` | ~15 | |
| `src/components/layout/ErrorBoundary.tsx` | ~20 | (Phase 4.13 cleanup) |
| `src/components/ui/BarcodeScanner.tsx` | ~170 | |
| `src/lib/inventory-helpers.ts` | ~20 | SIZES, canAlterSize, isDupatta, isLehenga, isBottomType, MARKETPLACES, statusTag |
| `src/pages/Login.tsx` | ~55 | |
| `src/pages/Dashboard.tsx` | ~215 | |
| `src/pages/Inventory.tsx` | ~750 | Violates CLAUDE.md 200-line rule — accepted, flagged |
| `src/pages/Settings.tsx` | ~25 | |
| `src/components/settings/Categories.tsx` | ~155 | |
| `src/components/settings/Locations.tsx` | ~95 | |
| `src/components/settings/Users.tsx` | ~275 | Contains cash_pin plaintext (tech debt) |
| `src/components/settings/Brands.tsx` | ~60 | |
| `src/components/settings/PackStation.tsx` | ~120 | |

**14 new files + 1 shrunken App.tsx. Zero behavior change. Bundle size unchanged until Phase 5 adds React.lazy.**

Placeholders in `src/pages/` that should be **deleted** during Phase 4.13 cleanup if they remain unused: `Products.tsx`, `Components.tsx`, `DamageReports.tsx`, `ActivityLog.tsx` (scaffolded in Phase 1 but no current code renders these).

---

## Unexpected observations

1. **`AppContent` is declared after `App`** (L2288 vs L2286). JavaScript hoisting of `const` expressions forbids this at the top level normally, but it works here because `AppContent` is referenced inside JSX (runtime) not evaluated at module-init time. Preserve the ordering during extraction.

2. **Inventory's realtime channel uses `useId()` to avoid collisions** when multiple Inventory instances mount (L733, L841). This won't happen with the current lazy-mount + hide pattern, but the defensive pattern should be preserved.

3. **Mobile bottom nav is inline in MainApp.** 6 lines, tightly tied to tab state. Leave inline — not worth a separate file.

4. **`generatePassword()` inside Users component** (L1813) generates invite temp passwords. Not a credential leak — it's a UX helper for admins creating new users. Flagged earlier in Phase 3.11 audit as a false positive.

5. **The SettingsPage tab state does not hash-sync.** Sub-tab navigation within Settings is pure component state — URL hash only tracks top-level tabs. This is fine but note it during extraction so we don't accidentally add hash-sync to Settings sub-tabs.

6. **No test infrastructure exists.** Any extraction phase that introduces a subtle bug will only be caught by manual testing or the user reporting a regression. Keep each phase small to limit blast radius.
