# Project rules for Unsort

## Auto-deploy flow
After every set of changes:
1. **Commit** with a descriptive message
2. **Push** to the feature branch
3. **Create PR** via GitHub MCP (`mcp__github__create_pull_request`)
4. **Squash merge** immediately via GitHub MCP (`mcp__github__merge_pull_request`)
5. Do NOT wait for user permission — deploy automatically to main

This applies to all code changes. No confirmation needed.

## File layout
- Modular structure — DO NOT put new code in App.tsx
- New components: `src/components/[feature]/`
- New pages: `src/pages/`
- Shared UI helpers: `src/components/ui/` (e.g. `Empty`, `BarcodeScanner`)
- Cash Challan sub-views: `src/components/challan/` (`ChallanAnalytics`, `ChallanLedger`, `ChallanForm` — main `CashChallan.tsx` owns data + list view only)
- Settings sub-pages: `src/components/settings/`
- Layout chrome: `src/components/layout/` (`Sidebar`, `Header`, `ToastContainer`)
- Types: `src/types/database.ts`
- Theme constants + recipes: `src/lib/theme.tsx` (exports `T`, `S`, `Icon`)
- Supabase client: `src/lib/supabase.ts`
- User-facing error copy: `src/lib/friendlyError.ts` — wrap every `error.message` you're about to `addToast` / `setError`

## Reading conventions
- Read only the specific file you need — never read all of App.tsx
- Keep every file under 200 lines (CashChallan.tsx is grandfathered — split further when touching it)
- Schema reference: UNSORT-CLAUDE-CODE-CONTEXT.md (read this instead of App.tsx for DB info)

## UI/UX Design Rules — MANDATORY
**Before changing ANY visual element, read `src/lib/theme.tsx` first.**

### Design Tokens (`T.*`)
- Surfaces: `T.bg` (#060810), `T.s` (#0B0F19), `T.s2` (#0F1420), `T.s3` (#141B2B)
- Glass: `T.glass1` (rgba 0.02), `T.glass2` (rgba 0.04)
- Borders: `T.bd` (rgba 0.05), `T.bd2` (rgba 0.08)
- Text: `T.tx` (#E2E8F0 primary), `T.tx2` (#8896B0 secondary), `T.tx3` (#6B7890 muted)
- Accent: `T.ac` (#6366F1), `T.ac2` (#818CF8), `T.ac3` (rgba 0.12)
- Semantic: `T.gr` (green), `T.re` (red), `T.yl` (yellow), `T.bl` (blue)
- Radii: `T.r` (8), `T.rSm` (6), `T.rLg` (10), `T.rXl` (14)
- Fonts: `T.mono` (JetBrains Mono), `T.sans` (Inter), `T.sora` (Sora)
- Never hardcode hex colors — use tokens. SwipeRow actions are the only exception.

### Inputs & Form Fields
- All text inputs/selects/textareas: use `S.fInput` (height 36px, fontSize 13, padding 8px 12px, borderRadius 8)
- All date inputs: use `S.fDate` (same dimensions as S.fInput)
- All search inputs: use `S.fSearch` (height 36, padding-left 34px for search icon)
- Search icon: 14x14px SVG, stroke T.tx3, strokeWidth 1.8, opacity 0.5, positioned absolute left:10 top:50% translateY(-50%)
- Per-page selects: padding 4px 8px, fontSize 11, height 28, borderRadius 6
- Number inputs: always add `onKeyDown={e => numericKeyDown(e)}` from `src/lib/numericInput.ts` to block alphabets (e/E/+)
- Never use fontSize below 12 for inputs (iOS zooms on < 16px — CSS fix at index.css:38 forces 16px on mobile)
- Labels: use `S.fLabel` (fontSize 11, fontWeight 600, color T.tx3, uppercase, letterSpacing 0.06em)

### Buttons
- Primary action: `S.btnPrimary` (padding 8px 14px, fontSize 12, borderRadius 8, gradient background)
- Secondary/ghost: `S.btnGhost` (padding 8px 14px, borderRadius 8, border with ac opacity)
- Destructive: `S.btnDanger` (padding 8px 14px, border with re opacity)
- Small/inline: `S.btnSm` (padding 4px 10px, fontSize 10, borderRadius 5)
- Large: `S.btnLg` (padding 10px 18px, fontSize 13, height 40)
- All interactive elements: min 44px touch target on mobile (use minHeight/padding to achieve)
- Never use padding below 4px or fontSize below 10 on buttons
- Double-submit prevention: add `pointerEvents: saving ? 'none' : 'auto'` and `opacity: saving ? 0.5 : 1`
- Desktop "Add" buttons: visible in page header toolbar, hidden on mobile (FAB replaces them)
- Action feedback: every async button must show TWO signals:
  1. Start: change label to "Saving…" / "Deleting…" / "Pushing…", disable button (`pointerEvents: 'none'`, `opacity: 0.5`)
  2. End: show `addToast('...', 'success')` on success or `addToast(friendlyError(err), 'error')` on failure
  Never leave the user wondering if a tap registered or if the operation completed.

### Modals
- Overlay: `S.modalOverlay` (fixed, centered, blur 12px backdrop, z-index 200)
- Box: `S.modalBox` (width 480, maxWidth calc(100vw - 32px), maxHeight 90vh, borderRadius 14)
- Head: `S.modalHead` (padding 16px 18px, border-bottom, flex between)
- Title: `S.modalTitle` (Sora font, 14px, 700 weight)
- Close button: `&#215;` character, cursor pointer, color T.tx3, fontSize 18, lineHeight 1
- Must use `className="modal-inner"` on the box div for mobile bottom-sheet behavior
- Must use `createPortal(..., document.body)` to render at root
- Must toggle `document.body.classList.toggle('modal-open', isOpen)` in useEffect for scroll lock
- Must reset ALL form state on close (form fields, error state, editing ID)
- Error display: inline red box above buttons (`background: rgba(239,68,68,.08)`, `border: 1px solid rgba(239,68,68,.2)`, `borderRadius: 6`, `padding: 8px 10px`, `fontSize: 11`, `color: T.re`)
- On mobile (index.css:187): modals become bottom sheets (position:fixed, bottom:0, slideUp animation)

### Print / Export Previews
- Full-screen overlay: position fixed, inset 0, z-index 10000, background #060810
- Header bar: paddingTop `max(12px, env(safe-area-inset-top))` for notch
- Footer bar: paddingBottom `max(10px, env(safe-area-inset-bottom))` for home indicator
- Content: iframe with `srcDoc={html}`, flex:1
- Buttons: Close (ghost) + Print/Share (primary gradient), flex:1, maxWidth 200
- All interpolated values in HTML templates must use `escHtml()` / `esc()` for XSS prevention

### Tables
- Header: `S.thStyle` (fontSize 10, uppercase, letterSpacing 0.1em, T.tx3)
- Cell: `S.tdStyle` (padding 11px 14px, fontSize 13, T.tx2)
- Wrapper: borderRadius 10, border T.bd, background rgba(255,255,255,0.01)
- Horizontal scroll on mobile: `overflowX: 'auto'`, add `WebkitOverflowScrolling: 'touch'`
- Desktop tables: `className="desktop-only"` or `className="inv-desktop"` etc
- Mobile card views: `className="mobile-only"` or `className="inv-mobile"` etc

### Cards & Containers
- Standard card: background rgba(255,255,255,0.02), border 1px solid T.bd, borderRadius 10, padding 16
- Glassmorphism: add `backdropFilter: 'blur(16px)'`, `WebkitBackdropFilter: 'blur(16px)'`
- Hover effect on clickable cards: borderColor change to rgba(99,102,241,.3), background to rgba(99,102,241,.04)

### Status Indicators
- Dot + label pattern (not pills): 8px circle + fontSize 11 text
- Colors: completed=#22C55E, damaged=#EF4444, unsorted=#F59E0B, dry_clean=#38BDF8
- Status badges: padding 2px 8px, borderRadius 4, fontSize 9, fontWeight 600

### Pagination
- Standard pattern: Prev / "1 / N" / Next on left, item count + per-page select on right
- Prev/Next: `S.btnGhost` + `S.btnSm`, opacity 0.3 when disabled
- Page display: fontSize 10, color T.tx3
- Per-page select: padding 4px 8px, fontSize 11, height 28, borderRadius 6
- Options: [10, 25, 50, 100], default 25
- Reset page to 0 on search/filter change
- Reset page to 0 on delete

### Empty States
- Use `<Empty>` component from `src/components/ui/Empty.tsx`
- Props: icon + title + message + optional CTA button
- Inline empty: padding 30-40px, textAlign center, color T.tx3, fontSize 11-12

### Notifications / Toasts
- Success: `addToast('message', 'success')`
- Error: `addToast(friendlyError(err), 'error')` — always wrap with friendlyError
- Never use `window.alert()` or `console.error` for user-facing messages
- Toasts appear at top on mobile (CSS override in index.css)

### Mobile (max-width: 768px)
- Desktop-only: `className="desktop-only"` (display:none on mobile)
- Mobile-only: `className="mobile-only"` (display:none on desktop, flex on mobile)
- FAB: `className="fab"` (display:none desktop, fixed bottom-right on mobile, 52px circle)
- Bottom nav height: ~68px + safe-area-inset-bottom — all page content needs 70px bottom padding
- Page wrapper: `className="page-pad"` applies `padding: 14px 12px 70px 12px` on mobile with safe-area insets
- Grids 3+ columns: must have CSS media query fallback to 1-2 columns
- No `window.open()` — use iframe print preview
- Modals become bottom sheets (position:fixed, bottom:0, slideUp animation)
- SwipeRow: hint on first item, actions array for swipe-to-reveal buttons
- iOS input zoom fix: index.css:38 forces fontSize 16px on all inputs at mobile breakpoint

### Consistency Checklist (before committing UI changes)
1. Does the element use theme recipes (S.*) instead of inline styles?
2. Is the height 36px for toolbar elements?
3. Does borderRadius match (8 for inputs, 6 for compact, 14 for modals)?
4. Is fontSize consistent with neighboring elements?
5. On mobile, does it fit within 393px (iPhone 15 Pro)?
6. Are all interactive elements at least 44px touch target?
7. Does the modal use createPortal + modal-inner + body scroll-lock?
8. Does the form have error display + double-submit prevention + Enter key submission?
9. Are number inputs using numericKeyDown to block alphabets?
10. Is the search icon 14x14, stroke T.tx3, positioned correctly?

## Patterns to preserve
- Every Supabase error → `addToast(friendlyError(err), 'error')`. Never surface raw `error.message`.
- Atomic multi-table writes go through SECURITY INVOKER RPCs
  (`delete_inventory_item_cascade`, `complete_inventory_pair`,
  `revert_inventory_pair`, `complete_item_with_extra`). Don't replace
  them with multiple chained `.then()` calls.
- Own-user cash PIN read: `supabase.rpc('get_own_pin')` only.
  Column-level SELECT on `profiles.cash_pin` is revoked for
  `authenticated` and `anon`.
- Empty states: use `<Empty>` from `src/components/ui/Empty.tsx` with
  icon + title + message + optional CTA.
- Destructive ops: use an in-app confirm modal, not `window.confirm()`.
- HTML print/PDF: interpolated values must go through `escHtml` /
  `esc` helpers already present in `CashChallan.tsx`, `CashBook.tsx`,
  `BrandTagPrinter.tsx`.

## Engineering ethics
- **Do no harm.** Before any destructive action (delete, drop, force-push,
  bypassing RLS), stop and confirm. Data belongs to real users running a
  real business.
- **Don't hide failures.** Swallowed errors (`.then(() => {})`, empty
  catch blocks) are a bug, not a feature. If a write can fail, surface
  it through `addToast(friendlyError(err))`.
- **Don't invent work.** Fix the thing you were asked to fix. No
  drive-by refactors, no speculative abstractions, no "while I'm here"
  scope creep — raise it separately.
- **Secrets stay server-side.** Never put API keys, service-role tokens,
  or private keys in client code. The anon key is the only credential
  that belongs in the browser bundle. For anything else, use a Supabase
  Edge Function (see `packtime`, `ocr` for reference).
- **Trust the schema, validate the boundary.** Internal calls don't need
  defensive null checks everywhere — the DB types already enforce shape.
  But user input (forms, imported files, URL params) is always suspect;
  validate it at entry and fail loudly with friendly messages.
- **Leave migrations auditable.** Every DDL change through
  `apply_migration` with a descriptive `name`. Document why in the SQL
  comment header, not just what.
- **Tests don't exist — be extra careful.** This codebase has no test
  suite. Compensate by reading before writing, type-checking with
  `npx tsc --noEmit`, building with `npx vite build`, and cross-
  verifying claims against actual code before declaring work done.

## Database sustainability (scaling past "it works on my laptop")
- **Never `select('*')` on anything that can grow.** Spell out the
  columns. It's 2× faster over the wire, survives schema drift, and
  makes the query self-documenting. `profiles` already REVOKEs `*` —
  do the same for any table that gets a sensitive column added later.
- **Always paginate large lists.** Use `.range(from, to)` or
  `.limit(n)` with UI pagination. The inventory table loads 5000 items
  by default — that's the ceiling, not the target. Raise deliberately.
- **Count with `{ count: 'exact', head: true }`.** Counting 100k rows
  by fetching them into memory is the fastest way to make Supabase
  angry. Same for dashboard aggregates.
- **Push work into the database.** N+1 loops (fetch list, then loop-fetch
  each row's related data) should be rewritten as a single query with
  `select('*, related(col1, col2)')`, a view, or a Postgres function.
  The client shouldn't be computing what a SQL JOIN can.
- **Multi-table writes → RPC.** Anything touching > 1 table in one
  user action must run inside a Postgres function (SECURITY INVOKER
  so RLS still applies) — that gives you a real transaction. Chained
  `.then()` calls are a regression waiting to happen.
- **Index your filter columns.** If the UI lets users filter/sort on a
  column, that column needs a btree index (or the query needs to be
  aggregated server-side). Check `pg_stat_user_tables` + `pg_indexes`
  before assuming a slow list is "just the data".
- **Let triggers own derived fields.** `products.total_components` is
  maintained by `trigger_update_component_count`; don't duplicate that
  logic client-side. Same rule for any future counter / rollup — the
  DB wins.
- **Realtime subscriptions are expensive.** `.on('postgres_changes')`
  with a table-wide filter means every row change fans out to every
  connected client. Add a `filter:` clause when possible, and
  unsubscribe on unmount (every current subscription already does
  this — preserve it).
- **RLS stays ON.** Every new table gets `ALTER TABLE … ENABLE ROW
  LEVEL SECURITY` in the same migration that creates it, and at least
  one policy. An empty RLS is worse than no RLS — it locks out
  everyone including the app.
- **Heavy writes batch, light writes go live.** Import flows (Brand
  Tags Excel) already upsert in batches of 500. Do the same for any
  import > 100 rows; wrap in `beforeunload` so a mid-flight refresh
  doesn't corrupt state.
