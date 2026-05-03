# Project rules for Unsort

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

### Inputs & Form Fields
- All text inputs/selects/textareas: use `S.fInput` (height 36px, fontSize 13, padding 8px 12px, borderRadius 8)
- All date inputs: use `S.fDate` (same dimensions as S.fInput)
- All search inputs: use `S.fSearch` (height 36, padding-left 34px for icon)
- Per-page selects: padding 4px 8px, fontSize 11, height 28
- Never use fontSize below 12 for inputs (iOS zooms on < 16px)

### Buttons
- Primary action: `S.btnPrimary` (padding 8px 14px, fontSize 12, borderRadius 8)
- Secondary: `S.btnGhost`
- Destructive: `S.btnDanger`
- Small/inline: `S.btnSm` (padding 4px 10px, fontSize 10)
- All buttons must be min 44px touch target on mobile
- Never use padding below 4px or fontSize below 10 on buttons

### Modals
- Overlay: `S.modalOverlay` (fixed, centered, blur backdrop)
- Box: `S.modalBox` (maxWidth calc(100vw - 32px), maxHeight 90vh, borderRadius 14)
- Head: `S.modalHead`

### Colors
- Never hardcode hex colors — use `T.ac`, `T.ac2`, `T.gr`, `T.re`, `T.yl`, `T.bl`, `T.tx`, `T.tx2`, `T.tx3`, `T.bd`, `T.bd2`
- SwipeRow action colors are the only exception (inline hex for colored backgrounds)

### Mobile (max-width: 768px)
- Desktop-only features: add `className="desktop-only"`
- Bottom sheets: use `position: fixed, bottom: 0` with slideUp animation
- Grids 3+ columns: must have CSS media query fallback to 1-2 columns
- No `window.open()` — use hidden iframe or print preview modal
- Toast notifications: appear at top (CSS override in index.css)

### Consistency Checklist (before committing UI changes)
1. Does the element use theme recipes (S.*) instead of inline styles?
2. Is the height 36px for toolbar elements?
3. Does borderRadius match (8 for inputs, 6 for compact, 14 for modals)?
4. Is fontSize consistent with neighboring elements?
5. On mobile, does it fit within 393px (iPhone 15 Pro)?

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
